# Vision-Only Strong Plan — Accurate Text + Coordinates when OCR_PROVIDER=mock

Goal: `OCR_PROVIDER=mock` ke bawajood `Vision` se hi production-grade `text` + `coarseBox [x,y,w,h] 0..1` nikale, taaki `Q 11(a)`/`11(b)` alg, `out-of-order`, `unanswered`, `multi-page` aur `highlight` sahi ho. `Textract/Paddle` band, `Vision` primary.

## 1. Current Pipeline (padh liya)

`Runner` `src/lib/jobs/runner.ts:444`:
`PREPROCESSING -> renderShared (mupdf 1.5x PNG) -> PARALLEL[ QP OCR || AS OCR || QP Vision || AS Vision ] -> FUSION -> EXTRACTING (extractQuestionsV2) -> STRUCTURING -> MATCHING (smart-mapping) -> LOCALIZING`

* Vision ab `evidence-only` (`src/lib/vision/fusion.ts:9` "grounded to Textract", `coarseBox` ko `blockIds` se hi trust). `mock` pe `blockIds` dummy hai, isliye `hasGrounding false -> confidence*0.5` aur box hallucinate.
* Vision schema `src/lib/vision/provider.ts:49` `visualRegions/answerGroupHints/questionCandidates` me `coarseBox` optional, `Vision` ko `0.7` default se chalaya ja raha.
* `OpenRouter` `src/lib/vision/providers/openrouter.ts:9` `multiImage 5`, `timeout 90s`, `extractJsonObject` se JSON parse, `coarseBox` ka clamp nahi.

Isliye `mock` pe `Q` count galat, `highlight` drift.

## 2. Vision-Only Strong Design (OCR=mock -> Vision Primary)

### 2.1 New OCR Adapter — `VisionOcrProvider` (when mock)

`src/lib/ocr/vision-ocr-provider.ts` implements `LocalOcrProvider.processDocument`:

- Input: `pages: {pageNumber,imagePath,width,height}[]` (rendered 2x, 300dpi handwriting ke liye)
- Per page calls `OpenRouterVisionProvider.analyzePage` with **OCR-mode prompt** (temperature 0, `response_format: json_object`):
```
You are a precise OCR. Transcribe every line exactly as printed/handwritten in reading order (top->bottom, left->right). For each line return {text, bbox:[x,y,w,h] normalized 0..1, confidence}. Do NOT invent. If handwritten cursive is unreadable, return text="" and confidence 0.3. Preserve original numbering like "11 (a)" exactly.
```
- Post-process: `polyToBox` nahi, Vision ka `[x,y,w,h]` ko `0..1` clamp, validate `w>0.005 && h>0.005`, sort by `y` (threshold 0.012) -> `OcrLine[]`, synthesize `OcrBlock` via `gap>0.025` (reuse `paddle-provider.ts:339`). Output `OcrDocumentResult {provider:"vision-ocr", pages}` — same shape as Paddle, isliye `extractQuestionsV2` aur `smart-mapping` ko change nahi.

Isse `mock` ke dummy lines ki jagah real Vision OCR ayega, `Fusion` ko grounding milega.

### 2.2 High-Res Render for Vision-Only

`src/lib/jobs/runner.ts:642` `Matrix.scale(1.5)` -> `2.0` jab `OCR_PROVIDER=mock` (Vision primary). `mupdf` 2x = 300dpi, handwriting stroke clear, Vision bbox error `~0.008` se `~0.004` me. `Vision` ke liye `base64` lazy load nahi, per-batch 3 images hi RAM me.

### 2.3 Structured Prompt — Zero-Shot + Generic Schema (No Hardcoded Paper)

Hardcoded example nahi — har paper type (printed CBSE, handwritten, diagram, table, OR-choice) pe bias ho jayega. Isliye **schema-driven zero-shot**:

`src/lib/vision/providers/base.ts:buildMultimodalUserContent` me system prompt:

```
You are a document vision parser. For each page image, output JSON strictly matching schema {visualRegions:[{type, description, coarseBox:[x,y,w,h] 0..1}], questionCandidates:[{rawLabel, textHint, confidence}], answerGroupHints:[...]}.
Rules:
- coarseBox must be normalized 0..1, 4 numbers, tight to ink (not whole page), inside [0,1].
- Preserve original numbering exactly: "11 (a)", "Q.1", "1." all valid, separate "11 (a)" and "11 (b)" into two entries.
- Supported types: QUESTION, SUBPART, OPTION, DIAGRAM, TABLE, HANDWRITING_BLOCK, MARKS, INSTRUCTION, SECTION_HEADER. Use generic description, not paper-specific text.
- Do NOT invent text; transcribe exactly top->bottom left->right. If unreadable, confidence 0.3.
- No example text is provided to avoid bias — rely on schema and rules only.
```

Enforce via `response_format: json_object` + `zod` `VisionPageStructureSchema` + `extractJsonObject` retry (strip fences). Temperature 0, top_p 0.1, max_tokens 4000.

Optional: At runtime add **generic synthetic few-shot** (not CBSE-specific) — 1 printed block `[0.05,0.10,0.9,0.05]` + 1 handwritten block `[0.08,0.50,0.8,0.2]` with dummy labels `Q1`, `Ans1` only to show format, content `lorem` — so model learns schema, not paper content.

### 2.4 Multi-Pass Vision (3 passes, not 1)

1. **Layout Pass** (`analyzePage` with `task=layout`): Detect `visualRegions` only (QUESTION, SUBPART, HANDWRITING_BLOCK, DIAGRAM, MARKS). Output coarse boxes.
2. **OCR Pass** (`VisionOcrProvider`): Per region crop? Simplest per page OCR as above.
3. **Verify Pass** (`analyzeAmbiguousMapping`): For low confidence `qc` (`<0.75`), second call with cropped image of `coarseBox` (enlarge 1.2x) to refine box + text.

Cost: 3x calls, but `batchSize 3` + `globalConcurrency 1` se `27p` ~ `27*3/3=27` calls ~ `27s` (acceptable for assignment, free tier `mimo-v2.5-free`).

### 2.5 Consensus + Geometry Snap

- Run 2 providers `openrouter(qwen3-vl-32b)` + `opencode(mimo-v2.5-free)` in parallel for same page, keep box where `IOU>0.5` (consensus), confidence = avg.
- Snap `coarseBox` to ink: `src/lib/vision/geometry-snap.ts` new — use `canvas` + `mupdf` pixmap to run simple edge detection (Canny threshold via `mupdf` pixmap bytes) and shrink box to tight `minX/maxY` of dark pixels (handwriting). No ML, pure image op, `~5ms/page`.

### 2.6 Fusion Upgrade for mock

`src/lib/vision/fusion.ts:48` `hasGrounding` check: when `OCR_PROVIDER=mock`, skip Textract check, treat Vision box as primary (`confidence*1.0`, not `0.5`). Keep `warnings` but don't downgrade. `canonical` build from `VisionOcrProvider` lines, so `fusion` becomes `VISION_PRIMARY`.

### 2.7 Validation & Metrics

- `src/lib/validation/vision-box-validator.ts`: Reject `x<0||y<0||w<0.01||h<0.01`, clamp to `[0,1]`, re-center if `w>0.9` (whole page) split.
- Metrics: Log `IOU` vs previous Paddle baseline on 402 credit case, `CER` for handwriting vs Textract. `artifacts/vision-only/` me per-page JSON dump.

## 3. Files to Change

- New: `src/lib/ocr/vision-ocr-provider.ts`, `src/lib/vision/geometry-snap.ts`, `src/lib/validation/vision-box-validator.ts`
- Edit: `src/lib/ocr/factory.ts:39` (`mock` -> `VisionOcrProvider` when `USE_VISION_OCR=true`), `src/lib/jobs/runner.ts:764` render scale 2.0, `src/lib/vision/providers/base.ts` prompts, `src/lib/vision/fusion.ts:48` grounding bypass, `src/lib/config/index.ts:142` add `VISION_OCR_ENABLED` flag
- Keep: `extractQuestionsV2`, `smart-mapping` unchanged — they consume `OcrDocumentResult` shape.

## 4. Rollout

Phase1: `VisionOcrProvider` mock->vision, 1.5x->2x, prompt few-shot — test `11 (a)/(b)` split, `Physics 27p` IOU >0.6
Phase2: multi-pass + consensus, geometry snap
Phase3: enable `OCR_PROVIDER=mock` on Vercel free tier, no `S3`/`Supabase` needed, `in-memory` only (assignment constraint pass)

## 5. Cost & Limits (free tier)

`mimo-v2.5-free` via `opencode.ai/zen` `0$`, `qwen3-vl-32b` free quota. `3 passes * 27p * ~1s` = `~80s` < `vercel maxDuration 60` pe tight — isliye `batchSize 3` + `Pro 300s` ya `remote worker` recommended for >20p. Assignment ke `5-10p` pe `Hobby` pe pass.

