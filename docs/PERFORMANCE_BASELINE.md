# PERFORMANCE_BASELINE — Frozen 2026-08-29

## Environment (measured)
- Commit: b54e1a6 (main...origin/main, clean)
- Node: v24.0.2
- Python: 3.11.7
- PaddlePaddle: 3.2.0
- PaddleOCR: 3.7.0
- PaddleX: 3.7.2
- Hardware: 13th Gen Intel i5-13450HX (10C/16T), 16GB RAM, NVIDIA RTX 3050 6GB Laptop GPU (unused — CPU inference), Windows 11 10.0.26200 x64
- Models cached in `C:\Users\Dell\.paddlex\official_models`:
  - PP-OCRv5_mobile_det 4.7MB
  - en_PP-OCRv5_mobile_rec 7.6MB (size reported by benchmark)
  - PP-DocBlockLayout 123.9MB (unused in current OCR path)
  - PP-DocLayout_plus-L 124.4MB (unused)
  - PP-OCRv5_server_det 84.3MB, server_rec 81.3MB, PP-OCRv6 variants cached but not active

## OCR Engine (actual)
- Provider: `local` → `PaddleOcrProvider` `src/lib/ocr/paddle-provider.ts:71`
- Worker: `scripts/paddle_ocr_worker.py`
- OCR version: `PP-OCRv5` with `PP-OCRv5_mobile_det` + `en_PP-OCRv5_mobile_rec` (mobile for speed)
- Paddle kwargs: `lang=en`, `use_doc_orientation_classify=False`, `use_doc_unwarping=False`, `use_textline_orientation=False`
- Device: cpu, engine: paddleocr, pipeline: pp_structure_v3 (label, but actual is PP-OCR detection+recognition only — no full PP-Structure layout/formula/table modules)
- Timeout: `LOCAL_OCR_TIMEOUT_MS=600000` (10min) per doc, `OCR_OPERATION_TIMEOUT_MS=300000`
- Concurrency config: `LOCAL_OCR_CONCURRENCY=2` (declared but not enforced — actual is sequential doc-level)
- Rendering: mupdf 1.5x scale (108 DPI), PNG per page to `os.tmpdir/veda-ai/<jobId>/paddle-images/<kind>/page-*.png`, dimensions 893x1263 (QP) and 1263x893 (AS landscape)

## Vision Provider (actual)
- Provider: `auto` → `OpenRouterVisionProvider` `src/lib/vision/openrouter-vision.ts:11` when `OPENROUTER_API_KEY` present, else skipped
- Model: `qwen/qwen3-vl-32b-instruct` via `https://openrouter.ai/api/v1/chat/completions`
- Timeout: `VISION_TIMEOUT_MS=90000` per request, retries 3 with exponential backoff + jitter, 429/5xx/timeout retryable
- Batching: hardcoded `batchSize=3` `src/lib/jobs/runner.ts:666`, sequential `for` loop over batches, sequential over QP then AS
- Max pages: `VISION_MAX_PAGES=3` for QP, 31 for AS (AS always 31 via batches)
- Input: per-batch `renderPdfPagesForVision` re-renders same PDF again (duplicate of OCR render), base64 PNG, plus `ocrBlocksByPage` (top 30 lines per page with bbox) and truncated `ocrSample` (1500 chars)
- Routing: `shouldInvokeVision` `src/lib/vision/router.ts:17` decides per doc based on OCR confidence/line count/handwriting signals; for mock OCR skipped entirely

## Real Dataset
- Question Paper: `Quetion_paper_Physics_1.pdf` 2,170,769 bytes, 27 pages
- Answer Sheet: `handwrittern_answer_sheet_physics_1.pdf` 11,011,347 bytes, 31 pages

## Current Concurrency (measured serialized)
- QP render → QP OCR worker (sequential)
- AS render → AS OCR worker (sequential after QP)
- No overlap between QP OCR and AS OCR
- No overlap between OCR and Vision (Vision waits for OCR data)
- No overlap between QP Vision and AS Vision
- No overlap between Vision batches
- Fusion/Extracting/Structuring/Matching/Validation all sequential after Vision

## Current Timings (from real_job_final.log ff2bec33, real_job_run2.log 948874eb, benchmark-run.log)
- QP OCR: 79–115s wall (includes 4.3–7.0s model import + 1.3–2.0s init + inference avg 2.7s/page)
  - QP page latencies: min 1.5–1.7s, max 3.7–9.0s, avg 2.7–3.9s
  - QP total texts 1376, blocks 69 (when fixed), 0 when buggy
- AS OCR: 55–65s wall (avg 1.6–1.7s/page, min 0.5–0.7s, max 2.3–2.4s)
  - AS total texts 1055, blocks 93, lines 1023
- OCR sequential total: 135–180s (avg ~149s)
- Vision QP (3 pages, 1 batch): 31s latency (real_job_final.log) + 31s overhead = 31s wall
- Vision AS (3 pages, 1 batch): 46s latency
- Vision total sequential (2 batches): ~78s when VISION_MAX_PAGES=3; projected 11 batches * ~35s = ~385s for full 31-page AS (mission target)
- Fusion: <100ms
- Extracting/Structuring (V2): 28–70ms for questions_v2 + answer graph
- Total wall measured: 233s (3m53s) for 27+31 with 2 Vision batches; ~596s projected for full 31-page Vision (mission target: PaddleOCR≈199s, Vision≈385s, Total≈596s)
- Memory: Paddle worker peak 1225–1304 MB per doc, import 559 MB, after init 740 MB
- CPU: 16 logical, but single worker uses ~1 core for inference (MKL-DNN not enabled, no enable_hpi/enable_mkldnn/cpu_threads tuning)
- Rendering: 182ms for 3 pages, 1079ms for 27 pages (mupdf), negligible vs OCR

## Current Accuracy (real run ff2bec33)
- QuestionTree: 194 candidates → 33 top-level after V2 (PASS, matches ground truth 33)
- AnswerGraph: 10 groups (V2), validation flags 3 giant groups (>5 pages, >50 regions) — indicates over-merge, needs review
- Mapping: 233 decisions, validation PASSED
- Highlights: grounded to Paddle geometry (Vision coarseBox not used for final coordinates)

## Artifacts
- Debug dumps: `os.tmpdir/veda-ai/<jobId>/debug/` and `artifacts/debug/<jobId>/` per stage
- No performance-timeline.json yet (to be added)

## Invariants to preserve
- PaddleOCR geometry is source of truth for highlights (Vision evidence-only)
- QuestionTree 33 top-level must not regress
- AnswerGraph multi-page continuation preserved
- No mock OCR/Vision in production
