/**
 * Textract OCR Provider — AWS Textract path for OCR_PROVIDER=aws / textract
 *
 * Implements LocalOcrProvider (processDocument) via:
 *   S3 staging (upload PDF) -> Textract StartDocumentAnalysis/TextDetection -> poll -> GetDocumentAnalysis
 *
 * NO PaddleOCR, NO Python worker when this provider is active.
 * Mirrors legacy/src/lib/ocr/legacy/textract.ts logic but exposes the
 * modern LocalOcrProvider interface so runner can call processDocument
 * uniformly for both local and aws engines.
 */

import { getConfig, requireAwsOcrConfig } from "@/lib/config";
import { jobStore, documentStore, fileStorage } from "@/lib/storage";
import { OcrError, OcrErrorCodes } from "./errors";
import type { OcrDocumentResult, LocalOcrProvider } from "./types";
import { uploadBufferToS3 } from "./legacy/s3";
import { TextractOcrProvider as LegacyTextractProvider } from "./legacy/textract";

/** Detect mime from buffer magic + fallback to document mime */
async function detectMime(buffer: Buffer, fallback?: string): Promise<"application/pdf" | "image/png" | "image/jpeg" | "image/tiff"> {
  if (buffer.slice(0, 4).toString() === "%PDF") return "application/pdf";
  // PNG magic: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (fallback) {
    if (fallback.includes("png")) return "image/png";
    if (fallback.includes("jpeg") || fallback.includes("jpg")) return "image/jpeg";
    if (fallback.includes("tiff")) return "image/tiff";
    if (fallback.includes("pdf")) return "application/pdf";
  }
  // Default to pdf for Textract async (textract will reject if wrong and fallback)
  return "application/pdf";
}

export class TextractOcrProvider implements LocalOcrProvider {
  private legacy = new LegacyTextractProvider();

  async processDocument(input: {
    jobId: string;
    documentId: string;
    kind: "questionPaper" | "answerSheet";
    pages: { pageNumber: number; imagePath: string; width: number; height: number }[];
  }): Promise<OcrDocumentResult> {
    requireAwsOcrConfig();
    const cfg = getConfig() as any;
    const jobId = input.jobId;
    const kind = input.kind;

    const bucket: string = cfg.AWS_S3_BUCKET;
    const inputPrefix: string = cfg.AWS_S3_INPUT_PREFIX || "ocr-input";
    const outputPrefix: string = cfg.AWS_S3_OUTPUT_PREFIX || "ocr-output";
    const timeoutMs: number = cfg.OCR_OPERATION_TIMEOUT_MS || 300000;
    const pollMs: number = cfg.OCR_POLL_INTERVAL_MS || 5000;
    const maxRetries: number = cfg.OCR_MAX_RETRIES || 3;

    console.log(
      JSON.stringify({
        jobId,
        stage: "OCR",
        provider: "textract",
        engine: "aws-textract",
        event: "textract_process_start",
        kind,
        pages: input.pages.length,
      }),
    );

    // Resolve file buffer: prefer job's fileId, fallback to documentId
    const job = await jobStore.get(jobId);
    if (!job) throw new OcrError(OcrErrorCodes.CONFIGURATION_ERROR, `Job ${jobId} not found for Textract OCR`, null, false);

    const fileId = kind === "questionPaper" ? (job as any).questionPaperFileId : (job as any).answerSheetFileId;
    const effectiveFileId = fileId || input.documentId;

    // Fetch document mime for better detection
    let docMime: string | undefined;
    try {
      const doc = await documentStore.get(input.documentId);
      docMime = (doc as any)?.mime;
    } catch {}

    let buffer: Buffer;
    try {
      buffer = await fileStorage.read(jobId, effectiveFileId);
    } catch (e: any) {
      throw new OcrError(OcrErrorCodes.GCS_DOWNLOAD_FAILED, `Failed to read file for Textract kind=${kind} fileId=${String(effectiveFileId).slice(0, 12)}: ${e.message}`, e, false);
    }

    if (!buffer || buffer.length === 0) {
      throw new OcrError(OcrErrorCodes.INVALID_DOCUMENT, `Empty buffer for Textract kind=${kind}`, null, false);
    }

    const mimeType = await detectMime(buffer, docMime);
    const isPdf = mimeType === "application/pdf";

    // For S3 key, keep extension consistent with mime
    const ext = isPdf ? "pdf" : mimeType === "image/png" ? "png" : mimeType === "image/jpeg" ? "jpg" : "tiff";
    const safeJob = jobId.replace(/[^a-zA-Z0-9-]/g, "");
    const inputKey = `${inputPrefix}/${safeJob}/${kind}.${ext}`;

    // Upload to S3 with retries
    let attempt = 0;
    while (true) {
      try {
        console.log(JSON.stringify({ jobId, stage: "OCR", provider: "textract", event: "s3_upload_start", kind, bucket, inputKey, sizeMb: (buffer.length / 1024 / 1024).toFixed(2), mimeType }));
        await uploadBufferToS3(bucket, inputKey, buffer, mimeType);
        console.log(JSON.stringify({ jobId, stage: "OCR", provider: "textract", event: "s3_upload_ok", kind }));
        break;
      } catch (e: any) {
        attempt++;
        const code = (e as OcrError)?.code;
        const isRetryable = e?.retryable !== false && code !== OcrErrorCodes.CONFIGURATION_ERROR && code !== OcrErrorCodes.AUTH_ERROR;
        if (!isRetryable || attempt >= maxRetries) throw e;
        const delay = Math.pow(2, attempt) * 500;
        console.warn(JSON.stringify({ jobId, stage: "OCR", provider: "textract", event: "s3_upload_retry", kind, attempt, delay }));
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    // Submit Textract job
    let operationId: string;
    let outputUri: string;
    attempt = 0;
    while (true) {
      try {
        console.log(JSON.stringify({ jobId, stage: "OCR", provider: "textract", event: "textract_submit_start", kind, pageCount: input.pages.length }));
        const res = await this.legacy.submitDocument({
          jobId,
          documentId: input.documentId,
          kind,
          s3Bucket: bucket,
          s3Key: inputKey,
          mimeType: mimeType as any,
          pageCount: input.pages.length,
        });
        operationId = res.operationId;
        outputUri = res.outputUri;
        console.log(JSON.stringify({ jobId, stage: "OCR", provider: "textract", event: "textract_submit_ok", kind, operationId: operationId.slice(0, 40) }));
        break;
      } catch (e: any) {
        attempt++;
        const retryable = (e as OcrError)?.retryable !== false && (e as OcrError)?.code !== OcrErrorCodes.AUTH_ERROR && (e as OcrError)?.code !== OcrErrorCodes.CONFIGURATION_ERROR;
        if (!retryable || attempt >= maxRetries) {
          throw new OcrError(e.code || OcrErrorCodes.SUBMISSION_FAILED, `Textract submission failed for ${kind}: ${e.message}`, e, false);
        }
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(JSON.stringify({ jobId, stage: "OCR", provider: "textract", event: "textract_submit_retry", kind, attempt, delay }));
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    // Poll operation
    const start = Date.now();
    while (true) {
      if (Date.now() - start > timeoutMs) {
        throw new OcrError(OcrErrorCodes.OPERATION_TIMEOUT, `Textract operation timed out for ${kind} after ${timeoutMs / 1000}s (operation ${operationId!.slice(0, 30)})`, null, true);
      }
      let status: any;
      try {
        status = await this.legacy.getOperationStatus(operationId!);
      } catch (e: any) {
        console.warn(JSON.stringify({ jobId, stage: "OCR", provider: "textract", event: "poll_error", kind, msg: String(e.message).slice(0, 120) }));
        await new Promise((r) => setTimeout(r, pollMs));
        continue;
      }
      if (status.status === "DONE") {
        console.log(JSON.stringify({ jobId, stage: "OCR", provider: "textract", event: "operation_done", kind, elapsedMs: Date.now() - start }));
        break;
      }
      if (status.status === "FAILED") {
        throw new OcrError(OcrErrorCodes.OPERATION_FAILED, `Textract operation failed for ${kind}: ${status.error?.message || "unknown"}`, status.error, false);
      }
      // RUNNING / PENDING -> wait
      await new Promise((r) => setTimeout(r, pollMs));
    }

    // Fetch result with retries
    let docResult: OcrDocumentResult;
    attempt = 0;
    while (true) {
      try {
        console.log(JSON.stringify({ jobId, stage: "OCR", provider: "textract", event: "parse_start", kind, outputUri: outputUri! }));
        docResult = await this.legacy.getOperationResult(operationId!, outputUri!);
        break;
      } catch (e: any) {
        attempt++;
        const code = (e as OcrError)?.code;
        if (attempt >= maxRetries || code === OcrErrorCodes.OUTPUT_PARSE_FAILED || code === OcrErrorCodes.OUTPUT_MISSING) {
          throw new OcrError(e.code || OcrErrorCodes.OUTPUT_PARSE_FAILED, `Textract output parse failed for ${kind}: ${e.message}`, e, false);
        }
        const delay = Math.pow(2, attempt) * 800;
        console.warn(JSON.stringify({ jobId, stage: "OCR", provider: "textract", event: "parse_retry", kind, attempt, delay }));
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    docResult!.jobId = jobId;
    docResult!.documentId = input.documentId;
    docResult!.kind = kind;
    docResult!.pages.sort((a, b) => a.pageNumber - b.pageNumber);

    console.log(
      JSON.stringify({
        jobId,
        stage: "OCR",
        provider: "textract",
        engine: "aws-textract",
        event: "textract_process_ok",
        kind,
        pages: docResult!.pages.length,
        totalBlocks: docResult!.pages.reduce((a, p) => a + p.blocks.length, 0),
        totalLines: docResult!.pages.reduce((a, p) => a + p.lines.length, 0),
        durationMs: Date.now() - start,
      }),
    );

    return docResult!;
  }

  // Legacy OcrProvider compatibility — delegate to inner legacy provider
  async submitDocument(req: any): Promise<{ operationId: string; outputUri: string }> {
    return this.legacy.submitDocument(req);
  }
  async getOperationStatus(operationId: string): Promise<any> {
    return this.legacy.getOperationStatus(operationId);
  }
  async getOperationResult(operationId: string, outputUri: string): Promise<OcrDocumentResult> {
    return this.legacy.getOperationResult(operationId, outputUri);
  }
  async cancelOperation(operationId: string): Promise<void> {
    return this.legacy.cancelOperation(operationId);
  }
}
