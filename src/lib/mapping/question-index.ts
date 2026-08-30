/**
 * QuestionIndex — canonical normalized representation (Phase 7)
 * Uses Vision-normalized + OCR-normalized text + source image when ambiguity
 */
import type { QuestionNode } from "@/types";
import type { QuestionEvidence } from "./answer-evidence";

export interface QuestionIndexEntry extends QuestionEvidence {
  orderIndex: number;
  isMCQ: boolean;
  isCaseStudy: boolean;
  isLongAnswer: boolean;
}

export function buildQuestionIndex(questions: QuestionNode[]): Map<string, QuestionIndexEntry> {
  const map = new Map<string, QuestionIndexEntry>();
  for (const q of questions) {
    // MCQ detection: Section A or has options or text contains (A)(B)(C)(D)
    const hasOptions = (q.options && q.options.length >= 2) || /\([A-D]\)/.test(q.text);
    const hasOptionsMatch = !!(q.normalizedNumber.match(/^\d+$/) && parseInt(q.normalizedNumber,10) <= 16);
    const isMCQ = !!(hasOptions || (q.section === "A" || hasOptionsMatch));
    const isCaseStudy = q.normalizedNumber === "29" || q.normalizedNumber === "30" || /case study/i.test(q.text);
    const isLong = !!(q.marks !== undefined && q.marks >= 4 || isCaseStudy || q.normalizedNumber >= "31");
    const entry: QuestionIndexEntry = {
      questionId: q.id,
      number: q.displayNumber || q.normalizedNumber,
      normalizedNumber: q.normalizedNumber,
      section: q.section,
      type: isMCQ ? "MCQ_OPTION" : isCaseStudy ? "CASE_STUDY_PART" : isLong ? "LONG_ANSWER" : "TEXT_EXPLANATION",
      textOCR: q.rawText || q.text,
      textVision: (q as any).visualText,
      normalizedText: q.normalizedText || q.text,
      options: q.options?.map((o) => ({ label: o.label, text: o.text })),
      subparts: q.children || [],
      sourcePages: q.sourcePageNumbers || [],
      sourceBlockIds: [], // filled from sourceRegions if available
      geometry: q.sourceRegions || [],
      marks: q.marks,
      structuralEvidence: q.evidence || [],
      questionKind: q.kind,
      orderIndex: q.orderIndex,
      isMCQ,
      isCaseStudy,
      isLongAnswer: !!isLong,
    };
    map.set(q.id, entry);
    // Also index by normalizedNumber for label lookup
    map.set(`num:${q.normalizedNumber}`, entry as any);
  }
  return map;
}

export function getQuestionByNumber(idx: Map<string, QuestionIndexEntry>, num: string): QuestionIndexEntry | undefined {
  return idx.get(`num:${num}`);
}
