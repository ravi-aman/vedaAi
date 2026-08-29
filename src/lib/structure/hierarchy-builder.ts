/**
 * Hierarchy Builder — builds Question → Subparts/Options/OR
 * Constraints 1,5,6,7,9: soft geometry, Vision blockIds, Paddle geometry, evidence aggregation
 */
import type { NormalizedBox } from "@/types";
import type { QuestionCandidate, Section } from "./document-model";

export interface HierarchyInput {
  candidates: QuestionCandidate[];
  sections: Section[];
}

export interface HierarchyOutput {
  roots: QuestionCandidate[]; // top-level questions
  all: QuestionCandidate[]; // all with parent linked
  evidence: string[];
}

// Soft check: is this candidate indented vs parent?
function softIndented(child: QuestionCandidate, parent: QuestionCandidate): number {
  const dx = child.bbox.x - parent.bbox.x;
  if (dx > 0.04) return 0.9;
  if (dx > 0.02) return 0.6;
  if (dx > 0.01) return 0.4;
  return 0.1;
}
function softYProximity(child: QuestionCandidate, parent: QuestionCandidate): number {
  const dy = child.bbox.y - parent.bbox.y;
  // If parent and child on same page, dy should be small positive (0.02-0.15)
  if (child.pageNumber !== parent.pageNumber) {
    // Different page: check if parent near bottom, child near top
    if (parent.bbox.y > 0.6 && child.bbox.y < 0.3) return 0.7;
    return 0.2;
  }
  if (dy > 0.02 && dy < 0.15) return 0.9;
  if (dy > 0.15 && dy < 0.30) return 0.6;
  if (dy < 0) return 0.1;
  return 0.3;
}

export function buildHierarchy(input: HierarchyInput): HierarchyOutput {
  const { candidates, sections } = input;
  // Sort candidates by page then y then x (reading order) — soft, not hard
  const sorted = [...candidates].sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    const yDiff = a.bbox.y - b.bbox.y;
    if (Math.abs(yDiff) < 0.02) return a.bbox.x - b.bbox.x;
    return yDiff;
  });

  const roots: QuestionCandidate[] = [];
  const all: QuestionCandidate[] = [];
  const evidence: string[] = [];

  // Map for quick parent lookup
  const byId = new Map<string, QuestionCandidate>();
  for (const c of sorted) byId.set(c.sourceBlockIds[0] || c.rawLabel + c.pageNumber, c);

  let lastTop: QuestionCandidate | null = null;
  let lastSubpart: QuestionCandidate | null = null;

  for (const cand of sorted) {
    // For QUESTION type, always root (but will be validated later if fake)
    if (cand.candidateType === "QUESTION") {
      roots.push(cand);
      all.push(cand);
      lastTop = cand;
      lastSubpart = null;
      // Assign section
      const sec = sections.find((s) => s.pageStart <= cand.pageNumber && (s.pageEnd || 999) >= cand.pageNumber);
      if (sec) cand.sectionLabel = sec.label;
      continue;
    }

    if (cand.candidateType === "SUBPART") {
      // Need parent — soft evidence aggregation
      // Find nearest top-level before this (by y/page)
      const parent = lastTop;
      if (!parent) {
        // No parent → keep as root but low confidence, validator will flag as Roman-root explosion
        roots.push(cand);
        all.push(cand);
        evidence.push(`SUBPART ${cand.normalizedLabel} has no parent, kept as root (low evidence) page ${cand.pageNumber}`);
        continue;
      }
      const indentScore = softIndented(cand, parent);
      const yScore = softYProximity(cand, parent);
      const visionScore = cand.evidence.find((e) => e.type === "VISION_LABEL")?.score || 0.5;
      const agg = (indentScore * 0.3 + yScore * 0.3 + visionScore * 0.4);
      if (agg > 0.4) {
        // Soft threshold, not hard 0.5 — use evidence, but not binary
        cand.parentCandidateId = parent.sourceBlockIds[0] || parent.normalizedLabel;
        // Also handle nested: if this is (i) and parent is (a), then parent is subpart
        // Check if lastSubpart is (a) and this is (i) → then parent is lastSubpart
        if (lastSubpart && /^[ivx]+$/i.test(cand.normalizedLabel) && /^[a-d]$/i.test(lastSubpart.normalizedLabel)) {
          const indentToSub = softIndented(cand, lastSubpart);
          if (indentToSub > 0.5) {
            cand.parentCandidateId = lastSubpart.sourceBlockIds[0] || lastSubpart.normalizedLabel;
          }
        }
        all.push(cand);
        // Don't push to roots
        lastSubpart = cand;
      } else {
        // Low evidence → keep as root for validator to catch, but not as child
        roots.push(cand);
        all.push(cand);
        evidence.push(`SUBPART ${cand.normalizedLabel} low agg ${agg.toFixed(2)} indent ${indentScore.toFixed(2)} y ${yScore.toFixed(2)} vision ${visionScore.toFixed(2)} kept as root (soft)`);
      }
      continue;
    }

    if (cand.candidateType === "OPTION") {
      // MCQ options must be children of nearest QUESTION
      const parent = lastTop;
      if (!parent) {
        roots.push(cand);
        all.push(cand);
        continue;
      }
      const indentScore = softIndented(cand, parent);
      const yScore = softYProximity(cand, parent);
      const visionScore = cand.evidence.find((e) => e.type === "VISION_LABEL")?.score || 0.5;
      const agg = indentScore * 0.4 + yScore * 0.2 + visionScore * 0.4;
      if (agg > 0.35) {
        cand.parentCandidateId = parent.sourceBlockIds[0] || parent.normalizedLabel;
        // Store as option, not as separate question — will be moved to parent.options later
        all.push(cand);
      } else {
        roots.push(cand);
        all.push(cand);
      }
      continue;
    }

    if (cand.candidateType === "INTERNAL_CHOICE") {
      // OR must be under parent
      if (lastTop) {
        cand.parentCandidateId = lastTop.sourceBlockIds[0] || lastTop.normalizedLabel;
        all.push(cand);
      } else {
        roots.push(cand);
        all.push(cand);
      }
      continue;
    }

    // INSTRUCTION, HEADER, etc. — never become questions, just keep for artifact
    all.push(cand);
  }

  return { roots, all, evidence };
}
