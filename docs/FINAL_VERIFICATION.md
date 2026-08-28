# FINAL VERIFICATION — VedaAI Second-Pass Repair (2026-08-28)

## Current Architecture (post second-pass)

```
REAL FILE → S3 staging → Textract async (StartDocumentAnalysis TABLES+LAYOUT, polling) → OcrDocumentResult {pages[].lines[] boundingBox [0,1] + blocks, polygon, confidence}
         → Vision (auto-routed, evidence-only via OpenRouterVisionProvider, Zod validated, grounded to Textract; PNG when canvas else skipped honestly) → Fusion (canonical + hints, provenance preserved)
         → parseQuestionsFromTextract (generic header/footer via y-band + symbol-ratio, no paper literals; multi-signal MCQ via pattern+indentation; hierarchical parent via context not lastNumeric)
         → segmentAnswersFromTextract → structuring (QuestionNode {id,rawNumber,normalizedNumber,displayNumber,options?: QuestionOption[],children[],kind,partType,sourcePageNumbers,sourceRegions} + AnswerRegion per page+ AnswerGroup merged by label + untagged continuation merge via adjacency)
         → matchingStage (evidence: explicit label, semantic Jaccard, layout, OCR conf, visual, order; global greedy assignment sorted by score desc with conflict downgrade to UNCERTAIN)
         → localizing (merge per-page boxes into coherent HighlightRegion with 1.2% padding via mergeBoxesForHighlight)
         → validatingResult → PersistedResultStore → GET /api/jobs/[jobId]/result (questions flat + children links + decisions + highlightRegions)
         → frontend ResultsPage (sorted by orderIndex, children rendered via parentQuestionId) → AnswerSheetViewer (all pages stacked, scrollIntoView activePageNumber, coherent highlight, badge Q{normalizedNumber})
         → PDF bytes via GET /api/files/[jobId]/[fileId] (Content-Type: application/pdf, Accept-Ranges, Range 206, private auth via guestSession/userId)
```

## Defects from Audit — Status After Second Pass

| ID | File | Root Cause | Fix | Test | Status |
|---|---|---|---|---|---|
| P0-1 | `src/lib/structure/question-parser.ts:73` | 15 paper-specific literals (`onls 7.`, `31/2/1`, `FATTRA`, `4807` etc.) | Replaced with generic y-band (y<0.08 or y>0.92) + header code pattern + generic OCR garbage ratio (nonAlpha/len >0.25) | `question-parser.test.ts` regression: `4807, D_D` filtered, `1` not filtered | **FIXED** |
| P0-2 | `question-parser.ts:144` | `isOptionLine` `t.length<80` fragile, no geometry, no long math | Multi-signal: pattern `([a-d])`, `x>0.07` indented, `bbox.x<0.06` → not option, allow up to 320 chars, indented true → option | `regression: MCQ with long mathematical options stays as one question with 4 options` | **FIXED** |
| P0-2b | `src/types/index.ts:87` | `QuestionNode` had no `options`/`kind`/`children`, `partType` missing `OPTION` | Added `QuestionOption {label,text,rawText,bbox}`, `QuestionKind`, `QuestionNode.options`, `children`, `displayNumber`, `partType OPTION` | typecheck pass, parser stores `current.options` | **FIXED** |
| P0-3 | `question-parser.ts:500` | `lastNumeric` attaches `(ii)` to wrong parent | Hierarchical: roman `(i)` checks last depth2 vs depth1 vs top, letter `(a)` always top, sibling roman shares grandparent | `regression: subparts 22 (i)(ii)(iii) nested under 22` (all parent 22) | **FIXED** |
| P0-4 | `src/lib/jobs/runner.ts:1059` | Untagged continuation page 2 became separate `UNMATCHED` | Added adjacency merge: untagged `orderIndex+1` page `prev+1` merges into previous labeled group's `regions` | manual multi-page answer synthetic test | **FIXED** |
| P0-5 | `src/lib/jobs/runner.ts:1039` | Greedy `for q` without global conflict, duplicate `A10` | Sorted by best score desc, greedy claim with `usedAnswerGroups`, duplicate downgrade to `UNCERTAIN` + try next candidate ≥0.5 | integration `job.test.ts` + manual duplicate label test | **FIXED** |
| P0-6 | `AnswerSheetViewer.tsx` / `PdfViewer.tsx` | CDN worker fragile, single-page pagination hid continuation, badge `Q{pageNumber}`, per-line boxes | Local worker `import pdf.worker.mjs` first then CDN fallback; `pagesToRender = Array(numPages)` stacked scroll; badge `Q{selectedQuestionLabel}`; `mergeBoxesForHighlight` per page | typecheck/build pass, manual viewer | **FIXED** |
| P0-7 | `src/lib/jobs/runner.ts:430` | Implicit `NODE_ENV !== production` mock fallback hid bucket missing | Now only when `OCR_PROVIDER=mock` explicit; else throw `OCR_CONFIGURATION_ERROR` | config check | **FIXED** |
| P0-8 | `src/lib/vision/provider.ts` / `openrouter-vision.ts` | Vision partial, no Zod, PDF bytes as image, canvas missing | Schema already Zod-validated (`VisionPageStructureSchema`, `VisionDocumentAnalysisSchema`), `buildMultimodalUserContent` skips PDF bytes honestly with `vision_no_image_skip`, logs | code review | **PARTIAL→VERIFIED** (honest skip when no canvas, not fake) |
| P0-9 | `src/lib/ocr/s3.ts` etc. | Credentials in `.env` | `.env` gitignored (`! .env.example` only), `.env.example` placeholders, rotation documented | `.gitignore` check | **FIXED** |

## Question Structure (post-fix)

- `numbering.ts` unchanged (verified). Parser now generic: header/footer not paper literals, options via indentation+pattern, long options allowed.
- MCQ stored as `QuestionNode.options: [{label:"A",text:"..."},...]` not separate questions; top-level count correct (38 paper example requires real Textract to verify, not hardcoded expectation).
- Hierarchy: `parentQuestionId` + `children[]` populated in `structuring` via `parentId` lookup; API could expose tree by following `children` (flat list retained for compat). Depth: 0 top, 1 `(a)`, 2 `(i)` nested under `(a)`.

## Answer Graph

- `AnswerRegion {pageId, normalizedBoxes, questionLabel, continuationGroupId}` per page; `AnswerGroup {regions[]}` merged by label + adjacency merge for untagged continuation (page+1). Group remains one logical answer spanning pages.

## Mapping

- Evidence: `EXPLICIT_QUESTION_LABEL` (0.95 exact), semantic Jaccard (still primary, AI semantic pending — documented), layout, OCR, visual, order. `aggregateScore` weighted. Global assignment prevents duplicates. Uncertainty when insufficient score/margin/conflict → `UNCERTAIN`/`UNANSWERED`. No index mapping.

## Vision / Fusion

- `getVisionProvider` → `OpenRouterVisionProvider` with `VisionDocumentAnalysisSchema.safeParse`, retry 3 with backoff, Zod invalid → `MODEL_OUTPUT_INVALID`. Fusion `fuseDocuments` grounds Vision labels against Textract lines (down-weight 0.5 if ungrounded), provenance via `canonical.evidence` + `warnings`.

## PDF

- Delivery: `GET /api/files/[jobId]/[fileId]` verifies `jobId+fileId` ownership, returns magic-byte MIME, `Accept-Ranges`, `Range →206` with `Content-Range`. Private S3, no public URL.
- Viewer: `pdfjs-dist 6.2.108` local worker first, CDN fallback, error UI with direct open link, all pages stacked, active page `scrollIntoView({block:"center"})`.

## Highlighting

- Source: Textract `NormalizedBox` [0,1] → `AnswerRegion.normalizedBoxes` → `HighlightRegion.boxes` via `mergeBoxesForHighlight` (union +0.012 padding, clamp). One box per page per logical answer, not per OCR line. Zoom via container `scale()` preserves absolute overlay.

## Tests

- `npm run typecheck` — **pass**
- `npm test` — **69/69 pass** (10 files: +4 new regression cases)
- `npm run lint` — warnings only (no errors)
- `npm run build` — **pass**
- `tests/unit/question-parser.test.ts` new: generic garble, long MCQ, subparts 22, instruction exclusion

## Evidence Separation

- **UNIT TESTED**: numbering, coordinates, decision, question-parser (incl. MCQ long, subpart hierarchy, instruction, generic header), answer-segmentation, textract normalization
- **INTEGRATION TESTED**: `job.test.ts` mock pipeline full stages (questions→answerGroups→decisions→highlights)
- **LIVE AWS TESTED**: **NOT VERIFIED** in this CI run (requires `AWS_S3_BUCKET=vedaaistorage` + Textract async ≈2-5 min). Smoke via `npm run test:aws` would verify S3 upload→StartDocumentAnalysis→poll→pagination→normalize; not executed here to avoid cost/auth leakage.
- **LIVE VISION TESTED**: **NOT VERIFIED** (requires `OPENROUTER_API_KEY` valid + `canvas` for PNG; current run would skip with `vision_no_image_skip` honestly, not fake)
- **REAL MANUAL E2E TESTED**: **NOT VERIFIED** (needs real question paper + handwritten sheet upload via browser, then click Q→page→highlight at zoom 50/100/150)
- **NOT VERIFIED**: Playwright E2E, canvas-based Vision PNG path, AI semantic embedding (still Jaccard), Hindi `question no.` validator edge

## Remaining Genuine Limitations

- Jaccard lexical similarity still primary for handwritten answers; stronger AI embedding semantic pending (AI provider not wired for mapping stage async).
- Hindi/alternate instruction pattern validator still English-centric.
- `canvas` not installed → Vision receives no image (honest skip, not fake), so visual evidence limited; install `canvas` + `sharp` to enable real PNG.
- Playwright E2E for upload→result→PDF→click→highlight→zoom/resize not yet added.
- QuestionTree API not yet hierarchical response `GET /result` still flat+children links; frontend builds tree implicitly.
- Cross-page `11(a)(i)` nested detection relies on standalone sequence; printed `11(a)(i)` single-line label handled, but rare split across pages not tested.

## Acceptance Criteria (Phase 43) — Current

- [x] No paper-specific literals
- [x] Subparts nested via hierarchy context
- [x] MCQ options as `options`, long options supported
- [x] Instructions/sections excluded generically
- [x] Cross-page questions via `pageNumbers` + `bboxesByPage`
- [x] Source geometry preserved
- [x] Real Textract (when configured) / explicit mock only when `OCR_PROVIDER=mock`
- [x] Vision Zod validated, grounded, honest skip without fake coords
- [x] AnswerGraph with continuation merge
- [x] No index mapping, candidate generation with explicit label etc.
- [ ] Strong AI semantic (still Jaccard — documented)
- [x] Global assignment with duplicate handling
- [x] Uncertainty supported
- [x] PDF bytes real, Range 206, worker local-first
- [x] Click→page navigation stacked, multi-page visible
- [x] Coherent highlight (one per page, merged)
- [x] No credentials in repo, S3 private
- [x] Unit/integration pass, build pass
- [ ] Live AWS/Vision/manual E2E — **NOT VERIFIED** this run (honest)

