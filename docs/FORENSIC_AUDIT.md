# FORENSIC AUDIT — VedaAI (2026-08-28)

> Full repository trace. Each subsystem classified per absolute rules.
> Verified via file read + grep + typecheck + tests. No assumptions.

## Classification Legend

- **REAL + VERIFIED** — real implementation, evidence chain intact, tested
- **REAL BUT BROKEN** — real but has bug impacting correctness
- **PARTIAL** — structure exists but incomplete or edge-cases unhandled
- **MOCK** — uses mock/fixture in production-adjacent path
- **STUB** — placeholder
- **MISSING** — not implemented
- **UNKNOWN** — cannot determine without live Textract/Vision run

---

## 1. File Layer `src/lib/files/validation.ts`, `src/lib/documents/pdf.ts`, `src/app/api/jobs/[jobId]/upload/route.ts`

- **Status: REAL + VERIFIED**
- Files: `src/lib/files/validation.ts:1`, `src/lib/documents/pdf.ts:1`, `src/lib/documents/classifier.ts:1`
- Current: MIME via `file-type` magic bytes, size/pages caps, pdf inspection via `pdf-lib`, Supabase storage fallback to local tmp. Correct.
- Root cause N/A
- Impact: Low
- Fix: None
- Verify: unit + integration upload test

**Issue found:** `.env` contains real `AWS_SECRET_ACCESS_KEY`, `OPENROUTER_API_KEY` in plaintext — must rotate after audit (separate security task).

---

## 2. Document Layer `src/lib/documents/*`

- **Status: REAL + VERIFIED**
- Page dimensions/rotation preserved via `inspectPdf`/`inspectImage`, stored in `DocumentPage` (`src/types/index.ts:52`), routed through `pageStoreApi`.
- Verified: `src/lib/jobs/runner.ts:229` preprocess creates pages.

---

## 3. Perception Layer — OCR/Textract `src/lib/ocr/*`

- **Status: REAL BUT BROKEN (dev fallback masks failure)**
- Files: `src/lib/ocr/textract.ts:1`, `src/lib/ocr/types.ts:1`, `src/lib/ocr/s3.ts`, `src/lib/jobs/runner.ts:327`
- Current: `TextractOcrProvider.submitDocument` uses `StartDocumentAnalysis` with TABLES+LAYOUT, polls via `GetDocumentAnalysis`, normalizes blocks to `OcrDocumentResult` with normalized [0,1] `BoundingBox` preserved per LINE (`textract.ts:199`). Geometry preserved.
- **Broken:** `runner.ts:401-419` silently falls back to `MockOcrProvider` when `AWS_S3_BUCKET` missing and `NODE_ENV !== production`. This hides prod misconfiguration in dev and violates ABSOLUTE RULE "silently fallback to mock". In production it throws, but in local dev it fakes geometry. Documented as dev-only; risk that staging without bucket still passes.
- **Broken:** `normalizeTextractBlocks` synthesizes `OcrBlock` by gap heuristic (`gap>0.025`) — heuristic not tested against diagram-heavy pages; may merge tables incorrectly.
- Fix: Make dev fallback explicit via `OCR_PROVIDER=mock` only; remove implicit fallback or log `WARN` with `ok: false`. Add invariant: production pipeline must assert `OCR_PROVIDER !== mock`.
- Verify: `npm run test:aws` + live job with real PDF (see `artifacts/ocr-debug/<jobId>/`)

---

## 4. Vision Layer `src/lib/vision/*`

- **Status: PARTIAL**
- Files: `src/lib/vision/provider.ts`, `openrouter-vision.ts`, `router.ts`, `fusion.ts`, `canonical.ts`
- Current: `router.shouldInvokeVision` uses avgConfidence, line count, handwriting signal, multi-column heuristic. Provider sends real page PNG (when `canvas` available) via `renderPdfPagesForVision`. Fusion grounds Vision labels against Textract lines (`fusion.ts:48`) and down-weights ungrounded. Coordinates are NOT taken from Vision; Vision is evidence-only.
- **Partial:** `render.ts:32` requires `canvas` npm module which is not installed → `hasCanvas` false → fallback to sending same full PDF base64 per page (`mimeType: application/pdf`). `openrouter-vision.ts` then sends PDF bytes — Qwen3-VL can handle PDF but prompt expects image; coverage untested. Also `VISION_MAX_PAGES=3` but question paper may be 8+ pages; only first pages sent.
- **Missing:** `VisionDocumentAnalysis` schema never validated with Zod (prompts have no schema validation per spec).
- Fix: Install `canvas` or use `pdfjs-dist` server render via `sharp`; validate Vision response with Zod and bounded retry (see `src/lib/ai/factory.ts` — not done for vision).
- Verify: `artifacts/debug/<jobId>/vision-*.json` + inspect `qpOcr` vs `visionResult`.

---

## 5. Structure / Question Parser `src/lib/structure/question-parser.ts`

- **Status: REAL BUT BROKEN (hardcoded hacks + fragile regex)**
- Current: `QUESTION_LABEL_RE` requires digit base, `STANDALONE_SUBPART_RE` for (a)/(i), reading order with strict two-column detection, marks/table filtering, instruction phrase list. `parseQuestionsFromTextract` builds `ParsedQuestion` with `bboxesByPage: Map<number, boxes>` and correctly appends option lines to parent (`isOptionLine`).
- **Broken — hardcoded paper-specific leakage filters:** `isPageHeaderFooter` contains ~15 literals like `onls 7.`, `31/2/1`, `RTCT 7.`, `Parth`, `7)2`, `NKJH #`, `onls 3th`, `FATTRA`, `31/ETCH`, `4807`, `31924`, `400 23` (`question-parser.ts:113-114`). These are subject-specific hacks for one sample paper; violates AGENTS.md "NEVER hardcode subject keywords". They mask OCR errors rather than fix root cause and will miss new papers.
- **Broken — over-filtering:** `isTableCell` flags any 1-2 digit number at x 0.22-0.78 y 0.5-0.78 as table cell; may drop legitimate subparts like `(a) 3` inside a table question.
- **Broken — subpart explosion guard:** duplicate `expectedTopLevelSet` logic duplicated between parser and validator; sequence `Q1 → A10` not globally validated.
- Fix: Remove paper-specific literals; replace with generic geometry/confidence heuristics (low conf + symbol-only + header y-band). Move thresholds to `src/lib/config`. Keep only generic instruction phrases.
- Verify: `tests/unit/question-parser.test.ts` + `tests/unit/numbering.test.ts` + manual `questionPaper-textract.json` inspection.

---

## 6. Numbering `src/lib/structure/numbering.ts`

- **Status: REAL + VERIFIED (with edge-case gaps)**
- Normalizes `Q1`, `11(a)`, `22(i)` etc. Supports `1l→11` OCR fix. Depth logic correct.
- **Partial:** Single letter `a` → `(a)` conversion ambiguous when MCQ options vs subparts; relies on caller `isOptionLine` to disambiguate. No test for `Q. 11 (b) (ii)`.
- Verify: `tests/unit/numbering.test.ts`.

---

## 7. Question Validator `src/lib/structure/validator.ts`

- **Status: REAL BUT BROKEN**
- Detects expected IDs from `question no. 1 to 14` ranges, flags instruction/section/option leakage, duplicate numbers, gaps.
- **Broken:** `detectExpectedTopLevelIds` only looks for `question no.` English pattern; fails on Hindi or alternate phrasing. Gaps warning threshold `>5` arbitrary.
- Not broken: correctly does not silently accept bad structure — throws `STRUCTURE_VALIDATION_FAILED` in `runner.ts:825`.

---

## 8. MCQ Handling

- **Status: PARTIAL**
- Parser correctly treats `(a)-(d)` short lines (<80 chars) as option text appended to parent, not top-level (`question-parser.ts:384-395`). `answer-segmentation` not involved.
- **Broken:** If MCQ spans columns or options are wide (>80 chars with math), `isOptionLine` returns false → options become separate `STANDALONE_SUBPART` questions with depth 1, inflated count. Also `PartType` for option cluster is `PART` not `OPTION` — `QuestionNode.partType` enum has no `OPTION` (`src/types/index.ts:98`). Required by Phase 7.
- Fix: Add `partType: OPTION` and use layout proximity + indentation to decide; treat `(a)-(d)` cluster within same y-band as options.
- Verify: synthetic MCQ paper with 4-option block.

---

## 9. Hierarchy — Parent/Subpart

- **Status: REAL BUT BROKEN**
- `normalizeNumber` yields `parent`, `depth`, `partType`. `question-parser.ts:451` infers parent via `lastNumeric` for standalone `(a)`/`(i)`. `structuring` resolves `parentNumber` → `parentQuestionId`.
- **Broken:** Standalone `(i)` after MCQ `(a)` may attach to wrong numeric parent (last top-level, not MCQ parent). No explicit `children` array; UI must infer via `parentQuestionId`. Result API does not return tree, only flat `questions` list — frontend must reconstruct hierarchy.
- Fix: Return `questionTree` or ensure `parentQuestionId` chain is correct and tested.

---

## 10. Answer Segmentation `src/lib/structure/answer-segmentation.ts`

- **Status: REAL BUT BROKEN**
- Detects `Ans 1`, `Q1`, `1.` labels via regex, groups lines by label, preserves `bboxesByPage: Map<number, boxes>`.
- **Broken — per-page split lost:** `segmentAnswersFromTextract` stores `bboxesByPage` correctly, but `structuring` (`runner.ts:959`) splits segmented answer into **multiple `AnswerRegion` per page** with same `continuationGroupId` but creates **one `AnswerGroup` per region** then merges only if same `questionLabel` (`groupedByLabel`). Multi-page answer with same label gets merged (correct), but untagged continuation (no label on page 2) becomes separate `AnswerGroup` with `questionLabel=undefined` → never merged → shown as `UNMATCHED` though it is continuation.
- **Broken — assumption:** `AnswerGroup = AnswerRegion[]` but code creates 1:1 groups then merges only by label, not spatial continuity.
- Fix: Merge untagged regions by spatial gap <0.04 and y-proximity to prior labeled region on next page; or concatenate labels via order.
- Verify: `tests/unit/answer-segmentation.test.ts`.

---

## 11. Mapping `src/lib/jobs/runner.ts:1039`, `src/lib/decision/index.ts`

- **Status: REAL BUT BROKEN — no global conflict detection**
- Evidence: explicit label (0.95/0.92), semantic Jaccard, layout continuity, OCR conf, visual. Score via `aggregateScore`. Decision via `decideForQuestion` with thresholds `high=0.75 review=0.5`.
- **Broken — Phase 19 violation:** Loops `for q in questions` greedily picks best `answerGroup` per question without checking if same group already assigned to another question. Code has `usedAnswerGroups` set but only for `MATCHED` status and never consulted to filter candidates (`runner.ts:1113`). Multiple questions can map `→ A10`.
- **Broken — MCQ parent/subpart unaware:** No `SUBQUESTION_MATCH` or `SECTION_MATCH` evidence used; parent question `22` and child `(i)` compete for same answer region.
- Fix: After per-question scoring, run greedy global assignment sorted by score desc, or Hungarian. Add `QUESTION_ORDER` evidence already available but not used.
- Verify: integration `job.test.ts` with duplicate labels.

---

## 12. Confidence/Evidence `src/lib/evidence/aggregate.ts`, `src/types/index.ts:137`

- **Status: REAL + VERIFIED**
- `Evidence {type, score, reliability, explanation}` aggregated via weighted mean. Mapping confidence derived, not fabricated.
- Not broken: stores `ocrConfidence`, `labelConfidence`, `mappingConfidence` separately.

---

## 13. Coordinates `src/lib/coordinates/transform.ts`

- **Status: REAL + VERIFIED (pure functions, tested)**
- `normalizeBox`, `denormalizeBox`, `rotateBox` (0/90/180/270), `mergeBoxes`, `boxIoU`. Tests in `tests/unit/coordinates.test.ts`.
- **Partial:** `cropBox` logic inverted comment vs code; `scaleBox` is no-op (correct for normalized). Not used consistently — viewer directly uses `%` style from normalized boxes, correct for 0..1 canonical.
- Verify: tested at scales 0.5/1/2, rotations 0/90/180/270 per spec (partial — only unit tests, no e2e zoom test).

---

## 14. Storage/Job Lifecycle `src/lib/storage/index.ts`, `src/lib/jobs/runner.ts:26`

- **Status: REAL + VERIFIED**
- `jobStore`, `documentStore`, `pageStoreApi`, `fileStorage` (Supabase or local tmp). Idempotency guard at `startProcessing:61`, hard timeout 10 min. Persisted result via `PersistedResultStore` (in-memory + sync disk `os.tmpdir/veda-ai/persist/result-*.json`).
- Correct: page reload preserves result (disk fallback).

---

## 15. PDF Viewer `src/components/viewer/*`, `src/app/api/files/[jobId]/[fileId]/route.ts`

- **Status: REAL BUT BROKEN**
- Files: `src/components/viewer/AnswerSheetViewer.tsx:1`, `src/components/viewer/PdfViewer.tsx:1`, file route `88`
- API: returns real PDF bytes with `Content-Type: application/pdf`, `Accept-Ranges`, `Content-Range` for range requests, MIME via magic bytes, auth via guestSession/userId. Verified `route.ts:62` range handling.
- Viewer load: `AnswerSheetViewer.PdfContent` imports `pdfjs-dist/legacy/build/pdf.mjs`, sets CDN worker `https://cdn.jsdelivr.net/.../pdf.worker.mjs` (`AnswerSheetViewer.tsx:263`). Renders via canvas at scale 1.5, DPR aware. Shows error UI with direct open link.
- **Broken — CDN worker fragility:** Worker URL may 403 or be blocked (no SRI, no fallback to local `pdf.worker.mjs`). Code has try/catch but `PdfViewer.tsx` fallback disables worker only after first failure, causing blank viewer until retry. No `onError` for `InvalidPDFException`, `MissingPDFException` surfaced via error state but not logged to backend.
- **Broken — pagination vs highlight:** `AnswerSheetViewer.PdfContent` pagination shows only `pagesToRender = [currentPage]` (`AnswerSheetViewer.tsx:353`) — multi-page answer continuation (`page 5 + page 6`) cannot be seen together; user must page manually but highlight for non-current page hidden (filtered). Spec requires "all continuation regions highlighted if multi-page" — needs scroll-all mode or prev/next highlight navigation.
- **Broken — label tag:** Badge shows `Q${pageNumber}` not question number (`AnswerSheetViewer.tsx:124,199,381`). Fabricated label.
- **Broken — per-line highlights:** `highlights.filter` then `hr.boxes.map` renders one div per Textract line box (`AnswerSheetViewer.tsx:182`, `PdfViewer.tsx:227`). Per Phase 28 this is BAD — should be one coherent region per page (union). Also `transform: scale(scale/100)` on container distorts absolute overlay if not applied to overlay.
- Fix: Merge boxes per `HighlightRegion` via `mergeBoxes` + 2% padding; show both pages stacked with scroll; fix badge to show `selectedQuestion.normalizedNumber`.

---

## 16. Question Click → Page Navigation `src/app/results/[jobId]/page.tsx:250`

- **Status: PARTIAL**
- `selected = questionResults.find(q=>q.id===selectedId)` → `highlights = selected.highlightRegions` → `activePageId = highlights[0].pageId` → passed to `AnswerSheetViewer` which does `scrollIntoView` via `document.getElementById(pdf-page-${pageNumber})` (`AnswerSheetViewer.tsx:244`). Works for first page only; continuation pages not auto-scrolled.
- **Broken:** `QuestionCard` click handler sets `selectedId` but `AnswerSheetViewer` is paginated single-page; `activePageNumber` triggers `setCurrentPage` via effect, but if answer spans 5+6, page 6 not visible. Also `selectedQuestionId` prop is passed but not used to display label (shows page number).
- Fix: Support `highlightRegions: HighlightRegion[]` with multiple `pageId`; navigation should scroll to first highlight and keep next/prev to jump between continuation pages.

---

## 17. Highlight Positioning `src/app/results/[jobId]/page.tsx`, `AnswerSheetViewer.tsx`

- **Status: REAL BUT BROKEN (per-line vs region)**
- Uses `%` style `left: box.x*100%` etc. Correct for normalized [0,1]. But source boxes are per-line LINE boxes, not per-answer-region union. Gap between lines → many small boxes, not one coherent region (Phase 28 violation).
- Fix: In `structuring` or `localizing`, compute `mergedBox = mergeBoxes(reg.normalizedBoxes)` + small padding (0.01) per page.

---

## 18. Config/Env `src/lib/config/index.ts`

- **Status: REAL + VERIFIED**
- Single validated config, Zod, no scattered magic numbers. Thresholds via `mappingThresholds.high/review`. Good.

---

## 19. AI Provider Abstraction `src/lib/ai/*`

- **Status: REAL + VERIFIED (unused for deterministic path)**
- `AIProvider` interface + OpenAI/OpenRouter impl exist but `runner.ts:706` uses deterministic `parseQuestionsFromTextract` directly; AI not on critical path for question extraction (Vision is separate). Correct per "LLM is not source of truth".

---

## 20. Tests `tests/*`

- **Status: PARTIAL**
- Unit: numbering, coordinates, decision, question-parser, answer-segmentation, textract normalization — all pass (65 tests). Integration `job.test.ts` exists.
- **Missing:** No E2E `playwright` test for upload→result→PDF→click→highlight; no test for MCQ options vs subparts; no test for global conflict; no test for multi-page continuation merge.

---

## Overall Verdict

| Subsystem | Verdict |
|---|---|
| File/Document | REAL + VERIFIED |
| Textract OCR + geometry | REAL BUT BROKEN (implicit mock fallback) |
| Vision | PARTIAL |
| Question parser | REAL BUT BROKEN (hardcoded literals) |
| Numbering | REAL + VERIFIED |
| Validator | REAL BUT BROKEN |
| MCQ structure | PARTIAL |
| Hierarchy | REAL BUT BROKEN |
| Answer segmentation | REAL BUT BROKEN (continuation) |
| Mapping | REAL BUT BROKEN (no global assignment) |
| Evidence/Confidence | REAL + VERIFIED |
| Coordinates | REAL + VERIFIED |
| Storage/Jobs | REAL + VERIFIED |
| PDF viewer | REAL BUT BROKEN (worker, pagination, per-line, label) |
| Navigation | PARTIAL |
| Highlight | REAL BUT BROKEN (per-line) |

Major root causes: (1) sample-paper hardcoded filters, (2) greedy mapping without global conflict, (3) per-line highlights vs region, (4) paginated viewer hiding continuation + wrong label, (5) implicit mock fallback, (6) continuation untagged answers.

