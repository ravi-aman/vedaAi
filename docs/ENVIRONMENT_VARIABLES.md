# ENVIRONMENT VARIABLES — VedaAI

> Generated 2026-08-30 — single source is `src/lib/config/index.ts` (Zod).  
> `.env` is the runtime control panel. Restart required after `.env` change.  
> Secrets never logged (logs show `keyPresent:true/false` only).

## Vision provider architecture

```
                 .ENV
                   │
                   ▼
          NORMALIZED CONFIG (`getVisionProviderConfigs()`, `getVisionRuntimeConfig()`)
                   │
           PROVIDER ORDER (VISION_PROVIDER_ORDER)
                   │
      ┌────────────┼────────────────┐
      ▼            ▼                ▼
   NVIDIA      OPENROUTER        OPENCODE
      │            │                │
   model X      model Y          model Z
      │            │                │
      └────────────┼────────────────┘
                   ▼
            VISION SCHEDULER (VISION_GLOBAL_CONCURRENCY)
                   │
                   ▼
            VISION RESULTS → Fusion
```

## Variables

| Variable | Purpose | Type | Default | Secret? | Provider | Runtime effect |
|----------|---------|------|---------|---------|----------|----------------|
| `VISION_PROVIDER_ORDER` | Preference order, comma-separated | `string` | `openrouter,opencode,nvidia` | no | vision | First enabled is preferred; changing order swaps preferred without code change |
| `VISION_AUTO_FALLBACK` | Whether to fallback to next provider on eligible error | `boolean` | `true` | no | vision | `false` → only preferred tried; `true` → `auth/credit/rate/timeout/5xx/schema` → next |
| `OPENROUTER_ENABLED` | Enable OpenRouter | `boolean` | `true` | no | openrouter | If `false`, skipped even if in order |
| `OPENROUTER_API_KEY` | OpenRouter key (`https://openrouter.ai/keys`) | `string` | — | **yes** | openrouter | Required if enabled; missing → `CONFIGURATION_ERROR` at preflight |
| `OPENROUTER_BASE_URL` | OpenRouter base | `url` | `https://openrouter.ai/api/v1` | no | openrouter | Single source in config; adapters use injected config, not literal |
| `OPENROUTER_VISION_MODEL` | Model for OpenRouter | `string` | `qwen/qwen3-vl-32b-instruct` | no | openrouter | Proven primary (benchmark 0.9s, multi-image, no hallucination). Change needs restart only |
| `OPENROUTER_MAX_CONCURRENCY` | Per-provider concurrency | `int 1..10` | `1` | no | openrouter | Effective = `min(global, provider)` |
| `OPENCODE_ENABLED` | Enable OpenCode/Zen | `boolean` | `true` | no | opencode | — |
| `OPENCODE_API_KEY` | OpenCode key (`https://opencode.ai`) | `string` | — | **yes** | opencode | Required if enabled |
| `OPENCODE_BASE_URL` | OpenCode base | `url` | `https://opencode.ai/zen/v1` | no | opencode | Normalizes `/chat/completions` vs `/responses` per model |
| `OPENCODE_VISION_MODEL` | Model for OpenCode | `string` | `mimo-v2.5-free` | no | opencode | Proven free vision (`mimo` `200` with image, but `429` under burst) |
| `OPENCODE_MAX_CONCURRENCY` | Per-provider concurrency | `int` | `1` | no | opencode | — |
| `NVIDIA_ENABLED` | Enable NVIDIA | `boolean` | `false` | no | nvidia | `false` by default — benchmark shows `90b` hallucinated + 50× slower, `11b` no JSON, `fuyu/phi` 404 |
| `NVIDIA_API_KEY` | NVIDIA key (`https://build.nvidia.com`) | `string` | — | **yes** | nvidia | Required if enabled |
| `NVIDIA_BASE_URL` | NVIDIA base | `url` | `https://integrate.api.nvidia.com/v1` | no | nvidia | OpenAI-compatible `/chat/completions` |
| `NVIDIA_VISION_MODEL` | Model for NVIDIA | `string` | `meta/llama-3.2-90b-vision-instruct` | no | nvidia | Usable but hallucinated; `11b` ignores `json_object`, `fuyu/phi` retired |
| `NVIDIA_MAX_CONCURRENCY` | Per-provider concurrency | `int` | `1` | no | nvidia | — |
| `VISION_GLOBAL_CONCURRENCY` | Global upper bound | `int 1..10` | `1` | no | vision | Prevents fallback storm; `1` proven not to exceed `in_flight_budget` |
| `VISION_BATCH_SIZE` | Images per Vision request | `int 1..10` | `3` | no | vision | QP 27p + AS 31p → 19 batches; changing alters batching without code |
| `VISION_TIMEOUT_MS` | Per-request timeout | `int ms` | `90000` | no | vision | Injected to adapters; NVIDIA diagram 172s exceeds 90s → fallback |
| `VISION_MAX_RETRIES` | Per-provider retries before fallback | `int 0..5` | `1` | no | vision | `1` means 2 attempts: try, retry-once if `429/5xx/timeout` |
| `VISION_MAX_ADJUDICATIONS` / `MAPPING_VISION_MAX_ADJUDICATIONS` | Targeted adjudication budget | `int 0..20` | `6` | no | mapping | `adjudicateWithVision` per job |
| `MAPPING_VISION_TIMEOUT_MS` | Adjudication timeout | `int` | `30000` | no | mapping | — |
| `VISION_MAX_PAGES` | Max QP pages Vision will see | `int 1..50` | `50` | no | vision | Document-aware sampling if QP >50 |
| `OCR_PROVIDER` | OCR provider | `enum` | `local` | no | ocr | `local` = PaddleOCR, `mock` = tests only |
| `LOCAL_OCR_*` | PaddleOCR engine/pipeline/device etc | `string/int` | see `.env.example` | no | ocr | — |
| `MAPPING_HIGH_THRESHOLD` / `MAPPING_REVIEW_THRESHOLD` | Mapping confidence gates | `0..1` | `0.75`/`0.5` | no | mapping | — |
| `MAX_FILE_SIZE_MB` / `MAX_PAGES` / `MAX_CONCURRENT_AI` | Limits | `int` | `100`/`50`/`2` | no | app | — |
| `NEXT_PUBLIC_SUPABASE_URL` / `_PUBLISHABLE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase | `url/string` | — | service key **yes** | storage | — |
| `GUEST_RESULT_GRACE_PERIOD_MS` | Guest result TTL | `int` | `90000` | no | auth | — |
| `NEXT_PUBLIC_APP_URL` | App URL for `HTTP-Referer` | `url` | `http://localhost:3000` | no | vision(ai) | Sent as `HTTP-Referer` to OpenRouter |
| **Deprecated legacy** | `VISION_PROVIDER` (`auto`/`openrouter`/`mock`/`disabled`), `VISION_MODEL`, `VISION_API_KEY`, `VISION_BASE_URL`, `OPENROUTER_MODEL`, `AI_MODEL`, `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL` | `string` | — | legacy | — | New `*_VISION_MODEL` / `*_ENABLED` take precedence; legacy kept for migration with warning; do NOT set together |

### .env vs .env.example

- `.env` — real secrets, gitignored (`.gitignore:34`), never committed
- `.env.example` — placeholders empty (`OPENROUTER_API_KEY=` etc), committed as template

### Example control panel (proven)

```env
VISION_PROVIDER_ORDER=openrouter,nvidia,opencode
VISION_AUTO_FALLBACK=true

OPENROUTER_ENABLED=true
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_VISION_MODEL=qwen/qwen3-vl-32b-instruct

OPENCODE_ENABLED=true
OPENCODE_API_KEY=sk-wlZV...
OPENCODE_BASE_URL=https://opencode.ai/zen/v1
OPENCODE_VISION_MODEL=mimo-v2.5-free

NVIDIA_ENABLED=false
NVIDIA_API_KEY=nvapi-...
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_VISION_MODEL=meta/llama-3.2-90b-vision-instruct

VISION_GLOBAL_CONCURRENCY=1
VISION_BATCH_SIZE=3
VISION_TIMEOUT_MS=90000
VISION_MAX_RETRIES=1
VISION_MAX_ADJUDICATIONS=6
```

Changing `VISION_PROVIDER_ORDER` to `nvidia,openrouter,opencode` and `OPENROUTER_VISION_MODEL` to `meta-llama/llama-4-scout` after restart swaps preferred provider/model with **no TypeScript change** (verified via live benchmark `scripts/vision-benchmark.ts` where same prompt with different `model` field succeeded).

### Security

- No `process.env` outside `src/lib/config/*` — adapters receive `VisionProviderConfig`
- Logs: `provider`, `model`, `keyPresent`, `batch`, `latency`, `status` — never `apiKey`
- Artifacts: `vision-provider-metrics.json` contains `model`/`provider` but no secret
- `.env` is gitignored; `rg "nvapi|sk-or|sk-wlZV" src scripts tests docs artifacts` → 0 (only `***REDACTED***` in docs)
