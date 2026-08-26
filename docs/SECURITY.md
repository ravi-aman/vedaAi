# SECURITY — VedaAI

## Secrets
- `AI_API_KEY`, `OPENCODE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` never `NEXT_PUBLIC`, never client bundle, never logs, never committed. Verified via `rg NEXT_PUBLIC.*AI_API_KEY` none.
- `.env` is gitignored (`git check-ignore .env` → ignored), `.env.example` contains placeholders only. Previously exposed `sk-...` in `.env` has been rotated and replaced with `sk-REPLACE...`.

## File Security
- Generated internal IDs (`uuid`) for storage keys, never raw `student_answer_sheet.pdf`.
- MIME via `file-type` magic bytes, not extension.
- Sanitized filenames, `getPath` strips `[^a-zA-Z0-9-]`.
- Uploads stored as `{jobId}/{fileId}` in `assessment-inputs` bucket (Supabase) or `os.tmpdir()/veda-ai` fallback. Not publicly guessable (uuid v4, 122-bit entropy).
- No public `storage/<filename>` URL; access via `GET /api/files/[jobId]/[fileId]` which checks job ownership + guest session.

## Access Control (Server Authority)
```
guest + active grace (now - createdAt < 90000) → temporary result access
guest + expired → 401 AUTH_REQUIRED (server, not just client timer)
authenticated + owns assessment (assessment.userId === auth.user.id) → full access
authenticated + does not own → 403
```
- Implemented in `src/app/api/jobs/[jobId]/result/route.ts` (checks `getGuestSession` + `supabase.auth.getUser` + `isGraceExpired`).
- Frontend timer (`AuthGate` after 90s) is UX only; server is authority.

## Claiming
- `POST /api/jobs/[jobId]/claim` validates guestSession ownership + authenticated user, atomically sets `job.userId`. No `?assessmentId=` without verification.
- Guest cookie `veda_guest_session` is httpOnly, SameSite Lax, Secure in prod.

## Retention
- `GUEST_RESULT_GRACE_PERIOD_MS=90000` (default 90s) configurable via `src/lib/config`, not hardcoded in components. After grace, guest result requires auth; unauthenticated access returns 401, not 200 with data.
- Guest unclaimed jobs can be GC'd via `fileStorage.deleteJob` after TTL (TODO: cron). Authenticated jobs retained while user owns assessment.
- Documented in `docs/ARCHITECTURE.md` and here.

## RLS (when Supabase)
- Tables: `profiles, assessments, assessment_documents, assessment_pages, questions, answer_regions, mappings, mapping_evidence, processing_jobs, processing_errors`
- Policies: `authenticated users may only read/write own assessments where assessments.userId = auth.uid()`. Guest rows `userId IS NULL` accessible only via service_role + guest token validation (server). `SUPABASE_SERVICE_ROLE_KEY` server-only.
- Verification: run `scripts/audit.ts` and manual two-account test (User B 403 on User A result).

## Prompt Injection
- OCR/text treated as untrusted data; system/data separation in prompts (`src/lib/ai/prompts/*.v1.ts`), never concatenating raw OCR into system prompt.
- Validation: Zod parse → schema → semantic → domain → accept/retry/fail.

## Logging
- Structured logs `jobId, stage, duration, status, errorCode`; never full student content or secrets.

## Known Limits
- In-memory jobStore fallback is not durable; on serverless restart jobs lost (documented). Use Supabase for persistence.
