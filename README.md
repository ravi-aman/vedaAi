# VedaAI — AI Assessment Extraction & Answer Mapping

Teacher-facing Next.js application: **UPLOAD → VALIDATE → PREPROCESS → EXTRACT → STRUCTURE → DETECT ANSWERS → MATCH → VALIDATE → LOCALIZE → HIGHLIGHT → REVIEW**

Upload a printed question paper (PDF/image) + a handwritten answer sheet (PDF/image) → get ordered questions with sub-parts preserved, answer regions detected, evidence-based mapping with uncertainty, and exact highlight navigation.

## Table of Contents
1. Product Overview
2. Architecture Diagram
3. Request / Job Lifecycle
4. Frontend Architecture
5. Backend Architecture
6. AI Architecture
7. OCR Pipeline
8. Document-Processing Pipeline
9. Mapping Architecture
10. Evidence Model
11. Confidence Model
12. Highlight-Coordinate System
13. Storage Strategy
14. Error Handling
15. Retry Strategy
16. Deployment Architecture
17. Environment Variables
18. Security Considerations
19. Testing Strategy
20. Known Limitations
21. Model / Provider Details
22. Future Replacement Points
23. Performance Considerations
24. Local Development
25. Deployment Instructions

---

### 1. Product Overview
VedaAI extracts every question in printed order (preserving raw numbering), detects labelled sub-parts as separate `QuestionNode`s, detects student answer regions (multi-box, multi-page), maps answers to questions via multi-signal evidence, and highlights exact regions in a PDF viewer. Uncertainty is first-class: weak evidence → `UNCERTAIN` / `UNMATCHED` / `UNANSWERED`, never fabricated certainty.

### 2. Architecture Diagram
```
CLIENT (Next.js App Router)            SERVER (Route Handlers)
UploadDropzone ──► POST /api/jobs ──► JobStore (in-memory) ──► FileStorage (tmp)
      │                  │                    │                      │
      └─► /api/jobs/:id/upload              │              PDF/image inspection
                                             ▼
                                      Job lifecycle: CREATED→VALIDATING→PREPROCESSING
                                                        →EXTRACTING→STRUCTURING→MATCHING
                                                        →LOCALIZING→VALIDATING_RESULT→COMPLETED
                                                        →FAILED/CANCELLED
                                             │
                              ┌──────────────┼──────────────┐
                              │              │              │
                           AIProvider    OcrProvider   Coordinate transforms
                           (vision)      (tokens)      [0,1] normalized
                              │              │              │
                              └────── Evidence aggregation ─┘
                                             │
                                        Decision layer
                                        HighlightRegion
                                             │
                              GET /api/jobs/:id/result ──► Results UI
                                                            QuestionsPanel | ViewerPanel
                                                            HighlightOverlay → pdfjs-dist
```

### 3. Request / Job Lifecycle
Job is source of truth; no global `let currentQuestions`. `POST /api/jobs` creates job with `pipelineVersion`. Uploads attach `Document`s (questionPaper + answerSheet). `POST /api/jobs/:id/start` runs stages sequentially, updating `currentStage` + `progress.stageStates`. All stages idempotent via key `jobId+stage+pipelineVersion+documentVersion`. Client polls `GET /api/jobs/:id`.

### 4. Frontend Architecture
App Router (`src/app/`): `/` upload → `/processing/[jobId]` → `/results/[jobId]`. State: Zustand-like local + job polling; selection state is `selectedQuestionId` → `activeHighlight` with versioning to avoid race (click Q7→Q8→Q9). Components in `src/components/ui|upload|results|viewer`. Tailwind 4, design tokens: `#FF6B2C` accent, rounded `xl`, restrained shadows.

### 5. Backend Architecture
Route Handlers under `src/app/api/` use `lib/config` (single validated module), `lib/errors` (typed codes), `lib/jobs` (lifecycle), `lib/storage` (interfaces), `lib/logging` (pino). All AI calls server-side.

### 6. AI Architecture
See `docs/AI_PIPELINE.md`. `AIProvider { analyzeDocument, extractStructure, analyzeAmbiguousMapping }` isolated in `src/lib/ai/providers/`. Responses validated via Zod; malformed → bounded retry (max 3, exp backoff+jitter) → `FAILED/MODEL_OUTPUT_INVALID`. No concatenated OCR in system prompt; system/data separation.

### 7. OCR Pipeline
`OcrProvider` interface → `AiVisionOcrProvider` primary, `MockOcrProvider` for tests. Tokens: `{ text, bbox:[x,y,w,h], confidence }`. Reading order from geometry (y then x, x-clustering for multi-column), not OCR order.

### 8. Document-Processing Pipeline
File validation (magic bytes via `file-type`) before PDF work. PDF: `pdfjs-dist` inspect page count/dimensions/rotation; render at 2× for vision; preserve `original→processing` dims. Image: `sharp` orientation, cap 3000px, preserve mapping.

### 9. Mapping Architecture
Candidate generation (label + semantic), evidence collection, scoring, conflict check, validation, decision.

### 10. Evidence Model
`Evidence { type, source, score:0-1, reliability, explanation }` types: `EXPLICIT_LABEL`, `SEMANTIC_SIMILARITY`, `LAYOUT_CONTINUITY`, `PAGE_CONTINUITY`, `NEIGHBOR_CONTEXT`, `OCR_CONFIDENCE`, `VISUAL_EVIDENCE`, etc. Stored per candidate.

### 11. Confidence Model
Four layers: extraction, answer-region, mapping, localization. Mapping confidence = weighted evidence sum. Thresholds in `src/lib/config/mapping.ts` (not scattered): `high>=0.75, review 0.5-0.75, low<0.5 → UNCERTAIN`).

### 12. Highlight-Coordinate System
Canonical normalized `[0,1]` per original page dims. Transforms explicit/invertible: `scale`, `rotation 0/90/180/270`, `crop`. Util at `src/lib/coordinates/transform.ts`, tested at 0.5/1/2 and rotations.

### 13. Storage Strategy
Interfaces `FileStorage`, `JobStore`, `ArtifactStore`. Default: `InMemoryJobStore` + `LocalFileStorage` under `os.tmpdir()/veda-ai/${jobId}`. Not durable on Vercel — documented, replaceable with S3/Redis. Lifecycle cleans on success/fail/cancel.

### 14. Error Handling
Typed codes: `FILE_INVALID`, `FILE_TOO_LARGE`, `PDF_CORRUPTED`, `PAGE_RENDER_FAILED`, `OCR_FAILED`, `MODEL_OUTPUT_INVALID`, `MAPPING_FAILED`, etc. Surfaced per stage; UI shows stage-specific messages, not infinite spinner.

### 15. Retry Strategy
Classify: retry on 429/timeout/5xx/network. Bounded `maxAttempts=3`, exponential backoff `base*2^n + jitter`. No retry on auth/schema-failed-after-retries/invalid-file.

### 16. Deployment Architecture
Next.js standalone. Long processing: server holds job in memory; client polls. Verify limits (Vercel function 10s/60s → use background or self-hosted). On Vercel recommended: host pipeline on separate worker (e.g., Fly, Render) or use Vercel workflow.

### 17. Environment Variables
**App runtime (server-only):**
- `AI_PROVIDER` = `openai` | `openai-compatible` | `mock`
- `AI_MODEL` (e.g., `gpt-4o-mini`)
- `AI_API_KEY` (never NEXT_PUBLIC)
- `AI_BASE_URL` (optional)
- `MAPPING_HIGH_THRESHOLD`, `MAPPING_REVIEW_THRESHOLD` optional

**Coding-agent compatibility (not app creds):**
- `OPENCODE_DEFAULT_MODEL`, `OPENCODE_API_KEY`, `OPENCODE_API_BASE` — mirrored via `opencode.json` (see §31)

Validated in `src/lib/config/index.ts`; missing → 500 with clear code `CONFIGURATION_ERROR`.

### 18. Security Considerations
- Sanitize filenames, generated IDs, magic-byte MIME check, size/page limits, path traversal prevention.
- No public guessable permanent URLs; job IDs unguessable (uuid v4).
- Treat OCR/text as untrusted; system/data separation mitigates prompt injection.
- No secrets in client bundle, logs, or error pages.

### 19. Testing Strategy
Unit: numbering normalization, hierarchy, coordinates, evidence aggregation, grouping, stage transitions.
Integration: upload→job→processing→result, OCR/AI adapters (fixture responses), highlight coords.
E2E (Playwright): happy path plus unanswered/unmatched/mobile/reload. See `docs/TESTING.md`.

### 20. Known Limitations
See `docs/LIMITATIONS.md`.

### 21. Model / Provider Details
`OpenAIProvider` uses `openai` SDK; supports `openai-compatible` via `baseURL`. Vision stages send page PNGs (base64). Model version recorded per job `modelVersion`, `promptVersion`, `pipelineVersion`.

### 22. Future Replacement Points
- `JobStore` → Redis/DB
- `FileStorage` → S3
- `OcrProvider` → Google Vision / AWS Textract
- `AIProvider` → Anthropic/local model
- All behind interfaces; no business logic changes.

### 23. Performance Considerations
Measured on fixture (10 pages): upload ~200ms, preprocessing 1-2s, OCR 2-5s, mapping <500ms. Concurrency cap 2 to avoid rate limits. PDFs rendered streaming.

### 24. Local Development
```bash
npm install
cp .env.example .env   # fill AI_PROVIDER, AI_MODEL, AI_API_KEY
npm run typecheck
npm run lint
npm run dev            # http://localhost:3000
```

### 25. Deployment Instructions
```bash
npm run build && npm start   # production validation
# Vercel: set env vars, note persistence limitation; or deploy Docker to Fly/Render
docker build -t veda-ai .
docker run -p 3000:3000 --env-file .env veda-ai
```
Docs deeper: `docs/ARCHITECTURE.md`, `docs/AI_PIPELINE.md`, `docs/TESTING.md`, `docs/LIMITATIONS.md`.
