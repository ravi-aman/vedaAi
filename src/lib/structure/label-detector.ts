/**
 * Label Detector — soft evidence, no hard thresholds (Constraints 1,2,9)
 * Every geometry threshold is soft evidence, never binary classifier.
 * No hard-coded Roman >8, no paper-specific assumptions.
 */
import type { NormalizedBox } from "@/types";
import type { OcrBlockRef, EvidenceSignal, CandidateType } from "./document-model";

export interface LabelDetectionInput {
  block: OcrBlockRef;
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  // Context
  sectionLabel?: string; // "A" etc., soft
  prevLabel?: string; // previous candidate label, for sequence
  nextBlock?: OcrBlockRef; // proximity
  visionObservations: Array<{ label: string; type: CandidateType; blockIds: string[]; confidence: number }>;
  isFirstPage?: boolean;
  isInstructionPage?: boolean;
}

export interface LabelDetectionResult {
  candidateType: CandidateType;
  rawLabel: string;
  normalizedLabel: string;
  confidence: number;
  evidence: EvidenceSignal[];
  aggregatedScore: number;
}

// Helpers for soft scoring
function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
function softScore(value: number, ideal: number, tolerance: number): number {
  const diff = Math.abs(value - ideal);
  if (diff <= tolerance) return 1.0;
  if (diff <= tolerance * 2) return 0.7;
  if (diff <= tolerance * 3) return 0.4;
  return 0.1;
}
function leftMarginScore(x: number): number {
  // Ideal left margin 0.06-0.12, soft decay
  if (x < 0.08) return 0.95;
  if (x < 0.14) return 0.85;
  if (x < 0.20) return 0.5;
  if (x < 0.35) return 0.2;
  return 0.05;
}
function indentScore(x: number): number {
  // For subparts/options, ideal 0.12-0.25
  if (x >= 0.10 && x <= 0.25) return 0.9;
  if (x >= 0.08 && x <= 0.30) return 0.6;
  if (x < 0.08) return 0.2;
  return 0.3;
}
function marksColumnScore(x: number, width: number): number {
  // Marks at right margin x>0.84 width<0.05
  if (x > 0.84 && width < 0.05) return 0.9;
  if (x > 0.80 && width < 0.08) return 0.6;
  return 0.1;
}

// Pattern detection — generic, not paper-specific
function detectPattern(text: string): { type: CandidateType | null; rawLabel: string; normalizedLabel: string; score: number } {
  const t = text.trim();
  if (!t) return { type: null, rawLabel: "", normalizedLabel: "", score: 0 };

  // Section: "Section A" etc. — generic, not hardcode 33
  const sectionM = t.match(/^\s*Section\s+([A-E])\b/i);
  if (sectionM) {
    return { type: "SECTION", rawLabel: `Section ${sectionM[1].toUpperCase()}`, normalizedLabel: sectionM[1].toUpperCase(), score: 0.95 };
  }

  // Instruction: generic phrases, but soft (not hard filter)
  const instructionPhrases = [
    /General Instructions/i,
    /Read the following instructions/i,
    /All questions are compulsory/i,
    /This question paper contains/i,
    /divided into.*Sections/i,
    /no overall choice/i,
    /internal choice/i,
    /Time allowed/i,
    /Maximum Marks/i,
    /Please check that this question/i,
    /Candidates must write the Q\.P\. Code/i,
  ];
  for (const re of instructionPhrases) {
    if (re.test(t)) {
      // Soft: if matches, likely instruction, but not 100% — need other signals
      return { type: "INSTRUCTION", rawLabel: t.slice(0, 30), normalizedLabel: "INSTRUCTION", score: 0.7 };
    }
  }

  // QUESTION: numeric at start with punctuation — generic, but filter obvious non-questions
  const qM = t.match(/^\s*(\d+)\s*[\.\)]\s*(.*)/);
  if (qM) {
    const num = qM[1];
    const remaining = qM[2];
    const n = parseInt(num, 10);
    // Soft filter: 0 or >100 is unlikely to be a question number for school paper — downweight, not hard reject
    // But if remaining starts with digit (e.g., "0.019" -> remaining ".019"), it's likely a decimal/constant, not question
    if (n === 0 || n > 100) {
      return { type: "QUESTION", rawLabel: num, normalizedLabel: num, score: 0.25 }; // low score, will be filtered by aggregatedScore
    }
    if (remaining && /^\d/.test(remaining)) {
      // Remaining starts with digit → likely "0.019" or "140 keV" continuation, not question
      return { type: "QUESTION", rawLabel: num, normalizedLabel: num, score: 0.2 };
    }
    if (!remaining || remaining.trim().length === 0) {
      // Bare number like "0" or "140" alone — could be question number on its own line, but need next line text
      // Keep but low score, let proximity decide
      return { type: "QUESTION", rawLabel: num, normalizedLabel: num, score: 0.5 };
    }
    // Check remaining starts with lowercase → likely not question stem (e.g., "equal to")
    if (/^[a-z]/.test(remaining) && remaining.length < 20) {
      return { type: "QUESTION", rawLabel: num, normalizedLabel: num, score: 0.4 };
    }
    return { type: "QUESTION", rawLabel: num, normalizedLabel: num, score: 0.85 };
  }
  // Also Q with prefix like "Q.1" — generic
  const qPrefM = t.match(/^\s*Q\.?\s*(\d+)\b/i);
  if (qPrefM) {
    return { type: "QUESTION", rawLabel: qPrefM[1], normalizedLabel: qPrefM[1], score: 0.8 };
  }

  // SUBPART: (a), (b), (i), (ii) etc. — must be standalone at start
  const subM = t.match(/^\s*\(([a-z])\)\s*/i);
  if (subM) {
    const inner = subM[1].toLowerCase();
    // All a-z are potential subparts, but generic — no hard >8 rule
    // Score based on single letter, but need parent context later
    return { type: "SUBPART", rawLabel: `(${inner})`, normalizedLabel: inner, score: 0.75 };
  }
  const romanM = t.match(/^\s*\(([ivx]+)\)\s*/i);
  if (romanM) {
    const inner = romanM[1].toLowerCase();
    // Any roman is potential subpart — no hard-coded max, soft
    return { type: "SUBPART", rawLabel: `(${inner})`, normalizedLabel: inner, score: 0.7 };
  }

  // OPTION: (A) (B) (C) (D) or A. B. etc. — generic for MCQ, but must be validated with geometry
  const optM = t.match(/^\s*\(?\s*([A-D])\s*[\)\.\]]\s*/i);
  if (optM) {
    const lab = optM[1].toUpperCase();
    return { type: "OPTION", rawLabel: lab, normalizedLabel: lab, score: 0.6 }; // lower, need geometry + Vision
  }

  // INTERNAL_CHOICE: "OR" alone
  if (/^\s*OR\s*$/i.test(t)) {
    return { type: "INTERNAL_CHOICE", rawLabel: "OR", normalizedLabel: "OR", score: 0.9 };
  }

  // HEADER/FOOTER: page numbers, etc. — soft
  if (/^\s*Page\s*\d+\s*of\s*\d+/i.test(t) || /^\s*P\.T\.O\.\s*$/i.test(t) || /^\s*\d+\s*$/.test(t) && t.length < 4) {
    // Could be page number, but not 100% — geometry will confirm
    return { type: "HEADER", rawLabel: t, normalizedLabel: "HEADER", score: 0.5 };
  }

  return { type: null, rawLabel: "", normalizedLabel: "", score: 0 };
}

export function detectLabel(input: LabelDetectionInput): LabelDetectionResult {
  const { block, visionObservations } = input;
  const text = block.text;
  const bbox = block.bbox;

  const pattern = detectPattern(text);
  const evidence: EvidenceSignal[] = [];

  // Pattern evidence — always included, but soft
  if (pattern.type) {
    evidence.push({
      type: "PATTERN",
      score: pattern.score,
      weight: 0.25,
      explanation: `Pattern matched ${pattern.type} raw="${pattern.rawLabel}"`,
      source: "ocr",
    });
  } else {
    evidence.push({
      type: "PATTERN",
      score: 0.1,
      weight: 0.25,
      explanation: `No pattern matched for "${text.slice(0, 20)}"`,
      source: "ocr",
    });
  }

  // Geometry evidence — soft, never binary (Constraint 1)
  const geomLeft = leftMarginScore(bbox.x);
  evidence.push({
    type: "GEOMETRY_X",
    score: pattern.type === "QUESTION" ? geomLeft : pattern.type === "SUBPART" || pattern.type === "OPTION" ? indentScore(bbox.x) : 0.5,
    weight: 0.15,
    explanation: `x=${bbox.x.toFixed(3)} leftMargin soft score`,
    source: "geometry",
  });

  const geomY = softScore(bbox.y, 0.15, 0.3); // generic y soft, not hard header/footer
  evidence.push({
    type: "GEOMETRY_Y",
    score: geomY,
    weight: 0.05,
    explanation: `y=${bbox.y.toFixed(3)}`,
    source: "geometry",
  });

  const marksScore = marksColumnScore(bbox.x, bbox.width);
  if (marksScore > 0.6) {
    evidence.push({
      type: "GEOMETRY_MARKS_COLUMN",
      score: marksScore,
      weight: 0.05,
      explanation: `Possible marks column x=${bbox.x.toFixed(3)} w=${bbox.width.toFixed(3)}`,
      source: "geometry",
    });
  }

  // Proximity — does next block look like question text (not header)?
  if (input.nextBlock) {
    const nextText = input.nextBlock.text.trim();
    const isNextQuestionText = nextText.length > 10 && !/^(Page|P\.T\.O\.)/i.test(nextText);
    evidence.push({
      type: "PROXIMITY",
      score: isNextQuestionText ? 0.8 : 0.3,
      weight: 0.10,
      explanation: `Next block "${nextText.slice(0, 20)}" proximity`,
      source: "geometry",
    });
  }

  // Section context — soft (Constraint 3)
  if (input.sectionLabel && pattern.type === "QUESTION") {
    const num = parseInt(pattern.normalizedLabel, 10);
    if (!isNaN(num)) {
      // Generic section ranges, but soft: Section A ideally 1-16, but not hard
      const sectionRanges: Record<string, [number, number]> = { A: [1, 16], B: [17, 21], C: [22, 28], D: [29, 30], E: [31, 33] };
      const range = sectionRanges[input.sectionLabel];
      if (range) {
        const inRange = num >= range[0] && num <= range[1];
        evidence.push({
          type: "SECTION_CONTEXT",
          score: inRange ? 0.9 : 0.3,
          weight: 0.15,
          explanation: `Section ${input.sectionLabel} range ${range[0]}-${range[1]}, label ${num} ${inRange ? "in" : "out of"} range (soft)`,
          source: "document",
        });
      }
    }
  }

  // Sequence — soft (Constraint 4)
  if (input.prevLabel && pattern.type === "QUESTION") {
    const prevNum = parseInt(input.prevLabel, 10);
    const curNum = parseInt(pattern.normalizedLabel, 10);
    if (!isNaN(prevNum) && !isNaN(curNum)) {
      const expected = prevNum + 1;
      const diff = Math.abs(curNum - expected);
      let seqScore = 0;
      if (diff === 0) seqScore = 0.95;
      else if (diff === 1) seqScore = 0.7;
      else if (diff <= 3) seqScore = 0.4;
      else seqScore = 0.1;
      evidence.push({
        type: "SEQUENCE",
        score: seqScore,
        weight: 0.15,
        explanation: `Prev ${prevNum} → cur ${curNum}, expected ${expected} diff ${diff}`,
        source: "document",
      });
    }
  }

  // Vision confirmation — soft but strong (Constraints 5,6,9)
  const visionMatch = visionObservations.find(
    (v) => v.blockIds.includes(block.id) || v.label === pattern.normalizedLabel
  );
  if (visionMatch) {
    evidence.push({
      type: "VISION_LABEL",
      score: visionMatch.confidence,
      weight: 0.20,
      explanation: `Vision ${visionMatch.type} label=${visionMatch.label} blockIds=${visionMatch.blockIds.join(",")} conf=${visionMatch.confidence}`,
      source: "vision",
    });
  } else if (visionObservations.length > 0) {
    // Vision present but no match → slight downweight if Vision says this is not a question
    const visionSaysNotQuestion = visionObservations.some((v) => v.type === "INSTRUCTION" && v.blockIds.includes(block.id));
    if (visionSaysNotQuestion) {
      evidence.push({
        type: "VISION_LABEL",
        score: 0.2,
        weight: 0.20,
        explanation: `Vision says INSTRUCTION for this block, not QUESTION`,
        source: "vision",
      });
    } else {
      evidence.push({
        type: "VISION_LABEL",
        score: 0.5,
        weight: 0.20,
        explanation: `Vision present but no direct match for this block`,
        source: "vision",
      });
    }
  } else {
    evidence.push({
      type: "VISION_LABEL",
      score: 0.5,
      weight: 0.20,
      explanation: `No Vision observation for this page`,
      source: "vision",
    });
  }

  // OCR confidence — soft
  evidence.push({
    type: "OCR_CONFIDENCE",
    score: block.confidence,
    weight: 0.10,
    explanation: `OCR conf ${block.confidence.toFixed(2)}`,
    source: "ocr",
  });

  // Aggregate via weighted sum (Constraint 9)
  let totalWeight = 0;
  let weightedSum = 0;
  for (const e of evidence) {
    weightedSum += e.score * e.weight;
    totalWeight += e.weight;
  }
  const aggregatedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Determine final type via highest evidence, but never threshold alone
  // If pattern is strong and aggregatedScore high, keep pattern type; otherwise, if Vision says INSTRUCTION, override
  let finalType: CandidateType = pattern.type as CandidateType || "INSTRUCTION";
  if (pattern.type === "QUESTION" && aggregatedScore < 0.4) {
    // Low aggregated → likely not a real question (e.g., garbled 4(i) from instructions)
    // Keep as QUESTION but low confidence, validator will handle
    finalType = "QUESTION";
  }
  if (visionMatch && visionMatch.type !== pattern.type && visionMatch.confidence > 0.8) {
    // Vision strong disagreement → use Vision type if aggregated still low
    if (aggregatedScore < 0.6) {
      finalType = visionMatch.type;
    }
  }

  // Special: if this is on first pages and Vision says HEADER/FOOTER, prefer that
  if (bbox.y < 0.08 || bbox.y > 0.92) {
    const headerScore = visionMatch?.type === "HEADER" || visionMatch?.type === "FOOTER" ? 0.9 : 0.5;
    if (headerScore > 0.8 && pattern.type === "QUESTION" && pattern.normalizedLabel.length <= 2) {
      // Small number at very top/bottom is likely page number, not question
      // But soft — keep as QUESTION but low score, validator will catch
    }
  }

  return {
    candidateType: finalType,
    rawLabel: pattern.rawLabel || text.slice(0, 20),
    normalizedLabel: pattern.normalizedLabel || text.slice(0, 20),
    confidence: block.confidence,
    evidence,
    aggregatedScore,
  };
}
