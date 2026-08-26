# VedaAI — TODO

Execution order follows §94 of Master Prompt. Mark ONLY after verification.

## PHASE 0 — Discovery
- [x] Inspect repo, Node 24.0.2, npm 11.3.0, Next 16.3.3, React 19.2.8, Tailwind 4
- [x] Verify workspace writable (fixed ACL on E:\vedaAi)
- [x] Scaffold Next.js App Router + TS strict + Tailwind
- [x] Create architecture plan (see docs/ARCHITECTURE.md)
- [ ] Create risk register (tracked here): PDF rendering in serverless, AI rate limits, handwriting OCR quality
- [ ] Create test plan (see docs/TESTING.md)

## PHASE 1 — Foundation
- [ ] Create validated server config module `src/lib/config/index.ts` (zod)
- [ ] Create `.env` / `.env.example` + opencode.json compatibility
- [ ] Define core types: `Document`, `DocumentPage`, `QuestionNode`, `AnswerRegion`, `AnswerGroup`, `Evidence`, `MappingDecision`, `HighlightRegion`, `ProcessingJob` (`src/types/`)
- [ ] Create error taxonomy `src/lib/errors/codes.ts`
- [ ] Create storage interfaces: `FileStorage`, `JobStore`, `ArtifactStore`
- [ ] Create pino-structured logger `src/lib/logging/logger.ts`
- Acceptance: `npm run typecheck` passes, config fails clearly on missing AI creds

## PHASE 2 — Upload / File Layer
- [ ] Implement file validation: MIME magic bytes, extension, size (25MB), page count, image dimensions
- [ ] Filename sanitization, unguessable IDs (uuid v4), temp storage under `os.tmpdir()/veda-ai`
- [ ] API: `POST /api/jobs` create job, `POST /api/jobs/:id/upload` attach documents
- [ ] Cleanup on job delete/cancel
- Tests: unit — invalid type, too large, corrupted, path traversal

## PHASE 3 — Document Layer
- [ ] PDF inspection: page count, dimensions, rotation via pdfjs-dist (server)
- [ ] Image normalization: orientation via sharp, resolution capping
- [ ] Page rendering for vision: produce PNG buffers at 2x, preserve coordinate metadata
- [ ] Coordinate-space metadata: original / processing / display
- Tests: rotation 0/90/180/270, page-size changes

## PHASE 4 — Perception / OCR Layer
- [ ] Define `OcrProvider` interface + `AiVisionOcrProvider` + `NoopProvider` for tests
- [ ] OCR tokens with bbox + confidence, line segmentation
- [ ] Visual region detection stub (handwriting vs drawing)
- Acceptance: perception returns `OcrPageResult` with normalized boxes

## PHASE 5 — Question Extraction & Structure Layer
- [ ] Generic numbering parser: `Q1`, `1.`, `1)`, `Question 1`, `1(a)`, `(a)`, `(i)` without hardcoding subjects
- [ ] Normalization preserving raw: `rawNumber` vs `normalizedNumber` + evidence
- [ ] Hierarchy: parentQuestionId, depth, partType (SECTION|QUESTION|PART|SUBPART)
- [ ] Reading order via geometry (y then x), handling multi-column via x-clustering
- [ ] Marks & section detection generic
- Tests: unit — numbering normalization, hierarchy 11→11(a)/11(b), 12→12(a)→i/ii

## PHASE 6 — Answer Region Extraction
- [ ] Candidate region detection: handwriting density, geometry, label patterns
- [ ] Support multi-box, multi-page, polygon, continuationGroupId
- [ ] Diagram-only handling (visualConfidence > ocrConfidence)
- [ ] Cross-out detection flag
- Tests: multi-page answer has regions.length>1 with distinct pageIds

## PHASE 7 — Matching / Evidence / Decision
- [ ] Candidate generation via label + semantic retrieval
- [ ] Evidence aggregation: EXPLICIT_LABEL, SEMANTIC_SIMILARITY, LAYOUT_CONTINUITY, PAGE_CONTINUITY, NEIGHBOR_CONTEXT, OCR_CONFIDENCE, VISUAL_EVIDENCE
- [ ] Confidence = weighted evidence, NOT LLM-fabricated probability. Separate layers.
- [ ] Decision taxonomy: MATCHED, UNCERTAIN, UNMATCHED, UNANSWERED, PARTIAL, CONTINUATION, DUPLICATE
- [ ] Review thresholds in single typed config `src/lib/config/mapping.ts`
- Tests: out-of-order, no-number, ambiguous → UNCERTAIN (not forced MATCHED)

## PHASE 8 — Localization
- [ ] Canonical normalized coords [0,1]
- [ ] Transforms: scale, rotation (0/90/180/270), crop offset, page-size change
- [ ] Coordinate util module `src/lib/coordinates/transform.ts` — pure functions, tested
- [ ] HighlightRegion model with pageId + boxes[]
- Tests: scale 0.5/1/2, rotation all, cropped, multi-region

## PHASE 9 — Job Lifecycle & APIs
- [ ] Job model with stages CREATED→VALIDATING→PREPROCESSING→EXTRACTING→STRUCTURING→MATCHING→LOCALIZING→VALIDATING_RESULT→COMPLETED / FAILED / CANCELLED
- [ ] In-memory JobStore + FileStorage (interface-backed, swappable)
- [ ] Bounded retries: 429/5xx/timeout with exponential backoff + jitter, max 3
- [ ] Idempotency key: jobId+stage+pipelineVersion
- [ ] Real stage progress (no fake %), error taxonomy surfaced
- [ ] Endpoints: create job, upload docs, start processing, get status, get result, get questions, get answers
- Integration tests: job isolation, no global mutable state

## PHASE 10 — Viewer & Highlighting
- [ ] PDF/Image viewer with page rendering via pdfjs-dist (client), zoom/scroll/current-page
- [ ] HighlightOverlay computing transformed boxes per display scale
- [ ] Navigation: select question → navigate to first region, emphasize active, keep others visible
- [ ] Handling: no reliable region → "No reliable answer region detected"
- Tests: highlight correct at 0.5x/1x/2x zoom

## PHASE 11 — UI Polish (Upload/Processing/Results)
- [ ] Design system primitives: Button, Card, UploadDropzone, FileCard, StatusBadge, QuestionCard, ViewerShell
- [ ] Upload screen: VedaAI branding, sidebar/header, two large dashed upload cards, preview (PDF icon/name/size/pages), Start Mapping disabled until both valid
- [ ] Processing screen: centered spark/AI visual, stage list with ✓/•/pending, no fake %
- [ ] Results: split-pane left question list / right viewer, status colors (answered/needs-review/unanswered/unmatched), selected highlight, responsive collapse
- [ ] Micro-interactions: hover/drag/file removal/selection/highlight, reduced-motion
- [ ] Error UX: invalid type, corrupted, extraction failed, model unavailable

## PHASE 12 — Testing & Evaluation
- [ ] Unit: numbering, hierarchy, coordinates, evidence, mapping, grouping, stage transitions
- [ ] Integration: upload→processing→result, OCR adapter, AI adapter (fixture), highlight coords
- [ ] E2E (Playwright): upload both, Start Mapping, processing, result, click question→highlight, unanswered/unmatched, mobile, reload during processing
- [ ] Evaluation harness: fixtures for 24 cases (§64) + ground truth JSON under `fixtures/`
- [ ] Performance: measure upload latency, OCR, model, mapping, total

## PHASE 13 — Deployment & Final Audit
- [ ] Verify execution duration/memory/fs behavior (Vercel background vs node worker)
- [ ] Document persistence limitation (in-memory vs durable)
- [ ] Run: install, typecheck, lint, unit, integration, e2e, build, start
- [ ] Browser validation desktop/tablet/mobile
- [ ] Secret scan, git diff/status, .gitignore check
- [ ] Final engineering report per §109

## Risk Register
- PDF rendering on Vercel (pdfjs-dist server) → fallback to client-side pre-processing
- Handwriting OCR quality → AI vision primary, Tesseract secondary
- Long docs (>50 pages) → concurrency cap 2, streaming pages
- Rate limits → bounded retries + provider abstraction fallback

