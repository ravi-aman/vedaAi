# ANSWER GRAPH — VedaAI Forensic Rebuild

**Date:** 2026-08-29  
**Job:** `ea1ece3c-45e4-4544-b8f5-fc7d48ff8b29` (27p QP + 31p AS, PaddleOCR 80s+55s, Vision 3+3 pages, V2 pipeline)

## INPUT
- `OcrDocumentResult` answerSheet: 31 pages, 1023 lines, 93 blocks, avgConf 0.79, dims 1263x893 @1.5x
- `DocumentPage[]` 31 pages with width/height/rotation
- `VisionDocumentAnalysis` answerSheet: 3 pages, `answerGroupHints` 2, `visualRegions` HANDWRITING_BLOCK, `relatedQuestionLabel` may be null (now nullable)

## OUTPUT
- `AnswerGraph { groups: SegmentedAnswerV2[] }` with `id, suspectedQuestion, normalizedLabel, text, pageNumbers, bboxesByPage, regions: AnswerRegionDebug[], confidence, orderIndex, evidence`
- For `ea1ece3c`: 23 groups (artifact) → 52 `AnswerGroup` (after structuring), 11 debugGroups, 0 giant (validated)

## ALGORITHM
1. **Line collection:** `OcrLine[]` sorted by y then x, stable ID `ocr-p###-b###`, adaptive gap `medianH*1.8 min 0.015`
2. **Label detection `detectAnswerLabelV2`:** Patterns `Ans 1, Answer 1, Q1, 1., 1), 1(a), 37(i)` with `x<0.18` for bare, Vision hint `labelHint` with blockIds, score 0.6 threshold for new group. Bare `1` → 0.25 (not Q1). Geometry `x` soft, not hard.
3. **Body detection:** After label, collect lines until next strong label. Use `samePage gap > adaptiveGap*2.0` with left margin + substantial check, `isPageContinuation y>0.6→y<0.3`, `currentPageCount>=4 or regions>=50` hard split (prevent 15-page 468-region giant), `visionEvidence` 0.5 if no Vision.
4. **Page locality:** Each `AnswerRegion` has `pageNumber, blockIds, bbox, type LABEL/BODY`, each `AnswerGroup` has `pageNumbers[]`, `bboxesByPage: Map<page, bbox[]>`, never `bbox covering page 3+4`.
5. **Continuation:** Merge only if `pageDelta==1 && yBottom>0.6 && yNext<0.3 && no new label && layout continuity`.
6. **Out-of-order:** Preserve `orderIndex` as document order, not sorted to question order. Mapping later resolves `Q7→AG1` etc.

## DATA STRUCTURE
```ts
SegmentedAnswerV2 {
  id: "AG-21-6",
  suspectedQuestion: "21",
  normalizedLabel: "21",
  text: "...",
  pageNumbers: [6,7],
  bboxesByPage: Map { 6: [bbox...], 7: [bbox...] },
  regions: [{pageNumber, blockIds, text, bbox, type, confidence}],
  confidence: 0.85,
  orderIndex: 5,
  evidence: [{type:"LABEL", score:0.95, explanation:"Ans 21 x=0.12"}]
}
```

## EVIDENCE
- `LABEL` (pattern + geometry + vision), `SECTION_CONTEXT` (not for AS), `SEQUENCE` (not hard), `OCR_CONFIDENCE`, `VISION_LABEL` (if Vision says `21` with blockIds), `LAYOUT_CONTINUITY` (gap, pageDelta)
- Failed `SECTION-A` as answer group removed after filter (was header)

## COORDINATES
- Normalized [0,1] via `normalizeBox` from Paddle `dt_polys` 893x1263, not Vision. `rotateBox` for 0/90/180/270.

## ERRORS
- Previous 31→3 giant merge due to `isPageContinuation` too aggressive, no hard limit, Vision absent. Fixed via `pageCount>=4 || regions>=50` split.
- Current still 13 untagged groups (rough work) — not error, expected.

## RETRIES
- Vision `withRetry` 3, `withTimeout` 90000, `analyze_failed_fallback` handled via nullable `relatedQuestionLabel`.

## ARTIFACTS
- `artifacts/<jobId>/answer-debug/answer-graph.json` (23 groups)
- `answer-debug.json` (debugGroups with mergeDecisions: distance, samePage, pageDelta, mergeScore, decision)
- `answer-validation.json` (valid true, 0 errors after fix, previously 5 GIANT errors)
- `page-###-debug.png` (31 PNGs copied from paddle-images, ground truth + overlay description in `inspection-summary.json`)
- `inspection-summary.json` (10 pages manual inspection notes)

## TESTS
- `answer-graph-builder.test.ts` (bare digit, Ans 1, Q1, continuation, out-of-order, diagram, rough, crossed-out, giant prevention, duplicate block ownership — to be added)
- Manual: clean (p002), dense (p022), label (p003), out-of-order (orderIndex), diagram (none), continuation (AG-3-3 pages 2-3), blank (p001 2 lines)
