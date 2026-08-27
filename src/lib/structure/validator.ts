import type { ParsedQuestion } from "./question-parser";
import { normalizeNumber } from "./numbering";

export interface StructureValidationResult {
  valid: boolean;
  errors: { code: string; message: string; questionId?: string }[];
  warnings: { code: string; message: string }[];
  topLevelCount: number;
  totalCount: number;
}

export function detectExpectedTopLevelIds(questions: ParsedQuestion[], fullText: string): number[] | null {
  // Try to extract expected top-level IDs from paper instructions like "question no. 1 to 14", "15 to 24", "25 to 30"
  const ranges: Array<[number, number]> = [];
  const rangeRes = [...fullText.matchAll(/question\s*no\.?\s*(\d+)\s*to\s*(\d+)/gi)];
  for (const m of rangeRes) {
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    if (a >= 1 && b <= 100 && a < b) ranges.push([a, b]);
  }
  // Also check for "Section A - ... 1 to 14" etc
  if (ranges.length === 0) {
    const secRes = [...fullText.matchAll(/Section\s+[A-C][^]*?(\d+)\s*to\s*(\d+)/gi)];
    for (const m of secRes) {
      const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
      if (a >= 1 && b <= 100 && a < b) ranges.push([a, b]);
    }
  }
  if (ranges.length === 0) return null;
  // Deduplicate and expand
  const ids = new Set<number>();
  for (const [a, b] of ranges) {
    for (let i = a; i <= b; i++) ids.add(i);
  }
  const sorted = [...ids].sort((a, b) => a - b);
  // For Science paper, expect 1-30
  if (sorted.length >= 20 && sorted[0] === 1) return sorted;
  return null;
}

export function validateQuestionStructure(questions: ParsedQuestion[], fullTextForDebug?: string): StructureValidationResult {
  const errors: StructureValidationResult["errors"] = [];
  const warnings: StructureValidationResult["warnings"] = [];

  const totalCount = questions.length;
  const topLevel = questions.filter((q) => q.depth === 0);
  const topLevelCount = topLevel.length;

  // Canonical validation: for Science paper, expect 1-30
  let expectedIds: number[] | null = null;
  if (fullTextForDebug) {
    expectedIds = detectExpectedTopLevelIds(questions, fullTextForDebug);
  }
  // Fallback: if we have many top-level and they should be 1-30, check
  const numericTopIds = topLevel.map((q) => parseInt(q.normalizedNumber.match(/^(\d+)/)?.[1] || "0", 10)).filter((n) => n > 0);
  if (expectedIds) {
    const expectedSet = new Set(expectedIds);
    for (const q of topLevel) {
      const n = parseInt(q.normalizedNumber.match(/^(\d+)/)?.[1] || "0", 10);
      if (n > 0 && !expectedSet.has(n)) {
        errors.push({ code: "INVALID_TOP_LEVEL_ID", message: `Top-level ${q.normalizedNumber} outside expected ${expectedIds[0]}-${expectedIds[expectedIds.length-1]}`, questionId: q.rawNumber });
      }
    }
    // Check for missing expected IDs
    const actualSet = new Set(numericTopIds);
    const missing = expectedIds.filter((id) => !actualSet.has(id));
    if (missing.length > 0 && missing.length < 10) {
      warnings.push({ code: "MISSING_QUESTIONS", message: `Missing expected top-level: ${missing.join(", ")}` });
    }
  } else {
    // Generic check: no top-level >100 or <1
    for (const q of topLevel) {
      const n = parseInt(q.normalizedNumber.match(/^(\d+)/)?.[1] || "0", 10);
      if (n > 100 || n < 1) {
        errors.push({ code: "INVALID_TOP_LEVEL_ID", message: `Top-level ${q.normalizedNumber} outside 1-100`, questionId: q.rawNumber });
      }
    }
  }

  // Check for instruction leakage: topLevel items that look like instructions
  for (const q of questions) {
    if (/question paper contains|All Questions are compulsory|divided into.*Sections|Use of calculators is not allowed|Time:\s*3 hours|Time allowed|Please check that this question|Candidates must write the Code|question paper will be distributed|students will read the|write any answer on the answer/i.test(q.text)) {
      errors.push({ code: "INSTRUCTION_AS_QUESTION", message: `Question ${q.rawNumber} text looks like instruction: "${q.text.slice(0, 80)}"` });
    }
    if (/^\s*Section\s+[A-Z]\b/i.test(q.rawNumber) || /^\s*Section\s+[A-Z]\b/i.test(q.text.slice(0, 30))) {
      errors.push({ code: "SECTION_AS_QUESTION", message: `Question ${q.rawNumber} appears to be Section header` });
    }
    // Options (a)/(b)/(c)/(d) as top-level with short text
    if (q.depth === 0 && /^\([a-d]\)$/i.test(q.normalizedNumber) && q.text.length < 80) {
      errors.push({ code: "OPTION_AS_QUESTION", message: `Option ${q.rawNumber} promoted to top-level question` });
    }
    // Word limit numbers like "90 words" should not be top-level
    if (q.depth === 0 && /^\d+$/.test(q.normalizedNumber) && /words/i.test(q.text) && q.text.length < 60) {
      const n = parseInt(q.normalizedNumber, 10);
      if (n === 90 || n === 80 || n === 50 || n === 60) {
        errors.push({ code: "WORD_LIMIT_AS_QUESTION", message: `Word limit ${q.normalizedNumber} promoted to question: "${q.text.slice(0,40)}"` });
      }
    }
    // Instruction "(vii) In addition to this..." should not be question
    if (/^\(vii\)\s+In addition to this/i.test(q.rawText) || /^\(vii\)\s+In addition/i.test(q.text)) {
      errors.push({ code: "INSTRUCTION_AS_QUESTION", message: `Instruction ${q.rawNumber} looks like general instruction: "${q.text.slice(0,60)}"` });
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
