export type DocumentKind = "questionPaper" | "answerSheet";
export type ProcessingStage =
  | "CREATED"
  | "UPLOADING"
  | "UPLOADED"
  | "VALIDATING"
  | "PREPROCESSING"
  | "OCR_SUBMITTED"
  | "OCR_PROCESSING"
  | "OCR_COMPLETED"
  | "OCR_FAILED"
  | "EXTRACTING"
  | "STRUCTURING"
  | "MATCHING"
  | "LOCALIZING"
  | "VALIDATING_RESULT"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type DecisionStatus =
  | "MATCHED"
  | "UNCERTAIN"
  | "UNMATCHED"
  | "UNANSWERED"
  | "PARTIAL"
  | "CONTINUATION"
  | "DUPLICATE"
  | "INVALID";

export type EvidenceType =
  | "EXPLICIT_QUESTION_LABEL"
  | "SEMANTIC_SIMILARITY"
  | "LAYOUT_CONTINUITY"
  | "PAGE_CONTINUITY"
  | "SECTION_MATCH"
  | "SUBQUESTION_MATCH"
  | "NEIGHBOR_CONTEXT"
  | "OCR_CONFIDENCE"
  | "VISUAL_EVIDENCE"
  | "QUESTION_ORDER";

export interface NormalizedBox {
  x: number; // 0..1
  y: number;
  width: number;
  height: number;
}

export interface DocumentPage {
  id: string;
  documentId: string;
  pageNumber: number; // 1-indexed
  width: number;
  height: number;
  rotation: number; // 0/90/180/270
  artifactId?: string;
}

export interface Document {
  id: string;
  jobId: string;
  kind: DocumentKind;
  originalName: string;
  mime: string;
  size: number;
  pageCount: number;
  pageIds: string[];
  createdAt: string;
}

export interface PageArtifact {
  id: string;
  pageId: string;
  originalDimensions: { width: number; height: number };
  processingDimensions: { width: number; height: number };
  displayDimensions?: { width: number; height: number };
  rotation: number;
  imageBufferId?: string;
}

export interface QuestionNode {
  id: string;
  sourceDocumentId: string;
  pageRefs: string[]; // pageIds
  sourceRegions: NormalizedBox[];
  rawNumber: string;
  normalizedNumber: string;
  text: string;
  rawText: string;
  normalizedText: string;
  parentQuestionId?: string;
  partType?: "SECTION" | "QUESTION" | "PART" | "SUBPART";
  orderIndex: number;
  depth: number;
  section?: string;
  marks?: number;
  confidence: number;
  evidence: Evidence[];
}

export interface AnswerRegion {
  id: string;
  documentId: string;
  pageId: string;
  regionType: "HANDWRITING" | "DIAGRAM" | "MIXED" | "CROSSED_OUT";
  rawText: string;
  normalizedText: string;
  interpretedText?: string;
  sourceBoxes: NormalizedBox[];
  normalizedBoxes: NormalizedBox[];
  polygon?: number[][];
  questionLabel?: string;
  labelConfidence?: number;
  ocrConfidence?: number;
  visualConfidence?: number;
  orderIndex: number;
  continuationGroupId?: string;
  parentRegionId?: string;
}

export interface AnswerGroup {
  id: string;
  documentId: string;
  regions: AnswerRegion[];
  primaryRegionId: string;
  continuationGroupId?: string;
  normalizedText: string;
  mappedQuestionId?: string;
}

export interface Evidence {
  type: EvidenceType;
  source: string;
  score: number; // 0..1
  explanation: string;
  reliability: number; // 0..1 weight
  metadata?: Record<string, unknown>;
}

export interface MappingCandidate {
  questionId: string;
  answerGroupId: string;
  evidence: Evidence[];
  score: number;
}

export interface MappingDecision {
  id: string;
  questionId: string;
  answerGroupId?: string;
  answerIds: string[];
  primaryAnswerId?: string;
  status: DecisionStatus;
  confidence?: number;
  mappingConfidence?: number;
  evidence: Evidence[];
  reason?: string;
  highlightRegions: HighlightRegion[];
}

export interface HighlightRegion {
  pageId: string;
  boxes: NormalizedBox[];
  polygon?: number[][];
  confidence: number;
  source: string;
}

export interface ProcessingError {
  code: string;
  message: string;
  stage: ProcessingStage;
  details?: unknown;
  timestamp: string;
}

export interface ProcessingJob {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: ProcessingStage;
  currentStage: ProcessingStage;
  questionPaperFileId?: string;
  answerSheetFileId?: string;
  questionPaperDocId?: string;
  answerSheetDocId?: string;
  // SaaS ownership
  guestSessionId?: string | null;
  userId?: string | null;
  claimedAt?: string | null;
  progress: {
    stageStates: Record<ProcessingStage, "pending" | "in_progress" | "completed" | "failed" | "skipped">;
    currentStageProgress?: number;
  };
  error?: ProcessingError;
  pipelineVersion: string;
  modelVersion?: string;
  promptVersion?: string;
  // OCR metadata (Google Vision async)
  ocrOperationId?: string;
  ocrOutputUri?: string;
  ocrInputUri?: string;
  ocrAttempt?: number;
  ocrStartedAt?: string;
  ocrCompletedAt?: string;
  ocrErrorCode?: string;
  ocrPageCount?: number;
}

export interface QuestionResult {
  question: QuestionNode;
  status: DecisionStatus;
  answerIds: string[];
  primaryAnswerId?: string;
  mappingConfidence?: number;
  highlightRegions: HighlightRegion[];
  evidence: Evidence[];
}

export interface AnswerResult {
  id: string;
  status: DecisionStatus;
  text: string;
  regions: AnswerRegion[];
  mappedQuestionId?: string;
  confidence?: number;
  evidence?: Evidence[];
}

export interface ProcessingResult {
  jobId: string;
  questions: QuestionNode[];
  answers: AnswerGroup[];
  decisions: MappingDecision[];
  questionResults: QuestionResult[];
  answerResults: AnswerResult[];
  unmatchedAnswers: AnswerGroup[];
  unansweredQuestions: QuestionNode[];
}
