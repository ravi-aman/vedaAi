# PERFORMANCE_DEPENDENCY_DAG — Actual Production Runtime (2026-08-29)

All entries derived from source inspection, not documentation.

## Helper: bound classification
- CPU-bound: Paddle inference, mupdf rasterization, structure/mapping
- IO-bound: file reads/writes, artifact dumps
- Network-bound: OpenRouter chat/completions

## Stage DAG (file:function → inputs → outputs → dependencies)

### 1. VALIDATING
- file: `src/lib/jobs/runner.ts:247 validateJob`
- input: `jobStore.get(jobId)` → fileIds present
- output: void (throws if missing)
- bound: IO (store read)
- depends-on: none
- safe-to-parallelize: no (must precede all)
- reason: guard

### 2. PREPROCESSING
- file: `src/lib/jobs/runner.ts:254 preprocess`
- input: `fileStorage.read` buffers, `inspectPdf`/`inspectImage`
- output: `pageStoreApi` rows with width/height/rotation
- bound: CPU (pdf inspection) + IO
- depends-on: VALIDATING, file existence
- shared-state: `documentStore`, `pageStoreApi` (job-scoped, safe if per-doc isolation)
- safe-to-parallelize: QP and AS file inspection can run together (different fileIds, different page rows)
- proof: loop iterates docs sequentially `for (const doc of docs)` `runner.ts:259` — serialization is incidental, not required

### 3. RENDER (currently implicit inside OCR and Vision, duplicated)
- file: `src/lib/jobs/runner.ts:356 renderPdfBufferToPngFiles` (OCR path) and `src/lib/documents/render.ts:16 renderPdfPagesForVision` (Vision path)
- input: PDF Buffer, pageNumbers
- output: per-page `{imagePath, width, height}` (OCR) and `{imageBase64, mimeType, width, height}` (Vision)
- bound: CPU (mupdf rasterization 1.5x) + IO (write PNG)
- depends-on: PREPROCESSING (needs pageNumbers) but NOT on OCR inference
- shared-state: filesystem `os.tmpdir/veda-ai/<jobId>/paddle-images/<kind>/`
- safe-to-parallelize:
  - QP render || AS render: YES — different outDir (`paddle-images/questionPaper` vs `answerSheet`), different buffers
  - Render vs OCR inference: render must complete before inference for that doc, but QP render and AS OCR can overlap if AS render done
  - Render vs Vision: Vision needs same base images — if shared artifact exists, Vision can start as soon as its doc's render done, no need for OCR
- reason for current serialization: `ocrStage:processLocalDoc` renders inside sequential `await qpOcr` then `await asOcr` (`runner.ts:593`)

### 4. OCR — QP
- file: `src/lib/ocr/paddle-provider.ts:81 processDocument` + `scripts/paddle_ocr_worker.py:87 predict`
- input: `rendered` imagePaths per page
- output: `OcrDocumentResult` with pages/lines/blocks/bboxes/confidence
- bound: CPU (Paddle inference 1.6–3.7s/page, model load 5–7s)
- depends-on: RENDER for that doc only
- shared-state: per-job tmp dir `paddle/<kind>-manifest.json` + `paddle/<kind>-output/` — isolated by kind
- safe-to-parallelize:
  - QP OCR || AS OCR: YES — separate Python child processes, separate manifest/output dirs, no shared model (each loads own model, ~1.2GB peak each). Must bound to 2 concurrent or memory explodes (2*1.2GB ~2.4GB okay on 16GB; more would OOM)
  - OCR pages within doc: NO (single worker processes pages sequentially `for page in pages` `paddle_ocr_worker.py:80`) — could be 2 workers per doc but current is 1
- proof: `runner.ts:593` `const qpOcr = await processLocalDoc(...)` then `const asOcr = await processLocalDoc(...)` — explicit await serializes

### 5. OCR — AS
- same as QP OCR but answerSheet buffer, same constraints

### 6. VISION — QP (Pass 1 image-first)
- file: `src/lib/jobs/runner.ts:659 processDoc` → `src/lib/vision/openrouter-vision.ts:161 analyzeDocumentStructure`
- input (current): `fileStorage.read` buffer + `ocr.pages` + `ocrBlocksByPage` + rendered base64 (re-rendered)
- input (proposed Pass1): page image base64 + minimal metadata (pageNumber, doc type) — NO OCR blocks required
- output: `VisionDocumentAnalysis` (visualRegions, questionCandidates, answerGroupHints)
- bound: Network (30–46s per batch of 3)
- depends-on (current): OCR data for `shouldInvokeVision` routing and `ocrBlocksByPage` construction — FALSE DEPENDENCY
- depends-on (proposed): RENDER only + provider availability
- shared-state: none (per-batch request state)
- safe-to-parallelize:
  - QP Vision || AS Vision: YES — separate `processDoc` calls, separate request queues, separate artifact outputs (`vision-qp.json` vs `vision-as.json`)
  - Vision batches within doc: YES with bounded concurrency (2) — each batch is independent page range, but provider rate limits (429) must be respected
  - Vision || OCR: YES once render done — Vision does not need OCR blocks for Pass1
- proof: `runner.ts:716` `const qpVision = await processDoc("questionPaper", qpOcr)` then `const asVision = await processDoc("answerSheet", asOcr)` serializes; inner loop `for (batchStart...)` serializes batches; both are incidental

### 7. VISION — AS
- same as QP Vision but 31 pages, 11 batches when full

### 8. VISION — Pass 2 (OCR-assisted verification, future)
- input: OCR blocks for ambiguous regions + targeted page crop
- depends-on: OCR + Vision Pass1 results
- safe-to-parallelize: per ambiguous region, limited
- not currently implemented — placeholder for targeted verification without reprocessing whole doc

### 9. FUSION — QP / AS
- file: `src/lib/vision/fusion.ts:22 fuseDocuments`
- input: `OcrDocumentResult` + `DocumentPage[]` + `VisionDocumentAnalysis | null`
- output: `FusionResult` with canonical doc + hints
- bound: CPU (<50ms)
- depends-on: OCR and Vision for that doc (both). If Vision skipped (auto routing), uses null.
- shared-state: none (pure function `buildCanonicalDocument`)
- safe-to-parallelize: QP fusion || AS fusion: YES — separate canonical docs, no shared state
- proof: `runner.ts:753` `qpFusion = fuseDocuments(qpOcr, qpPages, visionData?.qpVision)` and `asFusion` are independent calls sequential only by await

### 10. QUESTION TREE (extractQuestionsV2 + validation)
- file: `src/lib/structure/question-extractor-v2.ts`, `src/lib/validation/structure-validator.ts`
- input: `qpOcr` + `qpPages` + `qpVision`
- output: 33 top-level QuestionNodes
- bound: CPU
- depends-on: QP Fusion (or directly QP OCR+Vision)
- safe-to-parallelize: with Answer Graph? YES — question extraction and answer segmentation are independent (different docs). Currently they run sequentially inside `extracting` `runner.ts:822` then `966` — could overlap but need benchmark

### 11. ANSWER GRAPH (buildAnswerGraphV2)
- file: `src/lib/structure/answer-graph-builder.ts`
- input: `asOcr` + `asPages` + `asVision`
- depends-on: AS Fusion
- safe-to-parallelize: with Question Tree

### 12. MAPPING / VALIDATION / LOCALIZING / HIGHLIGHT
- file: `src/lib/jobs/runner.ts` structuring/matching/localizing/validatingResult
- input: QuestionTree + AnswerGraph
- depends-on: both document branches complete
- safe-to-parallelize: no — global reconciliation

### 13. ARTIFACT WRITES
- file: multiple `fs.writeFile` to `os.tmpdir/veda-ai/<jobId>/debug` and `artifacts/debug/<jobId>`
- bound: IO
- depends-on: stage output
- safe-to-parallelize: per-doc artifacts can write concurrently (different files)

### 14. JOBSTORE UPDATES
- file: `src/lib/storage/index.ts:73 update`
- input: patch with `progress.stageStates`
- depends-on: stage completion
- safe-to-parallelize: must be atomic per job — concurrent `update` calls overwriting `progress.stageStates` can race (last write wins). Current `updateStage` reads `job.progress.stageStates` then writes whole object — not safe for parallel branches. Need per-document sub-states or atomic merge.

## Critical Findings

### Q: Can QP rendering and AS rendering run together?
**YES.** `renderPdfBufferToPngFiles` writes to separate `paddle-images/questionPaper` vs `answerSheet` dirs, no shared state. mupdf import is stateless. Should use `Promise.all`.

### Q: Can QP OCR and AS OCR run together?
**YES** with bounded concurrency 2. Each spawns separate `python scripts/paddle_ocr_worker.py` with separate manifest/output. Memory: each worker peaks ~1.2GB, 2 concurrent ≈2.4GB fits 16GB. Must not spawn unbounded per-page workers (58 workers would OOM). Current code serializes via `await qpOcr` then `await asOcr` — serialization is artificial.

### Q: Can QP Vision and AS Vision run together?
**YES.** Separate `processDoc` calls, separate HTTP clients, separate artifact files. Need bounded queue to respect provider limits (max concurrency 2). Current serializes via `await qpVision` then `await asVision`.

### Q: Can OCR and Vision run together?
**YES** after page images available — Vision Pass1 needs only image + minimal metadata, not OCR blocks. Current code creates false dependency by passing `ocrData` to `visionStage` and building `ocrBlocksByPage` from OCR. Redesign to image-first allows 4-way parallel: `QP_OCR || AS_OCR || QP_VISION || AS_VISION`.

### Q: Can OCR pages run concurrently?
**Within doc: NO with current single worker.** Single `PaddleOCR` instance processes pages sequentially (`for page in pages`). Could use 2 reusable workers per doc but memory cost high. Bounded to 1 worker per doc sequential is safest. Across docs: YES as above.

### Q: Can Vision batches run concurrently?
**YES with bounded concurrency 2.** Each batch is 1–3 pages, independent HTTP request. Need backpressure: bounded queue capacity, centralized retry with jitter, respect 429.

### Q: Can QP structure run while AS OCR/Vision runs?
**NO** — structure needs AS and QP OCR/Vision + fusion. But QP extraction could start as soon as QP OCR+Vision+Fusion done, without waiting for AS. That gives page-level streaming opportunity, but global QuestionTree must still wait for all QP pages (27). AnswerGraph similarly. So partial overlap possible: QP fusion → QuestionTree while AS OCR still running, but Mapping still waits for both.

### Q: Can answer segmentation run before QP mapping?
**YES** — AnswerGraph and QuestionTree are independent until Mapping. Could run in parallel after respective fusions.

### Q: Can artifact writes happen concurrently?
**YES** — different files per doc/page.

### Q: Can validation subtasks overlap?
**AnswerGraph validation and Question structure validation are independent** — could overlap but trivial cost.

## Serialization Root Causes (all artificial)
- `runner.ts:593` `await qpOcr` then `await asOcr`
- `runner.ts:716` `await qpVision` then `await asVision`
- `runner.ts:668` `for (batchStart...) { await provider.analyze... }`
- `runner.ts:172-184` `await ocrStage` then `await visionStage(jobId, ocrData)` — dependency passed as argument

## Proposed Fix (bounded, safe)
- Introduce `renderSharedStage` once, reuse images for OCR and Vision (zero duplicate render).
- Decouple Vision Pass1 from OCR: `visionStage(jobId, sharedRender)` no OCR arg, routing without OCR, empty `ocrBlocksByPage` for now.
- Run `Promise.all([qpOcrTask, asOcrTask, qpVisionTask, asVisionTask])` after render, with concurrency caps: OCR docs 2, Vision batches 2, Vision doc concurrency 2.
- Keep model reuse: single worker per doc, warmup once, process multiple pages.
- Add `performance-timeline.json` with START/END/DURATION per stage, worker PID, page range.
- Fix JobStore race: use atomic per-stage updates or timeline-only tracking for parallel branches, aggregate final stageStates.
- Bounded queues, retry with jitter, keep-alive HTTP reuse via single OpenAI client.
