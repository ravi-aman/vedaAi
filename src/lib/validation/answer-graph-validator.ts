// @ts-nocheck
/**
 * Answer Graph Validator — must fail on corruption (Constraint 18)
 * Checks: giant groups, impossible jumps, duplicate block ownership, extreme sizes, etc.
 */
export function validateAnswerGraph(groups: any[], ocr: any) {
  const errors: any[] = [];
  const warnings: any[] = [];

  // Giant group: spans >5 pages or >50 lines
  for (const g of groups) {
    const pageCount = g.pageNumbers?.length || 0;
    const regionCount = g.regions?.length || 0;
    if (pageCount > 5) {
      errors.push({ code: "GIANT_GROUP_PAGES", message: `Group ${g.id} spans ${pageCount} pages (>${5}) suspected ${g.suspectedQuestion}`, groupId: g.id });
    }
    if (regionCount > 50) {
      errors.push({ code: "GIANT_GROUP_REGIONS", message: `Group ${g.id} has ${regionCount} regions (>${50})`, groupId: g.id });
    }
    // Extreme region size: bbox covering >80% of page
    for (const r of g.regions || []) {
      const area = (r.bbox?.width || 0) * (r.bbox?.height || 0);
      if (area > 0.8) {
        warnings.push({ code: "LARGE_REGION", message: `Group ${g.id} region area ${area.toFixed(2)} >0.8` });
      }
      if ((r.bbox?.width || 0) <= 0 || (r.bbox?.height || 0) <= 0) {
        errors.push({ code: "ZERO_AREA_BOX", message: `Group ${g.id} has zero area box` });
      }
    }
  }

  // Duplicate block ownership: same blockId in multiple groups
  const blockOwner = new Map<string, string>();
  for (const g of groups) {
    for (const r of g.regions || []) {
      for (const bid of r.blockIds || []) {
        if (blockOwner.has(bid)) {
          errors.push({ code: "DUPLICATE_BLOCK_OWNERSHIP", message: `Block ${bid} owned by ${blockOwner.get(bid)} and ${g.id}` });
        } else blockOwner.set(bid, g.id);
      }
    }
  }

  // Impossible page jump: group has pages 1 and 5 but not 2,3,4 and not continuation
  for (const g of groups) {
    const pages = [...(g.pageNumbers || [])].sort((a,b)=>a-b);
    for (let i=1;i<pages.length;i++) {
      const jump = pages[i] - pages[i-1];
      if (jump > 2) {
        warnings.push({ code: "IMPOSSIBLE_PAGE_JUMP", message: `Group ${g.id} jumps ${pages[i-1]}→${pages[i]} (>${2})` });
      }
    }
  }

  // Excessive labels per group: if group has 3+ distinct question labels (e.g., Q1, Q5, Q9 in same group)
  for (const g of groups) {
    const labels = new Set<string>();
    for (const r of g.regions || []) {
      if (r.text && /^\s*(Ans|Q)\s*\d+/i.test(r.text)) {
        labels.add(r.text.trim().slice(0,10));
      }
    }
    if (labels.size > 2) {
      warnings.push({ code: "MULTIPLE_LABELS_IN_GROUP", message: `Group ${g.id} has ${labels.size} labels: ${Array.from(labels).join(",")}` });
    }
  }

  const valid = errors.length === 0;
  return { valid, errors, warnings, isCorruption: errors.length > 0 };
}
