# REAL RUNTIME TRACE — Actual call graph 2026-08-29

This describes the ACTUAL execution path that produced job 49661e1d (Textract), not the intended local architecture.

## POST /api/jobs → create job

**File:** `src/app/api/jobs/route.ts:9`
**Function:** `POST(req: NextRequest)`
**Input:** `NextRequest` (no body), `getConfig()` for `pipelineVersion`/`modelVersion`, `getOrCreateGuestSession()`, `createClient().auth.getUser()`
**Output:** `{ jobId, job: ProcessingJob }` 201, stage `CREATED`, `progress.stageStates.CREATED=completed`
**Side Effects:** `jobStore.create(job)` (persist to `os.tmpdir/veda-ai/persist` + memory), `console.log {jobId, stage:CREATED}`
**Dependencies:** `jobStore`, `generateId()`, `getConfig()`, `supabase/server`

## POST /api/jobs/[jobId]/upload → persist files

**File:** `src/app/api/jobs/[jobId]/upload/route.ts:10`
**Function:** `POST(req, {params: jobId})`
**Input:** `formData: file: File, kind: 'questionPaper'|'answerSheet'`, `getConfig().MAX_FILE_SIZE_MB`, `MAX_PAGES`
**Output:** `{ documentId, fileId, mime, pageCount, pages[] }` 200
**Side Effects:** `file.arrayBuffer() → Buffer`, `validateFile(buffer, name, size, maxSize)` (file-type magic), `inspectPdf(buffer)` or `inspectImage(buffer)` (mupdf/pdfjs), `fileStorage.save(jobId, fileId, buffer)`, `pageStoreApi.save({id, documentId, pageNumber, width, height, rotation})` per page, `documentStore.save({id, jobId, kind, mime, pageCount, pageIds})`, `jobStore.update({questionPaperFileId|answerSheetFileId, questionPaperDocId|answerSheetDocId, status:UPLOADED, currentStage:UPLOADED})`, log `UPLOADED kind pageCount`
**Dependencies:** `lib/files/validation`, `lib/documents/pdf`, `lib/storage`, `lib/documents/classifier` (filename heuristic)

Second upload repeats for answerSheet (31 pages).

## POST /api/jobs/[jobId]/start → launch pipeline

**File:** `src/app/api/jobs/[jobId]/start/route.ts:6`
**Function:** `POST(req, {params: jobId})`
**Input:** `jobId` from URL, `job.questionPaperFileId && job.answerSheetFileId` check
**Output:** `{ jobId, job: updated }` 200 (after `startProcessing` detached)
**Side Effects:** `jobStore.update(status:VALIDATING, currentStage:VALIDATING)`, log `START start_processing`, call `startProcessing(jobId)` (async, not awaited for completion except one promise branch), `setTimeout HARD_TIMEOUT_MS 10min`
**Dependencies:** `lib/jobs/runner:startProcessing`

## Runner: startProcessing → runJob (orchestrator)

**File:** `src/lib/jobs/runner.ts:86` `export async function startProcessing(jobId)`
**Logic:** guard `COMPLETED/FAILED/idempotent_skip`, set `HARD_TIMEOUT_MS=600000`, `runJob(jobId).then(clearTimeout).catch(update FAILED)`

**File:** `src/lib/jobs/runner.ts:142` `async function runJob(jobId)`
**Sequence (STAGE_ORDER: VALIDATING→PREPROCESSING→OCR_SUBMITTED→OCR_PROCESSING→OCR_COMPLETED→VISION→FUSION→EXTRACTING→STRUCTURING→MATCHING→LOCALIZING→VALIDATING_RESULT→COMPLETED):**
```ts
await updateStage("VALIDATING"); await validateJob(jobId);
await updateStage("PREPROCESSING"); const prep = await preprocess(jobId);
await updateStage("OCR_SUBMITTED"); const ocrData = await ocrStage(jobId);
await updateStage("VISION"); const visionData = await visionStage(jobId, ocrData);
await updateStage("FUSION"); const fusionData = await fusionStage(jobId, ocrData, visionData);
await updateStage("EXTRACTING"); const extraction = await extracting(jobId, prep, ocrData, ...);
await updateStage("STRUCTURING"); const structured = await structuring(jobId, extraction);
await updateStage("MATCHING"); const matching = await matchingStage(jobId, structured);
await updateStage("LOCALIZING"); const localized = await localizing(jobId, matching);
await updateStage("VALIDATING_RESULT"); await validatingResult(jobId, localized);
await jobStore.update(status:COMPLETED, currentStage:COMPLETED); resultStore.set(jobId, localized);
await deleteS3Prefix(bucket, `ocr-input/${jobId}/`), deleteS3Prefix(...`ocr-output/...`) (best-effort)
```
**Input:** `jobId`
**Output:** `localized: {questions, answers, decisions, highlights}`
**Side Effects:** `PersistentResultStore` disk `os.tmpdir/veda-ai/persist/result-{jobId}.json`, `ocrResultStore/visionResultStore/fusionResultStore` memory

### validateJob

**File:** `src/lib/jobs/runner.ts:252` `async function validateJob(jobId)`
**Input:** `jobStore.get(jobId)`
**Output:** void or throw `VALIDATION_FAILED` if missing fileIds

### preprocess

**File:** `src/lib/jobs/runner.ts:259` `async function preprocess(jobId)`
**Input:** `documentStore.getByJob(jobId)` → for each doc `fileStorage.read(jobId, fileId)` → `inspectPdf/inspectImage`
**Output:** `{ok:true}`
**Side Effects:** `documentStore.update(pageCount)` if mismatch, `pageStoreApi.save` missing pages

### OCR Stage — THE FAILING BRANCH

**File:** `src/lib/jobs/runner.ts:464` `async function ocrStage(jobId)`
**Input:** `getConfig().OCR_PROVIDER || "textract"` (`textract` at runtime), `documentStore.getByJob`, `pageStoreApi.getByDocument` for both docs
**Output:** `{qpOcr: OcrDocumentResult, asOcr: OcrDocumentResult}`
**Dependencies:** `getOcrProvider()`, `getLocalOcrProvider()`, `uploadBufferToS3`, `deleteS3Prefix`, `renderPdfBufferToPngFiles`

**Branches inside ocrStage:**
1. `if (existing && job?.ocrCompletedAt) return reuse_cached` — idempotency
2. `if (job?.ocrOperationId && job?.ocrOutputUri && ocrProviderName !== "mock") try resume_operation` — polling resume
3. `docs = documentStore.getByJob; qpDoc/asDoc, qpPages/asPages`
4. `if (ocrProviderName === "mock") → getOcrProvider().getOperationResult("mock-...")` → slice pages → `ocrResultStore.set` → debug dump `.../debug/questionPaper-textract.json` → return
5. `if (ocrProviderName === "local" || "paddleocr") → getLocalOcrProvider().processDocument(...)` via `renderPdfBufferToPngFiles` (mupdf 1.5x → `pix.asPNG()` → `os.tmpdir/veda-ai/{jobId}/paddle-images/{kind}/page-XXX.png` → spawn `python scripts/paddle_ocr_worker.py --manifest tmp/manifest.json --output-dir tmp/out` → read `page-001.json` → `convertRawToOcrPage` → normalized bbox) → logs `local_process_ok` → return
6. **ELSE (active path when OCR_PROVIDER=textract):** `if (!cfg.AWS_S3_BUCKET) throw ...` else:
   **Inner `processOneDoc(doc, pages, kind)`:**
   - `fileStorage.read(jobId, fileId)` → buffer
   - `uploadBufferToS3(bucket, inputKey, buffer)` with retry 3x `exp 500ms` → log `s3_upload_start`/`s3_upload_ok` — **THIS LOG APPEARS IN JOB 49661e1d**
   - `provider.submitDocument({s3Bucket, s3Key, FeatureTypes:[TABLES,LAYOUT], NotificationChannel?})` → `TextractClient.send(StartDocumentAnalysisCommand)` → log `textract_submit_start`/`textract_submit_ok` with `operationId` slice — **APPEARS**
   - `jobStore.update({ocrOperationId, ocrOutputUri, ocrInputUri, ocrStartedAt})`
   - Poll `getOperationStatus(operationId)` every `pollMs=5000` until `DONE` or `FAILED` or `timeoutMs=300000` → log `operation_done` — **APPEARS**
   - `getOperationResult(operationId, outputUri)` paginated `MaxResults:1000` → `normalizeTextractBlocks` → log `parse_start`/`parse_ok` pages 27/31 — **APPEARS**
   - Debug dump `os.tmpdir/veda-ai/{safeJob}/debug/{kind}-textract.json` + `artifacts/ocr-debug/{safeJob}/...` → log `debug_dump` — **APPEARS**
   - Called twice sequentially: `qpOcr = await processOneDoc(qpDoc, qpPages, questionPaper)` then `asOcr = await processOneDoc(asDoc, asPages, answerSheet)`

**Actual job 49661e1d took the Textract branch, not local.**

### Vision Stage

**File:** `src/lib/jobs/runner.ts:779` `async function visionStage(jobId, ocrData)`
**Input:** `VISION_PROVIDER`, `ocrData.qpOcr/asOcr`, `shouldInvokeVision(ocr)` (handwriting/lowConf/ambiguous), `getVisionProvider()` (openrouter via `OPENROUTER_API_KEY`), `VISION_MAX_PAGES=3`, `VISION_TIMEOUT_MS=90000`
**Logic:** skip if `disabled` or `OCR_PROVIDER=mock` or `auto && !useVision` or `!provider`; else `renderPdfPagesForVision(buffer, pages.slice(0,maxPages))` (mupdf 1.5x), check `hasRealImage` (`!startsWith JVBER`), call `provider.analyzeDocumentStructure({pages, ocrTextSample})` → log `analyze_start`/`analyze_ok` or `analyze_failed_fallback`
**Output:** `{qpVision?, asVision?}` or `null`
**Side Effects:** `visionResultStore.set`, debug dump `vision-qp.json`

### Fusion

**File:** `src/lib/jobs/runner.ts:885` `async function fusionStage(jobId, ocrData, visionData)` and `src/lib/vision/fusion.ts:22` `fuseDocuments(ocr, pages, vision, jobId)`
**Input:** `ocr.pages`, `DocumentPage[]`, `VisionDocumentAnalysis|null`
**Output:** `{qpFusion, asFusion}` with `canonical: CanonicalDocument`, `questionHintsFromVision`, `answerHintsFromVision`, `evidence[]`
**Logic:** `buildCanonicalDocument(ocr, pages, vision)` → grounds vision labels to `canonical.pages` lines via `text.includes`, warnings for ungrounded

### Extracting

**File:** `src/lib/jobs/runner.ts:921` `async function extracting(jobId, prep, ocrData, ...)`
**Input:** `qpOcr, asOcr, qpPages, asPages`
**Output:** `{qpExtracted, asDetected, questions: ParsedQuestion[], answers: SegmentedAnswer[]}`
**Logic:** `classifyDocument` role, `parseQuestionsFromTextract(qpOcr, qpPages)` (readingOrderSort strict two-column detection, detectLabel with QUESTION_LABEL_RE + bbox margin checks), `validateQuestionStructure` repair loop (removes instruction/section/option leakage, dedupe), `segmentAnswersFromTextract(asOcr, asPages)` (adaptive gap medianH*1.8, detectAnswerLabel with Ans/Q prefix + bbox, continuation merging)

### Structuring

**File:** `src/lib/jobs/runner.ts:structuring`
**Input:** `ParsedQuestion[]`, `SegmentedAnswer[]`, `PageId` resolution
**Output:** `{questions: QuestionNode[], answers: AnswerGroup[], regions: AnswerRegion[]}`
**Logic:** `normalizeNumber` for hierarchy, `resolvePageId`, depth/partType, `AnswerRegion` per `bboxesByPage` entry, grouping by `questionLabel`

### Matching

**File:** `src/lib/jobs/runner.ts:matchingStage` (~180 lines)
**Input:** `QuestionNode[]`, `AnswerGroup[]`
**Output:** `{decisions: MappingDecision[], highlights: HighlightRegion[], ...}`
**Logic:** per question candidate signals (EXPLICIT_LABEL 0.95, SEMANTIC_JACCARD, LAYOUT_CONTINUITY, OCR_CONFIDENCE, VISUAL_EVIDENCE) → `aggregateScore` → global greedy assignment by score → conflict resolution `UNCERTAIN` with `NEIGHBOR_CONTEXT` → `HighlightRegion` via `mergeBoxesForHighlight` (union + pad 0.012)

### PDF.js Viewer

**File:** `src/components/viewer/PdfViewer.tsx`
**Input:** `HighlightRegion[]` normalized [0,1], `DocumentPage[]`, current `questionId`
**Output:** PDF.js canvas with `HighlightOverlay`
**Logic:** `pdfjs-dist` worker, stacked scroll, `scrollIntoView` on question click, `transformForDisplay` with rotation

## Verified Actual Call Graph (Textract)

```
POST /api/jobs → jobStore.create → CREATED
POST /api/jobs/:id/upload (x2) → fileStorage.save → documentStore.save → UPLOADED (27p+31p)
POST /api/jobs/:id/start → jobStore.update VALIDATING → startProcessing → runJob
  → validateJob
  → preprocess (inspectPdf)
  → ocrStage (OCR_PROVIDER=textract from .env)
      → getOcrProvider() → TextractOcrProvider
      → processOneDoc(questionPaper) → uploadBufferToS3 → s3_upload_start/ok → submitDocument StartDocumentAnalysis → textract_submit_start/ok → poll GetDocumentAnalysis → operation_done → parse_start/ok → debug_dump questionPaper-textract.json
      → processOneDoc(answerSheet)  → same 31p 22961ms → debug_dump answerSheet-textract.json
  → visionStage (auto, qp 3p ok, as 3p schema fallback MODEL_OUTPUT_INVALID) → fusionStage
  → extracting (qCount 61→44 topLevel after repair, aCount 5)
  → structuring → matching (66 decisions) → localizing (passthrough) → validatingResult (golden_validation_pass)
  → COMPLETED → resultStore.set → deleteS3Prefix ocr-input/ocr-output
  → GET /api/jobs/:id/result, GET /api/files/... (Range 200)
```

No branch `engine=paddleocr` was executed. Local code exists but is unreachable because `.env` overrides config default.
