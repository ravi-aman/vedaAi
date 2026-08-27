import type { OcrDocumentResult } from "@/lib/ocr/types";

export type DocumentRole = "QUESTION_PAPER" | "ANSWER_SHEET" | "MARKING_SCHEME" | "SOLUTION" | "UNKNOWN";

export interface ClassificationResult {
  role: DocumentRole;
  confidence: number;
  evidence: string[];
  isAnswerSheet: boolean;
  isMarkingScheme: boolean;
}

const MARKING_SCHEME_INDICATORS = [
  /marking scheme/i,
  /value points/i,
  /expected answer/i,
  /total marks/i,
  /question paper solution/i,
  /solution 2020/i,
  /code\s*:\s*31\/2\/1/i,
];

const QUESTION_PAPER_INDICATORS = [
  /sample question paper/i,
  /maximum marks/i,
  /time:\s*3 hours/i,
  /general instructions/i,
  /section\s+[a-e]\s+consists/i,
];

const ANSWER_SHEET_INDICATORS = [
  /handwriting/i,
  /student/i,
  /roll no/i,
  /answer sheet/i,
];

export function classifyDocument(
  originalName: string,
  ocr: OcrDocumentResult | null,
  mime: string
): ClassificationResult {
  const evidence: string[] = [];
  let markingScore = 0;
  let questionScore = 0;
  let answerScore = 0;

  const nameLower = originalName.toLowerCase();
  if (nameLower.includes("marking") || nameLower.includes("scheme")) {
    markingScore += 0.9;
    evidence.push(`filename contains marking/scheme: ${originalName}`);
  }
  if (nameLower.includes("solution")) {
    markingScore += 0.7;
    evidence.push(`filename contains solution: ${originalName}`);
  }
  if (nameLower.includes("question") && nameLower.includes("paper") && !nameLower.includes("solution")) {
    questionScore += 0.6;
    evidence.push(`filename contains question paper: ${originalName}`);
  }
  if (nameLower.includes("answer") || nameLower.includes("sheet")) {
    answerScore += 0.5;
    evidence.push(`filename contains answer sheet: ${originalName}`);
  }

  if (ocr) {
    const firstPageText = ocr.pages[0]?.text || "";
    const sample = firstPageText.slice(0, 2000);
    for (const re of MARKING_SCHEME_INDICATORS) {
      if (re.test(sample)) {
        markingScore += 0.8;
        evidence.push(`first page matches marking indicator: ${re.source}`);
      }
    }
    for (const re of QUESTION_PAPER_INDICATORS) {
      if (re.test(sample)) {
        questionScore += 0.7;
        evidence.push(`first page matches question paper indicator: ${re.source}`);
      }
    }
    // Check for table structure typical of marking scheme (Value Points/Expected Answer header)
    if (/value points/i.test(sample) && /expected answer/i.test(sample)) {
      markingScore += 0.9;
      evidence.push("first page has Value Points/Expected Answer table (marking scheme)");
    }
    // Check for handwritten vs printed: marking scheme is printed, answer sheet is handwritten
    // For now, we use a simple heuristic: if many lines have high confidence and printed, it's likely marking scheme
    const avgConfidence = ocr.pages.reduce((a, p) => a + (p.confidence || 0.9), 0) / Math.max(ocr.pages.length, 1);
    if (avgConfidence > 0.95 && markingScore > 0.5) {
      evidence.push(`high OCR confidence ${avgConfidence.toFixed(2)} suggests printed marking scheme`);
    }
  }

  let role: DocumentRole = "UNKNOWN";
  let confidence = 0.5;
  if (markingScore > 0.8 && markingScore > questionScore && markingScore > answerScore) {
    role = "MARKING_SCHEME";
    confidence = Math.min(0.95, markingScore);
  } else if (questionScore > 0.6 && questionScore >= markingScore) {
    role = "QUESTION_PAPER";
    confidence = Math.min(0.9, questionScore);
  } else if (answerScore > 0.4) {
    role = "ANSWER_SHEET";
    confidence = Math.min(0.85, answerScore);
  } else {
    // Default: if not marking scheme, assume answer sheet for answerSheet kind, question paper for questionPaper kind
    role = "UNKNOWN";
    confidence = 0.5;
  }

  return {
    role,
    confidence,
    evidence,
    isAnswerSheet: role === "ANSWER_SHEET" || (role === "UNKNOWN" && answerScore >= markingScore),
    isMarkingScheme: role === "MARKING_SCHEME",
  };
}

export function validateAnswerSheetDocument(
  originalName: string,
  ocr: OcrDocumentResult | null,
  mime: string
): { valid: boolean; role: DocumentRole; reason?: string; evidence: string[] } {
  const result = classifyDocument(originalName, ocr, mime);
  if (result.isMarkingScheme) {
    return {
      valid: false,
      role: result.role,
      reason: `Document appears to be a marking scheme/solution, not a student answer sheet. Evidence: ${result.evidence.join("; ")}`,
      evidence: result.evidence,
    };
  }
  return { valid: true, role: result.role, evidence: result.evidence };
}
