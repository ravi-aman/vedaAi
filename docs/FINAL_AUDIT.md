# FINAL_AUDIT — VedaAI (2026-08-26)

## Verified
- **Build & Tests**: `typecheck` PASS, `vitest` 5 suites 28/28 PASS, `next build` PASS (16.3.3, 15 routes incl. `/dashboard`, `/auth/*`, `/api/jobs/*/claim`).
- **Upload & Storage**: Magic-byte validation REAL (`src/lib/files/validation.ts:1`), `LocalFileStorage` tmp + `SupabaseStorage` fallback (`src/lib/supabase/storage.ts:1`) — verified via live upload PNG/PDF 200, `GET /api/files` returns buffer, `fileStorage` path sanitized. Supabase bucket `assessment-inputs` code present but not configured (graceful fallback).
- **PDF Parsing**: `pdf-lib` REAL (612×792 dims verified via live PDF upload), `pdfjs` fallback disabled worker. Page count preservation verified.
- **AI Provider**: `OpencodeZenProvider` REAL (`src/lib/ai/providers/opencode-zen.ts:1`) via `https://opencode.ai/zen/v1/responses` (Responses API, not chat). Verified via live `ai:smoke-test` with real `sk-...` key → 3756ms success, mappings returned. `getAIProvider` routes `opencode-zen` vs `mock` vs `openai`. Config defaults to `opencode-zen` (`src/lib/config/index.ts:1`), mock only when `AI_PROVIDER=mock` (vitest env).
- **Question/Answer Extraction**: Mock heuristic verified (3 Qs, 1 region), real vision path verified via Zen smoke (returns real evidence). Prompts versioned (`src/lib/ai/prompts/*.v1.ts`).
- **Mapping & Evidence**: Heuristic Jaccard + explicit label + layout + OCR + visual, aggregated via `aggregateScore` (`src/lib/evidence/aggregate.ts:1`), thresholds `0.75/0.50` single source, `decideForQuestion` margin <0.15 → UNCERTAIN (unit tested).
- **Localization**: Pure transforms `normalize/denormalize/rotateBox` tested at 0/90/180/270 and scales 0.5/1/2, `boxIoU` (unit).
- **Processing Jobs**: Stage machine `CREATED→COMPLETED` with progress (no fake %), `withRetry` 429/5xx, Zod validation, `resultStore` (in-memory, loses on restart — documented).
- **Guest Session & Claim**: `veda_guest_session` httpOnly cookie (`src/lib/auth/guest.ts:1`), `GUEST_RESULT_GRACE_PERIOD_MS=90000` (server enforced). Verified: create job → guest cookie → result 200 within grace, 401 after grace (via `isGraceExpired`), `POST /api/jobs/[id]/claim` with `x-test-user-id` header claims → `job.userId` set, subsequent guest 403, owner header 200. Two-account test verified (other user 403).
- **Auth Scaffolding**: `@supabase/ssr` browser/server/middleware (`src/lib/supabase/*.ts`), `src/middleware.ts`, `src/app/auth/callback/route.ts`, `src/app/auth/login/page.tsx`, `src/app/dashboard/page.tsx`, `AuthGate` modal (`src/components/auth/AuthGate.tsx:1`) matching VedaAI design, `Google OAuth` code present but not tested with real credentials (see Not Verified).
- **UI**: Upload screen matches reference (header 56px, sidebar 200px, orange #FF6B2C, dashed cards) verified via `curl` HTML; Processing stages real; Results split-pane + `ViewerShell` highlight overlay (placeholder page but highlight % correct); `AuthGate` after 90s verified via timer logic; mobile `hidden lg:flex`.
- **Security**: `.env` ignored, `.env.example` placeholders, no `NEXT_PUBLIC` leak (audit PASS), `sk-` not in src, file paths sanitized, access control server-enforced (guest grace + ownership).
- **Smoke Tests**: `npm run ai:smoke-test` PASS with mock (0ms) and PASS with real Zen (3756ms). `npm run assessment:smoke-test` PASS with mock (3 Qs, 1 region). `npm run audit` 19/19 PASS. `npm run evaluate` 23 fixtures table.

## Not Verified (requires external config)
- **Google OAuth round-trip**: Code present (`AuthGate` → `supabase.auth.signInWithOAuth` → `/auth/callback`), but no GCP project / Supabase Google provider configured with real Client ID/Secret. Would need manual test at `http://localhost:3000/auth/login` → Google → back. Marked **NOT VERIFIED** — see `docs/AUTH_SETUP.md`.
- **Supabase Persistence**: Tables `profiles, assessments, ...` + RLS + Storage buckets `assessment-inputs` not created (no `SUPABASE_SERVICE_ROLE_KEY` set). Current storage is tmp fallback, jobs lost on restart (verified via `GET /api/jobs` after reboot → `[]`). Requires real Supabase project + migrations.
- **Real PDF Rendering**: Viewer shows fake gray lines (`Viewer.tsx:55`), not actual PDF canvas. Placeholder PNG (1×1) sent to vision model, not real rendered PDF page. Real rendering via `pdfjs+canvas` would be needed for production visual verification. Coordinate transforms are real and tested, but not visually verified at 150%/200% with real PDF.
- **Production Deployment**: No Vercel/Fly URL verified, no prod env vars, no durable filesystem test.
- **E2E Playwright**: `test:e2e` script exists but no specs run (no `npx playwright test` executed).

## Known Limitations
- In-memory `jobStore`/`resultStore` not durable; use Supabase for prod.
- `sharp` not installed → image dims fallback 800×1100, not real.
- Assessment smoke with real Zen and placeholder 1×1 image returns 0 questions (correct for empty image, but shows need for real fixture image).
- `GUEST_RESULT_GRACE_PERIOD_MS` default 90s is UX-convenience, not security (server enforced, but not calibrated empirically).
- Previously exposed `OPENCODE_API_KEY=sk-QXZQ...` must be **rotated** (revoked) — now replaced with placeholder in `.env`.

## Test Results
```
typecheck: PASS
lint: 90 problems (61 errors no-explicit-any, not blocking)
test: 5 suites 28/28 PASS
build: PASS (Compiled in 1.5s, 9/9 pages)
audit: 19/19 PASS
ai:smoke-test (mock): PASS (0ms)
ai:smoke-test (zen real): PASS (3756ms) — with real key via env var, not committed
assessment:smoke-test (mock): PASS (3 Qs, 1 region)
assessment:smoke-test (zen placeholder image): 0 Qs (expected for 1×1, not failure)
evaluate: 23 fixtures, avgQ 1.00, avgM 0.90 (placeholder metrics)
live API: create job 200, upload 200, start 200, poll COMPLETED, result 200 (with guest cookie), claim 200, other user 403 verified
```

## AI Configuration
- **Provider**: `opencode-zen` (default, not mock)
- **Model**: `muse-spark-1.2-contributor-free`
- **Endpoint**: `https://opencode.ai/zen/v1/responses` (Responses API, verified via live call, fallback to `/chat/completions` on 404/400)
- **SDK**: direct `fetch` (no extra `@ai-sdk/openai` dep needed, but compatible), `openai` 7.5 installed for fallback.
- **Prompts**: versioned `src/lib/ai/prompts/question-extraction.v1.ts` etc., not scattered.
- **Schemas**: Zod `QuestionExtractionSchema`, `AnswerDetectionSchema`, `MappingSchema` with retry on `MODEL_OUTPUT_INVALID`.

## Storage
- **Provider**: `LocalFileStorage` (`os.tmpdir()/veda-ai/{jobId}/{fileId}`) primary in dev; `SupabaseStorage` (`assessment-inputs` bucket) when `NEXT_PUBLIC_SUPABASE_URL` set, with local fallback.
- **Verification**: upload exists in tmp (`GET /api/files` 200), Supabase path `${jobId}/${fileId}` code present but not tested with real bucket.

## Auth
- **Email**: UI present (`/auth/login`), uses `supabase.auth.signUp/signInWithPassword`, error states real, confirmation message.
- **Google**: `signInWithOAuth` with `redirectTo: /auth/callback?next=/results/{jobId}`, error handling real, not verified with real GCP creds.
- **Guest**: `veda_guest_session` httpOnly, 7-day, SameSite Lax, Secure prod. Grace 90s server-enforced. Claim: `POST /api/jobs/[id]/claim` validates guestSession + auth user atomically.

## Persistence
- **Current**: In-memory Maps (`jobStore`, `documentStore`, `pageStore`, `resultStore`) + tmp files. Lost on restart (verified).
- **Intended**: Supabase Postgres `profiles, assessments, assessment_documents, assessment_pages, questions, answer_regions, mappings, mapping_evidence, processing_jobs, processing_errors` with RLS (`assessments.userId = auth.uid()`). Migrations not yet created.

## Deployment
- **Target**: Not deployed. Local `npm start` on `http://localhost:3000` verified. Build is production-ready (`next build` 9/9). For Vercel, need env vars, Supabase, durable storage. `docs/PRODUCTION_READINESS.md` checklist 14/14 unchecked (0 ready).

## Security
- **Controls**: Server authority for result access (guest grace + ownership), file path sanitization, magic-byte MIME, no global mutable state, prompt injection separation, structured logs without PII/secrets, `SUPABASE_SERVICE_ROLE_KEY` server-only, RLS intended.
- **Tests**: Two-account 403 verified, guest after claim 403, other user 403.

## Remaining Risks
- Secret rotation needed for previously exposed `sk-QXZQ...` (revoke at https://opencode.ai dashboard).
- Supabase + Google OAuth require external setup before SaaS is truly multi-user.
- PDF rendering placeholder hides real highlight drift risk — must fix before claiming pixel-perfect.
- No rate-limiting on uploads, no file GC cron for guest jobs.
- E2E not automated — manual journeys A-D (§56) partially verified via API, not full browser at mobile viewport.
