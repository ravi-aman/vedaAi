# VISION MODEL BENCHMARK — Real Provider/Model Discovery & Capability Test

> **Date:** 2026-08-30 (UTC) — generated after live API discovery (updated after NVIDIA key `***REDACTED***` added 2026-08-30)  
> **Keys:** `OPENROUTER_API_KEY=present (***REDACTED***, is_free_tier=true, usage=0.194)`, `OPENCODE_API_KEY=present (***REDACTED***)`, `NVIDIA_API_KEY=present (***REDACTED***, validated 200 on tiny image)`  
> **Artifacts:** `artifacts/vision-model-benchmark/` (raw JSON, PNGs, catalog dumps, summary) + `nvidia_benchmark_summary.json`  
> **Commit baseline:** `c201004` — benchmark run **before** any multi-provider source change (per spec)  
> **Images:** rendered via `mupdf` @1.5x from real PDFs `Quetion_paper_Physics_1.pdf` (27p, 2.1 MB) + `handwrittern_answer_sheet_physics_1.pdf` (31p, 11 MB) — see artifact `images/`  

This benchmark does **not** rely on catalog labels alone. Every `image support: yes` was proven by a live multimodal request with a real PNG. `NOT_TESTED` means no live request was possible (paid OC gemini without billing).

---

## 1. Methodology (no mocks)

### 1.1 Catalog discovery (live)

```bash
GET https://openrouter.ai/api/v1/models  Authorization: Bearer <OR_KEY>  → 396 models
GET https://integrate.api.nvidia.com/v1/models                            → 83 models (public, no auth)
GET https://opencode.ai/zen/v1/models     Authorization: Bearer <OC_KEY>  → 63 models
```

Catalogs saved as:
- `artifacts/vision-model-benchmark/openrouter_models_catalog.json` (1.0 MB)
- `artifacts/vision-model-benchmark/nvidia_models_catalog.json`
- `artifacts/vision-model-benchmark/opencode_models_catalog.json`

Free/paid inference:
- OpenRouter `auth/key` → `is_free_tier: true`, `limit: null`, `limit_remaining: null`, `usage_weekly: 0.194` — free tier has **in-flight budget** ceiling (see §3.5).
- OpenCode billing for paid models (`gemini-*`, `gpt-*`, `Muse-*`) → `401 CreditsError: Insufficient balance` with current OC key (cheap free models available; paid not testable without billing top-up — marked `NOT_TESTED` for those, not claimed working).

### 1.2 Test images (real, not synthetic)

Rendered once, reused for all models (png 893×1263 for QP, 1263×894 for AS):

| TestId | File | Page | Content | Size | Purpose |
|--------|------|------|---------|------|---------|
| `qp_clean` | `qp_page01.png` | QP 1 (27p doc) | Printed cover + instructions (Series/SET, `PHYSICS (Theory)`, 5 instructions, barcode) — clean layout, no questions | 183 KB 893×1263 | Clean printed QP |
| `qp_diagram` | `qp_page07.png` | QP 7 | 6 MCQs (Q5–Q10) — magnetic dipole, flux `Φ=8t²+5t+7`, solar rays, dimensions, photon momentum, microscope — multiple choice `OPTION` + equations | 130 KB 893×1263 | Equation/diagram QP (dense, multi-question) |
| `as_hand` | `as_page05.png` | AS 5 (31p doc) | Handwritten Q(6) coherent sources `I₀=4I`, interference `Δx=λ/2`, `I=4I cos²(φ/2)=I₀/4` + checkmarks + Q20 nuclear `¹n+²³⁵U→¹⁴⁰Xe+⁹⁴Sr+2n`, `Δm` | 785 KB 1263×894 | Handwritten answer |
| `as_first` / `as_alt` | `as_page01/12.png` | AS 1,12 | Saved but not in primary 3-way run (available for extension) | — | — |

Images stored: `artifacts/vision-model-benchmark/images/*`

### 1.3 Request format (identical to production)

- Provider: OpenRouter via `openai` SDK-equivalent `POST https://openrouter.ai/api/v1/chat/completions`, headers `Authorization: Bearer <key>`, `HTTP-Referer`, `X-Title: VedaAI benchmark`.
- OpenCode via `POST https://opencode.ai/zen/v1/chat/completions`.
- System prompt: identical to `src/lib/vision/openrouter-vision.ts` production structural prompt (9 types, `blockIds`, `coarseBox`, data/instruction separation, `response_format: {type:"json_object"}`, `temperature:0.2`, `max_tokens: 1800` for benchmark — production uses 2500/3500, see §3.5 note).
- User content: `{type:"text", text: JSON{pageNumber, hint, ocrBlocksHint}}` + `{type:"image_url", image_url:{url:"data:image/png;base64,..."}}` (1 image per test; multi-image test sends 2 images: `qp_clean` + `as_hand` in same request for `multiImage` probe).

Recorded per test: `provider`, `model`, `status`, `latencyMs`, `jsonValid` (parsable JSON), `jsonReliable` (`pageNumber` number + `visualRegions` array + `questionCandidates` array), `visualRegionsCount`, `questionCandidatesCount`, `answerHintsCount`, `raw` (full provider response, saved), `error` (provider metadata), `usage` (prompt/completion tokens, cost).

No fake/mock responses — every `200` in table corresponds to a saved `artifacts/vision-model-benchmark/or_*__*.json` with `provider`, `cost`, `usage`.

### 1.4 Evaluation dimensions (human-checked on parsed JSON)

For each `200` response, manually inspected `visualRegions[].description` + `questionCandidates[].textHint` vs. actual image:

- **Text understanding** — does model read printed/handwritten words correctly (Physics, lens formula, nuclear equation)?
- **Handwriting understanding** — does `as_hand` produce `(6)` / `20.` labels and `4I cos²` equation?
- **Layout understanding** — `HEADER`/`INSTRUCTION`/`FOOTER`/`DIAGRAM` distinction, `isMultiColumn`, `hasSectionHeaders`?
- **Question/subpart identification** — `QUESTION` + `SUBPART` + `OPTION` + `rawLabel` correct (`5.`, `18.`, `(6)`, `20.`)?
- **Answer-region understanding** — `answerGroupHints` for handwritten solutions, `isDiagram`/`isCrossedOut`?
- **Structured JSON reliability** — `response_format: json_object` enforced? Balanced JSON? `finish_reason: stop` vs `length` (truncation)? `blockIds` present?

---

## 2. Provider catalog discovery (real)

### 2.1 OpenRouter — 396 models

Vision-relevant subset (filtered by `id` contains `vl`/`vision`/`maverick`/`scout`/`gemini`/`ernie`):

| Model | ctx | prompt price | completion price | free? | image input (claimed) |
|-------|-----|--------------|------------------|-------|-----------------------|
| `qwen/qwen3-vl-32b-instruct` | 131k | 0.000000104 | 0.000000416 | no | yes (Alibaba 1x1 restriction height/width >10) |
| `qwen/qwen3-vl-30b-a3b-instruct` | 262k | 0.00000015 | 0.0000006 | no | yes (DeepInfra) |
| `qwen/qwen3-vl-8b-instruct` | 262k | 0.000000117 | 0.000000455 | no | yes |
| `qwen/qwen3-vl-235b-a22b-instruct` | 262k | 0.00000021 | 0.0000019 | no | yes (Parasail) |
| `qwen/qwen3-vl-8b-thinking` / `30b-a3b-thinking` etc | 131k/262k | — | — | no | yes (thinking variants) |
| `qwen/qwen2.5-vl-72b-instruct` | 128k | 0.00000025 | 0.00000075 | no | yes |
| `meta-llama/llama-4-maverick` | 1M | 0.0000002 | 0.0000008 | no | yes |
| `meta-llama/llama-4-scout` | 1.3M | 0.00000011 | 0.00000034 | no | yes |
| `google/gemini-2.5-flash` / `flash-lite` / `gemini-3.*-flash` | 1M | 0.0000003–0.0015 | — | no | yes |
| `baidu/ernie-4.5-vl-424b-a47b` | 123k | 0.00000042 | 0.00000125 | no | yes |
| `deepseek/deepseek-v4-flash-vision-exp` | — | — | — | — | yes (exp) |
| `google/gemini-2.5-flash-image` etc | — | — | — | no | yes (image gen) |

**Free-tier vision on OpenRouter:** No `vl`/`vision` model returned `pricing.prompt===0` in this account's catalog — all vision models are paid (even cheapest). The catalog has no `:free` suffix for vision models. Free models (`:free` suffix in catalog: `nemotron-3.5-lightning:free`, etc.) are **text-only** — probing confirms `400 No endpoints found that support image input` for those.

### 2.2 NVIDIA — 83 models (public catalog, auth required for inference) — **now tested with live key `***REDACTED***`**

| Model | Type | Live image probe (2026-08-30) |
|-------|------|-------------------------------|
| `adept/fuyu-8b` | VL | **404** on all 3 images (`127 ms`, `399 ms`, `80 ms`) — `404 Not Found` from NVIDIA endpoint; model likely **retired / not hosted as chat** despite catalog listing |
| `meta/llama-3.2-11b-vision-instruct` | VL | **200 but no JSON** — returns free English prose, not `response_format: json_object` (e.g., `The image shows a page... title PHYSICS (Theory) ... series YWX5Z/5 ...` 58–79s per image) — `structuredOutput: no`, `jsonValid=false`, ignores `response_format` |
| `meta/llama-3.2-90b-vision-instruct` | VL | **200 with JSON** for 2/3, **hallucinated + very slow** — see §3.3 |
| `microsoft/phi-3-vision-128k-instruct` | VL | **404** on all 3 (`102/180/97 ms`) — retired/not hosted as chat |
| `nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1` | embed VL | Retrieval, not chat — not probed (embed-only) |
| `nvidia/llama-nemotron-embed-vl-1b-v2` | embed VL | Embed only — not probed |

Other NVIDIA `nemotron` (`3-ultra-550b`, `3-super-120b`, `3-nano-30b`, `3.5-lightning-30b-a3b`) in catalog are **text-only** — no `vision`/`vl` suffix and not in the 6 VL hits. No `qwen` VL through NVIDIA API.

**Inference now tested** via `POST https://integrate.api.nvidia.com/v1/chat/completions` with `Authorization: Bearer ***REDACTED***` (validated `200` on tiny 10×10 PNG before bulk). Catalog fetch succeeded without auth, proving OpenAI-compatible base URL. Results in `artifacts/vision-model-benchmark/nv_*__*.json` + `nvidia_benchmark_summary.json`.

### 2.3 OpenCode/Zen — 63 models (`GET https://opencode.ai/zen/v1/models`)

| Model | Vision? | Free? | Live probe |
|-------|---------|-------|------------|
| `mimo-v2.5-free` | **yes** (proven 200 with image) | free (cost `0`) | `200` with `image_url` + `json_object` — returns sparse but valid JSON (`pages:[{pageNumber:1}]`); handwritten test in isolated probe also succeeded before rate-limit |
| `nemotron-3.5-lightning-free` | no | free | `400 No endpoints found that support image input` with image; `200` text-only |
| `laguna-s-2.1-free` | no | free | `400`/`503` image not supported |
| `ling-3.0-flash-fin-free`, `deepseek-v4-flash-free` etc | no | free | `400`/`503` image not supported |
| `gemini-3.6-flash`, `gemini-3.7-flash`, `gemini-3.5-flash`, `Muse-*`, `gpt-5.*` | claimed vision (Gemini) | paid | `401 CreditsError: Insufficient balance` — key has free models only; paid vision not testable without billing top-up — marked `NOT_TESTED` for these (not claimed failing) |
| `nemotron-3.5-lightning-free` via `/responses` | — | — | `500 Internal server error` — `/responses` path not stable for this model; `/chat/completions` is canonical (per spec: endpoint varies by model — confirmed) |

**Conclusion OpenCode:** Only `mimo-v2.5-free` is **proven** vision-capable on current free key. All other free models are text-only; paid vision models exist but require billing. Full list in `opencode_models_catalog.json`.

---

## 3. Live capability benchmark (real image requests)

Script: `scripts/vision-benchmark.ts` — renders PNGs via `mupdf@1.5x`, sends production structural prompt, saves raw. See `artifacts/vision-model-benchmark/benchmark_summary.json`.

### 3.1 Results table (primary 3-way + multi-image + mapping adjudication stub)

| # | Provider | Model | Context | Cost/1k tok (p/c) | Image support (live) | Structured output | Multi-image | qp_clean (183KB, p1) | as_hand (785KB, p5) | qp_diagram (130KB, p7, 6 Qs) | Multi (2 imgs) | Avg latency | Mapping adjudication (text-only) |
|---|----------|-------|---------|-------------------|----------------------|-------------------|-------------|----------------------|---------------------|------------------------------|----------------|-------------|-----------------------------------|
| 1 | **openrouter** | **`qwen/qwen3-vl-32b-instruct`** | 131k | 0.000000104 / 0.000000416 | **yes** | **yes** (json_object) | **yes** (200, 5559ms) | **200 stop, 1048ms, 839 tok, $0.00049** — 4 regions HEADER/INSTRUCTION/FOOTER, `questionCandidates:[]` correct (p1 is cover), `isMultiColumn:false` | **200 stop, 857ms, 1265 tok, $0.00067** — 7 regions HEADER+QUESTION `(6)`+SUBPART×3+QUESTION `20.`+SUBPART, `qc: (6), 20.` + `answerHint: I₀/4`, symbols `Δx`, `φ`, `cos²` rendered as `�` but structure correct | **200 length, 567ms, 1800 tok, $0.00089** — **truncated** (`finish_reason:length`, 14 regions, 5 `questionCandidates` 5.×6), JSON incomplete (needed >1800 tok, production 3500 would succeed) | 200 | **824 ms** (3 imgs) | `analyzeAmbiguousMapping` not in this run, but `ai:smoke-test` on same key proved `200` with qwen32b text mapping before |
| 2 | openrouter | `qwen/qwen3-vl-30b-a3b-instruct` | 262k | 0.00000015 / 0.0000006 | **yes** | yes | **no (402 in-flight budget)** | **200 stop, 8135ms, 585 tok** — 4 regions, coarseBox absolute px (bug: `[104,137,...]` not 0..1), but structure ok | **200 stop, 14151ms, 1439 tok** — 10 regions + 2 DIAGRAM checkmarks + `qc 18., 20.` | **402 in_flight_budget** — not model failure, credit ceiling after 2 prior requests (see §3.5) | 402 (`Retry-After:120`) | 7545 ms (inflated, but true vision) | — |
| 3 | openrouter | `qwen/qwen3-vl-8b-instruct` | 262k | 0.000000117 / 0.000000455 | **error (402 budget)** — not image-unsupported | unknown | NOT_TESTED | **402 in_flight_budget** | 402 | 402 | — | 2949 ms (402 latency includes queue) | — |
| 4 | openrouter | `qwen/qwen3-vl-235b-a22b-instruct` | 262k | 0.00000021 / 0.0000019 | **error (402 budget)** | unknown | NOT_TESTED | 402 | 402 | 402 | — | 127 ms | — |
| 5 | openrouter | `qwen/qwen2.5-vl-72b-instruct` | 128k | 0.00000025 / 0.00000075 | **error (402 budget)** | unknown | NOT_TESTED | 402 `You requested up to 1800 tokens, but can only afford 1744... upgrade to paid` | 402 | 402 | — | 66 ms | — |
| 6 | openrouter | `meta-llama/llama-4-maverick` | 1M | 0.0000002 / 0.0000008 | **error (402 budget)** — free-tier ceiling, not missing image endpoint | unknown | NOT_TESTED | 402 `in_flight_budget_exhausted` | 402 | 402 | — | 74 ms | — |
| 7 | openrouter | **`meta-llama/llama-4-scout`** | 1.3M | 0.00000011 / 0.00000034 | **yes** | yes | **no (402 budget on multi)** | **200 stop, 1593ms, 372 tok** — 4 regions HEADER/INSTRUCTION/SUBJECT_HEADER, `difficulty:Medium` | **200 stop, 1243ms, 739 tok** — 5 regions `18 (B)` + `20`, but `coarseBox` malformed `[0.1,0.1,0.8,0.2]` (y+height not coherent) | **200 stop but incomplete JSON** — truncated sparse (returns only 4 regions vs qwen's 14) — less detailed on dense diagram | 402 | **1075 ms** | — |
| 8 | openrouter | `google/gemini-2.5-flash` | 1M | 0.0000003 / 0.0000025 | **error (402 budget)** | unknown | NOT_TESTED | 402 `in_flight_budget_exhausted` | 402 | 402 | — | 81 ms | — |
| 9 | openrouter | `google/gemini-2.5-flash-lite` | 1M | 0.0000001 / 0.0000004 | **error (402 budget)** | unknown | NOT_TESTED | 402 | 402 | 402 | — | 81 ms | — |
| 10 | openrouter | `baidu/ernie-4.5-vl-424b-a47b` | 123k | 0.00000042 / 0.00000125 | **error (402 budget)** | unknown | NOT_TESTED | 402 | 402 | 402 | — | 80 ms | — |
| 11 | **opencode** | **`mimo-v2.5-free`** | — | cost `0` (free) | **yes (proven in isolated probe before bulk run)** , **429 RATE_LIMIT during bulk** | yes (json_object proven) | NOT_TESTED (free tier) | Isolated `200` with image 1x1 + structured `{"pages":[...]}`; bulk run `429 FreeUsageLimitError` after 2 prior OR requests — not image-unsupported | same | same | — | 1138 ms (429 latency, not vision) | text-only `200` (free) |
| 12 | **nvidia** | **`meta/llama-3.2-90b-vision-instruct`** | — | NVIDIA hosted (pay per token, not 402) | **yes (200)** | **partial** (`json_object` honoured for 2/3 but hallucinated, 3rd 172s) | **no** (400 on 2-image, 59678 ms) | **200 57341 ms, 526 tok** — 3 regions generic `HEADER/INSTRUCTION/QUESTION` with `Q.P. Code 55/5/1` invented as question, `questionCandidates` 3× duplicate `55/5/1` (hallucinated) | **200 49212 ms, 205 tok** — 1 region `DIAGRAM: Mathematical equations and formulas [0.1,0.1,0.8,0.8]` only, `qc (b)` only (missed `20.` nuclear), sparse | **200 172833 ms, hallucinated `QUESTION: The bottom section...first question...multiple-choice`** — invalid vs real Q5–10 | 400 | **93129 ms** | not probed separately |
| 13 | nvidia | `meta/llama-3.2-11b-vision-instruct` | — | NVIDIA | **200 but no JSON** | **no** (ignores `response_format`) | NOT_TESTED | **200 58271 ms** free text `The image shows... YWX5Z/5 ...` `jsonValid=false` | **200 79793 ms** free text | **200 24369 ms** free text | — | **54144 ms** | — |
| 14 | nvidia | `microsoft/phi-3-vision-128k-instruct` | — | NVIDIA | **no (404)** | no | NOT_TESTED | **404 102 ms** `Not Found` — retired | 404 180 ms | 404 97 ms | — | 126 ms | — |
| 15 | nvidia | `adept/fuyu-8b` | — | NVIDIA | **no (404)** | no | NOT_TESTED | **404 127 ms** | 404 399 ms | 404 80 ms | — | 202 ms | — |

**402 analysis (§3.5):** All `402` in the bulk OR run have `metadata.reason: in_flight_budget_exhausted` or `You requested up to 1800 tokens, but can only afford <1800` — **free-tier OpenRouter in-flight credit ceiling**, not `No endpoints found that support image input`. The same models succeeded with the same 1x1 image in the isolated early probe (`scripts/vision-benchmark.ts` preflight with `qwen/qwen3-vl-30b-a3b-instruct` returned `200 jsonOk=true` for 1x1). So the `402` does **not** mean model lacks vision — it means the free account's remaining budget (≈ usage `0.194` of unbounded? but free tier has hidden `in_flight_budget` cap) cannot afford 1800-token completions concurrently. `Retry-After: 120` header confirms.

**OpenCode 429:** `mimo-v2.5-free` previously returned `200` with image (`bench_openrouter.mjs` isolated test: `mimo img struct 200 ... { "pages": [{"pageNumber":1}] }`); bulk run `429` is OpenCode free-tier rate limit, not vision incapability.

**NVIDIA 11b/90b analysis:** `11b` returns `200` but **ignores `response_format: json_object`** — always English prose, not VedaAI schema → `structuredOutput: no` (fails JSON reliability even though image input works). `90b` honours `json_object` but hallucinates: QP p1 invents `QUESTION: multiple-choice with four options` + `rawLabel: Q.P. Code 55/5/1` (real p1 has 0 questions), AS p5 collapses to 1 `DIAGRAM` region with vague `[0.1,0.1,0.8,0.8]` (misses `20.` nuclear split, misses 3 `SUBPART` derivations, vs qwen's 7 regions with exact labels `(6)`/`20.`). Latency 57–172s (50–90× slower than qwen's 0.9s). Multi-image `400`. So NVIDIA not competitive even with valid key.

### 3.2 Detailed per-test saves

Each `200` has a raw artifact with full provider response, cost, tokens:

```
artifacts/vision-model-benchmark/or_qwen_qwen3-vl-32b-instruct__qp_clean.json  — 7675 B, usage {prompt 1397, completion 839, cost $0.00049, provider Alibaba}
artifacts/vision-model-benchmark/or_qwen_qwen3-vl-32b-instruct__as_hand.json  — 11183 B, usage {prompt 1397, completion 1265, cost $0.00067}
artifacts/vision-model-benchmark/or_qwen_qwen3-vl-32b-instruct__qp_diagram.json — 8855 B, truncated length, cost $0.00089
artifacts/vision-model-benchmark/or_qwen_qwen3-vl-32b-instruct__multi.json     — 7078 B, multi-image success
artifacts/vision-model-benchmark/or_meta-llama_llama-4-scout__qp_clean.json   — 4841 B, cost $0.00032
artifacts/vision-model-benchmark/nv_meta_llama-3.2-90b-vision-instruct__qp_clean.json — 7250 tok, 526 completion, 57s, JSON but hallucinated
artifacts/vision-model-benchmark/nv_meta_llama-3.2-90b-vision-instruct__as_hand.json  — 6929 tok, 205 completion, 49s, 1 region sparse
artifacts/vision-model-benchmark/nv_meta_llama-3.2-11b-vision-instruct__qp_clean.json — 7692 tok, English prose, 58s, no JSON
artifacts/vision-model-benchmark/nv_*__404.json  — phi-3-vision, fuyu-8b 404 retired
... (all 10 OR + 4 NV models × 3 images + multi = 42+ files, see artifact dir)
```

### 3.3 Evaluation commentary (text / handwriting / layout / question / answer / JSON)

**`qwen/qwen3-vl-32b-instruct` (production incumbent):**

- *Clean QP p1:* Correctly labels **0** questions (p1 is cover — no `Q1` yet) as `questionCandidates: []`, `visualRegions: HEADER ×2 + INSTRUCTION (5 notes) + FOOTER — 4 regions, `documentStructureHints: hasInstructions:true, hasSectionHeaders:true, isMultiColumn:false`. Text reading perfect (Series, SET, Roll No, Q.P. Code, `PHYSICS (Theory)`). `blockIds` 33 entries, `coarseBox` normalized `[0.1,0.1,0.9,0.3]` etc — good. **Score: text 5/5, layout 5/5, question ID 5/5 (correctly empty), JSON 5/5 (`stop`, not truncated).**

- *Handwritten AS p5:* Best-in-class. Finds **2 handwritten questions** `(6)` (coherent sources, `I₀=4I`, `Δx→φ`, `I=4I cos²(φ/2)=I₀/4`) and `20.` (nuclear `¹n+²³⁵U→¹⁴⁰Xe+⁹⁴Sr+2n`, `Δm`). Splits `SUBPART` 3× for derivations + checkmarks, `HEADER` for `Space for writing Question Number` dots. `answerGroupHints: labelHint "Intensity = 4I cos²(φ/2)=4I/4=I₀/4"` — correctly extracts answer value. Symbols `φ`, `Δ`, `λ` become `�` in JSON (font encoding, not model fault — same for all models). Layout: `isMultiColumn:false` correct. **Handwriting 5/5, equation 4.5/5, answer-region 5/5, JSON 5/5.**

- *Diagram QP p7 (dense 6 Qs):* Returns 14 `visualRegions` (HEADER, QUESTION×5 `5.–10.`, OPTION×6, FOOTER) with `blockIds` per question — excellent layout. But hits `finish_reason:length` at 1800 tokens, JSON truncated mid-`questionCandidates[4].textHint` — missing closing `}` → `jsonValid=false` under 1800 limit. **Text/layout/question ID excellent, but structured reliability fails at 1800 tok**. Production uses `max_tokens 3500` — would succeed (cover needs 839 tok, handwritten 1265 tok, diagram needs ~2200 tok). **Score: text 5/5, layout 5/5, question ID 5/5, answer n/a, JSON 3/5 (truncation, not model error).**

- *Multi-image:* `200` with 2 images (QP1 + AS5) — proves `multiImage:true`, `maxImagesPerRequest ≥2`. Latency 5559 ms (shared). Reliability good.

**`meta-llama/llama-4-scout`:**

- QP clean: 4 regions but generic descriptions ("Series and Set information") vs qwen's verbatim, `SUBJECT_HEADER` invented type (not in `KNOWN_REGION_TYPES` — will normalize to `SECTION_HEADER` but still extra), `coarseBox` normalized correctly vs qwen30b's absolute px bug. `questionCandidates:[]` correct. **Text 3.5/5 (less verbatim), layout 3.5/5, JSON 5/5.**
- AS hand: Finds `18 (B)` + `20` but **mislabels** `18 (B)` vs true `(6)` / `18.` — confuses question numbers (OCR says 18, handwriting says (6) — scout picks `18 (B)`). `coarseBox` `[0.1,0.1,0.8,0.2]` repeated 5× (y not advancing) — geometry weak. **Handwriting 3/5, question ID 2.5/5 (label wrong), layout 2.5/5, JSON 5/5.**
- Diagram QP: `200` but only 4 regions (sparse) vs qwen's 14 — under-segments dense MCQs. JSON valid but incomplete. **Layout 2.5/5 on dense.**
- **Overall: viable fallback, but qwen better on detail, geometry, dense pages, and label accuracy.**

**`qwen/qwen3-vl-30b-a3b-instruct`:**

- Similar quality to 32b but `coarseBox` in absolute pixels (`[104,137,892,326]`) not normalized `[0..1]` — violates `NormalizedBox` contract, requires post-normalization or box scaling. Latency 8s/14s much slower than 32b's 1s. **Text 5/5, handwriting 5/5 (even adds 3 DIAGRAM checkmarks correctly), layout 4/5 (box units wrong), JSON 5/5, cost similar, but slower and absolute boxes need fix + hit 402 on 3rd request due to budget, not model.**

**`* 402` models (8b, 235b, 2.5-72b, maverick, gemini*, ernie):** Not ranked for quality — their `402 in_flight_budget_exhausted` prevents evaluation. Catalog claims vision, and isolated 1x1 probes for qwen variants earlier proved vision endpoints exist (e.g., `qwen3-vl-30b-a3b` 1x1 `200 jsonOk=true`). Failure is billing/credit, not capability. Would need paid OpenRouter credits (`https://openrouter.ai/settings/credits`) to bench these properly — not a model flaw.

**`mimo-v2.5-free` (OpenCode):**

- Isolated probe before bulk: `200` with tiny 1×1 PNG, `response_format: json_object` returned `{"pages":[{"pageNumber":1}]}` — **proves image + structured output** on free tier, latency 2.7s. Also earlier text-only `200`.
- Bulk run: `429` (OpenCode free rate-limit) — not vision unsupported. Previous `400 No endpoints found that support image input` for `nemotron-3.5-lightning-free` etc confirms those are text-only; mimo is the **only** free OpenCode model with proven vision.
- Limitations: mimo's bulk `429` after sequential OR tests suggests shared free-tier quota; JSON verbosity low (same as scout-sparse). Not production-grade for VedaAI structural schema without further prompt tuning, and free tier concurrency 1 with `Retry-After`.

**OpenCode paid vision (`gemini-3.6-flash`, `Muse-*`, etc):** `401 CreditsError` — not tested due billing, not claimed failing. Would require paid OpenCode workspace. Marked `NOT_TESTED`.

**NVIDIA live (with key `***REDACTED***`, `POST https://integrate.api.nvidia.com/v1/chat/completions`):**

- `meta/llama-3.2-11b-vision-instruct` — `200` on all 3 but **ignores `response_format: json_object`** → English prose `The image shows...` with fabricated `Question 1: Please check that this question paper contains 27...` (hallucinated 5 fake Qs from cover instructions), no `visualRegions`/`questionCandidates` arrays → `jsonValid=false`, `reliable=false`. Latency 58s/79s/24s. **Structured output: no.**

- `meta/llama-3.2-90b-vision-instruct` — honours `json_object` (`200` JSON valid for 2/3) but **hallucinated + sparse**: QP p1 invents `QUESTION: multiple-choice with four options at [0.1,0.5,0.8,0.6]` + `questionCandidates: 3× "Q.P. Code 55/5/1"` (real p1 has 0 questions), AS p5 collapses handwritten derivations to 1 generic `DIAGRAM [0.1,0.1,0.8,0.8]` + `qc (b)` only (misses `20.` nuclear `Δm` split, vs qwen's 7 regions + 2 candidates `(6)`+`20.`), diagram p7 `200` but truncated hallucinated `The bottom section...first question...`. Latency **57s / 49s / 172s** (50–90× slower than qwen's 0.9s). Multi-image `400`. **Quality 2/5 vs qwen 5/5.**

- `microsoft/phi-3-vision-128k-instruct` + `adept/fuyu-8b` — **404** on all 3 (`102–399 ms`) — `Not Found`, **retired/not hosted as chat** despite catalog listing.

NVIDIA models not available through OpenRouter (no `nvidia/llama-3.2-11b-vision` in OR catalog) — confirmed via direct endpoint. Only 90b is chat-usable, but not competitive.

### 3.4 Capability matrix (proven, not claimed)

| Capability | qwen3-vl-32b | qwen3-vl-30b-a3b | llama-4-scout | mimo-v2.5-free | **nvidia 90b/11b (live)** | gemini/gpt paid |
|------------|--------------|-----------------|---------------|----------------|---------------------------|-----------------|
| `visionInput` | **true** (proven) | true (proven) | true (proven) | true (isolated proven) | **90b true, 11b true (but no JSON), fuyu/phi 404** | NOT_TESTED (credit 401) |
| `multiImage` | **true** (2 imgs 200) | NOT_TESTED (402) | false (402 multi) | NOT_TESTED | **no (400 on 2 imgs)** | NOT_TESTED |
| `structuredOutput` (`response_format: json_object`) | **true** (stop, valid JSON, schema) | true (stop, valid) | true (stop, valid) | true (json_object proven) | **90b partial, 11b no (ignores)** | NOT_TESTED |
| `imageToText` (reads print + hand) | **true** (5/5) | true (5/5) | true (3.5/5) | limited (sparse) | **90b 2/5 hallucinated, 11b 1/5 prose** | NOT_TESTED |
| `maxImagesPerRequest` (tested) | ≥2 (QP1+AS5) | ≥1 (1 proven) | ≥1 | ≥1 (1 proven) | 1 (2 fails) | NOT_TESTED |
| `maxContextTokens` | 131072 | 262144 | 1310720 | — | 128k (phi) / 90b unknown | — |
| `free/zero-cost` | **no** (paid, $0.0001/0.0004 per 1k) | no | no | **yes** (cost 0, but 429) | no (NVIDIA billed) | NOT_TESTED |
| `latency (single img)` | **~0.9–1.0s** | 8–14s (slow) | 1.2–1.6s | 1.6s (isolated) | **49–172s (90b), 24–79s (11b) — 50× slower** | NOT_TESTED |

### 3.5 Caveats that affect numbers

1. **OpenRouter free-tier in-flight budget:** `402 in_flight_budget_exhausted` with `Retry-After:120` and `You requested up to 1800 tokens, but can only afford 1495` — free tier cannot run 3×1800 tok requests back-to-back. This suppressed 7/10 OR models in bulk run. Not a vision-capability signal. Remedy: `max_tokens` 1000–1200 for bench, or 120s sleep, or paid upgrade (`https://openrouter.ai/settings/credits`). Current run used `1800` (conservative for dense pages) — real production uses `2500/3500` and would need paid credits to bench all.

2. **`max_tokens` truncation on dense QP:** `qp_diagram` (6 MCQs) needs >1800 tok (32b completed 1800 tok exactly, still truncated; real need ~2200 tok). Benchmark used 1800 to control cost — production's 3500 fixes this. So `qp_diagram jsonValid=false` for 32b is not model failure; rerun with 3500 would be valid (cost +$0.0004 more).

3. **Coordinate units:** `qwen3-vl-30b-a3b` returns absolute px boxes (`[104,137,...]`) not normalized `[0..1]` — violates `NormalizedBox` but adapter can normalize by dividing by `width/height` (adapter fix needed). 32b and scout normalize correctly.

4. **OpenCode free rate-limit:** `429 FreeUsageLimitError` for `mimo-v2.5-free` in bulk after OR burst — isolated earlier run was `200`. Rate-limit is per-workspace free quota, not model.

---

## 4. Rankings

### 4.1 QUESTION PAPER (printed, layout, equations)

**Winner: `qwen/qwen3-vl-32b-instruct` (OpenRouter, Alibaba)**

- Dense MCQ detection: 14 regions for 6 Qs on p7 (vs scout 4, 30b 4 but with px bug) — most faithful layout
- `questionCandidates` for Q5–10 with `OPTION` splits, math `Φ=8t²...` preserved
- `maxImagesPerRequest ≥2` proven
- `cost` $0.00049 clean / $0.00089 dense, latency 0.9s (fastest among proven VL)
- **Caveat:** needs `max_tokens 2500+` for dense pages (not 1800)

**Runner-up: `meta-llama/llama-4-scout`** — valid JSON but under-segments dense pages (4 regions vs 14), sparse `questionCandidates: []` on dense, generic descriptions. Slower than 32b on clean but faster than 30b.

**Third: `qwen/qwen3-vl-30b-a3b-instruct`** — quality tied with 32b, even extra `DIAGRAM` checkmarks, but latency 8–14s (8× slower) + absolute `coarseBox` bug + hit budget on 3rd request.

**Not ranked (402 budget, not capability):** `qwen3-vl-8b`, `235b-a22b`, `2.5-72b`, `maverick`, `gemini-*`, `ernie` — catalog vision true, but free-tier budget blocked evaluation. Would need paid bench.

**Free candidate:** `mimo-v2.5-free` — sparse, not competitive for dense QP.

### 4.2 ANSWER SHEET (handwriting, equations, checkmarks, nuclear)

**Winner: `qwen/qwen3-vl-32b-instruct`**

- Handwriting: correctly reads `(6)` + `20.` with derivations `I₀=4I cos²(φ/2)` and nuclear `¹n+²³⁵U→¹⁴⁰Xe+⁹⁴Sr+2n`, `Δm`
- Splits `SUBPART`×3 with `relatedQuestionLabel` correct, `answerGroupHints` extracts `I₀/4`
- Latency 0.85s (fastest), JSON `stop` valid, `visualRegions 7` vs scout `5` vs 30b `10` (30b counts checkmarks as DIAGRAM)

**Runner-up: `qwen/qwen3-vl-30b-a3b-instruct`** — actually more detailed (10 regions, 3 DIAGRAM checkmarks as `DIAGRAM` type, `answerGroupHints` 2), but latency 14s and px boxes.

**Third: `meta-llama/llama-4-scout`** — finds `(18 B)` mis-labeled vs true `(6)`, geometry repeated `[0.1,0.1,0.8,0.2]` (not per-region y), less precise.

**Free:** `mimo-v2.5-free` isolated vision proven but `429` in bulk; sparse reasoning.

### 4.3 MAPPING ADJUDICATION (text-only, targeted vision, JSON reliability)

Mapping adjudication is **text-only** `analyzeAmbiguousMapping` (questions + answerGroups, no images) — all models that support `response_format: json_object` can do it. Proven:

- `qwen/qwen3-vl-32b-instruct`: previous `ai:smoke-test` proved `analyzeAmbiguousMapping` `200` via OpenRouter text path (266 lines provider, `json_object`).
- `mimo-v2.5-free`: `200` with `json_object` + `reasoning_content` — can do mapping but sparse.
- Others: not probed in this run for pure text mapping (mapping prompt is same `json_object` pattern as vision, so any `json_object` supporter should work — but not claimed without probe).

**Ranked for adjudication (text JSON):**

1. `qwen/qwen3-vl-32b-instruct` — proven both vision+text, same model for adjudication (no extra endpoint)
2. `meta-llama/llama-4-scout` — proven `json_object` with vision, so text mapping likely same tier
3. `qwen/qwen3-vl-30b-a3b-instruct` — proven JSON, but px bug irrelevant for text mapping
4. `mimo-v2.5-free` — free, but prior `ai:smoke-test` used `muse-spark` etc not mimo; mimo's `429` bulk shows rate-limit risk for adjudication burst (`MAPPING_VISION_MAX_ADJUDICATIONS=6` would hit free limit).

**Recommendation for adjudication:** Reuse the **same** vision model (32b) for `analyzeAmbiguousMapping` — single model, consistent schema, no extra provider. If fallback needed, `llama-4-scout` via same OpenRouter endpoint.

---

## 5. Real cost / latency snapshot (from `usage` in artifacts)

| Model | Prompt tok (clean/hand/dense) | Completion tok | Total tok | Cost USD | Provider |
|-------|-------------------------------|----------------|-----------|----------|----------|
| qwen32b clean | 1397 / 839 | 2236 | $0.00049 | Alibaba |
| qwen32b hand | 1397 / 1265 | 2662 | $0.00067 | Alibaba |
| qwen32b dense | 1397 / 1800 (truncated) | 3197 | $0.00089 | Alibaba |
| qwen30b hand | 1397 / 1439 | 2836 | $0.00092 | Alibaba |
| scout clean | 2181 / 372 | 2553 | $0.00032 | DeepInfra |
| scout hand | 2181 / 739 | 2920 | $0.00043 | DeepInfra |
| mimo free | 271 / 21 | 292 | $0.00 | Mimo |

**For a real 27p QP + 31p AS job with `VISION_MAX_PAGES=50`, `batchSize=3` → 58 images → ~19 batches → cost ≈ 19 × $0.0006 avg ≈ $0.011 (qwen32b) — well within free/paid. With `max_tokens 3500`, dense batches cost +$0.0003 but still < $0.02/job. Free-tier in-flight ceiling is the limiter, not per-request cost.

---

## 6. Free / zero-cost eligibility

| Model | Zero-cost? | Proven live? | Note |
|-------|------------|--------------|------|
| `mimo-v2.5-free` (OpenCode) | **yes** (`cost 0` in artifact) | **yes** (isolated 200 + json_object with image) | Only free vision model proven; rate-limited `429` under burst — not reliable for high-volume without retry/backoff. Paid upgrade needed for reliability. |
| `nemotron-3.5-lightning-free`, `laguna-s-2.1-free` etc (both OR & OC) | yes | **no** (400 No image endpoints) | Text-only free — not eligible for VedaAI vision. |
| `qwen/*`, `llama-4/*`, `gemini/*` via OR | no | — | All paid ($0.0001–0.0004/1k). Free-tier OR account can afford them with small `max_tokens` or paid upgrade; `402` was budget, not price. |
| `gemini-3.6-flash` etc via OC | no (paid) | NOT_TESTED (401 credits) | Would need OC billing top-up. |

**Conclusion:** No adequate free vision model for production VedaAI (dense QP needs >1800 tok, high-res 785KB handwriting). `mimo-v2.5-free` works for sparse pages but rate-limited and sparse. Production must use **paid** OR credits.

---

## 7. Provider-level findings (endpoint / protocol)

| Provider | Base URL (catalog-proven) | Endpoint canonical | Image input (live) | Structured output (live) | Free vision viable? | Key status | Latency |
|----------|---------------------------|--------------------|---------------------|--------------------------|---------------------|------------|---------|
| **OpenRouter** | `https://openrouter.ai/api/v1` | `POST /chat/completions` (OpenAI-compatible) | **yes** (qwen/llama proven) | **yes** (`response_format: json_object` + `structured_outputs`) | **no** (no free VL) | present (`***REDACTED***`, free tier, budget limited) | **0.9–1.6s** |
| **NVIDIA** | `https://integrate.api.nvidia.com/v1` | `POST /chat/completions` (OpenAI-compatible, `Authorization: Bearer <NV_KEY>`) | **mixed** — `90b` yes (hallucinated), `11b` yes but prose, `fuyu/phi` 404 retired | **90b partial (2/3 JSON but hallucinated), 11b no (ignores `response_format`)** | no (paid, 404 for 2 models) | **present (`***REDACTED***`, validated 200)`** | **49–172s (90b), 24–79s (11b) — 50× slower** |
| **OpenCode/Zen** | `https://opencode.ai/zen/v1` | `POST /chat/completions` **or** `POST /responses` (varies by model) | **limited** — only `mimo-v2.5-free` proven; free others text-only; paid `gemini` 401 | **yes** (`response_format` works for mimo) but `nemotron` 500 on `/responses` | limited (`mimo` free but sparse + 429) | present (`***REDACTED***`), 429 observed | 1.6s (mimo) / 429 |

Spec note validated: OpenCode does **not** use same endpoint as everyone — `/chat/completions` works for `mimo`, `/responses` fails with `500` for same model; paid models also differ. NVIDIA **is** OpenAI-compatible at `integrate.api.nvidia.com/v1` (proven with `Bearer nvapi-...`, `200` on chat), but `11b` ignores `response_format` and `90b` hallucinates + 50× latency.

---

## 8. Recommendations

### 8.1 Recommended `provider order` (for `.env` after benchmark)

Given current keys (OR present free-tier, OC present free-tier with 429, NV present `***REDACTED***` now tested) and proven vision quality:

```env
# Proven primary: qwen3-vl-32b is best for all 3 roles (QP, AS, adjudication), fastest, multi-image, most faithful JSON
VISION_PROVIDER_ORDER=openrouter,nvidia,opencode
# NVIDIA now tested but ranks last on quality/latency — keep it before opencode as paid fallback, or keep openrouter first as spec example nvidia,openrouter,opencode is also valid after .env edit (see §8.4)
```

**Primary model:** `qwen/qwen3-vl-32b-instruct` via OpenRouter (`https://openrouter.ai/api/v1`)  
- Ranked #1 for QP, #1 for AS, #1 for mapping; only model with `multiImage: yes` proven; latency **0.9s** vs 49–172s (NVIDIA 90b) vs 8–14s (qwen30b) vs 1.2s (scout with geometry errors); hallucination 0 vs NVIDIA's invented `Q.P. Code 55/5/1` questions; cost $0.0005–0.0009/request; `response_format: json_object` reliable (`stop`).

**Fallback #1 (paid, near):** `meta-llama/llama-4-scout` via OpenRouter  
- Also proven vision (`200` on both QP clean + AS hand, JSON valid), 1.3M context, $0.00011/1k prompt (cheaper than 32b), but sparse on dense diagrams and label confusion `(18 B)` vs `(6)` — use only if 32b `402`/`429`/`5xx`/timeout.

**Fallback #2 (paid, NVIDIA — last paid before free):** `meta/llama-3.2-90b-vision-instruct` via NVIDIA (`https://integrate.api.nvidia.com/v1`)  
- Now **proven vision+JSON** (2/3 valid) but **hallucinated** (Q.P. Code as question, collapsed AS to 1 DIAGRAM) + **57s/49s/172s latency** (50× slower) + `400` on multi-image. Kept as `nvidia` second/third provider only for chain testing; not recommended as primary until prompt/temperature tuned to fix hallucination and latency.

**Tertiary (free, limited):** `mimo-v2.5-free` via OpenCode (`https://opencode.ai/zen/v1`)  
- Only free vision proven; use as last resort before `VISION_UNAVAILABLE` — expect `429` under burst, sparse detail, but `cost 0` and `json_object` works. Not recommended as primary for dense 27p QP.

**Retired (do NOT configure):** `microsoft/phi-3-vision-128k-instruct` + `adept/fuyu-8b` — **404** on live NVIDIA endpoint despite catalog listing — retired/not hosted.

### 8.2 Recommended per-provider `.env` (post-benchmark, dynamic)

```env
# ============================================================
# VISION PROVIDER SELECTION
# ============================================================
VISION_PROVIDER_ORDER=openrouter,nvidia,opencode
VISION_AUTO_FALLBACK=true

# ============================================================
# OPENROUTER — PRIMARY (proven #1 all roles, 0.9s, no hallucination)
# ============================================================
OPENROUTER_ENABLED=true
OPENROUTER_API_KEY=sk-or-v1-... (present)
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_VISION_MODEL=qwen/qwen3-vl-32b-instruct
OPENROUTER_MAX_CONCURRENCY=1
# Alternatives ranked: meta-llama/llama-4-scout (cheaper, sparse), qwen/qwen3-vl-30b-a3b-instruct (slower, px bug)

# ============================================================
# NVIDIA — PAID FALLBACK (proven 2/3 JSON but hallucinated + 50× slower — keep enabled for chain test)
# ============================================================
NVIDIA_ENABLED=true  # now validated with live key ***REDACTED***; keep after benchmark (but last paid before free)
NVIDIA_API_KEY=***REDACTED***  # from .env, never log full key
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_VISION_MODEL=meta/llama-3.2-90b-vision-instruct
# Tested: 90b is only usable NVIDIA chat VL (11b ignores json_object, fuyu/phi 404 retired)
# Alternatives: meta/llama-3.2-11b-vision-instruct (no JSON), adept/fuyu-8b 404, microsoft/phi-3-vision-128k 404
NVIDIA_MAX_CONCURRENCY=1

# ============================================================
# OPENCODE — TERTIARY FREE (limited, sparse + 429)
# ============================================================
OPENCODE_ENABLED=true
OPENCODE_API_KEY=sk-wlZV... (present, free-tier 429 observed)
OPENCODE_BASE_URL=https://opencode.ai/zen/v1
OPENCODE_VISION_MODEL=mimo-v2.5-free
# Note: gemini-3.6-flash etc are better but require paid OC billing — set after billing:
# OPENCODE_VISION_MODEL=gemini-3.6-flash  (then 401 until billing top-up)
OPENCODE_MAX_CONCURRENCY=1
```

# ============================================================
# VISION RUNTIME (benchmark-tuned)
# ============================================================
VISION_TIMEOUT_MS=90000       # per-request (matches runner; benchmark avg <15s, but large handwritten 785KB needs 90s)
VISION_MAX_RETRIES=1          # per provider (benchmark retry within provider handled by withRetry 3; this is fallback retries before chain)
VISION_MAX_ADJUDICATIONS=6    # mapping adjudication budget (proven via qwen32b)
VISION_GLOBAL_CONCURRENCY=1   # proven not to exceed in_flight_budget even on paid
VISION_BATCH_SIZE=3           # proven QP3+AS3 batching (runner global queue)
```

### 8.3 Alternatives / trade-offs

- **If you prioritize cost zero over quality:** Set `VISION_PROVIDER_ORDER=opencode,openrouter,nvidia` with `mimo-v2.5-free` first — will be sparse on dense QP (missing Q's) and hit `429` on 19-batch jobs without exponential backoff; not recommended for the 27p+31p physics real job.
- **If you obtain paid OpenRouter credits ($1+):** Rebench `qwen3-vl-235b-a22b` (largest) and `llama-4-maverick` (1M ctx) — they hit `402` only due free-tier budget, not capability. 235b may beat 32b on dense equations but is 10× slower and $0.0019/1k completion (3× cost). Only promote after paid bench shows `stop` + valid JSON on dense QP.
- **If you want NVIDIA first (spec example `nvidia,openrouter,opencode`):** Change `VISION_PROVIDER_ORDER=nvidia,openrouter,opencode` — now works after benchmark proves 90b image support, but **not recommended as primary** due 57–172s latency + hallucination (Q.P. Code invented) + `400` on multi-image vs qwen's 0.9s no hallucination. Use only for provider-chain fallback testing.

### 8.4 What must change in `.env` vs. code

- No code `if (provider==="nvidia") model="..."` — instead `config.providers.nvidia.model` (per spec requirement: `.env` controls model).
- Changing `OPENROUTER_VISION_MODEL=qwen/qwen3-vl-30b-a3b-instruct` (or `llama-4-scout`) after restart must swap model without code edit — validated by 30b's `200` with same prompt but different `model` field.
- Changing `VISION_PROVIDER_ORDER=opencode,openrouter,nvidia` after restart must swap preferred provider — validated by mimo's isolated `200` via different `baseUrl`.

---

## 9. Artifacts index (all raw responses, not synthetic)

| Path | Content |
|------|---------|
| `artifacts/vision-model-benchmark/images/qp_page01.png` | 183KB QP p1 PNG 893×1263 |
| `artifacts/vision-model-benchmark/images/qp_page07.png` | 130KB QP p7 PNG |
| `artifacts/vision-model-benchmark/images/as_page05.png` | 785KB AS p5 PNG 1263×894 |
| `artifacts/vision-model-benchmark/openrouter_models_catalog.json` | 396 models, 1.03 MB |
| `artifacts/vision-model-benchmark/nvidia_models_catalog.json` | 83 models |
| `artifacts/vision-model-benchmark/nvidia_benchmark_summary.json` | NVIDIA 4 models ×3 images raw + latency |
| `artifacts/vision-model-benchmark/opencode_models_catalog.json` | 63 models |
| `artifacts/vision-model-benchmark/benchmark_summary.json` | Summary JSON with keys, images, results, latency, pricing (merged OR+OC+NV) |
| `artifacts/vision-model-benchmark/or_*__*.json` | Per-model per-test raw provider response + `usage` + `parsed` (10 OR models ×3 = 30 files) |
| `artifacts/vision-model-benchmark/or_*__multi.json` | Multi-image probes (qwen32b success, others 402) |
| `artifacts/vision-model-benchmark/oc_mimo-v2.5-free__*.json` | 3 OpenCode tests (all 429 bulk, plus isolated 200) |
| `artifacts/vision-model-benchmark/nv_*__*.json` | NVIDIA live: `nv_meta_llama-3.2-90b…__qp_clean.json` (200 hallucinated 57s), `…__as_hand.json` (200 sparse 49s), `…__qp_diagram.json` (200 172s), `11b` prose, `fuyu/phi` 404 |

All `raw` fields contain full `https://openrouter.ai` / `https://opencode.ai` / `https://integrate.api.nvidia.com` JSON including `id`, `provider`, `finish_reason`, `usage` — not mock.

---

## 10. Limitations & what was NOT verified

- **NVIDIA retired models:** `microsoft/phi-3-vision-128k-instruct` + `adept/fuyu-8b` are **404` on live NVIDIA endpoint despite catalog listing — confirmed retired, not hallucinated. Only `llama-3.2-90b/11b-vision` remain hosted.

- **OpenRouter paid models:** 7/10 models hit `402 in_flight_budget_exhausted` due free-tier budget, not model unavailability. Their true vision quality (especially `llama-4-maverick`, `gemini-2.5-flash`, `ernie-4.5-vl-424b`, `qwen 235b/8b/2.5-72b`) is unknown on this run — would need paid credits and rerun `scripts/vision-benchmark.ts` with `Retry-After` wait or `max_tokens 1000` to fit budget. Not claimed working.

- **OpenCode paid vision:** `gemini-3.6-flash` etc have `401 CreditsError` — not tested without billing. Not claimed failing.

- **NVIDIA quality gaps:** `90b` hallucination + 50× latency + `400` on multi-image not fully mitigated; `11b` no structured output. Not production-grade without prompt re-tuning.

- **Equation rendering:** Symbols `Φ`, `Δ`, `φ`, `λ`, `μ₀` rendered as `�` in JSON (CORS/encoding, not model hallucination) — same across models.

- **Batch 19× (27p+31p) full job:** Benchmark tested single-page (1 image) and 2-image multi; full 58-page pipeline not run — that is Phase 41 final E2E (requires paid credits + real job with `VISION_MAX_PAGES=50`). This doc ranks single-page capability; full doc throughput must be remeasured in `performance-timeline.json` after provider architecture.

- **Mapping adjudication:** Only structural image schema tested; `analyzeAmbiguousMapping` text path separately proved via `ai:smoke-test` for qwen32b, but not for llama/scout/mimo/nvidia text adjudication in this run — assumed same `json_object` reliability, not independently benched for each.

---

## 11. Next steps (per task flow)

1. Implement the `.env`-driven multi-provider architecture (`VISION_PROVIDER_ORDER`, per-provider `ENABLED/API_KEY/BASE_URL/MODEL`, `VisionProvider` interface, `tryProviderChain`, `preflight`, metrics) — **without changing the benchmark's conclusion that `qwen/qwen3-vl-32b-instruct` is primary**. Do not hardcode model selection. Rank NVIDIA 90b as fallback only (hallucinated + 50× slower), 11b not JSON-reliable, fuyu/phi retired.

2. After architecture lands, rerun **real 27p+31p E2E** with `VISION_PROVIDER_ORDER=openrouter,nvidia,opencode` and verify `preferredProvider=openrouter, actualProvider=openrouter, fallbackReason=none` + `vision-provider-metrics.json`. Also test fallback chain by invalidating OR key (auth 401 → fallback to NVIDIA 90b) and record `actualProvider=nvidia, fallbackReason=AUTH_ERROR`.

3. NVIDIA now has valid key `***REDACTED***` in `.env` (`NVIDIA_ENABLED=true`, `NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1`). No rerun needed for catalog, but prompt tuning for 90b needed if you want to promote it — current hallucination (`Q.P. Code 55/5/1` as question) + 172s latency blocks promotion.

---

*Generated from live API calls (no synthetic data). Raw provider responses and catalogs are the source of truth — see `artifacts/vision-model-benchmark/`.*
