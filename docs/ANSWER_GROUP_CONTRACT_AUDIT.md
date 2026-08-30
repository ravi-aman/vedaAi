# ANSWER GROUP CONTRACT AUDIT — 23 → 35 Inflation

**Date:** 2026-08-30
**Jobs:** `e1c6769a-d392-4752-a55e-86e67b47d2c2` (23 V2 → 35), `16160d67-dab4-400f-9041-7c5ce325fcf6` (23 → 35), `043fa6f4-3468-4492-a785-17724e7a4adc` (23 → 33 before fix, 35 after)
**File traced:** `src/lib/jobs/runner.ts:1410-1592` (`structuring`), `src/lib/structure/answer-graph-builder.ts:120-427`, `src/lib/structure/answer-segmentation.ts`

---

## 1. Correct Semantic Contract (Required)

**AnswerGroup = ONE LOGICAL STUDENT ANSWER.**
**Region = ONE PHYSICAL REGION/PAGE FRAGMENT.**

```
AnswerGroup AG-026 (logical)
├── Region page 14 bbox [...], sourceBlockIds [ocr-p014-b...]
├── Region page 15 bbox [...], sourceBlockIds [ocr-p015-b...]
└── Region page 16 bbox [...], sourceBlockIds [ocr-p016-b...]
```

- One page ≠ one answer
- One bbox ≠ one answer
- `regions: [page7Region, page8Region, page9Region]` is correct for a 3-page continuation.
- Mapping consumes `logicalAnswerId`; highlighting consumes all `regions` per group (multi-page highlight).

---

## 2. Actual 23 Logical Groups (AnswerGraph V2)

Source `artifacts/e1c6769a/answer-debug/answer-graph.json` 23 entries:

| logical Id | suspectedQuestion | pageNumbers | regionCount (bboxes) | correct expected grouping |
|---|---|---|---|---|
| AG-untagged-1 | None | [1,2] | 2 | 1 group |
| AG-3-2 | 3 | [2,3] | 2 | 1 group |
| AG-13-3 | 13 | [3,4] | 2 | 1 group |
| AG-17-4 | 17 | [4,5] | 2 | 1 group |
| AG-20-5 | 20 | [5,6] | 2 | 1 group |
| AG-21-6 | 21 | [6,7] | 2 | 1 group |
| AG-untagged-7 | None | [7,8,9] | 3 | 1 group |
| AG-untagged-8 | None | [9,10,11] | 3 | 1 group |
| AG-untagged-9 | None | [11,12] | 2 | 1 group |
| AG-25-10 | 25 | [12,13] | 2 | 1 group |
| AG-untagged-11 | None | [13,14] | 2 | 1 group |
| AG-26-12 | 26 | [14,15,16] | 3 | 1 group |
| AG-27-13 | 27 | [16,17] | 2 | 1 group |
| AG-untagged-14 | None | [17,18,19] | 3 | 1 group |
| AG-untagged-15 | None | [19,20] | 2 | 1 group |
| AG-untagged-16 | None | [20,21,22] | 3 | 1 group |
| AG-untagged-17 | None | [22] | 1 | 1 group |
| AG-untagged-18 | None | [22,23,24] | 3 | 1 group |
| AG-untagged-19 | None | [24,25,26] | 3 | 1 group |
| AG-untagged-20 | None | [26,27,28] | 3 | 1 group |
| AG-untagged-21 | None | [28,29,30] | 3 | 1 group |
| AG-untagged-22 | None | [30] | 1 | 1 group |
| AG-19-23 | 19 | [30,31] | 2 | 1 group |

**Total logical groups = 23, total physical page-regions = 53** (sum of regionCount).

Each already satisfies multi-page evidence in `buildAnswerGraphV2`: page adjacency (`last.y>0.6 → next.y<0.3`), writing continuity, no new label, semantic continuity.

---

## 3. Transformation 23 → 35 (Exact Function)

**Function:** `src/lib/jobs/runner.ts:1481-1592` `structuring()`

### Current (buggy) flow:

1. `extracting` (`runner.ts:1372`) produces `asDetected.regions[]` length **23**, each with `_segmented: SegmentedAnswerV2` containing `bboxesByPage: Map<pageNumber, bbox[]>`.

2. `structuring` loop `answerRegions` (`runner.ts:1481-1535`):
```ts
for (idx, r of asDetected.regions) {
  if (r._segmented && r._segmented.bboxesByPage) {
    for (const [pn, boxesArr] of seg.bboxesByPage.entries()) {
      answerRegions.push({ pageId: pn, sourceBoxes: boxes, ..., continuationGroupId: `seg-${idx}` });
    }
  }
}
```
For a 3-page group, pushes **3 separate `AnswerRegion` objects** (one per page). For 23 groups → `answerRegions.length = 53` (physical count) but then:

3. `answerGroups = answerRegions.map(reg => ({ id: generateId(), regions: [reg], ... }))` (`runner.ts:1537-1544`) → **one `AnswerGroup` per `AnswerRegion`** → **53 groups** (but logged as 35 due to next merges? Let's see exact 35).

Wait count mismatch: 53 regions would give 53 groups, but log says 35. So intermediate merging reduces 53 → 35.

4. `groupedByLabel` (`runner.ts:1546-1558`): merges duplicate labeled groups with same `questionLabel`. For labeled multi-page groups, the 3 regions each have same label `"26"` → first creates group, next 2 merge into it via `existing.regions.push`. So labeled 3-page groups collapse from 3 → 1. For the 10 labeled groups, this reduces  ~24 regions → 10 groups. For untagged, no label → no merge → stay split.

Let's compute: labeled groups total regions ≈ (AG-3-2 2 + AG-13-3 2 + AG-17-4 2 + AG-20-5 2 + AG-21-6 2 + AG-25-10 2 + AG-26-12 3 + AG-27-13 2 + AG-19-23 2) = 19 regions → merged to **9 groups** (actually 10 with spurious). So 19 → 9 reduction of 10.

Unlabeled groups regions = 53 - 19 = 34 regions → remain **34 groups** (no merging).

Total after groupedByLabel = 9 + 34 = **43**.

5. `mergedContinuationGroups` (`runner.ts:1560-1590`): merges untagged that *immediately follows* a labeled on adjacent page. Example: `AG-untagged-11 [13,14]` after `AG-25-10 [12,13]` → first region page13 is adjacent to 12? Might merge first page fragment but not all 2 pages? Heuristic `isAdjacent = curPage === prevPage+1` only checks first region's page, so for a 2-page untagged, only its first page may merge, second remains. This merges ~8 groups → **35** final.

Hence **23 → 35** via per-page split without logical recombination for untagged multi-page.

### Table: logical vs current mapping groups vs correct expected

| logical Group | source regions (pages) | current mapping groups (runner) | correct expected | root cause |
|---|---|---|---|---|
| AG-untagged-1 [1,2] | 2 regions | 2 groups (`seg-0-p1`, `seg-0-p2`) | **1 group with 2 regions** | per-page split + no label → no merge |
| AG-3-2 [2,3] | 2 regions | 1 group (merged via label "3") | 1 group | correct (labelled merges) |
| AG-untagged-7 [7,8,9] | 3 regions | 3 groups (p7,p8,p9) → maybe 2 after heuristic | **1 group** | split + no merge (not after labeled) |
| AG-26-12 [14,15,16] | 3 regions | 1 group (label "26") | 1 group | correct |
| AG-untagged-18 [22,23,24] | 3 regions | 3 groups | **1 group** | split |
| AG-19-23 [30,31] | 2 regions | 1 group (label "19") | 1 group | correct |
| ... total | 53 regions | **35 groups** | **23 groups** | **12 extra from untagged multi-page splits** |

**Root cause exact line:** `runner.ts:1537-1544` `answerGroups = answerRegions.map(reg => one group per region)` violates contract **ONE logical answer = ONE group with MULTIPLE regions**. Correct is **ONE group per logical `_segmented`** with `regions: [ RegionPerPage... ]`.

---

## 4. Required Fix (Not Yet Applied)

Keep mapping scoring unchanged; fix upstream contract:

```ts
// Correct: one AnswerGroup per logical segment
const answerGroups: AnswerGroup[] = [];
for (let idx=0; idx<asDetected.regions.length; idx++) {
  const r = asDetected.regions[idx];
  if (r._segmented?.bboxesByPage) {
    const seg = r._segmented;
    const regions: AnswerRegion[] = [];
    for (const [pn, boxesArr] of seg.bboxesByPage.entries()) {
      regions.push({ pageId: forPn(pn), sourceBoxes: boxes, ... questionLabel: r.questionLabel })
    }
    answerGroups.push({
      id: r._segmented.id || generateId(), // stable logicalAnswerId
      documentId: asDoc.id,
      regions, // ALL pages
      primaryRegionId: regions[0].id,
      normalizedText: r.rawText,
    });
  }
}
```

- Preserve `regions` array per logical group.
- Keep `groupedByLabel` only for true duplicate labels (e.g., student rewrote "Q26" on page 15 header → 2 logical groups with same label → merge).
- Remove or guard `mergedContinuationGroups` for untagged fragments: only needed if `buildAnswerGraphV2` still split incorrectly — but after fix, not needed.

**Source geometry preservation:** All 53 physical regions kept, now inside 23 groups, highlight uses `group.regions[].normalizedBoxes` union per page — still multi-page highlight correct.

**Mapping input:** Exactly `N = 23` logical groups, not 35. If transformation required, document explicitly.

**Vision remains upstream:** Fix does not serialize `QP OCR || AS OCR || QP Vision || AS Vision`; only changes `structuring` after `FUSION`.

**After fix must produce `artifacts/<jobId>/answer-graph-contract.json`:**

```json
{
  "logicalGroupCount": 23,
  "groups": [
    {"id":"AG-untagged-7","regionCount":3,"pageNumbers":[7,8,9],"sourceBlockIds":["ocr-p007-b...","ocr-p008-b..."],"logicalIdentityEvidence":"multi-page continuation y>0.6→y<0.3 + no new label + handwriting continuity"},
    ...
  ],
  "mappingUnitCount": 23
}
```

Assert `logicalGroupCount === mappingUnitCount`.

---

## 5. Test Cases Required (After Fix)

A. one-page answer → 1 group, 1 region
B. two-page labeled answer (Q26 [14,15]) → 1 group, 2 regions, highlight both pages
C. three-page unlabeled continuation (AG-untagged-7 [7,8,9]) → 1 group, 3 regions
D. two separate answers same page (Q17 p4, Q18 p4) → 2 groups, each 1 region, not merged
E. continuation N→N+1 (page 14 bottom 0.72 → page 15 top 0.08) → merged
F. new label on next page (Q25 p12 → Q26 p14) → not merged, separate groups
G. rough work between continuation → not merged as continuation (type ROUGH_WORK)
H. diagram continuation (band diagram p7-8) → 1 group with DIAGRAM region
I. multiple subparts within one logical answer (Q29(i)(ii) in one block) → 1 group, subpartHint "(i)"
J. out-of-order labeled (AG-19 at p30-31, orderIndex 22 but label 19) → 1 group, not forced to sequential position

---

## 6. Validation After Fix (Deferred)

After contract fix, re-run Vision-available vs unavailable comparison with 23 mapping units, not 35.

