# MAPPING REBUILD BASELINE — VedaAI Parallel OCR+Vision Architecture

**Date:** 2026-08-30
**Job Reference:** `043fa6f4-3468-4492-a785-17724e7a4adc` (27 QP + 31 AS, last stable) & `88792ac6-0f5c-46e2-a795-e332b61f77b4` (9-matched)
**Pipeline Version:** 0.2.0
**Goal:** Freeze upstream parallel architecture BEFORE mapping rebuild. Verify no serialization.

---

## 1. Upstream Parallel Architecture (MUST PRESERVE)

```
                         PARALLEL INGESTION
                                |
               ┌────────────────┼────────────────┐
               ▼                ▼                ▼
             QP OCR          QP Vision         AS OCR
               ║                ║                ║
               └────────────────┴────────────────┘
                                ║
                             AS Vision
                                ║
                                ▼
                              FUSION
                           ┌────┴────┐
                           ▼         ▼
                     QUESTION     ANSWER
                       INDEX      GRAPH
```

**Implementation proof — `src/lib/jobs/runner.ts`:**
- `renderSharedStage()` (line 680): single shared render to `os.tmpdir/veda-ai/{jobId}/paddle-images/{kind}/page-###.png` via `mupdf 1.5x` (canvas fallback). Both QP and AS rendered in `Promise.all`.
- `ocrStageWithShared()` + `visionStageWithShared()` launched as `await Promise.all([ocrPromise, visionPromise])` (line 338). Inside each:
  - `ocrStageWithShared`: `Promise.all([runDocWithRetry("questionPaper"), runDocWithRetry("answerSheet")])` with file-locked Paddle init, bounded worker concurrency 2.
  - `visionStageWithShared`: `Promise.all([processDocShared("questionPaper"), processDocShared("answerSheet")])` with boundedPool batch concurrency 2, batchSize 3, lazy base64 loading (3 images max).
- `pushTimeline` proves 4-way overlap: entries `OCR_questionPaper`, `OCR_answerSheet`, `VISION_BATCH_questionPaper`, `VISION_BATCH_answerSheet` share same `PARALLEL_OCR_VISION` window (see `artifacts/.../performance-timeline.json`).
- Vision Pass1 is image-first: `ocrBlocks: []` (line 905), no OCR dependency; OCR-assisted Vision is targeted second pass only (future).

**Measured timeline for 043fa6f4 (226s wall):**
- RENDER_SHARED 7.5s
- PARALLEL_OCR_VISION ~ 2 overlapping sub-timelines
- OCR_questionPaper / OCR_answerSheet parallel (both `in_progress` at same start)
- VISION_BATCH_* parallel (6 batches concurrent)
- `totalWallMs: 226406` vs serial would be ~ `7.5 + 199 + 363 = 569s` — saving ~60%.

**Shared rendering reuse:** Same PNG files used for OCR (`imagePath`) and Vision (`base64` lazy loaded per batch). No duplicate render.

---

## 2. QuestionTree State

- **Source:** `src/lib/structure/question-extractor-v2.ts` + `label-detector.ts` + `hierarchy-builder.ts` + `sequence-solver.ts`
- **Current counts:** 33 top-level `QUESTION` (1..33), depth 0, no duplicates, `sections: A(1-16) B(17-21) C(22-28) D(29-30) E(31-33)` (soft ranges, not hardcoded in solver)
- **Evidence per question:** `PATTERN(0.25) + GEOMETRY_X(0.15) + VISION(0.20) + SECTION_CONTEXT(0.15) + SEQUENCE(0.15) + OCR_CONF(0.10)` — weighted sum, no single hard `x<0.14` threshold.
- **Hierarchy:** `Document → Sections → Questions → Subparts/Options` e.g., Q5 has 4 options A-D, Q29 case-study has (a)(b) children, Q18 has INTERNAL_CHOICE OR.
- **Geometric provenance:** `bboxesByPage: Map<pageNumber, bbox[]>` from Paddle `dt_polys`, not Vision coarseBox.
- **Validation:** `validateQuestionStructureV2` checks 33 (validation only, not solver hardcode). Current: PASS.
- **Artifacts:** `artifacts/<jobId>/question-paper-debug/page-001..027.json` + `document-structure.json` + `v2-validation.json`

---

## 3. AnswerGraph State

- **Source:** `src/lib/structure/answer-graph-builder.ts` (V2 forensic) & legacy `answer-segmentation.ts`
- **Current counts for 043fa6f4:** 23 groups (artifact) → 33 final AnswerGroups after structuring split
  - Labels: AG-3, AG-13, AG-17, AG-20, AG-21, AG-23, AG-25, AG-26, AG-27, AG-19 (9 matched) + spurious AG-(n) + 13 untagged
  - Multi-page: 20 groups with ≥2 pages (e.g., AG-3 pages 2-3, AG-13 3-4, AG-26 14-16)
  - Out-of-order: preserved via `orderIndex` (AG-1 untagged, AG-2 label 3, etc.)
  - Hard limits: `pageCount>=4 || regions>=50` force split + giant split audit (`GIANT_SPLIT`)
  - Validation: `validateAnswerGraph` PASS (0 errors, previously 5 GIANT_*)
  - Header filtering: `isHeaderFooter` filters PAGE x of y, SECTION [A-E], For Visually Impaired, etc.
  - Label detection: `detectAnswerLabelV2` scores Ans/Q/bare-with-dot + geometry left-margin `x<0.18`, Vision hint boost 0.9
  - Continuation detection: `y>0.6 → y<0.3` across sequential pages
- **Artifacts:** `artifacts/<jobId>/answer-debug/answer-graph.json` + `answer-debug.json` + `answer-validation.json`

---

## 4. OCR State

- **Provider:** PaddleOCR `PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec` (PP-StructureV3), local `python` worker, not Textract/Tesseract/Surya
- **Parallel docs:** QP 27p, AS 31p, both in REUSE workers after provisioning, avg 1.6s/pg AS, 2.7s/pg QP, peak 1199 MB
- **Geometry:** `OcrDocumentResult.pages[].lines[].boundingBox {x,y,w,h} normalized 0..1` + `polygon` + `confidence`, plus `blocks`
- **Provenance:** raw `text` preserved, `normalizedText` via `normalizeText`, `visualText` from Vision, never overwrite raw
- **Storage:** `ocrResultStore` (in-mem) + `os.tmpdir/veda-ai/persist/result-*.json` + `debug/ocr-*.json`
- **Idempotency:** `ocrOperationId` lock prevents duplicate submit if mid-OCR

---

## 5. Vision State

- **Provider:** OpenRouter `qwen/qwen3-vl-32b-instruct` via `OpenRouterVisionProvider` (`src/lib/vision/openrouter-vision.ts`)
- **Parallel docs:** QP Vision 9 batches ×3? Actually config `VISION_MAX_PAGES=50` so QP 27 pages → 9 batches, AS 31 pages → 11 batches, `batchSize 3`, concurrency 2
- **Payload:** image-first Pass1 with empty `ocrBlocks`, ~2.7 MB/batch, latency ~30s/batch, total 363s
- **Schema:** `VisionDocumentAnalysis { pages: VisionPageStructure[] }` with `visualRegions` (type, coarseBox, blockIds), `questionCandidates`, `answerGroupHints`, validated via Zod `normalizeRegionType` (handles nullable)
- **Grounding:** Fusion logs `qpVisionState: VISION_AVAILABLE`, `asVisionState: VISION_AVAILABLE`, warnings for ungrounded labels
- **Skipped pages safety:** `fusionStage` checks `skippedSafe vs skippedUnsafe` via `avgConf>0.80 && !hasLowConf && !isMultiColumn`

---

## 6. Current Mapping Counts (Baseline BEFORE rebuild)

**For 88792ac6 (latest correctly plumbed):**
- `decisions 218 for 194 questions (33 top + 161 sub)` vs `33 AnswerGroups`
- `MATCHED 9` (Q3,13,17,19,20,21,25,26,27) @0.76-0.77 with `EXPLICIT_LABEL 0.95*3.0`
- `UNANSWERED 185` (for top 33: 24 UNANSWERED)
- `UNMATCHED 24` (extra regions)
- `highlightRegions` per MATCHED via `mergeBoxesForHighlight` union+pad 0.012 from Paddle geometry
- No duplicate answerGroup reuse (global greedy)
- `mapping-debug.json` per question: 33 entries with `questionNumber, status, answerGroupId, suspectedQuestion, confidence, evidence, candidates`

**Problem indicated by 9/33:** 24 UNANSWERED not because 24 questions truly skipped, but because mapping over-depends on explicit handwritten label. Real sheet has many untagged answers (e.g., AG-untagged-1 pages 1-2 with physics derivation, AG-untagged-7 pages 7-9 semiconductor band diagram, AG-untagged-14 pages 17-19, etc.) that contain actual answers without clear `Ans N` prefix. `no explicit label` was treated as `UNANSWERED` instead of `REVIEW/UNMATCHED` with multi-evidence inference.

---

## 7. Current Highlight Counts

- Matched: 9 with highlights (e.g., Q3 2 pages, Q26 3 pages, each merged box per page)
- Unmatched: 24 with low-confidence highlights (source `unmatched`)
- Unanswered: 0 highlights (correct)

---

## 8. Current Latency

- Total wall 226–596s depending on Vision coverage (363s Vision dominates)
- OCR 59s AS + 140s QP (parallel ~140s wall) + provisioning ~7s
- Vision 23s QP + 340s AS (parallel via 2 concurrency, 11+9 batches)
- Fusion <1s, Extracting 38ms, Structuring ~10ms, Matching <100ms, Localizing <10ms
- Target after rebuild: Mapping itself cheap (<150ms), targeted adjudication bounded (≤5 calls)

---

## 9. Current Known Errors (to fix in rebuild)

- **Mapping over-label-dependent:** `EXPLICIT_LABEL 0.2` for untagged → aggregate 0.30 < review 0.5 → UNCERTAIN/UNANSWERED even if semantic+section strong.
- **Semantic weak:** Jaccard words → 0.15 for short MCQ `A` vs full question stem.
- **Sequence not used:** `LAYOUT_CONTINUITY` via `orderDiff*0.2` alone, no anchor-based inference, no local solver.
- **No MCQ specialization:** option match not detected (`(C) 0.196 Am²` vs Q5 options).
- **No answerType classification:** DIAGRAM/MCQ vs LONG_ANSWER compatibility not checked.
- **No confidence margin beyond 0.08:** `Q23 0.72 vs Q22 0.70` → should be REVIEW not MATCHED.
- **No targeted Vision adjudication:** ambiguous cases never sent to Vision with crops.
- **No AnswerEvidence object:** single `questionLabel?: string` field, no `detectedLabels[], labelConfidence, handwritingConfidence, continuationInfo` etc.
- **No page-locality preservation in highlight beyond per-page merge:** correct but not tested for multi-page Q26 case across 14-16.
- **Untagged handling:** 13 untagged treated as rough work, some are real answers (e.g., AG-untagged-1 contains actual Q1 answer without label).
- **Hard-coded thresholds scattered:** explicit 3.0 globally, not context-sensitive for MCQ vs long.
---

## 10. Freeze Guarantee

- No file under `src/lib/ocr/`, `src/lib/vision/`, `src/lib/documents/render.ts` is modified in mapping rebuild beyond adding evidence types; 4-way promise structure `Promise.all([ocrPromise, visionPromise])` and `Promise.all([qp, as])` must remain and is verified via `performance-timeline.json` (PARALLEL_OCR_VISION with overlapping OCR_* and VISION_BATCH_* events).
- Shared render path `renderSharedStage` remains single source of PNGs.
- PaddleOCR, Vision provider, QuestionTree, AnswerGraph core segmentation logic remain unless mapping-contract issue proven (e.g., `suspectedQuestion` plumbing already fixed, not to be reverted).

*Generated by audit of `src/lib/jobs/runner.ts:320-355`, `src/lib/structure/*`, `src/lib/vision/*`, artifacts 043fa6f4 & 88792ac6.*
