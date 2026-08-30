export type DocumentKind = "questionPaper" | "answerSheet";
export type ProcessingStage =
  | "CREATED"
  | "UPLOADING"
  | "UPLOADED"
  | "QUEUED"
  | "VALIDATING"
  | "PREPROCESSING"
  | "OCR_SUBMITTED"
  | "OCR_PROCESSING"
  | "OCR_COMPLETED"
  | "OCR_FAILED"
  | "VISION"
  | "FUSION"
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

export type DocumentRole = "QUESTION_PAPER" | "ANSWER_SHEET" | "MARKING_SCHEME" | "SOLUTION" | "UNKNOWN";

export interface Document {
  id: string;
  jobId: string;
  kind: DocumentKind;
  detectedRole?: DocumentRole;
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

export interface QuestionOption {
  label: string; // A, B, C, D
  text: string;
  rawText: string;
  bbox?: NormalizedBox;
}

export type QuestionKind = "TOP_LEVEL_QUESTION" | "SUBQUESTION" | "OPTION" | "INSTRUCTION" | "SECTION" | "HEADER" | "FOOTER" | "FIGURE" | "TABLE" | "MARKS";

export interface QuestionNode {
  id: string;
  sourceDocumentId: string;
  pageRefs: string[]; // pageIds
  sourceRegions: NormalizedBox[];
  rawNumber: string;
  normalizedNumber: string;
  displayNumber: string;
  text: string;
  rawText: string;
  normalizedText: string;
  parentQuestionId?: string;
  partType?: "SECTION" | "QUESTION" | "PART" | "SUBPART" | "OPTION" | "INSTRUCTION" | "HEADER" | "FOOTER";
  kind?: QuestionKind;
  orderIndex: number;
  depth: number;
  section?: string;
  marks?: number;
  confidence: number;
  evidence: Evidence[];
  options?: QuestionOption[];
  children?: string[]; // child question ids (populated after tree build)
  // provenance
  sourcePageNumbers?: number[];
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
  // Durable queue / heartbeat (Phase 10-11)
  heartbeatAt?: string | null;
  claimedBy?: string | null;
  attemptCount?: number;
  queuedAt?: string | null;
  startedAt?: string | null;
  progress: {
    stageStates: Record<ProcessingStage, "pending" | "in_progress" | "completed" | "failed" | "skipped">;
    currentStageProgress?: number;
    docStageStates?: Record<string, Record<string, string>>;
  };
  error?: ProcessingError;
  pipelineVersion: string;
  modelVersion?: string;
  promptVersion?: string;
  // OCR metadata (Amazon Textract async)
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
