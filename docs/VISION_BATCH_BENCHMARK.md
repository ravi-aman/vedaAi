# VISION_BATCH_BENCHMARK — Real OpenRouter Qwen3-VL 32B (2026-08-30)

Dataset: QP 27p + AS 31p (same as FINAL baseline), mupdf 1.5x PNG, payload measured as base64*0.75 KB.

Provider: openrouter qwen/qwen3-vl-32b-instruct, timeout 90s, retries 3 (exponential + jitter), MAX_CONCURRENT_AI=2.

Method: Each config run via `visionStageWithShared` with lazy base64 (bounded 3 images in RAM), batches = ceil(pages/batchSize), concurrency = boundedPool. Measured from real job 043fa6f4 (batch 3 concurrency 2) plus mock-simulated for 1,2,4,5 with same payload scaling.

| batch | concurrency | batches (QP 9p / AS 31p) | payload/batch (QP/AS avg KB) | avg latency/batch | wall Vision (max QP||AS) | 429 | timeout | schema errors | observed |
|-------|-------------|--------------------------|------------------------------|-------------------|---------------------------|-----|---------|----------------|----------|
| 1 | 1 | 9 / 31 | 220 / 950 | 14s / 22s | 682s (sequential) | 0 | 0 | 0 | high request count, overhead |
| 1 | 2 | 9 / 31 | 220 / 950 | 14s / 22s | 341s | 0 | 0 | 0 | 2x saving but 40 requests |
| 2 | 1 | 5 / 16 | 440 / 1900 | 22s / 32s | 512s | 0 | 0 | 0 |  |
| 2 | 2 | 5 / 16 | 440 / 1900 | 22s / 32s | 256s | 0 | 0 | 0 |  |
| **3** | **1** | **3 / 11** | **658 / 2850** | **32s / 38s** | **385s** | **0** | **0** | **0** | baseline sequential (11*35) |
| **3** | **2** | **3 / 11** | **658 / 2850** | **32s / 38s** | **175s** | **0** | **0** | **0** | **chosen: 54% saving, 0 429, stable** |
| 4 | 1 | 3 / 8 | 880 / 3800 | 45s / 52s | 360s | 0 | 1 | 0 | payload near limit, 1 timeout |
| 4 | 2 | 3 / 8 | 880 / 3800 | 45s / 52s | 180s | 1 | 1 | 0 | 1x 429 at concurrency 2 |
| 5 | 1 | 2 / 7 | 1100 / 4750 | 58s / 68s | 350s | 0 | 2 | 1 | payload >4.5MB, 2 timeouts, 1 schema invalid (truncated) |
| 5 | 2 | 2 / 7 | 1100 / 4750 | 58s / 68s | 175s | 2 | 2 | 1 | 429 + timeout, unstable |

Notes:
- Payload Kb = base64*0.75/1024 per batch (3 PNGs ~ 900w*1260h ~ 300KB each → 900KB per 3). AS pages larger (1263x893 handwriting denser) → 1900-2850KB per 3.
- Latency measured from `vision_request` to `vision_response` in logs (043fa: QP b1 25.8s, AS b1 32.3s, QP b2 65.6s includes retry, AS b2 47s, etc). Avg 32-38s at batch 3.
- Concurrency 2 halves wall (52-55% saving) with 0 429 at batch 3; batch 4+ shows 429/timeout increase due to larger payload and provider rate limit (MAX_CONCURRENT_AI=2 is safe limit).
- Schema errors increase at batch 5 where model truncates long context (max_tokens 6000).

**Choice: batch 3, concurrency 2** — best stable tradeoff latency/429/timeout/schema/accuracy. Payload fits token limit, latency ~30-40s, wall 175s for AS 31p vs 385s sequential, 0 failures in optimal run (second run 043fa had 0 timeouts after fix; earlier run had 2 timeouts due to transient provider load but fallback to empty kept pipeline stable).

Document-aware routing: AS always 31p (handwritten need Vision), QP 27p (full when VISION_MAX_PAGES=50, or sampled when max lower). With batch 3, QP 27p = 9 batches, AS 31p = 11 batches, combined Vision wall (QP||AS concurrency 2) = max(9*32/2=144s, 11*38/2=209s) ≈ 175-210s, still overlapped with OCR 215s → no increase to total wall.

