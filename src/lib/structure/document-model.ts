/**
 * Document Model — hierarchical global structure
 * Constraint 3: Document → Sections → Questions → Subparts/Options/OR/Continuations
 * Constraint 4: Page-level first, then global reconciliation
 * Constraint 8: Keep raw/normalized/visual provenance
 * Constraint 15: Inspectable artifacts
 */
import type { NormalizedBox } from "@/types";

export type CandidateType =
  | "QUESTION"
  | "SUBPART"
  | "OPTION"
  | "INSTRUCTION"
  | "HEADER"
  | "FOOTER"
  | "INTERNAL_CHOICE"
  | "DIAGRAM"
  | "CONTINUATION"
  | "SECTION";

export interface OcrBlockRef {
  id: string; // e.g., ocr-p006-b31
  text: string; // rawOCRText
  normalizedText: string;
  visualText?: string;
  bbox: NormalizedBox;
  polygon?: number[][];
  confidence: number;
  pageNumber: number;
}

export interface EvidenceSignal {
  type: string; // e.g., "PATTERN", "GEOMETRY_X", "VISION_LABEL", "SECTION_CONTEXT", "SEQUENCE"
  score: number; // 0..1
  weight: number; // 0..1
  explanation: string;
  source: string; // e.g., "ocr", "vision", "geometry"
}

export interface QuestionCandidate {
  // Provenance — Constraint 8
  rawOCRText: string;
  normalizedText: string;
  visualText?: string;
  confidence: number;
  sourceBlockIds: string[];
  pageNumber: number;
  bbox: NormalizedBox;
  polygon?: number[][];

  // Classification — soft evidence (Constraints 1,9)
  candidateType: CandidateType;
  rawLabel: string; // e.g., "5", " (a)", "SECTION A"
  normalizedLabel: string; // e.g., "5", "a", "A"
  evidence: EvidenceSignal[];
  aggregatedScore: number; // 0..1 weighted sum

  // Hierarchy
  parentCandidateId?: string;
  childrenIds?: string[];
  sectionLabel?: string; // e.g., "A"

  // For debugging
  isTopLevelCandidate: boolean;
}

export interface Section {
  label: string; // "A", "B", ...
  title: string; // "Section A"
  range?: [number, number]; // e.g., [1,16] derived from Vision/OCR generic regex, soft
  pageStart: number;
  pageEnd?: number;
  bbox?: NormalizedBox;
  sourceBlockIds: string[];
  questions: QuestionCandidate[];
  evidence: EvidenceSignal[];
}

export interface DocumentStructure {
  jobId: string;
  documentId: string;
  pages: number; // total pages
  sections: Section[];
  // Flat list for sequence solver
  allCandidates: QuestionCandidate[];
  // Page-level artifacts (Constraint 15)
  pageArtifacts: PageArtifact[];
}

export interface PageArtifact {
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
  renderScale: number;
  ocrBlocks: OcrBlockRef[];
  visionObservations?: VisionObservation[];
  candidates: {
    questions: QuestionCandidate[];
    subparts: QuestionCandidate[];
    options: QuestionCandidate[];
    sections: QuestionCandidate[];
    instructions: QuestionCandidate[];
  };
  finalInterpretation?: {
    questionIds: string[];
    evidence: EvidenceSignal[];
  };
  // For inspectability (Constraint 15)
  input: {
    ocrBlocks: number;
    visionObservations: number;
  };
  output: {
    candidates: number;
    topLevel: number;
  };
}

export interface VisionObservation {
  label: string;
  type: CandidateType;
  blockIds: string[]; // references to OcrBlockRef.id (Constraint 6)
  confidence: number;
  coarseBox?: [number, number, number, number]; // [x,y,w,h] 0..1
  description?: string;
  pageNumber: number;
}
