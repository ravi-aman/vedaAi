import type { ParsedQuestion } from "./question-parser";
import { normalizeNumber } from "./numbering";

export interface StructureValidationResult {
  valid: boolean;
  errors: { code: string; message: string; questionId?: string }[];
  warnings: { code: string; message: string }[];
  topLevelCount: number;
  totalCount: number;
}

export function validateQuestionStructure(questions: ParsedQuestion[]): StructureValidationResult {
  const errors: StructureValidationResult["errors"] = [];
  const warnings: StructureValidationResult["warnings"] = [];

  const totalCount = questions.length;
  const topLevel = questions.filter((q) => q.depth === 0);
  const topLevelCount = topLevel.length;

  // Check for instruction leakage: topLevel items that look like instructions
  for (const q of questions) {
    if (/question paper contains|All Questions are compulsory|divided into.*Sections|Use of calculators is not allowed|Time:\s*3 hours/i.test(q.text)) {
      errors.push({ code: "INSTRUCTION_AS_QUESTION", message: `Question ${q.rawNumber} text looks like instruction: "${q.text.slice(0, 80)}"` });
    }
    if (/^\s*Section\s+[A-Z]\b/i.test(q.rawNumber) || /^\s*Section\s+[A-Z]\b/i.test(q.text.slice(0, 30))) {
      errors.push({ code: "SECTION_AS_QUESTION", message: `Question ${q.rawNumber} appears to be Section header` });
    }
    // Options (a)/(b)/(c)/(d) as top-level with short text
    if (q.depth === 0 && /^\([a-d]\)$/i.test(q.normalizedNumber) && q.text.length < 80) {
      errors.push({ code: "OPTION_AS_QUESTION", message: `Option ${q.rawNumber} promoted to top-level question` });
    }
  }

  // Duplicate normalized numbers
  const seen = new Map<string, number>();
  for (const q of questions) {
    const n = q.normalizedNumber;
    seen.set(n, (seen.get(n) || 0) + 1);
  }
  for (const [norm, count] of seen) {
    if (count > 1) warnings.push({ code: "DUPLICATE_NUMBER", message: `Normalized ${norm} appears ${count} times` });
  }

  // Number progression (numeric top-level should be roughly sequential 1..N)
  const numericTop = topLevel
    .map((q) => {
      const m = q.normalizedNumber.match(/^(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    })
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);
  if (numericTop.length >= 2) {
    for (let i = 1; i < numericTop.length; i++) {
      const gap = numericTop[i] - numericTop[i - 1];
      if (gap > 5) warnings.push({ code: "NUMBER_GAP", message: `Gap ${numericTop[i - 1]} → ${numericTop[i]} (missing questions?)` });
      if (gap <= 0) errors.push({ code: "NUMBER_REGRESSION", message: `Regression ${numericTop[i - 1]} → ${numericTop[i]}` });
    }
    if (numericTop.length > 60) warnings.push({ code: "OVER_SEGMENTATION", message: `${numericTop.length} top-level numeric questions — likely over-segmentation (expected ~38)` });
  }

  // Hierarchy: children must have parent existing
  for (const q of questions) {
    if (q.parent) {
      const parentExists = questions.some((p) => p.normalizedNumber === q.parent);
      if (!parentExists) warnings.push({ code: "ORPHAN_SUBPART", message: `Subpart ${q.normalizedNumber} parent ${q.parent} not found` });
    }
  }

  // Top-level explosion guard: >60 top-level is suspicious for typical school paper
  if (topLevelCount > 60) warnings.push({ code: "TOP_LEVEL_EXPLOSION", message: `Top-level ${topLevelCount} exceeds 60` });

  const valid = errors.length === 0;
  return { valid, errors, warnings, topLevelCount, totalCount };
}

export function validateAnswerStructure(groups: { questionLabel?: string }[]): { warnings: string[] } {
  const warnings: string[] = [];
  const labels = groups.map((g) => g.questionLabel).filter(Boolean) as string[];
  const normalized = labels.map((l) => {
    try { return normalizeNumber(l).normalized; } catch { return l; }
  });
  const dup = new Map<string, number>();
  for (const n of normalized) dup.set(n, (dup.get(n) || 0) + 1);
  for (const [k, v] of dup) if (v > 1) warnings.push(`Answer label ${k} appears ${v} times — may be duplicate or continuation`);
  return { warnings };
}
