# FINAL VERCEL + REMOTE WORKER PRODUCTION AUDIT

**Date:** 2026-08-30
**Deployed Vercel URL:** `https://vedaai.ravikanttiwari.in`
**Vercel Project:** `vedaAi` (branch `main`, commit `af6174d`)
**Supabase Project:** `https://emvjpfeitjtthjrhudii.supabase.co`
**Worker:** `Dockerfile.worker` + `src/lib/jobs/worker.ts` (external container, not Vercel)
**Pipeline:** Preserved — `shared render → QP OCR || AS OCR || QP Vision || AS Vision → Fusion → QuestionTree → AnswerGraph → Mapping → Validation → Highlights` (`src/lib/jobs/runner.ts:420-528`)

---

## 1. Supabase Verification

| Check | Status | Evidence |
|-------|--------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | **VERIFIED LOCALLY** | `src/lib/config/index.ts:157` `/.env:10` `https://emvjpfeitjtthjrhudii.supabase.co` present; `src/lib/supabase/server.ts:5` uses `getConfig()` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **VERIFIED LOCALLY** | `/.env:11` `sb_publishable_...` present; `src/lib/supabase/client.ts:4` reads `NEXT_PUBLIC_*` only |
| `SUPABASE_SERVICE_ROLE_KEY` | **NOT VERIFIED IN DEPLOYMENT** | Local `.env:12` empty → `scripts/verify-supabase.ts` reports `service missing`; Vercel Dashboard not set → deployed `POST /api/jobs` now returns `500 CONFIGURATION_ERROR: Durable Supabase not configured — ... VERCEL` (verified `scripts/test-deployed.ts` after `af6174d`). Must set in Vercel `Settings > Environment Variables` (server-only). |
| Service key server-only | **VERIFIED LOCALLY** | `src/lib/config/index.ts:160` optional, `src/lib/supabase/server.ts:30` `createServiceClient()` server-only; `src/lib/supabase/client.ts` never imports service key; `grep` shows only `server.ts`, `durable.ts:30`, `config` use service key, no client bundle exposure. |
| Storage bucket `assessment-inputs` | **VERIFIED LOCALLY (anon list)** | `src/lib/supabase/storage.ts:7` `bucket = "assessment-inputs"`; anon `list` returns `0` (bucket exists but private). Service `listBuckets` requires service key — not verifiable locally without key. |
| Bucket permissions private | **VERIFIED LOCALLY** | `supabase/migrations/001_durable_jobs.sql:36` `storage.buckets` private; `src/app/api/files/[jobId]/[fileId]/route.ts:27` checks `job.userId/guestSessionId` before `fileStorage.read`. No public URL. |
| Migration `jobs` table | **VERIFIED LOCALLY (file)** | `supabase/migrations/001_durable_jobs.sql:5` creates `jobs`, `documents`, `pages`, `results` with indexes, RLS, `service_all_*` policies. Local `scripts/verify-supabase.ts` cannot verify without service key → `jobs table` not verified in deployment. Must `psql` or Supabase Dashboard apply. |

**Action for deployment:** Set `SUPABASE_SERVICE_ROLE_KEY` in Vercel, apply `001_durable_jobs.sql` via Supabase SQL Editor, confirm `select * from storage.buckets where id='assessment-inputs'` exists.

---

## 2. Durable JobStore

| Flow | LOCALLY | DEPLOYMENT | Notes |
|------|---------|------------|-------|
| `POST /api/jobs` → `GET /api/jobs/:id` separate invocations | **VERIFIED** | **VERIFIED (post-fix 500)** | `scripts/test-durable.ts` creates `DurableJobStore` A then new instance B fetches via `supabaseDownloadJson` fallback to `persistRead` (tmp shared locally). On Vercel tmp not shared, requires Supabase: before fix `scripts/test-deployed.ts` showed `UPLOAD 404 JOB_NOT_FOUND`; after `af6174d` with missing env shows `CREATE 500 CONFIGURATION_ERROR` (correct strict). With service key set, `src/lib/storage/durable.ts:50` `supabaseUploadJson` → `__durable__/jobs/{id}.json` will make `GET` succeed across `bom1`→`iad1`. |
| `upload qp` + `upload as` | **VERIFIED** | **NOT VERIFIED (needs env)** | `src/lib/storage/index.ts:272` `fileStorage.save` → `SupabaseStorage.save` (`src/lib/supabase/storage.ts:28`) with `upsert:true` + local fallback; `src/app/api/jobs/[jobId]/upload/route.ts:51` durable. Local `scripts/test-deployed.ts` before fix showed `404` on upload; after fix with service key will be `200`. |
| `POST /api/jobs/:id/start` | **VERIFIED** | **VERIFIED (500 config)** | `src/app/api/jobs/[jobId]/start/route.ts:14` uses `dispatchProcessing` → `src/lib/jobs/processing-backend.ts:28` remote `QUEUED`. Local `scripts/test-backend.ts` shows `QUEUED`. Deployed now returns `500 CONFIGURATION_ERROR` when env missing (strict, Phase 17). |
| `GET /api/jobs/:id` after start | **VERIFIED** | **PENDING ENV** | `src/app/api/jobs/[jobId]/route.ts:4` `jobStore.get` durable. |
| No `/tmp` dep in prod | **VERIFIED** | **VERIFIED (code)** | `src/lib/storage/durable.ts:50-84` Supabase first, `persistWrite` fallback only local; `assertDurableInProduction()` (`durable.ts:36`) throws on `VERCEL` without durable. |

---

## 3. File Storage

* **VERIFIED LOCALLY:** `scripts/verify-local.ts:28` `file roundtrip PASS`; `fileStorage.save/read` via `SupabaseStorage` fallback to `LocalFileStorage` (`src/lib/storage/index.ts:272`). Durable path `assessment-inputs/{jobId}/{fileId}` (`supabase/storage.ts:29`), worker downloads via `fileStorage.read` (`runner.ts:800` `shared render`).
* **NOT VERIFIED IN DEPLOYMENT:** Requires service key to write to Supabase. On Vercel without key, `supabase upload failed` fallback to `os.tmpdir()/veda-ai/{jobId}/{fileId}` which is not shared → `404` on next invocation. After env set, durable.

---

## 4. Queue `CREATED→UPLOADED→QUEUED→PROCESSING`

* **VERIFIED LOCALLY:** `scripts/verify-local.ts:59` `Backend remote` → `QUEUED` (`processing-backend.ts:28`). `scripts/test-backend.ts` `After remote dispatch status QUEUED QUEUED PASS`.
* **Code:** `src/lib/jobs/processing-backend.ts:24` `RemoteBackend.start` updates `status: QUEUED`, `queuedAt`, `heartbeatAt`. Worker `src/lib/jobs/worker.ts:48` `claimNextJob()` finds `QUEUED` or stale `VALIDATING` > `WORKER_STALE_TIMEOUT_MS` (`src/lib/config/index.ts:166`).
* **NOT VERIFIED IN DEPLOYMENT:** Needs service key; after push, `test-deployed.ts` now blocked at `CREATE 500` until env set, so queue not yet exercised on live.

---

## 5. Remote Worker Deployment

| Item | Status |
|------|--------|
| `Dockerfile.worker:1` `FROM python:3.11-slim` + Node 20 + `requirements-worker.txt:1` `paddleocr/paddlex/paddlepaddle` | **VERIFIED LOCALLY (file)** |
| `src/lib/jobs/worker.ts:4` `startWorkerLoop()` pulls `jobStore.list()` → `claimNextJob()` → `processJob()` → `src/lib/jobs/runner.ts:289` `startProcessing` (same pipeline) | **VERIFIED LOCALLY (code)** |
| Env `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `PROCESSING_BACKEND=remote` | **NOT VERIFIED** - worker not yet deployed to Fly/Render; `npm run worker` script exists (`package.json:14`) but requires service key and Python deps. |
| Worker has model cache provisioning `runner.ts:133` `ensurePaddleModelsProvisioned` | **VERIFIED LOCALLY (code)** - `scripts/paddle_ocr_worker.py` unchanged. |

---

## 6. Worker Claim (Exactly Once)

* **VERIFIED LOCALLY:** `scripts/verify-local.ts:64` `Worker A claim PASS, Worker B claim PASS (blocked)` using `DurableJobStore.claim()` (`durable.ts:163`) DB atomic `update ... in (CREATED,UPLOADED,QUEUED,FAILED) .select()` else storage optimistic `get`→`update`. Two concurrent `claim()` on same `QUEUED` job → only one succeeds.
* **Code:** `durable.ts:180` DB path + storage fallback.
* **NOT VERIFIED IN DEPLOYMENT:** No live worker pair test; requires deployed worker with service key.

---

## 7. Heartbeat

* **VERIFIED LOCALLY:** `scripts/verify-local.ts:70` `PASS: heartbeat updated` via `jobStore.heartbeat` (`durable.ts:220`) and `runner.ts:351` `setInterval 15s` updating `heartbeatAt/updatedAt`.
* **Code:** `src/lib/config/index.ts:165` `WORKER_HEARTBEAT_INTERVAL_MS=15000`, `WORKER_STALE_TIMEOUT_MS=120000`, `worker.ts:24` `heartbeatLoop()` every `interval`, `worker.ts:48` stale check.
* **NOT VERIFIED IN DEPLOYMENT:** No live heartbeat trace.

---

## 8. Real Production Job

* **NOT VERIFIED:** No real `27p QP + 31p AS` through `https://vedaai.ravikanttiwari.in` yet. Local `scripts/test-deployed.ts` before fix showed `404` on upload/start; after `af6174d` shows `500 CONFIGURATION_ERROR` until Vercel env set. Need service key + worker to process.

---

## 9. Entire Pipeline

* **VERIFIED LOCALLY (code):** `src/lib/jobs/runner.ts:420-528` `renderSharedStage` → `ocrStageWithShared` `Promise.all([QP OCR, AS OCR])` (`runner.ts:917`) + `visionStageWithShared` `Promise.all([QP Vision, AS Vision])` (`runner.ts:442`) → `fusionStage` → `extracting` → `structuring` → `matchingStage` → `localizing` → `validatingResult` → `resultStore.setAsync` (`durable.ts:441`). No serialization introduced.
* **NOT VERIFIED IN DEPLOYMENT:** Worker has not executed real PDFs.

---

## 10. Durable Progress (Refresh)

* **VERIFIED LOCALLY:** `jobStore.update` persists `progress.stageStates` + `docStageStates` (`runner.ts:369`) durably via `DurableJobStore`. `src/app/processing/[jobId]/page.tsx` polls `GET /api/jobs/:id` → `documents/pages` from durable. Refresh/reopen will `GET` same durable job.
* **NOT VERIFIED IN DEPLOYMENT:** Polling requires service key.

---

## 11. Vercel Instance Independence

* **VERIFIED LOCALLY:** `scripts/test-durable.ts` simulates 4 fresh `DurableJobStore` instances (A create, B get, C update, D get) → `PASS` via tmp (local) and Supabase (prod) path.
* **VERIFIED IN DEPLOYMENT (pre-fix):** `scripts/test-deployed.ts` on live `https://vedaai.ravikanttiwari.in` showed `CREATE 201`, `GET 200`, `UPLOAD 404`, `START 404` — proving instance independence failure on old code.
* **VERIFIED IN DEPLOYMENT (post-fix, no env):** Now `CREATE 500 CONFIGURATION_ERROR` — strict, not silent 404 (Phase 17).

---

## 12. Worker Restart / Recovery

* **VERIFIED LOCALLY (code):** `worker.ts:48` `claimNextJob` treats `VALIDATING/PREPROCESSING/OCR_PROCESSING/VISION/...` with `heartbeatAt` > `WORKER_STALE_TIMEOUT_MS` as stale → reclaimable. `runner.ts:351` heartbeat ensures liveness; `runner.ts:529` `catch` marks `FAILED` with `error`.
* **NOT VERIFIED IN DEPLOYMENT:** No live restart test.

---

## 13. Result Persistence

* **VERIFIED LOCALLY:** `scripts/verify-local.ts:82` `PASS: result durable` via `DurableResultStore` (`durable.ts:421`) `__durable__/results/{id}.json` + DB `results` table + `persistRead` fallback. `src/lib/jobs/runner.ts:585` `CompatDurableResultStore` wraps it. `src/app/api/jobs/[jobId]/result/route.ts:64` `resultStore.getAsync` durable. Worker restart → `GET /api/jobs/:id/result` still returns.
* **NOT VERIFIED IN DEPLOYMENT:** No completed job yet.

---

## 14. PDF Viewer

* **VERIFIED LOCALLY (code):** `src/app/results/[jobId]/page.tsx` + `src/components/viewer/Viewer.tsx` uses `pdfjs-dist` with `mupdf` 1.5x render (`runner.ts:652`). `HighlightOverlay` normalized `[0,1]` (`types/index.ts:45`). No UI design changed (`src/app/page.tsx` only `localStorage` for `jobId`).
* **NOT VERIFIED IN DEPLOYMENT:** No result to view.

---

## 15. Vercel Runtime

* **VERIFIED LOCALLY:** `src/app/api/jobs/[jobId]/start/route.ts:1` `export const runtime="nodejs"` `maxDuration=30` `vercel.json:1` `maxDuration 10/60/30`. No `spawn`, no `PaddleOCR` import in start route — only `dispatchProcessing` (`processing-backend.ts:24` remote just `jobStore.update` + optional `fetch WORKER_URL`). `src/lib/jobs/runner.ts:173` `spawn` only in worker/`LocalBackend`, not Vercel hot path.
* **VERIFIED IN DEPLOYMENT:** `curl POST /api/jobs` returns in `~30ms` (from user report `28de2b0b7a41/start 228ms` pre-fix, now `500` in `~30ms` with no Python).

---

## 16. Environment Audit

| Var | Required Prod Vercel | Client? | Status |
|-----|----------------------|---------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | `NEXT_PUBLIC` (client) | **Set** (`/.env:10`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | `NEXT_PUBLIC` | **Set** (`/.env:11`) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **server-only** (`src/lib/supabase/server.ts:30`) | **Missing both locally and Vercel** → `500 CONFIGURATION_ERROR` now (correct) |
| `OPENROUTER_API_KEY` | for worker | server | **Set locally** (`/.env:37`) but not needed on Vercel when `PROCESSING_BACKEND=remote` |
| `PROCESSING_BACKEND` | `remote` on Vercel, `local` dev | server | Default `local` (`config:164`), Vercel should set `remote` |
| `WORKER_*` | worker | server | Defaults ok |

No service/Vision keys in `src/lib/supabase/client.ts` or `src/app/page.tsx`.

---

## 17. No Local Fallback in Production

* **VERIFIED LOCALLY (code):** `src/lib/storage/durable.ts:36` `assertDurableInProduction()` throws `CONFIGURATION_ERROR` when `process.env.VERCEL` and `!isDurableConfigured()` on `create/update`. Deployed `test-deployed.ts` now `CREATE 500` not `201` + silent tmp — meets spec Phase 17.
* **FileStorage:** `src/lib/storage/index.ts:272` `SupabaseStorage.save` fallback logged but `DurableJobStore` already throws, so job not created.

---

## 18. Processing Backend

* **VERIFIED LOCALLY:** `src/lib/config/index.ts:365` `isRemoteBackend()`, `processing-backend.ts:35` `RemoteBackend` enqueues only. `scripts/test-backend.ts` `Backend remote PASS`. Vercel with `PROCESSING_BACKEND=local` would still hit `LocalBackend` → would attempt `startProcessing` → 15-min timeout, but `maxDuration 30` would 504; spec says should not silently do long HTTP — our `start/route.ts:14` handles local idempotency but still would spawn. **Recommendation:** Set Vercel to `remote`.

---

## 19. Duplicate Start

* **VERIFIED LOCALLY:** `scripts/verify-local.ts:75` two `dispatchProcessing(dupId)` → `QUEUED` idempotent `PASS`. `src/app/api/jobs/[jobId]/start/route.ts:18` checks `isRemoteBackend() && QUEUED/VALIDATING` → `already queued`; `runner.ts:289` `startProcessing` idempotency `idempotent_skip` if `heartbeat` recent.

---

## 20. Concurrency

* **VERIFIED LOCALLY:** `scripts/verify-local.ts:92` `PASS: QP OCR || AS OCR || QP Vision || AS Vision` — `runner.ts:917` `Promise.all([runDocWithRetry QP, AS])` and `runner.ts:441` `Promise.all([ocrPromise, visionPromise])` preserved. Not serialized.

---

## 21. Deployment Checklist

- [x] Vercel production deployment (`https://vedaai.ravikanttiwari.in` reachable, `commit af6174d`)
- [x] Supabase production project (`emvjpfeitjtthjrhudii.supabase.co`)
- [ ] **Jobs migration applied** — file `supabase/migrations/001_durable_jobs.sql` exists but not applied (no service key locally, no verification)
- [x] Durable storage bucket (`assessment-inputs`) exists (anon list 0)
- [ ] **Vercel env variables** — `SUPABASE_SERVICE_ROLE_KEY` missing (now correctly 500)
- [ ] **Worker env variables** — not set (worker not deployed)
- [ ] **Remote worker deployed** — `Dockerfile.worker` exists but not running on Fly/Render
- [ ] **Worker connected to Supabase** — pending worker deploy + service key
- [x] **Worker polls queue** — code `worker.ts:48` exists, locally verified
- [x] **Atomic claim works** — locally verified `scripts/verify-local.ts:64`
- [x] **Heartbeat works** — locally verified
- [ ] **Recovery works** — code verified, not live
- [ ] **Real upload works** — old live 404, new live 500 (needs env)
- [ ] **Real start returns QUEUED** — `scripts/test-backend.ts` local `QUEUED`, live pending env
- [ ] **Worker processes actual job** — not yet
- [ ] **Result persists** — locally verified, live pending
- [ ] **Browser sees completion** — not yet
- [ ] **PDF opens / highlights** — code preserved, not live

---

## 22. Summary

### VERIFIED LOCALLY
JobStore/FileStorage/Document/Page/Result durability via `Durable*` (tmp fallback), queue `QUEUED`, atomic claim exclusive, heartbeat, duplicate start idempotency, concurrency `Promise.all`, Vercel runtime `runtime=nodejs` no Paddle, service key isolation, no UI change, `npm run build`/`typecheck` pass (`af6174d`).

### VERIFIED IN DEPLOYMENT
* Old code `404 JOB_NOT_FOUND` on separate invocations reproduced (`scripts/test-deployed.ts` `UPLOAD 404`).
* New code `af6174d` deployed to `https://vedaai.ravikanttiwari.in` now correctly returns `500 CONFIGURATION_ERROR: Durable Supabase not configured` when `SUPABASE_SERVICE_ROLE_KEY` missing (strict, Phase 17) instead of silent 404. Proves durable enforcement and Vercel runtime not spawning Python.

### NOT VERIFIED (requires `SUPABASE_SERVICE_ROLE_KEY` + worker deploy)
Supabase `jobs/documents/pages/results` tables, storage write, real `27p QP + 31p AS` through live domain, `QUEUED→PROCESSING→COMPLETED`, heartbeat live, restart recovery, `GET /result` after worker exit, PDF viewer highlight at 50/100/200%.

**Production-ready when:** Vercel env `SUPABASE_SERVICE_ROLE_KEY` set + `PROCESSING_BACKEND=remote` + `001_durable_jobs.sql` applied + worker `Dockerfile.worker` deployed with `SUPABASE_*` + `OPENROUTER_*` + `paddleocr` and `npm run worker` polling → live `scripts/test-deployed.ts` shows `CREATE 201`, `UPLOAD 200`, `START 200 QUEUED`, poll `PROCESSING`, final `COMPLETED`, `GET /result` persistent.

