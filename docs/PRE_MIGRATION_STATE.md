# PRE-MIGRATION STATE — Captured 2026-08-29 before hard reset

**Purpose:** Freeze current git + env + provider state before complete Textract removal. Evidence that previous "Textract removed" claim is false.

## Git State

```
Branch: main...origin/main
Last commits:
83fc337 add debugging scripts for question paper and answer sheet processing
6f81e64 enhance question parsing and handling for visually impaired blocks
d2d879a enhance question parsing and rendering logic
951acaf remove unwanted debig files added into gitignore
d0be630 Update UploadPage heading layout

Modified (uncommitted):
 M .env.example
 M src/lib/config/index.ts
 M src/lib/jobs/runner.ts
 M src/lib/ocr/factory.ts
 M src/lib/ocr/types.ts

Untracked:
?? Quetion_paper_Physics_1.pdf  (27 pages, 2.17MB)
?? handwrittern_answer_sheet_physics_1.pdf (31 pages, 11MB)
?? docs/FINAL_LOCAL_OCR_VERIFICATION.md
?? docs/LOCAL_OCR_BENCHMARK.md
?? docs/LOCAL_OCR_MIGRATION_AUDIT.md
?? docs/PADDLEOCR_FEASIBILITY.md
?? scripts/benchmark-physics.ts / e2e-physics-mid.ts / e2e-physics-subset.ts / paddle-benchmark.ts
?? scripts/paddle_ocr_worker.py
?? src/lib/ocr/paddle-provider.ts
```

`git diff --stat`: 5 files 285 insertions, 22 deletions (only adds local branch, does not delete Textract)

## OCR Provider (Runtime vs Example)

**`.env.example`** (modified, uncommitted): `OCR_PROVIDER=local` + `LOCAL_OCR_*` + legacy Textract commented.

**`.env` (actual runtime, what Next.js loads):**
```
OCR_PROVIDER=textract   <-- ACTIVE
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=AKIA...2DL (real)
AWS_SECRET_ACCESS_KEY=Za9f...SZYxI (real)
AWS_S3_BUCKET=vedaaistorage
AWS_TEXTRACT_OUTPUT_BUCKET=vedaaistorage
AWS_S3_INPUT_PREFIX=ocr-input
AWS_S3_OUTPUT_PREFIX=ocr-output
OCR_OPERATION_TIMEOUT_MS=300000
OCR_POLL_INTERVAL_MS=5000
```

**`src/lib/config/index.ts:43`:** `OCR_PROVIDER: z.enum(["textract","mock","local","paddleocr"]).default("local")` — default is local, but `process.env.OCR_PROVIDER=textract` from `.env` wins. `getConfig()` caches after first parse, so Next.js process uses `textract` until restart + cache clear.

**Verdict: Runtime = textract. Example says local, real env says textract. No `.env` edit was made in prior migration. This is why job 49661e1d still went to Textract.**

## Package Dependencies

`package.json:19-21`:
```
"@aws-sdk/client-s3": "^3.800.0"
"@aws-sdk/client-textract": "^3.800.0"   <-- still present
"canvas": "^3.2.3", "mupdf": "^1.28.0"
```
No `paddleocr`, `paddlepaddle`, `paddlex` in package.json (Python side only). `package-lock.json` contains `client-textract`.

## Runtime Path (before fix)

`src/lib/ocr/factory.ts:8-28` — `getOcrProvider()` reads `cfg.OCR_PROVIDER || "textract"`. If `textract`, returns `new TextractOcrProvider()`.

`src/lib/jobs/runner.ts:464-777` — `ocrStage()`:
- reads `ocrProviderName = cfg.OCR_PROVIDER || "textract"`
- `if (mock) → mock path` (line 497)
- `if (local||paddleocr) → local path` (line 538) — exists but never reached when `.env` is `textract`
- **falls through to Textract S3+submit+poll** (line 619 onwards) — `s3_upload_start → textract_submit_start → textract_submit_ok → operation_done → parse_start → parse_ok → debug_dump .../debug/questionPaper-textract.json`

`src/lib/ocr/textract.ts` — `TextractOcrProvider.submitDocument` calls `StartDocumentAnalysis` with `FeatureTypes: [TABLES, LAYOUT]`, `GetDocumentAnalysis` polling.

`src/lib/ocr/s3.ts` — `uploadBufferToS3`, `deleteS3Prefix` for OCR staging.

## Current Failing Real Job Behavior

Job `49661e1d-cd74-417d-90d3-b94b3a42b6fb` logs (from `npm run dev`):
```
{"jobId":"49661e1d...","stage":"OCR","event":"s3_upload_start","kind":"questionPaper","inputUri":"s3://vedaaistorage/ocr-input/.../questionPaper.pdf"}
{"jobId":"49661e1d...","stage":"OCR","event":"s3_upload_ok","kind":"questionPaper"}
{"jobId":"49661e1d...","stage":"OCR","event":"textract_submit_start","kind":"questionPaper","pageCount":27}
{"jobId":"49661e1d...","stage":"OCR","event":"textract_submit_ok","kind":"questionPaper","operationId":"53653f8a..."}
{"jobId":"49661e1d...","stage":"OCR","event":"operation_done","kind":"questionPaper","elapsed":20496}
{"jobId":"49661e1d...","stage":"OCR","event":"parse_start","kind":"questionPaper","outputUri":"s3://vedaaistorage/textract-output/.../questionPaper/"}
{"jobId":"49661e1d...","stage":"OCR","event":"parse_ok","kind":"questionPaper","pages":27}
{"jobId":"49661e1d...","stage":"OCR","event":"debug_dump","kind":"questionPaper","path":"C:\\...\\debug\\questionPaper-textract.json"}
... repeated for answerSheet 31 pages, 22961ms
{"jobId":"49661e1d...","stage":"VISION","event":"analyze_start","kind":"questionPaper","pages":3}
... vision fallback error, fusion, extracting qCount 61, aCount 5, etc.
```

Proves Textract is **still the active OCR**. No `engine=paddleocr` log appears.

## Why Previous Migration Claim Was False

1. `.env` not changed (still `textract`)
2. `package.json` still has `@aws-sdk/client-textract`
3. `src/lib/ocr/textract.ts` + `s3.ts` still imported in production
4. `src/lib/jobs/runner.ts` Textract block still reachable and is the default path
5. No CI assertion that fails if Textract logs appear
6. `docs/FINAL_LOCAL_OCR_VERIFICATION.md` claimed success but was based on standalone scripts (`benchmark-physics.ts`), not the Next.js job pipeline

## Freeze Preservation

This file preserves the state before hard reset. Next steps: full forensic audit (Phase 1-4) then complete removal of Textract from active runtime.

Do not trust jobs 49661e1d, 39ac494f etc. as evidence of new system. New job must start with `stage=OCR engine=paddleocr`.
