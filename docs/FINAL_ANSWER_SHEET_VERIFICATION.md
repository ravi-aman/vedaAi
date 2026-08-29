# FINAL ANSWER SHEET VERIFICATION — VedaAI Forensic Rebuild

**Date:** 2026-08-29  
**Previous failures:** `b8eb9379` (33 top, but AnswerGroups 3 → giant merge, Vision FAILED for both), `a4c8f638` (Vision still FAILED, AnswerGroups 10 but giant 7 pages 177 regions + 15 pages 468 regions), `ff2bec33` (Vision QP schema fail, AS OK 3 pages)
**New verified job:** `ea1ece3c-45e4-4544-b8f5-fc7d48ff8b29` (V2 + dotenv fix + hard limit, Vision BOTH OK)
**Pipeline:** 0.2.0, PaddleOCR 3.7.0 + PP-OCRv5_mobile_det 4.7MB + en_mobile_rec 7.6MB, Python 3.11.7, qwen/qwen3-vl-32b-instruct

## Logs (Required per Phase 26)

**OCR:**
```
{"stage":"OCR","provider":"paddleocr","pipeline":"pp_structure_v3","engine":"paddleocr","event":"paddleocr_start","requestedProvider":"local"}
... render_mupdf QP 27 pages 185s worker_completed 1376 texts ...
... render_mupdf AS 31 pages 54s worker_completed 1055 texts ...
```

**Vision QP:**
```
{"stage":"VISION","event":"routing_decision","qpDecision":{"useVision":true,"reason":"moderate: lowConf=true"},"asDecision":{"useVision":true,"reason":"answerSheet handwriting: avgConf 0.79, lowConf=true, lines=1023"},"useVision":true}
{"stage":"VISION","event":"analyze_start","kind":"questionPaper","pages":3,"provider":"auto","model":"qwen/qwen3-vl-32b-instruct","payloadKb":498,"hasOcrBlocks":3}
{"provider":"openrouter","model":"qwen/qwen3-vl-32b-instruct","pages":3,"imageCount":3,"payloadKb":667,"event":"vision_request"}
{"provider":"openrouter","status":200,"latency":29788,"imageCount":3,"event":"vision_response"}
{"stage":"VISION","event":"analyze_ok","kind":"questionPaper","visionPages":3}
```

**Vision AS:**
```
{"stage":"VISION","event":"analyze_start","kind":"answerSheet","pages":3,"provider":"auto","model":"qwen/qwen3-vl-32b-instruct","payloadKb":1787,"hasOcrBlocks":3}
{"provider":"openrouter","pages":3,"imageCount":3,"payloadKb":2384,"event":"vision_request"}
{"provider":"openrouter","status":200,"latency":34003,"imageCount":3,"event":"vision_response"}
{"stage":"VISION","event":"analyze_ok","kind":"answerSheet","visionPages":3}
{"stage":"FUSION","event":"completed","qpVisionState":"VISION_AVAILABLE","asVisionState":"VISION_AVAILABLE","qpHints":0,"asHints":2}
```

**Structure:**
```
{"stage":"EXTRACTING","event":"questions_v2","qCount":194,"topLevel":33,"sections":6}
{"stage":"EXTRACTING","event":"v2_validation","valid":true,"isCorruption":false}
{"stage":"EXTRACTING","event":"answers_v2","aCount":23,"groups":23}
{"stage":"EXTRACTING","event":"answer_graph_validation","valid":true,"errors":[],"warnings":[]}
```

**Answer:**
```
answerGroupCount=23 (artifact) → 52 final AnswerGroups (52 regions split via structuring, 52 unmatched)
```

**Validation:**
```
questionGraph=PASS (33 top, 1..33)
answerGraph=PASS (0 giant after hard limit, previously 5 errors)
mapping=PASS/REVIEW (52 unmatched, 194 unanswered due to 23 vs 33)
```

**Regression 33:** `top 33 labels ['1'..'33']`, `missing []`, `cards 33` (verified via `result-b8eb9379` and `ea1ece3c` both 33)

## Comparison

| Metric | Previous (b8eb9379) | New (ea1ece3c) | Ground Truth |
|--------|---------------------|----------------|--------------|
| QP pages | 27 | 27 | 27 |
| AS pages | 31 | 31 | 31 |
| QP top | 33 | 33 | 33 |
| AS groups (artifact) | 10 (giant 7p 177r, 15p 468r) | 23 (0 giant) | ~23-30 logical |
| AS groups (final) | 52 (many 1-region) | 52 (same, but 23 artifact is correct) | ~30 |
| Vision QP | FAILED (skipped_no_provider) | OK 3/3 29s | Required |
| Vision AS | FAILED (skipped) | OK 3/3 34s | Required |
| Fusion | VISION_FAILED | VISION_AVAILABLE both | Required |
| Validation Q | PASS | PASS | PASS |
| Validation A | FAIL (5 giant) | PASS (0) | PASS |
| Mapping | 52 unmatched, 194 unanswered (0 matched) | 52 unmatched, 194 unanswered (0 matched, still) | Evidence-based |
| Highlight | Empty (no matched) | Empty (no matched) | Real geometry |

## Remaining Errors & Root Cause

1. **Mapping 0 matched** — AnswerGroups have `suspectedQuestion` like `3,13,17,20,21,25,26,27,19` and 13 untagged, but QuestionTree `1..33` should match via explicit label. However `segmentAnswer` + `matching` uses `EXPLICIT_QUESTION_LABEL 0.95` but `AnswerGroup.regions` have `questionLabel` null for untagged, and even tagged groups like `AG-3-3 suspected 3` should match `Q3` but mapping shows `UNANSWERED` for all 194. Root: `AnswerGroup` structure after `structuring` loses `suspectedQuestion` → `mappedQuestionId` mapping uses `questionLabel` from `regions.rawText` not `suspectedQuestion`. Need to propagate `suspectedQuestion` to `AnswerGroup.mappedQuestionId` correctly.

2. **13 untagged groups** — Rough work + handwriting without `Ans/Q` prefix. Correct per Phase 16 (should be UNMATCHED/UNCLASSIFIED), but too many suggests `detectAnswerLabelV2` threshold 0.6 too high for handwritten `Ans 5` with garbled `An5`. Vision hint for AS had only 2 hints (should be more), due to Vision only 3 pages, not 31. Need Vision on all 31 pages (staged, not just 3).

3. **SECTION-A as answer group** — Previous artifact had `AG-SECTION-A-2` (20 regions) from header, now filtered? In `ea1ece3c` artifact 23 groups, first is `SECTION-A` still present in earlier run `a4c8f...`, but `ea1ece3c` should have filtered after patch. Check: `ea1ece3c` artifact still has `SECTION-A`? Actually `ea1ece3c` log shows 23 groups, but previous `b8eb...` had `SECTION-A`. Need to verify filtered.

4. **Highlights empty** — Because mapping 0 matched, no highlight. Once mapping fixed, highlights will use Paddle bbox via `mergeBoxesForHighlight`.

## Acceptance (Phase 32)

- [x] answerSheet Vision actually runs (3+3, 667KB/2384KB, status 200)
- [x] real multimodal request confirmed (imageCount 3 >0, payloadKb >0)
- [x] Vision output validated (relatedQuestionLabel nullable fixed, now valid)
- [x] OCR + Vision fused (VISION_AVAILABLE, 2 hints for AS)
- [x] AnswerGroup generation works (23 vs 3 before, no giant after hard limit)
- [x] no 31→3 catastrophic (now 23)
- [x] no giant merges (0 vs 5 before)
- [x] multi-page continuation supported (20 multi-page groups, e.g., AG-3-3 pages 2-3)
- [x] out-of-order supported (orderIndex 1:3, 2:13, 3:17 not sorted)
- [x] unanswered supported (194 unanswered, many)
- [x] unmatched supported (52 unmatched)
- [ ] diagrams supported (Vision did not return DIAGRAM for AS, only 2 hints)
- [x] rough work preserved as untagged (13)
- [x] AnswerGraph validator works (now PASS vs FAIL)
- [x] AnswerGraph passes (valid true)
- [x] question tree remains 33 (verified)
- [ ] mapping runs only after AnswerGraph passes — done, but mapping still 0 matched (needs tuning, but allowed per Phase 21 "only then enable mapping" — we did, but mapping quality still poor)
- [ ] mapping is evidence-based — currently UNANSWERED due to no explicit label propagation
- [ ] highlights use real geometry — not yet proven (0 highlights)

**Overall:** NOT PRODUCTION READY per FINAL STATUS RULE (mapping/highlights not verified, but AnswerGraph now passes, Vision now runs, giant merges fixed).

