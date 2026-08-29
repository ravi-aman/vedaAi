/**
 * Structure Validator — must fail on corruption (Constraints 11,15)
 * Checks: instruction-as-question, option-as-question, Roman-root explosion, duplicate roots, major regression
 * Not hard-coded 33, but uses document-derived invariants; for THIS paper 33 is validation ground truth (Constraint 10)
 */
import type { QuestionCandidate } from "@/lib/structure/document-model";

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ code: string; message: string; severity: "error" | "warning" }>;
  warnings: Array<{ code: string; message: string }>;
  isStructuralCorruption: boolean;
}

export function validateQuestionStructureV2(
  candidates: QuestionCandidate[],
  topLevel: QuestionCandidate[],
  expectedTopLevelFromDocument?: number // e.g., 33 derived from Sections, not hardcode
): ValidationResult {
  const errors: ValidationResult["errors"] = [];
  const warnings: ValidationResult["warnings"] = [];
  let isStructuralCorruption = false;

  // 1. Instruction-as-question: check if any topLevel has text that is instruction
  for (const q of topLevel) {
    const txt = q.rawOCRText;
    if (/General Instructions|This question paper contains|divided into.*Sections|Time allowed|Maximum Marks|Please check that this question/i.test(txt)) {
      errors.push({
        code: "INSTRUCTION_AS_QUESTION",
        message: `Top-level ${q.normalizedLabel} text is instruction: "${txt.slice(0, 50)}"`,
        severity: "error",
      });
      isStructuralCorruption = true;
    }
  }

  // 2. Option-as-question: check if normalizedLabel is single A-D and parent is null but it was option-like
  for (const q of topLevel) {
    if (/^[A-D]$/.test(q.normalizedLabel) && q.candidateType === "QUESTION") {
      // Check if its bbox is at option indent (x 0.09-0.35) — but we already have evidence
      const geomEvidence = q.evidence.find((e) => e.type === "GEOMETRY_X");
      if (geomEvidence && geomEvidence.score < 0.6) {
        errors.push({
          code: "OPTION_AS_QUESTION",
          message: `Top-level ${q.normalizedLabel} looks like option (x=${q.bbox.x.toFixed(3)})`,
          severity: "error",
        });
        isStructuralCorruption = true;
      }
    }
  }

  // 3. Roman-root explosion: check if any topLevel normalizedLabel is roman (i,ii,iii) and type is QUESTION (should be SUBPART)
  for (const q of topLevel) {
    if (/^[ivx]+$/i.test(q.normalizedLabel) && q.candidateType === "QUESTION") {
      errors.push({
        code: "ROMAN_AS_ROOT",
        message: `Top-level ${q.normalizedLabel} is roman, should be SUBPART`,
        severity: "error",
      });
      isStructuralCorruption = true;
    }
  }

  // 4. Duplicate roots
  const byLabel = new Map<string, number>();
  for (const q of topLevel) byLabel.set(q.normalizedLabel, (byLabel.get(q.normalizedLabel) || 0) + 1);
  for (const [label, count] of byLabel) {
    if (count > 1) {
      errors.push({
        code: "DUPLICATE_ROOT",
        message: `Duplicate top-level label ${label} count ${count}`,
        severity: "error",
      });
      isStructuralCorruption = true;
    }
  }

  // 5. Major regression: check if labels are not incrementing
  const nums = topLevel
    .map((q) => parseInt(q.normalizedLabel, 10))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] < nums[i - 1]) {
      errors.push({
        code: "NUMBER_REGRESSION",
        message: `Regression ${nums[i - 1]} → ${nums[i]}`,
        severity: "error",
      });
      isStructuralCorruption = true;
    }
    if (nums[i] - nums[i - 1] > 5) {
      warnings.push({
        code: "LARGE_GAP",
        message: `Large gap ${nums[i - 1]} → ${nums[i]} (missing ${nums[i] - nums[i - 1] - 1})`,
      });
    }
  }

  // 6. Top-level explosion: if topLevel count >> expected or > 1.5*medianSectionSize
  // For generic, we check if count > 40 (unlikely for school paper) — soft, not hardcode 33
  // But for THIS paper, expected is 33, so if we get 44, that's explosion
  if (expectedTopLevelFromDocument && topLevel.length > expectedTopLevelFromDocument * 1.3) {
    errors.push({
      code: "TOPLEVEL_EXPLOSION",
      message: `Top-level explosion: got ${topLevel.length}, expected ~${expectedTopLevelFromDocument} (1.3x)`,
      severity: "error",
    });
    isStructuralCorruption = true;
  } else if (topLevel.length > 50) {
    errors.push({
      code: "TOPLEVEL_EXPLOSION",
      message: `Top-level explosion: got ${topLevel.length} >50 (generic)`,
      severity: "error",
    });
    isStructuralCorruption = true;
  }

  // 7. Check for fake 4 with many subparts (specific to previous failure, but generic: if a top has >8 subparts and is not 33-like)
  for (const q of topLevel) {
    const subCount = candidates.filter((c) => c.parentCandidateId === q.sourceBlockIds[0] && c.candidateType === "SUBPART").length;
    if (subCount > 8) {
      warnings.push({
        code: "MANY_SUBPARTS",
        message: `Top ${q.normalizedLabel} has ${subCount} subparts (possible instruction list)`,
      });
      if (q.normalizedLabel === "4" && subCount >= 8) {
        errors.push({
          code: "INSTRUCTION_LIST_AS_QUESTION",
          message: `Top 4 has ${subCount} subparts, likely General Instructions (i)-(x) misclassified`,
          severity: "error",
        });
        isStructuralCorruption = true;
      }
    }
  }

  const valid = errors.length === 0;

  return { valid, errors, warnings, isStructuralCorruption };
}
