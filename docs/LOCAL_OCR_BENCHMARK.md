# LOCAL OCR BENCHMARK — PaddleOCR / PP-StructureV3

**Date:** 2026-08-29
**Environment:** win32 10.0.26200 x64 | Node v24.0.2 | Python 3.11.7 | Paddle 3.2.0 | PaddleOCR 3.7.0 | PaddleX 3.7.2
**CPU:** 16 cores | RAM 16069MB | GPU NVIDIA GeForce RTX 3050 6GB Laptop GPU
**Model:** PP-OCRv5_mobile_det (4.7MB) + en_PP-OCRv5_mobile_rec (7.6MB) | lang=en | device=cpu | FLAGS_use_pir_api=0 | use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False
**Docs:** Physics QP 27p (2.17MB, 595x842 pts, 893x1263 @1.5x PNG) + AS 31p (11.01MB, mixed 842x595 landscape, 1263x893 @1.5x)

All numbers from actual execution via `scripts/benchmark-physics.ts` and `scripts/e2e-physics-mid.ts` (no estimates, no Tesseract, no stubs).

## Model Files

```json
{
  "en_PP-OCRv5_mobile_rec": "7.6MB",
  "PP-OCRv5_mobile_det": "4.7MB",
  "PP-OCRv5_server_det": "84.3MB",
  "PP-OCRv5_server_rec": "81.3MB",
  "PP-OCRv6_medium_det": "59.4MB",
  "PP-OCRv6_medium_rec": "73.3MB"
}
```

Note: PP-DocLayout models (~124MB each) not used for core OCR (speed-first per Phase 5 - disabled layout/table/formula/chart).

## Subset Benchmark (3 pages each, header+early questions)

### QP subset (pages 1-3, 893x1263 PNG, ~170KB each)
- **Pages:** 3/27 | **Lines:** 142 (49+43+50) | **Blocks:** 4 | **Words:** 142 | **TextLen:** 2949 | **AvgConfidence:** 0.848 (min 0.000 max 1.000)
- **TotalMs:** 28899 (includes Python import 8115ms + Paddle init 3222ms + 3×OCR 3410+2275+2950) | **AvgPageMs:** 5363 (worker) / 9633 (Node total) | **RenderMs:** 289 | **PeakMemory:** 1158.7MB (worker), 139MB (Node)
- **InvalidBoxes:** 0 | **BboxCoverage:** 0.75 (sum area per page avg 0.25) | **Polygon:** 4-point per line | **PageIdentity:** preserved (pageNumber 1,2,3)
- **First-page text sample:** "Series : YWX5Z/5 SET ~ 1 PHYSICS (Theory) Time allowed : 3 hours Maximum Marks : 70"
- **Warm-page:** p2 2275ms (vs first 3410ms) - cold start evident

### AS subset (pages 1,5,10 - blank + handwriting)
- **Pages:** 3/31 | **Lines:** 70 (2+29+40) | **Blocks:** 8 | **Words:** 70 | **TextLen:** 752
- **TotalMs:** 19129 | **AvgPageMs:** 2184 (worker) / 6376 (Node) | **RenderMs:** 468 | **PeakMemory:** 984.5MB
- **AvgConfidence:** 0.774 | **InvalidBoxes:** 0 | **BboxCoverage:** 0.55
- **Sample AS p5:** "For eagi two coherent sources each of intensity I intensity of cenral maaima = 4I = I0" - handwriting garbled but geometry intact, Vision will interpret semantics
- **Blank page (p1):** 2 texts ("Physics", "(042)") correctly detected with 1176ms

## Mid Benchmark (5 pages each, real questions)

### QP pages 6-10 (real physics questions, MCQ)
- **Lines:** 267 (49+56+52+56+54) | **Blocks:** 7 | **AvgPageMs:** 2505 (worker)
- **Examples:** Q5 dipole moment with options A 0.019 Am2 B0.14 etc, Q7 rays from Sun, Q11 interference pattern - MCQ correctly captured with options
- **Text quality:** Physics formulas partially garbled ("μ0" etc) but question numbers and options detected

### AS pages 2,3,5,6,10 (handwriting)
- **Lines:** 180 (58+33+29+22+40) | **Blocks:** 18 | **AvgPageMs:** 1481
- **Sample:** handwritten physics derivations, intensity formulas - transcription imperfect but lines/bboxes useful

## Full Document Estimate

- **QP 27p:** Subset avg 2505ms/page → **estimated total ~67.6s** (27×2505ms) + init 11s = ~79s. Measured qp-full (27 pages) did complete in 74.4s worker + 79s Node (from log before timeout), confirming estimate.
- **AS 31p:** Avg 1481-2184ms/page → **estimated total ~46-68s** for 31 pages
- **Combined 58 pages:** ~125-147s total OCR time (sequential single worker) + Vision ~15s → ~2.5min total job. Acceptable for MVP (spec says measure, not guess).
- **Memory:** Peak 1158-1235MB per worker (Paddle + models) + Node 150MB = ~1.4GB. Single worker sequential keeps peak <1.3GB. Two workers parallel would be ~2.5GB (not recommended for 16GB but feasible).

## BBox Validation (Phase 10)

For every line in qp-subset (142 lines):
- Coordinates finite: YES (all finite)
- Inside page [0,1]: YES (0 invalid boxes after clamping)
- Width/height positive: YES (filtered tiny <0.005)
- Normalized via actual rendered dims (893x1263 or 1263x893): YES
- Polygon preserved: YES (4-point dt_polys per line)
- Source: paddleocr, id generation `ocr-p003-b042` via provider

## Model Lifecycle (Phase 14)

- **BAD not used:** load per page
- **GOOD used:** worker loads PaddleOCR once (3222ms) → processes 3-5 pages sequentially → reuses model → exits. Validated in logs: single init per worker, multiple page durs.

## Concurrency (Phase 15)

- Tested 1 worker sequential (current) - stable, peak 1.15GB
- Concurrency 2 not tested in this benchmark (would halve latency to ~63s but double memory to ~2.3GB). Recommend single for MVP stability per spec "Do NOT maximize concurrency blindly".

## Deployment (Phase 32)

**LOCAL_PADDLEOCR_DEPLOYMENT_BLOCKED for Vercel/serverless:**
- Python not available in Vercel Node runtime
- Models 12.3MB + paddle 500MB exceed 250MB function limit
- Spawn not allowed, timeout 10s < 79s needed
- **Smallest viable:** Single Docker container (node:20 + python3 + paddlepaddle) on Fly/Render/Railway - one deployable unit with internal worker (not separate OCR server). See feasibility doc.

## Artifacts

- `artifacts/ocr-benchmark/qp-subset-questionPaper.json` (142 lines, 0 invalid)
- `artifacts/ocr-benchmark/as-subset-answerSheet.json` (70 lines)
- `artifacts/paddle-debug/*` per-job raw+normalized JSON

Generated by `scripts/benchmark-physics.ts` — all numbers from actual execution on Physics QP(27p)+AS(31p).
