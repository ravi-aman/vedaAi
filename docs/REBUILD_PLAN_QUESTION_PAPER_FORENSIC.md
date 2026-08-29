# REBUILD PLAN — Question Paper Structure + Vision + OCR Fusion (Forensic Rebuild)

**Date:** 2026-08-29  
**Trigger:** Real run `948874eb` (PaddleOCR) produced `questions_parsed=61 topLevel=44` vs ground truth `33` (Document says “This question paper contains 33 questions” → Sections A 1-16, B 17-21, C 22-28, D 29-30, E 31-33). UI shows garbage `4(i)…4(x),4(m)` and garbled text.
**Status:** STOP — do not patch regex, do not hardcode 33.

**Hard Constraints (must hold for every phase):**

1. Geometry thresholds (`x<0.14`, `x>0.12`, `x>0.84` etc.) are **soft evidence only** — never independently classify as QUESTION/SUBPART/OPTION/INSTRUCTION.
2. No hard-coded rules like `Roman >8 invalid` or paper-specific assumptions. Only generic, document-derived logic.
3. Document model is **hierarchical and global**: `Document → Sections → Questions → Subparts/Options/OR/Continuations`.
4. **Page-level analysis first**, then **global document-level reconciliation/sequence pass** (not bag-of-lines sorted).
5. Vision is **real structural-analysis source** (not transcription fallback) — must classify `QUESTION, SUBPART, OPTION, INSTRUCTION, HEADER, FOOTER, INTERNAL_CHOICE, DIAGRAM, CONTINUATION`.
6. Vision observations **reference PaddleOCR block IDs** wherever possible (`blockIds: ["ocr-p006-b31"]`).
7. **Final geometry MUST come from real PaddleOCR/source geometry** when blocks exist — Vision never invents highlight coordinates.
8. OCR text remains `rawOCRText, normalizedText, visualText, confidence, sourceBlockIds` with provenance.
9. Structure engine uses **evidence aggregation** (weighted `OCR_PATTERN + GEOMETRY + VISION + SECTION + SEQUENCE`) — never single regex/threshold decision.
10. This paper’s `33` is **validation ground truth only**, never production logic.
11. **Validator must fail** if structural corruption detected (instruction-as-question, option-as-question, Roman-root explosion, duplicate roots, major regression) — never `golden_validation_pass` on 44 top.
12. **Do not tune mapping** until QuestionTree and AnswerGraph are independently validated.
13. **Do not tune highlight** until mapping is independently validated.
14. **Keep existing UI unchanged** — only fix underlying data/model/navigation/highlight behavior.
15. After every major stage, **inspectable artifacts** with `input, output, evidence, confidence, sourceBlockIds, page, coordinates`.
16. Do not claim “fixed” unless **fresh real-document run** proves it.
17. After implementation, **run complete pipeline on actual 27-page Physics + 31-page handwritten sheet**.
18. Final report must **compare previous failure vs new result vs remaining errors + exact root cause**.

---

## 1. Current Failure Audit (Why 44 ≠ 33)

**Evidence from `948874eb`:**
- `persist/result-948874eb.json` → 45 questions after dedupe (26 top, 19 sub), but earlier run `49661e1d` (Textract) gave 61→44. Paddle run `948874eb` actually 45→26 after our dedupe, but still wrong.
- First question `normalizedNumber=4` with text `44 33 4 :` + children `(i)-(x)` are **General Instructions** (page 003 raw: “This question paper contains 33 questions… (i) … (x)”). PaddleOCR on page 002 was garbled `BX # 4: (i) 3 31 (ii) 4 qUc…` — parser treated instruction list as Q4 with 10 subparts.
- Real Q1 `1. A metal sheet is inserted…` on page 005 (`rec_texts` shows `SECTION A` + `1.` correctly) was missed because `detectLabel` rejected due to `x>0.14` or `isSectionOrInstruction` misfire, and `expectedTopLevelSet` from instructions was polluted by garbled `4`.
- MCQ `5. 14 cm 4 A` garbled (`0�019 Am2`) but structure still has `isOptionLine` `a-d` at `x>0.07` — works for some, but many options missed when Paddle splits ` (A)` across lines.
- Vision was `skipped_no_provider` (should be `auto` with `OPENROUTER_API_KEY`), so no Vision structural evidence to disambiguate garbled labels. Fusion got `VISION_FAILED`, parser fell back to OCR-only.

**Root causes (not regex threshold):**
1. **No document model** — parser is bag-of-lines, not `Document → Sections → Questions → Subparts → Options → OR`. No Section A-E context to constrain `1-16`, `17-21`, etc.
2. **Instruction vs question not distinguished visually** — relies on `INSTRUCTION_PHRASES` regex, fails on garbled Paddle text (`44 33 4 :` not matching `question paper contains`).
3. **Label detection geometry too weak** — `x<0.14` for Q, `x>0.07` for options, but Paddle boxes shift 0.02-0.05 due to 1.5x render, and multi-column detection `leftRatio/rightRatio` misfires on 27p (some pages two-column, some single).
4. **Vision not asked structurally** — `analyzeDocumentStructure` prompt is “transcribe”, not “identify sections/questions/subparts/options/OR with blockIds”. Even when Vision runs, it returns `regionType:title` not `type`, causing `MODEL_OUTPUT_INVALID`.
5. **Sequence solver missing** — no global `Q1→Q33` increment check; dedupe merges by `normalizedNumber` but allows `4(x),4(m)` as new roots.
6. **OCR garbage not isolated** — `rawOCRText` thrown away, `normalizedText` is just raw, no `visionInterpretation` fallback for math.

---

## 2. Plan — Forensic Rebuild (No Hardcode, No Regex Patch)

### Phase 0: STOP
- Freeze `question-parser.ts:406` (769 lines), `answer-segmentation.ts:226`. No threshold tuning.
- Create branch `fix/question-paper-document-model`.

### Phase 1: Render & Inspect Ground Truth (2 days)
- Use `src/lib/documents/render.ts:14` `renderPdfPagesForVision` (mupdf 1.5x) to render **all 27 pages** to `artifacts/<jobId>/question-paper-debug/page-001.png … 027.png` (same as `paddle-images` but for Vision).
- For each page, dump `page-001.json` with: `pageNumber, width,height, rotation, renderScale 1.5, ocr: {lines, polys, scores, bboxes [0,1]}, vision: null` (vision filled later).
- Manually inspect 5 critical pages: 002 (cover), 003 (General Instructions), 005 (SECTION A Q1), 010 (Q8-9), 014 (Q29-30 case study). Compare image vs Paddle `rec_texts` vs Textract old.

### Phase 2: Page-Level Forensic Artifact (Mandatory)
- Extend `src/lib/jobs/runner.ts:885` `fusionStage` to write `artifacts/<jobId>/question-paper-debug/page-###.json`:
```json
{
  "page": 6,
  "image": "page-006.png 893x1263",
  "ocr": [{"id":"ocr-p006-b31","text":"5.","bbox":[0.09,0.13,0.02,0.02],"poly":[[...]],"conf":0.92}, ...],
  "vision": {"sections":[{"label":"Section A","blockIds":["ocr-p005-b02"]}], "questions":[{"label":"1","blockIds":["ocr-p005-b05"],"type":"MCQ"}], "options":[{"label":"A","blockIds":["ocr-p005-b06"]}], "instructions":["..."]},
  "candidates": {"questions":[{"raw":"5","x":0.09,"y":0.13,"conf":0.52,"signals":[pattern,x,y,vision]}], "subparts":[{"raw":"(a)"}], "options":[{"raw":"(A)"}], "sections":[{"raw":"SECTION A"}]},
  "finalInterpretation": {"questionIds":["1","2","3"], "evidence": [...]}
}
```
- One JSON per page, 27 files, inspectable.

### Phase 3: Document Model (New File `src/lib/structure/document-model.ts` — Constraints 3,4,15)
- Define **hierarchical global** `DocumentStructure { sections: Section[] }`, `Section { label:"A", range:[1,16], pageStart, questions: QuestionCandidate[] }`, `QuestionCandidate { rawOCRText, normalizedText, visualText, confidence, sourceBlockIds, page, bbox (from PaddleOCR — Constraint 7), type: "QUESTION|SUBPART|OPTION|INSTRUCTION|HEADER|FOOTER|INTERNAL_CHOICE|DIAGRAM|CONTINUATION", parentCandidate, evidence[] }` (Constraint 8).
- **Page-level first**: each page produces `candidates` (questions/subparts/options/sections) with soft evidence. **Then global reconciliation**: `Document → Sections → Questions → Subparts/Options/OR` (Constraint 3,4).
- No hardcode 33; range derived from Vision `documentStructureHints` + OCR `sectionRange` regex `/Section\s+([A-E]).*?(\d+)\s*to\s*(\d+)/` generic — used as **soft evidence** in sequence solver, validation ground truth only (Constraint 10). Every stage writes artifact with `input, output, evidence, confidence, sourceBlockIds, page, coordinates` (Constraint 15).

### Phase 4: Geometry-Aware Label Detection (Replace `detectLabel` — Constraints 1,2,9)
- New `src/lib/structure/label-detector.ts` — **no hard thresholds as classifiers**. All geometry (`x`, `y`, `indent` vs `medianX`, `leftMargin`, `optionIndent`, `marksColumn`) are **soft evidence signals** with weights (e.g., `leftMargin` 0.15 weight, not binary `x<0.14 → QUESTION`). No `Roman >8` rule.
- Signals (each returns `score 0..1 + evidence`):
  - `pattern` (numeric `^\d+[\.\)]` at line start, `^\(?[a-d]\)`, `^\(i+\)` — generic, not `^[1-33]$`)
  - `geometry` (soft: `x`, `y`, `indent`, `marksColumn` as evidence, never alone)
  - `proximity` (next line is question text)
  - `sectionContext` (inside Section A, expect 1-16 — soft, not hard)
  - `sequence` (neighbor `prevLabel+1` — global, not per-page)
  - `visionConfirmation` (`vision.questionCandidates` with `blockIds` — Constraint 5/6)
  - `ocrConfidence` (low conf downweights)
- Aggregation: `weighted sum 0.25*pattern +0.15*geometry +0.15*proximity +0.15*section +0.15*sequence +0.15*vision` → candidate score, not single regex. Page numbers/constants/marks filtered only when **multiple** signals agree (geometry+context+pattern), never `x>0.84` alone.

### Phase 5-7: Subparts / MCQ / OR (New `src/lib/structure/hierarchy-builder.ts` — Constraints 1,5,6,7,9)
- Subparts `(a)/(i)` only become children if **multiple evidences** agree: parent exists **+** soft indent (`x` evidence) **+** `y` proximity **+** Vision `type:SUBPART` with `blockIds` (Constraints 5,6) — never `x>0.12` alone. No `Roman >8` rule (Constraint 2).
- MCQ: group `A-D` by **evidence aggregation**: soft `x` cluster + `y` gap + `optionMarker` + Vision `visualRegions type:OPTION` with same `relatedQuestionLabel` and `blockIds`. Vision blockIds → Paddle bbox for final geometry (Constraint 7). Never `option → new top-level question`.
- OR: detect `OR` token (soft `x 0.45-0.55` + text `OR` + Vision `type:INTERNAL_CHOICE` with `blockIds`), create `INTERNAL_CHOICE` node under parent, not new top-level. All decisions via **evidence aggregation**, not single regex (Constraint 9).

### Phase 8: OCR Garbage Handling (`src/lib/structure/text-normalizer.ts` — Constraints 8,15)
- Keep **provenance** `rawOCRText, normalizedText (de-garbled `0�019 → 0.019`), visualText (Vision), confidence, sourceBlockIds` (Constraint 8). Never discard line.
- Structure engine uses evidence-weighted choice: if `rawConf <0.6` and Vision `visualText` present with high Vision conf, prefer `visualText` but keep all three + `evidence` chain. Artifact per page shows all three + `sourceBlockIds` + `coordinates` (Constraint 15).

### Phase 9-10: Vision Structurally (Fix `src/lib/vision/openrouter-vision.ts:1` — Constraints 5,6,7)
- New prompt: “**You are a document structure analyzer, not a transcriber.** Identify for this page: `QUESTION, SUBPART, OPTION, INSTRUCTION, HEADER, FOOTER, INTERNAL_CHOICE, DIAGRAM, CONTINUATION` (Constraint 5). For each, return `label, type, blockIds (match OCR block text exactly), confidence, coarseBox [0,1]`. Reference PaddleOCR block IDs wherever possible (Constraint 6).”
- Input per page: PNG base64 1.5x + OCR blocks `id,text,bbox,conf` + page metadata. Not “transcribe”.
- Output schema `VisionPageStructure` fix `normalizeRegionType` for `regionType/title` and make `type` optional with fallback to `HANDWRITING_BLOCK` (not reject).
- **Final geometry MUST come from PaddleOCR** `blockIds → bbox` lookup → `QuestionRegion` — Vision never invents highlight coordinates (Constraint 7).

### Phase 11: Fusion (`src/lib/vision/fusion.ts:22` New `src/lib/fusion/question-fusion.ts` — Constraints 6,7,8,9,15)
- For each candidate, build `CanonicalQuestionCandidate { candidateType, normalizedLabel, parent, sourceBlockIds, page, bbox (from OCR — Constraint 7), rawOCRText, normalizedText, visualText, confidence, evidence[] }` (Constraint 8).
- **Evidence aggregation** (Constraint 9): `OCR_PATTERN, OCR_GEOMETRY (soft), VISION_LABEL, VISION_BLOCKIDS (Constraint 6), SECTION_CONTEXT, SEQUENCE` weighted `0.4*ocrConf +0.4*visionConf +0.2*geometry`. No single threshold decides. Artifact per candidate shows `input (OCR+Vision), output, evidence, confidence, sourceBlockIds, page, coordinates` (Constraint 15).

### Phase 12: Sequence Solver (`src/lib/structure/sequence-solver.ts` — Constraints 2,3,4,10)
- **Global document-level** pass after page-level candidates (Constraint 4): `Document → Sections → Questions → Subparts` (Constraint 3). Generic `Q1→Qn` increment, allow gaps, subparts `1 → (a) → (i)`. If `Q4 4(i) 4(ii) 5` then `4` with children `i,ii`, next `5`. **No hard `Roman >8`**: `4(x)` with weak evidence becomes `OCR_ERROR` via low aggregated score + no Vision `SUBPART` + no parent, not via `x>8` rule (Constraint 2).
- Use `prevLabel+1` expected as **soft evidence** (not hard), downweight if far from expected unless Vision confirms. For validation only, compare max `n` to document’s explicit `33` (Constraint 10) — never hardcode 33 in solver.

### Phase 14-15: Ground-Truth Validation (Not Hardcode — Constraints 10,11,15)
- After solver, check `topLevel` contiguous `1..n` with `n` derived from max label (e.g., 33). For THIS paper, **validation ground truth 33** (Constraint 10) — if `n=33` and we get `26`, flag missing `[1,2,3...]` as **structural corruption**.
- **Validator must fail** if `instruction-as-question` (`4(i)` from page 003), `option-as-question` (`A` as top), `Roman-root explosion` (`i,ii`), `duplicate roots` (`20,20`), `major regression` — never `golden_validation_pass` on 44 top (Constraint 11). Artifact `07-question-tree.json` with `input, output, evidence, confidence, sourceBlockIds, page, coordinates` (Constraint 15).

### Phase 16-19: Answer Sheet (Separate — Constraints 5,6,7,8,9,15)
- New `src/lib/structure/answer-graph-builder.ts` (not qp logic). Inputs: Paddle geometry (soft) + Vision handwriting grouping (Constraint 5: Vision classifies `HANDWRITING_BLOCK, DIAGRAM, CONTINUATION`). Vision must not be skipped: fix `router.ts:5` + `visionStage` to ensure handwriting pages always invoke Vision (not `VISION_NOT_INVOKED` because OCR returned text).
- Fix Vision schema `provider.ts:29` for `content:null` and missing `type` → `HANDWRITING_BLOCK` not reject. Vision refs `blockIds` (Constraint 6), final geometry from Paddle (Constraint 7), keep `raw/normalized/visual` (Constraint 8), evidence aggregation (Constraint 9). Artifacts per stage `input, output, evidence, confidence, blockIds, page, coordinates` (Constraint 15).

### Phase 20-23: Validation (New `src/lib/validation/structure-validator.ts` — Constraints 9,10,11,12,13)
- Replace `golden_validation_pass`. New validator via **evidence aggregation** (Constraint 9): checks `topLevel explosion`, `duplicate roots`, `roman as root` (generic `type:SUBPART as root` not `>8`), `option as root`, `instruction as question`, `page-number as question`, `regression`. **Must fail** if any corruption (Constraint 11) — use document-derived invariants, validation ground truth 33 only to flag missing (Constraint 10).
- **Order:** Do not tune mapping until QuestionTree and AnswerGraph independently validated (Constraint 12). Do not tune highlight until mapping validated (Constraint 13). Keep UI unchanged (Constraint 14) — only fix data/model/navigation/highlight.

### Phase 25-26: Trace & Highlight (Constraints 7,13,14,15)
- Every `QuestionNode` → `fusion candidate → Vision obs → OCR blockIds → coordinates → page image` (Constraint 7). Artifacts `06-question-candidates`, `07-tree`, `08-answer-regions`, `09-mapping-candidates`, `10-decisions`, `11-highlights` all with `input, output, evidence, confidence, sourceBlockIds, page, coordinates` (Constraint 15).
- **Highlight only after mapping validated** (Constraint 13), keep UI unchanged (Constraint 14) — `Question → MappingDecision → AnswerGroup → source OCR boxes → merge per page → normalized bbox → PDF.js`.

### Phase 27: Performance
- Profile: Python import 4.6s, init 1.5s, per-page 1.5-3.7s (80s for 27p). Optimize: reuse worker (already), avoid re-render (use same PNG for OCR+Vision), bounded parallelism 2 workers (peak 2.5GB, acceptable on 16GB), avoid PP-Structure `PP-DocLayout` (already disabled).

### Phase 28: Staged Vision
- QP: Paddle all pages → deterministic candidates → Vision on ambiguous pages only (where `candidateScore <0.7` or `instruction vs question` ambiguous). Document cost/latency. AS: Vision on handwriting pages (all 31, but batch 3 at a time, 90s timeout).

### Phase 29-33: New Real Test & Acceptance (Constraints 16,17,18)
- New job `new-uuid` (delete stale), run **REAL QP (27p) + REAL AS (31p) from scratch** (Constraint 17), require logs `provider=paddleocr` never `tesseract/surya`, `vision request` with images, `questionCandidateCount`, `questionTreeCount`, `topLevelCount=33` (validation), no `4(i)` garbage, no Roman/option roots.
- **Do not claim “fixed” unless fresh real-document run proves** `REAL QP → CORRECT DOCUMENT MODEL → CORRECT TREE → REAL AS → CORRECT GRAPH → CORRECT MAPPING → CORRECT PAGE → CORRECT REGION → CORRECT HIGHLIGHT` (Constraints 16,18). Final report must compare `previous failure (44 top, 4(i) garbage)` vs `new result` vs `remaining errors + exact root cause` (Constraint 18). Do not stop at unit tests/build/schema (Constraint 18).

---

## 3. Test Plan

- **Unit:** `label-detector.test.ts` (geometry signals), `hierarchy-builder.test.ts` (Q31→(a)/OR/(b)), `sequence-solver.test.ts` (Q4+i,ii → not 4 roots), `text-normalizer.test.ts` (0�019 → 0.019).
- **Integration:** `question-paper-debug.test.ts` (render 27 pages → Paddle → Vision → fusion → 33 top).
- **E2E:** `npx playwright test` on `results/<newJobId>` → click Q1, Q5 MCQ (options visible not as questions), Q29 case study, zoom 50/100/200, resize, rapid 7→8→9.

## 4. Risks

- PaddleOCR physics symbols still garbled → mitigated by `visualText` fallback.
- Vision model may return `regionType` not `type` → fixed via `normalizeRegionType` + `z.any` fallback for optional.
- 80s OCR too slow → staged Vision + reuse worker mitigates, not accuracy.

## 5. Exit Criteria

- `topLevel = 33` (1..33 no dup, no fake 4, no Roman/option roots) for THIS paper, but algorithm generic (next paper with different count must also work).
- `artifacts/<jobId>/question-paper-debug/page-###.json` 27 files.
- `npm run lint/typecheck/test/build` pass, `npx tsx scripts/run_real_job.ts` with new job shows `questionTreeCount 33`, `topLevelCount 33`, 0 `4(i)` garbage.

---

## 6. Next Step (Build Mode)

1. `git checkout -b fix/question-paper-document-model`
2. Implement `document-model.ts`, `label-detector.ts`, `hierarchy-builder.ts`, `sequence-solver.ts`, `question-fusion.ts`, fix `openrouter-vision.ts` prompt + `provider.ts` schema.
3. Run `npx tsx scripts/render-all-pages.ts` to generate `question-paper-debug` artifacts for 27 pages.
4. New real job, verify `07-question-tree.json` 33 top, then answer sheet, mapping, highlights, Playwright.

**Requires:** `OPENCODE_DEFAULT_MODEL`, `OPENCODE_API_KEY`, `OPENCODE_API_BASE` not needed; `OPENROUTER_API_KEY` for Vision.

