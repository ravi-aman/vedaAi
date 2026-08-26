export const OcrErrorCodes = {
  AUTH_ERROR: "OCR_AUTH_ERROR",
  BUCKET_ACCESS_ERROR: "OCR_BUCKET_ACCESS_ERROR",
  SUBMISSION_FAILED: "OCR_SUBMISSION_FAILED",
  OPERATION_TIMEOUT: "OCR_OPERATION_TIMEOUT",
  OPERATION_FAILED: "OCR_OPERATION_FAILED",
  OUTPUT_MISSING: "OCR_OUTPUT_MISSING",
  OUTPUT_PARSE_FAILED: "OCR_OUTPUT_PARSE_FAILED",
  INVALID_DOCUMENT: "OCR_INVALID_DOCUMENT",
  GCS_UPLOAD_FAILED: "OCR_GCS_UPLOAD_FAILED",
  GCS_DOWNLOAD_FAILED: "OCR_GCS_DOWNLOAD_FAILED",
  OPERATION_CANCELLED: "OCR_OPERATION_CANCELLED",
  CONFIGURATION_ERROR: "OCR_CONFIGURATION_ERROR",
} as const;

export type OcrErrorCode = (typeof OcrErrorCodes)[keyof typeof OcrErrorCodes];

export class OcrError extends Error {
  code: OcrErrorCode;
  stage?: string;
  details?: unknown;
  retryable: boolean;

  constructor(code: OcrErrorCode, message: string, details?: unknown, retryable = false) {
    super(message);
    this.name = "OcrError";
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }

  static isRetryable(error: unknown): boolean {
    return error instanceof OcrError && error.retryable;
  }
}

export function toOcrError(error: unknown, defaultCode: OcrErrorCode = OcrErrorCodes.OPERATION_FAILED): OcrError {
  if (error instanceof OcrError) return error;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("permission") || msg.includes("unauthorized") || msg.includes("403") || msg.includes("401")) {
      return new OcrError(OcrErrorCodes.AUTH_ERROR, error.message, error, false);
    }
    if (msg.includes("bucket") || msg.includes("storage") || msg.includes("gcs")) {
      return new OcrError(OcrErrorCodes.BUCKET_ACCESS_ERROR, error.message, error, true);
    }
    if (msg.includes("timeout") || msg.includes("etimedout")) {
      return new OcrError(OcrErrorCodes.OPERATION_TIMEOUT, error.message, error, true);
    }
    if (msg.includes("not found") || msg.includes("404")) {
      return new OcrError(OcrErrorCodes.OUTPUT_MISSING, error.message, error, false);
    }
    return new OcrError(defaultCode, error.message, error, true);
  }
  return new OcrError(defaultCode, String(error), error, true);
}