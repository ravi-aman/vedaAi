# MAPPING RUNTIME TRACE — Answer Sheet Page → Mapping Decision

**Job:** `043fa6f4-3468-4492-a785-17724e7a4adc` (27 QP, 31 AS) + `88792ac6` (9 matched)
**Date:** 2026-08-30
**Focus:** One real answer from source image to final decision, and where evidence is lost.

---

## 1. Source Page Image → PaddleOCR + Vision (Parallel)

**Example trace: AS Page 2 (where Ans 3 lives)**

- **Shared render:** `mupdf Matrix.scale(1.5)` → PNG 893×1263 `page-002.png` in `os.tmpdir/veda-ai/{jobId}/paddle-images/answerSheet/`.
- **PaddleOCR worker** (`paddle-provider.ts`): reads `imagePath`, returns `OcrDocumentResult.pages[1].lines[]`:
  ```
  { text: "3.", bbox: {x:0.06 y:0.08 w:0.03 h:0.02} conf:0.88 }
  { text: "l0p 100 B) 5cm", bbox:{x:0.08 y:0.11 ...} conf 0.91 }
  { text: "B/3 (C) 0.196 Am²", bbox:{x:0.12 y:0.38 ...} }
  ... + many handwriting lines with heights ~0.02-0.05, medianH ~0.024
  ```
  Raw text preserved: `"3."` not normalized yet.

- **Vision batch** (pages 1,2,3 at same time, image-first `ocrBlocks:[]`):
  ```
  answerGroupHints: [{ labelHint:"3", confidence:0.88, blockIds:["ocr-p002-b..."], description:"handwriting block" }]
  visualRegions: [{ type:"HANDWRITING_BLOCK", confidence:0.9, blockIds:..., relatedQuestionLabel:"3" }]
  ```
  CoarseBox not used for highlight; blockIds ground to Paddle geometry downstream.

- **Fusion:** `fuseDocuments(asOcr, asPages, asVision)` builds Canonical, keeps `questionHintsFromVision` normalized via `normalizeNumber`, logs `VISION_AVAILABLE`.

---

## 2. Paddle Lines → AnswerRegion → AnswerGroup

**File:** `src/lib/structure/answer-graph-builder.ts:120-427` (`buildAnswerGraphV2`), also legacy `answer-segmentation.ts`

- **All lines sorted** by `y` then `x` per page, `allLines[]` with `blockId: ocr-p002-b021` etc.
- **Vision hints by page** collected: page 2 → `[{labelHint:"3", confidence:0.88}]`
- **Adaptive gap:** `medianH*1.8 = 0.043` min 0.015 → used to decide largeGap `>0.086` as possible split.
- **Label detection per line** `detectAnswerLabelV2(text,bbox,visionHints)`:
  - For `"3."` at `x 0.06`: pattern `bare with dot` `score 0.75` (since `x<0.18`), vision boost not needed, returns `{raw:"3.", normalized:"3", score:0.75, evidence:"bare with dot 3 x=0.06"}`
  - But `threshold >0.6` → strong label → `finalize()` previous group, start new `AG-3-2` with `suspectedQuestion:"3"`, `confidence 0.75`, `evidence [{type:"LABEL", score:0.75}]`.
  - For `"Ans 3"` in other pages, pattern `Ans` `0.95`; for `"21."` etc similar.
- **Body lines** (no strong label) go to `current` group. Merge decisions recorded:
  ```
  { previous:"ocr-p002-b021", next:"ocr-p002-b022", distance:0.015, samePage:true, labelEvidence:0, visionEvidence:0.5, layoutEvidence:0.5, mergeScore:0.6, decision:"MERGE" }
  ```
  Unless `largeGap + leftMargin + prevSubstantial` → SPLIT.

- **Hard limits:** if `pageCount>=4 || regions>=50` → force `finalize()` + new untagged `GIANT_SPLIT` (prevents 15p giant).

- **Continuation across pages:** `pageDelta==1 && last.y>0.6 && bbox.y<0.3` → MERGE even if new page.

- **Result for this trace:**
  ```
  AG-3-2 {
    id:"AG-3-2",
    suspectedQuestion:"3",
    normalizedLabel:"3",
    text:"3. l0p 100 B) 5cm ... (C) 0.196 ...",
    pageNumbers:[2,3],
    bboxesByPage: Map{2:[{x:0.06...},{x:0.08...}], 3:[...]},
    regions:[ {page:2 type:LABEL conf:0.75}, {page:2 BODY}, {page:3 BODY} ],
    confidence:0.82,
    orderIndex:1,
    evidence:[{type:"LABEL", score:0.75}]
  }
  ```

- **Where evidence is lost / risk:**
  - Bare `"3."` scored 0.75, but if OCR reads `"3"` without dot at `x 0.07` → bare digit path `score 0.25` → below 0.6 → treated as BODY, becomes untagged `AG-untagged-*` instead of labeled. This happened for many answers without clear `Ans` prefix or dot (e.g., AG-untagged-1 pages 1-2 starts with physics derivation without any label).
  - Untitled groups have `evidence: [{type:"UNTAGGED", score:0.4}]`, confidence 0.5 default — low.
  - Filter: untagged groups with `text<20` or `regions<2 && text<40` are dropped — fine, but many real answers are untagged and kept (13 untagged), yet mapping later fails them.

---

## 3. AnswerGroup → Structuring → AnswerRegion/AnswerGroup for Matching

**File:** `src/lib/jobs/runner.ts:1310-1493` `structuring()`

- **Inputs:** `parsedQuestions` (33), `segmentedAnswers` (23 groups)
- **qpExtracted** built with `pageRefs` resolved via `resolvePageId`, `sourceRegions` boxes, `parentNumber`, `pageNumbers`, `options`.
- **asDetected** built:
  ```
  { pageId: asPages.find(p=>p.pageNumber===2)?.id, boxes:[[x,y,w,h],...], rawText:"3. l0p...", questionLabel:"3" (via a.suspectedQuestion||normalizedLabel), labelConfidence:0.95 if label else 0.2, ... _segmented: original group }
  ```
  This is where `suspectedQuestion` plumbing was fixed (previously `a.questionLabel` → null).

- **AnswerRegion creation:** For each `asDetected.regions`, iterate `seg.bboxesByPage.entries()` → create one `AnswerRegion` per page (so multi-page AG becomes 2 AnswerRegions sharing `continuationGroupId: seg-1`). For AG-3-2: creates Reg-2a (page2) + Reg-2b (page3) both with same `orderIndex`, linked.

- **AnswerGroup final:** `answerRegions.map(reg=>{id, regions:[reg], primaryRegionId, normalizedText, mappedQuestionId: undefined})` → then groupedByLabel (merge duplicate label groups) → `finalGroups` (still 23+). Then `mergedContinuationGroups`: untagged trailing groups with `orderIndex = labeled.orderIndex+1` and adjacent page merged back into previous labeled (heuristic to avoid over-splitting).

- **Loss points:**
  - `labelConfidence` set to `0.95` if any label else `0.2` — too binary, no per-label score from `detectAnswerLabelV2` preserved. A `0.75` bare dot and `0.95` Ans both become 0.95, while untagged 0.2 loses provenance.
  - `visualConfidence` hardcoded 0.6 (not from Vision's 0.88).
  - `normalizedText` truncated not preserving raw vs normalized vs visualText triad.

---

## 4. AnswerGroup × Question → Candidate Generation & Scoring

**File:** `src/lib/jobs/runner.ts:1500-1565` `matchingStage()`

- **Loop:** For each of 33 questions `q`, for each of 23 AGs `ag`, build `evidence[]`:

  a) **EXPLICIT_QUESTION_LABEL** (reliability 3.0 or 0.4/0.6/0.9):
  - If `reg.questionLabel` exists: normalize both, compare `parsedLabel===q.normalizedNumber` → `score 0.95, rel 3.0`; elif `labelStripped===qStripped` → 0.92/2.2; elif numeric part equal but prefix diff → 0.35-0.88 etc; elif `includes` → 0.6; else `0.1 does not match 14 vs 13`.
  - Else (no label): `0.2 No explicit label, rel 0.4`.

  For AG-3-2 (`label 3`) × Q3: `parsedLabel 3 === Q3 3` → `0.95*3.0` → high.
  For AG-untagged-1 (`no label`) × any Q: `0.2*0.4` → very low, regardless of content.

  b) **SEMANTIC_SIMILARITY** (rel 0.5): Jaccard words → `inter/union`. For AG-3 text `"l0p 100 B) 5cm ∞ ... 0.196 Am"` vs Q3 stem `"A magnetic needle ... 0.019 ..."`: jaccard maybe `0.12` → `0.15 Low overlap`. For MCQ `Am²` options, Jaccard may be `0.08` → else `0.15`. Even good matches get `min(0.85, j+0.3)` → `0.42` max for 0.12. Weight 0.5 small vs explicit 3.0.

  c) **LAYOUT_CONTINUITY** (rel 0.3): `score = max(0,1 - orderDiff*0.2)`. Q3 `orderIndex 2` vs AG-3 `orderIndex 1` → diff 1 → 0.8. But vs AG-untagged many, diff large → low.

  d) **OCR_CONFIDENCE** (rel 0.4): `reg.ocrConfidence 0.82` → 0.82*0.4

  e) **VISUAL_EVIDENCE** (rel 0.6): added if `reg.regionType DIAGRAM && visualConfidence>0.6` — rarely.

  - **aggregateScore:** `weightedSum / weightSum` → For labeled match: `(0.95*3 + 0.15*0.5 + 0.8*0.3 + 0.82*0.4)/ (3+0.5+0.3+0.4+0) = (2.85+0.075+0.24+0.328)/4.2 = 3.493/4.2=0.831` → then scaled? Actually earlier report says 0.77. Depends on exact values. For untagged vs Q1 (no label, semantic 0.15, layout 0.4, ocr 0.7): `(0.2*0.4=0.08 +0.15*0.5=0.075 +0.4*0.3=0.12 +0.7*0.4=0.28)/1.6=0.555/1.6=0.347` → below `review 0.5` → UNCERTAIN (no MATCH).

- **Sorting:** `candidates.sort(score desc)`, keep `top 3` as `__topCandidates`. Example for Q3:
  ```
  cand Q3: [AG-3 score 0.771, AG-13 0.35, AG-17 0.33]
  cand Q1: [AG-untagged-1 0.47, AG-3 0.45, AG-13 0.35]
  ```

- **Loss points:**
  - Untagged answers get penalized heavily via `0.2 *0.4` small weight, but still low numerator; semantic weight 0.5 insufficient to rescue even if MCQ option matches perfectly.
  - No `SECTION_MATCH`, `SUBPART_MATCH`, `OPTION_MATCH`, `QUESTION_TYPE`, `MARKS`, `SEQUENCE` (beyond layout), `PAGE_CONTINUITY`, `DIAGRAM_COMPATIBILITY`, `VISION_CONFIDENCE`, `ANCHOR_CONSISTENCY` dimensions — only 4 types.
  - No context-sensitive weighting: MCQ should boost OPTION_MATCH+SEQUENCE+ANCHOR, long derivation should boost SEMANTIC+SUBPART+SECTION.
  - No candidate pruning: all 23×33=759 candidates scored, but no section/type impossible filter.
  - No per-candidate `visionEvidence` from Fusion answerHints (normalized label from Vision not used in scoring beyond label string).

---

## 5. Global Assignment

**File:** `runner.ts:1568-1677`

- **Sort questions by best score desc:** `sortedQuestions = questions.sort(bestScore desc)` → Q3's 0.77 first, Q13 0.77 second, ... untagged Q1's 0.47 last.
- **Greedy per question:** `decideForQuestion(topCandidates)` with thresholds `high 0.75, review 0.5, margin 0.08`:
  - If `top<0.5` → UNCERTAIN (but runner later maps `UNCERTAIN && chosen? UNCERTAIN else UNANSWERED` — so Q1 becomes UNANSWERED even though AG-untagged-1 exists and is not reused yet).
  - Else if margin<0.08 and second>=review → UNCERTAIN with extra evidence.
  - Else if top>=0.75 → MATCHED else UNCERTAIN.
- **Conflict handling:** if `chosenId` already in `usedAnswerGroups` (higher-scoring question took it), search `sorted.find(not used && score>=0.5)`. If found, re-evaluate; else downgrade to UNCERTAIN with `NEIGHBOR_CONTEXT` conflict evidence and `chosenId=undefined` (no assignment). Then `if MATCHED add to used`.
- **Final decisions sorted by original orderIndex:** push `MappingDecision` with `highlightRegions` via `mergeBoxesForHighlight` (union+pad 0.012, per page). Unmatched answers become separate decisions `questionId:"__unmatched__", status:UNMATCHED`.

- **Example trace for Q3:**
  - `topCandidates: [AG-3 0.771, AG-untagged-9 0.35, AG-23 ...]`
  - `decideForQuestion` → top 0.771 >=0.75, margin 0.77-0.35=0.42 >0.08 → MATCHED, chosen AG-3
  - `used` empty → assign, push `highlightRegions` for pages 2 & 3 (merged boxes per page)
  - Later Q1: `top 0.47 <0.5` → UNCERTAIN (no MATCH), runner maps to `UNANSWERED` with no highlight, even though AG-untagged-1 pages1-2 is a real answer with physics derivation but no label → Evidence lost → false UNANSWERED.

- **Loss points:**
  - `review 0.5` is hard threshold; untagged with 0.47 is discarded as UNANSWERED rather than REVIEW/UNCERTAIN with targeted Vision adjudication.
  - Greedy not true max-weight bipartite: higher question may steal AG that better fits lower question with similar score.
  - No subpart handling: 161 subparts in decisions cause 218 decisions for 33 top, many UNANSWERED inflated.
  - No `margin` via secondBest check for untagged (both low).
  - No representaton of `ANSWER_PRESENT` vs `QUESTION_LABEL_DETECTED` vs `ANSWER_MAPPED` — single `questionLabel` decides.

---

## 6. Localizing & Validating

- `localizing()` is passthrough.
- `validatingResult()` checks `questions.length>0`, logs impossible IDs `>100`, excessive topLevel `>60`, matchedWithNoHighlight warning, but does not validate `AnswerEvidence` provenance.

---

## 7. UI Highlight

- `Viewer` uses `highlightRegions: [{pageId, boxes:[{x,y,w,h}], confidence, source}]` → `PdfViewer` → `Viewer` → `HighlightOverlay` with `transformForDisplay(scale, rotation)` at 0.5/1/1.5/2 tested.
- For multi-page AG-3, 2 HighlightRegions correctly per page local (verified via `mapping-debug.json`). No Vision-invented bbox; all from Paddle.

---

## 8. Summary: Where Evidence Is Lost (Critical for Rebuild)

| Stage | Evidence Type | Preserved | Lost / Miscalibrated |
|---|---|---|---|
| Paddle OCR | raw text, bbox, polygon, confidence | ✓ raw preserved, bbox 0..1, conf | lost when `_segmented.bbox` not per-sourceBox provenance; `polygon` not forwarded |
| Vision | labelHint, blockIds, confidence, coarseBox | vision-hints in answer-graph via `visionHintsByPage` (weak) | Vision 0.88 for Ans 3 not used to boost 0.75→0.95; coarseBox never used (correct), but blockIds matching `v.blockIds.includes(text)` fragile via text equality not ID |
| AnswerGraph | suspectedQuestion score 0.75, evidence, mergeDecisions, bboxesByPage |✓ debug stored | `labelConfidence` collapsed to 0.95/0.2, no `labelCandidate` object with OCR+Vision+position+context scores |
| Fusion | questionHints/answerHints normalized | ✓ | hints not fed into scoring beyond label string; diagramPages not used for DIAGRAM classification |
| Structuring | `questionLabel` provenance | fixed plumbing | no `AnswerEvidence` with `rawOCRText/normalizedText/visualText/detectedLabels[]/handwritingConfidence/continuationInfo/sequencePosition/sectionHint` |
| Candidate Gen | EXPLICIT_LABEL vs SEMANTIC etc. | ✓ basic types | missing OPTION_MATCH, SECTION, QUESTION_TYPE, MARKS, PAGE_CONTINUITY, ANCHOR_CONSISTENCY etc.; weight 3.0 vs 0.5 static; MCQ semantic insufficient |
| Assignment | greedy + conflict, margin 0.08 | ✓ margin + explicit tie-break | not max-weight bipartite, not handling subparts independently, not representing REVIEW vs UNMATCHED vs UNANSWERED semantics correctly |
| Highlight | Paddle geometry union | ✓ mergeBoxesForHighlight per page | `polygon` lost, padding 0.012 fixed not calibrated per diagram/long |

**Rebuild must fix all lost rows via Phases 2-23, 37-42.**
