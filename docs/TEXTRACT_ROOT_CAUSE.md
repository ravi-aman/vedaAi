# PHASE 3 & 4 — Why Textract Is Still Running (Exact Call Chain + Config Resolution)

## Summary

**Previous "Textract removed" was false because `.env` still had `OCR_PROVIDER=textract`, which overrides `src/lib/config/index.ts` default `local`. The Next.js dev server loaded `.env` at startup and `getConfig()` cached it. `src/lib/jobs/runner.ts` then took the Textract S3→submit→poll branch. No code deleted Textract; only added a never-reached local branch.**

## Search Evidence (full repo)

Hits for Textract in production source (before fix):

```
src/lib/ocr/textract.ts:1  import { TextractClient, StartDocumentAnalysisCommand, GetDocumentAnalysisCommand, ... } from "@aws-sdk/client-textract"
src/lib/ocr/textract.ts:65  function getTextractClient(): TextractClient
src/lib/ocr/textract.ts:84  export class TextractOcrProvider implements OcrProvider { submitDocument -> StartDocumentAnalysisCommand FeatureTypes:[TABLES,LAYOUT] }
src/lib/ocr/textract.ts:160  getOperationStatus -> GetDocumentAnalysisCommand / GetDocumentTextDetectionCommand
src/lib/ocr/textract.ts:204  getOperationResult -> pagination fetchWithPagination
src/lib/ocr/s3.ts:1           import { S3Client, PutObjectCommand, ... } from "@aws-sdk/client-s3"
src/lib/ocr/s3.ts:32          buildS3Keys -> ocr-input / ocr-output
src/lib/ocr/s3.ts:70          uploadBufferToS3 -> PutObjectCommand
src/lib/ocr/factory.ts:2      import { TextractOcrProvider } from "./textract"
src/lib/ocr/factory.ts:26     cached = new TextractOcrProvider()
src/lib/ocr/index.ts:5        export { TextractOcrProvider } from "./textract"
src/lib/jobs/runner.ts:9      import { uploadBufferToS3, deleteS3Prefix } from "@/lib/ocr/s3"
src/lib/jobs/runner.ts:10     import { getOcrProvider, getLocalOcrProvider } from "@/lib/ocr/factory"
src/lib/jobs/runner.ts:464    const ocrProviderName = cfg.OCR_PROVIDER || "textract"
src/lib/jobs/runner.ts:619    if (!cfg.AWS_S3_BUCKET) { if (cfg.OCR_PROVIDER==="mock")... } else { Textract path }
src/lib/jobs/runner.ts:647    async function processOneDoc -> uploadBufferToS3 -> provider.submitDocument -> log s3_upload_start/textract_submit_start
src/lib/jobs/runner.ts:678    console.log textract_submit_start / textract_submit_ok / operation_done / parse_start / parse_ok / debug_dump ...-textract.json
src/lib/config/index.ts:43    OCR_PROVIDER: z.enum(["textract","mock","local","paddleocr"]).default("local")
src/lib/config/index.ts:149   isAwsOcrConfigured -> Boolean(AWS_S3_BUCKET && AWS_REGION)
package.json:21                 "@aws-sdk/client-textract": "^3.800.0"
package-lock.json               client-textract 3.800.0
.env:29                         OCR_PROVIDER=textract  <-- LIVE
.env:30-43                      AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET, etc.
docs/LOCAL_OCR_MIGRATION_AUDIT.md  (claims local but not enforced)
tests/integration/textract-integration.test.ts  (integration test imports textract)
```

Search for `textract_submit`, `textract_output`, `ocr-input`, `ocrOutputUri`, `AWS_TEXTRACT`, `AWS_SNS`, `AWS_SQS` all hit the same files above.

## Exact Call Chain (runtime log → code)

```
1. Next.js loads .env at boot (next dev reads .env, not .env.example)
   → process.env.OCR_PROVIDER = "textract" (from E:\vedaAi\.env:29)
   → process.env.AWS_S3_BUCKET = "vedaaistorage" etc.

2. First request hits getConfig() (src/lib/config/index.ts:102)
   → z.enum(["textract","mock","local","paddleocr"]).default("local").parse(process.env)
   → parsed OCR_PROVIDER = "textract" (env wins over default)
   → cached = { OCR_PROVIDER: "textract", AWS_S3_BUCKET:"vedaaistorage", ... }
   → getConfig() caches; next calls return same without re-reading env

3. POST /api/jobs/[jobId]/start → startProcessing(jobId) → runJob(jobId)
   → ocrStage(jobId) (src/lib/jobs/runner.ts:464)
        const cfg = getConfig() as any;               // {OCR_PROVIDER:"textract"}
        const ocrProviderName = cfg.OCR_PROVIDER || "textract"; // "textract"

4. Inside ocrStage:
   if (ocrProviderName==="mock") → false
   if (ocrProviderName==="local"||"paddleocr") → false (value is "textract")
   → falls through to Textract block (line 619)

5. Textract block:
   if (!cfg.AWS_S3_BUCKET) → false (bucket exists)
   const provider = getOcrProvider() (src/lib/ocr/factory.ts:8)
        provider = cfg.OCR_PROVIDER || "textract" → "textract"
        → if (mock) no, if (local) no → cached = new TextractOcrProvider()
   const bucket = cfg.AWS_S3_BUCKET // "vedaaistorage"
   await processOneDoc(qpDoc, qpPages, "questionPaper")
        → uploadBufferToS3(bucket, "ocr-input/49661e1d.../questionPaper.pdf", buffer)
            → S3Client.send(PutObjectCommand) → log s3_upload_start / s3_upload_ok
        → provider.submitDocument({s3Bucket: bucket, s3Key: inputKey})
            → getTextractClient() → TextractClient({region, credentials})
            → client.send(StartDocumentAnalysisCommand({DocumentLocation:{S3Object:{Bucket,Name:key}}, FeatureTypes:[TABLES,LAYOUT], NotificationChannel?}))
            → return {operationId: "53653f8a...", outputUri: "s3://vedaaistorage/textract-output/..."}
            → log textract_submit_start / textract_submit_ok
        → jobStore.update({ocrOperationId, ocrOutputUri})
        → poll: while(true){ status=provider.getOperationStatus(operationId) // GetDocumentAnalysisCommand; if DONE break; await 5000 }
            → log operation_done elapsed 20496
        → provider.getOperationResult(operationId, outputUri) // list S3 output JSON, normalizeTextractBlocks
            → log parse_start / parse_ok pages:27, totalLines 1192
        → write debug dump .../debug/questionPaper-textract.json + artifacts/ocr-debug/... → log debug_dump
   await processOneDoc(asDoc, asPages, "answerSheet") // same, 31p, elapsed 22961, totalLines 961

6. Continue pipeline (vision, fusion, extracting 61q→44 topLevel, 5 answers, matching 66 decisions) — still Textract geometry
```

If `OCR_PROVIDER` had been `local`, step 4 would have taken the `if (local||paddleocr)` branch (line 538) which calls `getLocalOcrProvider().processDocument` via `renderPdfBufferToPngFiles` + `spawn python scripts/paddle_ocr_worker.py`, and would log `engine=paddleocr event=local_start/local_process_ok`, never `s3_upload_start`.

## Configuration Resolution Audit

| Source | File | Value | Priority |
|---|---|---|---|
| `.env.example` (uncommitted change) | `.env.example:10` | `OCR_PROVIDER=local` | Not loaded at runtime (Next.js loads `.env`, not example) |
| `.env` (live) | `.env:29` | `OCR_PROVIDER=textract` | **Wins** — loaded by Next.js, parsed by getConfig(), cached |
| `src/lib/config/index.ts:43` | envSchema default | `local` | Only if env var absent |
| `getConfig()` cache | `src/lib/config/index.ts:100` `let cached` | Returns cached after first call | Requires `clearConfigCache()` + restart to change |
| `requireAwsOcrConfig()` | `src/lib/config/index.ts:154` | Checks `AWS_S3_BUCKET` when provider!=mock | Passes because bucket set |
| `package.json` | `package.json:21` | `@aws-sdk/client-textract` present | Bundled, importable |

**What value does OCR_PROVIDER actually have at runtime?**

```
OCR_PROVIDER=textract  (proven by .env + getConfig cache + Textract logs)
```

**Which provider does factory return?**

```
getOcrProvider() → TextractOcrProvider (src/lib/ocr/factory.ts:26)
getLocalOcrProvider() → PaddleOcrProvider but never called when OCR_PROVIDER=textract
```

**Which code path is called?**

```
src/lib/jobs/runner.ts:619 Textract S3+submit+poll (reachable, taken)
src/lib/jobs/runner.ts:538 Local PaddleOCR (exists but unreachable when env=textract)
```

**Is configuration cached?**

Yes — `src/lib/config/index.ts:100 let cached: AppConfig|null` and `src/lib/ocr/factory.ts:5 let cached: OcrProvider|null` plus `cachedLocal`. Requires process restart after `.env` edit.

**Is Next.js process stale?**

Yes — `npm run dev` was started before `.env.example` edit, so it never reloaded. No `clearConfigCache()` call on `POST /api/jobs/*/start`.

**Must eventually report:**

```
OCR_PROVIDER=local
LOCAL_OCR_ENGINE=paddleocr
LOCAL_OCR_PIPELINE=pp_structure_v3
provider=paddleocr stage=OCR
NO textract_submit_start, NO s3_upload_start for OCR staging
```

## Why Factory Alone Did Not Save It

Even though `factory.ts` now supports `local`, the **fallback** `cached = new TextractOcrProvider()` (line 26) is still the default when `OCR_PROVIDER` is neither `mock` nor `local`. Since `.env` says `textract`, the factory correctly returns Textract — the bug is not factory, it's the env value plus no assertion that fails when `textract` is active.

## Assertion Missing

No startup/job assertion logs `provider=paddleocr` or fails if `textract_*` events fire. Job 49661e1d succeeded despite being Textract, so regression was silent.

**Fix for PHASE 5-7:** Change `.env` to `OCR_PROVIDER=local`, delete Textract from active runtime, remove `@aws-sdk/client-textract` from `package.json`, remove staging logs, add mandatory `stage=OCR provider=paddleocr` log and fail if Textract events appear.
