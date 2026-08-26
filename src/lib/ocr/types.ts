export interface OcrPageResult {
  pageNumber: number;
  text: string;
  blocks: OcrBlock[];
  confidence: number;
  width: number;
  height: number;
  rotation: number;
}

export interface OcrBlock {
  boundingBox: NormalizedBox;
  paragraphs: OcrParagraph[];
  confidence: number;
}

export interface OcrParagraph {
  boundingBox: NormalizedBox;
  words: OcrWord[];
  confidence: number;
}

export interface OcrWord {
  boundingBox: NormalizedBox;
  symbols: OcrSymbol[];
  confidence: number;
  text: string;
}

export interface OcrSymbol {
  boundingBox: NormalizedBox;
  text: string;
  confidence: number;
  property?: {
    detectedBreak?: {
      type: "SPACE" | "SURE_SPACE" | "EOL_SURE_SPACE" | "HYPHEN" | "LINE_BREAK";
      isPrefix: boolean;
    };
  };
}

export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrDocumentResult {
  jobId: string;
  documentId: string;
  kind: "questionPaper" | "answerSheet";
  pages: OcrPageResult[];
  provider: "google-cloud-vision";
  providerVersion: string;
  operationId: string;
  completedAt: string;
}

export interface OcrOperationStatus {
  operationId: string;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED" | "CANCELLED";
  progress?: number;
  error?: {
    code: string;
    message: string;
  };
  outputUri?: string;
}

export interface SubmitOcrRequest {
  jobId: string;
  documentId: string;
  kind: "questionPaper" | "answerSheet";
  gcsInputUri: string;
  mimeType: "application/pdf" | "image/tiff" | "image/png" | "image/jpeg";
  pageCount: number;
}

export interface OcrProvider {
  submitDocument(request: SubmitOcrRequest): Promise<{ operationId: string; outputUri: string }>;
  getOperationStatus(operationId: string): Promise<OcrOperationStatus>;
  getOperationResult(operationId: string, outputUri: string): Promise<OcrDocumentResult>;
  cancelOperation(operationId: string): Promise<void>;
}