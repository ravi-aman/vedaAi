# IMPLEMENTATION AUDIT — VedaAI (2026-08-27)

## Methodology
Inspected every file under `src/`, `package.json`, `.env`, `opencode.json`, `next.config.ts`, `src/lib/ocr/*`, `src/lib/structure/*`, `src/lib/jobs/runner.ts`, `src/app/api/*`, `src/components/viewer/*`, `src/types/index.ts`, ran `typecheck` (PASS), `test` (10 suites 65 tests PASS), inspected screenshots showing 159 questions vs expected ~38.

## 1. Current Architecture
```
CLIENT UploadDropzone → POST /api/jobs → JobStore (InMemory) → FileStorage (LocalFileStorage os.tmpdir)
  → S3 vedaaistorage/ocr-input/{jobId}/{kind}.pdf → Textract async StartDocumentAnalysis/GetDocumentAnalysis → normalizeTextractBlocks → question-parser / answer-segmentation → structuring → matching (deterministic Jaccard+label) → localizing → validating → resultStore (InMemory) → GET /api/jobs/[jobId]/result → Results UI (Questions panel | PdfViewer)
```

## 2. Current Pipeline
`VALIDATING → PREPROCESSING (pdf-lib inspect) → OCR_SUBMITTED → OCR_PROCESSING → OCR_COMPLETED → EXTRACTING (parseQuestionsFromTextract + segmentAnswersFromTextract) → STRUCTURING (build QuestionNode/AnswerRegion) → MATCHING (explicit label + semantic Jaccard + layout) → LOCALIZING → VALIDATING_RESULT → COMPLETED`

OCR is REAL AWS Textract (S3 + polling), not mock, when `OCR_PROVIDER=textract`. Geometry preserved via `OcrDocumentResult.pages[].lines[].boundingBox [0,1]`. No vision LLM replaces Textract.

## 3. Data Model
`QuestionNode` has `rawNumber/normalizedNumber/parentQuestionId/partType/depth/section/marks/confidence/evidence/sourceRegions`. `AnswerRegion` has `sourceBoxes/normalizedBoxes/questionLabel/labelConfidence/ocrConfidence`. `MappingDecision` has `questionId/answerGroupId/status/confidence/evidence/highlightRegions`. `HighlightRegion` has `pageId/boxes/confidence`. Canonical coords normalized [0,1] per original page dims.

## 4. API Routes
- `POST /api/jobs` create job with guestSessionId/userId, pipelineVersion
- `POST /api/jobs/[jobId]/upload` attach questionPaper/answerSheet, magic-byte validation
- `POST /api/jobs/[jobId]/start` triggers runner
- `GET /api/jobs/[jobId]` poll job + pages + documents
- `GET /api/jobs/[jobId]/result` returns ProcessingResult (questions/answers/decisions) with access control (guest grace 90s, ownership)
- `GET /api/files/[jobId]/[fileId]` streams PDF/image via LocalFileStorage (no S3 signed URL; local tmp streaming)
- `POST /api/jobs/[jobId]/claim` guest claim to user

## 5. Storage Model
`InMemoryJobStore` + `LocalFileStorage` (os.tmpdir/veda-ai) + `InMemoryArtifactStore`. Not durable (lost on restart). Supabase SSR client exists (`src/lib/supabase/*`) but no table migrations; graceful fallback. S3 used only as Textract staging (input/output prefixes), not as permanent storage. Files streamed via `/api/files` endpoint, NOT via filesystem path sent to browser (correct architecture).

## 6. OCR Implementation
`TextractOcrProvider` (`src/lib/ocr/textract.ts:29`): `StartDocumentAnalysis` with FeatureTypes `["TABLES","LAYOUT"]`, fallback to `StartDocumentTextDetection`, pagination via NextToken, `normalizeTextractBlocks` synthesizes `OcrBlock/Paragraph/Word` from LINE/WORD blocks, preserves bbox/confidence/pageNumber. Mock provider only when `OCR_PROVIDER=mock`.

## 7. Textract Configuration
`.env` has `AWS_REGION=ap-south-1`, `AWS_S3_BUCKET=vedaaistorage`, `OCR_PROVIDER=textract`, keys present (see Security). Required perms: `s3:PutObject/GetObject/ListBucket/DeleteObject` on `vedaaistorage/ocr-input/*` and `vedaaistorage/ocr-output/*`, `textract:StartDocumentAnalysis/GetDocumentAnalysis/GetDocumentTextDetection`. Documented in `docs/AWS_SETUP.md` (needs least-privilege policy).

## 8. S3 Configuration
`src/lib/ocr/s3.ts:23` builds keys `ocr-input/{jobId}/{kind}.pdf` and `ocr-output/{jobId}/{kind}/` via `uploadBufferToS3`. Uses `S3Client` with explicit creds or IAM role fallback. Bucket `vedaaistorage` assumed exists (no create). Cleanup via `deleteS3Prefix` after success.

## 9. Question Parser (CRITICAL FAILURE)
File: `src/lib/structure/question-parser.ts:1`
- Regex `QUESTION_LABEL_RE` matches standalone `"(a)"` as label → each MCQ option (a)-(d) becomes independent top-level question. 20 MCQs ×4 = ~80 false questions + instructions/headers = 159 vs 38.
- No instruction filtering: lines like "This question paper contains 38 questions" or "divided into 5 Sections" have no label but are incorrectly promoted because detectLabel over-matches or continuation logic merges them into first question or creates false questions from fragmented lines like "equal to".
- No section/header/footer filtering: "Page 1 of 8", "*Please note that assessment scheme*", "Section A" are treated as questions or appended to question text ("Use of calculators... Section A consists..." merged into Q10).
- No option vs subpart distinction: Standalone `(a)` is always new question; should be option under MCQ or subpart under case-study.
- Hierarchy: `parent` via `normalizeNumber` but `structuring` searches `questions.find(parent)` which fails if parent not yet created or if "(a)" has no parent number → depth 1 with undefined parent → counted as top-level.
- Reading order: simple y-sort + two-column heuristic exists but not validated for wrapped question text, page breaks, or indented subparts.

## 10. Answer Detection
File: `src/lib/structure/answer-segmentation.ts:1`
- Regex `ANSWER_LABEL_RE` similarly broad; detects `Ans 1`, `Q1`, `11(a)` but also could mis-detect untagged handwriting as new answer on large gap.
- Currently creates one `AnswerGroup` per `SegmentedAnswer` region; multi-page handling via `bboxesByPage` Map is correct (groups per page). Filter `text.length>15` for untagged avoids tiny segments.
- Risk: answer sheet has 194 answers detected vs expected ~38; suggests over-segmentation (each line without label may be split). Need validation.

## 11. Mapping Algorithm
File: `src/lib/jobs/runner.ts:680` `matchingStage`
- Candidate generation: every question × every answerGroup, evidence: EXPLICIT_LABEL (prefix-insensitive), SEMANTIC_SIMILARITY (Jaccard), LAYOUT_CONTINUITY, OCR_CONFIDENCE, VISUAL_EVIDENCE. Score via `aggregateScore` (weighted sum).
- Decision via `decideForQuestion` with thresholds `high=0.75 review=0.50`, margin 0.08. Evidence preserved.
- Correctly handles out-of-order via label matching, not order.
- Issue: With 159×194 candidates, many false positives produce low confidence UNCERTAIN (63%-78% in screenshot are fabricated from Jaccard + OCR, not evidence-derived confidence is real but indicates heuristic is weak because questions are wrong).

## 12. Coordinate System
File: `src/lib/coordinates/transform.ts:1`
- Canonical [0,1] normalized, `rotateBox` for 0/90/180/270, `denormalizeBox`, `transformForDisplay`, `mergeBoxes`, `boxIoU`. Pure, tested. Viewer uses `%` style (`left: box.x*100%`) correctly. Not mixing pixels/points. Needs visual verification at scales.

## 13. PDF Viewer Implementation
File: `src/components/viewer/PdfViewer.tsx:1`
- Streams via `pdfUrl=/api/files/[jobId]/[fileId]` (correct, not filesystem path). Uses `pdfjs-dist/legacy/build/pdf.mjs` with `getDocument({url})`, canvas render per page at scale 1.5, highlight overlay as absolute divs with `%`.
- Issue: `GlobalWorkerOptions.workerSrc=""` disables worker (fallback to fake worker via main thread) — works but not optimal. No range request handling; relies on `NextResponse` streaming full buffer (ok for <100MB). No `Accept-Ranges` header. Previously placeholder viewer (`ViewerShell` fake lines) now replaced but fallback still exists.
- Navigation: `activePageId` → `scrollIntoView` on effect, versioned selection state prevents race? Results page uses `selectedId` state directly, no versioning guard for stale async PDF loads.

## 14. Authentication/Gating State
- Guest cookie `veda_guest_session` httpOnly, grace 90s server-enforced, ownership via `job.guestSessionId`/`job.userId`. `GET /result` and `GET /files` enforce access control. Supabase Auth scaffolding exists but not fully verified with Google OAuth (Not Verified). No RLS tables yet.

## 15. Failures Summary

| # | Problem | Root Cause | File:Line | Impact | Correct Fix | Test Required |
|---|---------|------------|-----------|--------|-------------|---------------|
| 1 | 159 questions vs ~38 | `QUESTION_LABEL_RE` matches `(a)` standalone → options become questions; no instruction/header filtering | `question-parser.ts:21` | Teacher sees 121 fake questions, mapping meaningless | Remove standalone `(a)` from top-level regex, add instruction/section/header/footer filters, treat options as not questions, preserve hierarchy via parent lookup | question-parser.test: MCQ options not counted, instructions excluded, header/footer excluded |
| 2 | Instructions as questions | No `isInstruction` check; lines like "This question paper contains..." promoted if detectLabel misfires or via continuation | `question-parser.ts:27` | Pollution of question list | Add `INSTRUCTION_PHRASES` generic heuristic + skip if no label and before first numeric question | test: instruction lines skipped |
| 3 | Section headers as questions | `SECTION_RE` only used to return null in `isSectionOrInstruction` but structuring still creates node if label detected nearby; text "In Section A, Question numbers..." contains number range but not question | `question-parser.ts:23` | 5-10 fake sections | Strict: if line matches `Section [A-E]` at start, skip entirely | test: section headers excluded |
| 4 | Page headers/footers as questions | `Page 1 of 8` contains digit → detected as question; footer "*Please note...*" merged into question text | `question-parser.ts:218` | Duplicates, noise | Filter lines with y<0.04 or y>0.92 + regex `Page \d+ of \d+` or `assessment scheme` | test: header/footer filtered |
| 5 | Subparts counted as top-level | `normalizeNumber` gives depth but `structuring` parent lookup by string `normalizedNumber===parent` fails for `(a)` with undefined parent → remains top-level | `runner.ts:549` + `numbering.ts` | 38 questions inflated to include subparts | Implement hierarchy: only depth 0 are top-level; depth>0 must have parentId resolved via nearest preceding depth 0 with same base number; if no parent, discard or attach to previous | test: 11(a) parent is 11, not top-level count |
| 6 | Answer sheet over-segmentation (194) | `segmentAnswersFromTextract` creates segment per label + untagged; mock fallback? Real sheet with handwritten may split per line if label regex too broad | `answer-segmentation.ts:16` | Mapping 159×194 = 30846 candidates, slow, low confidence | Tighten `ANSWER_LABEL_RE` to require explicit prefix or number+(subpart), filter untagged only if substantial; group per label | test: answer count ≈ question count |
| 7 | Confidence appears fabricated | `mappingConfidence` from `aggregateScore` includes Jaccard + layout even when question is fake → 63%-78% shown as "Needs review" but still misleading | `runner.ts:720` | Teacher misled | Only show confidence when MATCHED with explicit label ≥0.85; else "Needs review" without % or with evidence-derived score | test: confidence not shown for UNANSWERED |
| 8 | PDF viewer blank (prior) | Previously sent filesystem path or placeholder PNG; now fixed to `/api/files` streaming but workerSrc empty may still fail for large PDFs | `PdfViewer.tsx:43` + `files/[jobId]/[fileId]/route.ts:55` | Answer sheet not visible | Ensure `/api/files` sets `Content-Type: application/pdf`, `Content-Length`, disable range? Verify pdfjs `getDocument` with `withCredentials` | E2E: upload PDF → viewer shows pages |
| 9 | Secrets in `.env` | `.env` contains real `AKIA...` + `Za9fcqe...` + `sk-wlZV...` | `.env:5` | Exposure risk, git history leakage | Ensure `.env` gitignored (verified), recommend rotation via `docs/AWS_SETUP.md`, never log secrets, use env example with placeholders | audit: `rg sk-` none in src, `git check-ignore` |
| 10 | Race condition on click | `selectedId` update triggers `highlights` recompute synchronously; no versioning for async PDF loads; rapid clicks may show stale highlight if PDF page not yet rendered | `results/[jobId]/page.tsx:188` | Wrong highlight after fast clicks | Add selection version/cancellation via useRef + effect dependencies | test: rapid click sequence |
| 11 | Missing debug artifacts | No `artifacts/` or `/debug` endpoint to inspect Textract raw → question-tree → mappings | runner.ts | Undebuggable pipeline | Add dev-only `GET /api/jobs/[jobId]/debug` returning counts + Textract summary (sanitized) | test: debug endpoint returns counts matching audit |

## 16. Security Audit
- `.env` gitignored (verified `git check-ignore` passes), not committed; but keys are real and must be rotated if exposed in prior commit history (`git log --all -p | grep AKIA`). No `NEXT_PUBLIC` secrets. File paths sanitized via regex `[^a-zA-Z0-9-]`. Magic-byte validation real. Prompt injection separation via system/data.

## 17. Required Tests
- question-parser: MCQ options not questions, instructions excluded, headers excluded, hierarchy preserved, multi-page spanning, two-column.
- answer-segmentation: explicit labels, out-of-order, multi-page.
- coordinates: scale/rotation 0.5/1/2, 0/90/180/270.
- E2E: upload Q paper + answer sheet → S3 → Textract → question hierarchy → answer regions → mapping → PDF loads → highlight navigation → unanswered/unmatched → mobile.

