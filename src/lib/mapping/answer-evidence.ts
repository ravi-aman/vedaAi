/**
 * AnswerEvidence — canonical multi-signal answer representation (Phase 2,3,4,5,26)
 * Preserves raw + normalized + visual provenance (Phase 26), separates ANSWER_PRESENT vs QUESTION_LABEL_DETECTED (Phase 3)
 */
import type { NormalizedBox } from "@/types";
import type { DocumentPage } from "@/types";

export type AnswerPresentType = "REAL_ANSWER" | "ROUGH_WORK" | "DIAGRAM" | "CONTINUATION" | "UNRELATED" | "BLANK" | "UNKNOWN";
export type LabelClassification = "LABEL_CONFIRMED" | "LABEL_PROBABLE" | "LABEL_ABSENT" | "LABEL_UNREADABLE" | "LABEL_CONFLICT";
export type AnswerType = "MCQ_OPTION" | "NUMERICAL" | "DERIVATION" | "TEXT_EXPLANATION" | "DIAGRAM" | "CASE_STUDY_PART" | "LONG_ANSWER" | "ROUGH_WORK" | "UNKNOWN";

export interface LabelCandidate {
  rawText: string;
  normalizedText: string;
  pageNumber: number;
  bbox: NormalizedBox;
  OCRConfidence: number;
  visionInterpretation?: string;
  visionConfidence?: number;
  positionScore: number;
  handwritingScore: number;
  contextScore: number;
  sequenceScore: number;
  finalLabel: string | null;
  confidence: number;
  classification: LabelClassification;
  evidence: Array<{ signal: string; score: number; explanation: string }>;
}

export interface AnswerEvidence {
  answerGroupId: string;
  pageNumbers: number[];
  sourceBlockIds: string[];
  rawOCRText: string;
  normalizedText: string;
  visualText?: string;
  detectedLabels: LabelCandidate[];
  labelConfidence: number; // max of detectedLabels confidence or 0
  answerType: AnswerType;
  presentType: AnswerPresentType;
  handwritingConfidence: number;
  continuationInfo?: { isContinuation: boolean; prevPageEndY?: number; nextPageStartY?: number; sequentialPages: boolean };
  sequencePosition: number; // orderIndex
  sectionHint?: string;
  subpartHint?: string; // e.g., "(a)" or "(i)"
  diagramPresent: boolean;
  geometry: { boxesByPage: Map<number, NormalizedBox[]>; unionByPage: Map<number, NormalizedBox> };
  visionEvidence?: { answerHints: any[]; visualRegions: any[] };
  provenance: { ocrBlocks: number; visionHints: number; source: string };
  // Four separated concepts (Phase 3)
  ANSWER_PRESENT: boolean;
  ANSWER_DETECTED: boolean;
  QUESTION_LABEL_DETECTED: boolean;
  ANSWER_MAPPED?: boolean;
}

export interface QuestionEvidence {
  questionId: string;
  number: string;
  normalizedNumber: string;
  section?: string;
  type: AnswerType;
  textOCR: string;
  textVision?: string;
  normalizedText: string;
  options?: Array<{ label: string; text: string }>;
  subparts?: string[];
  sourcePages: number[];
  sourceBlockIds: string[];
  geometry: NormalizedBox[];
  marks?: number;
  structuralEvidence: any[];
  questionKind?: string; // TOP_LEVEL_QUESTION etc
}

export function classifyPresentType(ev: Partial<AnswerEvidence> & { rawOCRText: string; normalizedText: string; diagramPresent: boolean; geometry: any }): AnswerPresentType {
  const text = ev.normalizedText.trim();
  const raw = ev.rawOCRText.trim();
  if (!raw && !ev.diagramPresent) return "BLANK";
  if (/Space for writing|Question Number|Rough work|SECTION\s*[A-E]/i.test(raw)) return "UNRELATED";
  if (ev.diagramPresent && text.length < 15) return "DIAGRAM";
  if (text.length < 8 && !ev.diagramPresent) return "UNKNOWN";
  // Handwriting密度: if contains many words and handwritingConfidence >0.6 → REAL_ANSWER
  if (text.length > 20) return "REAL_ANSWER";
  if (text.length > 10) return "REAL_ANSWER";
  return "UNKNOWN";
}

export function buildLabelCandidates(opts: {
  rawText: string;
  bbox: NormalizedBox;
  pageNumber: number;
  ocrConfidence: number;
  visionHints: any[];
  positionScore?: number;
  contextScore?: number;
}): LabelCandidate {
  const { rawText, bbox, pageNumber, ocrConfidence, visionHints } = opts;
  const t = rawText.trim();
  const positionScore = opts.positionScore ?? (bbox.x < 0.08 ? 0.95 : bbox.x < 0.14 ? 0.85 : bbox.x < 0.20 ? 0.5 : 0.2);
  let visionInterpretation: string | undefined;
  let visionConfidence: number | undefined;
  const vh = visionHints.find((v) => v.labelHint === t || v.relatedQuestionLabel === t || v.blockIds?.includes(rawText));
  if (vh) {
    visionInterpretation = vh.labelHint || vh.relatedQuestionLabel;
    visionConfidence = vh.confidence;
  }
  // Pattern-based finalLabel
  let finalLabel: string | null = null;
  let evidence: LabelCandidate["evidence"] = [];
  // Use Ans/Q/bare patterns similar to detectAnswerLabelV2 but as soft signals
  const ansM = t.match(/^\s*Ans\.?\s*0*(\d+)\s*[\.\)]?\s*$/i);
  const qM = t.match(/^\s*Q\.?\s*0*(\d+)\s*[\.\)]?\s*$/i);
  const bareDot = t.match(/^\s*0*(\d+)\s*[\.\)]\s*$/);
  if (ansM) {
    finalLabel = ansM[1];
    evidence.push({ signal: "PATTERN_Ans", score: 0.95, explanation: `Ans pattern ${t}` });
  } else if (qM) {
    finalLabel = qM[1];
    evidence.push({ signal: "PATTERN_Q", score: 0.9, explanation: `Q pattern ${t}` });
  } else if (bareDot && bbox.x < 0.18) {
    finalLabel = bareDot[1];
    evidence.push({ signal: "PATTERN_bareDot", score: 0.75, explanation: `bare ${t} x=${bbox.x.toFixed(2)}` });
  } else if (/^\s*\d+\s*$/.test(t) && t.length <= 2) {
    finalLabel = t.trim();
    evidence.push({ signal: "PATTERN_bareDigit", score: 0.25, explanation: `bare digit ${t} low` });
  }
  evidence.push({ signal: "POSITION", score: positionScore, explanation: `x=${bbox.x.toFixed(3)}` });
  if (visionConfidence !== undefined) evidence.push({ signal: "VISION", score: visionConfidence, explanation: `Vision ${visionInterpretation}` });
  evidence.push({ signal: "OCR_CONF", score: ocrConfidence, explanation: `OCR ${ocrConfidence.toFixed(2)}` });

  let classification: LabelClassification = "LABEL_ABSENT";
  let confidence = 0;
  if (finalLabel) {
    const n = parseInt(finalLabel, 10);
    if (isNaN(n) || n < 1 || n > 100) classification = "LABEL_UNREADABLE";
    else if ((evidence.find((e) => e.signal.startsWith("PATTERN"))?.score ?? 0) >= 0.85 && positionScore > 0.5) {
      classification = "LABEL_CONFIRMED";
      confidence = Math.min(0.95, (ocrConfidence * 0.5 + positionScore * 0.3 + (visionConfidence || 0.5) * 0.2));
    } else if ((evidence.find((e) => e.signal.startsWith("PATTERN"))?.score ?? 0) >= 0.6) {
      classification = "LABEL_PROBABLE";
      confidence = 0.65;
    } else if (finalLabel && (evidence.find((e) => e.signal === "PATTERN_bareDigit")?.score ?? 0) === 0.25) {
      classification = "LABEL_UNREADABLE";
      confidence = 0.25;
    } else classification = "LABEL_CONFLICT";
  } else {
    classification = "LABEL_ABSENT";
    confidence = 0.15;
  }
  return {
    rawText: t,
    normalizedText: finalLabel || t,
    pageNumber,
    bbox,
    OCRConfidence: ocrConfidence,
    visionInterpretation,
    visionConfidence,
    positionScore,
    handwritingScore: ocrConfidence,
    contextScore: opts.contextScore ?? 0.5,
    sequenceScore: 0.5,
    finalLabel,
    confidence,
    classification,
    evidence,
  };
}
