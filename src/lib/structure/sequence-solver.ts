/**
 * Sequence Solver — global document-level reconciliation (Constraints 3,4,10)
 * No hard-coded Roman >8, no hardcode 33, validation only.
 */
import type { QuestionCandidate, Section } from "./document-model";

export interface SequenceInput {
  candidates: QuestionCandidate[]; // all candidates after hierarchy
  sections: Section[];
  visionObservations: Array<{ label: string; type: string; blockIds: string[] }>;
}

export interface SequenceOutput {
  ordered: QuestionCandidate[];
  topLevel: QuestionCandidate[];
  evidence: string[];
  warnings: string[];
  // For validation
  expectedMax?: number;
  missingLabels: string[];
  duplicateLabels: string[];
}

export function solveSequence(input: SequenceInput): SequenceOutput {
  const { candidates, sections } = input;
  const evidence: string[] = [];
  const warnings: string[] = [];

  // Filter to top-level QUESTIONS only (not subparts/options)
  const tops = candidates.filter((c) => c.candidateType === "QUESTION");
  // Sort by numeric label, not by page/y (global)
  const sorted = [...tops].sort((a, b) => {
    const na = parseInt(a.normalizedLabel, 10);
    const nb = parseInt(b.normalizedLabel, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.normalizedLabel.localeCompare(b.normalizedLabel);
  });

  // Deduplicate by normalizedLabel — keep highest confidence
  const byLabel = new Map<string, QuestionCandidate[]>();
  for (const c of sorted) {
    if (!byLabel.has(c.normalizedLabel)) byLabel.set(c.normalizedLabel, []);
    byLabel.get(c.normalizedLabel)!.push(c);
  }
  const deduped: QuestionCandidate[] = [];
  const duplicateLabels: string[] = [];
  for (const [label, list] of byLabel) {
    if (list.length > 1) {
      duplicateLabels.push(label);
      // Keep highest aggregatedScore
      list.sort((a, b) => b.aggregatedScore - a.aggregatedScore);
      deduped.push(list[0]);
      warnings.push(`Duplicate top label ${label} count ${list.length}, kept highest score ${list[0].aggregatedScore.toFixed(2)}`);
    } else {
      deduped.push(list[0]);
    }
  }
  deduped.sort((a, b) => parseInt(a.normalizedLabel, 10) - parseInt(b.normalizedLabel, 10));

  // Check sequence gaps — soft, not hard
  const nums = deduped.map((c) => parseInt(c.normalizedLabel, 10)).filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  const min = nums.length ? Math.min(...nums) : 0;
  const missing: string[] = [];
  for (let i = min; i <= max; i++) {
    if (!nums.includes(i)) missing.push(String(i));
  }
  if (missing.length > 0 && missing.length <= 10) {
    evidence.push(`Missing labels in sequence: ${missing.join(",")} (soft, may be instruction gaps)`);
  } else if (missing.length > 10) {
    warnings.push(`Large gap missing ${missing.length} labels ${missing.slice(0, 5).join(",")}...`);
  }

  // For THIS paper, expected 33, but not hardcoded in solver — just report
  // The validator will check 26 vs 33 and fail (Constraint 11)
  // Here we just report expectedMax for validation
  // No hard 33 in solver logic

  // Re-attach subparts/options to their parents after dedupe
  const allOrdered = [...deduped];
  const subparts = candidates.filter((c) => c.candidateType === "SUBPART" || c.candidateType === "OPTION" || c.candidateType === "INTERNAL_CHOICE");
  for (const sp of subparts) {
    // Keep subparts even if parent was deduped away? Need to find parent
    if (sp.parentCandidateId) {
      const parent = deduped.find((p) => p.sourceBlockIds[0] === sp.parentCandidateId || p.normalizedLabel === sp.parentCandidateId);
      if (parent) {
        allOrdered.push(sp);
      } else {
        // Parent missing due to dedupe/sequence gap — keep as orphan for validator
        allOrdered.push(sp);
        warnings.push(`Orphan subpart ${sp.normalizedLabel} parent ${sp.parentCandidateId} not in topLevel`);
      }
    } else {
      // Was root subpart (low evidence) — keep for validator to flag
      allOrdered.push(sp);
    }
  }

  // Final ordered by page/y (document order) for display, but topLevel sorted numerically
  const finalTop = deduped;
  return {
    ordered: allOrdered,
    topLevel: finalTop,
    evidence,
    warnings,
    expectedMax: max,
    missingLabels: missing,
    duplicateLabels,
  };
}
