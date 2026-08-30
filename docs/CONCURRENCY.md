# CONCURRENCY — VedaAI (2026-08-30)

## Safe Parallelism (proven via DAG)

- `renderSharedStage` — `Promise.all(QP,AS)` separate dirs
- `ocrStageWithShared` — currently sequential docs to avoid `.paddlex` file race; future combined manifest
- `visionStageWithShared` — `Promise.all(QP,AS)` + `boundedPool(batches,2)` with jittered retry, 429/timeout retryable only
- Fusion/QuestionTree/AnswerGraph — per-doc parallel, global Mapping sequential
- Artifact writes — per-doc files concurrent
- JobStore — timeline events append-only, final `stageStates` aggregated, no parallel `progress.stageStates` overwrite

## Bounds

- OCR docs: 2 logical, 1 worker per doc sequential pages, peak 1.3GB each
- Vision batches: 2 concurrent, batch 3 pages, payload ~2.7MB per batch
- Paddle threads: default (i5 16T), HPI not enabled (no gain measured)

## Failure Isolation

- QP Vision fail → AS OCR continues, Fusion with null Vision
- Batch fail → other batches continue, `VISION_FAILED` per doc
- Never synthesize missing output, stage `FAILED` with `MODEL_OUTPUT_INVALID` etc
