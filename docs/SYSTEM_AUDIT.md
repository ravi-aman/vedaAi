# SYSTEM_AUDIT — VedaAI Full Verification (2026-08-26)

> Methodology: inspected every file under `src/`, `package.json`, `.env`, `opencode.json`, git status, and ran `typecheck`, `lint`, `test`, `build`, plus live server smoke test via `curl`/`fetch` to `http://127.0.0.1:3000`.

**Node**: v24.0.2, **npm**: 11.3.0, **Next**: 16.3.3, **Branch**: main, **Build**: PASS (TS, compile), **Lint**: 90 problems (61 errors mostly `no-explicit-any`, 29 warnings), **Tests**: 5 suites 28/28 pass.

---

## 1. Upload — PARTIALLY IMPLEMENTED
- **Files**: `src/app/page.tsx:1` (UploadDropzone), `src/app/api/jobs/[jobId]/upload/route.ts:1`, `src/lib/files/validation.ts:1`, `src/lib/storage/index.ts:74`
- **Expected**: browser → signed upload → persistent storage → Document record
- **Actual**: `validateFile` via `file-type` magic bytes **REAL**; `LocalFileStorage` writes `os.tmpdir()/veda-ai/{jobId}/{fileId}` **REAL but NOT persistent** (tmp, in-memory jobStore). No Supabase, no signed URLs, no retention. `fileId` vs `docId` mismatch fixed but still fragile.
- **Verification**: `curl` upload of PNG (`200`) and PDF (`200` after pdf-lib fix) succeeded; `GET /api/files/[jobId]/[fileId]` returns buffer. `GET /api/jobs` after restart shows `[]` → lost.
- **Status**: **REAL BUT BROKEN** (ephemeral, no auth, no RLS)
- **Required**: Supabase Storage buckets `assessment-inputs`, `assessment-pages`, `assessment-artifacts` with service-role, RLS, `GUEST_RESULT_GRACE_PERIOD_MS` handling.

## 2. Storage — MOCK / MISSING (SaaS)
- **Files**: `src/lib/storage/index.ts:1` (InMemoryJobStore, LocalFileStorage, InMemoryArtifactStore, documentStore/pageStore Maps)
- **Expected**: Supabase Postgres + Storage, RLS, persistent across restarts
- **Actual**: Pure in-memory Maps + tmpdir files. All data lost on `next start` restart (verified: jobs `[]` after reboot). No `profiles|assessments|...` tables.
- **Status**: **MOCK** (works for demo, not SaaS)
- **Required**: Supabase client (`@supabase/supabase-js`, `@supabase/ssr`), tables + RLS + migrations, replace `InMemory` with `SupabaseJobStore` when env present, graceful fallback with config error.

## 3. PDF Parsing — REAL BUT BROKEN (fixed)
- **Files**: `src/lib/documents/pdf.ts:1` (original `pdfjs-dist/legacy/build/pdf.mjs` with worker, now `pdf-lib` primary)
- **Expected**: pageCount, dimensions, rotation for PDF & image, preserve page identity
- **Actual**: Initially failed `Please provide Uint8Array rather than Buffer` and `Cannot find module ... pdf.worker.mjs` (verified via live PDF upload `400`). Fixed to `pdf-lib` (real, but no text layer, no rendering). Image path uses `sharp` optional fallback (not installed) → returns `800×1100` fallback (not real dims for PNG 1×1 → but test showed 1×1 after sharp fallback? Actually 1×1 via actual `sharp` missing → fallback 800).
- **Status**: **REAL BUT BROKEN → FIXED PARTIALLY** (parsing works, rendering not)
- **Required**: Add `sharp`, real image metadata, PDF rendering to PNG via `pdfjs-dist` with canvas or `pdf-lib` + `canvas`.

## 4. PDF Rendering — MOCK
- **Files**: `src/components/viewer/Viewer.tsx:1` (placeholder `Fake handwritten lines`, `aspectRatio`), `src/lib/jobs/runner.ts:222 placeholderPngBase64`
- **Expected**: real page rendered → base64 PNG sent to vision model, viewer displays actual PDF
- **Actual**: Sends 1×1 transparent PNG (`iVBOR...`) to AI; viewer shows fake gray lines, not document. No `pdfjs` viewer, no zoom, no canvas.
- **Verification**: `ViewerShell` renders `bg-[#E8E8E8]` with fake blocks, not actual PDF bytes. `placeholderPngBase64` hardcoded.
- **Status**: **MOCK**
- **Required**: Render PDF pages via `pdfjs-dist` + `canvas` (node-canvas) or `pdf-lib`+`pdf-to-image`, pass real base64 to provider, viewer uses `pdfjs-dist` client rendering.

## 5. OCR — MOCK
- **Files**: Search `OCR|Tesseract` → only `src/lib/ai` and `src/types` tokens; no `tesseract.js`, no Vision API.
- **Expected**: OCR tokens with bbox/confidence, layout, handwriting regions
- **Actual**: No OCR executed; vision is delegated to AI mock; `MockAIProvider` returns `Mock answer region`.
- **Status**: **MISSING** (vision-capable model assumed to do OCR, but no fallback)
- **Required**: `OcrProvider` interface + `AiVisionOcrProvider` + fixture, or `Tesseract` fallback, with bbox validation.

## 6. AI — MOCK (Blocking)
- **Files**: `src/lib/ai/factory.ts:6`, `src/lib/ai/providers/mock.ts:8`, `src/lib/ai/providers/openai.ts:48` (uses `openai` `chat.completions.create`), `src/lib/config/index.ts:4`, `.env:1`
- **Expected**: Real Muse Spark 1.2 via Responses API `https://opencode.ai/zen/v1/responses` using `@ai-sdk/openai` or `openai.responses.create`
- **Actual**: `AI_PROVIDER=mock` **default**; `AI_API_KEY=dummy...`; `MockAIProvider` returns 3 hard-coded questions (`Sample question 1...`) + 1 answer region per page. `OpenAIProvider` uses `chat.completions` (wrong endpoint for Zen) and `AI_BASE_URL` empty. **Secret leak**: `.env` contains real `OPENCODE_API_KEY=sk-QXZQ...` (exposed, must rotate). `.env.example` correct (empty), `opencode.json` uses `${OPENCODE_API_KEY}` substitution but provider type `openai-compatible` not verified against current Zen docs.
- **Verification**: Live smoke `fetch` to Zen not attempted; `Mock` path verified via job `qs 3` hard-coded.
- **Status**: **MOCK** (Blocking)
- **Required**: Default to `AI_PROVIDER=opencode-zen`, implement `OpencodeZenProvider` via `https://opencode.ai/zen/v1` + `responses` API, smoke test `npm run ai:smoke-test`, separate `OPENCODE_*` (coding agent) from `AI_*` (app runtime), rotate exposed key, update `opencode.json` per current spec.

## 7. Question Extraction — MOCK
- **Files**: `src/lib/structure/numbering.ts:20`, `src/lib/jobs/runner.ts:227` (`MockAIProvider.extractStructure` → 3 Qs), no real vision.
- **Expected**: question hierarchy, raw vs normalized, reading order via geometry
- **Actual**: Mock returns fixed `1`, `2`, `2(a)` with heuristic parent resolution (real logic) but data is fake. No generic layout analysis executed.
- **Status**: **MOCK** (logic is real, data is fake)
- **Required**: Real vision extraction via Zen.

## 8. Answer Extraction — MOCK
- **Files**: `src/lib/jobs/runner.ts:286` (`MockAIProvider.detectAnswerRegions` → 1 region per page), no visual validation.
- **Expected**: handwriting vs diagram vs crossed-out, multi-box/multi-page, continuationGroupId
- **Actual**: One region per page, label from idx (0→1,1→2). Diagram-only path not exercised.
- **Status**: **MOCK**

## 9. Mapping — REAL BUT HEURISTIC (not AI)
- **Files**: `src/lib/jobs/runner.ts:345` (Jaccard, explicit label, layout, OCR conf), `src/lib/decision/index.ts:2`, `src/lib/evidence/aggregate.ts:1`
- **Expected**: candidate generation via semantic retrieval + evidence aggregation + thresholds `0.75/0.50` + UNCERTAIN handling
- **Actual**: Heuristic Jaccard + label + layout; **does not call** `analyzeAmbiguousMapping`; thresholds from `src/lib/config/index.ts:4` (real, single source). Evidence objects real. Verified via `decision.test.ts` margin <0.15 → UNCERTAIN.
- **Status**: **PARTIALLY IMPLEMENTED** (real logic, but no AI semantic)
- **Required**: Integrate AI semantic when label missing, keep heuristic as fallback.

## 10. Localization — REAL
- **Files**: `src/lib/coordinates/transform.ts:1` (normalize, denormalize, rotate 0/90/180/270, invert, IoU, merge), `src/components/viewer/Viewer.tsx:1` (applies `boxes` as `%`)
- **Expected**: canonical [0,1] transforms invertible at scales
- **Actual**: Pure functions tested at 0.5/1/2, rotations all, `boxIoU` real. Viewer converts `%` correctly but not using `transformForDisplay` (unused import). Not tested with real PDF dims rotation.
- **Status**: **REAL + VERIFIED** (unit 28/28)
- **Required**: Use `transformForDisplay` in viewer + visual verification at 100/150/200%.

## 11. Highlighting — PLACEHOLDER
- **Files**: `src/components/viewer/Viewer.tsx:40` (overlay `absolute border-2` with `bg-[#FF6B2C]/20`), `src/types/index.ts: HighlightRegion`
- **Expected**: exact/near-exact regions, multi-page, navigates to first, emphasizes active
- **Actual**: Renders highlight at correct `%` but data is mock, page is placeholder not real PDF. Verified via `result` JSON `highlightRegions` exists but viewer fake.
- **Status**: **PLACEHOLDER** (structure real, data fake, rendering fake)
- **Required**: Real PDF canvas + real vision boxes.

## 12. Processing Jobs — REAL BUT BROKEN
- **Files**: `src/lib/jobs/runner.ts:52` (stage order, `updateStage`, `startProcessing` async, error handling, `resultStore` Map), `src/types/index.ts: ProcessingJob`
- **Expected**: `CREATED→VALIDATING→PREPROCESSING→EXTRACTING→STRUCTURING→MATCHING→LOCALIZING→VALIDATING_RESULT→COMPLETED`, retries, idempotency, progress no fake %, logs
- **Actual**: Stages real, `withRetry` for AI 429/5xx, Zod validation, `resultStore` in-memory (lost on restart). No idempotency key, no cancellation, no exponential jitter for job runner itself, no auth scoping. Verified: poll shows `COMPLETED` then `resultStore` holds data until reboot.
- **Status**: **PARTIALLY IMPLEMENTED**
- **Required**: Idempotency `jobId+stage+pipelineVersion`, persistence, guest ownership, bounded retries for storage.

## 13. Persistence — MISSING
- **Files**: No Supabase, no DB, `jobStore` in-memory, `fileStorage` tmp.
- **Expected**: Postgres tables `profiles, assessments, assessment_documents, ...`, RLS, JSONB
- **Actual**: None.
- **Status**: **MISSING**
- **Required**: Supabase migrations, RLS, `assessment` claim flow.

## 14. Auth — MISSING
- **Files**: No `src/lib/auth`, no `@supabase/ssr`, no `app/auth/callback`, no `supabase` dep.
- **Expected**: Supabase Auth email + Google, SSR, cookies, session refresh
- **Actual**: No auth UI except sidebar placeholder; upload works unauthenticated; no session.
- **Status**: **MISSING**
- **Required**: Implement per docs/AUTH_SETUP.md.

## 15. Email — MISSING

## 16. Google OAuth — MISSING
- No Google Cloud project docs, no callback URL, no provider config.

## 17. Result Ownership — MISSING
- `assessment.userId` not existent, `resultStore` keyed by `jobId` only, no guest token.

## 18. UI — PARTIALLY IMPLEMENTED
- **Files**: `src/app/page.tsx:1` (matches reference: header 56px, sidebar 200px, `#FF6B2C`, rounded-2xl, illustration) — **REAL + VERIFIED** via curl HTML.
- **Mobile**: `src/app/page.tsx` has `hidden lg:flex` sidebar, but not tested at 375px viewport; viewer has responsive but no E2E.
- **Status**: **REAL** for upload, **PLACEHOLDER** for results (viewer fake).

## 19. Mobile UI — UNKNOWN / NOT VERIFIED
- No Playwright viewport test.

## 20. Deployment — MISSING / NOT VERIFIED
- `next.config.ts` minimal, no Supabase env, no `GUEST_RESULT_GRACE_PERIOD_MS`, no `NEXT_PUBLIC_APP_URL`. Build passes, but prod URL not verified.

## 21. Tests — PARTIALLY IMPLEMENTED
- Unit 28 pass, integration 1 (job isolation), no file validation tests, no coordinate rotation visual, no E2E, no failure injection, no RLS tests. `fixtures/` exists with 24 groundTruths but not wired to harness beyond `scripts/evaluate.ts` placeholder.

## 22. Security — REAL BUT BROKEN
- `.env` exposed real `sk-` (must rotate). `.gitignore` correctly ignores `.env` (verified `git check-ignore`), but `.env` already contains secret in working tree (not committed yet per `git status` — but still leak). No `NEXT_PUBLIC` leak (verified `rg` none), but no RLS, no signed URLs, files readable via `GET /api/files/[jobId]/[fileId]` with only jobId check (no auth).

---

## Summary Table

| Subsystem | Status |
|---|---|
| upload | REAL BUT BROKEN |
| storage | MOCK |
| PDF parsing | REAL BUT BROKEN → FIXED PARTIALLY |
| PDF rendering | MOCK |
| OCR | MISSING |
| AI | MOCK |
| question extraction | MOCK |
| answer extraction | MOCK |
| mapping | PARTIALLY IMPLEMENTED |
| localization | REAL |
| highlighting | PLACEHOLDER |
| jobs | PARTIALLY IMPLEMENTED |
| persistence | MISSING |
| auth/email/google | MISSING |
| ownership | MISSING |
| UI upload | REAL |
| UI results/viewer | PLACEHOLDER |
| mobile | UNKNOWN |
| deployment | NOT VERIFIED |
| tests | PARTIALLY IMPLEMENTED |
| security | REAL BUT BROKEN |

**Critical Blocking**: AI mock default, secret leak, no storage/auth, fake PDF rendering, in-memory persistence.
