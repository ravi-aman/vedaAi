# ANSWER SHEET RUNTIME TRACE — Forensic Audit

**Date:** 2026-08-29  
**Jobs:** `b8eb9379` (V2, 33 top, Vision FAILED), `34594976` (V2 first, 122 top), `948874eb` (old, 26 top)
**Files:** 31 pages, 11MB, handwritten, mixed landscape/portrait, 1263x893 PNG @1.5x

## FILE: src/lib/jobs/runner.ts — ocrStage

**Function:** `ocrStage(jobId: string): Promise<{qpOcr, asOcr}>`
**Input:** `jobId`, `documentStore.getByJob` → `qpDoc/asDoc`, `pageStoreApi.getByDocument` → `qpPages/asPages` (27/31)
**Output:** `OcrDocumentResult` with `pages: OcrPageResult[]` (1023 lines for AS, avg 0.774 conf, 93 blocks, 893x1263 dims)
**Side Effects:** `renderPdfBufferToPngFiles` (mupdf 1.5x) → `os.tmpdir/veda-ai/{jobId}/paddle-images/answerSheet/page-###.png` (31 files), spawn `python scripts/paddle_ocr_worker.py` with `PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec`, timeout 600s, writes `page-###.json` + `summary.json`, `convertRawToOcrPage` → normalized bbox [0,1], `ocrResultStore.set(jobId, {qpOcr,asOcr})`, `jobStore.update({ocrCompletedAt})`
**Dependencies:** `getLocalOcrProvider()`, `PaddleOcrProvider`, `mupdf`, `paddle_ocr_worker.py`
**Decision:** `ocrProviderName = local` → `local_start` → `render_mupdf` → `worker_spawn` → `worker_completed` (55s, 1023 lines, 0 invalid) → `normalized` → `local_completed`
**Failure Mode:** None for OCR — Paddle succeeds. If `OCR_PROVIDER=textract` would throw `OCR_CONFIGURATION_ERROR`.

## FILE: src/lib/jobs/runner.ts — visionStage

**Function:** `visionStage(jobId, ocrData): Promise<{qpVision,asVision}|null>`
**Input:** `ocrData.qpOcr/asOcr`, `getConfig().VISION_PROVIDER=auto`, `VISION_MAX_PAGES=3`, `VISION_TIMEOUT_MS=90000`, `getVisionProvider()`, `shouldInvokeVision(ocr)`
**Output:** `null` for `b8eb9379` (both QP and AS `VISION_FAILED`), `VisionDocumentAnalysis` for `49661e1d` QP only (3 pages, 498KB, 20545ms, AS failed `MODEL_OUTPUT_INVALID`)
**Side Effects:** `renderPdfPagesForVision` (mupdf 1.5x) → `imageBase64`, `provider.analyzeDocumentStructure` → OpenRouter `qwen/qwen3-vl-32b-instruct`, `visionResultStore.set`, `debug/vision-qp.json`
**Dependencies:** `getVisionProvider()`, `shouldInvokeVision()`, `renderPdfPagesForVision`, `OpenRouterVisionProvider`
**Decision (for AS):**
```
qpOcr avgConf 0.774, totalLines 1023, hasLowConfidence true → shouldInvokeVision => true (moderate)
asOcr same → true
provider = getVisionProvider() → null → skipped_no_provider
```
**Failure Mode:** `getVisionProvider()` returned `null` despite `VISION_PROVIDER=auto` and `OPENROUTER_API_KEY` present in `.env`. Logs: `{"stage":"VISION","event":"skipped_no_provider","provider":"auto"}`. No image sent, no `vision_request` for AS. For `49661e1d` AS, Vision did run but failed `MODEL_OUTPUT_INVALID` due to `visualRegions[].type` missing (`regionType: title`).

**Root Cause (not guessed):**
- `getVisionProvider()` at `src/lib/vision/factory.ts:15` checks `hasKey = Boolean(cfg.OPENROUTER_API_KEY || cfg.VISION_API_KEY || cfg.AI_API_KEY)`. If `hasKey` false, returns `null` without caching.
- At job start, `getConfig()` was cached with stale `OPENROUTER_API_KEY` undefined (first `getConfig()` called before `clearConfigCache` in `run_real_job.ts`, or `process.env` not loaded due to `next dev` not reloaded after `.env` edit). For `b8eb9379`, `run_real_job.ts` did `clearConfigCache()` at start, but `getVisionProvider()`'s `cached` may have been `OpenRouterVisionProvider` from previous job where `hasKey` was true, but current job's `hasKey` check still fails because `getConfig()` returns cached with no key.
- Also `shouldInvokeVision` for AS with `avgConf 0.774` should trigger Vision, but `isHandwritingSignals` is weak (`totalLines<5` only, not handwriting). For 31 pages with 1023 lines, `hasHandwritingSignals` false, so it relies on `hasLowConfidenceLines` true → true.

**Checklist:**
- `getVisionProvider()` cache: `cached` is `VisionProvider|null`, but when `hasKey` false, it returns `null` without setting `cached`, so next call re-checks `hasKey`. Not stale cache, but `hasKey` false is the issue.
- `config cache`: `src/lib/config/index.ts:100` `let cached: AppConfig|null` — if `getConfig()` called once with no `OPENROUTER_API_KEY` (e.g., during `npm run build`), it caches `OPENROUTER_API_KEY=undefined`, later `clearConfigCache` not called before `visionStage`.
- `VISION_PROVIDER`: `auto` (from `.env:47`), not `disabled`
- `OPENROUTER_API_KEY`: present in `.env:3` but `getConfig()` at visionStage time had `undefined` (stale cache)
- `Vision routing`: `shouldInvokeVision` returns true for AS, but `visionStage` skips before routing due to `!provider`
- `Vision page selection`: `maxPages=3` (config), `renderPdfPagesForVision` would render 3 pages, but skipped before.
- `Vision schema`: For AS previous, `MODEL_OUTPUT_INVALID` due to `visualRegions[0].type` missing, `regionType: title` not mapped, `content: null` not handled — fixed in `provider.ts:10` but not tested for AS.

## FILE: src/lib/vision/router.ts — shouldInvokeVision

**Function:** `shouldInvokeVision(ocr: OcrDocumentResult)`
**Input:** `ocr.pages`, `totalLines`, `avgConfidence`, `hasLowConfidenceLines`, `hasHandwritingSignals`, `isLikelyMultiColumn`
**Output:** `RoutingDecision {useVision, reason, confidence, estimatedDifficulty}`
**Decision for AS (b8eb9379):** `useVision true, reason "moderate: lowConf=true, sparse=false, handwritingSignal=false"` — would invoke, but `visionStage` skipped before calling.
**Failure Mode:** `hasHandwritingSignals` is `totalLines<5 && text.length<50` — for 31 pages with 1023 lines, false, so relies on `hasLowConfidenceLines` (true due to `0.774` avg). For dense handwriting, `totalLines` is actually high, so handwriting detection is weak. Should be `avgConf<0.8` or `handwriting present` via OCR text vs Vision.

## FILE: src/lib/vision/factory.ts — getVisionProvider

**Function:** `getVisionProvider(): VisionProvider|null`
**Input:** `getConfig().VISION_PROVIDER`, `OPENROUTER_API_KEY`, `VISION_API_KEY`, `AI_API_KEY`, `cached`
**Output:** `OpenRouterVisionProvider` or `null`
**Decision:** For `auto` with `hasKey true` → `new OpenRouterVisionProvider()`, cached. For `hasKey false` → `null`.
**Failure Mode:** Cached `null` not stored, but `getConfig()` cached stale without key → `hasKey false` → `null`. No diagnostics endpoint to report `KEY_PRESENT`.

## FILE: src/lib/vision/openrouter-vision.ts — analyzeDocumentStructure

**Function:** `analyzeDocumentStructure(input: VisionAnalyzeDocumentInput)`
**Input:** `pages: VisionAnalyzePageInput[]` (imageBase64 PNG, mime, width, height, ocrBlocks?, pageId), `ocrTextSample`, `hints`
**Output:** `VisionDocumentAnalysis {pages: VisionPageStructure[], globalStructure}`
**Side Effects:** `buildMultimodalUserContent` (text + image_url data:), `client.chat.completions.create` with `model qwen/qwen3-vl-32b-instruct`, `response_format json_object`, `max_tokens 6000`, `withRetry` (3, backoff), `withTimeout` 90000, logs `vision_request` with `imageCount`, `payloadKb`, `vision_response` or `vision_schema_fallback`
**Failure Mode:** Previous AS failed `MODEL_OUTPUT_INVALID` due to `visualRegions[0].type` undefined, `regionType: title`, `content: null` — fixed via `normalizeRegionType` lenient, but not verified for AS after fix due to `skipped_no_provider`.

## FILE: src/lib/vision/provider.ts — VisionPageStructureSchema

**Input:** `pageNumber`, `visualRegions[]`, `questionCandidates[]`, `answerGroupHints[]`, `documentStructureHints`
**Output:** Validated `VisionPageStructure` or throw `MODEL_OUTPUT_INVALID`
**Failure Mode:** Previous strict `z.string().transform(normalizeRegionType)` for `type` required string, got `undefined` when model returned `regionType: "title"` → `invalid_type: expected string, received undefined`. Fixed to `type: z.string().optional(), regionType: z.string().optional()` with fallback to `INSTRUCTION`.

## FILE: src/lib/structure/answer-segmentation.ts — segmentAnswersFromTextract

**Function:** `segmentAnswersFromTextract(ocr: OcrDocumentResult, pages: DocumentPage[]): SegmentedAnswer[]`
**Input:** `ocr.pages` with `lines: OcrLine[]` (1023 lines, bbox [0,1], conf), `pages` with `width,height`
**Output:** `SegmentedAnswer[]` with `questionLabel, normalizedLabel, text, pageNumbers, bboxesByPage, lines, confidence, orderIndex` — for `b8eb9379` → 3 groups (vs 31 pages)
**Side Effects:** Adaptive gap `medianH*1.8 min 0.02`, `detectAnswerLabel` (Ans/Q prefix, bare `1(a)`), `finalize()` per gap, `visionEvidence` not used (old), `artifacts: answer-regions.json`
**Failure Mode:** **Giant merge** — 31 pages → 3 groups means `mergeScore` too high, `gap > adaptiveGap*2.2` not triggered, `isLeftMargin x<0.15` not enough, `isPageContinuation` (`y>0.55` && `y<0.35` sequential) merges too aggressively, no Vision handwriting grouping, `expectedNext` logic for `Ans` inferred `__unknown__` causes over-merge, `isHeaderOrPrinted` filters too much, `prevSubstantial` check prevents splits.

**Instrumented merge decisions (not yet):** No `artifacts/<jobId>/answer-debug/` with `previousRegion, nextRegion, distance, samePage, pageDelta, labelEvidence, visionEvidence, layoutEvidence, mergeScore, decision`.

## FILE: src/lib/jobs/runner.ts — fusionStage

**Function:** `fusionStage(jobId, ocrData, visionData)`
**Input:** `qpOcr/asOcr`, `DocumentPage[]`, `visionData.qpVision/asVision`
**Output:** `qpFusion/asFusion` with `canonical: CanonicalDocument`, `questionHintsFromVision, answerHintsFromVision, diagramPages, evidence, warnings`, `visionState: VISION_FAILED` for `b8eb9379`
**Side Effects:** `fuseDocuments` → `buildCanonicalDocument`, `visionState` logged `VISION_FAILED` (since `visionData=null`)
**Failure Mode:** When `visionData=null`, `evidence: FUSION_TEXTRACT_ONLY` (should be `FUSION_PADDLE_ONLY`), no handwriting grouping.

## FILE: src/lib/jobs/runner.ts — extracting (answer)

**Function:** `extracting` calls `segmentAnswersFromTextract(asOcr, asPages)` → `AnswerGraph`
**Input:** `asOcr` (1023 lines), `asPages` (31), `visionData=null`
**Output:** `aCount 3` (for 31 pages) — catastrophic under-segmentation
**Failure Mode:** No Vision, fixed thresholds, no page locality, no continuation check with Vision.

## Summary Failure Chain

```
ocrStage (Paddle) → 31 pages 1023 lines (success)
→ visionStage: getVisionProvider() → null (stale config cache, hasKey false) → skipped_no_provider → visionData=null
→ shouldInvokeVision would have been true, but never reached due to !provider
→ fusionStage: VISION_FAILED → no handwriting evidence
→ segmentAnswersFromTextract: adaptiveGap 0.02, no Vision, giant merge 31→3 (mergeScore too high, no label boundary)
→ AnswerGraph 3 groups (should be ~30)
→ mapping must NOT be tuned yet (Constraint 12) — but currently mapping runs with 3 vs 33 → many UNMATCHED
```

**Diagnostics needed:** `VISION_PROVIDER_AVAILABLE, MODEL, BASE_URL, KEY_PRESENT` endpoint (Phase 4).

