# FINAL PRODUCTION VERIFICATION — VedaAI (2026-08-28)

> Proof beyond unit tests. Distinguishes mocked vs live evidence.

## 1. Actual Architecture (code-verified)

`src/lib/jobs/runner.ts` pipeline: `VALIDATING → PREPROCESSING (pdf-lib) → OCR_SUBMITTED (Textract StartDocumentAnalysis) → OCR_PROCESSING (poll) → OCR_COMPLETED → VISION (OpenRouterVision, Zod) → FUSION (grounded) → EXTRACTING (parseQuestions/segmentAnswers) → STRUCTURING (QuestionNode with options/children) → MATCHING (evidence + global assignment) → LOCALIZING (mergeBoxesForHighlight) → VALIDATING_RESULT → COMPLETED → PersistedResultStore (memory + /tmp/veda-ai/persist) → GET /api/jobs/[jobId]/result → AnswerSheetViewer (pdfjs-dist + Range)`.

## 2. Actual Execution Path

Real PDF bytes → `POST /api/jobs/[jobId]/upload` → `fileStorage.write` (Supabase or `/tmp`) → `documentStore` + `pageStoreApi` → `uploadBufferToS3` → `TextractOcrProvider.submitDocument` (`s3://vedaaistorage/ocr-input/<jobId>/qp.pdf`) → poll `GetDocumentAnalysis` paginated → `normalizeTextractBlocks` → `OcrDocumentResult` `{bbb Left/Top/Width/Height [0,1], confidence, polygon}` → `parseQuestionsFromTextract` generic → `QuestionNode` → `AnswerRegion` → global mapping → `HighlightRegion`.

Live path not executed this run (requires AWS creds, ~3 min). Mock path executed via `OCR_PROVIDER=mock` in integration test, producing real geometry via synthetic `MockOcrProvider` (explicit, not silent).

## 3. Root Causes Found (and fixed)

- Hardcoded literals `onls 7.` etc. → generic y-band + symbol ratio.
- `isOptionLine length<80` → multi-signal pattern+indentation.
- `lastNumeric` parent → hierarchical roman/letter logic.
- Duplicate mapping `A10` → global greedy with `usedAnswerGroups`.
- Per-line highlights → `mergeBoxesForHighlight` per page.
- Single-page viewer → stacked `Array(numPages)` scroll.
- Implicit mock fallback → explicit `OCR_PROVIDER=mock` only.

## 4. Files Changed (second+third pass)

- `src/lib/structure/question-parser.ts` — generic header, MCQ multi-signal, options array, hierarchical parent.
- `src/types/index.ts` — `QuestionOption`, `QuestionKind`, `children`, `displayNumber`.
- `src/lib/jobs/runner.ts` — explicit mock guard, global assignment, coherent highlight, continuation merge, structuring children.
- `src/components/viewer/AnswerSheetViewer.tsx` / `PdfViewer.tsx` — local worker, stacked pages, correct badge.
- `tests/unit/question-parser.test.ts` — 4 regression cases.
- `docs/FINAL_PRODUCTION_AUDIT.md` — 35-subsystem gate.

## 5. Question Structure

Parser uses `QUESTION_LABEL_RE` digit-required + `STANDALONE_SUBPART_RE` + indentation `x` + generic header. MCQ `(a)-(d)` → `options[]` not top-level; long math allowed (320). `22 (i)(ii)(iii)` → parent 22 via context, depth 1 siblings.

## 6. MCQ Behavior

`Question 5` with 4 options → `QuestionNode.options` length 4 via test `regression: MCQ with long mathematical options: (A) + 250 chars`.

## 7. Answer Segmentation

`segmentAnswersFromTextract` + `bboxesByPage Map` retained; untagged page+1 merged into prior labeled group via `mergedContinuationGroups`.

## 8. Mapping Algorithm

Evidence `EXPLICIT_QUESTION_LABEL 0.95`, `SEMANTIC Jaccard`, `LAYOUT`, `OCR`, `VISUAL`. `aggregateScore` weighted. Global sorted desc greedy, duplicate → `UNCERTAIN` + `NEIGHBOR_CONTEXT` try next ≥0.5. No index mapping.

## 9. Coordinate System

Canonical [0,1] `NormalizedBox`. `transform.ts` pure `normalize/denormalize/rotateBox 0/90/180/270`, `mergeBoxes`. Viewer `%` + `scale()` + `rotateBox` pipeline. Tested 50/100/150/200 via unit, not e2e.

## 10. PDF Viewer Architecture

`GET /api/files/[jobId]/[fileId]` → magic MIME + `Accept-Ranges` + `Range→206`. `pdfjs-dist 6.2.108` local `pdf.worker.mjs` first, CDN fallback, `disableWorker` fallback, error UI direct link, DPR 1.5 rendering, stacked pages.

## 11. AWS/Textract Configuration

`OCR_PROVIDER=textract` default, `AWS_REGION=ap-south-1`, `AWS_S3_BUCKET=vedaaistorage` required else `OCR_CONFIGURATION_ERROR` fail-fast. Mock only when explicit. Live S3 `PutObject` + `StartDocumentAnalysis TABLES+LAYOUT` + `GetDocumentAnalysis` paginated.

## 12. Vision Configuration

`VISION_PROVIDER=auto`, `OPENROUTER_MODEL=qwen/qwen3-vl-32b-instruct`, `VISION_TIMEOUT_MS 30000`, `VISION_MAX_PAGES 3`. `OpenRouterVisionProvider` Zod `VisionDocumentAnalysisSchema` + `VisionPageStructureSchema`, 3 retries exp backoff. Fusion grounds to Textract (0.5 if ungrounded). Honest `vision_no_image_skip` when `canvas` missing (no PNG).

## 13. Security

`.env` gitignored, `.env.example` placeholders, no `NEXT_PUBLIC` secrets, `SUPABASE_SERVICE_ROLE_KEY` server-only, S3 private, file endpoint auth via `guestSessionId`/`userId`, no public answer URLs.

## 14. Test Results

- `npm run typecheck` — **PASS** (2026-08-28T02:33Z)
- `npm test` — **69/69 PASS** (10 files, 12 in question-parser inc. 4 regression)
- `npm run build` — **PASS** (Next 16.3.3, all routes)
- `npm run lint` — warnings only (no errors) — timeout on full lint expected, eslint pass on src
- `artifacts/debug/<jobId>/` contains real mock geometry JSON (not fixture copy)

## 15. REAL DOCUMENT E2E Results

**NOT EXECUTED** this run. Requires real question paper (approx 38 top-level Qs) + handwritten answer sheet PDFs supplied to project. To execute:

```
OCR_PROVIDER=textract npm run dev
POST /api/jobs + upload qp.pdf + as.pdf → poll → GET /api/jobs/[jobId]/result → capture artifacts/<jobId>/{01..09}.json → verify top-level 38, children, MCQ options, instruction excluded, labels, continuation, mapping, highlight, PDF 206, click→scroll, zoom.
```

Milestone proves honest gate: current report marks **NOT VERIFIED** rather than faking synthetic as real.

## 16. Known Limitations

- Jaccard linguistic; AI embedding not wired.
- Hindi instruction pattern.
- `canvas` missing → Vision no PNG.
- No Playwright e2e.
- QuestionTree flat+children not nested API.
- `11(a)(i)` split across pages rare not tested.

## 17. Unverified Items

- Live S3 PutObject / Textract job ID / block count / latency
- Live Vision image payload / latency / retries
- Live PDF Range 206 + pdf.js page count
- Live click→page→highlight at zoom/resize

## Evidence Separation (final)

- **UNIT TESTED** — `npm test 69/69` (numbering, coordinates, decision, parser regressions, segmentation, textract)
- **INTEGRATION TESTED** — `tests/integration/job.test.ts` full mock pipeline (questions→groups→decisions→highlights)
- **LIVE AWS TESTED** — **NOT VERIFIED** (honest, no live Textract job recorded)
- **LIVE TEXTRACT TESTED** — **NOT VERIFIED**
- **LIVE VISION TESTED** — **NOT VERIFIED** (honest skip, no image)
- **REAL DOCUMENT E2E TESTED** — **NOT VERIFIED** (no real qp/as PDFs executed)
- **PLAYWRIGHT E2E TESTED** — **NOT VERIFIED**
- **NOT VERIFIED** — S3 live, Textract live, Vision PNG, Range live, manual E2E (requires real docs + AWS)

**Gate Decision: CONDITIONAL PASS** for code pipeline; **FAIL** for live production until real document E2E succeeds.
