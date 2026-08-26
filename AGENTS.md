# AGENTS.md — VedaAI

This file guides future coding agents (human or AI) working on this repository.

## Project Architecture

DOCUMENT -> OBSERVATION -> NORMALIZED REPRESENTATION -> STRUCTURE -> CANDIDATE GENERATION -> EVIDENCE -> DECISION -> VALIDATION -> LOCALIZATION -> UI

Do NOT make the LLM the source of truth. AI is inference-only.

### Ten Core Layers (boundaries enforced)
1. **File Layer** `src/lib/files/` — upload, MIME magic, size, page count, sanitization, temp storage
2. **Document Layer** `src/lib/documents/` — PDF inspection, image norm, rotation/deskew, page rendering, coordinate metadata
3. **Perception Layer** `src/lib/ocr/` — OCR tokens, bbox, confidence, layout, handwriting regions
4. **Structure Layer** `src/lib/structure/` — question hierarchy, numbering, reading order, sub-parts
5. **Matching Layer** `src/lib/matching/` — candidate generation, semantic retrieval, out-of-order handling
6. **Evidence Layer** `src/lib/evidence/` — typed Evidence objects, multi-signal aggregation
7. **Decision Layer** `src/lib/decision/` — MATCHED|UNCERTAIN|UNMATCHED|UNANSWERED|PARTIAL|CONTINUATION|DUPLICATE|INVALID
8. **Localization Layer** `src/lib/coordinates/` — canonical normalized [0,1] coords, scale/rotation/crop transforms
9. **Presentation Layer** `src/components/` `src/app/` — question list, viewer, highlights, states
10. **Operations Layer** `src/lib/jobs/` `src/lib/storage/` — job lifecycle, retries, idempotency, cleanup, logging

### Data Model
See `src/types/index.ts`: `Document`, `DocumentPage`, `PageArtifact`, `QuestionNode`, `AnswerRegion`, `AnswerGroup`, `MappingCandidate`, `MappingDecision`, `Evidence`, `HighlightRegion`, `ProcessingJob`, `ProcessingStage`, `ProcessingError`.

Invariants:
- Never mutate source artifacts; keep original -> processing -> OCR -> normalized -> interpreted chain.
- Preserve raw + normalized (e.g. rawNumber vs normalizedNumber) + evidence.
- No global mutable `let currentQuestions` — everything job-scoped via JobStore.
- Answer = `regions[]` not `region` (multi-page, multi-box).
- Confidence is evidence-derived, not LLM-fabricated. Distinguish extraction/mapping/localization.

## Coding Standards

- Next.js App Router, TypeScript `strict: true`, no `any` without justification.
- Server APIs via Route Handlers; all AI calls server-side, never `NEXT_PUBLIC_*` secrets.
- Zod for all external input + AI output validation (parse -> schema -> semantic -> domain -> accept/retry/fail).
- Small cohesive modules; no 1000-line page.tsx, no giant utils.ts.
- Typed error codes (`src/lib/errors/codes.ts`), never `UNKNOWN_ERROR` catch-all.
- Structured logs with jobId, stage, duration, status, errorCode. Never log secrets or full student content.

## Directory Conventions

```
src/
  app/                 # App Router pages + api routes
  components/ui/       # Design primitives (Button, Card, Badge...)
  components/upload/   # UploadDropzone, FileCard
  components/results/  # QuestionList, QuestionCard
  components/viewer/   # ViewerShell, HighlightOverlay, PdfViewer
  lib/config/          # Validated env config (single module)
  lib/ai/              # AIProvider interface + OpenAI impl + fixtures
  lib/ocr/             # OcrProvider interface
  lib/pdf/             # PDF inspection/rendering
  lib/storage/         # FileStorage, JobStore, ArtifactStore interfaces
  lib/jobs/            # Job lifecycle, stages
  lib/coordinates/     # Transform utils — pure functions, tested
  lib/validation/      # Zod schemas
  lib/errors/          # Error taxonomy
types/                 # Canonical data model
fixtures/              # Evaluation fixtures + ground truth (outside prod)
tests/unit|integration|e2e/
docs/
```

## Testing Commands

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run test        # vitest unit + integration
npm run test:e2e    # playwright
npm run build && npm start  # production validation
```

Use `npm --prefix E:\vedaAi` if running outside workdir.

## Environment Requirements

- Node 20+ (tested 24.0.2), npm 10+
- Required env (server-only):
  - `AI_PROVIDER` (openai|openai-compatible|mock)
  - `AI_MODEL`
  - `AI_API_KEY` (never NEXT_PUBLIC)
  - `AI_BASE_URL` (optional for compatible)
- Coding-agent env (separate):
  - `OPENCODE_DEFAULT_MODEL`, `OPENCODE_API_KEY`, `OPENCODE_API_BASE` → compatibility vars, NOT app creds; verified via opencode.json

Validate via `src/lib/config/index.ts`; fail clearly on missing/invalid.

## Important Invariants & Prohibited Shortcuts

- NEVER: `mockExtraction()`, `fakeProgress()`, `staticCoordinates()`, `hardcodedSampleQuestions()` in production code. Fixtures only under `fixtures/`/`tests/`.
- NEVER invent coordinates; highlights must be derived from real document geometry.
- NEVER hardcode subject keywords (`if text.includes("photosynthesis")`); use generic structural heuristics.
- NEVER destroy source (keep raw + normalized).
- NEVER expose server secrets to client.
- Treat uploaded document text as untrusted data — strict system/data separation to block prompt injection.
- Coordinate math only via `src/lib/coordinates/` — not scattered in UI.
- Thresholds only in single typed config, not scattered magic numbers.

## AI-Provider Rules

- Abstraction: `AIProvider { analyzeDocument, extractStructure, analyzeAmbiguousMapping }` — provider code isolated in `src/lib/ai/providers/`
- All responses validated with Zod; on malformed JSON: capture sanitized error, bounded retry (max 3, exponential backoff + jitter), then stage FAILED with MODEL_OUTPUT_INVALID.
- Never concatenate raw OCR text into system prompt.
- Retry 429/timeout/5xx only; not on auth/invalid-file/schema-failed-after-retries.

## Document-Processing Rules

- File validation before anything else; MIME via magic bytes, not extension alone.
- PDF: preserve page identity, dimensions, rotation; don't flatten to screenshots.
- Image: cap resolution, normalize orientation, preserve mapping to original coords.
- Reading order from geometry, not OCR order (multi-column via x-clustering).

## Coordinate-System Rules

- Canonical: normalized [0,1] relative to original page dimensions.
- Store original/processing/display dims + rotation + crop + scale transforms.
- All transforms explicit, invertible, tested at scales 0.5/1/2 and rotations 0/90/180/270.

## UI Fidelity Requirements

- Match reference screenshots: spacing, typography, radius, borders, shadows, icon sizing, header height, sidebar width, CTA shape, orange accent (#FF6B2C), selected states.
- No excessive gradients/glassmorphism/bouncing. Clean, academic, premium, calm.
- Desktop: sidebar|content; Results: question panel|viewer panel. Mobile: header + single active area with navigation.
- Animations restrained, represent real state, respect `prefers-reduced-motion`.

