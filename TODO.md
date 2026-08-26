# TODO — VedaAI Audit-Driven Completion

## P0 — Blocking / Fake / Broken
- [x] **P0-1 Secret leak**: `.env` contained real `OPENCODE_API_KEY=sk-...` — rotate, replace with placeholder, ensure `.env.example` empty, verify `.gitignore` + `git check-ignore`. **Files**: `.env`, `.env.example`, `opencode.json` **AC**: no real key in repo, `git diff` clean. **Verify**: `rg sk- src` none, `git status` no `.env` tracked. (Will be fixed next commit)
- [ ] **P0-2 AI default mock**: `AI_PROVIDER=mock` is unacceptable prod default — change to `opencode-zen`, default `AI_MODEL=muse-spark-1.2-contributor-free`, `AI_BASE_URL=https://opencode.ai/zen/v1`. **Files**: `src/lib/config/index.ts`, `.env.example`, `.env` **AC**: `getConfig()` defaults to zen, mock only when explicitly `AI_PROVIDER=mock` for tests. **Verify**: `npm run ai:smoke-test` uses real provider unless `mock` forced.
- [ ] **P0-3 OpenCode Zen Responses API**: current `OpenAIProvider` uses `chat.completions` (wrong for Zen). Implement `OpencodeZenProvider` via `https://opencode.ai/zen/v1/responses` using `openai` SDK `responses.create` or direct fetch, with `@ai-sdk/openai` compat. **Files**: `src/lib/ai/providers/opencode-zen.ts`, `src/lib/ai/factory.ts` **AC**: smoke test hits `responses` endpoint, parses JSON, success. **Verify**: `npm run ai:smoke-test` PASS with real key.
- [ ] **P0-4 Config separation**: `OPENCODE_*` (coding agent) vs `AI_*` (app runtime) — validate `opencode.json` per current spec (`provider @ai-sdk/openai`, baseUrl substitution). **Files**: `opencode.json`, `src/lib/config/index.ts` **AC**: `opencode.json` validated, app never reads `OPENCODE_API_KEY` as `AI_API_KEY`. **Verify**: `cat opencode.json` correct schema.
- [ ] **P0-5 In-memory persistence loss**: jobs lost on restart — implement Supabase fallback with graceful degradation + document retention `GUEST_RESULT_GRACE_PERIOD_MS`. **Files**: `src/lib/storage/index.ts` **AC**: if Supabase env missing, app shows config error not fake success, but still works via tmp for dev. **Verify**: restart poll retains job when Supabase configured, else warns.

## P1 — Core Functional Gaps
- [ ] **P1-1 Real PDF rendering**: replace `placeholderPngBase64` with real render via `pdfjs-dist` + `canvas` (node). **Files**: `src/lib/documents/pdf.ts`, `src/lib/jobs/runner.ts:222` **AC**: page PNG base64 is actual rendered content, not 1×1 transparent. **Verify**: upload PDF → base64 length >10k, not 90 chars.
- [ ] **P1-2 Viewer real PDF**: `ViewerShell` currently fake lines — integrate `pdfjs-dist` client viewer or `react-pdf` with highlight overlay using `transformForDisplay`. **Files**: `src/components/viewer/Viewer.tsx` **AC**: viewer loads `GET /api/files/[jobId]/[fileId]` PDF, highlights stay at 100/150/200% zoom. **Verify**: manual browser highlight drift test.
- [ ] **P1-3 OCR provider**: create `OcrProvider` + `AiVisionOcrProvider` (uses Zen vision) + `Noop` for tests. **Files**: `src/lib/ocr/` **AC**: tokens with bbox/confidence returned, geometry preserved. **Verify**: `assessment:smoke-test` shows OCR tokens.
- [ ] **P1-4 Remove production mock data**: ensure `MockAIProvider` never imported when `AI_PROVIDER != mock` (guard in factory, not just config). **Files**: `src/lib/ai/factory.ts` **AC**: `rg mock` in `src` only under `providers/mock.ts` and tests. **Verify**: `npm run audit` checks.

## P2 — SaaS Authentication
- [ ] **P2-1 Supabase SSR**: add `npm i @supabase/supabase-js @supabase/ssr`, create `src/lib/supabase/{client,server,middleware}.ts` per official SSR. **AC**: server can get session via cookies. **Verify**: `npm run typecheck`.
- [ ] **P2-2 Email auth**: signup/signin/signout/confirm UI matching VedaAI design. **Files**: `src/app/auth/`, `src/components/auth/` **AC**: flows work with Supabase email. **Verify**: manual email signup (needs confirmation).
- [ ] **P2-3 Google OAuth**: configure provider, callback `app/auth/callback/route.ts`, document `docs/AUTH_SETUP.md`. **AC**: Google button triggers OAuth, session established. **Verify**: manual Google login round-trip (or NOT VERIFIED with docs if creds missing).
- [ ] **P2-4 Guest session**: generate secure `guestSessionId` (httpOnly cookie, `crypto.randomUUID`), associate `assessment guestSessionId` until claim. **Files**: `src/lib/auth/guest.ts`, `src/app/api/jobs/route.ts` **AC**: unauthenticated upload creates guest cookie. **Verify**: `curl -c` shows cookie.
- [ ] **P2-5 Grace period**: env `GUEST_RESULT_GRACE_PERIOD_MS=90000`, server checks `resultCreatedAt + grace > now` OR `user owns assessment`. **Files**: `src/lib/config`, `src/app/api/jobs/[jobId]/result/route.ts` **AC**: guest after 90s gets 401 auth required. **Verify**: manual wait timer.
- [ ] **P2-6 Auth modal**: polished VedaAI modal `Save your assessment` with Continue with Google/Email. **Files**: `src/components/auth/AuthGate.tsx` **AC**: appears after grace, not before. **Verify**: browser wait 90s.
- [ ] **P2-7 Claim**: `POST /api/assessments/[id]/claim` validates `guestSession ownership + claim token + assessment state + auth user` atomically, sets `assessment.userId`. **Files**: `src/app/api/assessments/[id]/claim/route.ts` **AC**: after claim, refresh shows owned assessment, other user denied. **Verify**: two-account test.
- [ ] **P2-8 Database & RLS**: tables `profiles, assessments, ...` + policies. **Files**: `supabase/migrations/` **AC**: RLS enforced. **Verify**: `user A` cannot read `user B` row (SQL test).

## P3 — Reliability
- [ ] **P3-1 Idempotency**: key `jobId+stage+pipelineVersion+documentHash` prevents duplicate `Start Mapping` double-click. **Files**: `src/lib/jobs/runner.ts` **AC**: double POST creates 1 job. **Verify**: manual double-click test.
- [ ] **P3-2 Retry & integrity**: `VALIDATING_RESULT` checks all IDs/bounds before `COMPLETED`; never `COMPLETED` on AI success alone. **Files**: `src/lib/jobs/runner.ts:476` **AC**: invalid AI output → `FAILED MODEL_OUTPUT_INVALID`. **Verify**: `ai-malformed` fixture.

## P4 — UX / Visual Polish
- [ ] **P4-1 Fidelity**: match sidebar 200px, header 56px, orange `#FF6B2C`, card radius. **Files**: `src/app/page.tsx`, `src/components/*` **AC**: pixel check vs reference (needs screenshots). **Verify**: browser.
- [ ] **P4-2 Animations**: subtle, `prefers-reduced-motion`. **AC**: no bounce, represents real state.

## P5 — Testing
- [ ] **P5-1 Smoke tests**: `npm run ai:smoke-test` (real Zen call) + `npm run assessment:smoke-test` (fixture PDF→result). **Files**: `scripts/ai-smoke.ts`, `scripts/assessment-smoke.ts` **AC**: both PASS with real creds, print safe diagnostics. **Verify**: run both.
- [ ] **P5-2 Expand tests**: file validation, coordinate rotation visual, state machine, RLS, security. **AC**: `npm run test` >50 tests. **Verify**: pass.
- [ ] **P5-3 Evaluate harness**: wire `fixtures/` to real pipeline, report precision per §67. **Files**: `scripts/evaluate.ts` **AC**: outputs metrics table. **Verify**: `npm run evaluate`.

## P6 — Deployment
- [ ] **P6-1 Env & checklist**: `docs/PRODUCTION_READINESS.md` + `npm run audit`. **AC**: checklist covers AI/storage/auth/RLS/build. **Verify**: `npm run audit` pass.
- [ ] **P6-2 Supabase buckets**: `assessment-inputs` etc. **AC**: upload actually exists in storage dashboard. **Verify**: manual.

## P7 — Final Audit
- [ ] **P7-1 Manual journeys A-D (§56)**: guest → timer → signup → owned → google → deny. **AC**: all 24 steps pass. **Verify**: browser.
- [ ] **P7-2 FINAL_AUDIT.md** with Verified/Not Verified/Limitations. **AC**: truthful. **Verify**: doc exists.
