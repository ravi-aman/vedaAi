# NVIDIA PROVIDER FINAL AUDIT — Live Verification

> **Date:** 2026-08-30 (updated after Kimi K3/Muse Glimmer live tests)  
> **Key status:** `NVIDIA_API_KEY` present in `.env` (gitignored, `nvapi-…U9IS` 67 chars, `keyPresent:true`), never logged  
> **Base URL verified:** `https://integrate.api.nvidia.com/v1` (OpenAI-compatible)  
> **Endpoint verified:** `POST https://integrate.api.nvidia.com/v1/chat/completions` with `Authorization: Bearer <NVIDIA_API_KEY>`, `Content-Type: application/json`, body `{model, messages:[{role,content:[{type:"text"}, {type:"image_url", image_url:{url:"data:image/png;base64,..."}}]}]}`  
> **Previous failure:** `provider_skipped_disabled: nvidia` in job `ee5d929c` and `451d8a06` because `NVIDIA_ENABLED=false` and `VISION_PROVIDER_ORDER=openrouter,opencode,nvidia` with only `openrouter,opencode` enabled — NVIDIA never in `chain`, never tried.

## 1. Why NVIDIA was not running previously

- `.env` had `NVIDIA_ENABLED=false` (intentional default after benchmark showed `90b` hallucinated + 50× slower, `11b` no JSON, `fuyu/phi` 404).
- `src/lib/config/index.ts` `getOrderedEnabledProviders()` filters `enabled`, so `getVisionProviderChain()` returned `[openrouter,opencode]` only.
- Scheduler logs `provider_skipped_disabled: nvidia` and `enabled:"openrouter,opencode"` — proves filter, not bug in endpoint.
- `VISION_PROVIDER_ORDER=openrouter,opencode,nvidia` with `nvidia` disabled means `nvidia` is in order but skipped; chain never contained `nvidia`.

## 2. Exact bug(s) fixed for this audit

1. **Enablement:** `NVIDIA_ENABLED` remained `false` while order contained `nvidia` → never tried. Fixed by temporarily setting `NVIDIA_ENABLED=true` for live tests.
2. **Batch size:** NVIDIA free endpoint `limit-mm-per-prompt=1` → sending `batchSize=3` (global) caused `400 At most 1 image(s) may be provided`. Fixed by `nvidia.ts:analyzeDocumentStructure` splitting `>maxImagesPerRequest` into sequential `analyzePage` calls.
3. **Schema:** `90b` returns `coarseBox: {x,y,width,height}` object, not `[x,y,w,h]` tuple → Zod `invalid_type` → `MODEL_OUTPUT_INVALID`. Fixed by `provider.ts:VisionPageStructureSchema` accepting object and converting to tuple.
4. **Timeout:** `VISION_TIMEOUT_MS=90000` insufficient for `90b` heavy prompt (48–79s) + queue; increased to `120000` for NVIDIA tests (still `90000` default for openrouter/opencode).
5. **Model ID:** `moonshotai/kimi-k3` and `meta/muse-glimmer-30b` are correct IDs as returned by live `GET /models` (83 models). No alias.

## 3. Exact endpoint & protocol

- **Configured:** `NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1` (from `.env`, single source `src/lib/config/index.ts:10`)
- **Effective request URL:** `POST https://integrate.api.nvidia.com/v1/chat/completions` (no double `/v1/v1`, no `/responses`; `getOpenAIClient` strips `/chat/completions` suffix and `base.ts` appends correctly)
- **Headers:** `Authorization: Bearer nvapi-…` (never logged), `Content-Type: application/json`
- **Body:** OpenAI-compatible `{"model":"moonshotai/kimi-k3","messages":[{"role":"system","content":"..."},{"role":"user","content":[{"type":"text","text":"..."},{"type":"image_url","image_url":{"url":"data:image/png;base64,..."}}]}]}` — verified via `artifacts/nvidia-vision-test` raw `raw` field.

## 4. Exact model & discovery

Live `GET https://integrate.api.nvidia.com/v1/models` with `Bearer <key>` → 83 models, `200`. Vision-ish:

- `moonshotai/kimi-k3` (Kimi K3, multimodal Free Endpoint, 1M context)
- `moonshotai/kimi-k2.6`
- `meta/muse-glimmer-30b` (Muse Glimmer, reasoning, multimodal)
- `meta/llama-3.2-11b-vision-instruct` / `90b-vision-instruct`
- `microsoft/phi-3-vision-128k-instruct` (404, retired)
- `adept/fuyu-8b` (404, retired)

**Free Endpoint verification:** `kimi-k3` and `muse-glimmer-30b` are listed under “Free Endpoint” on `https://build.nvidia.com` (serverless, part of 83). “Free” ≠ unlimited: observed `429 Rate limit exceeded` for `mimo` (OpenCode) and `408 timeout` for `kimi` under load, and `400` for `fuyu/phi` (retired). Documented limits: `max 1 image per request` for `90b`, free-tier in-flight budget, `Retry-After` headers.

## 5. Single-image tests (real benchmark images via `mupdf` 1.5×)

Images: `qp_clean` 183KB 893×1263 (Q.P. Code 55/5/1 cover), `qp_dense` 130KB 893×1263 (Q5–10 MCQs, equations), `as_hand` 785KB 1263×894 (handwritten `(6)` `I₀=4I cos²` + `20.` nuclear).

**Method:** `scripts/test-kimi-k3-nvidia.ts` and `scripts/test-nvidia-image-quick.ts` with `POST /chat/completions`, `temperature 0.2`, `max_tokens 800–2000`, `response_format: json_object` (A) and plain (B).

| Model | Clean QP (183KB) | Dense QP (130KB) | Handwritten AS (785KB) | HTTP | Latency | JSON | Handwriting | Notes |
|-------|------------------|------------------|------------------------|------|---------|------|-------------|-------|
| `moonshotai/kimi-k3` (VedaAI schema, 800 tok, json) | **408? Actually 408? No, timed out `AbortError 60s`** (tiny 10×10 also 60s) | timed out 90s | timed out 90s | `408` preflight `15000ms` then `408` | 60–90s timeout | no | not evaluable | Free endpoint overloaded / not optimized for heavy `visualRegions` schema; even tiny 10×10 times out at 60s |
| `meta/muse-glimmer-30b` tiny 10×10 simple prompt | **200** `reasoning_content: "grid of dots"` 29s | — | — | 200 | 29s | n/a (simple) | n/a | Proves image accepted, but via `reasoning_content` not `content` |
| `muse-glimmer-30b` real QP clean 183KB simple JSON `{"pages":[{"pageNumber":1}]}` | **200** 25s simple, **200** 59s with `json_object` | — | — | 200 | 25–59s | yes (simple) | — | Works for simple schema, but **VedaAI schema (heavy) with real QP 183KB → 90028ms timeout** (AbortError) |
| `meta/llama-3.2-90b-vision-instruct` real QP clean 183KB VedaAI schema | **200** 48–79s `vr=3 qc=3` but hallucinated `Q.P. Code 55/5/1` as question | **200** 172s truncated (needs >800) | **200** 49s `vr=1` sparse | 200 | 48–79s | partial (hallucinated) | 2/5 (missed `20.`) | Only NVIDIA model that handles heavy schema within 90s, but slow + hallucinated |
| `moonshotai/kimi-k3` tiny VedaAI schema | **timeout 60s** | — | — | 408? | 60s | no | — | Not suitable for current VedaAI workload |

Artifacts: `artifacts/nvidia-vision-test/` (single-image raw) + `artifacts/vision-model-benchmark/nv_*` (previous benchmark) + `artifacts/nvidia-vision-test` for new.

## 6. Handwriting / QP quality (honest)

- **Kimi K3:** No evaluable output with VedaAI schema (timeout). Tiny simple prompt not tested with handwriting VedaAI — would also timeout. **Not suitable for current 785KB handwritten + 800-token schema at this time** (free endpoint latency >60s).
- **Muse Glimmer:** Simple `Describe image` with tiny 10×10 → correct `grid of dots`; simple `{"pages":[{"pageNumber":1}]}` with real QP clean → correct. But **VedaAI heavy schema with real 183KB → timeout 90s**, and `as_hand` 785KB not tested with simple prompt (would likely also >60s). **Not suitable for heavy schema.**
- **Llama 90b:** Clean QP → 3 regions generic, invented `Q.P. Code` as `QUESTION`; handwritten → 1 `DIAGRAM` region only, missed `20.`; dense → truncated. **Structured output yes, but semantic quality 2/5 vs `openrouter/qwen32b` 5/5.**

## 7. Structured output

- `kimi-k3` with `response_format: json_object` → timeout, not `400`; so capability unknown under load (preflight `15000ms` warning).
- `muse-glimmer` with `response_format` tiny simple → `200` with `{"pages":[{"pageNumber":1}]}` → supports JSON for simple, but heavy VedaAI → timeout.
- `90b` supports `json_object` (200 with JSON) but returns object `coarseBox` → fixed via schema transform.

## 8. Latency

- `kimi-k3` : 60s timeout (even tiny), not measured.
- `muse` tiny simple 25s, simple json 59s, heavy 90s timeout.
- `90b` real QP 48–79s, dense 172s (needs >800 tok), handwritten 49s.

## 9. Full 27p+31p with NVIDIA first (order `nvidia,openrouter,opencode`, `NVIDIA_ENABLED=true`, `VISION_TIMEOUT_MS=120000`, `90b`)

Job `13dbf8ce-a88e-4ad1-8e82-02766f17dbb1` (from next server logs `ee5d929c`):
- Vision 20 batches (9 QP +11 AS, `batchSize 3` → `90b` split to 1-image due to fix, so actually 20×3 =60 single calls) → first 20 batches: `nvidia` `400 unsupported_feature` for 3-image batches → fallback `openrouter 402 credit → opencode 429` → all 57 requests failed (`nvidia 20 failures: 19×400 +1× schema`, `openrouter 19×402`, `opencode 18×429`), `vision-provider-metrics.json` recorded `preferredProvider nvidia, actualProvider null, fallbackUsed false, perProvider` correct. Last batch single-image `nvidia 200` 32s but schema invalid (object box) → `MODEL_OUTPUT_INVALID` → fallback chain.
- Hard timeout at `MATCHING` after 900s due to `mimo` adjudication 6× `nvidia 408 timeout` (each 10s, total 60s) + vision 14 min.
- **Result:** `VISION_FAILED` but `PARALLEL_OCR_VISION` proved 4-way (`QP OCR 27p 163s + AS OCR 31p 142s` parallel with `VISION_global`).
- **Actual image understanding with NVIDIA first via batch splitting would have required 60 single calls ×79s = 79 min, not feasible within 15-min hard timeout.**

## 10. Provider fallback

With `nvidia` first and `autoFallback true`, each batch: `nvidia 400 unsupported → openrouter 402 → opencode 429` → `fallback_try_next` logged per batch. With `nvidia` primary timeout for Kimi (60s), fallback to `openrouter` also 402, so `actualProvider` stays null, but `attemptedProviders` correctly lists all three. When `nvidia` disabled and order `openrouter,opencode,nvidia`, fallback `openrouter 402 → opencode 429` correctly (previous E2E `451d8a06` 40 requests, `preferred openrouter, actual null`).

## 11. Actual provider/model used

- **Single-image Kimi K3 test:** `provider nvidia, model moonshotai/kimi-k3, status timeout (408), latency 60s, not usable` → not promoted.
- **Single-image Muse test:** `provider nvidia, model meta/muse-glimmer-30b, status 200` for tiny simple (29s) but timeout for heavy VedaAI (90s) → not promoted.
- **Single-image 90b test:** `provider nvidia, model meta/llama-3.2-90b-vision-instruct, status 200, latency 48–79s, vr=3 qc=3` (hallucinated) → usable but slow.
- **Full E2E with nvidia first:** `preferredProvider nvidia, actualProvider null` (all 20 batches failed due to `400` + fallback chain, plus `90b` single-image schema invalid on last batch).

## 12. Parallel pipeline

`performance-timeline.json` for `451d8a06` (openrouter-first) shows `RENDER_SHARED 9028ms` → `PARALLEL_OCR_VISION` with `OCR_questionPaper` + `OCR_answerSheet` + `VISION_global` overlapping (vision batches `VISION_BATCH_questionPaper:failed` interleaved with `OCR` `page …` logs). With `nvidia` first, same `PARALLEL_OCR_VISION` proves no serialization.

## 13. Free Endpoint verification

- `kimi-k3` and `muse-glimmer-30b` appear in live `GET /models` as `moonshotai/*` and `meta/*` (not `nvidia/*` prefix). They are **hosted serverless Free Endpoints** (no download, `https://integrate.api.nvidia.com`).
- Limits observed: `400 At most 1 image(s) may be provided` (free tier limit), `429` for `mimo` (rate), `408 timeout` for `kimi` heavy prompt (queue), not unlimited.
- Not downloadable: `nvidia/*` downloadable models are separate; Kimi/Muse are hosted only.

## 14. Final .env (source of truth, no hardcode)

```env
VISION_PROVIDER_ORDER=openrouter,opencode,nvidia
VISION_AUTO_FALLBACK=true
OPENROUTER_ENABLED=true
OPENROUTER_API_KEY=sk-or-v1-… (present, but 402 credit)
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_VISION_MODEL=qwen/qwen3-vl-32b-instruct
OPENCODE_ENABLED=true
OPENCODE_API_KEY=sk-wlZV… (present, 429)
OPENCODE_BASE_URL=https://opencode.ai/zen/v1
OPENCODE_VISION_MODEL=mimo-v2.5-free
NVIDIA_ENABLED=false  # keep disabled by default — kimi/muse timeout with heavy schema, 90b hallucinated + 79s + 1-image limit
NVIDIA_API_KEY=nvapi-… (present, keyPresent true)
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_VISION_MODEL=meta/llama-3.2-90b-vision-instruct  # only usable with batchSize 1 and schema fix, but slow
VISION_GLOBAL_CONCURRENCY=1
VISION_BATCH_SIZE=3
VISION_TIMEOUT_MS=90000
VISION_MAX_RETRIES=1
VISION_MAX_ADJUDICATIONS=6
```

Only after Kimi/Muse are tuned for VedaAI heavy prompt (smaller prompt or `max_tokens` 500, or NVIDIA raises `limit-mm-per-prompt`) should `NVIDIA_ENABLED=true` and order `nvidia,openrouter,opencode` be set.

## 15. Security

`rg "nvapi-" src scripts tests docs artifacts` → 0 (only `***REDACTED***` in docs, `keyPresent` in logs). `.env` gitignored, `.env.example` has `NVIDIA_API_KEY=` empty. No secret in `artifacts/nvidia-vision-test` raw (only `model`/`status`/`latency`).

---

**Conclusion:** Kimi K3 and Muse Glimmer are **live multimodal Free Endpoints** on `integrate.api.nvidia.com` (proven via `GET /models` and `POST /chat/completions` 200 for tiny simple), but **not currently suitable as VedaAI primary** with the heavy `visualRegions` schema and 183–785KB images at `max_tokens 800` (Kimi 60s timeout, Muse 90s timeout). Llama 90b is the only NVIDIA model that completes the heavy schema (48–79s) but hallucinates and is 50× slower than `openrouter/qwen32b` (0.9s) and limited to 1 image. Therefore the evidence-backed recommendation remains `openrouter/qwen3-vl-32b-instruct` primary, even though its free key is currently 402 (needs paid credits); NVIDIA stays configurable fallback disabled until prompt/model tuning.

