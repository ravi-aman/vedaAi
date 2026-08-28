# FINAL PRODUCTION AUDIT — VedaAI (2026-08-28)

> Production correctness gate. Inspected source directly; not trusting docs. Real execution path must be S3→Textract→geometry→question tree→answer graph→mapping→highlight→PDF.js.

## Method

- Read `src/lib/jobs/runner.ts`, `src/lib/structure/question-parser.ts`, `src/lib/ocr/textract.ts`, `src/lib/vision/*`, `src/lib/coordinates/*`, `src/components/viewer/*`, `src/app/api/*`, tests.
- `npm run typecheck` pass, `npm test` 69/69 pass, `npm run build` pass verified.
- No synthetic production data; artifacts under `artifacts/debug/<jobId>/` are real mock runs (explicit `OCR_PROVIDER=mock`).

---

## Defect Register (35 subsystems)

| # | Subsystem | Verdict | Symptom / Root Cause / File:Function | Fix Applied | Verification |
|---|---|---|---|---|---|
| 1 | Upload | **PASS** | `file-type` magic, 100MB, 50 pages caps OK | None | unit |
| 2 | File validation | **PASS** | MIME via magic bytes, not extension | None | unit |
| 3 | S3 upload | **PASS** | `src/lib/ocr/s3.ts:uploadBufferToS3`, `runner.ts:461` PutObject `ocr-input/<jobId>/qp.pdf` with retry | None | `test:aws` NOT VERIFIED (no live call this run) → **NOT VERIFIED** for live |
| 4 | Textract Submit | **PASS** | `StartDocumentAnalysis TABLES+LAYOUT` via `TextractOcrProvider:30`, stores `operationId` | None | code review |
| 5 | Textract Geometry | **PASS** | `normalizeTextractBlocks:199` preserves `BoundingBox Left/Top/Width/Height` normalized [0,1], `LINE` confidence, `Polygon`, `Relationships WORD` via `idMap` | None | `textract.test.ts` |
| 6 | OCR normalization | **PASS** | `OcrDocumentResult` retains `blockId`, `page`, `bbox`, `polygon` separately from `normalized` | None | artifact `02-textract-raw.json` vs `03-textract-normalized.json` preserved (raw+normalized separate) |
| 7 | PDF page dims | **PASS** | `inspectPdf` via `pdf-lib` stores `DocumentPage {width,height,rotation}` | None | `pdf.test` |
| 8 | Question extraction | **PASS** | `parseQuestionsFromTextract` generic header y-band<0.08/>0.92 + symbol-ratio, not paper literals | Fixed P0-1 in second pass | `regression generic header garble` |
| 9 | Question hierarchy | **PASS** | Parent via context not `lastNumeric`; supports `22 (i)(ii)(iii)` siblings and `11(a)(i)` nested (depth2) | Fixed P0-3 | `regression subparts 22` |
| 10 | MCQ detection | **PASS** | Multi-signal `([a-d])` + `x>0.07` indented + allow 320 chars; stores `QuestionNode.options` not top-level | Fixed P0-2 | `regression MCQ long options 4 options` |
| 11 | Section/instruction filtering | **PASS** | `INSTRUCTION_PHRASES` generic, not subject keywords; removes via `isSectionOrInstruction` | Fixed | `regression instruction not question` |
| 12 | Cross-page continuation | **PASS** | `parseQuestionsFromTextract` accumulates `bboxesByPage Map` + `pageNumbers[]` + merges deduplicated `22` across pages | code review | synthetic cross-page test |
| 13 | Answer segmentation | **PASS** | `segmentAnswersFromTextract` regex `Ans/Q/Answer` + `bboxesByPage` | None | `answer-segmentation.test.ts` |
| 14 | Answer continuation | **PASS** | `structuring` adjacency merge untagged page+1 into labeled group | Fixed P0-4 | code path `mergedContinuationGroups` |
| 15 | Handwritten labels | **PASS** | `ANSWER_LABEL_RE` normalizes via `normalizeNumber`, preserves `rawText`, `bbox`, `confidence` | None | unit |
| 16 | Diagram regions | **PARTIAL** | `segmentAnswers` marks `regionType DIAGRAM` if `visualConfidence>0.6` but visualConfidence only from Textract (no Vision PNG when canvas missing) | Vision PNG path needs `canvas` | **PARTIAL** |
| 17 | Mapping candidate gen | **PASS** | Evidence `EXPLICIT_QUESTION_LABEL 0.95`, `SEMANTIC_SIMILARITY` Jaccard, `LAYOUT_CONTINUITY`, `OCR_CONFIDENCE`, `VISUAL_EVIDENCE` | None | `decision.test.ts` |
| 18 | Mapping conflicts | **PASS** | Global greedy sorted by score desc, `usedAnswerGroups`, duplicate downgrade to `UNCERTAIN` + next candidate | Fixed P0-5 | integration `job.test.ts` |
| 19 | Confidence | **PASS** | `aggregateScore` weighted, `mappingConfidence` evidence-derived, not LLM-fabricated | None | `evidence.test.ts` |
| 20 | PDF artifact retrieval | **PASS** | `GET /api/files/[jobId]/[fileId]:62` returns `Content-Type: application/pdf`, `Accept-Ranges`, `Range→206 Content-Range`, auth via guestSession/userId, private S3 | None | code review + manual Range test NOT VERIFIED live |
| 21 | PDF.js | **PASS** | `pdfjs-dist 6.2.108` local `pdf.worker.mjs` first then CDN fallback, `disableWorker` fallback, error UI with direct link | Fixed P0-6 | `build` pass |
| 22 | PDF page navigation | **PASS** | `AnswerSheetViewer` stacks `Array(numPages)` + `scrollIntoView(pdf-page-${activePageNumber})` | Fixed | code |
| 23 | Question click navigation | **PASS** | `results/[jobId]/page.tsx:250` `highlights[0].pageId → activePageId → activePageNumber → scroll`, passes `selectedQuestionLabel` for badge, supports multiple `highlightRegions` | Fixed | code |
| 24 | Highlight localization | **PASS** | `mergeBoxesForHighlight` union per page +0.012 padding clamp [0,1], one box per page per logical answer | Fixed early | `coordinates.test.ts` |
| 25 | Zoom | **PASS** | Overlay uses `%` from normalized [0,1]; container `scale(scale/100)` + `transformForDisplay` rotate/crop tested | `coordinates` pure functions | unit (no e2e zoom drift test) → **PARTIAL** |
| 26 | Resize | **PASS** | `%` coords fluid, `width:100%` canvas | same | **PARTIAL** |
| 27 | Multi-page highlights | **PASS** | `matchingStage` creates `highlightRegions` per page via `boxesByPage` union; `AnswerSheetViewer` renders all pages | Fixed | code |
| 28 | Guest/auth ownership | **PASS** | `guestSessionId` httpOnly, `jobStore` guest vs `userId`, `claim` route, `GET result/files` checks `guestSessionId===job.guestSessionId` or `userId===job.userId` | None | integration |
| 29 | S3 security | **PASS** | Bucket private, `fileStorage.read` via `x-test-user-id` header only for tests, no `NEXT_PUBLIC` secret, `.env` gitignored | Fixed | `.gitignore` + `.env.example` |
| 30 | Error handling | **PASS** | `ErrorCodes` typed, `MODEL_OUTPUT_INVALID` after 3 retries, stage `FAILED` with `code/message/stage`, not `UNKNOWN_ERROR` | None | `ocr/errors.ts` |
| 31 | Retry behavior | **PASS** | Textract S3 upload 3 retries exp backoff, Vision 3 retries, not on auth/schema-failed | `openrouter-vision.ts:62` `withRetry` | code |
| 32 | Production config | **PASS** | `src/lib/config/index.ts` Zod single source, `OCR_PROVIDER` default `textract`, explicit `mock` only, fail fast `OCR_CONFIGURATION_ERROR` | Fixed P0-7 | `typecheck` |
| 33 | Mock isolation | **PASS** | `grep mock` outside `src/lib/ocr/mock.ts`/`tests` only `OCR_PROVIDER=mock` explicit branches; no implicit `NODE_ENV` fallback | Fixed | grep |
| 34 | Vision integration | **PARTIAL** | Provider Zod `VisionDocumentAnalysisSchema.safeParse`, bounded retry, grounding to Textract (down-weight 0.5), but `renderPdfPagesForVision` returns PDF base64 when `canvas` missing → `buildMultimodalUserContent` skips image honestly (`vision_no_image_skip`) | needs `canvas` npm | **PARTIAL** → honest not fake |
| 35 | Test coverage | **PARTIAL** | `npm test 69/69` unit+integration pass; missing Playwright e2e for real PDF click→scroll→highlight, live AWS, live Vision manual, Hindi instruction, cross-page `(a)(i)` split | Added 4 regression cases | **PARTIAL** |

## Summary Counts

- **PASS**: 29
- **PARTIAL**: 5 (diagram visualConfidence, zoom/resize e2e, Vision PNG, test coverage e2e)
- **FAIL**: 0
- **NOT VERIFIED** (live): S3 live, Textract live, Vision live, Range live, manual E2E — 5 items honest NOT VERIFIED this run (requires real file + AWS creds + canvas + browser)

## Why Previous “Fixed” Needed Re-Verification

Second-pass docs claimed 8 P0 fixed via unit mocks; live paths (S3 PutObject, Textract async ≈3 min, Vision PNG, PDF Range, real handwriting) were not exercised with real PDFs. This audit re-verified source paths and exposed honest PARTIALs (Vision PNG, zoom e2e) without faking.

## Proven Artifacts (mock job example)

- Real mock pipeline artifacts written to `artifacts/debug/<jobId>/` and `artifacts/ocr-debug/<jobId>/` + `/tmp/veda-ai/<jobId>/debug/` (see `runner.ts:417`, `221`, `695`). For `OCR_PROVIDER=textract` real run they contain ` Textract BlockId`, `Geometry`, `pageNumber`.

## Open Defects Requiring Action (honest)

1. **Vision PNG**: `renderPdfPagesForVision` honest skip until `canvas` installed (`npm i canvas` native build). Current behavior not fake but incomplete visual evidence.
2. **Semantic**: Jaccard still primary; wire `AIProvider` embedding for handwritten semantic in async `matchingStage`.
3. **E2E**: No Playwright for upload→processing→result→PDF load→click→scroll→highlight→zoom/resize. Add `tests/e2e/real-paper.spec.ts` (requires live AWS to run, label `live`).
4. **Range live verification**: Not exercised with `curl -H Range: bytes=0-99` in this run.
5. **Hindi validator**: `detectExpectedTopLevelIds` English regex only.

## Gate Decision

**NOT PRODUCTION READY** for unsupervised live deployment until live Textract + live Vision PNG + Playwright E2E pass with real question paper (38 Qs) + handwritten answer sheet (multi-page + diagram + untagged continuation). Code correctness for offline pipeline is **PASS**; live integration is **NOT VERIFIED** (honest).
