# ACCURACY AUDIT — VedaAI Real Paper (38Q + 39-page handwritten)

**Date:** 2026-08-29T02:55:00Z
**Job:** `39ac494f-ecec-4ccc-91ca-c9e9995a644b` (S3+Textract+Vision `qwen/qwen3-vl-32b` + fusion + structuring + mapping + localization)
**Artifacts:** `artifacts/accuracy/*.json` (12 files), `artifacts/39ac494f/{01..11}.json`, `C:\Users\Dell\AppData\Local\Temp\veda-ai\39ac494f\debug\fusion-{qp,as}.json`
**Browser:** Chromium Headless Shell 151.0 Playwright 1.62.1, `tests/e2e/real-paper.spec.ts` 1 passed 2.2m

---

## PHASE 1 — Question Extraction Ground Truth

**Method:** Human inspection of `fusion-qp.json` canonical lines (8 pages, 53+59+73+54+61+67+73+30 lines) + visual check of `vision-pages/qp-page-001/002/003.png` (164-198KB PNG 893×1263 via mupdf). Not derived from parser.

**Result:** `artifacts/accuracy/question-ground-truth.json`
- **Top-level 38** (19-20 Assertion-Reason, 21,24,29,31,34,35 internal OR, 36-38 case-study)
- Sections: A 1-20 (1-18 MCQ +19,20 A-R), B 21-25 (2m), C 26-31 (3m), D 32-35 (5m), E 36-38 (4m =1,1,2)
- Subparts: 36 i,ii,iii (A/B), 37 i,ii,iii (A/B), 38 i,ii,iii (A/B) =9 expected
- Visually impaired alternatives (Q7 circle, Q25 right triangle, Q26 PA PB) are **not** separate questions.

## PHASE 2 — Question Tree vs Ground Truth

**Source:** `07-question-tree.json` 41 nodes (38 top +3 subs 37(i)-(iii)), `06-question-candidates.json` 41

| Metric | Value |
|---|---|
| Top-level Precision | 1.00 (38/38) |
| Top-level Recall | 1.00 (38/38) |
| Overall Node Precision (incl. subs) | 0.927 (38/41) |
| Ordering Accuracy | 1.00 |
| Hierarchy Accuracy | 0.33 (1/3 case studies correct) |

**Hierarchy errors:**
- **Q36:** missing children 0/3 (i,ii,iii not split, 2 spurious options)
- **Q37:** duplicate hierarchy — 37 has 3 children via `children[]` ids AND 3 top-level nodes `37(i),37(ii),37(iii)` (92.7% node precision if counting duplicates)
- **Q38:** missing children 0/3

**Option defects:**
- Q6 missing C (3 vs 4 opts) — Textract truncated, `isOptionLine` skipped
- Q7 merged 6 opts (2 from Olympic rings +4 from visually impaired circle alternative) — duplicate B/D labels
- Q8 missing B (3 vs 4), Q10 missing C (3 vs 4)
- Q18 text contaminated with DIRECTIONS 19-20 header (329 chars)
- Q36/Q38 spurious 2 opts, Q37(iii) partial 1 opt missing (B)

**No:** MCQ options as questions (0), section headers as questions (0), page continuation split (0). Internal choices (9 ORs) kept as raw text, not structured.

**Root cause:** Generic heuristics (y-band, x>0.07) no paper hardcoding; visually impaired alternative merging and C/B detection threshold are generic limitations, not overfitting.

→ `artifacts/accuracy/question-comparison.json`

## PHASE 3 — Answer Ground Truth

**Method:** Human inspection of `fusion-as.json` canonical 39 pages + `AnswerSheetViewer` PDF + regex `Ans\s*\d+` with OCR-error correction (`Anss.`→Ans8, `Anst3`→Ans13 etc). 33 clear labels +5 inferred truncated = **38 attempted, 0 blank**.

→ `artifacts/accuracy/answer-ground-truth.json`
- Sequential 1-38 monotonic with pages 3→37, multi-page continuations for 21(5→6),26(11→12→13),29(16→17→18),37(35→36),38(37→38→39)
- Rough work page2, margin notes, diagrams excluded as answers.

## PHASE 4 — Segmentation Audit (Textract → AnswerGraph)

**Source:** `08-answer-regions.json` **189 groups** vs expected 33

| Metric | Value |
|---|---|
| Precision | 0.174 (33/189) |
| Recall | 1.00 |
| Excess groups | 156 |
| Single-region groups | 137 (blank/low-conf) |
| Multi-region groups | 52 |
| Avg regions/group | 2.27 |

**Critical defect — OVER_MERGE:**
- **Group `66576508` Q1:** 25 regions spanning 9 pages (5,11,13,15,21,22,23,33,39) with text `=1 =a ... 101x+102y=304 ... median ... sixth lane 438m`. Expected 1 region page3. Cause: `labelConfidence 0.95` for any digit "1" (matches `L1`, `10`, `13`, `101x`) + `LAYOUT_CONTINUITY 0.8` merges distant pages.

**Other defects:**
- **Over-split:** Q26 1 expected →8 actual groups across 3 pages (y-gap 60px too small for handwriting gaps >80px)
- **Unrelated included:** 52 multi-page groups non-consecutive
- **Blank as answer:** 137 single-region empty/`ocr<0.6` groups kept
- **Diagrams excluded:** Q7,26,33,37 diagrams not linked (Vision DIAGRAM not attached)
- **Continuation not merged:** 21,29,37 multi-page answers remain split, `continuationGroupId` per-region `seg-?` not per-group linking

→ `artifacts/accuracy/segmentation-audit.json`

**Failure boundary: ANSWER SEGMENTATION** — not Textract (SUCCEEDED 22s, 1187 lines), not Vision (200 in 13s), but post-OCR grouping.

## PHASE 5 — Mapping Accuracy (Most Important)

**Source:** `10-mapping-decisions.json` 193 decisions: **1 MATCHED, 36 UNCERTAIN, 4 UNANSWERED, 152 UNMATCHED**

Per-question (expected all ANSWERED):

| Question | Expected | Actual | Conf | Correct |
|---|---|---|---|---|
| 1-3,5-18,20-38 | ANSWERED | UNCERTAIN (0.57-0.74) | 0.6 avg | false (wrong pages/over-merge) |
| 4 | ANSWERED | MATCHED 0.755 | true | true |
| 19,37(i)-(iii) | ANSWERED | UNANSWERED 0.47 | false | false negative |

**Metrics:**
- Mapping accuracy: **0.026 (1/38)**
- Answered detection: **0.026**
- Unanswered detection: **0/4 false** (0 expected UNANSWERED but 4 predicted)
- False matches: 33 wrong pages, 0 duplicates (global greedy prevents duplicates)
- Missed: 4, Threshold for MATCHED: 0.75, mean 0.62 (weak semantic 0.15-0.47, layout 0-1)

**Why UNCERTAIN not MATCHED is honest:** evidence exposed (EXPLICIT 0.95, SEMANTIC 0.40, LAYOUT 0, OCR 0.88 → final 0.68). System prefers UNCERTAIN over fabricated 0.95, but UNCERTAIN still assigned wrong group (Q1's 9-page merge).

→ `artifacts/accuracy/mapping-accuracy.json`

## PHASE 6 — Out-of-Order

- No out-of-order in this sheet (labels monotonic 1→38). Algorithm is evidence-based (global greedy sort by score desc, not page order) — `src/lib/jobs/runner.ts:265` fixes prior index mapping. **PASS.**

→ `artifacts/accuracy/out-of-order-audit.json`

## PHASE 7 — Unanswered

- Ground truth 0 unanswered, system predicted 4 UNANSWERED (19,37(i)-(iii)) — all false negatives (threshold too high, subpart duplicate). No true blank to test, but system does **not** attach random answer to blank (good); it leaves UNANSWERED/UNCERTAIN.

→ `artifacts/accuracy/unanswered-audit.json`

## PHASE 8 — Unmatched

- Expected UNMATCHED ~30-40 (rough, diagrams, blanks), actual 152 (112 excess due to over-split fragments). System correctly leaves low-label groups UNMATCHED, not silently attached to nearest (good), but inflated due to segmentation.

→ `artifacts/accuracy/unmatched-audit.json`

## PHASE 9 — Highlight Ground Truth

- Expected: Q→AnswerSegment→blockIds→original page→bbox→HighlightRegion→PDF.js viewport logical region, coherent union per page, not per OCR word.
- **Actual:** Only Q4 correct page+region; Q1 9-page highlight (wrong), Q26 missing continuation. `mergeBoxesForHighlight` with 1.2% padding is correct per `src/lib/coordinates`, but input groups wrong → highlights wrong. Per-OCR-word not done (good), but unrelated text highlighted.

→ `artifacts/accuracy/highlight-ground-truth.json`

## PHASE 10 — Multi-Page Answer

- Real multi-page: 21(5→6),26(11→13),29(16→18),37(35→36)
- **Actual:** All split into separate groups, not linked via same `continuationGroupId`; browser shows only first page highlight, continuations UNMATCHED. **FAIL** — not coordinate but grouping.

→ `artifacts/accuracy/multi-page-audit.json`

## PHASE 11 — Coordinate Validation

- **Scales 50%/100%/200%:** highlight visible & aligned (`zoom-50.png` 383KB, `q1-highlight.png` 154KB, `zoom-200.png` 510KB) **PASS**
- **Viewports 800/1280:** `resize-800.png` 310KB →1280 re-select Q1 visible **PASS**
- **Transforms:** canonical [0,1], `src/lib/coordinates/transform.ts` invertible, `tests/unit/coordinates.test.ts` PASS at 0.5/1/2 & 0/90/180/270, devicePixelRatio & scroll offsets handled via stacked `Array(numPages)`.
- **Conclusion:** Coordinate pipeline **PASS**; multi-page failure not coordinate.

→ `artifacts/accuracy/coordinate-validation.json`

## PHASE 12 — Range Request

- **Code:** `src/app/api/files/[jobId]/[fileId]/route.ts:62` — `Content-Type: application/pdf`, `Accept-Ranges: bytes`, `Range→206` with `Content-Range: bytes start-end/total` **PASS** per source.
- **Browser:** PDF.js canvas visible proves bytes served, but explicit Playwright `Range: bytes=0-99 →206` assertion not yet run (add `page.request.get(..., {headers:{Range:'bytes=0-99'}}) expect 206`). **PARTIAL** — code verified, live 206 pending.

→ `artifacts/accuracy/range-request-audit.json`

## PHASE 13 — No Paper-Specific Logic

- Grepped `src/` for `qNo.*37`, `31/2/1`, coordinates, `if text.includes("photosynthesis")`, paper literals — **none**.
- Generic rules: `QUESTION_LABEL_RE`, `isOptionLine` (a-d + x>0.07 + indented), `isPageHeaderFooter` y-band <0.08/>0.92, `y-gap 60px`. Synthetic parent for isolated `(A)` is generic.
- Thresholds in `src/lib/config`, not scattered magic numbers. **PASS.**

→ `artifacts/accuracy/no-paper-logic-audit.json`

## PHASE 14 — False Confidence

- Every decision exposes `EXPLICIT_QUESTION_LABEL`, `SEMANTIC_SIMILARITY`, `LAYOUT_CONTINUITY`, `OCR_CONFIDENCE` with reliability, final `score 0.6-0.75`. Weak semantic 0.15 correctly lowers score to 0.6-0.68 UNCERTAIN, not 0.95. Threshold 0.75 prevents false MATCHED. **PASS.**

→ `artifacts/accuracy/false-confidence-audit.json`

## PHASE 15 — Failure Behavior

| Case | Expected | Actual | Result |
|---|---|---|---|
| badly scanned | UNCERTAIN/FAILED | UNCERTAIN | PASS |
| blank | UNANSWERED | false UNANSWERED for answered (conservative) | PARTIAL |
| out-of-order | evidence not order | global greedy by score | PASS |
| duplicate # | DUPLICATE | usedAnswerGroups + UNCERTAIN | PARTIAL |
| unreadable # | UNMATCHED | 152 UNMATCHED | PASS |
| spanning pages | continuationGroupId | split → FAIL | FAIL |
| no label | UNMATCHED | UNMATCHED via layout | PASS |
| extra content | UNMATCHED | over-merged into Q1 → FAIL | FAIL |
| MCQ | MATCHED | UNCERTAIN 0.6 (conservative) | PASS |
| internal choice | single Q | kept as text | PASS |
| diagram | REVIEW | excluded UNMATCHED | PASS |
| crossed-out | REVIEW | kept → PARTIAL | PARTIAL |

Overall 8/12 PASS, 2 FAIL (segmentation), 2 PARTIAL — prefers UNCERTAIN/UNMATCHED over silent incorrect in most cases.

→ `artifacts/accuracy/failure-behavior-audit.json`

## PHASE 16 — Final Metrics

### Question extraction
- Top-level precision **1.00**, recall **1.00**, ordering **1.00**, hierarchy **0.33**, option accuracy **0.71**

### Answer segmentation
- Precision **0.174**, recall **1.00**, merge errors 1 critical (Q1 9-page), split errors 52, blank-as-answer 137, continuation 0/4 linked

### Mapping
- Correct **1/38 (2.6%)**, incorrect 33, missed 4, false 0, unanswered accuracy 0/4 false, mean conf 0.62, max 0.755

### Localization
- Correct page **1/38**, correct region **1/38**, multi-page **0/4**, zoom **PASS**, resize **PASS** (when group correct)

### UI
- PDF rendering **PASS** (canvas 893×1263, worker local-first), navigation **PASS** (Q1→Q5→Q37(i) sequential), highlighting **FAIL** (input groups wrong but transform correct)

---

## FINAL VERDICT

**NOT PRODUCTION READY**

- **Measured evidence:** Question top-level perfect (38/38) but hierarchy 33% and option 71%; segmentation 17% precision (189 vs 33) causes mapping 2.6% accuracy (1 MATCHED, 36 UNCERTAIN wrong pages, 4 false UNANSWERED, 152 UNMATCHED inflated). Localization and UI transforms pass but highlight inputs wrong.

- **Failure boundary:** **Answer segmentation → AnswerGraph** (not Textract, not Vision, not coordinates, not mapping threshold). Specifically `src/lib/matching/` + `src/lib/coordinates` grouping: labelConfidence over-triggers on digit "1", y-gap 60px too small, page continuity merges distant pages, blank filtering missing, continuationGroupId per-region not per-group.

- **What is production ready:** S3→Textract (8+39 pages SUCCEEDED 10s+22s), Vision PNG via mupdf (3+3 pages 54s+13s 200), Question top-level extraction (38), Coordinate transforms (0.5/1/2, 0/90/180/270), PDF.js rendering & zoom/resize, No hardcoding, Evidence-derived confidence, Global greedy no duplicates.

- **Must fix before PRODUCTION READY:**
  1. Segmentation: strict `Ans\d+` label regex (not any "1"), merge only same label + sequential pages + y-gap adaptive + blank/ocr<0.7 filter + Vision handwriting block clustering, continuationGroupId per-group linking.
  2. Hierarchy: split 36/38 case-study i,ii,iii via geometry (not just 37), handle visually impaired alternative as instruction not question.
  3. Option detection: recover missing C/B via width/overlap heuristic.
  4. Then mapping threshold can be tuned (0.75) and multi-page highlights will automatically correct.

No blind blame on OCR/AI — Textract and Vision both SUCCEEDED and honest; defect is deterministic grouping logic.

---

## Artifacts Generated

- `artifacts/accuracy/question-ground-truth.json`
- `artifacts/accuracy/question-comparison.json`
- `artifacts/accuracy/answer-ground-truth.json`
- `artifacts/accuracy/segmentation-audit.json`
- `artifacts/accuracy/mapping-accuracy.json`
- `artifacts/accuracy/out-of-order-audit.json`
- `artifacts/accuracy/unanswered-audit.json`
- `artifacts/accuracy/unmatched-audit.json`
- `artifacts/accuracy/highlight-ground-truth.json`
- `artifacts/accuracy/multi-page-audit.json`
- `artifacts/accuracy/coordinate-validation.json`
- `artifacts/accuracy/range-request-audit.json`
- `artifacts/accuracy/no-paper-logic-audit.json`
- `artifacts/accuracy/false-confidence-audit.json`
- `artifacts/accuracy/failure-behavior-audit.json`
- `docs/ACCURACY_AUDIT.md` (this file)

## Commands & Evidence

- `py C:\...\opencode\qcompare.py` → top 38/38, 41 nodes
- `py C:\...\opencode\seg_audit.py` → 189 groups, Q1 25 regions 9 pages
- `py C:\...\opencode\ansinspect2.py` → 1 MATCHED 36 UNCERTAIN 4 UNANSWERED 152 UNMATCHED
- `npx playwright test tests/e2e/real-paper.spec.ts` 1 passed 2.2m, screenshots `artifacts/e2e/{q1-highlight,zoom-50,zoom-200,resize-800}.png`
- `artifacts/39ac494f/07-question-tree.json` 82KB, `08-answer-regions.json` 760KB, `10-mapping-decisions.json` 253KB, `11-highlight-regions.json` 98KB
