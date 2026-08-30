# VISION PROVIDER AUDIT — Full Literal Inventory

> **Date:** 2026-08-30  
> **Scope:** `src/lib/vision/**`, `src/lib/config/**`, `src/lib/ai/**`, `src/lib/jobs/**`, `src/app/api/**`, `scripts/**`, `tests/**`, `vitest.config.ts`, `opencode.json`, `.env`, `.env.example`  
> **Search literals:** `openrouter`, `nvidia`, `opencode`, `qwen/`, `nvidia/`, `muse-`, `nemotron-`, `qwen3-vl`, `integrate.api.nvidia.com`, `opencode.ai/zen`, `OPENROUTER_API_KEY`, `NVIDIA_API_KEY`, `OPENCODE_API_KEY`, plus regex `qwen|nemotron|integrate\.api|openrouter\.ai/api` via `Select-String` (PowerShell) and direct `Read` of every candidate file.

Classification (per spec):

| # | Category | Meaning |
|---|----------|---------|
| 1 | Generic provider abstraction | Factory/interface/adapter that should be provider-agnostic |
| 2 | Environment variable | `process.env` / `getConfig()` / `.env` declaration |
| 3 | Test fixture | `fixtures/` / `tests/` / `vitest.config.ts` mock data |
| 4 | Documentation | `docs/*.md` prose |
| 5 | **Hardcoded production value** | Literal in `src/` that must become `.env`-driven |
| 6 | Suspicious fallback | `|| CANONICAL_MODEL` style silent default that hides misconfiguration |
| 7 | Intentional default | Explicit canonical default documented in ONE config module (allowed if typed & logged) |

---

## 1. Exhaustive occurrence table

### A. `src/lib/config/index.ts`

| Line | Literal | Text | Category |
|------|---------|------|----------|
| 6 | `qwen/qwen3-vl-32b-instruct` | `const OPENROUTER_DEFAULT_MODEL = "qwen/qwen3-vl-32b-instruct"` | **5** (duplicate of vision file) + **7** (intended canonical, but duplicated across modules → hardcoding spread) |
| 7 | `openrouter.ai/api` | `const OPENROUTER_DEFAULT_BASE = "https://openrouter.ai/api/v1"` | **5 + 7** (same issue — should be single source, currently duplicated) |
| 10-19 | `opencode-zen`, `openai` | `AI_PROVIDER` transforms `opencode-zen`/`openai` → `openrouter` | **2** (env migration shim, acceptable) + **5** (hardcoded string in transform — but required for migration) |
| 20 | `qwen/...` via default | `AI_MODEL` defaults to `OPENROUTER_DEFAULT_MODEL` | **2** (env declaration) |
| 22-27 | `opencode.ai` | `AI_BASE_URL` transform `v.includes("opencode.ai") → OPENROUTER_DEFAULT_BASE` | **2** (migration shim) |
| 28 | `OPENROUTER_API_KEY` | `z.string().optional()` | **2** ✅ |
| 29 | `qwen/...` | `OPENROUTER_MODEL` default | **2** |
| 30-34 | `opencode.ai` | `OPENROUTER_BASE_URL` migration transform | **2** |
| 71-79 | `openrouter`, `mock`, `auto`, `disabled`, `opencode-zen` | `VISION_PROVIDER` enum + transform | **2** but **hardcoded enum** missing `nvidia`/`opencode` → must be extended (currently **5** — incomplete provider list) |
| 80 | `qwen/...` | `VISION_MODEL` default `OPENROUTER_DEFAULT_MODEL` | **2** (but hides per-provider model — **6** suspiciousfallback) |
| 81 | `VISION_API_KEY` | optional | **2** ✅ |
| 82-86 | `opencode.ai` | `VISION_BASE_URL` migration transform | **2** |
| 89 | `VISION_MAX_PAGES` | `50` | **2** ✅ |
| 90 | `VISION_TIMEOUT_MS` | `90000` | **2** ✅ |
| 92-93 | `VISION_MAX_ADJUCATIONS` | `MAPPING_VISION_MAX_ADJUDICATIONS=6` | **2** ✅ |
| 194-198 | `qwen/...`, `openrouter.ai` | `OPENROUTER_CANONICAL` const `{model, baseUrl, endpoint}` | **5 + 7** — **hardcoded production value** that duplicates lines 6-7; should be derived from typed config only |

**Verdict config:**  
- **2 vars missing:** `NVIDIA_ENABLED`, `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `NVIDIA_VISION_MODEL`, `OPENROUTER_ENABLED`, `OPENCODE_ENABLED`, `OPENCODE_API_KEY`, `OPENCODE_BASE_URL`, `OPENCODE_VISION_MODEL`, `VISION_PROVIDER_ORDER`, `VISION_AUTO_FALLBACK`, `VISION_MAX_RETRIES`, `VISION_GLOBAL_CONCURRENCY`, `VISION_BATCH_SIZE`, optional per-provider `MAX_CONCURRENCY`.  
- **5/6 violations:** duplicate canonical literals in config + vision + ai files; silent fallback `|| CANONICAL_MODEL` in `getVisionDiagnostics()` line 43-44 will hide missing model after migration.

---

### B. `src/lib/vision/*`

| File : Line | Literal | Category | Note |
|-------------|---------|----------|------|
| `provider.ts:185` | `"opencode-zen"` | **5** | Stale enum `z.enum(["opencode-zen","mock","disabled"])` — not aligned with config's `["openrouter","mock","auto","disabled"]` nor desired `["nvidia","openrouter","opencode"]`. Must become `VisionProviderId`. |
| `factory.ts:4` | `OpenRouterVisionProvider` | **1** | Generic abstraction (factory imports adapter) — correct, but only one provider wired. |
| `factory.ts:10` | `VISION_PROVIDER` | **2** | Env read via `getConfig()` — correct, but missing order / enabled. |
| `factory.ts:16-20` | `process.env.OPENROUTER_API_KEY` | **5** | **Direct `process.env` access outside config** — violates "only config reads `process.env`". Must be removed. "**Suspicious fallback**" for stale cache. |
| `factory.ts:21` | `"openrouter"` string literal | **5** | Hardcoded branch `if (provider === "openrouter" \|\| provider === "auto")` — not derived from `VisionProviderId` + order. |
| `factory.ts:26,31` | `new OpenRouterVisionProvider()` | **5** | Hardcoded construction — factory should be `createVisionProvider(config)` with injected `VisionProviderConfig`. |
| `factory.ts:39-45` | `OPENROUTER_*`, `VISION_*`, `"qwen/qwen3-vl-32b-instruct"`, `"https://openrouter.ai/api/v1"` | **5 + 6** | `getVisionDiagnostics()` fallback literals — production hardcoding; silent fallback. |
| `factory.ts:61` | `!== "disabled"` | **2** | Env check — correct but incomplete (no per-provider enabled). |
| `openrouter-vision.ts:8` | `"qwen/qwen3-vl-32b-instruct"` | **5 + 6 + 7** | **Duplicate canonical** — must be removed; model must come from `config.providers.openrouter.model`. |
| `openrouter-vision.ts:9` | `"https://openrouter.ai/api/v1"` | **5 + 7** | Duplicate base URL — must come from `NVIDIA_BASE_URL` etc via config object, not literal. |
| `openrouter-vision.ts:13-16` | `OPENROUTER_API_KEY`, `VISION_API_KEY`, `AI_API_KEY`, `OPENROUTER_BASE_URL`... | **2** | Env resolution via `getConfig()` — correct pattern, but scattered URL literals and fallback chain is suspicious (**6**). |
| `openrouter-vision.ts:31` | `OPENROUTER_MODEL` etc `|| CANONICAL_MODEL` | **6** | **Silent fallback** — if env missing, silently uses hardcoded model. Must be `CONFIGURATION_ERROR` when enabled provider has no model. |
| `openrouter-vision.ts:37-40` | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_BASE_URL` | **2** | Preflight key/model/base resolution — same issue. |
| `openrouter-vision.ts:76,94,119,142,155,169` | `"openrouter"` | **1** | Logging `provider: "openrouter"` — acceptable as adapter's `id` literal inside adapter, but downstream should see `config.providers.openrouter.id`. Not hardcoding model. |
| `openrouter-vision.ts:160-177` | `withRetry`, classify | **1** | Generic retry — correct, but `VISION_MAX_RETRIES` not env-driven (hardcoded `max=3`). |
| `openrouter-vision.ts:228,254,265,271,275,291,301` | `"openrouter"` | **1** | Adapter-internal logging / request building — acceptable if `id` comes from config. |
| `openrouter-vision.ts:283,292` etc | `"/chat/completions"` | **1** | OpenAI-compatible endpoint suffix — acceptable as protocol, but base URL must still be env-driven (`https://integrate.api.nvidia.com/v1` for NVIDIA). |
| `opencode-vision.ts:1-16` | `"opencode-zen"` + fallback message | **5** | **Dead provider** — stub that throws. Must be replaced with real `OpenCodeVisionProvider` that audits OpenCode's actual endpoint/protocol (see spec: may be `/chat/completions` or `/responses` depending on model). |
| `mock.ts` | _(no literals)_ | **1+3** | MockVisionProvider — test fixture — correct. |
| `fusion.ts`, `canonical.ts`, `router.ts` | _(no provider literals)_ | **1** | Provider-neutral — correct. |
| `provider.ts:8-143` | `KNOWN_REGION_TYPES` etc | **1** | Schema/provider interface — correct, but missing `VisionProviderId`, `preflight()`, `VisionProviderConfig`, capabilities. |

**No occurrences found** for `nvidia`, `integrate.api.nvidia.com`, `nvidia/` in any `src/lib/vision/*` (verified via `Select-String`). **NVIDIA provider is entirely absent** — must be added.

**No occurrences** for `opencode` beyond the dead stub and legacy `opencode-zen` migrations.

---

### C. `src/lib/ai/**`

| File : Line | Literal | Category |
|-------------|---------|----------|
| `providers/openrouter.ts:8` | `"qwen/qwen3-vl-32b-instruct"` | **5 + 6 + 7** — duplicate canonical (same as vision). Should share single typed config, not duplicate literal. |
| `providers/openrouter.ts:9` | `"https://openrouter.ai/api/v1"` | **5 + 7** — duplicate base |
| `providers/openrouter.ts:31` | `|| CANONICAL_MODEL` | **6** — silent fallback |
| `providers/openai.ts:16` | `"https://openrouter.ai/api/v1"` | **5** — legacy fallback literal |
| `providers/openai.ts:89` | `cfg.AI_MODEL` | **2** — reads model from config, but still via legacy `AI_MODEL` not per-provider |
| `providers/opencode-zen.ts:12` | `"Legacy provider opencode-zen removed … qwen/qwen3-vl-32b-instruct, base https://openrouter.ai/api/v1"` | **4** — documentation/error message (acceptable as guidance, but still hardcodes model/base in error string — should reference config docs) |
| `providers/mock.ts` | _(none)_ | **3** ✅ |
| `factory.ts:9-11` | `// Single canonical provider: OpenRouter …` | **4** comment — will need rewrite to multi-provider factory |

---

### D. `src/lib/jobs/runner.ts`

| Line Range | Literal | Category |
|------------|---------|----------|
| 707, 829, 846 | `VISION_PROVIDER`, `VISION_MAX_PAGES`, `VISION_TIMEOUT_MS` | **2** ✅ (reads via `getConfig()`) |
| 879 | `batchSize = 3` | **5** — hardcoded `VISION_BATCH_SIZE` should be `VISION_BATCH_SIZE` env (spec: 3 is default but must be configurable). |
| 902, 919, 922 | `globalConcurrency = 1` (implicit) | **5** — hardcoded `VISION_GLOBAL_CONCURRENCY`, should be env; also missing per-provider `NVIDIA_MAX_CONCURRENCY` etc. |
| 959 | `model: (getConfig() as any).OPENROUTER_MODEL \|\| VISION_MODEL` | **5+6** — hardcoded resolution, not `config.providers[preferred].model`; silent fallback. |
| 959 | `provider: visionProviderName` log | **1** but logs `auto` not `actual provider` — must log `preferredProvider` vs `actualProvider` + `fallbackReason`. |
| 846 | `verifyVisionPreflight` import from `openrouter-vision` | **5** — hardcoded to OpenRouter; must be `provider.preflight()` via `VisionProvider` interface. |
| 830-850 | preflight/metrics single-provider | **5** — no `vision-provider-metrics.json` per spec; current `vision-metrics.json` only counts single provider. |
| Overall | No `tryProviderChain`, no `VisionProviderConfig` injection | **5** — missing provider-order + fallback + capability logic. |

---

### E. `scripts/**`

| File | Literal | Category |
|------|---------|----------|
| `ai-smoke.ts:13-28` | `OPENROUTER_MODEL`, `AI_MODEL`, `openrouter` | **2 + 3** — smoke test for OpenRouter only; must be extended to loop all enabled providers (NVIDIA, OpenRouter, OpenCode) and record `provider, model, available, latencyMs`. |
| `test-vision.ts`, `test-vision-as.ts`, `real-run-vision.ts`, `run_real_job.ts` | `qwen`, `openrouter`, `VISION_PROVIDER=auto` | **3 + 5** — scripts hardcode single provider; after migration should read `VISION_PROVIDER_ORDER` and exercise fallback. |

---

### F. `tests/**` + `vitest.config.ts`

| Location | Literal | Category |
|----------|---------|----------|
| `vitest.config.ts: env` | `OPENROUTER_API_KEY=test-key`, `OPENROUTER_MODEL=qwen/qwen3-vl-32b-instruct`, `VISION_PROVIDER=mock` | **3** ✅ — test fixtures |
| `tests/unit/*` `MockOcrProvider` etc | `provider: "paddleocr"` etc | **3** ✅ |
| `tests/e2e/*` | `VISION` strings | **3** ✅ (E2E harness) |

No test asserts provider switching or model switching via `.env` — gap to fill in phases 29-33.

---

### G. `.env` / `.env.example` / `opencode.json` / `docs`

| Location | Literal | Category |
|----------|---------|----------|
| `.env:1-4` | `OPENROUTER_API_KEY`, `qwen/qwen3-vl-32b-instruct`, `https://openrouter.ai/api/v1` | **2** ✅ |
| `.env:OPENCODE_API_KEY` | `sk-wlZV...` | **2** but **mis-categorized**: this is the *coding-agent* key for `opencode.json` (`https://opencode.ai/zen/v1`), **not** Vision. Must add `OPENCODE_VISION_*` separate (or clarify `OPENCODE_API_KEY` is reused for Vision — spec says separate per-provider keys `NVIDIA_API_KEY`, `OPENROUTER_API_KEY`, `OPENCODE_API_KEY`; existing key may alias). |
| `.env.example` | Same as `.env` but without secrets | **2** ✅ (template) |
| `opencode.json:4` | `https://opencode.ai/zen/v1` | **2** (coding-agent) — **not app Vision**; must not be confused with Vision's `OPENCODE_BASE_URL` (which may be same host but different path `/v1` vs `/chat/completions` vs `/responses` — audit required). |
| `docs/VISION_PIPELINE.md:1` | `qwen/qwen3-vl-32b-instruct via OpenRouter` | **4** ✅ (docs) |
| `docs/ACCURACY_AUDIT.md`, `VISION_PIPELINE.md`, etc | `qwen`, `vision` | **4** ✅ |
| `docs/AI_PIPELINE.md:31` | `laguna-s-2.1-free` … `nemotron-…` | **4** (legacy OpenCode fallback chain docs — now stale, must be archived). |

**Searched literals with zero hits in `src/` (confirmed):**
`nvidia`, `NVIDIA_API_KEY`, `integrate.api.nvidia.com`, `nvidia/`, `muse-`, `nemotron-`, `opencode.ai/zen` (except `src/lib/config/index.ts` migration shim that rewrites `opencode.ai` → OpenRouter). This confirms **no production hardcoding of NVIDIA/Opencode models** yet — they are simply **absent**.

---

## 2. Classification summary

| Category | Count (approx) | Verdict |
|----------|----------------|---------|
| **1 Generic abstraction** | ~18 locations (vision adapters, router, fusion, canonical, config schema shells) | ✅ Correct — keep / extend with `VisionProviderId`, `VisionProviderConfig`, `createVisionProvider`, `preflight()`. |
| **2 Env variable** | ~25 vars (`OPENROUTER_*`, `VISION_*`, `AI_*`, `LOCAL_OCR_*`) | Partial — missing 14 vars listed in §1A. |
| **3 Test fixture** | ~12 (vitest env, mock providers) | ✅ No production leakage. |
| **4 Documentation** | ~15 files under `docs/` + error messages | ✅ No prod logic. |
| **5 Hardcoded production value** | **~22** (duplicate `qwen/...` ×5, `https://openrouter.ai/api/v1` ×5, factory branches, diagnostics fallbacks, runner `batchSize=3`, `globalConcurrency=1`, dead `opencode-vision` stub, missing provider IDs) | **Must be eliminated**. After migration, production `src/lib/vision/**`, `src/lib/jobs/**`, `src/lib/ai/**` must contain **zero** occurrences of `"qwen/qwen3-vl-32b-instruct"` and `"https://openrouter.ai/api/v1"` outside comments/tests. |
| **6 Suspicious fallback** | **~8** (`\|\| CANONICAL_MODEL`, `\|\| OPENROUTER_DEFAULT_BASE`, `visionProviderName fallback`, `getModel() \|\| CANONICAL`) | **Must become `CONFIGURATION_ERROR`** when provider is `enabled` but `model/base/key` missing; not silent default. |
| **7 Intentional default** | 2 constants (`OPENROUTER_DEFAULT_MODEL`, `OPENROUTER_DEFAULT_BASE`) in `config/index.ts:6-7` | **Allowed only if** documented as single source in one config module and not duplicated in adapters. Currently duplicated ×3 → violates. After migration, keep **one** typed defaults object, validated via Zod, with explicit doc "defaults only in `src/lib/config/index.ts`". |

---

## 3. Production hardcoding that must disappear after migration

Production files that currently contain literals that **must only appear in `.env` / `.env.example` / docs / test fixtures** after migration:

- `src/lib/config/index.ts:6,7,194-198` — duplicate defaults (consolidate to one).
- `src/lib/vision/openrouter-vision.ts:8,9` — remove `CANONICAL_*` literals; read from `VisionProviderConfig`.
- `src/lib/ai/providers/openrouter.ts:8,9` — same.
- `src/lib/ai/providers/openai.ts:16` — same.
- `src/lib/vision/factory.ts:43-44` — diagnostics fallback literals.
- `src/lib/vision/opencode-vision.ts` — remove stub throw that hardcodes model/base in error; replace with real adapter.
- `src/lib/jobs/runner.ts:879,919,959` — `batchSize`, `globalConcurrency`, `OPENROUTER_MODEL` resolution.

**Post-migration check (Phase 28):**
```powershell
Select-String -Path "src\lib\**\*.ts" -Pattern "qwen/qwen3|openrouter\.ai/api|integrate\.api\.nvidia" | Where-Object { $_.Path -notmatch "\\\\fixtures|\\\\tests" } | Should -BeNullOrEmpty
```

---

## 4. Missing env-driven contract (gap vs spec)

| Spec requirement | Current state | Fix |
|------------------|---------------|-----|
| `VISION_PROVIDER_ORDER=nvidia,openrouter,opencode` | Not defined; `VISION_PROVIDER=auto` single enum | Add `VISION_PROVIDER_ORDER` Zod `string→VisionProviderId[]`, validate unknown IDs, ignore disabled. |
| `VISION_AUTO_FALLBACK=true` | No flag; credit pause only | Add `VISION_AUTO_FALLBACK` boolean. |
| `NVIDIA_ENABLED`, `OPENROUTER_ENABLED`, `OPENCODE_ENABLED` | No per-provider enabled | Add `z.coerce.boolean()` per provider. |
| `NVIDIA_API_KEY`, `OPENROUTER_API_KEY`, `OPENCODE_API_KEY` | Only OpenRouter present | Add per-provider keys (OpenCode Vision key may alias `OPENCODE_API_KEY` used by opencode CLI, but separate var preferred for clarity). |
| `NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1` | Hardcoded base in adapter, not env | Add per-provider base URLs with typed defaults **only** in `config/index.ts` (one place). |
| `NVIDIA_VISION_MODEL`, `OPENROUTER_VISION_MODEL`, `OPENCODE_VISION_MODEL` | Single `OPENROUTER_MODEL` / `VISION_MODEL` | Add per-provider model vars; throw `CONFIGURATION_ERROR` if `enabled && !model`. |
| `VISION_TIMEOUT_MS`, `VISION_MAX_RETRIES`, `VISION_MAX_ADJUDICATIONS`, `VISION_GLOBAL_CONCURRENCY`, `VISION_BATCH_SIZE` | Only timeout + maxPages + maxAdjudications exist; retries/concurrency/batch hardcoded | Add `VISION_MAX_RETRIES=1`, `VISION_GLOBAL_CONCURRENCY=1`, `VISION_BATCH_SIZE=3` + optional per-provider `NVIDIA_MAX_CONCURRENCY` etc. |
| `VisionProviderConfig {id, enabled, apiKey, baseUrl, model}` | No typed object | Add type + `VisionRuntimeConfig`. |
| `VisionProvider {id, analyzePage, analyzeDocument, analyzeAmbiguousMapping, preflight}` | Missing `id`, `analyzeDocument`, `preflight`, `capabilities` | Extend interface; hide `NvidiaVisionProvider` / `OpenRouterVisionProvider` / `OpenCodeVisionProvider` behind it. |
| `preflight()` per provider | Only OpenRouter `verifyVisionPreflight` free function | Move to `provider.preflight(): Promise<VisionPreflightResult>`. |
| `tryProviderChain()` fallback | None | Implement centralized scheduler with `preferredProvider` vs `actualProvider` + `fallbackReason` + `vision-provider-metrics.json`. |
| Capability declaration | None | Add `{visionInput, multiImage, structuredOutput, maxImagesPerRequest:5, maxContextTokens}` per provider/model. |
| Logging `provider, model, stage, document, pages, batch, attempt, latency, status` | Logs `provider: visionProviderName` (often `auto`) not actual | Log `preferredProvider`, `actualProvider`, `model`, `batch`, `attempt`, `latencyMs` without secrets. |
| `.env.example` secrets empty | Has empty `OPENROUTER_API_KEY=` ✅ but missing NVIDIA/Opencode | Add empty placeholders for all three. |
| `.env` gitignored | ✅ `.env` in `.gitignore:34` | Keep; ensure no secret in artifacts. |

---

## 5. Suspicious fallbacks to remove

- `cfg.OPENROUTER_MODEL || cfg.VISION_MODEL || cfg.AI_MODEL || CANONICAL_MODEL` — must become `cfg.providers.openrouter.model` or `CONFIGURATION_ERROR` if enabled provider has empty model. No `|| CANONICAL_MODEL` in production.
- `cfg.OPENROUTER_BASE_URL || cfg.VISION_BASE_URL || cfg.AI_BASE_URL || CANONICAL_BASE_URL` — same; must be `providers[ id ].baseUrl` from config defaults, not scattered `||`.
- `provider === "auto" && !hasKey → return null` silently — must be explicit fallback loop with `CONFIGURATION_ERROR` / `AUTH_ERROR` classification per Phase 12.
- Runner's `if (visionProviderName === "auto") { empty batch } else throw` — must be replaced by `tryProviderChain` that tries next provider in `VISION_PROVIDER_ORDER`.

---

## 6. What is correctly abstracted (keep)

- `src/lib/vision/provider.ts` — `VisionProvider` interface + `VisionPageStructureSchema` + `normalizeRegionType` — retain & extend with `preflight`.
- `src/lib/vision/fusion.ts` + `canonical.ts` + `router.ts` — provider-neutral — keep untouched except to receive `VisionProvider` result (no provider-specific logic).
- `src/lib/jobs/runner.ts` four-way parallel `Promise.all([ocrPromise, visionPromise])` + shared render + global queue — keep architecture, only swap `verifyVisionPreflight` → `provider.preflight()` and `provider.analyzeDocumentStructure` via chain.
- `src/lib/config/index.ts` Zod validation, `clearConfigCache()`, `getConfig()` singleton — extend, not replace.
- Secret hygiene: logs use `keyPresent: Boolean(...)`, never full key — keep.

---

## 7. Audit of literal search completeness

Executed:
```powershell
Select-String -Path "src\lib\**\*.ts" -Pattern "openrouter|nvidia|opencode|qwen|nemotron|integrate\.api|OPENROUTER_API_KEY|NVIDIA_API_KEY|OPENCODE_API_KEY" -CaseSensitive:$false
Select-String -Path "src\**\*.ts" -Pattern "qwen3|nemotron|openrouter\.ai/api" 
Select-String -Path "src\**\*.ts" -Pattern "process\.env|getConfig"
```
All hits captured in tables above. No `integrate.api.nvidia.com` or `qwen/qwen3-vl` appears outside the 22 hardcoded spots listed — confirming **NVIDIA/OpenCode providers are absent, not hardcoded**.

---

*Next step: Phase 2 — Define single `VisionProvider` contract + normalized IDs + env-driven config. See `VISION_PROVIDER_MIGRATION_BASELINE.md` for frozen pre-state. Do NOT edit source until this audit is approved.*
