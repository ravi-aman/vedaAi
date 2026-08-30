# PERFORMANCE — VedaAI Pipeline (Updated 2026-08-30)

See `FINAL_PERFORMANCE_OPTIMIZATION.md` for forensic baseline and `PERFORMANCE_DEPENDENCY_DAG.md` for DAG.

## Pipeline Stages & Concurrency

1. **VALIDATING** — sequential guard
2. **PREPROCESSING** — `inspectPdf` per file, IO
3. **RENDER_SHARED** — mupdf 1.5x once, `Promise.all(QP,AS)` → `SharedPageImage`, reuse for OCR+Vision
4. **PARALLEL_OCR_VISION** — `Promise.all(ocrPromise, visionPromise)`
   - OCR: `ocrStageWithShared` — sequential docs (QP then AS) each single `PaddleOCR` worker, `processDocument` per page `predict`, mobile models
   - Vision: `visionStageWithShared` — image-first Pass1, `Promise.all(QP,AS)`, `boundedPool(batches,2)` batchSize 3
5. **FUSION** — `fuseDocuments` per doc, can be parallel
6. **EXTRACTING/STRUCTURING/MATCHING/LOCALIZING/VALIDATING_RESULT** — sequential global reconciliation

Timeline artifact: `artifacts/<jobId>/performance-timeline.json` and `tmp/veda-ai/<jobId>/debug/performance-timeline.json`

## Tuning

- **OCR:** `LOCAL_OCR_VERSION=PP-OCRv5`, `PP-OCRv5_mobile_det` + `en_PP-OCRv5_mobile_rec` (fast, 4.7+7.6MB), `LOCAL_OCR_TIMEOUT_MS=600000`, `OCR_OPERATION_TIMEOUT_MS=600000`
- **Vision:** `VISION_PROVIDER=auto`, `VISION_MAX_PAGES=3` (QP) / 31 (AS hardcode), `VISION_TIMEOUT_MS=90000`, `MAX_CONCURRENT_AI=2`, batch 3, concurrency 2
- **Render:** mupdf 1.5x, PNG, preserve dims/rotation

## Benchmark (real 27p+31p)

- OCR 252s + Vision 175s overlapped → 253s parallel vs 427s sequential (41% saving)
- Total 264s vs mission 596s (56% saving) with Vision evidence, accuracy unchanged
