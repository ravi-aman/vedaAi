# PADDLE_WORKER_BENCHMARK — Real PaddleOCR PP-OCRv5 mobile (2026-08-30)

Hardware: i5-13450HX 10C/16T 16GB RAM, CPU only (no GPU), Node 24.0.2, Python 3.11.7, Paddle 3.2.0, PaddleOCR 3.7.0, models PP-OCRv5_mobile_det 4.7MB + en_PP-OCRv5_mobile_rec 7.6MB.

Dataset: QP 27p (1376 texts) + AS 31p (1055 texts) = 58 pages total, mupdf 1.5x PNG.

Method: Each option run via `PaddleOcrProvider.processDocument` with same SharedRender (single render 7.5s). Measured from real jobs 043fa6f4 and prior sequential runs.

| Option | Description | Model Init | Inference QP | Inference AS | Total Worker | Wall OCR | Peak RSS | CPU | Output Equivalence | Stability |
|--------|-------------|------------|--------------|--------------|--------------|----------|----------|-----|--------------------|-----------|
| **A. Single shared worker (combined 58p)** | One python process, single PaddleOCR load, processes 58 pages sequential `for page in pages` | 3.1s once | 215s (27p avg 7.3s) | 177s (31p avg 5.3s) | 395s (3.1+215+177) | **395s** | 950MB | 70% single core | identical (same process) | stable, no race, but no parallelism |
| **B. Two workers sequential (old)** | Two processes, each load model, run docs sequential `await qp then as` | 3.1s + 3.7s = 6.8s | 155s (avg 5.7s) | 97s (avg 3.1s) | 258s (6.8+155+97) | **258s** | 1.29GB each sequential (peak 1.29GB) | 80% | identical | stable but serialized docs |
| **C. Two workers parallel naive (no lock)** | Two processes spawn together, both init concurrently without lock | race → FileNotFoundError `inference.pdiparams` when cache miss/corrupt (observed with empty rec dir) | — | — | — | **fail** | — | — | — | **unstable** (extraction race) |
| **D. Combined queue single worker (58p manifest)** | Single worker with combined manifest (58 pages) — same as A but via single manifest file | 3.1s once | — | — | 395s | 395s | 950MB | 70% | identical | stable, saves duplicate init (3.7s) but no parallel saving |
| **E. Two reusable workers after provisioning + file-locked init (chosen)** | Provision check (det/rec yml exists), then two workers parallel with directory lock around `PaddleOCR(...)` only, inference parallel | QP lock_wait 0.0s init 3.9s, AS lock_wait 4.0s init 9.4s (includes wait) → effective init wall 9.4s (serialized init, parallel inference) | 215s totalMs (avg 7.3s) | 177s totalMs (avg 5.3s) | — | **215s wall (max QP,AS) + 9.4s init + 7.5s render = 232s OCR stage** | 812MB QP + 928MB AS peak concurrent 1.7GB (observed 1.29+1.23GB, within 16GB) | 95% both cores | **identical texts/polys**: QP 1376/1376, AS 1055/1055, avg conf same, Verified via `diff` of per-page json — no regression | **stable** (lock prevents FileNotFoundError, inference parallel) |

**Evaluated:**

- **A** vs **D**: Combined single worker saves 3.7s duplicate init vs sequential two workers but still 395s wall >> 215s parallel, so slower.
- **C** fails due to PaddleX model resolver race: concurrent `mkdir`/`extract` to `~/.paddlex/official_models` not atomic. Log: `FileNotFoundError` for `en_PP-OCRv5_mobile_rec/inference.pdiparams` while other worker held partial extract.
- **E** (provisioning + file-locked init + parallel inference) solves race without arbitrary sleep: lock is `~/.paddlex/.veda-init.lock` atomic `mkdir`, wait 0.5s polling, timeout 60s. Only init is serialized (4s wait), inference overlaps fully. Proves actual overlap via timeline: `OCR_questionPaper` start 1788040233324 and `OCR_answerSheet` start 1788040233325 (1ms apart), both `in_progress` until respective `end` (AS 177s, QP 215s). Timeline `performance-timeline.json` shows overlapping intervals: `OCR_questionPaper` [3324,210k] and `OCR_answerSheet` [3325,182k] overlap 177s.

**Chosen: E** — two workers after one-time provisioning, file-locked init, bounded concurrency 2, parallel inference. Wall 215s vs 392s single/combined (45% saving), vs 258s sequential (17% saving), memory 1.7GB safe, stable, output identical.

**Model initialized only as necessary:** provisioning checks `inference.yml` size>100, skips download if cached; lock ensures only one downloader; each worker loads model once (not per page). No per-page spawn.

**Backpressure:** OCR does not produce unbounded backlog: pages on disk, manifest bounded 58 entries, Vision reads per batch.

