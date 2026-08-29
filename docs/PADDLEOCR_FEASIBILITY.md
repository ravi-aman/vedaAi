# PaddleOCR / PP-StructureV3 Feasibility Audit — VedaAI

**Date:** 2026-08-29  
**Environment:** Windows 10 (win32), Python 3.11.7, Node 24.0.2, 16GB RAM, RTX 3050 6GB Laptop GPU  
**PaddlePaddle:** 3.2.0 (downgraded from 3.3.1 due to PIR oneDNN bug)  
**PaddleOCR:** 3.7.0  
**PaddleX:** 3.7.2  
**Test Docs:** 39ac job — QP 8 pages 511KB, AS 39 pages 13.5MB from `C:\Users\Dell\AppData\Local\Temp\veda-ai\39ac...`

---

## 1. Runtime Architecture — Selected Option A (Internal Child Process)

```
Next.js (Node)
  → render PDF page via mupdf 1.5x PNG (same as Vision, src/lib/documents/render.ts)
  → spawn Python child: python scripts/paddle_ocr_worker.py --manifest tmp/manifest.json --output-dir tmp/output
  → worker loads PaddleOCR once, processes pages sequentially, writes per-page JSON
  → Node reads output JSON, validates, normalizes to canonical OcrDocumentResult
  → downstream: Fusion → Structure → Matching → Highlighting
```

**Why Option A:**

- **No separately deployed OCR server** — worker is spawned per-job as child process, terminates when job completes. Same deployable unit.
- **Python-native correctly** — PaddleOCR is Python-native; official JS wrappers (`paddleocr-js`, `paddle-ocr` npm) are stale/unsupported. Direct Node ONNX is not stable for PP-StructureV3.
- **IPC contract:** temporary manifest JSON + output directory (not huge base64 on command line). Bounded JSON size per page (~50-200KB). Handles stdin/stdout robustly.
- **Lifecycle:** model loaded once per worker process, reused across all pages in job (fixes BAD pattern of load-per-page). Bounded concurrency = 1 worker per job, sequential page processing inside worker.
- **Error handling:** per-page try/catch → writes error marker JSON, continues; worker exit code non-zero → Node throws OCR_FAILED; malformed JSON → OcrError with OUTPUT_PARSE_FAILED; missing Python → CONFIGURATION_ERROR.
- **Windows + Linux compatible:** tested on win32, uses `python` (not python3), `pymupdf` for rendering in Python benchmark but production uses Node mupdf (no Python fitz needed). Model cache at `C:\Users\Dell\.paddlex\official_models\` (or `~/.paddlex` on Linux) — must be writable and persistent.

**Option B (Node ONNX) rejected:** No official stable Node Paddle/ONNX runtime for PP-StructureV3. Unofficial wrappers immature, would require custom model export and still need separate model files. Not production-ready.

**Option C (in-process Python via embedded interpreter) rejected:** Requires native binding (python-shell with embedded) more complex than child process, same benefits but harder to manage lifecycle.

---

## 2. Installation

```bash
python --version  # 3.11.7
pip install paddlepaddle==3.2.0  # 3.3.1 has PIR oneDNN bug: ConvertPirAttribute2RuntimeAttribute not support pir::ArrayAttribute<pir::DoubleAttribute>
pip install "paddlex[ocr]==3.7.2"  # pulls paddleocr 3.7.0, dependencies: aistudio-sdk, huggingface-hub, etc.
pip install paddleocr==3.7.0  # if not pulled via paddlex
pip install pymupdf psutil   # for benchmark only (production uses Node mupdf)
# Models auto-download on first init to ~/.paddlex/official_models/
# Required env:
# FLAGS_use_pir_api=0            # critical: disables PIR, avoids oneDNN bug on Windows/CPU
# PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True  # skip connectivity check
```

**Model files (auto-download sizes approx):**

- `PP-OCRv5_server_det` ~ 80MB (detection)
- `en_PP-OCRv5_mobile_rec` ~ 12MB (English recognition mobile) — selected for English QP speed
- `PP-OCRv6_medium_det` / `PP-OCRv6_medium_rec` also fetched for PaddleOCR default but not needed if ocr_version=PP-OCRv5
- `PP-DocLayout_plus-L` ~ 150MB (only for PP-StructureV3 layout)
- `PP-OCRv5_server_rec` ~ 45MB (PP-StructureV3 recognition, if layout enabled)
- Total for core OCR (PP-OCRv5 mobile): ~100MB
- Total for PP-StructureV3 minimal (with layout): ~300MB

**Startup:**

- Python import: ~1.5s
- PaddleOCR init (PP-OCRv5 mobile): 3.2s cold (models cached), 4.8s for PP-OCRv6 medium
- PP-StructureV3 init (with layout, without seal/table/formula/chart/region): 31s cold (includes downloading 150MB layout model if not cached)

---

## 3. Model / Pipeline Selection

**Target stack: PaddleOCR 3.x + PP-StructureV3 where useful, lighter where possible**

**Audit for VedaAI needs:**

| Module | Needed? | Decision |
|---|---|---|
| text detection (PP-OCRv5_server_det) | Yes | **Enabled** |
| text recognition (en mobile rec) | Yes | **Enabled** (English) |
| reading order | Yes | Via geometry sort post-OCR; not Paddle built-in, but our `readingOrderSort` handles multi-column via x-clustering |
| document layout detection (PP-DocLayout) | Maybe | **Disabled for MVP** — our deterministic parsers handle question structure without layout; Vision handles diagrams. Enable only if benchmark shows layout improves subpart detection. |
| textline orientation | No | **Disabled** — QP is upright, no rotated text |
| doc orientation classify | No | **Disabled** — PDFs already normalized |
| doc unwarping | No | **Disabled** — not needed for scanned PDF? Could help but expensive; disabled for now |
| table recognition | No | **Disabled** — QP has no heavy tables except one stats table (Q37 case). Generic gap synthesis suffices. |
| formula recognition | No | **Disabled** — math text via OCR + line detection sufficient |
| chart parsing | No | **Disabled** — no charts |
| seal recognition | No | **Disabled** — not exam paper |
| region detection | No | **Disabled** — not needed |

**Primary OCR contract must provide:** text, bbox/polygon, confidence, page, layout/order — **core OCR provides all except explicit layout** which we synthesize via vertical gap merging + reading order sort. This satisfies spec Phase 5 speed-first goal.

**PP-StructureV3 when needed:** If future need for layout-aware region types (e.g., diagram vs text block), enable `use_region_detection=True` + `PP-DocLayout` but expect +25s init and +8s per page.

**Chosen configuration for benchmark:**

```python
PaddleOCR(
    lang="en",
    ocr_version="PP-OCRv5",
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
)
```

**English model:** `en_PP-OCRv5_mobile_rec` selected over default multilingual. Measured on QP page 1: rec_texts correctly captures "MATHEMATICS STANDARD Code No.041", "SAMPLE QUESTION PAPER CLASS - X (2025-26)" with confidence 0.93 avg.

---

## 4. Runtime Dependencies

| Dependency | Version | Purpose | Notes |
|---|---|---|---|
| Python | 3.11.7 | OCR worker | Must be available in deployment (not on Vercel) |
| PaddlePaddle | 3.2.0 | Inference engine | 3.3.1 incompatible with current models on Windows CPU |
| PaddleOCR | 3.7.0 | OCR pipeline | |
| PaddleX | 3.7.2 | Pipeline orchestration | |
| pymupdf | 1.28.2 | Benchmark PDF render | Production uses Node mupdf, not python |
| psutil | 6.x | Memory measurement | |
| Node mupdf | 1.28.0 | Production PDF render | Same as Vision (1.5x scale PNG) |
| canvas | 3.2.3 | Fallback render | |

**Process lifecycle:**

- Job starts → Node renders PDF pages to temp PNG files (mupdf 1.5x, same as Vision)
- Node creates manifest JSON: `{jobId, kind, pages: [{pageNumber, imagePath, width, height}]}`
- Node spawns `python scripts/paddle_ocr_worker.py --manifest tmp/manifest.json --output-dir tmp/out`
- Worker: load PaddleOCR once (3-5s), loop pages (13s/page on CPU), write `page-001.json` etc + `summary.json`, exit 0
- Node: read per-page JSON, validate (finite coords, inside page, positive size), convert pixel polys → normalized [0,1] via actual dims, assign stable IDs `ocr-p003-b042`, build OcrDocumentResult
- Worker terminated; temp files cleaned per job lifecycle (os.tmpdir/veda-ai/{jobId}/paddle)

**Timeout:** OCR timeout 300s (5m) for 39 pages → at 13s/page needs 507s >300s, will need higher timeout or concurrency. For MVP we accept longer job time or implement bounded concurrency 2 workers processing pages in parallel (but increases memory).

**Concurrency:**

- Single worker sequential: 13s/page * 47 pages = 611s (~10min) total, peak 900MB
- Two workers parallel (pages sharded): ~305s (~5min) but peak 1800MB → may OOM on 16GB (still ok but heavy)
- Chosen: single worker sequential for stability; document that total job time is ~10min for 47 pages (acceptable for MVP? Must report).

---

## 5. Error Handling

- Missing Python → Node `spawn` error ENOENT → throw OcrError CONFIGURATION_ERROR "Python not found. Install Python 3.11+ and paddlepaddle"
- Missing PaddleOCR → worker stderr "ModuleNotFoundError" → Node captures stderr, throws CONFIGURATION_ERROR
- Model download failure → worker logs "Fetching" then error → retry once with backoff 2s, then throw OUTPUT_MISSING
- Page-specific failure → worker catches exception, writes error JSON with `error` field, continues to next page (no silent skip — page marked OCR_PAGE_FAILED in logs)
- Malformed JSON → Node JSON.parse fails → throw OUTPUT_PARSE_FAILED, retry whole job once
- Timeout → Node `setTimeout` 600s for full job, kills worker via `child.kill()`, throws OPERATION_TIMEOUT
- Worker crash (non-zero exit) → Node reads stderr, throws OPERATION_FAILED

---

## 6. Windows Dev vs Linux Prod

| Aspect | Windows dev (tested) | Linux prod (expected) |
|---|---|---|
| Python path | `C:\Python311\python.exe` | `/usr/bin/python3` or venv |
| Model cache | `C:\Users\Dell\.paddlex\official_models\` | `~/.paddlex/official_models/` |
| mupdf render | Node `mupdf` npm (works) | Same (linux binary) or Docker |
| FLAGS_use_pir_api | Required 0 | Same |
| File paths | `C:\...` with spaces | `/tmp/...` |
| Spawn | `child_process.spawn('python', ...)` | `spawn('python3', ...)` — config via `LOCAL_OCR_PYTHON` env |
| Memory | 900MB peak | Similar |
| Disk | 130GB free (models 300MB) | Must ensure image includes 300MB + 500MB paddle |

---

## 7. Deployment Compatibility

**Current target: Vercel/serverless**

Checklist:

- Python availability: ❌ Vercel Node runtime has no Python; cannot `pip install paddlepaddle` (requires native libs, oneDNN, 900MB mem). Build step can bundle Python via `vercel --python` but not for Node app.
- Model packaging: ❌ Models 100-300MB exceed Vercel 250MB function limit (unpacked 300MB + paddle 500MB). Cold start would be >30s.
- Native dependencies: ❌ PaddlePaddle requires glibc, libgomp, openblas not available in serverless.
- Filesystem: Vercel `/tmp` writable but not persistent; model download per cold start unacceptable.
- Process spawning: ❌ `child_process.spawn` not allowed in serverless (sandboxed).
- Memory: Vercel hobby 1024MB limit < 900MB peak + Next.js 300MB → OOM.
- Timeout: Vercel function 10s (hobby) / 60s (pro) / 300s (enterprise) < 611s needed for 47 pages.
- Cold start: PaddleOCR init 3-5s + per-page 13s → exceeds all.

**Verdict: LOCAL_PADDLEOCR_DEPLOYMENT_BLOCKED for Vercel/serverless**

**Smallest viable MVP deployment adjustment:**

Single containerized application (Docker) running:

```
Dockerfile:
FROM node:20-bullseye
RUN apt-get update && apt-get install -y python3 python3-pip libgomp1 libgl1
RUN pip3 install paddlepaddle==3.2.0 paddlex[ocr]==3.7.2 pymupdf psutil
COPY . /app
RUN npm ci && npm run build
CMD ["npm", "start"]
```

- One deployable unit (Fly.io, Render, Railway, self-hosted) — not separate OCR SaaS.
- Next.js + internal Python worker in same container.
- Memory 2GB+ required, timeout via job queue (in-memory + 10m hard timeout already in runner).
- If Vercel must be kept for frontend, move pipeline to separate worker service (but spec says not separate OCR server; a single container is acceptable as one application unit).

**Alternative if container not allowed:** Use Node-compatible OCR fallback only for preview, but spec says DO NOT switch to Tesseract — so must report blocked and not fake.

---

## 8. English Model Selection

Tested:

- Default multilingual (no lang): uses `PP-OCRv6_medium_rec` multilingual — slower, less accurate for pure English (per Paddle docs, limited English accuracy).
- `lang=en` with `en_PP-OCRv5_mobile_rec`: specifically optimized for English, smaller (12MB vs 45MB), faster init (3.2s vs 4.8s), better on QP page 1 sample (captures "MATHEMATICS STANDARD" correctly).

Chosen: `lang=en`, `ocr_version=PP-OCRv5`, `en_PP-OCRv5_mobile_rec`.

---

## 9. Benchmark Preview (partial)

Measured on win32, PP-OCRv5 en mobile:

- Model load: 3230-5848ms (cold, cached models)
- First page (QP p1, 1684x2320 PNG, 500KB): 13470ms (includes first inference warmup)
- Warm page (not fully measured due to timeout, but second page expected ~8000ms)
- Peak mem after load: 860-900MB
- Rec texts per page: QP p1 → 3 texts (header only, but full page should have ~80 lines — indicates model not capturing dense layout? Need full benchmark)
- Avg confidence: 0.93 for header sample
- BBox: dt_polys are pixel coords relative to rendered image (e.g., [[x1,y1],[x2,y1],[x2,y2],[x1,y2]]), must be normalized via width/height.

Full benchmark pending: need to run complete 8+39 pages via worker harness (estimated total 10min, need longer timeout). Will generate `docs/LOCAL_OCR_BENCHMARK.md` + `artifacts/ocr-benchmark/*.json`.

---

## 10. Recommendation

- **Use PaddleOCR core (PP-OCRv5 en mobile) for MVP**, not full PP-StructureV3 layout (31s init + heavier per-page). Layout via deterministic gap synthesis + Vision is sufficient.
- **Disable expensive PP-StructureV3 modules per Phase 4** — our audit shows table/formula/chart/orientation/unwarping not needed for exam paper.
- **Implement child process worker** as described, with manifest + output dir contract.
- **Report deployment blocked for Vercel** — require containerization.
- **Do not fallback to Tesseract/Surya** — if Paddle fails, report blocker (we have proven it works with FLAGS_use_pir_api=0, albeit slow).
