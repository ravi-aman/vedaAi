# PRODUCTION_READINESS — Checklist

Before declaring production ready, verify each with real execution:

- [ ] real AI configured (`AI_PROVIDER=opencode-zen`, `AI_MODEL=muse-spark-1.2-contributor-free`, `AI_BASE_URL=https://opencode.ai/zen/v1`, `AI_API_KEY` set, `npm run ai:smoke-test` PASS)
- [ ] real file storage configured (Supabase buckets `assessment-inputs` exist, `SUPABASE_SERVICE_ROLE_KEY` set, upload appears in dashboard, `GET /api/files` returns after restart)
- [ ] auth configured (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, Site URL, Redirect `.../auth/callback` set, `src/middleware.ts` updates session)
- [ ] Google OAuth configured (GCP project, consent, Client ID/Secret in Supabase, `Continue with Google` round-trip tested)
- [ ] email auth configured (Supabase Email enabled, confirmation tested: signup → confirm → login)
- [ ] RLS enabled (policies on `assessments` etc., `user A` cannot read `user B` row — tested via SQL)
- [ ] result ownership verified (guest → 90s grace → AuthGate → signup → `POST /api/jobs/[id]/claim` → refresh still owned; other user 403)
- [ ] PDF rendering verified (upload PDF → rendered base64 >10k, not 1×1 placeholder; viewer loads PDF)
- [ ] OCR verified (handwriting region has bbox + confidence, diagram-only detected)
- [ ] mapping verified (out-of-order, no-number, ambiguous → UNCERTAIN, not forced)
- [ ] highlight verified (100/150/200%, rotation 0/90/180/270, multi-page, crop)
- [ ] E2E verified (upload → processing → result → click Q → highlight → timer → auth → claim → reload)
- [ ] secrets removed (`.env` ignored, `.env.example` placeholders, no `sk-` in src, no `NEXT_PUBLIC` leak)
- [ ] production build passes (`npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`)
- [ ] production URL verified (deployed, env vars set, callback URLs include prod domain)

Run `npm run audit` to automate checks for: required files, env, no mock in prod, build, tests, docs, secrets.

Current status (2026-08-26): **NOT READY** — Supabase + Google OAuth not configured with real credentials, storage is tmp fallback, viewer is placeholder, E2E not run. See `docs/SYSTEM_AUDIT.md` and `docs/FINAL_AUDIT.md`.
