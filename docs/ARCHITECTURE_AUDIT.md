# ARCHITECTURE_AUDIT — VedaAI Full Repository Audit

**Date:** 2026-08-27  
**Auditor:** Muse Spark 1.2  
**Repo root:** `E:\vedaAi`  
**Branch:** `main` @ `d29ee5d` + uncommitted (runner/structure/viewer patches)  
**Config:** `OCR_PROVIDER=textract`, `AI_PROVIDER=opencode-zen` (`laguna-s-2.1-free`), `AWS_REGION=ap-south-1`, `AWS_S3_BUCKET=vedaaistorage`

---

## Target Graph Under Audit

```
ORIGINAL PDF → S3 → (TEXTRACT ∥ VISION) → FUSION → CANONICAL → (QUESTION TREE ∥ ANSWER GRAPH) → MAPPING → VALIDATION → REGION OBJECTS → PDF.js → HIGHLIGHTS
```

Every arrow must have a real file/function/evidence, not a stub.

---

## Verdict Summary

| Subsystem | Classification | Evidence |
|-----------|---------------|----------|
| 1 Upload | REAL + VERIFIED | `src/app/api/jobs/[jobId]/upload/route.ts:14-85` validates via `src/lib/files/validation.ts:19` (`file-type` magic, 100-char sanitize), size 100 MB, writes `LocalFileStorage.save` to `os.tmpdir()/veda-ai/{jobId}/{fileId}`. No client secret. |
| 2 File validation | REAL + VERIFIED | `src/lib/files/validation.ts:19-44` — `fileTypeFromBuffer` + extension fallback, `ALLOWED_MIMES` pdf/jpeg/png/webp/heic, sanitized name. Called before inspect. |
| 3 S3 storage | REAL + VERIFIED | `src/lib/ocr/s3.ts:67-75` `PutObjectCommand` via `@aws-sdk/client-s3:3.800.0`. Keys `ocr-input/{jobId}/{kind}.pdf`, `ocr-output/{jobId}/{kind}/`. Bucket `vedaaistorage` (us-east-1 → ap-south-1). No public ACL. Retry via `ocrStage`. |
| 4 Textract integration | REAL + VERIFIED | `src/lib/ocr/textract.ts:29-83` `StartDocumentAnalysisCommand` with `FeatureTypes ["TABLES","LAYOUT"]`, optional `NotificationChannel` SNS/SQS, fallback `StartDocumentTextDetectionCommand` on `InvalidParameterException`. Real `TextractClient`. |
| 5 Textract retrieval | REAL + VERIFIED | `src/lib/ocr/textract.ts:108-171` `GetDocumentAnalysisCommand`/`GetDocumentTextDetectionCommand` polling (`OCR_POLL_INTERVAL_MS=5s`, timeout 300s), `MaxResults:1000` + `NextToken` pagination. `mapTextractError` distinguishes 403→`AUTH_ERROR` vs throttling→retryable. |
| 6 OCR normalization | REAL + VERIFIED | `src/lib/ocr/textract.ts:199-376` `normalizeTextractBlocks` preserves `BoundingBox {Left,Top,Width,Height}` normalized [0,1], `Confidence/100`, `Polygon`, `Relationships CHILD` (LINE→WORD), `TABLE/CELL`, `width/height/rotation` from `pageStoreApi`. Synthesis of `blocks/paragraphs/words` from lines. `OcrDocumentResult` has `pages[].lines[].boundingBox/confidence/pageNumber`. Not reduced to plain text. |
| 7 Vision integration | **MISSING** | No `VisionProvider` in production path. `src/lib/ai/providers/opencode-zen.ts:280-436` has vision-capable `extractStructure/detectAnswerRegions` but `src/lib/jobs/runner.ts:482` `extracting()` is deterministic Textract-only (`"Textract is source of truth, no Vision LLM"`). `docs/TEXTRACT_VS_VISION_AUDIT.md:89` documents Phase A removal. Parallel `VISION` branch absent. |
| 8 Vision input handling | **MISSING** | Previously `placeholderPngBase64` 1×1 + `OCR_TEXT` hint; now no real page image sent. No `pdfjs+canvas` render to PNG, no `sharp` resize, no `fileId→pageImage` pipeline for Vision. Cannot satisfy spec `Vision receives actual page/image`. |
| 9 Vision output handling | **MISSING** | No Zod-validated `VisionResult` with `visualRegions/questionCandidates/answerGrouping`. Prior LLM `boxes` were hallucinated and discarded. No grounding of Vision labels to Textract `sourceBlockIds`. |
| 10 Fusion layer | **MISSING** | No `FusionEngine`. Textract and Vision never reconciled. `extracting()` directly calls `parseQuestionsFromTextract` + `segmentAnswersFromTextract`. No `FusionLayer { textractEvidence + visionEvidence + geometry → Canonical }`. Spec `concatenate JSON` anti-pattern avoided, but fusion not implemented. |
| 11 Canonical document representation | **PARTIALLY IMPLEMENTED** | `OcrDocumentResult` + `DocumentPage` + `ParsedQuestion/SegmentedAnswer` exist, but not a provider-neutral `CanonicalDocument { pages[], blocks[], lines[], words[], layout[], visualRegions[], questionCandidates[], answerCandidates[], evidence[] }` consumed by all downstream. `runner.ts:464-566` builds ad-hoc `qpExtracted/asDetected`. No single canonical type. |
| 12 Question extraction | **REAL BUT BROKEN** (now deterministic) | `src/lib/structure/question-parser.ts:164-368` — `QUESTION_LABEL_RE` requires digit base, `readingOrderSort` x-clustering for 2-column, `detectLabel` guards instructions/page-headers, merges multi-line. Previously LLM-hallucinated 125/159 nodes due to `(a)` options being promoted; now fixed via `isOptionLine` filter (options `<80 chars` appended to parent) + depth/parent via `normalizeNumber`. Needs real 38-Q verification (see §45). |
| 13 Question hierarchy | **PARTIALLY IMPLEMENTED** | `src/lib/structure/numbering.ts:20-139` `normalizeNumber` yields `depth 0/1/2`, `partType QUESTION/PART/SUBPART`, `parent`. `question-parser.ts:274-303` synthesizes `36(a)` children but `PART` vs `SECTION` not validated. No `Question Structure Validator` (number progression/duplicates/section placement) before mapping — `validatingResult` only checks `questions.length===0`. |
| 14 Answer detection | **PARTIALLY IMPLEMENTED** | `src/lib/structure/answer-segmentation.ts:46-157` — `ANSWER_LABEL_RE` (`Q/Ans/Question` + `11(a)`), `readingOrderSort`, groups lines until next label, multi-page `bboxesByPage`. `regionType DIAGRAM/MIXED/HANDWRITING/CROSSED_OUT` only via `visualConfidence>0.6` heuristic; no Textract `QUERY`/`HANDWRITING` flag nor Vision `diagram awareness`. |
| 15 Answer graph | **PARTIALLY IMPLEMENTED** | `src/lib/jobs/runner.ts:568-701` builds `AnswerRegion[]` per page box, then `AnswerGroup` per label (`continuationGroupId="seg-idx"`). No explicit `AnswerGraph { region, neighbours, continuation, semantic }` with cross-page edges, no handwriting vs printed classification from Textract. |
| 16 Mapping | **REAL + VERIFIED** (deterministic) | `src/lib/jobs/runner.ts:708-809` `matchingStage` candidate generation `question × answerGroup`, evidence `EXPLICIT_QUESTION_LABEL (0.95/0.92/0.35), SEMANTIC Jaccard, LAYOUT_CONTINUITY (1-diff*0.2), OCR_CONFIDENCE, VISUAL_EVIDENCE`, `aggregateScore` weighted, `decideForQuestion` with thresholds `MAPPING_HIGH=0.75 / REVIEW=0.5`. Explicit label prefix-insensitive (`Q`/`""`). No global assignment conflict detection (assigns greedily per Q; `usedAnswerGroups` tracked but not enforced). |
| 17 Confidence | **PARTIALLY IMPLEMENTED** | Separate `ocrConfidence / visualConfidence / labelConfidence` on `AnswerRegion`, `confidence` on `QuestionNode`, `mappingConfidence` on `MappingDecision` via `aggregateScore`. Not LLM self-reported. Missing `extractionConfidence vs mappingConfidence vs localizationConfidence` distinct channels. |
| 18 Validation | **PARTIALLY IMPLEMENTED** | `src/lib/jobs/runner.ts:816-821` `validatingResult` only fails if `questions.length===0`. No `Question Structure Validator` (`STRUCTURE_VALIDATION_FAILED`), no per-decision invariant checks (box bounds [0,1], page existence), no `invalidQuestionCount>60` hard fail. `isSectionOrInstruction` filtering exists but not validated post-hoc. |
| 19 Coordinate transformation | **REAL + VERIFIED** | `src/lib/coordinates/transform.ts:22-147` pure functions: `normalizeBox/denormalizeBox/rotateBox(0/90/180/270)/cropBox/toDisplayBox/transformForDisplay/invertTransform/mergeBoxes/boxIoU`. Tests at 0/90/180/270 and scales 0.5/1/2. UI uses `box.x *100%` normalized, no scattered math. |
| 20 PDF retrieval | **REAL + VERIFIED** | `src/app/api/files/[jobId]/[fileId]/route.ts:42-83` streams real Buffer from `fileStorage.read`, MIME via magic (`25504446→pdf`, `89 50→png`, `FF D8→jpeg`) or `Document.mime`, `Range: bytes=` 206 with `Content-Range`, `Accept-Ranges: bytes`, `Cache-Control: private, max-age=60`. AuthZ via `job.userId` or `guestSessionId` (+ `x-test-user-id` for tests). No `C:\tmp\` leak. |
| 21 PDF.js rendering | **REAL BUT BROKEN** | `src/components/viewer/PdfViewer.tsx:22-83` dynamic `pdfjs-dist/legacy/build/pdf.mjs` `getDocument({url: pdfUrl, verbosity:0, useWorkerFetch:false, disableFontFace:true})`, renders each `page.render({canvasContext, viewport@1.5})` to `<canvas id="pdf-canvas-i">`. Worker disabled via `GlobalWorkerOptions.workerSrc=""` (fragile but works in Node/E2E). No `pdfjs` viewer toolbar; paging via scroll + `activePageId→pageNumber` smooth scroll. Range requests supported. Not tested at 150/200% zoom drift. |
| 22 Highlighting | **REAL + VERIFIED** (geometry grounded) | `runner.ts:773-782` `HighlightRegion {pageId, boxes:NormalizedBox[], confidence, source:"matching"}` from `reg.normalizedBoxes` (Textract `LINE` bbox union). `PdfViewer.tsx:128-144` overlays `left/top/width/height %` with `ring-2 ring-[#FF6B2C]` for active. Multi-page via `bboxesByPage` → multiple `AnswerRegion` with same `continuationGroupId`. No invented coordinates (no `Math.random`, no `0.1 + idx*0.05` except fallback when extractor gave none — now removed). |
| 23 Job orchestration | **REAL + VERIFIED** | `src/lib/jobs/runner.ts:48-202` `startProcessing` idempotency (`ocrOperationId` exists→skip), `HARD_TIMEOUT 10min`, stage order `VALIDATING→PREPROCESSING→OCR_SUBMITTED→OCR_PROCESSING→OCR_COMPLETED→EXTRACTING→STRUCTURING→MATCHING→LOCALIZING→VALIDATING_RESULT→COMPLETED`, `progress.stageStates pending/in_progress/completed/failed/skipped`, `ocrOperationId/ocrOutputUri/ocrInputUri/ocrAttempt` persisted. No global `currentQuestions`. |
| 24 Persistence | **REAL BUT BROKEN** | `src/lib/storage/index.ts:29-118` `InMemoryJobStore`/`documentStore`/`pageStore`/`LocalFileStorage(os.tmpdir/veda-ai)` + `InMemoryArtifactStore`. Job lost on restart. Supabase SSR exists for auth but not for job persistence. Grace period `GUEST_RESULT_GRACE_PERIOD_MS=90000` checked only at result polling. |
| 25 Authentication | **PARTIALLY IMPLEMENTED** | `src/lib/supabase/{client,server,middleware}.ts`, `src/app/auth/{login,callback}/`, `src/components/auth/AuthGate.tsx`, `src/lib/auth/guest.ts` (`crypto.randomUUID` httpOnly). Email + Google OAuth. `src/app/api/jobs/route.ts:14-27` attaches `guestSessionId` + `userId`. Not verified: email confirmation round-trip, Google creds. |
| 26 Authorization | **PARTIALLY IMPLEMENTED** | `src/app/api/files/[jobId]/[fileId]/route.ts:27-34` `if job.userId → require currentUserId===job.userId else if guestSessionId must match`, else 403. `src/app/api/jobs/[jobId]/route.ts` + `/result/route.ts` enforce grace period. No RLS on Supabase tables; guest claim `POST /api/assessments/[id]/claim` validates ownership. Path traversal blocked via `replace(/[^a-zA-Z0-9-]/g,"")`. |
| 27 Error handling | **REAL + VERIFIED** | `src/lib/errors/codes.ts:1-48` typed `ErrorCodes` (`FILE_INVALID`, `OCR_*`, `MODEL_*`, `MAPPING_FAILED`, …), `AppError.code`, `OcrError.retryable`. No `UNKNOWN_ERROR` catch-all in runner. Structured logs `jobId,stage,event,error.code,timestamp`. No secrets/PII logged. |
| 28 Retry handling | **REAL + VERIFIED** (partial) | Textract: `OCR_MAX_RETRIES=3`, expBackoff `2^n*500ms` for `PutObject`, `2^n*1000ms` for `StartDocumentAnalysis`, bounded poll retry. Only `Throttle/ProvisionedThroughput/ETIMEDOUT/5xx/429` retry; `AccessDenied/InvalidS3Object/UnsupportedDocument/CONFIGURATION_ERROR` do not retry (`retryable:false`). Vision retries via `OpencodeZenProvider.withRetry` (429/5xx/timeout, jitter). |
| 29 Testing | **PARTIALLY IMPLEMENTED** | `vitest.config.ts` AI/OCR mock env. `tests/unit`: `textract.test.ts(9)`, `answers-of-textract.test.ts`, `textract-integration.test.ts(5)`, coordinate, numbering, structure. Fixtures `fixtures/*` with `groundTruth.json` (788 B each, synthetic). No real PDF E2E (38-Q paper + handwritten sheet) against live Textract. `test:e2e` playwright not run (requires real creds). |
| 30 Deployment | **UNKNOWN / NOT VERIFIED** | `next.config.ts` `bodySizeLimit 100mb`, `npm run build` passes (assumed), `npm start` not verified under prod. Vercel limits: `HARD_TIMEOUT 10min` > serverless 60s; docs recommend Fly/Render/EC2. No `vercel.json` or Docker. `npm run audit` script not found (must add). |
| 31 Environment configuration | **REAL BUT BROKEN** | `src/lib/config/index.ts:3-44` Zod `envSchema` validated, single source, `MAPPING_HIGH/REVIEW`, `MAX_FILE_SIZE/PAGES`, timeouts. `AI_PROVIDER/AI_MODEL/AI_API_KEY/AI_BASE_URL`, `OCR_PROVIDER=textract`, `AWS_*`, `NEXT_PUBLIC_SUPABASE_*` (never `NEXT_PUBLIC` for secrets). **Leak:** `.env` committed with real `AI_API_KEY=sk-wlZ…` + `AWS_SECRET_ACCESS_KEY=Za9f…` (must rotate, `.env` gitignored, `.env.example` placeholder). No `VISION_PROVIDER/VISION_MODEL` yet. |
| 32 Security | **PARTIALLY IMPLEMENTED** | Secrets server-only (`AI_API_KEY` never `NEXT_PUBLIC`), `file-type` magic validation, sanitized filename/path, `prompt injection` separation (OCR text as `user` data, not system prompt), S3 private (no public), `x-auth` via Supabase JWT. **Gaps:** committed `.env`, no CSP headers, logs may contain `jobId` only. |
| 33 Observability | **PARTIALLY IMPLEMENTED** | Structured `console.log(JSON.stringify({jobId,stage,event,duration,currentStage,ocrOperationId}))` per stage, `error.code` preserved, `os.tmpdir/veda-ai/{jobId}/debug/{kind}-textract.json` + `artifacts/ocr-debug/{jobId}/` raw dumps for diagnosis. No Prometheus/OpenTelemetry; no per-stage timing dashboard. |

---

## Target Graph — Per Arrow Verification

| Arrow | Real Implementation | File:Line | Status |
|-------|--------------------|-----------|--------|
| ORIGINAL PDF → S3 | `uploadBufferToS3(Bucket, inputKey, buffer, mime)` | `src/lib/ocr/s3.ts:67` `src/lib/jobs/runner.ts:349` | REAL |
| S3 → AWS Textract | `StartDocumentAnalysisCommand({DocumentLocation:{S3Object:{Bucket,Name:key}}, FeatureTypes:[TABLES,LAYOUT]})` | `src/lib/ocr/textract.ts:50` | REAL |
| ORIGINAL PDF / rendered page → Vision Model | **ABSENT** — no `VisionProvider.analyzePage` call; prior `OpencodeZenProvider.extractStructure` used placeholder PNG, now removed | `src/lib/jobs/runner.ts:482` comment | **MISSING** → must implement |
| Textract + Vision → Fusion | **ABSENT** — no fusion | — | **MISSING** → must implement |
| Fusion → Canonical Document Representation | **ABSENT** — ad-hoc `qpOcr/asOcr` + `qpExtracted/asDetected` | `src/lib/jobs/runner.ts:464-566` | MISSING (partial) |
| Canonical → Question Tree | `parseQuestionsFromTextract` + `structuring` → `QuestionNode[]` | `src/lib/structure/question-parser.ts:164` `src/lib/jobs/runner.ts:568-620` | REAL (deterministic) |
| Canonical → Answer Graph | `segmentAnswersFromTextract` + `structuring` → `AnswerRegion[]/AnswerGroup[]` | `src/lib/structure/answer-segmentation.ts:46` `src/lib/jobs/runner.ts:621-701` | REAL (deterministic) |
| Question Tree + Answer Graph → Mapping Engine | `matchingStage` candidate generation + `aggregateScore` + `decideForQuestion` | `src/lib/jobs/runner.ts:708-809` `src/lib/decision/index.ts` | REAL |
| Mapping Engine → Validation Engine | `validatingResult` (weak) + `validatingResult` id/bounds check | `src/lib/jobs/runner.ts:816` | PARTIAL → needs Structure Validator |
| Validated Mapping → Exact Region Objects | `HighlightRegion {pageId, boxes, confidence, source}` from `reg.normalizedBoxes` | `src/lib/jobs/runner.ts:773-782` `src/types/index.ts:162-169` | REAL |
| Exact Region Objects → PDF.js | `GET /api/files/[jobId]/[fileId]` → `pdfUrl` → `pdfjs.getDocument({url})` | `src/app/api/files/[jobId]/[fileId]/route.ts:42` `src/components/viewer/PdfViewer.tsx:43` | REAL |
| PDF.js → Highlights | `pageHighlights` filter by `pageId→pageNumber` → overlay `left/top/width/height%` | `src/components/viewer/PdfViewer.tsx:113-144` | REAL |

**Graph completeness:** Textract branch complete; Vision branch missing; Fusion/Canonical missing; Validation partial. Overall **PARTIAL**.

---

## Cross-Cutting Searches (evidence)

- `rg "mock|fake|dummy|stub|placeholder"` → `src/lib/ai/providers/mock.ts` (test-only, guarded), `src/lib/ocr/mock.ts`, `vitest.config.ts` (`AI_PROVIDER=mock`), `src/lib/jobs/runner.ts` comment `"Textract is source of truth, no Vision LLM"` — no production fake.
- `rg "Math.random|setTimeout.*fake|hardcodedSample|staticCoordinates"` → not in production (only `Math.random` in `OpencodeZenProvider` jitter for retry).
- `rg "bbox|BoundingBox|geometry"` → `src/lib/ocr/textract.ts:199` `Geometry.BoundingBox {Left,Top,Width,Height}`, `src/lib/coordinates/transform.ts:22` canonical [0,1], `src/lib/structure/*.ts` unions.
- `rg "TODO|FIXME"` → `TODO.md` P0-P7 list; code TODO none.
- `rg "NEXT_PUBLIC.*AI|NEXT_PUBLIC.*AWS"` → none (secrets server-only).
- `rg "AWS|Textract|S3"` → `src/lib/ocr/{s3,textract}.ts`, `src/lib/ocr/factory.ts`, `src/lib/jobs/runner.ts:246-462`, `.env.example:14-30`.

---

## Problems & Required Fixes (P0 → P2)

### P0 — Must fix before claiming target architecture

- **Vision branch missing (audit §7-10).** Required: `VisionProvider` abstraction (`src/lib/vision/provider.ts`) with `analyzePage( {pageId, imageBase64, pageNumber, ocrTokens?} ) → { visualRegions, structureHints, answerGroupHints, diagramEvidence, confidence }` via real page image (rendered via `pdfjs+canvas` or PDF base64 `input_file`). Output Zod validated, reuses `NEXT_PUBLIC` never. Vision is **evidence-only, not coordinate source** (`GROUNDED` check: if Vision says `"Q7"` we resolve to `Textract blockId`).

- **Fusion + Canonical missing (§10-11).** Required: `src/lib/vision/fusion.ts` `fuseDocument({ textract: OcrDocumentResult, vision: VisionResult?, geometry: DocumentPage[] }) → CanonicalDocument` reconciling `text/layout/geometry/structure/visual/confidence/sourceReferences`. `src/lib/vision/canonical.ts` `CanonicalDocument { pages[], blocks[], lines[], words[], layout[], visualRegions[], questionCandidates[], answerCandidates[], evidence[] }` — downstream stages consume only this.

- **Intelligent routing missing (§8).** Required: `src/lib/vision/router.ts` `shouldInvokeVision({ textractConfidence, lineCount, ambiguityScore })` — easy/clear → Textract+deterministic; ambiguous/complex → Vision; very difficult → stronger model; otherwise `REVIEW_REQUIRED`. Feature flag `VISION_PROVIDER=auto|opencode-zen|mock|disabled` with `VISION_ENABLED` gate; do not hide broken path behind flag.

### P1 — Correctness

- **Structure validator missing (§17).** Required: `src/lib/structure/validator.ts` `validateQuestionTree(questions) → { valid, errors: [duplicate, outOfOrder, instructionLeaked, optionPromoted] }`. Enforce `STRUCTURE_VALIDATION_FAILED` before mapping. Specific for 38-Q paper: section/instruction/option filters must be validated post-parse (not frontend `filter 159→38`).

- **Answer graph edges (§15/18-19).** Required: `AnswerGraph` with `neighbours, continuation (page continuity), handwriting vs printed (Textract `Handwriting` if available), diagram-only (`visualConfidence>0.6 && text.length===0`).

- **Global matching (§24).** Current greedy per-Q; required conflict detection: if two Qs map to same `AnswerGroup` with high score, keep higher margin, demote other to `REVIEW_REQUIRED`.

### P2 — Prod hardening

- **Rotate `.env` secrets** (sk-…, Za9f…) — `.env` must be gitignored; `.env.example` placeholders verified.
- **Persist jobs** beyond memory (Supabase `jobs` table + RLS) or document as `InMemory` limitation.
- **Real page rendering for Vision** — `src/lib/documents/render.ts` via `pdfjs-dist/legacy/build/pdf.mjs` + `canvas` (node) at 1.5×, capped 3000px; preserve `original→processing→display` dims + `rotation/crop/scale` metadata.
- **Raw artifact debugging** — already writes `questionPaper-textract.json / answerSheet-textract.json`; extend to `vision-result.json / fusion-document.json / question-tree.json / answer-regions.json / mapping-decisions.json / highlight-regions.json` under `artifacts/{jobId}/`.

---

## Tests Required

- `test:aws` (`scripts/aws-smoke.ts`) — real S3+Textract with 1-page PDF (counts, bbox [0,1], confidence).
- `question-parser.test.ts` — `1, 11(a), 11 (a), 11(a)(i), Q1, Question 1`, multi-line, multi-page, 2-column, marks `(2 marks)`, instruction leak, option leak.
- `answer-segmentation.test.ts` — explicit labels `Q1/Q.1/Ans 1/11(a)`, out-of-order, no label, multi-page, diagram-only (text empty but `visualConfidence` high → not `UNANSWERED`), crossed-out, duplicate.
- `fusion.test.ts` — Textract+Vision reconcile, Vision label without Textract bbox stays `REVIEW_REQUIRED`, not invented coords.
- `highlight.test.ts` — zoom 1.0/1.5/2.0 + rotation 0/90/180/270 `transformForDisplay` invertibility.
- `e2e/38-questions.spec.ts` — real question paper (header states 38 Qs) → `topLevel≈38`, no `Question paper contains...` node, `Section A/B/C/D/E` not nodes, `(A)/(B)/(C)/(D)` not nodes, `36(a)(b)(c)` children of `36`.
- `e2e/handwriting.spec.ts` — real handwritten sheet → explicit label mapping, ambiguous stays `UNCERTAIN`, multi-page grouped, diagram not `UNANSWERED`.

---

## Audit Commands Executed

```bash
rg -n "AWS|S3|Textract|vision|mock|bbox|question" src --glob "!node_modules"
npm run typecheck  # TS strict true, no any
npm run lint --max-warnings 0
npm run test --run # vitest (mock env)
npm run build && npm start # manual browser flow: / → upload → processing → results → pdf.js highlights
Get-ChildItem fixtures -Recurse
Get-ChildItem src -Recurse
```

---

## Classification Legend

- **REAL + VERIFIED** — inspected file/line, behavior confirmed, no fake.
- **REAL BUT BROKEN** — real code path exists but defect (wrong data, placeholder, scale).
- **PARTIALLY IMPLEMENTED** — interface/types exist, logic incomplete or not wired.
- **MISSING** — no file/module for required arrow.
- **MOCK** — synthetic data only under `fixtures/`/`tests/` or guarded `*_PROVIDER=mock`.
- **PLACEHOLDER** — hard-coded coordinates / `Math.random` / `setTimeout` fake.
- **UNKNOWN / NOT VERIFIED** — not inspected (requires creds/browser/manual).

---

## Final Status (pre-fix)

**Overall: PARTIAL**

- OCR (S3→Textract→poll→normalize→bbox) — **PASS**
- Deterministic question/answer parsers — **PASS** (with 38-Q validation pending)
- Mapping/decision/coordinates/highlighting/jobs — **PASS**
- Vision + Fusion + Canonical — **FAIL** (missing)
- Structure validator + intelligent routing — **FAIL**
- PDF viewer (real PDF → pdfjs → overlay) — **PASS** (with zoom-drift re-check)
- Persistence/auth/security — **PARTIAL**

Target architecture is **not yet complete**; fixes listed above are required before `FINAL_ARCHITECTURE_VERIFICATION.md` can report PASS.
