/**
 * Evidence Model — multi-dimensional scoring (Phase 17,18)
 * Dimensions: EXPLICIT_LABEL, VISION_LABEL, SUBPART_LABEL, OPTION_MATCH, SEMANTIC_TEXT, VISION_SEMANTIC,
 * SECTION, QUESTION_TYPE, MARKS, SEQUENCE, PAGE_CONTINUITY, SPATIAL_CONTINUITY, HANDWRITING_LAYOUT,
 * ANSWER_LENGTH, DIAGRAM_COMPATIBILITY, OCR_CONFIDENCE, VISION_CONFIDENCE, ANCHOR_CONSISTENCY
 */
import type { Evidence } from "@/types";
import { buildEvidence } from "@/lib/evidence/aggregate";
import type { AnswerEvidence, QuestionEvidence } from "./answer-evidence";
import type { QuestionIndexEntry } from "./question-index";

export type EvidenceDimension =
  | "EXPLICIT_LABEL"
  | "VISION_LABEL"
  | "SUBPART_LABEL"
  | "OPTION_MATCH"
  | "SEMANTIC_TEXT"
  | "VISION_SEMANTIC"
  | "SECTION"
  | "QUESTION_TYPE"
  | "MARKS"
  | "SEQUENCE"
  | "PAGE_CONTINUITY"
  | "SPATIAL_CONTINUITY"
  | "HANDWRITING_LAYOUT"
  | "ANSWER_LENGTH"
  | "DIAGRAM_COMPATIBILITY"
  | "OCR_CONFIDENCE"
  | "VISION_CONFIDENCE"
  | "ANCHOR_CONSISTENCY";

export function buildExplicitLabelEvidence(aev: AnswerEvidence, q: QuestionIndexEntry): Evidence {
  if (aev.detectedLabels.length === 0 || !aev.QUESTION_LABEL_DETECTED) {
    return buildEvidence("EXPLICIT_QUESTION_LABEL", "label-classifier", 0.15, "No confident label detected — not UNANSWERED, need other evidence", 0.35);
  }
  const best = [...aev.detectedLabels].sort((x, y) => y.confidence - x.confidence)[0];
  if (!best.finalLabel) return buildEvidence("EXPLICIT_QUESTION_LABEL", "label-classifier", 0.18, "Label unreadable", 0.4);
  const label = best.finalLabel;
  if (label === q.normalizedNumber) {
    const conf = best.classification === "LABEL_CONFIRMED" ? 0.96 : best.classification === "LABEL_PROBABLE" ? 0.85 : 0.6;
    return buildEvidence("EXPLICIT_QUESTION_LABEL", "label-classifier", conf, `Label ${label} matches Q${q.normalizedNumber} (${best.classification})`, best.classification === "LABEL_CONFIRMED" ? 3.8 : 1.8);
  }
  // Partial like "3" vs "30" — must NOT be treated as strong
  if (q.normalizedNumber.startsWith(label) && label.length === 1 && q.normalizedNumber.length === 2) {
    return buildEvidence("EXPLICIT_QUESTION_LABEL", "label-classifier", 0.32, `Partial label ${label} vs ${q.normalizedNumber} — weak, likely contaminated`, 0.6);
  }
  if (label.length === 1 && q.normalizedNumber.length === 2) {
    return buildEvidence("EXPLICIT_QUESTION_LABEL", "label-classifier", 0.28, `Single digit ${label} vs two-digit ${q.normalizedNumber} — mismatch`, 0.6);
  }
  if (label === q.normalizedNumber.replace(/\(.*\)/, "")) {
    return buildEvidence("EXPLICIT_QUESTION_LABEL", "label-classifier", 0.7, `Base number matches ${label} vs ${q.normalizedNumber} (subpart)`, 1.2);
  }
  const numA = parseInt(label.replace(/\D/g, ""), 10);
  const numQ = parseInt(q.normalizedNumber.replace(/\D/g, ""), 10);
  if (!isNaN(numA) && !isNaN(numQ) && numA === numQ) {
    return buildEvidence("EXPLICIT_QUESTION_LABEL", "label-classifier", 0.45, `Same number different prefix ${label} vs ${q.normalizedNumber}`, 0.7);
  }
  return buildEvidence("EXPLICIT_QUESTION_LABEL", "label-classifier", 0.12, `Label ${label} does not match ${q.normalizedNumber}`, 0.85);
}

export function buildOptionMatchEvidence(aev: AnswerEvidence, q: QuestionIndexEntry): Evidence {
  if (!q.isMCQ || !q.options || q.options.length === 0) {
    return buildEvidence("SEMANTIC_SIMILARITY", "mcq-mapper", 0.15, "Not MCQ or no options", 0.2);
  }
  const text = (aev.normalizedText + " " + aev.rawOCRText).toUpperCase();
  // Detect selected option like (C) or C) or  C  with option text
  let matched: string | null = null;
  let score = 0.15;
  for (const opt of q.options) {
    const label = opt.label.toUpperCase();
    const optTextNorm = opt.text.slice(0, 30).toUpperCase().trim();
    // Check marker
    const markerRe = new RegExp(`\\(?\\s*${label}\\s*[\\)\\.\\]]`);
    if (markerRe.test(text)) {
      matched = label;
      score = 0.92;
      break;
    }
    // Check option text content (e.g., "0.196" for C)
    if (optTextNorm.length > 3 && text.includes(optTextNorm.slice(0, 10))) {
      // e.g., answer contains "0.196"
      const numericTokens = opt.text.match(/[\d\.]+/g);
      if (numericTokens && numericTokens.some((tok) => text.includes(tok) && tok.length >= 3)) {
        matched = label;
        score = 0.88;
        break;
      }
    }
    // Short answer single char A/B/C/D
    if (text.trim() === label || text.trim() === `(${label})`) {
      matched = label;
      score = 0.85;
      break;
    }
  }
  if (matched) {
    // Also verify that stripped option text appears
    const opt = q.options.find((o) => o.label.toUpperCase() === matched);
    return buildEvidence("SEMANTIC_SIMILARITY", "mcq-mapper", score, `Option ${matched} matched for Q${q.normalizedNumber} (${opt?.text.slice(0, 20)})`, 2.2);
  }
  return buildEvidence("SEMANTIC_SIMILARITY", "mcq-mapper", 0.18, "No MCQ option match", 0.4);
}

export function buildSemanticEvidence(aev: AnswerEvidence, q: QuestionIndexEntry): Evidence {
  const qWords = new Set(q.normalizedText.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const aWords = new Set(aev.normalizedText.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  let inter = 0;
  for (const w of aWords) if (qWords.has(w)) inter++;
  const union = qWords.size + aWords.size - inter;
  const jaccard = union === 0 ? 0 : inter / union;
  // For long answers, semantic matters more; for MCQ, not.
  const base = q.isMCQ ? 0.4 : 0.7;
  if (jaccard > 0.08) {
    const s = Math.min(0.82, jaccard + 0.35);
    return buildEvidence("SEMANTIC_SIMILARITY", "semantic", s, `Semantic overlap ${jaccard.toFixed(2)}`, q.isMCQ ? 0.35 : 0.9);
  }
  if (aev.normalizedText.length > 100 && q.normalizedText.length > 40 && jaccard < 0.03) {
    // Long answer with no overlap maybe still same topic but OCR garbled — keep low but not penalize hard
    return buildEvidence("SEMANTIC_SIMILARITY", "semantic", 0.25, "Low overlap but long answer — not decisive", 0.4);
  }
  return buildEvidence("SEMANTIC_SIMILARITY", "semantic", 0.18, "Low semantic overlap", 0.5);
}

export function buildSectionEvidence(aev: AnswerEvidence, q: QuestionIndexEntry, answerSectionHint?: string): Evidence {
  if (!q.section || !answerSectionHint) return buildEvidence("SECTION_MATCH", "section", 0.5, "No section hint", 0.3);
  if (q.section === answerSectionHint) return buildEvidence("SECTION_MATCH", "section", 0.85, `Section ${q.section} matches`, 0.9);
  return buildEvidence("SECTION_MATCH", "section", 0.35, `Section ${answerSectionHint} vs Q section ${q.section}`, 0.6);
}

export function buildTypeEvidence(aev: AnswerEvidence, q: QuestionIndexEntry): Evidence {
  const aType = aev.answerType;
  const qType = q.type;
  if (aType === "UNKNOWN" || qType === "UNKNOWN") return buildEvidence("SEMANTIC_SIMILARITY", "type", 0.5, "Unknown type", 0.3);
  if (aType === qType) return buildEvidence("SEMANTIC_SIMILARITY", "type", 0.78, `Type ${qType} compatible`, 0.8);
  if (aType === "MCQ_OPTION" && q.isMCQ) return buildEvidence("SEMANTIC_SIMILARITY", "type", 0.85, "MCQ compatible", 1.0);
  if (aType === "DIAGRAM" && q.normalizedText.toLowerCase().includes("diagram")) return buildEvidence("VISUAL_EVIDENCE", "type", 0.82, "Diagram compatibility", 0.9);
  if (aType === "LONG_ANSWER" && q.isMCQ) return buildEvidence("SEMANTIC_SIMILARITY", "type", 0.25, `Long answer vs MCQ mismatch`, 0.9);
  return buildEvidence("SEMANTIC_SIMILARITY", "type", 0.45, `Type ${aType} vs ${qType} neutral`, 0.4);
}

export function buildSequenceEvidence(aev: AnswerEvidence, q: QuestionIndexEntry, anchorContext?: { anchorBefore?: string; anchorAfter?: string; distance?: number }): Evidence {
  if (!anchorContext) return buildEvidence("LAYOUT_CONTINUITY", "sequence", 0.5, "No anchor context", 0.25);
  const { anchorBefore, anchorAfter } = anchorContext;
  const qNum = parseInt(q.normalizedNumber, 10);
  if (isNaN(qNum)) return buildEvidence("LAYOUT_CONTINUITY", "sequence", 0.5, "Non-numeric question", 0.2);
  if (anchorBefore) {
    const beforeNum = parseInt(anchorBefore, 10);
    if (!isNaN(beforeNum) && qNum > beforeNum && anchorAfter) {
      const afterNum = parseInt(anchorAfter, 10);
      if (!isNaN(afterNum) && qNum < afterNum) {
        const expectedCount = afterNum - beforeNum - 1;
        return buildEvidence("LAYOUT_CONTINUITY", "sequence", 0.75, `Between anchors ${beforeNum}..${afterNum}, Q${qNum} plausible`, 0.85);
      }
    }
    if (!isNaN(beforeNum) && qNum === beforeNum + 1) return buildEvidence("LAYOUT_CONTINUITY", "sequence", 0.72, `Sequential after anchor ${beforeNum}`, 0.7);
  }
  return buildEvidence("LAYOUT_CONTINUITY", "sequence", 0.42, "Sequence not strong", 0.35);
}

export function buildPageContinuityEvidence(aev: AnswerEvidence, q: QuestionIndexEntry): Evidence {
  if (aev.pageNumbers.length > 1) {
    // Multi-page answers are long → strong for long questions
    if (q.isLongAnswer) return buildEvidence("PAGE_CONTINUITY", "page", 0.78, `Multi-page ${aev.pageNumbers.length}p matches long Q${q.normalizedNumber}`, 0.7);
    if (q.isMCQ) return buildEvidence("PAGE_CONTINUITY", "page", 0.28, `Multi-page vs MCQ mismatch`, 0.8);
  }
  return buildEvidence("PAGE_CONTINUITY", "page", 0.5, "Single page neutral", 0.25);
}

export function buildHandwritingEvidence(aev: AnswerEvidence): Evidence {
  const conf = aev.handwritingConfidence;
  if (aev.presentType === "REAL_ANSWER") return buildEvidence("OCR_CONFIDENCE", "handwriting", Math.max(0.65, conf), `Real answer detected conf ${conf.toFixed(2)}`, 0.65);
  if (aev.presentType === "ROUGH_WORK") return buildEvidence("OCR_CONFIDENCE", "handwriting", 0.35, "Rough work", 0.6);
  if (aev.presentType === "DIAGRAM") return buildEvidence("VISUAL_EVIDENCE", "handwriting", 0.72, "Diagram present", 0.7);
  return buildEvidence("OCR_CONFIDENCE", "handwriting", conf, `Handwriting conf ${conf.toFixed(2)}`, 0.45);
}

// Weighting: context-sensitive (Phase 18)
export function contextWeights(q: QuestionIndexEntry): Record<string, number> {
  if (q.isMCQ) {
    return {
      EXPLICIT_LABEL: 2.0, // still strong but validated label
      OPTION_MATCH: 2.5,
      SEQUENCE: 1.1,
      ANCHOR_CONSISTENCY: 1.2,
      SEMANTIC: 0.35,
      SECTION: 0.6,
      PAGE_CONTINUITY: 0.3,
      HANDWRITING: 0.4,
      TYPE: 0.7,
    };
  }
  if (q.isLongAnswer) {
    return {
      EXPLICIT_LABEL: 1.8,
      SEMANTIC: 1.1,
      SECTION: 0.9,
      PAGE_CONTINUITY: 0.85,
      SUBPART: 1.0,
      SEQUENCE: 0.75,
      HANDWRITING: 0.6,
      OPTION_MATCH: 0.2,
      ANCHOR: 0.8,
    };
  }
  // default short/medium
  return {
    EXPLICIT_LABEL: 2.2,
    SEMANTIC: 0.9,
    SECTION: 0.7,
    SEQUENCE: 0.7,
    PAGE_CONTINUITY: 0.5,
    HANDWRITING: 0.5,
    OPTION_MATCH: 0.4,
    TYPE: 0.6,
  };
}
