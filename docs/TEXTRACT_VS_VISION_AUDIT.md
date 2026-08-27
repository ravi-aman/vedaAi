# TEXTRACT vs VISION Audit — VedaAI Pipeline

**Date:** 2026-08-27
**Auditor:** Muse Spark
**Repository root:** `E:\vedaAi`

## 1. Current Architecture (Real Code)

```
UPLOAD → VALIDATION (file-type magic) → fileStorage (tmp/veda-ai/{jobId}/{fileId}) → documentStore + pageStoreApi (pdfjs inspect)
→ S3 (ocr-input/{jobId}/{kind}.pdf via @aws-sdk/client-s3 PutObject)
→ Textract StartDocumentAnalysis (TABLES, LAYOUT) → GetDocumentAnalysis polling + NextToken pagination
→ normalizeTextractBlocks (PAGE/LINE/WORD → OcrPageResult.blocks/paragraphs/words, normalized [0,1] bbox)
→ extracting() — builds Vision input + calls Vision LLM
→ structuring() — converts LLM JSON → QuestionNode / AnswerRegion
→ matchingStage() — candidate generation + evidence + decision
→ localizing() (passthrough) → validatingResult() → COMPLETED
```

**Key invariants:** Job is source of truth (`ProcessingJob.status/currentStage/progress`), no global mutable state, typed errors, structured logs with jobId/stage.

## 2. Current Execution Flow (Traced)

`src/app/api/jobs/route.ts` → `src/app/api/jobs/[jobId]/upload/route.ts` → `src/app/api/jobs/[jobId]/start/route.ts` → `src/lib/jobs/runner.ts:startProcessing()` → `runJob()`:

1. `validateJob()` — checks both fileIds
2. `preprocess()` — `inspectPdf/inspectImage` → `pageStoreApi.save` with width/height/rotation
3. `ocrStage()` — per doc `uploadBufferToS3` → `TextractOcrProvider.submitDocument({s3Bucket, s3Key})` → poll `getOperationStatus` → `getOperationResult` with pagination → `normalizeTextractBlocks` → store `ocrResultStore`
4. `extracting()` — `buildVisionInput()` + `getAIProvider().extractStructure()` + `getAIProvider().detectAnswerRegions()` + heuristic augmentation
5. `structuring()` — `normalizeNumber()` + `resolvePageId()` + builds `QuestionNode`/`AnswerRegion`/`AnswerGroup`
6. `matchingStage()` — explicit label/semantic/layout/ocr confidence scoring → `decideForQuestion`

**Image rendering for Vision:** Not `pdfjs+canvas` rendering; uses `placeholderPngBase64` 1×1 transparent PNG when OCR text exists, otherwise full PDF base64 (18MB limit). This is dead weight after Textract.

## 3. Every Vision Call Site

| Location | Call | Receives | Returns |
|---|---|---|---|
| `src/lib/jobs/runner.ts:521-527` | `provider.extractStructure(qpInput)` | `pages: [{pageId, imageBase64}]` (placeholder PNG or full PDF b64) + `hints: ["OCR_TEXT:\n..."]` + `fileMime` | `{questions: [{rawNumber, normalizedNumber, text, rawText, pageRefs, sourceRegions:[{pageId,box}], parentNumber, partType, marks, confidence, evidence}]}` (Zod `QuestionExtractionSchema`) |
| `src/lib/jobs/runner.ts:533-534` | `provider.detectAnswerRegions(asInput)` | same shape for answer sheet (up to 10 pages, placeholder PNG + OCR_TEXT 30k) | `{regions: [{pageId, boxes:[[x,y,w,h]], rawText, questionLabel, labelConfidence, visualConfidence, ocrConfidence, orderIndex}]}` (Zod `AnswerDetectionSchema`) |
| `src/lib/jobs/runner.ts:534-554` | augmentation after `detectAnswerRegions` | `asOcr.pages[].blocks` | synthesizes extra regions if LLM under-returns |
| `src/lib/ai/providers/opencode-zen.ts:219` | `OpencodeZenProvider.extractStructure` | `ExtractStructureInput` | JSON via `/responses` or `/chat/completions` with fallback models `laguna-s-2.1-free` primary |
| `src/lib/ai/providers/opencode-zen.ts:288` | `OpencodeZenProvider.detectAnswerRegions` | `DetectAnswersInput` | same fallback chain |
| `src/lib/ai/providers/opencode-zen.ts:350` | `OpencodeZenProvider.analyzeAmbiguousMapping` | `AmbiguousMappingInput` (text-only, no images) | `{mappings: [...]}` |
| `src/lib/ai/providers/mock.ts` | `MockAIProvider` | — | hardcoded 3 questions, 1 region/page (tests only, guarded by `AI_PROVIDER=mock`) |
| `src/lib/ai/factory.ts:7` | `getAIProvider()` | `AI_PROVIDER` env | routes `mock` → `MockAIProvider`, `opencode-zen` → `OpencodeZenProvider`, else `OpenAIProvider` |

**Why introduced originally:** Pre-Textract design delegated *all* document understanding to Vision LLM (placeholder PNG + OCR_TEXT hint) because: (a) no deterministic parser existed, (b) 38MB PDFs were too large to send as images, (c) `placeholderPngBase64` was a hack to satisfy vision API contract. Post-Textract, the Vision calls remained as mandatory stages.

## 4. What Vision Receives & Returns (Evidence)

- Receives: 1 placeholder image (1×1) *or* full PDF b64 + OCR_TEXT truncated 20k/30k chars. No real page rendering for most jobs (Textract path). System prompt asks for JSON with boxes `[0,1]` but boxes are LLM-generated, not Textract geometry.
- Returns: LLM-invented boxes (`sourceRegions`, `boxes`) → used as highlight coordinates. This is **architecturally wrong**: highlight must be Textract geometry, not LLM guess.

## 5. What Textract Already Provides (Making Vision Unnecessary)

From `src/lib/ocr/textract.ts:199` `normalizeTextractBlocks`:

- `text` per page (joined LINE.Text)
- `LINE.Geometry.BoundingBox {Left,Top,Width,Height}` already normalized [0,1]
- `WORD.Geometry.BoundingBox` same
- `Confidence` per LINE/WORD/PAGE (preserved /100)
- `Relationships CHILD` (LINE → WORD IDs)
- `Page` number, `BlockType` PAGE/LINE/WORD/TABLE/CELL
- `width/height/rotation` via `pageStoreApi` (pdfjs) for transform, but bbox itself needs no conversion

**All of this was being discarded in favor of LLM boxes.** The `extracting()` stage logged `hasOcr:true` but still required LLM to re-extract structure that Textract already had. `structuring()` then synthesized fallback boxes `0.05,0.1+idx*0.05` if LLM gave none — also fake.

## 6. Genuine Semantic vs Visual Reasoning

**Genuinely requires LLM (semantic):**
- Ambiguous `Q1 → Answer` mapping when explicit labels conflict or missing (`analyzeAmbiguousMapping`) — needs `question text` vs `answer text` similarity, not geometry.
- Optional grading/feedback (not yet implemented).

**Does NOT require LLM (deterministic):**
- OCR (Textract)
- Numbering detection (`11(a)`, `Q1`, `Question 1`) — regex on Textract text + geometry
- Subpart hierarchy — `normalizeNumber` + parent lookup
- Reading order — sort by `Top` then `Left` per page, x-clustering for multi-column
- Answer region detection — label regex + spatial grouping + vertical continuity
- Bounding box generation — Textract bbox union
- Page continuity — pageNumber ordering
- Highlight localization — coordinate transform

**Genuinely requires visual reasoning (none in current scope):** Hand-drawn diagrams without text, arrows/overwritten text — Textract may miss these, but current pipeline treats them as `DIAGRAM` via `visualConfidence` heuristic, not real vision.

## 7. Proposed Replacement

**Phase A — Remove mandatory Vision:**

1. Implement `src/lib/structure/question-parser.ts`:
   ```
   parseQuestionsFromTextract(qpOcr: OcrDocumentResult, qpPages: DocumentPage[]) → QuestionNode[]
   ```
   Steps: flatten lines → sort by geometry (Top→Left, column clustering) → regex `/(Q\.?\s*|Question\s*)?(\d+)\s*(\(?[a-z]\)?)?(\(?[ivx]+\)?)?/i` → preserve rawNumber verbatim → `normalizeNumber` for parent/depth → merge multi-line via gap threshold 0.015 → build sourceRegions as union of LINE bboxes (real Textract).

2. Implement `src/lib/structure/answer-segmentation.ts`:
   ```
   segmentAnswersFromTextract(asOcr: OcrDocumentResult, asPages: DocumentPage[]) → AnswerRegion[]/AnswerGroup[]
   ```
   Steps: label regex per LINE → detect `answer starts` (`Ans 5:`, `Q1`, `1)`, `11(a)`) → group vertically continuous lines until next label or gap >0.025 → handle page continuity (label on page5 continues page6) → output `AnswerRegion {questionLabel, normalizedBoxes: [real bbox], sourceBoxes, pageId}` with multi-page `AnswerGroup`.

3. Refactor `src/lib/jobs/runner.ts`:
   - `extracting()` removed; replace with `extractingDeterministic()` that calls parsers directly on `qpOcr`/`asOcr`, no `getAIProvider`, no `placeholderPngBase64`, no base64.
   - Keep `getAIProvider().analyzeAmbiguousMapping` **only** as optional post-step when `matchingStage` yields `UNCERTAIN` and `AI_PROVIDER != mock`, with clear fallback to deterministic decision.
   - Update stages: `VALIDATING → PREPROCESSING → OCR_* → EXTRACTING_QUESTIONS (deterministic) → DETECTING_ANSWERS (deterministic) → MATCHING → LOCALIZING → VALIDATING_RESULT`.

**Phase B — Clean Vision:**
- Delete `extractStructure`/`detectAnswerRegions` from `AIProvider` interface (keep `analyzeAmbiguousMapping` optionally).
- Remove `OpencodeZenProvider.extractStructure/detectAnswerRegions` production code; keep `MockAIProvider` only for `tests/` (guarded).
- Remove `placeholderPngBase64`, `buildVisionInput`, `fileMime` hints.
- Remove `AI_PROVIDER=openai` vision deps if unused; keep `openai` only if `analyzeAmbiguousMapping` still uses it.
- Update `docs/ARCHITECTURE.md`, `docs/AI_PIPELINE.md`, `docs/OCR_PIPELINE.md`.

## 8. Migration Plan (Risk-Aware)

1. **Audit** (this doc) — DONE.
2. Implement parsers with comprehensive regex coverage (see spec list) + tests on real Textract fixtures (use existing `normalizeTextractBlocks` output).
3. Refactor `runner.ts` behind feature flag or direct swap; keep `AI_PROVIDER=mock` tests green.
4. Deprecate `AI_PROVIDER=mock` default — production default becomes `textract` with deterministic path; mock only in `vitest.config.ts`.
5. Add fallback: if deterministic parser yields 0 questions, fail stage `QUESTION_EXTRACTION_FAILED` clearly, not silently call Vision.
6. Update IAM/docs: Textract `StartDocumentAnalysis`/`GetDocumentAnalysis` + S3 `PutObject/GetObject/ListBucket/DeleteObject` already documented in `docs/AWS_TEXTRACT.md`.
7. E2E test: real S3+Textract → parsers → mapping → highlights (39-page fixture `6ad13559...` has 8 qpPages/39 asPages, Textract already cached).

**Risks & Mitigations:**
- Two-column papers: mitigate via x-clustering + reading order tests.
- Handwriting label variance (`Ans.1`, `Q. 11 (a)`): extensive regex + `normalizeNumber` already handles.
- Low-confidence Textract: preserve confidence, surface as `UNCERTAIN`.
- LLM unavailable: deterministic `matchingStage` already works without LLM (current code already does); just remove mandatory vision.

## 9. Tests Required

- Unit `question-parser.test.ts`: `1, 11(a), 11 (a), 11(a)(i), Q1, Question 1`, multi-line, multi-page, two-column, marks ` (2 marks)`.
- Unit `answer-segmentation.test.ts`: explicit labels, `Ans 5` before `Ans 1`, continuation across pages, blank `UNANSWERED`, `UNMATCHED` discard check, multi-box per answer, handwriting block grouping.
- Unit `reading-order.test.ts`: Top sort, column detection.
- Integration `textract→parser→mapping`: use `normalizeTextractBlocks` fixture (real blocks, not invented).
- Existing `tests/unit/textract.test.ts` (9 tests) + `tests/integration/textract-integration.test.ts` (5) remain.
- E2E: `npm run test -- test:e2e` with real vedaaistorage bucket if credentials present; else deterministic fixture E2E.

## 10. Risks If Not Refactored

- Vision rate limit (`429 FreeUsageLimitError` on `muse-spark`, `mimo`, `hy3`) blocks *every* job, as seen in `6ad13559...` log: `extractStructure_failed 429` → `FAILED`.
- Fake highlights from LLM boxes drift on zoom/rotation.
- Sending 38MB PDFs as base64 is cost-prohibitive and hits `MAX_AI_PAYLOAD_MB=18` guard.
- Hidden dependency on `OPENCODE_API_KEY` secrets for normal OCR.

## 11. Production Mock Elimination

- `src/lib/ai/providers/mock.ts` — keep only for `AI_PROVIDER=mock` in `vitest.config.ts` and `tests/`.
- `src/lib/ocr/mock.ts` — keep only for `OCR_PROVIDER=mock` tests.
- `AI_PROVIDER=mock` currently allowed in `src/lib/config` but production defaults now `laguna-s-2.1-free` → `textract`; runner throws `OCR_CONFIGURATION_ERROR` if `AWS_S3_BUCKET` missing, never silently mocks.

## 12. No Silent Fallbacks Guarantee

- If Textract `403/AccessDenied/throttling` → `OcrError AUTH_ERROR` → `FAILED` with code `TEXTRACT_START_FAILED`.
- If LLM `429/502` → retry across free models, then fail `MAPPING_FAILED` or fall back to deterministic `matchingStage` (already implemented).
- Never fall back to `MockOcrProvider` or `MockAIProvider` in production when `OCR_PROVIDER=textract` and `AI_PROVIDER=opencode-zen`.
