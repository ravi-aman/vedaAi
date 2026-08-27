# AWS Textract Migration — Repository Audit

**Date:** 2026-08-27
**Repository:** VedaAI (`E:\vedaAi`)
**Purpose:** Pre-migration audit before replacing GCP Cloud Vision OCR with AWS Textract + S3. Covers entire repo, not just `src/`.

---

## 1. Current Architecture

- Next.js 16.3.3 App Router, React 19, TypeScript strict, Tailwind 4.
- Conceptual pipeline: `DOCUMENT -> OBSERVATION -> NORMALIZED -> STRUCTURE -> CANDIDATE -> EVIDENCE -> DECISION -> VALIDATION -> LOCALIZATION -> UI` (see `AGENTS.md`).
- Ten layered boundaries enforced: File, Document, Perception (OCR), Structure, Matching, Evidence, Decision, Localization, Presentation, Operations.
- Client: `/` upload → `/processing/[jobId]` polling → `/results/[jobId]` split-pane.
- Server: Route Handlers under `src/app/api/`, `lib/jobs/runner.ts` orchestrates, `lib/storage` in-memory, `lib/ai` via OpenCode Zen (`opencode-zen`), `lib/ocr` via GCP Vision.
- No global mutable `let currentQuestions`; job-scoped via `JobStore`.

## 2. Current Upload Flow

- `POST /api/jobs` creates `ProcessingJob` (uuid, `CREATED`, `pipelineVersion`).
- `POST /api/jobs/[jobId]/upload` with `FormData` (`kind=questionPaper|answerSheet`, `file`).
  - Validates via `file-type` magic bytes, MIME, extension, size (`MAX_FILE_SIZE_MB=100`), page count (`MAX_PAGES=50`).
  - Saves to `LocalFileStorage` (`os.tmpdir()/veda-ai/{jobId}/{fileId}`) + `.meta.json`.
  - Creates `Document` + `DocumentPage` stubs; updates `job.questionPaperFileId / answerSheetFileId`.
- `POST /api/jobs/[jobId]/start` calls `startProcessing(jobId)` which spawns `runJob` async (non-blocking, with 10min hard timeout guard).
- Front-end `UploadDropzone` → `FileCard` → poll `GET /api/jobs/[jobId]`.

## 3. Current File Storage

- Interface `FileStorage` in `src/lib/storage/index.ts:15`.
- Implementation: `LocalFileStorage` (tmp dir). No S3, no Supabase Storage for processing files (Supabase used only for auth, not file persistence for OCR staging).
- `JobStore`: `InMemoryJobStore` (Map). `documentStore`/`pageStoreApi` also in-memory Maps.
- Persistence is **non-durable** — lost on restart. Documented as limitation; Vercel will not retain files.

## 4. Current OCR Provider

- Abstraction `OcrProvider` in `src/lib/ocr/types.ts:80` with `submitDocument`, `getOperationStatus`, `getOperationResult`, `cancelOperation`.
- Real impl: `GoogleVisionOcrProvider` (`src/lib/ocr/google-vision.ts:41`) — GCP Vision `files:asyncBatchAnnotate` with `DOCUMENT_TEXT_DETECTION`.
- Mock: `MockOcrProvider` (`src/lib/ocr/mock.ts:3`) — synthetic 0.9 confidence blocks, used when `OCR_PROVIDER=mock`.
- Factory `getOcrProvider()` (`src/lib/ocr/factory.ts:7`) selects by `OCR_PROVIDER`.
- Error taxonomy `OcrError` / `OcrErrorCodes` (`src/lib/ocr/errors.ts`).

## 5. Every GCP Dependency

| File | Dependency |
|------|------------|
| `package.json:19` | `@google-cloud/storage@^8.0.1` |
| `package.json:20` | `@google-cloud/vision@^6.0.0` |
| `src/lib/ocr/gcs.ts:1` | `import { Storage } from "@google-cloud/storage"` |
| `src/lib/ocr/google-vision.ts:1` | `import { ImageAnnotatorClient } from "@google-cloud/vision"` |
| `package-lock.json` | transitive `google-auth-library`, `google-gax`, `@google-cloud/common`, etc. |
| `docs/GOOGLE_VISION_OCR.md` | Entire doc is GCP-specific |
| `docs/AUTH_SETUP.md:23` | GCP project setup for Google OAuth (legitimate — must preserve) |

**Google OAuth vs GCP OCR:** OAuth via Supabase `signInWithOAuth({provider: "google"})` is **not** GCP OCR; it uses GCP project only for OAuth client. Must NOT be removed.

## 6. Every GCP Environment Variable

Defined in `src/lib/config/index.ts:22-32` and `.env.example:7-19`:

```
OCR_PROVIDER=google-vision
GOOGLE_CLOUD_PROJECT_ID
GOOGLE_CLOUD_STORAGE_BUCKET
GOOGLE_CLOUD_OCR_INPUT_PREFIX (default ocr-input)
GOOGLE_CLOUD_OCR_OUTPUT_PREFIX (default ocr-output)
GOOGLE_CLOUD_KEY_JSON
GOOGLE_APPLICATION_CREDENTIALS
OCR_OPERATION_TIMEOUT_MS (300000)
OCR_POLL_INTERVAL_MS (5000)
OCR_MAX_RETRIES (3)
```

Helper `isGoogleOcrConfigured()` / `requireGoogleOcrConfig()` in `src/lib/config/index.ts:92-106`.
Usage: `src/lib/jobs/runner.ts:173,244,303`, `src/lib/ocr/gcs.ts:37-40`, `src/lib/ocr/google-vision.ts:18-44`.

## 7. Every GCP SDK/Package

- `@google-cloud/vision` (ImageAnnotatorClient)
- `@google-cloud/storage` (Storage)
- Transitive: `google-auth-library`, `google-gax`, `proto-loader`, etc. in `package-lock.json`.
- No Document AI package used.
- No `vision.googleapis` direct fetch; uses Node client.

## 8. Every API Route / Server Action Using GCP

- No direct API route imports GCP, but **indirectly via `runner.ts`**:
  - `src/app/api/jobs/[jobId]/start/route.ts` → `startProcessing` → `runJob` → `ocrStage` → `getOcrProvider()` → `GoogleVisionOcrProvider`.
  - `src/app/api/jobs/route.ts` (job creation) — no GCP.
  - `src/app/api/jobs/[jobId]/route.ts` (job fetch) — no GCP.
  - `src/app/api/jobs/[jobId]/upload/route.ts` — no GCP directly.
- Server actions: none (Route Handlers only).

## 9. Every Client-Side Reference to OCR

- **None direct** — OCR is server-only. Client only polls `GET /api/jobs/[jobId]` and displays `currentStage` labels.
- `src/app/processing/[jobId]/page.tsx` maps stages to UI labels: `OCR_SUBMITTED`, `OCR_PROCESSING`, `OCR_COMPLETED`.
- `src/components/viewer/Viewer.tsx` renders highlights using `normalizedBoxes` which currently originate partially from mock OCR augmentation.
- No `NEXT_PUBLIC` OCR vars.

## 10. Current Extraction Pipeline

`src/lib/jobs/runner.ts:30-198`:

```
VALIDATING → PREPROCESSING → OCR_SUBMITTED → OCR_PROCESSING → OCR_COMPLETED
  → EXTRACTING → STRUCTURING → MATCHING → LOCALIZING → VALIDATING_RESULT → COMPLETED
```

- `validateJob` checks both files present.
- `preprocess` inspects via `pdfjs-dist`/`inspectImage`, saves `DocumentPage` entries.
- `ocrStage` handles GCP async or mock path (see §13).
- `extracting` builds vision input (OCR_TEXT hints + placeholder PNG or real PDF base64) → `provider.extractStructure` + `detectAnswerRegions`.
- `structuring` builds `QuestionNode`/`AnswerRegion` with normalized numbering.
- `matchingStage` multi-signal scoring → `decideForQuestion`.
- `localizing` passthrough; `validatingResult` ensures questions exist.

## 11. Current Question Parsing

- `src/lib/ai/providers/opencode-zen.ts` / `openai.ts` — LLM `extractStructure` returns `questions[]` with `rawNumber`, `normalizedNumber`, `text`, `pageRefs`, `sourceRegions`, `confidence`, `evidence`, `marks`.
- `src/lib/structure/numbering.ts` `normalizeNumber()` handles `11(a)`, `13(ii)` → preserves raw, computes `parent`, `depth`, `partType`.
- `src/lib/jobs/runner.ts:572-620` `structuring` resolves `parentId`, `pageRefs` via `resolvePageId()`, ensures `sourceRegions` non-empty (fallback 0.05/0.1 + idx*0.05 box if missing — **synthetic, but not hardcoded answer**).
- No regex hardcoded subject keywords; numbering is generic.
- Validation via Zod in `lib/validation` + `AI_PROVIDER`.

## 12. Current Answer Parsing

- LLM `detectAnswerRegions` returns `regions[]` with `pageId`, `boxes[][]`, `rawText`, `questionLabel`, `labelConfidence`, etc.
- `src/lib/jobs/runner.ts:622-671` creates `AnswerRegion` per LLM region, maps `boxes` to `NormalizedBox`, resolves `pageId`, computes `regionType`.
- Groups by `questionLabel` to merge multi-box same-label answers → `AnswerGroup`.
- If OCR available and LLM under-returns, augments from `asOcr.pages[].blocks` (heuristic, `runner.ts:536-554`).
- Supports handwriting labels: `Q.1`, `Ans 1`, `1(a)` etc. via `normalizeNumber` later in matching.

## 13. Current Answer Mapping

- `src/lib/jobs/runner.ts:681-783` `matchingStage`:
  - For each question × each answerGroup, generates candidates.
  - Signals: explicit label (prefix-insensitive comparison), semantic Jaccard, layout proximity, OCR confidence, visual evidence.
  - `buildEvidence` + `aggregateScore` → scored candidates.
  - `decideForQuestion` applies `MAPPING_HIGH_THRESHOLD=0.75`, `MAPPING_REVIEW_THRESHOLD=0.50` (from `lib/config`) to yield `MATCHED|UNCERTAIN|UNMATCHED|UNANSWERED`.
  - Does **NOT** use `question index === answer index` (forbidden pattern absent).
  - Produces `MappingDecision` with `highlightRegions` from chosen group's regions.

## 14. Current Highlighting Implementation

- Canonical normalized `[0,1]` per original page dims (`NormalizedBox`).
- Transform layer `src/lib/coordinates/transform.ts` — pure functions, tested at scales 0.5/1/2, rotations 0/90/180/270.
- `src/components/viewer/Viewer.tsx` `HighlightOverlay` maps `normalizedBoxes` → CSS `%` (`left: x*100%` etc.) inside `relative` page container. `ViewerShell`/`PdfViewer` renders pages.
- Current weakness: `PdfViewer` shows **placeholder fake lines** (`Viewer.tsx:55`), not real PDF canvas; highlight % math is correct but visual verification with real PDF not done.
- Viewer supports `zoom`, `fitWidth`, `page navigation`, `selectedQuestion` sync, multi-region.

## 15. Current PDF/Image Processing

- `src/lib/documents/pdf.ts`: `inspectPdf` via `pdfjs-dist` (page count, dims, rotation), `inspectImage` via `pdfjs-dist` or `sharp` fallback. Not using `canvas` render (placeholder PNG `iVBOR...` 1×1 transparent sent to LLM).
- Magic-byte validation via `file-type` before inspection.
- No aggressive transform; original preserved via `fileStorage`.
- Page dimensions stored in `DocumentPage.width/height/rotation`.
- **Limitation flagged in `docs/SYSTEM_AUDIT.md` and `docs/FINAL_AUDIT.md:21`**: real `pdfjs+canvas` rendering missing.

## 16. Current Database / Storage Architecture

- No Postgres tables for jobs/documents (in-memory Maps only). Supabase configured for **auth only** (`@supabase/ssr`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
- `TODO.md P0-5` notes persistence loss on restart; planned Supabase fallback not yet implemented.
- `src/lib/supabase/storage.ts` exists but not used for processing files (only auth helpers).
- `ArtifactStore` in-memory for page images.

## 17. Current Authentication Architecture

- Supabase Auth SSR: `src/lib/supabase/{client,server,middleware}.ts`, `src/proxy.ts` (middleware), `src/app/auth/callback/route.ts`, `src/app/auth/login/page.tsx`, `src/components/auth/AuthGate.tsx`.
- Email auth + Google OAuth (`supabase.auth.signInWithOAuth({provider:"google"})`).
- Guest session: `src/lib/auth/guest.ts` — httpOnly `guestSessionId` cookie (uuid), associated to `ProcessingJob.guestSessionId`/`userId`/`claimedAt`.
- Claim: `POST /api/jobs/[jobId]/claim` (also `POST /api/assessments/[id]/claim` planned) validates ownership + auth user.
- Grace period `GUEST_RESULT_GRACE_PERIOD_MS=90000` enforced in `src/app/api/jobs/[jobId]/result/route.ts`.
- **Must preserve** — OAuth ≠ OCR.

## 18. Current Processing-State Architecture

- `ProcessingStage` enum in `src/types/index.ts:2-19` (14 stages including `OCR_*`).
- `ProcessingJob` stores `status`, `currentStage`, `progress.stageStates` (`pending|in_progress|completed|failed|skipped`), `error?`, plus OCR fields `ocrOperationId`, `ocrOutputUri`, `ocrInputUri`, `ocrAttempt`, `ocrStartedAt`, `ocrCompletedAt`, `ocrPageCount`.
- No single `isProcessing` boolean; explicit per-stage states maintained in `runner.ts:updateStage`.
- Client polls `GET /api/jobs/[jobId]` every ~1-2s in `processing/[jobId]/page.tsx` and `results/[jobId]/page.tsx`.

## 19. Existing Error Handling

- Typed codes `src/lib/errors/codes.ts:1` (`FILE_INVALID`, `OCR_*`, `MODEL_*`, `MAPPING_FAILED`, etc.) — never `UNKNOWN_ERROR` catch-all without mapping.
- `OcrError` subclass (`src/lib/ocr/errors.ts`) with `retryable` flag and `OcrErrorCodes.CONFIGURATION_ERROR` etc.
- `AppError` for job errors.
- Structured logs with `jobId`, `stage`, `event`, `pageCount`, `sizeMb`, not full document text or secrets.
- UI shows stage-specific errors via `job.error` (`processing/page.tsx`).

## 20. Existing Tests

- `vitest.config.ts` with `AI_PROVIDER=mock` env.
- Unit: `tests/unit/coordinates.test.ts`, `decision.test.ts`, `evidence.test.ts`, `numbering.test.ts`, `ocr.test.ts` (MockOcrProvider + GCS helpers).
- Integration: `tests/integration/job.test.ts` (job isolation, mock pipeline).
- Scripts: `scripts/audit.ts` (19 checks), `scripts/ai-smoke.ts` (real Zen), `scripts/assessment-smoke.ts` (mock pipeline), `scripts/evaluate.ts` (23 fixtures).
- `npm run audit` + `npm run test` + `npm run typecheck` + `npm run lint` exist.
- `package.json` has `"test": "vitest run"` and `"test:e2e": "playwright test"` (Playwright not installed, no e2e yet).

## 21. Existing Mocks / Fakes

- `src/lib/ai/providers/mock.ts:8` `MockAIProvider` — 3 hardcoded questions, 1 region per page (`Sample question 1...`). Guarded: only returned when `AI_PROVIDER=mock` (`src/lib/ai/factory.ts:9`); docs state never imported in prod route when `AI_PROVIDER != mock`.
- `src/lib/ocr/mock.ts:3` `MockOcrProvider` — synthetic pages `Mock OCR page N`, blocks 0.05/0.1 boxes, 0.92 confidence.
- `src/lib/jobs/runner.ts:274-299` mock OCR path (no GCS) + `runner.ts:565-567` `placeholderPngBase64()` 1×1 transparent PNG.
- `fixtures/*/groundTruth.json` — evaluation ground truth (legitimate, outside prod).
- No `fakeProgress()` timer; progress is stage-state driven (honest).
- No `hardcodedSampleQuestions()` in prod except via mock provider.

## 22. Existing TODOs

- `TODO.md` tracks P0-P7 items: secret leak (done), AI mock default, Zen Responses API, config separation, in-memory persistence, PDF rendering, viewer real PDF, OCR provider, mock removal, Supabase SSR, email/Google auth, guest session, grace period, auth modal, claim, RLS, idempotency, retry integrity, fidelity, animations, smoke tests, evaluate harness, production readiness, journeys.
- Code TODOs: `rg TODO` finds only `docs/SYSTEM_AUDIT.md` prose, no `TODO:` comments in `src/` (grep via Select-String confirms).
- All TODOs are tracked, not hidden.

## 23. Existing Dead Code

- Minimal. Candidate dead:
  - `src/types/index.ts` comment `// OCR metadata (Google Vision async)` — will be updated to AWS.
  - `src/lib/ocr/gcs.ts` / `google-vision.ts` — entire modules become dead after migration (to be deleted).
  - No unused giant `utils.ts`.
  - `scripts/gen-pdf2.ts` / `scripts/gen-full-paper.ts` — fixture generators, not dead but not prod.
- No massive dead imports found via manual inspection.

## 24. Existing Security Problems

- Previous `.env` secret leak (`OPENCODE_API_KEY=sk-QXZQ...`) documented in `TODO.md P0-1` and `docs/SECURITY.md:5` — now rotated to placeholder; `.env` is gitignored (`git check-ignore .env` → ignored), `.env.example` has placeholders.
- `src` contains no `sk-` secrets (audit script checks `scripts/audit.ts:74`).
- No `NEXT_PUBLIC_*` secret leakage for OCR/AI keys (only `NEXT_PUBLIC_SUPABASE_URL` which is publishable by design).
- File paths sanitized via `jobId.replace(/[^a-zA-Z0-9-]/g,"")` in storage + GCS.
- Treat OCR text as untrusted — system/data separation mentioned in `AGENTS.md`.
- Coordinate math isolated to `lib/coordinates`.
- Remaining risk: `LocalFileStorage` paths predictable via tmp? mitigated by uuid jobId + sanitization; not public bucket.

## 25. Existing Deployment Assumptions

- Next.js standalone; `next.config.ts` default (no `output: "export"`).
- Long processing: server holds job in memory; client polls. `docs/ARCHITECTURE.md:6` notes concurrency cap 2.
- Vercel limit documented: function 10s/60s insufficient for 10-page Vision pipeline; recommend self-hosted (Fly/Render/EC2) or Vercel workflow (`README.md:106`, `docs/LIMITATIONS.md:31`).
- Supabase SaaS assumed external; local dev uses tmp fallback gracefully.
- `opencode.json` points to `https://opencode.ai/zen/v1` with `@ai-sdk/openai` provider type.
- Dockerfile not present; `README.md` suggests `docker build` without Dockerfile (outdated).
- No IAM roles yet; GCP service account JSON via `GOOGLE_APPLICATION_CREDENTIALS` file path or `GOOGLE_CLOUD_KEY_JSON` string.

---

## Search Evidence

- Package search: `package.json:19-20` confirms only `@google-cloud/storage` + `@google-cloud/vision`.
- Config: `src/lib/config/index.ts:22-32` all GCP vars.
- OCR: `src/lib/ocr/google-vision.ts:1`, `src/lib/ocr/gcs.ts:1`, `src/lib/ocr/factory.ts:2`, `src/lib/jobs/runner.ts:11-12,173,244,303`.
- No GCP OCR vars reach client bundle.
- Mock grep confirms `MockAIProvider`/`MockOcrProvider` isolated to `providers/mock.ts`, `ocr/mock.ts`, `factory.ts`, `tests/`.
- Secrets: `.env.example` placeholders only; `.env` rotated; `rg sk- src` none (per TODO).

## GCP Removal Checklist (for Phase 2)

- Delete `src/lib/ocr/google-vision.ts`, `src/lib/ocr/gcs.ts`.
- Remove `@google-cloud/storage`, `@google-cloud/vision` from `package.json` + `package-lock.json`.
- Remove `GOOGLE_*` / `OCR_PROVIDER=google-vision` env schema, replace with `AWS_*`.
- Update `src/lib/config/index.ts:92-106` helpers to `isAwsConfigured`/`requireAwsConfig`.
- Rewrite `src/lib/ocr/types.ts` provider string to `amazon-textract`.
- Rewrite `src/lib/ocr/factory.ts` to use `TextractOcrProvider`.
- Rewrite `src/lib/jobs/runner.ts` OCR stage to use S3 + Textract async.
- Remove `docs/GOOGLE_VISION_OCR.md` (or archive) and create AWS equivalent.
- Preserve `docs/AUTH_SETUP.md` GCP OAuth section.

## AWS Target (preview)

- Use `@aws-sdk/client-textract` + `@aws-sdk/client-s3` (modular v3).
- Private S3 objects `{jobId}/{kind}.pdf`, Textract `StartDocumentAnalysis`/`GetDocumentAnalysis` with SNS/SQS optional but preferred polling for simplicity.
- Normalized `NormalizedDocument` with `BlockType`, `TextType`, `Geometry.BoundingBox`, `Confidence`, `Relationships`.
- Pagination via `NextToken`.
- Typed env `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET` (plus optional `AWS_TEXTRACT_OUTPUT_BUCKET`, `AWS_SNS_TOPIC_ARN`, `AWS_SNS_ROLE_ARN`).

---

*Audit generated by repository-wide search (`Select-String` over all files excluding `node_modules/.next/.git`) + manual reads of `package.json`, `.env.example`, `src/lib/config`, `src/lib/ocr/*`, `src/lib/jobs/runner.ts`, `src/lib/storage`, `src/types`, `docs/*`, `scripts/*`, `tests/*`.*
