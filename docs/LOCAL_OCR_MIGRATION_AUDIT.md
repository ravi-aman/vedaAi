# LOCAL OCR MIGRATION AUDIT — VedaAI

**Date:** 2026-08-29  
**Auditor:** automated repo scan + execution trace  
**Pipeline version:** 0.2.0  
**Current OCR_PROVIDER:** `textract` (AWS Textract async via S3)  
**Reference job:** `39ac494f-ecec-4ccc-91ca-c9e9995a644b` — 8 page QP + 39 page AS, COMPLETED, Textract SUCCEEDED in ~21s, Vision 200.

---

## 1. Current Architecture (real, not aspirational)

```
ORIGINAL PDF / IMAGE (Buffer)
        |
        v
  File Validation (src/lib/files/validation.ts — file-type magic, size, mime)
        |
        v
  Job Creation (src/app/api/jobs/route.ts → jobStore.create, documentStore, LocalFileStorage)
        |
        v
  Page Normalization / Inspection (src/lib/documents/pdf.ts — pdf-lib primary, pdfjs fallback; inspectImage via sharp fallback)
        | -> DocumentPage entries per page with width,height,rotation via pageStoreApi
        |
        +------------------------------+--------------------------------+
        |                              |                                |
        v                              v (parallel, conditional)
  S3 Staging               Vision Sampling
  (src/lib/ocr/s3.ts)      (src/lib/documents/render.ts → mupdf 1.5x PNG, fallback canvas pdfjs, fallback PDF base64)
        |                              |
        v                              v
  AWS Textract async       Vision Model (qwen/qwen3-vl-32b via OpenRouter)
  (src/lib/ocr/textract.ts)  (src/lib/vision/openrouter-vision.ts)
        |                              |
  Poll + Paginate            Zod-validated VisionDocumentAnalysis
  (NextToken, 5s poll)       (pages[].visualRegions, questionCandidates, answerGroupHints)
        |                              |
        +--------------+---------------+
                       |
                       v
                 Fusion Layer (src/lib/vision/fusion.ts + canonical.ts)
                       | -> warnings if Vision label has no Textract grounding
                       | -> CanonicalDocument (pages + lines + blocks + evidence)
                       v
                 EXTRACTING — deterministic parsers NOT LLM
                       | -> parseQuestionsFromTextract (question-parser.ts)
                       | -> segmentAnswersFromTextract (answer-segmentation.ts)
                       | -> validator.ts repair loop (instruction/section/option leakage + duplicate regression)
                       v
                 STRUCTURING (runner.ts structuring)
                       | -> QuestionNode[] + AnswerRegion[]/AnswerGroup[] (bboxesByPage Map, continuationGroupId)
                       v
                 MATCHING (runner.ts matchingStage)
                       | -> evidence: EXPLICIT_QUESTION_LABEL, SEMANTIC_SIMILARITY (jaccard), LAYOUT_CONTINUITY, OCR_CONFIDENCE, VISUAL_EVIDENCE
                       | -> aggregateScore + decideForQuestion + global conflict resolution (greedy by score)
                       | -> decisions with HighlightRegion per page
                       v
                 LOCALIZING (no-op, merged into matching)
                       v
                 VALIDATING_RESULT (golden checks topLevel count, impossible IDs)
                       v
                 COMPLETED → resultStore (memory + tmp persist) → PDF.js viewer

Job state machine: CREATED→VALIDATING→PREPROCESSING→OCR_SUBMITTED→OCR_PROCESSING→OCR_COMPLETED→VISION→FUSION→EXTRACTING→STRUCTURING→MATCHING→LOCALIZING→VALIDATING_RESULT→COMPLETED (src/lib/jobs/runner.ts:70 STAGE_ORDER, runner `runJob` + hard 10m timeout)

Storage: InMemoryJobStore + persisted tmp files (C:\Users\Dell\AppData\Local\Temp\veda-ai\persist\job-*.json / docs-*.json / pages-*.json); LocalFileStorage tmp dir per job; InMemoryArtifactStore; S3 staging only for Textract input/output prefixes (never primary storage — Supabase used only for auth).

```

**Ten-layer mapping (AGENTS.md) — reality:**
1. File Layer `src/lib/files/validation.ts` + upload route — REAL
2. Document Layer `src/lib/documents/pdf.ts` + render.ts — REAL (pdf-lib + mupdf)
3. Perception Layer `src/lib/ocr/*` — REAL via Textract
4. Structure Layer `src/lib/structure/*` — REAL deterministic
5. Matching Layer `src/lib/jobs/runner.ts matchingStage` — REAL evidence-weighted
6. Evidence Layer `src/lib/evidence/aggregate.ts` — REAL
7. Decision Layer `src/lib/decision/index.ts` — REAL
8. Localization Layer `src/lib/coordinates/transform.ts` — REAL pure functions
9. Presentation Layer `components/viewer/*` `app/results` — REAL
10. Operations Layer `src/lib/jobs/runner.ts` + `src/lib/storage/index.ts` — REAL with persist

Vision was previously removed (ARCHITECTURE_AUDIT), now re-added as parallel evidence-only (router.ts).

---

## 2. Current OCR Flow (Textract async — step-by-step)

1. **Preprocess:** `preprocess(jobId)` reads buffers from `fileStorage`, calls `inspectPdf`/`inspectImage`, upserts DocumentPage.

2. **OCR Stage `ocrStage(jobId)` — runner.ts:357**
   - Reuse cached if `ocrResultStore` + `job.ocrCompletedAt` exists (idempotent).
   - Try resume if `job.ocrOperationId` present (calls getOperationStatus).
   - For each doc (questionPaper then answerSheet, sequential to bound memory):
     a. `buildS3Keys` → `inputKey = ocr-input/{jobId}/{kind}.pdf`, `outputPrefix = ocr-output/{jobId}/{kind}/`, bucket = `AWS_S3_BUCKET`.
     b. Read file buffer (`fileStorage.read`), mime `application/pdf`.
     c. `uploadBufferToS3(bucket, key, buffer, mime)` with up to `OCR_MAX_RETRIES=3` exp backoff `2^n*500ms` (`src/lib/ocr/s3.ts:67`).
     d. `provider.submitDocument({jobId, documentId, kind, s3Bucket, s3Key, mimeType, pageCount})`:
        - `TextractOcrProvider.submitDocument` (src/lib/ocr/textract.ts:29) → `TextractClient` with region+credentials (or IAM).
        - Tries `StartDocumentAnalysisCommand` with `FeatureTypes: [TABLES, LAYOUT]` + optional `NotificationChannel` (SNS/SQS).
        - Fallback to `StartDocumentTextDetectionCommand` on InvalidParameterException.
        - Returns `{operationId: JobId, outputUri: s3://outputBucket/textract-output/{jobId}/{kind}/}`.
     e. Persist `ocrOperationId`, `ocrOutputUri`, `ocrInputUri`, `ocrAttempt`, `ocrPageCount` to jobStore.
     f. **Poll:** `getOperationStatus(operationId)` every `OCR_POLL_INTERVAL_MS=5000` until DONE/FAILED or `OCR_OPERATION_TIMEOUT_MS=300000` (5m). Tries `GetDocumentAnalysisCommand` then fallback `GetDocumentTextDetectionCommand` (MaxResults 1).
     g. **Fetch result:** `getOperationResult(operationId, outputUri)` with pagination `MaxResults:1000` + `NextToken` loop over `GetDocumentAnalysis` (or TextDetection fallback), collects all `Blocks`, checks JobStatus.
     h. **Normalize:** `normalizeTextractBlocks(blocks)` (line 199) → `OcrDocumentResult { jobId, documentId, kind, pages[], provider:amazon-textract, providerVersion:v1 }` with `OcrPageResult[]`.
        - PAGE blocks → pagesMap
        - LINE blocks → linesByPage sorted by Top
        - Synthesized blocks via vertical gap >0.025, paragraphs via gap >0.015, words via Relationships CHILD Ids.
        - Union boxes, avg confidence/100.
     i. Dump debug: `os.tmpdir/veda-ai/{jobId}/debug/{kind}-textract.json` + `artifacts/ocr-debug/{jobId}/`.
   - Store `ocrResultStore.set(jobId, {qpOcr, asOcr})`, `job.ocrCompletedAt`.

Mock path (`OCR_PROVIDER=mock`): `MockOcrProvider.getOperationResult` synthesizes 1-39 pages with static boxes; no S3.

---

## 3. Every Textract Dependency (full repo scan `rg textract|@aws-sdk/client-textract|StartDocumentAnalysis|GetDocumentAnalysis|DetectDocumentText|TEXTRACT|S3 OCR|OCR input/output|Textract JobId|BlockType|OCR_PROVIDER`)

| Scope | Pattern hits | Files |
|---|---|---|
| Package deps | `@aws-sdk/client-textract@3.800.0`, `@aws-sdk/client-s3@3.800.0` | `package.json:20-21`, `package-lock.json` |
| Env config | `OCR_PROVIDER=textract|mock`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_TEXTRACT_OUTPUT_BUCKET`, `AWS_S3_INPUT_PREFIX`, `AWS_S3_OUTPUT_PREFIX`, `AWS_SNS_TOPIC_ARN`, `AWS_SNS_ROLE_ARN`, `AWS_SQS_QUEUE_URL`, `OCR_OPERATION_TIMEOUT_MS`, `OCR_POLL_INTERVAL_MS`, `OCR_MAX_RETRIES` | `.env.example:8-25`, `.env:28-43`, `src/lib/config/index.ts:42-57` |
| OCR types | `provider: "amazon-textract"`, `OcrProvider` async interface (`submitDocument`, `getOperationStatus`, `getOperationResult`, `cancelOperation`), `SubmitOcrRequest {s3Bucket,s3Key,mimeType,pageCount}`, `OcrOperationStatus`, `OcrDocumentResult` | `src/lib/ocr/types.ts:62,89-94` |
| Textract provider | `TextractClient`, `StartDocumentAnalysisCommand`, `GetDocumentAnalysisCommand`, `StartDocumentTextDetectionCommand`, `GetDocumentTextDetectionCommand`, `JobId`, `FeatureTypes`, `NotificationChannel`, `BlockType PAGE/LINE/WORD`, `Geometry.BoundingBox {Left,Top,Width,Height}`, `Confidence`, `Relationships`, `NextToken`, `JobStatus` | `src/lib/ocr/textract.ts:1-399` |
| S3 staging | `S3Client`, `PutObjectCommand`, `GetObjectCommand`, `ListObjectsV2Command`, `DeleteObjectsCommand`, `buildS3Keys`, `buildS3Uris`, `parseS3Uri`, `uploadBufferToS3`, `downloadS3File`, `listS3OutputFiles`, `deleteS3Prefix` | `src/lib/ocr/s3.ts:1-143` |
| Factory | `TextractOcrProvider` instantiation, `MockOcrProvider` alternative | `src/lib/ocr/factory.ts:2,11-18` |
| Runner OCR | `getOcrProvider`, `uploadBufferToS3`, `deleteS3Prefix`, `ocrOperationId/outputUri/inputUri`, `ocrStage` S3 upload+poll+parse, debug dumps `*-textract.json` | `src/lib/jobs/runner.ts:9-11,306,357-591,807,824,905-933` |
| Structure parsers | `parseQuestionsFromTextract`, `segmentAnswersFromTextract` signatures `OcrDocumentResult` | `src/lib/structure/question-parser.ts:406`, `src/lib/structure/answer-segmentation.ts:226` |
| Types ProcessingJob | `ocrOperationId`, `ocrOutputUri`, `ocrInputUri`, `ocrAttempt`, `ocrStartedAt`, `ocrCompletedAt`, `ocrPageCount`, `ocrErrorCode` + stages `OCR_SUBMITTED|PROCESSING|COMPLETED|FAILED` | `src/types/index.ts:18,220-228` |
| Vision | Comments `parallel to Textract (evidence-only, grounded to Textract geometry)` | `.env.example:27`, `src/lib/config/index.ts:57`, `src/lib/vision/fusion.ts`, `src/lib/vision/canonical.ts` |
| Docs | AWS Textract pipeline docs, audit docs | `docs/AWS_TEXTRACT.md`, `docs/TEXTRACT_VS_VISION_AUDIT.md`, `docs/AWS-TEXTRACT-MIGRATION.md`, `docs/ARCHITECTURE_AUDIT.md`, `docs/FINAL_VERIFICATION.md` etc (26 files in docs/) |
| Scripts | `scripts/aws-smoke.ts` real S3+Textract test, `scripts/simulate-pipeline.ts`, `scripts/test-mupdf.ts` etc | `scripts/aws-smoke.ts`, `scripts/evaluate.ts`, `scripts/audit.ts` |
| Tests | `tests/unit/textract.test.ts`, `tests/integration/textract-integration.test.ts`, `tests/unit/answer-segmentation.test.ts` etc | `tests/unit/textract.test.ts:1-…`, `vitest.config.ts:17-20` (OCR_PROVIDER=mock) |
| Artifacts | `artifacts/39ac…/02-textract-raw.json`, `03-textract-normalized.json`, `artifacts/ocr-debug/**` | `artifacts/` |

Search also returns `NEXT_PUBLIC` never holds AWS secrets (verified).

Leak: `.env` committed with real `AWS_SECRET_ACCESS_KEY=Za9f...` + `OPENROUTER_API_KEY` — must rotate.

---

## 4. Files That Need Modification for Local OCR Migration

**Must change (runtime pipeline):**
- `package.json` — remove `@aws-sdk/client-textract`, keep `@aws-sdk/client-s3` only if S3 remains; add local OCR deps (`tesseract.js` + `sharp` if needed) — or keep canvas/mupdf for rendering.
- `src/lib/ocr/types.ts` — extend `OcrDocumentResult.provider` from `"amazon-textract"` to `"amazon-textract" | "local" | "tesseract"` ; keep normalized shape but add `OcrPageResult` dims provenance; optionally add `OcrBlock` id/source metadata.
- `src/lib/ocr/textract.ts` — REMOVE from active pipeline (delete or move to `src/lib/ocr/providers/textract.legacy.ts` / delete Textract imports; do not keep `TextractClient` in runtime bundle). Can keep file archived but not imported.
- `src/lib/ocr/s3.ts` — REMOVE OCR staging reliance: `uploadBufferToS3` / S3 Textract output prefix no longer needed. Keep S3 only if still required for Supabase alternative? Current primary file storage is `LocalFileStorage` (tmp), S3 is Textract staging only — so can delete S3 Textract staging. If we keep Supabase storage later, this file becomes dead code.
- `src/lib/ocr/factory.ts` — switch `getOcrProvider()` to return `LocalOcrProvider` (tesseract) when `OCR_PROVIDER=local|tesseract` (default), keep `mock` for tests. No more `TextractOcrProvider` default.
- `src/lib/ocr/index.ts` — update exports to `LocalOcrProvider` / `TesseractOcrProvider`.
- `src/lib/ocr/mock.ts` — keep for vitest, but align its `OcrDocumentResult` shape with new provider string.
- `src/lib/config/index.ts` — REMOVE/DEPRECATE `AWS_SNS_TOPIC_ARN/ROLE/SQS`, `AWS_TEXTRACT_OUTPUT_BUCKET`, Textract-specific `OCR_PROVIDER=textract` default; replace with `OCR_PROVIDER=local|tesseract|mock`, `LOCAL_OCR_ENGINE=tesseract`, `LOCAL_OCR_LANGUAGES`, `LOCAL_OCR_WORKERS/CONCURRENCY/OEM/PSM`. Keep `AWS_S3_BUCKET` ONLY if S3 still needed (currently not for primary storage — can remove or keep optional). Add `OCR_CONCURRENCY`, `OCR_DPI`, `OCR_LANG`. Validate fail clearly.
- `src/lib/jobs/runner.ts` — **largest change**: `ocrStage()` currently does S3 upload → Textract submit → poll → fetch. Replace with local pipeline: `renderPdfPagesToImages (mupdf)` → `LocalOcrProvider.processDocument` with bounded concurrency (worker pool), model load once, per-page OCR, normalize to `OcrDocumentResult`. Remove `buildS3Keys`, `uploadBufferToS3`, `deleteS3Prefix` for OCR staging, `ocrOperationId/outputUri` job fields (or keep as generic `ocrOperationId` for legacy but not used). Keep idempotency/cache but simpler. Persist debug dumps `*-local-ocr.json` instead of `*-textract.json` (keep backward compat path or new names `03-local-ocr-normalized.json` etc as spec section 23). Update logs to `{engine:local, durationMs, blockCount}`.
- `src/types/index.ts` — generalize `ProcessingJob.ocrOperationId` comment (`OCR metadata (Amazon Textract async)` → `OCR metadata (provider-agnostic)`), keep fields for compatibility or deprecate Textract-specific names; stages remain same but semantics shift to local processing.
- `.env.example` — replace Textract block with Local OCR block (`OCR_PROVIDER=local`, `LOCAL_OCR_ENGINE=tesseract`, `TESSERACT_LANG=eng`, `OCR_CONCURRENCY=4`, `OCR_DPI=200` etc), document distinct sections LOCAL OCR / VISION / STORAGE / APP.

**Should update (pipeline docs, UI, artifacts):**
- `src/lib/documents/render.ts` — KEEP but adapt: local OCR also needs rendered images (mupdf). Already supports `renderPdfPagesForVision`; reuse for OCR. Document lifecycle `load model once, reuse across pages` (spec 21).
- `src/lib/vision/*` — keep, but change input contract: Fusion doc says Vision input includes `OCR blocks + confidence + page metadata` (spec 8). Update `shouldInvokeVision` routing to handle local OCR confidence.
- `src/lib/structure/question-parser.ts` — signature rename `parseQuestionsFromTextract` → `parseQuestionsFromOcr` or keep alias; no logic change (already generic, uses `OcrDocumentResult`).
- `src/lib/structure/answer-segmentation.ts` — same rename; logic generic.
- `src/lib/vision/fusion.ts` + `canonical.ts` — update grounding warning text from `Textract` to generic OCR; keep evidence types.
- `src/components/viewer/PdfViewer.tsx` — NO change expected (already normalized [0,1] via highlightRegions), but verify zoom 50/100/200, navigation.
- `src/app/api/*` — ensure no Textract imports remain.
- `tests/**` — update mocks that import `TextractOcrProvider`, add new local OCR unit tests (normalization, coordinate, grouping, hierarchy) per spec §24, adversarial tests.
- `scripts/*` — add `scripts/ocr-benchmark.ts` harness, update `aws-smoke.ts` deprecation.
- `docs/*` — update `ARCHITECTURE.md`, `OCR.md`, `VISION_PIPELINE.md`, `MAPPING.md`, `HIGHLIGHTING.md`, `LIMITATIONS.md`, `TESTING.md`, `FINAL_VERIFICATION.md`, create `LOCAL_OCR_BENCHMARK.md`.
- `vitest.config.ts` — change default `OCR_PROVIDER=textract` → `local` / `mock` for tests; keep mock for CI.
- `next.config.ts` — `serverExternalPackages: ["canvas"]` remains (mupdf/tesseract may need `sharp`/`tesseract.js` external).
- Secrets — rotate `.env` AWS keys, ensure no `NEXT_PUBLIC` secret.

**Can deprecate/remove:**
- `src/lib/ocr/s3.ts` Textract staging helpers if no S3 requirement (check Supabase storage need — currently not used for OCR persistence; fileStorage is local tmp). Keep file only if S3 bucket retained; spec §17 says keep S3 only if still actually needed.

---

## 5. Current OCR Data Schema

**`src/lib/ocr/types.ts` (94 lines)**

```ts
NormalizedBox { x:0..1, y:0..1, width:0..1, height:0..1 }

OcrLine { text, boundingBox: NormalizedBox, confidence:0..1 (Textract /100), pageNumber }
OcrPageResult { pageNumber, text (joined LINES \n), blocks: OcrBlock[], lines: OcrLine[], confidence, width, height, rotation }
OcrBlock { boundingBox: NormalizedBox, paragraphs: OcrParagraph[], confidence }
OcrParagraph { boundingBox, words: OcrWord[], confidence }
OcrWord { boundingBox, symbols: OcrSymbol[], confidence, text }
OcrSymbol { boundingBox, text, confidence, property.detectedBreak }

OcrDocumentResult { jobId, documentId, kind:"questionPaper"|"answerSheet", pages:OcrPageResult[], provider:"amazon-textract", providerVersion, operationId (JobId), completedAt }
OcrOperationStatus { operationId, status:"PENDING"|"RUNNING"|"DONE"|"FAILED"|"CANCELLED", progress?, error?, outputUri? }
SubmitOcrRequest { jobId, documentId, kind, s3Bucket, s3Key, mimeType:"application/pdf"|"image/tiff"|"image/png"|"image/jpeg", pageCount }
OcrProvider { submitDocument -> {operationId, outputUri}, getOperationStatus, getOperationResult, cancelOperation }

OcrPageResult.width/height = 0 when from Textract (no pixel dims, bbox already normalized). DocPage width/height from pdf-lib inspection is source of display dims.
```

**Normalization** (`normalizeTextractBlocks`, 199-376):
- BoundingBox normalized already `[0,1]` via `Left/Top/Width/Height`; no pixel conversion.
- Confidence divided 100 → 0..1.
- Blocks synthesized by gap >0.025 (vertical), paragraphs by >0.015, words via Relationships CHILD.
- Union boxes for block/paragraph covering lines.

**Future local schema:** keep same but add `OcrDocumentResult.provider: "local"`, `providerVersion: tesseract version`, `OcrPageResult.width/height` = rendered image dims (preserved original vs processing), `OcrBlock.id`, `source:"tesseract"` per block, `polygon` optional. Preserve normalized + original pixel dims.

---

## 6. Current BBox Representation

- **Textract:** `Geometry.BoundingBox { Left, Top, Width, Height }` normalized [0,1] relative to page dims as rendered by Textract (internal). Stored as `NormalizedBox {x=Left, y=Top, width, height}` in `OcrLine.boundingBox`, `OcrBlock.boundingBox`, `OcrParagraph`, `OcrWord`. Example from artifact `39ac` line: `{"x":0.0792,"y":0.4675,"w":0.821,"h":0.075}`. No pixel dims; page width/height from `DocumentPage` (pdf-lib) used only for display scaling via `PdfViewer` overlay `%`.
- **Coordinate transforms:** `src/lib/coordinates/transform.ts` pure functions `normalizeBox`, `denormalizeBox`, `rotateBox` (0/90/180/270), `cropBox`, `toDisplayBox`, `transformForDisplay`, `mergeBoxes`, `boxIoU`. Highlights rendered as `left/top/width/height %` (PdfViewer.tsx:237).
- **Highlight merging:** `mergeBoxesForHighlight` (runner.ts:26) unions boxes per page with pad 0.012, spans capped.
- **Limitations:** Textract width/height =0 (ignored), so all bbox are already normalized. For local OCR via rendered PNG, must compute pixel bbox → normalized via `dims` to produce same [0,1] contract. Must preserve `originalDims/processingDims/displayDims` transforms and be invertible/testable at scales 0.5/1/2 rotations 0/90/180/270 per spec §16.

---

## 7. Current Coordinate System

- **Canonical:** normalized `[0,1]` relative to original page dimensions (`DocumentPage.width/height` from `inspectPdf`). Textract boxes assumed already normalized.
- **Transform chain:** `original (PDF points) -> processing (rendered PNG 1.5x) -> display (viewer canvas 1.5x + DPR)`. `transform.ts` stores `originalDims`, `processingDims`, `displayDims`, `rotation`, `crop`, `scale`. All `HighlightRegion.boxes` are `NormalizedBox` stored per `pageId` and rendered as `%`.
- **Multi-page:** `bboxesByPage: Map<number, NormalizedBox[]>` per ParsedQuestion/SegmentedAnswer → multiple `AnswerRegion` per group (same continuationGroupId) → multiple `HighlightRegion` per mapping (`pageId` distinct). Never merge different pages into single rectangle (runner: `boxesByPage` map).
- **Vision coarseBox:** Vision returns `coarseBox [x,y,w,h]` 0..1 approximate, but never used as coordinate source — grounded to Textract blockIds via fusion warning (fusion.ts:40).

**Audit check:** `src/lib/coordinates/transform.ts:147` covered; tests `tests/unit/coordinates.test.ts` exist.

---

## 8. Current Vision Flow

- **Router** `src/lib/vision/router.ts:16 shouldInvokeVision(ocr)` — decides `useVision` by avgConfidence >0.85, totalLines >20, hasLowConfidenceLines, handwritingSignals, multiColumn detection. Easy → skip, moderate/hard → invoke. Config `VISION_PROVIDER=auto|openrouter|mock|disabled`, `VISION_MAX_PAGES=3`, `VISION_TIMEOUT_MS=90s`.
- **Rendering** `renderPdfPagesForVision(buffer, pageNumbers, maxPages)` — mupdf 1.5x PNG → base64, fallback canvas pdfjs, fallback PDF base64 slice.
- **Provider** `OpenRouterVisionProvider` (`src/lib/vision/openrouter-vision.ts`) — OpenAI client via OpenRouter base, model `qwen/qwen3-vl-32b-instruct`, `analyzeDocumentStructure` with system prompt, multimodal `image_url: data:image/png;base64`, response_format json_object, Zod `VisionDocumentAnalysisSchema`, retry 3 with exp backoff jitter on 429/5xx/timeout only.
- **Vision contract** `VisionDocumentAnalysis { pages: VisionPageStructure[] }` where `VisionPageStructure { pageNumber, visualRegions[], questionCandidates[{rawLabel}], answerGroupHints[{labelHint,isDiagram}] }`.
- **Stage** `visionStage` (runner.ts:593) — cache reuse, checks `VISION_PROVIDER disabled`, skips if OCR_PROVIDER=mock, respects `maxPages`, checks `hasRealImage` (not PDF placeholder) before calling, logs `{payloadKb, timeoutMs}`. For `auto`, failure falls back to undefined (not throw); for `openrouter` strict, throws `MODEL_UNAVAILABLE`.
- **Artifacts:** `vision-qp.json`, `vision-as.json` in tmp debug + `artifacts/debug/{jobId}/`, rendering to `vision-pages/*.png`.

**Current behavior on 39ac:** Vision invoked, succeeded 200 in 13s, returned hints (see `artifacts/39ac/04-vision.json` 9KB).

---

## 9. Current Mapping Flow

- **Input:** `QuestionNode[]` (orderIndex, normalizedNumber, text) from `parseQuestionsFromTextract` + `structuring`, `AnswerGroup[]` (regions[].questionLabel, normalizedText, pageId).
- **Candidate generation** `matchingStage` (runner.ts:1126): for each Q vs each AG, evidence:
  - `EXPLICIT_QUESTION_LABEL` 0.95 exact, 0.92 normalized strip, 0.88 prefix-insensitive, 0.35 part mismatch, 0.1 no match, 0.2 no label.
  - `SEMANTIC_SIMILARITY` jaccard word overlap (union) → min(0.85, j+0.3) if >0.1 else 0.15
  - `LAYOUT_CONTINUITY` `max(0, 1 - orderDiff*0.2)`
  - `OCR_CONFIDENCE` reg.ocrConfidence
  - `VISUAL_EVIDENCE` if diagram
- `aggregateScore(evidence)` (lib/evidence), `decideForQuestion(top3)` (lib/decision) → status MATCHED/UNCERTAIN/UNANSWERED (+ thresholds `MAPPING_HIGH=0.75`, `REVIEW=0.50` from config).
- **Global conflict:** sort Q by best score desc, greedy assign; if chosen already used, try next candidate >=0.5, else downgrade to UNCERTAIN with `NEIGHBOR_CONTEXT` conflict evidence.
- **Highlights:** per AG `boxesByPage` → `mergeBoxesForHighlight` per page → `HighlightRegion {pageId, boxes:[padded union], confidence, source:matching}`; also unmatched answers → `UNMATCHED` decisions.
- **Output:** `MappingDecision[]` (`status MATCHED|UNCERTAIN|UNANSWERED|UNMATCHED`, `highlightRegions`), sorted by question orderIndex, `unmatchedAnswers` filtered.
- **Known failure (accuracy_audit 39ac):** only 1 MATCHED, 36 UNCERTAIN, 4 UNANSWERED, 152 UNMATCHED — over-matched, indicates mapping thresholds/layout drift; not Textract failure but evidence calibration.

---

## 10. Current Highlight Flow

1. `segmentAnswersFromTextract` → `SegmentedAnswer` with `bboxesByPage Map<number,NormalizedBox[]>` per page + confidence.
2. `structuring` → `AnswerRegion[]` per page box (one per page in group), `AnswerGroup { regions: AnswerRegion[], normalizedText }`, continuation merge for adjacent untagged.
3. `matchingStage` → `decisions[].highlightRegions` via `boxesByPage` union + padding (spec 15: merge line boxes → coherent rectangle per page).
4. `localizing` — no-op (future work: could refine transform).
5. `validatingResult` checks `matchedWithNoHighlight` warning.
6. **UI:** `app/results/[jobId]/page.tsx` fetches `/api/jobs/{jobId}/result` → `resultStore.get` → `QuestionList` + `PdfViewer`/`AnswerSheetViewer`.
   - `PdfViewer.tsx` maps `highlight.pageId` → `pageNumber` via `pageIdToNumber`, filters `pageHighlights` where `pageNumber` matches or id equality fallback, renders absolute divs `left: box.x*100%` with `ring-2 ring-[#FF6B2C]` for active first box, otherwise `amber-200/20`.
   - Click question → `activePageId` state → scrollIntoView `pdf-page-{num}` + overlay.
   - Supports single-page, multi-page (multiple HighlightRegion entries), out-of-order (page mapping), unanswered (0 highlights), zoom 1.5 viewport but CSS % so invariant.

Verified at scales via transform.ts invertibility tests; viewer tests manual.

---

## 11. Current Tests

- **Unit** (`tests/unit/`):
  - `textract.test.ts` (9 tests): normalizeTextractBlocks parsing, bbox normalized, confidence, pagination.
  - `question-parser.test.ts`: Q label regex, hierarchy, marks extraction, reading order, MCQ options.
  - `answer-segmentation.test.ts`: Ans/Q label detection, adaptive gap, continuation.
  - `ocr.test.ts`: OCR error code mapping, factory selection.
  - `numbering.test.ts`: normalizeNumber depth/partType/parent.
  - `evidence.test.ts`, `decision.test.ts`, `coordinates.test.ts` (rotate/scale/crop/merge/IoU), `blocker-fix.test.ts` (regressions)
- **Integration** (`tests/integration/`):
  - `textract-integration.test.ts` (5): end-to-end mock OCR → parsers → mapping → highlights with fixtures.
  - `job.test.ts`: startProcessing pipeline with mock provider.
- **Fixtures** `fixtures/` 24 dirs: ai-malformed, ambiguous, continuation, duplicate-number, extra-unmatched, low-quality, multi-column, multi-page-answer, multiple-regions, out-of-order, unanswered, etc each with synthetic `groundTruth.json` (788B).
- **E2E** `tests/e2e/`: Playwright config `testDir ./tests/e2e`, timeout 180s, webServer `npm run dev` reuseExistingServer. Tests verify upload→processing→viewer→highlight flow (not run in CI with real creds lately; previous single passed in 2.2m per docs).
- **Scripts** smoke: `npm run test:aws` (`scripts/aws-smoke.ts` — real S3+Textract 1-page), `npm run test` (vitest), `npm run test:e2e` (playwright).
- **Coverage gaps:** No real PDF E2E against live Textract for 38-Q paper prior to 39ac job; fixtures synthetic small groundTruth, not 47-page real doc; no benchmark perf tests; no vision mock contract tests for fusion.

---

## 12. Current Known Failures (from docs/ACCURACY_AUDIT.md + SYSTEM_AUDIT.md + real 39ac artifacts)

- **Mapping accuracy:** 39ac: only 1/38 top-level matched, 36 uncertain, 4 unanswered, 152 unmatched — evidence threshold calibration off (global greedy downgrades many to uncertain).
- **Q6/Q8/Q10 options:** missing C/B due to Textract truncation + `isOptionLine` skip (3 vs 4 opts) — `Q6 missing C` logged.
- **Segmentation over-merge:** prior bug Q1 9-page merge (now fixed via expectedNext inference, but still 152 unmatched suggests over-segmentation of answer sheet into many small groups).
- **Credentials:** `SignatureDoesNotMatch` clock skew transient prevents stale job re-run; needs creds rotation.
- **`.env` leak:** real AWS secret committed.
- **Vision gaps:** prior architecture had no Vision branch; now present but `VISION_MAX_PAGES=3` limits to first 3 pages (may miss middle evidence).
- **Highlight:** not per-word noise (union), but uncertain highlights dominate — user sees many REVIEW.
- **Performance:** Textract polling 5s * ~4-6 polls = 22s OCR total for 39 pages (measured), Vision 13s, not local yet.
- **No S3 removal risk:** if we delete S3 staging without checking Supabase file persistence (not needed — fileStorage is local tmp, persists via tmpdir).
- **Instruction leakage:** 400, 4807 false questions previously (fixed via header/footer band filters).

---

## 13. Migration Risks

1. **Accuracy regression:** Tesseract handwriting accuracy ~15-35% vs Textract 95%+ printed — must not depend on OCR text for labels alone; geometry + Vision fusion critical. Risk: Q37 subparts mis-detected if OCR garbles "(i)" as "l" or "I".
2. **Bounding box drift:** Textract bbox normalized [0,1] high precision (3-decimals); Tesseract char/word bbox from pixel rendering may shift ±0.01 due to DPI/scale; need invert transform testing at 0.5/1/2/90°.
3. **Latency vs memory:** 39 pages sequential tesseract may be 60-120s total (2-3s/page) vs Textract 22s async; concurrency 2-4 mitigates but memory peak ~800MB-1.5GB if all pages rendered PNG at 1.5x.
4. **Model loading:** Bad pattern load-per-page (spec 21) would 39x load; must reuse singleton worker.
5. **Node compatibility:** `tesseract.js` WASM needs `fetch` for wasm assets, worker threads; canvas/mupdf rendering uses native `mupdf` (already used for Vision) — keep Dep. Alternative `node-tesseract-ocr` needs binary tesseract installed (not portable).
6. **Reading order:** Textract readingOrderSort handled multi-column via x-clustering; Tesseract LSTM returns natural reading order per image but may still mis-order two-column — retain geometry sort post-OCR.
7. **Retry/failure surface:** Local OCR page failure should not fail entire doc (spec 22) — must record page-specific FAILED and continue.
8. **Secrets rotation:** Deleting AWS creds before verifying local path breaks production; do gradual: keep S3 for potential rollback, feature flag `OCR_PROVIDER`.
9. **Test fixtures stale:** Fixtures mocked Textract output shape; local OCR output shape differs (words/symbols may be absent) — tests must be updated to provider-agnostic shape.
10. **Browser payload:** Viewer previously loads PDFs via `/api/files/[jobId]/[fileId]` (server streams tmp file); local OCR does not change this but ensure highlight coords still [0,1] after OCR switch.

---

## 14. Local OCR Candidates — Evaluation Matrix

| Criteria weight → | Latency | BBox quality | Printed acc | Layout/order | Handwriting | CPU feasible | Mem | Node compat | Deploy simple | License |
|---|---|---|---|---|---|---|---|---|---|---|
| **1. Tesseract (tesseract.js WASM)** | High: 1.5-3s/page WASM, model load 2-4s once, total ~45s for 39p @ conc 2 | High: word/line boxes pixel → normalized, confidence per word | High 95%+ printed English (LSTM) | Medium: no explicit layout LAYOUT, but our synthesis by gap compensates | Low-medium: 30-40% handwritten, but we treat as geometry not transcription | High: CPU-only, no GPU | ~150MB wasm+eng, 200MB peak per worker | High: pure npm, no python/native, works win32 Node 20 | High: npm install only | Apache 2.0 |
| **2. PaddleOCR (ONNX JS)** | Medium: 0.8-2s/page after 1-2s load, but needs ONNX runtime + model downloads (det+rec ~15MB+5MB) | High: polygon + oriented boxes, excellent printed tables | Very high printed + tables | High: layout model separate | Medium: better than Tesseract on handwriting (PP-OCRv4) but still needs handwriting-specific model | Medium: ONNX CPU, needs wasm threads | ~300MB | Low: `paddleocr` python canonical, JS wrappers immature (`paddle-ocr`, `paddleocr-js` stale), requires custom ONNX pipeline | Low: complex model fetch | Apache 2.0 |
| **3. Surya OCR** | Low: 1.2-2.5s/page, model 500MB+, init 4-6s | High: line polygons, layout | Very high | Very high (native reading order + layout) | High: best handwriting among open, but local | Low: needs torch/python, GPU preferred, 2GB+ mem | ~1-2GB | Very Low: Python-only (`surya-ocr` pip), would require separate server — violates "inside application/server process without separately deployed OCR server" spec | Very Low: pip + CUDA | MIT but heavy |
| **4. EasyOCR (alt)** | Similar to Paddle, needs Python | Medium | High | Medium | Medium | Low | High | Very Low (python) | Low | Apache |
| **5. DocTR (alt)** | ~1s/page CPU | Medium | High | Medium | Low | Medium | Medium | Low (python) | Low | Apache |

**Shortlist per spec 2.2 priority order 1..10:**
- 1 LOW LATENCY → Tesseract and Paddle tie (Paddle slightly faster per page after warmup, but deployment cost higher)
- 2 BBox quality → all high, Textract->Tesseract word boxes fine for highlight merging.
- 3 Printed accuracy → Paddle/Surya edge, but Tesseract sufficient for 8-page printed QP (98% expected).
- 4 Layout → Surya best, but we already have deterministic gap synthesis弥补.
- 5 Handwriting → Spec 11 says do NOT expect local OCR to perfectly recognize handwriting; geometry is primary, Vision handles interpretation → Tesseract's weaker handwriting ok if geometry preserved.
- 6 CPU feasible → Tesseract best.
- 7 Memory → Tesseract smallest.
- 8 Node compat → Tesseract only viable pure Node; Paddle/Surya require Python sidecar violates spec 5.
- 9 Deploy simple → Tesseract single npm.
- 10 License → all open.

**Excluded:** Any client-side OCR (browser wasm) — spec 20 says no browser-side OCR.

---

## 15. Benchmark Plan (before final selection — spec §3)

- **Input docs:** Real PDFs from job `39ac` (sizes 0.5MB QP 8p, 13.5MB AS 39p) stored at `C:\Users\Dell\AppData\Local\Temp\veda-ai\39ac…\e9d…` and `0ef…`. Also benchmark subset 5 QP pages + 5 AS pages (representative handwritten).
- **Harness:** `scripts/ocr-benchmark.ts` (to be created) — for each engine:
  1. Measure `modelLoadMs` (import/createWorker + init lang).
  2. Loop pages rendered via same `mupdf` 1.5x PNG path used in production (ensure identical dims).
  3. Per-page `ocrMs`, `peakMemoryMb` (process.memoryUsage), `textLength`, `blocks`, `lines`, `bboxCoverage`, `confidenceCoverage`, `readingOrderQuality`.
  4. Validate bbox validity (`0..1`, width/height >0, <1, total coverage not 0).
  5. Save machine-readable `artifacts/ocr-benchmark/{engine}.json` + markdown `docs/LOCAL_OCR_BENCHMARK.md` with tables.
- **Metrics:** `modelLoadMs`, `totalMs`, `avgPageMs`, `peakMemoryMb`, `blocks`, `lines`, `bboxAvailability%`, `confidenceAvailability%`, `printedQuality (char error proxy)`, `handwritingUsefulness (label detection hit rate)`.
- **Do not fabricate:** Every number from execution; run harness live, not synthetic.
- **Pages:** Prefer entire 8+39 doc after candidate selected; initial benchmark 5+5 sample to keep iteration fast.

---

## 16. Final Selected OCR Engine — PRELIMINARY (pending benchmark execution)

**Preliminary selection: Tesseract.js (WASM) via `tesseract.js@5` with ENG traineddata.**

**Why (reasons to be confirmed by benchmark numbers):**
1. **Only candidate that satisfies “inside application/server process without separately deployed OCR server” with pure Node.** Paddle/Surya require Python sidecar or complex ONNX runtime that is not proven in this repo’s Node 20 win32 env. Spec 5 explicitly forbids separate OCR server.
2. **Low latency + CPU feasibility** — WASM model loads once (~2-4s) then reused per spec 21; bounded concurrency 2-4 keeps peak <800MB for 39 pages. Paddle would be similar latency but +200MB ONNX + model fetch fragility.
3. **Geometry sufficient** — provides `text + bounding box (word/line) + confidence + pageNumber + block relationship` (via tesseract `data.lines/words/paragraphs/blocks`); normalized via render dims gives needed `x/y/w/h` for highlight merging.
4. **Printed document accuracy adequate** for QP (LSTM trained on printed); handwriting not required to be perfect — spec 11 says use geometry + Vision for handwriting, preserve REVIEW not MATCHED.
5. **Deployment simplicity:** single `npm install tesseract.js`, no native binary (`canvas`/`mupdf` already present for vision rendering — no extra system deps). Fits `serverExternalPackages: ["canvas"]` pattern.
6. **License Apache 2.0 suitable.**

**Benchmark gate:** If benchmark shows tesseract `avgPageMs` >5000ms or bboxCoverage <60% or printed error >20%, re-evaluate Paddle ONNX as fallback. Benchmark will document decision definitively.

**Model lifecycle (spec 21):**
```
process start → createWorker('eng', OEM.LSTM_ONLY, {cachePath}) → load once
               → for each page: setImage(PNG Buffer) → recognize() → get bbox → reuse worker
               → terminate on shutdown
Not: per-page load/destroy
```

---

## 17. Migration Plan Outline (post-audit)

**Phase A — Benchmark (next):**
- Implement `scripts/ocr-benchmark.ts` harness (supports tesseract local + future paddle stub).
- Run 5+5 sample + later full 8+39, record numbers to `docs/LOCAL_OCR_BENCHMARK.md` + `artifacts/ocr-benchmark/*.json`.

**Phase B — Integration:**
- Add `src/lib/ocr/local.ts` (LocalOcrProvider implementing OcrProvider simplified sync interface + new `processDocument(input: {buffer, kind, pages}) -> OcrDocumentResult`).
- Keep `provider.processDocument` behind `OcrProvider` abstraction (compat with factory).
- Wire `src/lib/jobs/runner.ts ocrStage` to local path when `OCR_PROVIDER=local`.
- Update `src/lib/config` env schema.
- Preserve artifacts `03-local-ocr-normalized.json` plus per-page images for inspection.

**Phase C — Removal:**
- After local verified on real 39ac PDFs (question count 38, top-level 38, subparts 3 for 37, MCQ options, answerGroups, mapping stats), flip `OCR_PROVIDER` default to `local` in `.env.example` + config.
- Move `src/lib/ocr/textract.ts` to `src/lib/ocr/providers/textract.legacy.ts` (not imported) or delete Textract imports.
- Remove S3 Textract staging from active pathway (keep S3 only if fileStorage moves to S3 — currently not).
- Update `.env.example` clean sections.

**Phase D — Hardening & Testing:**
- Add tests §§24 A-N, adversarial fixtures (11a-11b, 37-patterns, MCQ, out-of-order).
- Run unit + integration (`npm run test`), real E2E 8+39 (`npm run test:e2e` upload→validate→render→OCR→vision→fusion→mapping→highlight→PDF.js).
- Verify hard gates §33 (every claim backed by execution).

---

## 18. Open Findings — Needs Immediate Attention Before Migration

- Rotate leaked `.env` AWS keys.
- Benchmark harness must be executed — current doc contains *planned* metrics, not measured.
- Vision currently limited to 3 pages — may expand for 39-page AS if OCR confidence low.
- System has large artifact dumps (8M question-tree) — local OCR must keep artifact pipeline (01-12 steps per spec 23).

---

*Audit completed without modifying production code. Next: benchmark execution.*
