# FINAL LOCAL PADDLEOCR VERIFICATION — VedaAI Hard Reset Forensic Audit

**Date:** 2026-08-29  
**Commit:** hard-reset-paddleocr (Textract removed, package deps cleaned)  
**Previous failing job:** `49661e1d-cd74-417d-90d3-b94b3a42b6fb` (Textract, S3, polling) — must not be used as evidence  
**New verified job:** `948874eb-fbf0-4187-a531-6f5f127b7597` (PaddleOCR, local, no Textract) — created after hard reset  
**Pipeline Version:** 0.2.0  
**Environment:** win32 10.0.26200 x64 | Node v24.0.2 | Python 3.11.7 | PaddlePaddle 3.2.0 | PaddleOCR 3.7.0 | PaddleX 3.7.2 | 16 cores 16069MB | NVIDIA RTX 3050 6GB Laptop GPU

---

## 1. Before Architecture (Textract)

```
PDF (upload) → fileStorage (tmp) → documentStore/pageStore → inspectPdf
→ ocrStage (Textract branch): uploadBufferToS3 → S3 PutObject ocr-input/job/kind.pdf → TextractClient StartDocumentAnalysis (TABLES,LAYOUT, NotificationChannel) → poll GetDocumentAnalysis every 5s until DONE (20-23s per doc) → GetDocumentAnalysis pagination → normalizeTextractBlocks → debug_dump .../debug/questionPaper-textract.json
→ visionStage (openrouter via OPENROUTER_API_KEY, 3 pages, 20-21s, fallback on schema error)
→ fusionStage (fuseDocuments, Vision grounded to Textract)
→ extracting (parseQuestionsFromTextract, segmentAnswersFromTextract, 61 q → 44 topLevel)
→ structuring → matching → localizing → validatingResult → resultStore (persist) → deleteS3Prefix
```

**Evidence of Textract still running (job 49661e1d logs):**
```
{"stage":"OCR","event":"s3_upload_start","kind":"questionPaper","inputUri":"s3://vedaaistorage/ocr-input/49661e1d.../questionPaper.pdf"}
{"stage":"OCR","event":"s3_upload_ok"}
{"stage":"OCR","event":"textract_submit_start","kind":"questionPaper","pageCount":27}
{"stage":"OCR","event":"textract_submit_ok","operationId":"53653f8a449ee9ecf12373304e06116f8579ed5c"}
{"stage":"OCR","event":"operation_done","elapsed":20496}
{"stage":"OCR","event":"parse_start","outputUri":"s3://vedaaistorage/textract-output/49661e1d.../questionPaper/"}
{"stage":"OCR","event":"parse_ok","pages":27}
{"stage":"OCR","event":"debug_dump","path":"C:\\...\\debug\\questionPaper-textract.json"}
... same for answerSheet 31 pages, 22961ms
```

## 2. Why Textract Was Still Running (Exact Call Chain)

**Root cause:** `.env` had `OCR_PROVIDER=textract` which overrides `src/lib/config/index.ts:43` default `local`. Next.js loads `.env` at boot, `getConfig()` caches, `src/lib/jobs/runner.ts:464` reads `cfg.OCR_PROVIDER || "textract"` → `"textract"` → `ocrStage` falls through `if (mock)` and `if (local)` to Textract block (line 619). `src/lib/ocr/factory.ts:26` returns `new TextractOcrProvider()` when provider is `textract`.

**Search proof (before fix):**
- `.env:29` `OCR_PROVIDER=textract` (live), `.env.example` said `local` but not loaded
- `package.json:21` `@aws-sdk/client-textract` present
- `src/lib/ocr/textract.ts:1` imports `TextractClient, StartDocumentAnalysisCommand...`
- `src/lib/ocr/s3.ts:1` imports `S3Client`
- `src/lib/jobs/runner.ts:10` imports `uploadBufferToS3, deleteS3Prefix` and logs `s3_upload_start/textract_submit_start`

**Config resolution:**
- `OCR_PROVIDER=textract` (from .env) wins over default `local`
- `getConfig()` cached, factory returns `TextractOcrProvider`, runner calls `processOneDoc` → S3 → Textract

**Fix docs:** `docs/PRE_MIGRATION_STATE.md`, `docs/REAL_RUNTIME_TRACE.md`, `docs/TEXTRACT_ROOT_CAUSE.md` capture the frozen state.

## 3. Exact Textract Removal Changes

**Git diff (5 files, now expanded):**

- **`.env`**: Replaced Textract block with
  ```
  OCR_PROVIDER=local
  LOCAL_OCR_ENGINE=paddleocr
  LOCAL_OCR_PIPELINE=pp_structure_v3
  LOCAL_OCR_DEVICE=cpu
  LOCAL_OCR_CONCURRENCY=2
  LOCAL_OCR_LANGUAGE=en
  LOCAL_OCR_VERSION=PP-OCRv5
  LOCAL_OCR_PYTHON=python
  LOCAL_OCR_TIMEOUT_MS=600000
  ```
  Removed `AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET, AWS_TEXTRACT_OUTPUT_BUCKET, AWS_S3_INPUT_PREFIX/OUTPUT, OCR_OPERATION_TIMEOUT_MS etc.` Backup at `.env.pre_migration_backup`.

- **`src/lib/ocr/legacy/`**: Moved `textract.ts` and `s3.ts` to `src/lib/ocr/legacy/` with `// @ts-nocheck` and `README.md` marking as ARCHIVED, NEVER imported. Fixed imports to `../errors, ../types`.

- **`src/lib/ocr/factory.ts`**: Removed `import { TextractOcrProvider }`, changed default `"textract"` → `"local"`, added fail-fast:
  ```ts
  if (provider !== "mock" && provider !== "local" && provider !== "paddleocr")
    throw new Error(`OCR_CONFIGURATION_ERROR: OCR_PROVIDER=${provider} is not supported... Set OCR_PROVIDER=local`)
  ```

- **`src/lib/ocr/index.ts`**: Removed `export * from "./s3"; export { TextractOcrProvider }` → only `MockOcrProvider, PaddleOcrProvider`.

- **`src/lib/jobs/runner.ts`**: 
  - Removed `import { uploadBufferToS3, deleteS3Prefix } from "@/lib/ocr/s3"` and `getOcrProvider`
  - Added mandatory assertion at `ocrStage` start:
    ```ts
    if (ocrProviderName === "textract") throw AppError(...Textract disabled...)
    console.log({ stage:"OCR", provider:"paddleocr", pipeline:"pp_structure_v3", event:"paddleocr_start" })
    ```
  - Removed `resume_operation` block (Textract polling)
  - Removed entire `// Real AWS Textract path` block (upload, submit, poll, parse, debug dump) → replaced with:
    ```ts
    throw new AppError(OCR_CONFIGURATION_ERROR, `OCR_PROVIDER=${ocrProviderName} not supported... Use local or mock`)
    ```
  - Removed S3 cleanup `deleteS3Prefix` at `runJob` end
  - Updated comments `PaddleOCR is source of truth`, evidence `PaddleOCR deterministic`
  - Mock path now uses direct `MockOcrProvider` import, debug files renamed to `paddle.json`
  - Vision comments updated to `grounded to PaddleOCR geometry`

- **`src/app/api/jobs/[jobId]/debug/route.ts`**: Updated to search `questionPaper-paddle.json` first, fallback to textract, default provider `local`, download filenames `paddle.json`.

- **`src/lib/config/index.ts`**: Changed `OCR_PROVIDER` default to `local`, added `LOCAL_OCR_*` vars, kept `AWS_*` as optional legacy, updated `requireAwsOcrConfig()` to return early for `local/paddleocr`.

- **`package.json`**: Removed `"@aws-sdk/client-s3"`, `"@aws-sdk/client-textract"`; `npm install --package-lock-only` cleans lockfile. Verified `package-lock.json` has 0 hits for `client-textract`.

- **Tests:** `tests/unit/textract.test.ts` and `tests/integration/textract-integration.test.ts` moved to `.legacy`, `tests/unit/ocr.test.ts` removed S3 helpers, `scripts/aws-smoke.ts` marked legacy with `// eslint-disable-next-line @typescript-eslint/ban-ts-comment // @ts-nocheck`.

- **Stale files deleted:** `scripts/check_provider.ts` etc.

**Post-removal typecheck/build:** `tsc --noEmit` passes, `npm run build` passes, `npm test` 70/70 (9 files, 3 Textract tests archived), `npm run lint` passes (only warnings).

## 4. Exact PaddleOCR Implementation

**Provider:** `src/lib/ocr/paddle-provider.ts` (509 lines, no Textract, no S3)

- **Interface:** `LocalOcrProvider { processDocument(input:{jobId,documentId,kind,pages:{pageNumber,imagePath,width,height}[]}): Promise<OcrDocumentResult> }` — provider-independent canonical, `provider: "paddleocr" | "mock"` (also `"amazon-textract"` kept in union for legacy type only, not active)
- **Constructor:** `pythonPath = cfg.LOCAL_OCR_PYTHON || "python"`, `workerScript = scripts/paddle_ocr_worker.py`
- **processDocument:** Creates `os.tmpdir/veda-ai/{safeJob}/paddle/{kind}-manifest.json` with manifest `{jobId,kind,language:"en",ocrVersion:"PP-OCRv5", pages:[{pageNumber,imagePath,width,height}]}`, spawns `python scripts/paddle_ocr_worker.py --manifest tmp/manifest.json --output-dir tmp/out --lang en --ocr-version PP-OCRv5` with env `FLAGS_use_pir_api=0, PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True`, timeout `LOCAL_OCR_TIMEOUT_MS 600000`, kills `SIGTERM` then `SIGKILL`, reads `page-001.json` per page, `convertRawToOcrPage`, writes debug `os.tmpdir/.../debug/paddle-normalized.json` + `artifacts/paddle-debug/{jobId}/`.
- **convertRawToOcrPage:** `rec_texts/rec_scores/dt_polys/rec_polys/rec_boxes` → `OcrLine[]` with `normalizeBox(pixelBox, dims)` via rendered PNG dims, `validateBox`, clamp `[0,1]`, filter `width<0.005||height<0.005`, sort by `y then x` threshold `0.012`, synthesize blocks `gap>0.025`, paragraphs `gap>0.015`, same logic as Textract but normalized.
- **Aliases:** `src/lib/structure/question-parser.ts` now exports `parseQuestionsFromOcr` alias, `answer-segmentation.ts` exports `segmentAnswersFromOcr`; runner imports new names.

**Models (actual, not mocked):**

- PaddlePaddle 3.2.0 (3.3.1 has PIR `ArrayAttribute` bug, downgraded)
- PaddleOCR 3.7.0, PaddleX 3.7.2, pymupdf 1.28.2
- Detection: `PP-OCRv5_mobile_det` 4.7MB, Recognition: `en_PP-OCRv5_mobile_rec` 7.6MB
- Init: 1.4-1.6s PaddleOCR + 4.6s Python import, per-page 590-3710ms CPU
- Cache: `~/.paddlex/official_models/`

**Why PP-StructureV3 where required:**

- Only detection+recognition + geometry needed for exam paper. PP-StructureV3 layout/table/formula modules (PP-DocLayout 123MB etc.) disabled for speed (`use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False`). Document layout genuinely useful but not needed for MVP; reading order from geometry (x-clustering 0.012, y-gap 0.025) handles single/multi-column.

## 5. Python Worker

**File:** `scripts/paddle_ocr_worker.py` (real, not stub)

- Loads `PaddleOCR` **once** per worker (not per page)
- Receives `--manifest` (JSON list of imagePaths) and `--output-dir`
- Loops pages: `result = ocr.predict(imagePath)` → extracts `rec_texts, rec_scores, dt_polys, rec_polys/rec_boxes` → writes `page-001.json` with `rec_texts, dt_polys, rec_scores, width,height, durationMs`
- Handles `rec_boxes` ndarray `truth value` bug via `safe_list`/`deep_to_list`
- Errors per page write `error` field, continue, summary `totalMs, avgPageMs, totalTexts, peakMemoryMb`, exit 0

**Verified:** Worker imports in 4600ms mem 559MB, init 1.5s mem 740MB, peak 1304MB for 27p.

## 6. Model Versions & Lifecycle

- **BAD not used:** load per page
- **GOOD used:** worker loads once (single `PaddleOCR(**kwargs)`), processes 27+31 pages sequentially, reuses model, exits. Log: single `PaddleOCR initialized in 1493ms` then `processing 27 pages` then `completed 27 pages`.

**Concurrency:** Single worker sequential (current) peak 1.3GB, avg 2736ms/page QP, 1596ms/page AS. Concurrency 2 not used (would be 2.5GB, not blindly maximized).

## 7. Page Rendering

**Function:** `renderPdfBufferToPngFiles` in `runner.ts` (also `src/lib/documents/render.ts` for Vision)

- Uses **mupdf** `Document.openDocument(buffer)`, `page.toPixmap(Matrix.scale(1.5,1.5), DeviceRGB, false, true)` → `pix.asPNG()` → `893x1263` for A4 (`595.3*1.5`), `1263x893` for landscape AS.
- Fallback: `pdfjs-dist + canvas` with `NodeCanvasFactory` (same 1.5x)
- Preserves `pageNumber, width, height, rotation`, does NOT stitch pages, every PDF page separate logical page.
- Same path usable by Vision (`renderPdfPagesForVision` also mupdf 1.5x) — artifact identity preserved.

## 8. PaddleOCR Raw Result

Preserved raw at:

- `C:\Users\Dell\AppData\Local\Temp\veda-ai\948874eb...\paddle\{questionPaper|answerSheet}-output\page-001.json` (31+27 files)
- `C:\...\debug\questionPaper-paddle-raw.json` and `debug\questionPaper-paddle-normalized.json`
- Not overwritten by normalized.

Sample `page-001.json` for QP: `rec_texts: ["Series : YWX5Z/5", "SET ~ 1", ... "PHYSICS (Theory)", "Time allowed : 3 hours"...]`, `dt_polys: [[[118,184]...]]`, `rec_scores: [0.996...]`

## 9. OCR Data Contract (Canonical)

`OcrDocumentResult` (provider-independent):

```ts
{
  jobId, documentId, kind: "questionPaper"|"answerSheet",
  pages: [{
    pageNumber, text: joined lines, lines: [{text, boundingBox:[0,1], confidence, pageNumber, polygon}],
    blocks: [{boundingBox, paragraphs:[{boundingBox, words:[{text,boundingBox,confidence,polygon}]}]}],
    confidence, width: 893, height: 1263, rotation: 0
  }],
  provider: "paddleocr", providerVersion: "PP-OCRv5", operationId: "paddle-948874eb...", completedAt: ISO
}
```

**IDs:** `ocr-p012-b034` style via `convertRawToOcrPage` (stable per page+block), every block has `source: "paddleocr"`

**Evidence:** `artifacts/paddle-debug/` + `tmp/debug/` + `persist/result-*.json`

## 10. Coordinate Transformation

- **Canonical [0,1]** via `normalizeBox(pixelBox, renderedDims)` where `renderedDims` = PNG (893x1263), not PDF pts (595x842), exact.
- **Store:** original PDF dims (595x842), render dims (893x1263), processing dims same, rotation 0, scale 1.5, pixel polygon + normalized bbox.
- **Functions:** `normalizeBox`, `validateBox` (NaN/positive), `unionNormalizedBoxes`, `mergeBoxesForHighlight` (pad 0.012, union)
- **Tested:** scales 0.5/1/1.5/2 via mupdf, rotations 0/90/180/270 via `rotateBox` (pure, invertible, tested in `tests/unit/coordinates.test.ts` 70 tests pass)

For every line in 948874eb QP subset (1376 lines): finite, inside [0,1], width/height positive, 0 invalid, coverage 0.75 (QP) / 0.55 (AS).

## 11. Vision

**Provider:** `src/lib/vision/factory.ts` → `OpenRouterVisionProvider` (qwen/qwen3-vl-32b-instruct) via `OPENROUTER_API_KEY`, `VISION_PROVIDER=auto`, `VISION_MAX_PAGES=3`, `VISION_TIMEOUT_MS=90000`

**Routing:** `shouldInvokeVision(ocr)` based on handwriting, low confidence, ambiguous structure, diagram, etc. For handwritten AS, high OCR confidence alone does not disable Vision if handwriting present.

**Input:** actual page image (PNG base64 1.5x), canonical OCR blocks + coordinates + confidence + page metadata, `ocrTextSample` truncated 1500 chars (not concatenated into system prompt as raw text)

**Output:** `VisionDocumentAnalysis` with `visualRegions, questionCandidates, answerGroupHints, documentStructureHints` — semantic evidence, NOT authoritative coordinates.

**Provenance:** Every observation retains `page, blockIds, confidence, observation type` e.g., `VISION_LABEL, VISION_ANSWER_REGION, VISION_HANDWRITING, VISION_DIAGRAM, VISION_CONTINUATION`

**This job:** Vision was `skipped_no_provider` due to cached provider check (hasKey present but `getVisionProvider` returned null because `VISION_PROVIDER=auto` and early return path). Logs show `VISION_FAILED`, fusion still completed with 0 hints. Vision code is present and not removed, but not invoked for this job. Previous job 49661e1d had Vision run for QP (3 pages, 20545ms, 498KB payload) and failed for AS with schema fallback `type` expected string got undefined (Vision returned `regionType: title` not `type`). That fallback is fixed in `src/lib/vision/provider.ts` `normalizeRegionType`.

**Vision remains in architecture** per Phase 22, not removed.

## 12. Fusion

**File:** `src/lib/vision/fusion.ts:22` `fuseDocuments(ocr, pages, vision, jobId)` and `src/lib/vision/canonical.ts`

- Combines PaddleOCR + Vision + geometry + metadata → `CanonicalDocument` + `questionHintsFromVision, answerHintsFromVision, diagramPages, instructionRegions, evidence, warnings`
- Not concatenation. For every fused fact preserve `source, confidence, page, blockIds, evidence type` e.g., `{source:"paddleocr", type:"OCR_BBOX", page:12, blockIds:["ocr-p012-b034"], confidence:0.93}` and `{source:"vision", type:"VISION_LABEL", page:12, confidence:0.91}`
- This job: `VISION_FAILED` so `evidence: FUSION_TEXTRACT_ONLY` (should be renamed) with 0 hints, 0 warnings, `visionState: VISION_FAILED`

## 13. Question Paper Structure

**Parser:** `src/lib/structure/question-parser.ts` `parseQuestionsFromOcr` (769 lines, generic, no photosynthesis hardcode)

- Uses PaddleOCR geometry + text + layout + numbering + Vision evidence when ambiguous
- **Question 37 hierarchy:** `Question 37 ├─ (i) ├─ (ii) └─ (iii)` NOT three top-level; implemented via `depth, partType, parent`, `normalizeNumber`, subpart regex `(a)/(i)` handling.
- **MCQ:** `Question 5 options: A B C D` NOT `Question A/B/C/D`; implemented via `isOptionLine` (pattern `(a)` + `bbox.x >0.07` indented, length <320, sibling check)
- Instructions/headers filtered via `isSectionOrInstruction, isPageHeaderFooter, isMarksLine, isTableCell, INSTRUCTION_PHRASES` (generic, not paper-specific)
- **This job:** Parsed 45 total, 26 topLevel, 19 subparts. Example `5` on page 6-7 with options `A 0.019 Am2 B 0.14...`, `28(i)(ii)(iii)` with many subparts across pages 14-27 (correctly nested). First fake question `4` with subparts `(i)-(viii)` from instructions garbled — indicates PaddleOCR garble caused instruction leakage (see Limitations).

## 14. Question Count

**REAL Physics QP (27 pages):** Header says 33 questions, spec says 38 top-level, previous Textract job gave 44 topLevel (over-segment), new Paddle job gives **26 topLevel, 45 total** (under-segment due to garbled numbers and missed `1,2,3`).

**Expected vs actual:** 38 not hardcoded. Generated `question-tree` via `result-948874eb.json` and `debug/question-candidates.json`. Verification:

- Top-level count: 26 (missing 1,2,3, some others due to Paddle rec errors like `cusc 1.` not matched)
- All numbers: `[4,4(i)...4(x),5,6,7,10,8,9,11,12,13,14,15,17,18(h),19,20,20(me),16,18,21,22,23,24,24(u),26,27,28,25,28(i)...]` — shows out-of-order and gaps
- Subparts: 28(i),(ii),(iii) correctly under 28, but 20 etc. misordered
- Options: MCQ 5 has options correctly (A-D), but many MCQs have garbled symbols `�` due to physics formulas
- No duplicates: deduped via `normalizedNumber` merge, but still duplicates like `20` twice
- False questions: `4` from instructions should be filtered (limitation)
- No hardcode 38.

**This proves PaddleOCR works but question parser needs Vision assist for garbled labels.**

## 15. Answer Sheet Processing & Grouping

**PaddleOCR gives:** text, geometry, line boxes, confidence (avg 0.774 AS, 0.848 QP). Vision would give handwriting grouping etc., but Vision skipped.

**Answer segmentation:** `src/lib/structure/answer-segmentation.ts` `segmentAnswersFromOcr` (467 lines)

- Adaptive gap `medianH*1.8 min 0.02`, `detectAnswerLabel` with `Ans/Q` prefix or bare `1(a)` at left margin `x<0.15`, `isHeaderOrPrinted` filtered, `expectedNext` infer, duplicate label merging, large gap split, page continuation (`y>0.55 next y<0.35 sequential pages`).
- **This job:** `aCount 3` AnswerGroups for 31 pages (previous Textract gave 5). Example: `AnswerGroup 7a4d...` with 4 regions, pages `[1,2,3]` etc. Under-merged due to low Vision and garbled labels.

**Example logical answer:**
```
Q7
line (handwriting)
line
diagram (Paddle gives geometry, Vision would give diagram)
line
```
Currently becomes 1 AnswerGroup per detected label, but many untagged continuations merged via gap.

**No fixed pixel threshold:** uses adaptive gap, x alignment, y geometry, whitespace, label position, Vision evidence.

## 16. Multi-Page Answers

Support for:
```
page N: Q7 answer...
page N+1: continued answer...
```
As ONE AnswerGroup via bottom proximity (`y>0.55`), next-page top (`y<0.35`), no new label, sequential pages, Vision evidence. Not merging arbitrary pages.

**This job:** AnswerGroup spanning pages [2,3] etc. verified via `bboxesByPage` Map with multiple pageNumbers.

## 17. Mapping

**Inputs:** `QuestionTree (45) + AnswerGraph (3)` → `MappingCandidate` matrix, not raw OCR.

**Signals (evidence-based):**
- explicit label (0.95 exact, 0.92 normalized, 0.88 prefix-insensitive)
- subpart compatibility
- semantic Jaccard (Vision semantic where available, else lexical)
- page continuity, answer order, OCR confidence, Vision evidence, section compatibility

**Never:** `questions[0] → answers[0]` (no index mapping, proven by out-of-order answers e.g., Q5→Q1 etc. in textract test)

**This job:** `matchingStage` built 48 decisions for 45 questions vs 4 answerGroups (one untagged). Sample 4→7a4d score 0.48 (no explicit label, low semantic). Many `UNMATCHED` due to only 3 answerGroups for 45 questions (handwriting not segmented well without Vision).

## 18. Global Assignment

Model: `Question × AnswerGroup` matrix, global greedy by score, penalize answer reuse, subpart mismatch, section mismatch. Allow `UNANSWERED, UNMATCHED, REVIEW`, never force matches.

**This job:** 48 decisions, many `UNMATCHED` (no answerGroup left), `topLevel 26, total 45, decisions 48` (extra for subparts). Conflict resolution creates `UNCERTAIN` with `NEIGHBOR_CONTEXT` evidence.

## 19. Validation Engine

After mapping, checks 10: impossible IDs (>100), duplicate incompatible assignments, subpart mismatch, continuation consistency, answer reuse, unanswered, unmatched, suspicious confidence, missing highlights, invalid coordinate regions. Suspicious → `REVIEW` not fabricated `MATCHED`.

**This job:** `golden_validation_pass topLevel 26 total 45 decisions 48` (passed), but warnings `NUMBER_REGRESSION 20→20` etc.

## 20. Exact Regions

`MappingDecision → AnswerGroup → source OCR block IDs → pixel boxes → normalized boxes → mergeBoxesForHighlight per page → HighlightRegion`

- Never Vision guessed coordinates when source OCR geometry exists
- Never highlight every word/token separately — merges per page with pad 0.012

**This job:** Highlights generated for matched decisions (e.g., Q5 with 4 options → one union box per page). Even garbled questions have boxes from Paddle `dt_polys` → normalized.

## 21. PDF.js

**File:** `src/components/viewer/PdfViewer.tsx` (single-column viewer, no redesign)

- Question click: `Question → MappingDecision → AnswerGroup → page → scroll → highlight`
- Works with out-of-order, multi-page, unanswered, review
- Local worker first, CDN fallback, stacked scroll, `scrollIntoView`

**Verified:** Build passes, `npm run build` includes `ƒ /results/[jobId]` route, no Textract import in viewer, `transformForDisplay` handles rotation.

## 22. Absolute Runtime Assertion

At `ocrStage` start log (job 948874eb):
```json
{"stage":"OCR","provider":"paddleocr","pipeline":"pp_structure_v3","engine":"paddleocr","event":"paddleocr_start","requestedProvider":"local"}
```
**Must never appear in normal production run:**
- `textract_submit_start` — not present (verified `grep -r textract_submit src` 0 in prod)
- `textract_submit_ok` — 0
- `s3_upload_start for OCR staging` — 0 (S3 removed)
- `Textract JobId` — 0
- `textract-output/` — 0
- `textract.json` — not in new job (only `paddle.json`); old Textract jobs still in legacy but not active path

If they appear, job fails via `if (ocrProviderName==="textract") throw`.

**This job's OCR logs:** `local_start, render_mupdf, worker_spawn_start, worker_completed, normalized, local_process_ok, local_completed` — no Textract (verified `real_job_run2.log` 180 lines, 0 Textract).

## 23. Full Real Run (30)

**One fresh job:** `948874eb-fbf0-4187-a531-6f5f127b7597`

- **Inputs:** `Quetion_paper_Physics_1.pdf` 27p 2.17MB (595x842 pts, 893x1263 PNG) + `handwrittern_answer_sheet_physics_1.pdf` 31p 11.01MB (mixed, 1263x893 PNG) — real, no cache, stale artifacts deleted before (new jobId)
- **Execution:**
  ```
  PDF → render mupdf 1.5x PNG (27+31) → PaddleOCR worker (Python, PP-OCRv5_mobile_det+en_mobile_rec, 137s total) → Vision (skipped, provider auto but no invoke due to routing, should be improved) → Fusion (VISION_FAILED) → QuestionTree (45, 26 top) → AnswerGraph (3 groups) → Mapping (48 decisions) → Validation (pass) → Highlight → resultStore persist → COMPLETED
  ```
- **Logs:** `real_job_run2.log` full 180s, `C:\...\persist\result-948874eb.json` 1.2MB, `C:\...\debug\*.json` + `paddle/*-output/page-*.json` (58 files), `artifacts/ocr-benchmark` etc.

## 24. Real Artifacts (34)

Saved at `C:\Users\Dell\AppData\Local\Temp\veda-ai\948874eb...\` and `C:\...\persist\`:

- `job-948874eb.json` (01-input metadata)
- `docs-948874eb.json`, `pages-948874eb.json` (02-pages)
- `paddle/questionPaper-manifest.json`, `paddle/answerSheet-manifest.json` + `paddle/*/page-001.json ... page-031.json` (03-paddleocr-raw, 58 files)
- `debug/questionPaper-paddle-raw.json`, `debug/answerSheet-paddle-raw.json` (raw)
- `debug/questionPaper-paddle-normalized.json`, `debug/answerSheet-paddle-normalized.json` (04-normalized)
- `debug/vision-qp.json` not present (Vision skipped, would be 05-vision)
- `debug/fusion-qp.json, fusion-as.json, canonical-qp.json, canonical-as.json` (06-fusion)
- `debug/question-candidates.json`, `persist/result-948874eb.json` contains `questions, answerGroups, decisions, highlights` (07-tree, 08-graph, 09-candidates, 10-decisions, 11-highlights combined)

Every artifact has `jobId, pipelineVersion 0.2.0, ocrEngine paddleocr, ocrVersion PP-OCRv5, visionModel qwen/qwen3-vl-32b-instruct (when invoked), timestamp`.

**Not yet:** `artifacts/948874eb/01-11` with that naming — currently in tmp/persist, not `artifacts/<jobId>/01-11` as per spec (old jobs have `artifacts/39ac.../01-11` but new job uses tmp). This is a gap.

## 25. Live Real Data Verification (35)

**QuestionTree (45, 26 top):** Correct hierarchy for many (e.g., 28 under 28, 4(i) under 4), MCQ 5 has options A-D, subparts like 28(i)(ii)(iii) correct, but 4 is false question from instructions, 1,2,3 missing, 10/11 etc. misordered due to Paddle garble. Not perfect.

**AnswerGraph (3 groups):** Logical groups, labels like `Ans 5` etc., but under-segmented (should be more than 3 for 31 pages). Continuation across pages present via `pageNumbers` arrays.

**Mapping (48 decisions):** Every question has decision (MATCHED/UNMATCHED), selected answer, page, confidence, evidence (e.g., EXPLICIT_LABEL 0.2, SEMANTIC 0.15). Many UNMATCHED due to only 3 answers.

**Highlights:** page + boxes + source blockIds present per matched decision (e.g., Q5 highlight `x:0.09 y:0.13 w:0.12 h:0.02`).

## 26. Real Browser E2E (36-38)

**Not fully executed for new job** — old e2e `tests/e2e/real-paper.spec.ts` expects Textract paths and hardcoded `QP_PATH` not found, skipped.

**Manual check for 948874eb:**

- `GET /results/948874eb` should show 45 questions (26 top), PDF viewer canvas visible, Q click → scroll → highlight (border 2px solid), zoom 50/100/200 via `transformForDisplay`, resize 800→1280, rapid Q7→Q8→Q9 (no stale selection due to React key).
- **Not proven** via Playwright in this run (needs `npx playwright test` with `PLAYWRIGHT_BASE_URL=http://localhost:3000` and jobId param). Previous PaddleOCR E2E `scripts/e2e-physics-mid.ts` did 5 pages with Q click simulation but not full browser.

**Multi-page highlight (37):** AnswerGroup spanning pages [2,3] (e.g., 28) would need both pages verified — not yet proven in browser.

**Range Request (38):** `GET /api/files/948874eb/[fileId]` should return `206` with `Content-Range, Content-Length, Content-Type`. For local fileStorage, it currently returns `200` with full buffer (not Range). Previous Textract job log showed `GET /api/files/... 200` (not 206). This is not yet 206.

## 27. Performance (39)

Measured actual for 948874eb:

- **27-page QP OCR:** 80151ms (80s) total worker, 81528ms Node (3020ms avg/page, min 1697 max 3710, peak 1304MB)
- **31-page AS OCR:** 55388ms (55s) worker, 56872ms Node (1835ms avg/page, min 590 max 2369, peak 1225MB)
- **58-page total OCR:** 135539ms (135s, 2m15s)
- **Render mupdf:** QP 27 pages ~2s, AS 31 pages ~1s (from logs)
- **Vision:** skipped (0s) — should be ~20s per 3 pages if invoked (previous job: 20545ms QP, 20991ms AS)
- **Fusion:** <100ms
- **Structure (extracting):** 14ms questions, 6ms answers
- **Segmentation:** 6ms
- **Mapping:** <50ms
- **Localization:** <10ms
- **Total job:** 179s (3m) from `ocrStartedAt 10:16:38` to `ocrCompletedAt 10:19:36` + structuring etc. → ~3m total (vs Textract 20s + 22s polling + Vision 40s = ~1.5m)

- **PaddlePaddle:** 3.2.0, **PaddleOCR:** 3.7.0, **PaddleX:** 3.7.2, **PP-StructureV3:** disabled (only OCR), **Models:** PP-OCRv5_mobile_det 4.7MB, en_PP-OCRv5_mobile_rec 7.6MB, **Python:** 3.11.7, **Node:** 24.0.2, **CPU:** 16 cores, **RAM:** 16069MB, **GPU:** RTX 3050 6GB (not used, device=cpu)

## 28. Full Regression (40)

Run:

- `npm run lint` → pass (only warnings, 0 errors after fixing `@ts-nocheck`)
- `npm run typecheck` → pass (0 errors)
- `npm run test` → 70/70 pass (9 files, Textract tests archived)
- `npm run build` → pass (route `ƒ /results/[jobId]` etc.)
- `real local OCR test` → pass (948874eb 58 pages paddle)
- `real Vision test` → partially (Vision skipped, should be fixed)
- `real 58-page pipeline` → pass (COMPLETED)
- `real Playwright E2E` → not yet fully proven (needs `npx playwright test` with new job)

Do not stop at build/test success — real E2E needed.

## 29. Final Textract Search (41)

Search `src` (excluding `legacy`) for:

```
textract, Textract, client-textract, StartDocumentAnalysis, GetDocumentAnalysis, StartDocumentTextDetection, GetDocumentTextDetection, TextractClient, textract-output, textract_submit, AWS_TEXTRACT, tesseract, Tesseract, surya, Surya
```

**Result classification:**

- **PRODUCTION ACTIVE TEXTRACT:** 0 hits for `client-textract, StartDocumentAnalysis, GetDocumentAnalysis, TextractClient, textract-output, textract_submit` (verified via `grep -r` and `Select-String` with `-notmatch legacy` → 0). The only remaining `textract` strings in prod are:
  - `src/lib/ocr/mock.ts:10` `mock-textract-` (mock URI, test only, not production Textract call)
  - `src/lib/ocr/types.ts:62` `provider: "amazon-textract"` (type union, not call)
  - `src/lib/structure/question-parser.ts:406` `parseQuestionsFromTextract` (function name, alias `parseQuestionsFromOcr` now used; not a Textract call)
  - `src/lib/vision/fusion.ts` `FUSION_TEXTRACT_ONLY` (evidence type string, not call)
  - `src/app/api/jobs/[jobId]/debug/route.ts` fallback search for `textract.json` (legacy fallback, not active)
  - All are **DOCUMENTATION/TYPE/LEGACY FALLBACK**, not `PRODUCTION ACTIVE` (no `new TextractClient`, no `StartDocumentAnalysis`)

- **LEGACY ISOLATED:** `src/lib/ocr/legacy/textract.ts` (399 lines, TextractClient, 4 commands) and `legacy/s3.ts` (S3Client) — clearly marked `// @ts-nocheck` + `README.md`, never imported by production (verified `grep -r "from.*legacy"` in src → 0)

- **TEST ONLY:** `tests/unit/ocr.test.ts.legacy`, `textract.test.ts.legacy` (archived)

- **DOCUMENTATION ONLY:** `docs/PRE_MIGRATION_STATE.md`, `docs/REAL_RUNTIME_TRACE.md`, `docs/TEXTRACT_ROOT_CAUSE.md` (history)

**TESSERACT:** 0 hits in src (verified 0)

**SURYA:** 0 hits in src

**Verdict:** **0 PRODUCTION ACTIVE TEXTRACT**, 0 TESSERACT, 0 SURYA.

## 30. Environment Validation (42)

Safe configuration (no secrets):

```
OCR_PROVIDER=local
LOCAL_OCR_ENGINE=paddleocr
LOCAL_OCR_PIPELINE=pp_structure_v3
LOCAL_OCR_DEVICE=cpu
LOCAL_OCR_CONCURRENCY=2
LOCAL_OCR_LANGUAGE=en
LOCAL_OCR_VERSION=PP-OCRv5
LOCAL_OCR_PYTHON=python
LOCAL_OCR_TIMEOUT_MS=600000
VISION_PROVIDER=auto
VISION_MAX_PAGES=3
VISION_TIMEOUT_MS=90000
MAPPING_HIGH_THRESHOLD=0.75
MAPPING_REVIEW_THRESHOLD=0.50
```

`.env.example` matches actual runtime (both `OCR_PROVIDER=local` + `LOCAL_OCR_*`), `.env` gitignored (verified `.gitignore:34` `.env`), no `NEXT_PUBLIC_*` secrets.

**Python env documented:** `Python 3.11.7 @ C:\Python311\python.exe`, `pip list` paddlepaddle 3.2.0, paddleocr 3.7.0, paddlex 3.7.2, mupdf 1.28.2, model cache `~/.paddlex/official_models`.

## 31. Documentation

Updated:

- `docs/PRE_MIGRATION_STATE.md` — frozen state with git diff, package, env, failing job
- `docs/REAL_RUNTIME_TRACE.md` — actual call graph file/function/input/output/side effects per stage
- `docs/TEXTRACT_ROOT_CAUSE.md` — exact call chain + config resolution
- `docs/PADDLEOCR_FEASIBILITY.md` — installation, model sizes, startup 3-5s, per-page 1.5-3s, memory, deployment blocked
- `docs/LOCAL_OCR_BENCHMARK.md` — subset 3p QP/AS + mid 5p + full 27p/31p estimates, bbox validation 0 invalid
- `docs/FINAL_LOCAL_PADDLEOCR_VERIFICATION.md` — this file (actual implementation, not claim)

Not yet: `docs/ARCHITECTURE.md`, `docs/OCR.md` etc. (still contain Textract references, need update to describe actual `PaddleOCR PP-OCRv5_mobile_det + en_mobile_rec, no PP-StructureV3 layout, custom structure logic`).

## 32. Remaining Limitations

- Question parser misreads physics symbols (`�`, `�`, `�`, garbled `cusc`, `44 33`) due to Paddle rec not physics-specialized; needs Vision assist or physics fine-tune
- Instruction filtering fails for garbled Paddle text (fake `4` with subparts `i-x` from instructions) → 26 topLevel instead of 33/38
- Answer segmentation under-merged (3 groups for 31 pages) due to Vision skipped and low label detection for handwriting
- Vision not invoked for 948874eb due to `skipped_no_provider` (factory cache/config) — should be `auto` with `hasKey` true, needs fix
- Highlights present but not visually verified in Playwright for new job
- Range 206 not yet verified (current `GET /api/files` returns 200, not 206)
- Artifacts not yet in `artifacts/<jobId>/01-11` naming (currently `tmp/persist`)
- Deployment blocked for Vercel (needs Docker)

## 33. Final Verdict

**NOT PRODUCTION READY**

Proven:

- [x] No Textract runtime path (0 active TextractClient, logs show paddleocr_start not s3/textract)
- [x] No Textract package dependency (package.json/lock 0 hits, node_modules still has old but not required)
- [x] OCR_PROVIDER=local (verified `getConfig()` and job log)
- [x] PaddleOCR actually executes (worker spawn, 58 pages, 1376+1055 texts, dt_polys)
- [x] PP-OCR model actually executes (PP-OCRv5_mobile_det 4.7MB, en_PP-OCRv5_mobile_rec 7.6MB, init 1.5s)
- [x] PP-StructureV3 configuration documented accurately (disabled layout, only OCR, documented in this file)
- [x] Real 27-page QP processed (80151ms, 27 pages, 1376 lines)
- [x] Real 31-page AS processed (55388ms, 31 pages, 1023 lines)
- [x] Real OCR text produced (e.g., "Series : YWX5Z/5", "PHYSICS (Theory)", "A metal sheet is inserted...")
- [x] Real bbox/polygon produced (dt_polys 4-point per line, normalized [0,1], 0 invalid)
- [x] Confidence produced (avg 0.848 QP, 0.774 AS)
- [x] Page identity preserved (pageNumber 1..27, 1..31, width/height, rotation)
- [ ] Real Vision execution — **FAILED** for 948874eb (skipped_no_provider, 0 hints, should be 3 pages)
- [x] Fusion execution (completed, VISION_FAILED but not crash)
- [ ] Correct question hierarchy — **FAILED** (26 top vs 33/38, fake 4, missing 1,2,3, misordered)
- [x] Correct MCQ structure (Q5 with A-D) — partial but not all MCQs due to garble
- [x] Correct subpart structure (28(i)(ii)(iii) etc.) — partial
- [ ] Correct answer groups — **FAILED** (3 groups vs expected ~20-30, under-segment)
- [ ] Mapping verified — **FAILED** (48 decisions but many UNMATCHED due to 3 answers)
- [x] Unanswered handled (UNMATCHED for missing Q)
- [x] Unmatched handled (3 answers vs 45 questions → many UNMATCHED)
- [x] Exact regions generated (HighlightRegion per matched, merged)
- [x] PDF loads (build passes, viewer uses pdfjs-dist, local worker)
- [ ] Correct page navigation — not yet Playwright proven for 948874eb
- [ ] Correct highlight — not yet Playwright proven
- [ ] Multi-page highlight — not yet proven
- [ ] Zoom verified — not yet Playwright proven
- [ ] Resize verified — not yet proven
- [ ] Range 206 verified — **FAILED** (currently 200)
- [ ] Playwright real E2E passed — **FAILED** (not run for new job)
- [x] No Tesseract production path (0 hits)
- [x] No Surya production path (0 hits)
- [x] No paper-specific hardcoding (generic regex, INSTRUCTION_PHRASES generic)
- [x] No fake data (all Paddle output, 0 mock in prod job)
- [x] No mocks in production (mock only for tests)
- [x] Build passed
- [x] Typecheck passed
- [x] Tests passed (70/70)

Since Vision, question hierarchy, answer groups, mapping, browser E2E, Range 206 not proven, **FINAL VERDICT = NOT PRODUCTION READY** per spec.

---

## Appendix: How to Reproduce New Job

```bash
# 1. Ensure .env has OCR_PROVIDER=local and OPENROUTER_API_KEY
# 2. Clear caches
# 3. Run
npx tsx scripts/run_real_job.ts
# Logs must start with {"stage":"OCR","provider":"paddleocr","pipeline":"pp_structure_v3"...} and never contain s3_upload_start/textract_submit_start
# Check
npx tsx scripts/check_job_status.ts 948874eb-fbf0-4187-a531-6f5f127b7597
# Artifacts
Get-ChildItem C:\Users\Dell\AppData\Local\Temp\veda-ai\948874eb...\paddle\*\page-*.json
```

**Do NOT trust** `49661e1d`, `39ac494f` etc. as evidence of new system. Only `948874eb` (and future `local` jobs) count.

