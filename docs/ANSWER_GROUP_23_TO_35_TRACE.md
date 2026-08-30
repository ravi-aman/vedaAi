# 23 → 35 ANSWERGROUP TRANSFORMATION TRACE

**Date:** 2026-08-30
**Jobs:** `e1c6769a` (23 V2 groups → 35 mapping units) and `16160d67` (same)
**Question:** Why does `answers_v2: 23 groups` become `smart_mapping_start: 35 answerGroups`?

---

## Source: 23 V2 Groups (AnswerGraph)

`src/lib/structure/answer-graph-builder.ts:buildAnswerGraphV2` returns 23 `SegmentedAnswerV2`:

- 10 labeled: `AG-3-2, AG-13-3, AG-17-4, AG-20-5, AG-21-6, AG-25-10, AG-26-12, AG-27-13, AG-19-23, AG-(n)-21` (last spurious)
- 13 untagged multi/single: `AG-untagged-1 [1,2], AG-untagged-7 [7,8,9], AG-untagged-8 [9,10,11], AG-untagged-9 [11,12], AG-untagged-11 [13,14], AG-untagged-14 [17,18,19], AG-untagged-15 [19,20], AG-untagged-16 [20,21,22], AG-untagged-17 [22], AG-untagged-18 [22,23,24], AG-untagged-19 [24,25,26], AG-untagged-20 [26,27,28], AG-untagged-21 [28,29,30], AG-untagged-22 [30]`

Note: Many are multi-page (e.g., `AG-untagged-7` 3 pages, `AG-26-12` 3 pages). In V2, each group preserves `pageNumbers: [7,8,9]` and `bboxesByPage: Map<pageNumber, bbox[]>` — **single logical answer** with multi-page geometry (Phase 12,13 correct).

---

## Transformation in `src/lib/jobs/runner.ts:structuring` (and `extracting` → `structuring`)

### Step 1: `extracting` → `asDetected.regions`

```ts
// runner.ts:1372-1385
const asDetected = {
  regions: segmentedAnswers.map((a) => ({
    pageId: asPages.find(p=>p.pageNumber===a.pageNumbers[0])?.id,
    boxes: Array.from(a.bboxesByPage.values()).flat().map(...),
    rawText: a.text,
    questionLabel: a.suspectedQuestion,
    _segmented: a, // preserves original multi-page bboxes
  }))
}
```

At this point, `asDetected.regions.length` is still **23** (one per V2 group), each with `boxes` being flat union of all pages (for backward compat) and `_segmented` holding the true per-page map.

### Step 2: `structuring` → `answerRegions` (per-page split)

```ts
// runner.ts:1473-1527
const answerRegions: AnswerRegion[] = [];
for (r of asDetected.regions) {
  if (r._segmented && r._segmented.bboxesByPage) {
    for (const [pn, boxesArr] of seg.bboxesByPage.entries()) {
      // ONE REGION PER PAGE
      answerRegions.push({
        pageId: asPages.find(p=>p.pageNumber===pn)?.id,
        sourceBoxes: boxes, normalizedBoxes: boxes,
        questionLabel: r.questionLabel, // same label for all pages of this group
        continuationGroupId: `seg-${idx}`,
      });
    }
  }
}
```

For a 3-page group, this creates **3 `AnswerRegion` objects** (one per page). For 23 groups where ~12 are multi-page (average 2.1 pages), this yields:

- 11 single-page groups → 11 regions
- 12 multi-page groups (total pages = 35 - 11 = 24) → 24 regions
- **Total `answerRegions.length = 35`**

### Step 3: `answerGroups` = one group per region

```ts
const answerGroups: AnswerGroup[] = answerRegions.map(reg => ({
  id: generateId(), // new ID, not original AG ID
  regions: [reg], // single region per group
  primaryRegionId: reg.id,
  normalizedText: reg.normalizedText,
}));
```

Now **35 `AnswerGroups`**, each with exactly one `AnswerRegion` (one page). Original `AG-untagged-7` (id `AG-untagged-7`) is now 3 separate groups: `group-xyz-p7`, `group-abc-p8`, `group-def-p9`, each with new IDs, same (null) label, different page.

### Step 4: `groupedByLabel` merging (only for labeled)

```ts
const groupedByLabel = new Map();
for (g of answerGroups) {
  if (label && groupedByLabel.has(label)) {
    existing.regions.push(...g.regions); // merges multi-page labeled back to 1
  } else {
    finalGroups.push(g);
  }
}
```

- For **labeled** multi-page groups (e.g., `AG-26-12` pages 14,15,16 → 3 regions each labeled "26"), the second and third are merged into first, restoring **1 group per labeled answer** (10 labeled groups remain 10).
- For **untagged** multi-page groups (null label), `label` falsy, so **no merging** — they remain **split per page** (12 groups → ~24 groups). This is the inflation source.

### Step 5: `mergedContinuationGroups` (heuristic)

```ts
// runner.ts:1552-1582
// Only merges untagged that *immediately follows* a labeled group on adjacent page
if (!label) {
  const prev = mergedContinuationGroups[prev];
  if (prev && prev.regions[0].questionLabel) {
    if (isAdjacent || text.length <200) {
      prev.regions.push(...g.regions); // merge as continuation
      continue;
    }
  }
}
```

This merges **some** untagged splits back (e.g., `AG-untagged-11` after `AG-25-10` on page 13), but not all. In practice, only ~2-3 merges happen; most untagged multi-page splits remain.

**Result:** `mergedContinuationGroups.length = 35` (as seen in `smart_mapping_start: 35`). The count is logged as `answerGroups.length` in `matchingStage`.

---

## Is This Intentional or Accidental Duplication?

### Intentional aspects:

- **Per-page `AnswerRegion` is required for exact highlight localization** (Phase 41: `pageId` + `boxes` per page local). Splitting for `HighlightRegion` is correct.
- **But `AnswerGroup` should remain logical** (one group = one answer, even if multi-page). The current `answerGroups = answerRegions.map(reg => one group per region)` **breaks this invariant** — it turns a single logical answer (23 groups) into page-fragments (35 groups) that then compete as independent candidates in `smart_mapping`.

### Accidental duplication:

- **Yes — for untagged multi-page groups, the split is accidental duplication.** The original 23 logical answers already had correct multi-page geometry (`bboxesByPage` Map + `pageNumbers`). The structuring step should have kept **one `AnswerGroup` per logical answer with `regions: [ RegionPerPage... ]`** (multiple regions per group), not one group per region.
- Evidence: `docs/HUMAN_GROUND_TRUTH.md` says `AG-untagged-7 [7,8,9]` is **one semiconductor answer** with a band diagram spanning 3 pages. In mapping, it becomes 3 competing untagged candidates (`6df...`, `5e1d...`, `33c8...`) for Q22,23,24 — causing the `margin 0.006` tie and all three being identical candidates (see `artifacts/16160d67/mapping/Q22.json` where top 3 candidates are all untagged fragments of same original answer). This inflates `unmatched` and creates false competition.
- The duplication also explains `35 - 23 = 12` extra groups ≈ number of extra pages in multi-page untagged groups.

**Conclusion:** Transformation is **not intentional as mapping units**; it is a **data-contract artifact** from preserving per-page regions for highlights but losing the logical group identity for untagged answers. The correct transformation (for future mapping fix, **after Vision is stable**) is to keep 23 groups as 23 `AnswerGroups` each with `regions: [regionPerPage...]` (as `AnswerEvidence` does via `boxesByPage` Map), and only use per-page regions for highlight generation, not for candidate generation.

---

## Impact on Current Benchmark (Vision FAILED run)

- The 15 MATCHED reported in `e1c6769a` log includes **35 mapping units**, not 23. So `matched 15` counts sub-fragments as separate matches. Top-level 33 shows still **9 MATCHED** (same as before) because fragments of same answer compete and only one wins per question; the extra fragments become `unmatched 21`.
- This does **not** invalidate the `V-UNAVAILABLE` vs `V-AVAILABLE` comparison framework, but it means **current 15 matched is not comparable to prior 9 matched which was based on 23 groups**. After fixing the duplication (future), the mapping units will return to 23, and the comparison must be re-run.

---

## Required Fix (Deferred per Instruction: DO NOT CHANGE MAPPING YET)

- In `structuring`, change `answerGroups` construction to **one group per logical segment** (`_segmented` id), with `regions: []` per page, not one group per region.
- Update `groupedByLabel` and `mergedContinuationGroups` to operate on logical groups, not fragments.
- After fix, assert `answerGroups.length === segmentedAnswers.length` (23) for this paper, and `smart_mapping_start: 23` not 35.
- Then re-run Vision-available vs unavailable comparison.

*This trace satisfies the third required investigation. No mapping code was changed in this commit; only logging/documenting.*
