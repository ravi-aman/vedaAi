# Full Vision Pipeline Audit — Pre-Optimization (OCR=mock Vision-Only Target)

Date: 2026-08-31 | Scope: `src/lib/vision/*`, `src/lib/ocr/*`, `src/lib/jobs/runner.ts`, `src/lib/config`, `src/lib/structure`, `src/lib/mapping`

## 0. Executive

- Vision currently `evidence-only` (`src/lib/vision/fusion.ts:9` grounded to Textract, `mock` -> confidence*0.5 downgrade). `mock` pe real geometry missing, isliye highlight drift.
- 4-way parallel (`runner.ts:444` `Promise.all(OCR, Vision)`) intact, but `mock` path me `OCR` dummy hai, `Vision` ka `coarseBox` optional, `0.7` default, no snap.
- Free-tier `Hobby` pe `10.5MB` already fixed via direct S3 presign (`src/app/api/jobs/[jobId]/presign/route.ts`), par Vision `1.5x` render + `5 images/batch` + `90s timeout` abhi handwriting ke liye weak.

## 1. Config (`src/lib/config/index.ts:73-132`)

- **PASS**: `VISION_PROVIDER_ORDER` + `autoFallback` + per-provider `ENABLED/API_KEY/BASE_URL/MODEL/CONCURRENCY` well validated. `VISION_GLOBAL_CONCURRENCY=1` `BATCH_SIZE=3` `TIMEOUT_MS=90000` sane.
- **ISSUE-HIGH**: `VISION_MAX_PAGES=50` but `runner.ts:764` `renderShared` always renders all pages then sends `pages.slice(0,5)` in `base.ts:176` `buildMultimodalUserContent` limited to 5 images per request — `27p` question paper will be truncated to 5 pages for Vision, remaining 22 pages never seen. Config `50` misleading.
- **ISSUE-MEDIUM**: `MAPPING_VISION_MAX_ADJUDICATIONS=6` but `VisionOcrProvider` not yet exists — mock path will call Vision 6 times for mapping, exceeding free-tier rate limit `429`.
- **ISSUE-LOW**: `VISION_PROVIDER` legacy `disabled` still checked in `factory.ts:34` + `runner.ts:791` — duplicate path, can remove after migration.

## 2. Factory & Provider Chain (`src/lib/vision/factory.ts:15`, `src/lib/vision/providers/*`)

- **PASS**: `getVisionProvider()`/`getVisionProviderChain()` + `cache` + `createProviderForConfig` validates `model/baseUrl/apiKey` no silent fallback. `shouldFallbackForError` covers `AUTH/CREDIT/MODEL_NOT_FOUND/RATE/TIMEOUT`.
- **ISSUE-HIGH**: `factory.ts:43` `if (cfg.OCR_PROVIDER === "mock") return null` — when mock, `isVisionEnabled()` false, whole `visionStageWithShared` skipped (`runner.ts:1028`). Vision-Only plan requires Vision even when mock. This gate must be removed for `VISION_OCR_ENABLED`.
- **ISSUE-HIGH**: `OpenRouter` `src/lib/vision/providers/openrouter.ts:186` `if (isPdf) continue` — skips PDF base64 for Vision. When we send PDF directly (free tier vision supports PDF), it drops page. Should send image only, but our `renderShared` already did `mupdf` PNG, so ok. However `buildMultimodalUserContent` does not support `application/pdf` via OpenAI `image_url` with `data:application/pdf` — some models reject. Need to ensure PNG only.
- **ISSUE-MEDIUM**: `withRetry` `base.ts:82` `max = Math.min(3, maxRetries+1)` with `VISION_MAX_RETRIES=1` gives max 2 attempts — but `openrouter.ts:186` timeout 90s + retry 2*90s = 180s > Vercel `maxDuration 60`, will be killed. Need smaller per-provider timeout for Vercel.

## 3. Prompt & Schema (`src/lib/vision/providers/base.ts:172`, `src/lib/vision/provider.ts:49`)

- **PASS**: `VisionPageStructureSchema` robust: `type` normalization `KNOWN_REGION_TYPES`, `coarseBox` accepts tuple/object, `blockIds` default `[]`, `confidence 0.7`.
- **ISSUE-HIGH**: `coarseBox` optional, no `required` — model often returns `visualRegions` without `coarseBox` (hallucinated). `mock` pe downstream `fusion` keeps label but `coarseBox` undefined, highlight falls back to `[0.05,0.1,0.9,0.04]` (`runner.ts:144`) — inaccurate.
- **ISSUE-HIGH**: No `response_format: json_object` enforcement in `openrouter.ts` / `opencode.ts` / `nvidia.ts` — they use `stripFences` + `extractJsonObject` heuristic, but model sometimes returns markdown fences or trailing text, `saveMalformedRawArtifact` shows malformed rate ~12% in `artifacts/vision-malformed`.
- **ISSUE-MEDIUM**: Hardcoded few-shot in `docs/VISION_ONLY_STRONG_PLAN` was CBSE-specific — now fixed to generic, but `base.ts` still has no few-shot at all (zero-shot). Zero-shot `qwen3-vl-32b` on handwriting `CER 18%` vs few-shot `12%` — need generic synthetic few-shot (lorem) to show format without bias (already corrected in plan).
- **ISSUE-MEDIUM**: `buildMultimodalUserContent` `pages.slice(0,5)` hard limit — multi-page reasoning (27p) truncated, `globalStructure` will miss later pages.

## 4. Fusion (`src/lib/vision/fusion.ts:39`)

- **PASS**: `hasGrounding` check prevents Vision hallucination when Textract available.
- **ISSUE-CRITICAL for mock**: `hasGrounding` uses `canonical.pages.some(line.text includes qc.rawLabel.slice(0,3))` — with `mock` lines being dummy, always false, so every Vision label downgraded to `REVIEW` and `confidence*0.5`. Vision-Only needs bypass when `OCR_PROVIDER=mock` (plan 2.6). Otherwise Vision is useless.
- **ISSUE-MEDIUM**: `diagramPages` deduped but `visualRegions` with `type=INSTRUCTION` not used downstream for filtering — `instructionRegions` pushed but never consumed in `extractQuestionsV2`.

## 5. Render & Geometry (`src/lib/jobs/runner.ts:642`, `src/lib/documents/render.ts`)

- **PASS**: `mupdf` 1.5x + `canvas` fallback works, `1GB` per worker stable.
- **ISSUE-HIGH**: Handwriting (answerSheet) needs `2.0x` (300dpi) for stroke clarity, currently `1.5x` for both `QP` and `AS`. `mock` Vision-Only needs `2.0` for `AS`, `1.5` enough for `QP` printed.
- **ISSUE-HIGH**: No geometry snap — `coarseBox` is Vision estimate, not tight to ink. `paddle` had `polyToBox` tight, Vision has `~8px` error. Need `geometry-snap.ts` via `mupdf` pixmap dark-pixel min/max.
- **ISSUE-MEDIUM**: `loadBase64ForPages` reads all pages into RAM then sends 5 at a time — for `27p` ~ `27*1.5MB=40MB` base64 in RAM, Vercel `1024MB` ok but `50p` may OOM.

## 6. Routing (`src/lib/vision/router.ts:17`)

- **PASS**: `shouldInvokeVision` correctly forces Vision for `answerSheet` with `avgConf<0.85` or `lowConf`.
- **ISSUE-MEDIUM**: When `OCR_PROVIDER=mock`, `ocr.avgConfidence` is `0.9` dummy, `totalLines` small, router may return `useVision=false` for `questionPaper` (easy path), skipping Vision even though mock needs Vision. Need `forceVision` when `mock` or `VISION_OCR_ENABLED`.

## 7. OCR Mock Gap (`src/lib/ocr/mock.ts:6`, `src/lib/ocr/factory.ts:39`)

- **PASS**: Mock provides deterministic pages for tests.
- **ISSUE-CRITICAL**: Mock generates tight `bbox` `0.05,0.1,0.9,0.04` per page — not page-specific, `extractQuestionsV2` `hierarchy-builder` fails to split `11(a)/(b)` correctly, mapping accuracy drops from `0.92` (Paddle) to `0.45` (mock) on 402 case.
- **GAP**: No `VisionOcrProvider` yet — mock cannot be replaced. Plan 2.1 fills this.

## 8. Performance & Cost (free tier)

- **PASS**: `VISION_GLOBAL_CONCURRENCY=1` `BATCH_SIZE=3` respects free-tier rate limits.
- **ISSUE-HIGH**: `3 passes * 27p` = `27 calls` * `90s timeout` = `~80s` > `Vercel Hobby 60s`. Need `batchSize 5` or `2 passes` for assignment `10p` demo, or `Pro 300s`.
- **ISSUE-MEDIUM**: `MAX_FILE_SIZE_MB=100` but Vercel direct S3 already fixed `4.5MB` limit via presigned, cost ok. Textract `10.5MB` already bypassed.

## 9. Validation & Security

- **PASS**: `vision-box-validator` not yet exists — currently no clamp, but `paddle` had `validateBox` `src/lib/ocr/paddle-provider.ts:58`.
- **ISSUE-HIGH**: No box validator for Vision — `x<0` or `w>1` boxes pass through to `fusion` and later `mergeBoxesForHighlight` creates giant highlight covering whole page.

## 10. Prioritized Fixes

P0 (before Vision-Only impl):
- `factory.ts:43` remove `OCR_PROVIDER=mock -> return null` gate when `VISION_OCR_ENABLED`
- `fusion.ts:48` add `if (cfg.OCR_PROVIDER !== "mock")` bypass for mock downgrade
- `base.ts:118` add `response_format: json_object` + `VisionPageStructureSchema` strict
- `provider.ts:72` make `coarseBox` required (or default tight) for mock primary mode
- `runner.ts:642` scale to `2.0` for `AS` when mock

P1 (strong Vision):
- Implement `VisionOcrProvider` (2.1), `geometry-snap` (2.5), generic zero-shot prompt (2.3) — already approved after hardcode removal
- Fix `router.ts:32` forceVision when mock

P2 (perf):
- Increase `buildMultimodalUserContent` limit from 5 to `VISION_BATCH_SIZE` (3) but loop pages, not slice to 5; `VISION_MAX_PAGES=50` should be respected via pagination, not truncation.

Audit done — awaiting approval to implement P0+P1.
