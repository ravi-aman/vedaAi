# VISION PROVIDER ARCHITECTURE PLAN — .env-Driven Multi-Provider

> **Status:** Benchmark frozen (2026-08-30). Primary proven: `openrouter/qwen/qwen3-vl-32b-instruct` (0.9s, no hallucination, multi-image). NVIDIA `90b` hallucinated + 50× slower, `11b` no JSON, `fuyu/phi` 404. OpenCode `mimo-v2.5-free` sparse+429.
> **Goal:** Make provider order / model / key / base URL / enabled / concurrency / batch / timeout **completely** `.env`-driven, no hardcode, preserve 4-way parallel upstream.

## 1. Contract (Phase 2)

**Types (`src/lib/vision/provider.ts`):**

```ts
export type VisionProviderId = "openrouter" | "nvidia" | "opencode";

export type VisionCapabilities = {
  visionInput: boolean;
  structuredOutput: boolean;
  multiImage: boolean;
  imageToText: boolean;
  maxImagesPerRequest: number;
  maxContextTokens?: number;
};

export type VisionPreflightResult = {
  provider: VisionProviderId;
  model: string;
  ok: boolean;
  available: boolean;
  reason?: string;
  latencyMs?: number;
  capabilities?: VisionCapabilities;
};

export type VisionProviderConfig = {
  id: VisionProviderId;
  enabled: boolean;
  apiKey: string; // "" if disabled, not logged
  baseUrl: string; // canonical default if empty, single source in config
  model: string; // MUST be set if enabled, else CONFIGURATION_ERROR
  maxConcurrency: number;
};

export type VisionRuntimeConfig = {
  providerOrder: VisionProviderId[]; // parsed from VISION_PROVIDER_ORDER
  autoFallback: boolean; // VISION_AUTO_FALLBACK
  globalConcurrency: number; // VISION_GLOBAL_CONCURRENCY
  batchSize: number; // VISION_BATCH_SIZE
  timeoutMs: number; // VISION_TIMEOUT_MS
  maxRetries: number; // VISION_MAX_RETRIES
  maxAdjudications: number; // VISION_MAX_ADJUDICATIONS == MAPPING_VISION_MAX_ADJUDICATIONS
};

export interface VisionProvider {
  readonly id: VisionProviderId;
  readonly capabilities: VisionCapabilities;
  preflight(): Promise<VisionPreflightResult>;
  analyzePage(input: VisionAnalyzePageInput): Promise<VisionPageStructure>;
  analyzeDocument(input: VisionAnalyzeDocumentInput): Promise<VisionDocumentAnalysis>;
  analyzeAmbiguousMapping(input: {questions, answerGroups, visionEvidence?}): Promise<{mappings: unknown[]}>;
}
```

Adapters: `NvidiaVisionProvider`, `OpenRouterVisionProvider`, `OpenCodeVisionProvider` — all hidden behind `VisionProvider`. Shared `OpenAICompatibleVisionProvider` base for NVIDIA+OpenRouter (both `integrate.api.nvidia.com/v1` and `openrouter.ai/api/v1` via `openai` SDK). OpenCode adapter normalizes `/chat/completions` vs `/responses` (model-dependent, per benchmark).

## 2. Config source-of-truth (Phase 3-5)

**New env vars (single Zod schema in `src/lib/config/index.ts`):**

```
VISION_PROVIDER_ORDER=openrouter,opencode,nvidia  (string → VisionProviderId[], validates unknown IDs, fail early; ignore disabled later)
VISION_AUTO_FALLBACK=true  (boolean)

OPENROUTER_ENABLED=true
OPENROUTER_API_KEY=            (secret, optional if disabled)
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1  (url, default canonical)
OPENROUTER_VISION_MODEL=qwen/qwen3-vl-32b-instruct
OPENROUTER_MAX_CONCURRENCY=1

OPENCODE_ENABLED=true
OPENCODE_API_KEY=
OPENCODE_BASE_URL=https://opencode.ai/zen/v1
OPENCODE_VISION_MODEL=mimo-v2.5-free
OPENCODE_MAX_CONCURRENCY=1

NVIDIA_ENABLED=false  (default false until needed — benchmark shows 90b hallucinated + slow)
NVIDIA_API_KEY=
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_VISION_MODEL=meta/llama-3.2-90b-vision-instruct
NVIDIA_MAX_CONCURRENCY=1

VISION_GLOBAL_CONCURRENCY=1
VISION_BATCH_SIZE=3
VISION_TIMEOUT_MS=90000
VISION_MAX_RETRIES=1
VISION_MAX_ADJUDICATIONS=6  (alias MAPPING_VISION_MAX_ADJUDICATIONS)
```

**Defaults:** Only in `src/lib/config/index.ts` as `const DEFAULTS = { nvidiaBase: "https://integrate.api.nvidia.com/v1", openrouterBase: "https://openrouter.ai/api/v1", opencodeBase: "https://opencode.ai/zen/v1", openrouterModel: "qwen/qwen3-vl-32b-instruct", nvidiaModel: "meta/llama-3.2-90b-vision-instruct", opencodeModel: "mimo-v2.5-free" }` — not scattered.

**Legacy migration:** Keep `VISION_PROVIDER`, `VISION_MODEL`, `VISION_API_KEY`, `VISION_BASE_URL`, `OPENROUTER_MODEL`, `AI_MODEL`, `AI_PROVIDER` in schema as optional deprecated, but **new provider config takes precedence**. If `VISION_PROVIDER_ORDER` set, ignores legacy `VISION_PROVIDER`. Log warning `deprecated env: VISION_PROVIDER → use VISION_PROVIDER_ORDER` if legacy alone. `OPENROUTER_MODEL` if set and `OPENROUTER_VISION_MODEL` empty → copy with deprecation warning, not silent override after.

**Validation:** If `provider.enabled && !provider.model` → `CONFIGURATION_ERROR` at `requireVisionConfig()` (not silent fallback). If `provider.enabled && !provider.apiKey` → `CONFIGURATION_ERROR` at preflight / factory. If `providerOrder` contains unknown id → fail early `CONFIGURATION_ERROR: unknown provider ...`. If `autoFallback` false → only preferred provider tried (no chain).

**Helpers:** `getVisionRuntimeConfig(): VisionRuntimeConfig`, `getVisionProviderConfigs(): Record<VisionProviderId, VisionProviderConfig>`, `getOrderedEnabledProviders(): VisionProviderConfig[]` (order × enabled). Only `src/lib/config/*` reads `process.env`.

## 3. Provider factory (Phase 6)

`src/lib/vision/factory.ts` → `createVisionProvider(cfg: VisionProviderConfig): VisionProvider` + `getVisionProviderChain(): VisionProvider[]` (ordered, enabled) + `getPreferredProvider(): VisionProvider | null` (first in order). No `process.env` there. Caches per-id instance. No `VISION_PROVIDER` string branch.

**OpenRouter** (`providers/openrouter.ts`): preserves current `OpenRouterVisionProvider` behavior (Alibaba 32b, `response_format: json_object`, `withRetry 3`, `withTimeout`, `extractJsonObject`, artifact save, `payloadKb` logging) but reads `baseUrl/apiKey/model` from injected `VisionProviderConfig`.

**NVIDIA** (`providers/nvidia.ts`): `NvidiaVisionProvider` extends `OpenAICompatibleVisionProvider` with `baseUrl: https://integrate.api.nvidia.com/v1`, same multimodal `image_url` flow. Handles `response_format` ignored by `11b` → detect `!jsonValid` → `MODEL_OUTPUT_INVALID` + `UNSUPPORTED_FEATURE` → trigger fallback. Normalizes `coarseBox` if out-of-range (none expected). Costs not billed via OR, but log `cost` if present.

**OpenCode** (`providers/opencode.ts`): `OpenCodeVisionProvider` with `baseUrl: https://opencode.ai/zen/v1`, normalizes per-model protocol: tries `POST /chat/completions` first (proven for `mimo`), if model needs `POST /responses` (per spec) then adapter switches based on model id (`gpt-5.*`, `Muse-*` via `/responses` with `input` array). For benchmark's `mimo-v2.5-free`, `/chat/completions` is canonical.

## 4. Capabilities & preflight (Phase 7-8)

Capabilities per provider (runtime, not hardcode per model in generic code):

```
openrouter/qwen32b: visionInput:true, structuredOutput:true, multiImage:true (≥2), maxImages:5, maxTokens:131k
nvidia/90b: visionInput:true, structuredOutput:partial (hallucinated), multiImage:false (400), maxImages:1
nvidia/11b: visionInput:true, structuredOutput:false (ignored), multiImage:false
opencode/mimo: visionInput:true, structuredOutput:true, multiImage:false, maxImages:1
```

`preflight()` per provider:

- Checks `enabled`, `apiKeyPresent`, `baseUrl` reachable (GET `/models` 8s or cheap `POST chat/completions` with `max_tokens:10` + `ping` text, 12s). For NVIDIA: `GET /models` public; for OR: `GET /key` credits check + probe; for OC: `GET /models`.
- Returns `ok: false` with `reason: "OPENROUTER_API_KEY missing"` or `Insufficient credits` etc.
- **Expensive guard:** If preflight `!ok`, caller must **not** launch 20 batches; set `VISION_UNAVAILABLE` and skip.

## 5. Order & fallback (Phase 9-10)

Order parsing: `VISION_PROVIDER_ORDER.split(",").map(trim).lowerCase()` → `VisionProviderId[]`, validate each `∈ {nvidia,openrouter,opencode}`, else `CONFIGURATION_ERROR`. Runtime filters `enabled` — if order contains disabled, skip silently (log `provider_skipped_disabled`).

Fallback policy (typed errors from providers):

```
CONFIGURATION_ERROR, AUTH_ERROR (401/403), MODEL_NOT_FOUND (404), CREDIT_EXHAUSTED (402), UNSUPPORTED_FEATURE (400 image not supported) → skip to next provider (no retry on same)
RATE_LIMIT (429), TIMEOUT (408/ETIMEDOUT), NETWORK_ERROR, SERVER_ERROR (5xx) → bounded retry (VISION_MAX_RETRIES, backoff 600ms×2^attempt + jitter) then fallback if autoFallback
MODEL_OUTPUT_INVALID / SCHEMA_ERROR → provider-local retry once (same model), then fallback if autoFallback
```

If `VISION_AUTO_FALLBACK=false` → only preferred provider tried; errors bubble as `VISION_FAILED` (not `UNAVAILABLE`).

Tracking: `visionStageWithShared` central scheduler records `preferredProvider`, `actualProvider`, `fallbackUsed`, `fallbackReason`, per-provider `attempts`, `latency`, `status` per batch. Final `vision-provider-metrics.json` in job artifacts.

## 6. Scheduler & parallelism (Phase 11-14)

Preserve 4-way invariant:

```
QP OCR      ║
AS OCR      ║  → Promise.all([ocrPromise, visionPromise]) after shared render
QP Vision   ║
AS Vision   ║
```

- `renderSharedStage` once → `SharedPageImage` on disk (`os.tmpdir/veda-ai/{jobId}/paddle-images/...`) → lazy `loadBase64ForPages` per batch (bounded, not 58× base64 in RAM).
- Vision global queue: `QP batches (ceil(pages/batchSize)) + AS batches` → single queue with `effectiveConcurrency = min(VISION_GLOBAL_CONCURRENCY, provider.maxConcurrency)` (default 1). For 58 pages, 19 batches sequential (1) or parallel (2 if configured).
- On fallback, **central** chain retries next provider for same batch, not per-branch explosion. E.g., QP batch1 tries `openrouter` 402 → `opencode` 200, then QP batch2 tries `openrouter` again (preferred first per batch).

## 7. Model selection (Phase 15-17)

No `envModel || "qwen/qwen3-vl-32b-instruct"` in adapters. Instead `cfg.providers[ id ].model` from `getVisionProviderConfigs()`. If `enabled && !model` → throw `CONFIGURATION_ERROR` at factory/preflight, not silent default. Tests flip `OPENROUTER_VISION_MODEL` and verify `actualProvider.model` changes.

## 8. Metrics & logging (Phase 27-28)

Per Vision request log: `{provider, model, stage:"VISION", document:"questionPaper|answerSheet", pages:batch.length, batch:"1/10", attempt, latencyMs, status:200|402, fallback, keyPresent:false}` — never `apiKey`. Final `artifacts/{jobId}/vision-provider-metrics.json` with `preferredProvider`, `actualProvider`, `fallbackUsed`, per-provider counts.

## 9. Files to touch

- `src/lib/config/index.ts` — add new schema + helpers, keep legacy migration
- `src/lib/vision/provider.ts` — add Id + capabilities + preflight interface
- `src/lib/vision/factory.ts` — new factory + chain
- `src/lib/vision/openrouter-vision.ts` → `providers/openrouter.ts` (or keep file, inject config)
- `src/lib/vision/providers/nvidia.ts` (new)
- `src/lib/vision/providers/opencode.ts` (new)
- `src/lib/vision/providers/base.ts` (shared OpenAI-compatible)
- `src/lib/jobs/runner.ts` — swap `verifyVisionPreflight` → chain, batchSize/globalConcurrency from config, metrics
- `src/lib/mapping/targeted-vision.ts` — use chain
- `scripts/ai-smoke.ts` etc — use normalized config
- `.env` / `.env.example` — reorganize sections, add new vars, keep legacy as deprecated
- `docs/ENVIRONMENT_VARIABLES.md` — table

Untouched: `src/lib/structure/*`, `src/lib/evidence/*`, `src/lib/decision/*`, `src/lib/coordinates/*` (mapping/highlight).

## 10. Verification (Phases 18-33)

- Order switching A-G (openrouter-first / nvidia-first / disabled) → assert `preferred vs actual`
- Model switching per provider
- Smoke: 1 QP + 1 AS image via real `openrouter/qwen32b`, `opencode/mimo`, `nvidia/90b`
- Fallback: invalid `NVIDIA_API_KEY` → `preferred=nvidia, actual=openrouter, reason=AUTH_ERROR`
- Full 27p+31p E2E with `VISION_PROVIDER_ORDER=openrouter,nvidia,opencode` → `performance-timeline.json` proves `QP OCR ║ AS OCR ║ QP Vision ║ AS Vision`
- Hardcode audit: `rg "qwen/qwen3-vl|integrate.api|openrouter.ai/api" src/lib` → only `src/lib/config/index.ts` defaults
- Security: `rg "nvapi|sk-or|sk-wlZV" src scripts tests docs artifacts` → 0 (only `***REDACTED***` in docs)
