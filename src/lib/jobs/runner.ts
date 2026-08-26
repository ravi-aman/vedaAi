import { jobStore, documentStore, pageStoreApi, fileStorage } from "@/lib/storage";
import type { ProcessingJob, ProcessingStage, QuestionNode, AnswerGroup, AnswerRegion, HighlightRegion, MappingDecision, Evidence } from "@/types";
import { getConfig } from "@/lib/config";
import { AppError, ErrorCodes } from "@/lib/errors/codes";
import { inspectPdf, inspectImage } from "@/lib/documents/pdf";
import { getAIProvider } from "@/lib/ai/factory";
import { normalizeNumber } from "@/lib/structure/numbering";
import { aggregateScore, buildEvidence } from "@/lib/evidence/aggregate";
import { decideForQuestion } from "@/lib/decision";
import { generateId } from "@/lib/storage";
import { getOcrProvider } from "@/lib/ocr/factory";
import { uploadBufferToGcs, deleteGcsPrefix } from "@/lib/ocr/gcs";
import { OcrError, OcrErrorCodes } from "@/lib/ocr/errors";
import type { OcrDocumentResult } from "@/lib/ocr/types";

function resolvePageId(modelPageId: string | undefined, pages: any[]): string {
  if (!modelPageId) return pages[0]?.id;
  if (modelPageId.includes("-") && pages.some((p) => p.id === modelPageId)) return modelPageId;
  const num = parseInt(String(modelPageId).replace(/[^0-9]/g, ""), 10);
  if (!isNaN(num)) {
    const byNumber = pages.find((p) => p.pageNumber === num);
    if (byNumber) return byNumber.id;
    if (pages[num]) return pages[num].id;
    if (pages[num - 1]) return pages[num - 1].id;
  }
  return pages[0]?.id;
}

// Stage order includes OCR
const STAGE_ORDER: ProcessingStage[] = [
  "VALIDATING",
  "PREPROCESSING",
  "OCR_SUBMITTED",
  "OCR_PROCESSING",
  "OCR_COMPLETED",
  "EXTRACTING",
  "STRUCTURING",
  "MATCHING",
  "LOCALIZING",
  "VALIDATING_RESULT",
  "COMPLETED",
];

export async function startProcessing(jobId: string): Promise<void> {
  const job = await jobStore.get(jobId);
  if (!job) throw new AppError(ErrorCodes.JOB_NOT_FOUND, `Job ${jobId} not found`);
  if (job.status === "COMPLETED" || job.currentStage === "COMPLETED") return;
  if (job.status === "FAILED") throw new AppError(ErrorCodes.INVALID_STAGE_TRANSITION, "Job already failed");
  // Idempotency: if already in OCR or EXTRACTING, do not re-submit duplicate work
  if (["OCR_SUBMITTED", "OCR_PROCESSING", "OCR_COMPLETED", "EXTRACTING", "STRUCTURING", "MATCHING"].includes(job.currentStage)) {
    // If job is mid-OCR, let existing run continue; avoid duplicate submission
    const existing = (job as any).ocrOperationId;
    if (existing) {
      console.log(JSON.stringify({ jobId, stage: "START", event: "idempotent_skip", currentStage: job.currentStage, ocrOperationId: String(existing).slice(0, 20) }));
      return;
    }
  }

  const HARD_TIMEOUT_MS = 10 * 60 * 1000; // 10min overall pipeline timeout (OCR async needs ~2-5min)
  const timeoutGuard = setTimeout(async () => {
    try {
      const cur = await jobStore.get(jobId);
      if (cur && cur.status !== "COMPLETED" && cur.status !== "FAILED") {
        console.error(`[job ${jobId}] HARD TIMEOUT after ${HARD_TIMEOUT_MS}ms at stage ${cur.currentStage}`);
        await jobStore.update(jobId, {
          status: "FAILED",
          currentStage: "FAILED",
          error: {
            code: ErrorCodes.MODEL_TIMEOUT,
            message: `Processing timed out at stage ${cur.currentStage} after ${HARD_TIMEOUT_MS / 1000}s. Try a smaller file or fewer pages.`,
            stage: cur.currentStage,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch {}
  }, HARD_TIMEOUT_MS);
  (timeoutGuard as any).unref?.();

  runJob(jobId)
    .then(() => clearTimeout(timeoutGuard))
    .catch(async (e) => {
      clearTimeout(timeoutGuard);
      console.error(`[job ${jobId}] runner failed`, e);
      try {
        await jobStore.update(jobId, {
          status: "FAILED",
          currentStage: "FAILED",
          error: {
            code: (e as AppError).code || (e as OcrError).code || ErrorCodes.UNKNOWN_ERROR,
            message: (e as Error).message,
            stage: "FAILED",
            timestamp: new Date().toISOString(),
          },
        });
      } catch {}
    });
}

async function runJob(jobId: string) {
  let job = await jobStore.get(jobId);
  if (!job) return;

  const updateStage = async (stage: ProcessingStage, status: "in_progress" | "completed" | "failed") => {
    const stageStates = { ...job!.progress.stageStates } as any;
    stageStates[stage] = status;
    await jobStore.update(jobId, {
      currentStage: stage,
      status: stage as ProcessingStage,
      progress: { ...job!.progress, stageStates },
      updatedAt: new Date().toISOString(),
    });
    job = await jobStore.get(jobId);
  };

  try {
    await updateStage("VALIDATING", "in_progress");
    await validateJob(jobId);
    await updateStage("VALIDATING", "completed");

    await updateStage("PREPROCESSING", "in_progress");
    const prep = await preprocess(jobId);
    await updateStage("PREPROCESSING", "completed");

    // OCR — Google Cloud Vision DOCUMENT_TEXT_DETECTION async
    await updateStage("OCR_SUBMITTED", "in_progress");
    const ocrData = await ocrStage(jobId);
    await updateStage("OCR_SUBMITTED", "completed");

    await updateStage("OCR_PROCESSING", "in_progress");
    // ocrStage already polls to completion; this stage is for progress visibility
    await updateStage("OCR_PROCESSING", "completed");

    await updateStage("OCR_COMPLETED", "in_progress");
    await updateStage("OCR_COMPLETED", "completed");

    await updateStage("EXTRACTING", "in_progress");
    const extraction = await extracting(jobId, prep, ocrData);
    await updateStage("EXTRACTING", "completed");

    await updateStage("STRUCTURING", "in_progress");
    const structured = await structuring(jobId, extraction);
    await updateStage("STRUCTURING", "completed");

    await updateStage("MATCHING", "in_progress");
    const matching = await matchingStage(jobId, structured);
    await updateStage("MATCHING", "completed");

    await updateStage("LOCALIZING", "in_progress");
    const localized = await localizing(jobId, matching);
    await updateStage("LOCALIZING", "completed");

    await updateStage("VALIDATING_RESULT", "in_progress");
    await validatingResult(jobId, localized);
    await updateStage("VALIDATING_RESULT", "completed");

    await jobStore.update(jobId, {
      status: "COMPLETED",
      currentStage: "COMPLETED",
      progress: {
        stageStates: {
          ...job!.progress.stageStates,
          COMPLETED: "completed",
        } as any,
      },
    });

    resultStore.set(jobId, localized);

    // Cleanup GCS staging after success (best-effort) — delete temp objects only, never primary Supabase storage
    try {
      const cfg = getConfig() as any;
      const bucket = cfg.GOOGLE_CLOUD_STORAGE_BUCKET;
      if (bucket) {
        await deleteGcsPrefix(bucket, `${cfg.GOOGLE_CLOUD_OCR_INPUT_PREFIX || "ocr-input"}/${jobId}/`).catch(() => {});
        await deleteGcsPrefix(bucket, `${cfg.GOOGLE_CLOUD_OCR_OUTPUT_PREFIX || "ocr-output"}/${jobId}/`).catch(() => {});
      }
    } catch {}
  } catch (e: any) {
    const code = e?.code || ErrorCodes.UNKNOWN_ERROR;
    const stage = job?.currentStage || "FAILED";
    await jobStore.update(jobId, {
      status: "FAILED",
      currentStage: "FAILED",
      error: {
        code,
        message: e?.message || String(e),
        stage,
        timestamp: new Date().toISOString(),
      },
      progress: {
        ...job!.progress,
        stageStates: { ...job!.progress.stageStates, [stage]: "failed" as const } as any,
      },
    });
    throw e;
  }
}

async function validateJob(jobId: string) {
  const job = await jobStore.get(jobId);
  if (!job?.questionPaperFileId || !job?.answerSheetFileId) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, "Both files required");
  }
}

async function preprocess(jobId: string) {
  const job = await jobStore.get(jobId);
  if (!job) throw new AppError(ErrorCodes.JOB_NOT_FOUND, "Job not found");

  const docs = await documentStore.getByJob(jobId);
  for (const doc of docs) {
    const fileId = doc.kind === "questionPaper" ? job.questionPaperFileId : doc.kind === "answerSheet" ? job.answerSheetFileId : doc.id;
    if (!fileId) throw new AppError(ErrorCodes.STORAGE_ERROR, `No fileId for doc ${doc.id}`);
    const buffer = await fileStorage.read(jobId, fileId);
    const isPdf = doc.mime === "application/pdf";
    const inspection = isPdf ? await inspectPdf(buffer) : await inspectImage(buffer);
    if (doc.pageCount !== inspection.pageCount) {
      await documentStore.update(doc.id, { pageCount: inspection.pageCount });
    }
    for (const p of inspection.pages) {
      const existing = await pageStoreApi.getByDocument(doc.id);
      const match = existing.find((e) => e.pageNumber === p.pageNumber);
      if (match) continue;
      await pageStoreApi.save({
        id: generateId(),
        documentId: doc.id,
        pageNumber: p.pageNumber,
        width: p.width,
        height: p.height,
        rotation: p.rotation,
      });
    }
  }
  return { ok: true };
}

// In-memory OCR result store (jobId -> per-document OCR results)
export const ocrResultStore = new Map<string, { qpOcr?: OcrDocumentResult; asOcr?: OcrDocumentResult }>();
export const resultStore = new Map<string, any>();

async function ocrStage(jobId: string): Promise<{ qpOcr?: OcrDocumentResult; asOcr?: OcrDocumentResult }> {
  const cfg = getConfig() as any;
  const ocrProviderName = cfg.OCR_PROVIDER || "google-vision";

  // Idempotency: reuse if already completed and stored
  const existing = ocrResultStore.get(jobId);
  const job = await jobStore.get(jobId);
  if (existing && job?.ocrCompletedAt) {
    console.log(JSON.stringify({ jobId, stage: "OCR", event: "reuse_cached", hasQp: !!existing.qpOcr, hasAs: !!existing.asOcr }));
    return existing;
  }
  // If operation already submitted and still valid, try to resume polling instead of re-submitting
  if (job?.ocrOperationId && job?.ocrOutputUri && ocrProviderName !== "mock") {
    try {
      console.log(JSON.stringify({ jobId, stage: "OCR", event: "resume_operation", operationId: job.ocrOperationId.slice(0, 30) }));
      const provider = getOcrProvider();
      const status = await provider.getOperationStatus(job.ocrOperationId);
      if (status.status === "DONE") {
        const result = await provider.getOperationResult(job.ocrOperationId, job.ocrOutputUri);
        // Need to split per doc? We store single op for combined? For per-doc we handle separately below.
      }
    } catch {}
  }

  const docs = await documentStore.getByJob(jobId);
  const qpDoc = docs.find((d) => d.kind === "questionPaper");
  const asDoc = docs.find((d) => d.kind === "answerSheet");
  if (!qpDoc || !asDoc) throw new AppError(ErrorCodes.VALIDATION_FAILED, "Missing docs for OCR");

  const qpPages = await pageStoreApi.getByDocument(qpDoc.id);
  const asPages = await pageStoreApi.getByDocument(asDoc.id);

  // Mock path — no GCS, immediate synthetic OCR
  if (ocrProviderName === "mock") {
    const provider = getOcrProvider();
    const qpRes = await provider.getOperationResult("mock-qp", `gs://mock/${jobId}/qp/`);
    const asRes = await provider.getOperationResult("mock-as", `gs://mock/${jobId}/as/`);
    // Override page counts to match real docs
    qpRes.pages = qpRes.pages.slice(0, qpPages.length);
    asRes.pages = asRes.pages.slice(0, asPages.length);
    // Expand if needed to match 39 pages etc.
    if (asPages.length > asRes.pages.length) {
      const extra = asPages.length - asRes.pages.length;
      for (let i = 0; i < extra; i++) {
        asRes.pages.push({ pageNumber: asRes.pages.length + 1, text: `Mock page ${asRes.pages.length + 1} additional`, blocks: [], confidence: 0.9, width: 800, height: 1100, rotation: 0 });
      }
    }
    qpRes.jobId = jobId;
    qpRes.documentId = qpDoc.id;
    qpRes.kind = "questionPaper";
    asRes.jobId = jobId;
    asRes.documentId = asDoc.id;
    asRes.kind = "answerSheet";
    const out = { qpOcr: qpRes, asOcr: asRes };
    ocrResultStore.set(jobId, out);
    await jobStore.update(jobId, { ocrStartedAt: new Date().toISOString(), ocrCompletedAt: new Date().toISOString(), ocrPageCount: asPages.length + qpPages.length, ocrAttempt: (job?.ocrAttempt || 0) + 1 } as any);
    console.log(JSON.stringify({ jobId, stage: "OCR", event: "mock_completed", qpPages: qpRes.pages.length, asPages: asRes.pages.length }));
    return out;
  }

  // Real Google Vision path
  if (!cfg.GOOGLE_CLOUD_PROJECT_ID || !cfg.GOOGLE_CLOUD_STORAGE_BUCKET) {
    throw new AppError(ErrorCodes.OCR_CONFIGURATION_ERROR, "Google Cloud OCR not configured. Set GOOGLE_CLOUD_PROJECT_ID and GOOGLE_CLOUD_STORAGE_BUCKET or use OCR_PROVIDER=mock");
  }

  const provider = getOcrProvider();
  const bucket = cfg.GOOGLE_CLOUD_STORAGE_BUCKET as string;
  const inputPrefix = cfg.GOOGLE_CLOUD_OCR_INPUT_PREFIX || "ocr-input";
  const outputPrefix = cfg.GOOGLE_CLOUD_OCR_OUTPUT_PREFIX || "ocr-output";
  const timeoutMs: number = cfg.OCR_OPERATION_TIMEOUT_MS || 300000;
  const pollMs: number = cfg.OCR_POLL_INTERVAL_MS || 5000;
  const maxRetries: number = cfg.OCR_MAX_RETRIES || 3;

  async function processOneDoc(doc: any, pages: any[], kind: "questionPaper" | "answerSheet"): Promise<OcrDocumentResult> {
    const safeJob = jobId.replace(/[^a-zA-Z0-9-]/g, "");
    const inputObject = `${inputPrefix}/${safeJob}/${kind}.pdf`;
    const outputPref = `${outputPrefix}/${safeJob}/${kind}/`;
    const inputUri = `gs://${bucket}/${inputObject}`;
    const outputUri = `gs://${bucket}/${outputPref}`;

    // Read buffer (streaming would be better but buffer is okay for 38MB; avoid duplicate copies)
    const fileId = kind === "questionPaper" ? (await jobStore.get(jobId))!.questionPaperFileId! : (await jobStore.get(jobId))!.answerSheetFileId!;
    const buffer = await fileStorage.read(jobId, fileId);
    const mimeType = doc.mime === "application/pdf" ? "application/pdf" : (doc.mime as any);

    // Upload to GCS staging (idempotent: overwrite)
    console.log(JSON.stringify({ jobId, stage: "OCR", event: "gcs_upload_start", kind, sizeMb: (buffer.length / 1024 / 1024).toFixed(2), inputUri }));
    let attempt = 0;
    while (true) {
      try {
        await uploadBufferToGcs(bucket, inputObject, buffer, mimeType);
        console.log(JSON.stringify({ jobId, stage: "OCR", event: "gcs_upload_ok", kind }));
        break;
      } catch (e: any) {
        attempt++;
        if (attempt >= maxRetries || e.code === OcrErrorCodes.CONFIGURATION_ERROR || e.code === OcrErrorCodes.AUTH_ERROR) throw e;
        const delay = Math.pow(2, attempt) * 500;
        console.warn(JSON.stringify({ jobId, stage: "OCR", event: "gcs_upload_retry", kind, attempt, delay }));
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    // Submit Vision asyncBatchAnnotate
    console.log(JSON.stringify({ jobId, stage: "OCR", event: "vision_submit_start", kind, pageCount: pages.length }));
    let operationId: string;
    let outUri: string;
    attempt = 0;
    while (true) {
      try {
        const res = await provider.submitDocument({ jobId, documentId: doc.id, kind, gcsInputUri: inputUri, mimeType: "application/pdf", pageCount: pages.length });
        operationId = res.operationId;
        outUri = res.outputUri;
        console.log(JSON.stringify({ jobId, stage: "OCR", event: "vision_submit_ok", kind, operationId: operationId.slice(0, 40) }));
        break;
      } catch (e: any) {
        attempt++;
        const retryable = e.retryable !== false && e.code !== OcrErrorCodes.AUTH_ERROR && e.code !== OcrErrorCodes.CONFIGURATION_ERROR;
        if (!retryable || attempt >= maxRetries) throw new AppError(e.code || ErrorCodes.OCR_SUBMISSION_FAILED, `OCR submission failed for ${kind}: ${e.message}`);
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(JSON.stringify({ jobId, stage: "OCR", event: "vision_submit_retry", kind, attempt, delay }));
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    // Persist operation metadata for polling visibility and idempotency
    await jobStore.update(jobId, {
      ocrOperationId: operationId!,
      ocrOutputUri: outUri!,
      ocrInputUri: inputUri,
      ocrStartedAt: new Date().toISOString(),
      ocrAttempt: ((await jobStore.get(jobId))?.ocrAttempt || 0) + 1,
      ocrPageCount: pages.length,
    } as any);

    // Poll operation
    const start = Date.now();
    while (true) {
      if (Date.now() - start > timeoutMs) {
        throw new AppError(ErrorCodes.OCR_OPERATION_TIMEOUT, `OCR operation timed out for ${kind} after ${timeoutMs / 1000}s (operation ${operationId!.slice(0, 30)})`);
      }
      let status: any;
      try {
        status = await provider.getOperationStatus(operationId!);
      } catch (e: any) {
        console.warn(JSON.stringify({ jobId, stage: "OCR", event: "poll_error", kind, msg: e.message?.slice(0, 100) }));
        await new Promise((r) => setTimeout(r, pollMs));
        continue;
      }
      if (status.status === "DONE") {
        console.log(JSON.stringify({ jobId, stage: "OCR", event: "operation_done", kind, elapsed: Date.now() - start }));
        break;
      }
      if (status.status === "FAILED") {
        throw new AppError(ErrorCodes.OCR_OPERATION_FAILED, `OCR operation failed for ${kind}: ${status.error?.message || "unknown"}`);
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }

    // Download and parse output JSON
    console.log(JSON.stringify({ jobId, stage: "OCR", event: "parse_start", kind, outputUri: outUri! }));
    let docResult: OcrDocumentResult;
    attempt = 0;
    while (true) {
      try {
        docResult = await provider.getOperationResult(operationId!, outUri!);
        break;
      } catch (e: any) {
        attempt++;
        if (attempt >= maxRetries || e.code === OcrErrorCodes.OUTPUT_PARSE_FAILED || e.code === OcrErrorCodes.OUTPUT_MISSING) throw new AppError(e.code || ErrorCodes.OCR_OUTPUT_PARSE_FAILED, `OCR output parse failed for ${kind}: ${e.message}`);
        const delay = Math.pow(2, attempt) * 800;
        console.warn(JSON.stringify({ jobId, stage: "OCR", event: "parse_retry", kind, attempt }));
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    docResult!.jobId = jobId;
    docResult!.documentId = doc.id;
    docResult!.kind = kind;
    // Ensure pages sorted and pageNumbers correct
    docResult!.pages.sort((a, b) => a.pageNumber - b.pageNumber);
    console.log(JSON.stringify({ jobId, stage: "OCR", event: "parse_ok", kind, pages: docResult!.pages.length }));
    return docResult!;
  }

  // Process questionPaper and answerSheet — sequential to bound memory, or parallel? Sequential is safer for 38MB
  const qpOcr = await processOneDoc(qpDoc, qpPages, "questionPaper");
  const asOcr = await processOneDoc(asDoc, asPages, "answerSheet");

  const out = { qpOcr, asOcr };
  ocrResultStore.set(jobId, out);
  await jobStore.update(jobId, { ocrCompletedAt: new Date().toISOString() } as any);
  return out;
}

async function extracting(jobId: string, prep: any, ocrData?: { qpOcr?: OcrDocumentResult; asOcr?: OcrDocumentResult }) {
  const job = await jobStore.get(jobId);
  if (!job) throw new AppError(ErrorCodes.JOB_NOT_FOUND, "Job not found");
  const docs = await documentStore.getByJob(jobId);
  const qpDoc = docs.find((d) => d.kind === "questionPaper");
  const asDoc = docs.find((d) => d.kind === "answerSheet");
  if (!qpDoc || !asDoc) throw new AppError(ErrorCodes.VALIDATION_FAILED, "Missing docs");

  const qpPages = await pageStoreApi.getByDocument(qpDoc.id);
  const asPages = await pageStoreApi.getByDocument(asDoc.id);

  const provider = getAIProvider();

  // Prefer OCR text if available — reduces need for huge base64 payload
  const qpOcr = ocrData?.qpOcr || ocrResultStore.get(jobId)?.qpOcr;
  const asOcr = ocrData?.asOcr || ocrResultStore.get(jobId)?.asOcr;

  async function buildVisionInput(doc: any, pages: any[], fileId: string, ocrResult?: OcrDocumentResult) {
    // If OCR available, send OCR text + small placeholder image to satisfy vision API contract without 38MB base64
    if (ocrResult && ocrResult.pages.length > 0) {
      const combinedText = ocrResult.pages.map((p) => `--- Page ${p.pageNumber} ---\n${p.text}`).join("\n\n");
      // Truncate to avoid exceeding LLM context (e.g., 30k chars ~ 10 pages handwritten could be large)
      const truncated = combinedText.slice(0, 40000);
      console.log(JSON.stringify({ jobId, stage: "EXTRACTING", event: "buildVisionInput_ocr", kind: doc.kind, ocrPages: ocrResult.pages.length, ocrChars: truncated.length }));
      return {
        pages: pages.slice(0, 1).map((p) => ({ pageId: p.id, imageBase64: placeholderPngBase64(p.pageNumber), ocrText: truncated })),
        isPdf: false,
        mime: "image/png",
        ocrText: truncated,
      };
    }
    try {
      const buffer = await fileStorage.read(jobId, fileId);
      const sizeMb = buffer.length / (1024 * 1024);
      console.log(JSON.stringify({ jobId, stage: "EXTRACTING", event: "buildVisionInput", kind: doc.kind, fileId: fileId.slice(0, 8), sizeMb: sizeMb.toFixed(2), pageCount: pages.length }));
      const MAX_AI_PAYLOAD_MB = 18;
      if (sizeMb > MAX_AI_PAYLOAD_MB) {
        throw new AppError(ErrorCodes.FILE_TOO_LARGE, `${doc.kind} too large for AI (${sizeMb.toFixed(1)}MB > ${MAX_AI_PAYLOAD_MB}MB). Compress or split PDF (max ~10 pages or <15MB).`);
      }
      const b64 = buffer.toString("base64");
      const isPdf = buffer.slice(0, 4).toString() === "%PDF";
      if (isPdf) {
        return {
          pages: [{ pageId: pages[0]?.id || "p1", imageBase64: b64 }],
          isPdf: true,
          mime: "application/pdf",
        };
      } else {
        return {
          pages: pages.map((p) => ({ pageId: p.id, imageBase64: b64 })),
          isPdf: false,
          mime: doc.mime,
        };
      }
    } catch (e: any) {
      if (e?.code === ErrorCodes.FILE_TOO_LARGE) throw e;
      console.warn("[extracting] failed to read file for vision, using placeholder", e);
      return {
        pages: pages.map((p) => ({ pageId: p.id, imageBase64: placeholderPngBase64(p.pageNumber) })),
        isPdf: false,
        mime: "image/png",
      };
    }
  }

  const qpFileId = job.questionPaperFileId!;
  const asFileId = job.answerSheetFileId!;
  const qpVision = await buildVisionInput(qpDoc, qpPages, qpFileId, qpOcr);
  const asVision = await buildVisionInput(asDoc, asPages, asFileId, asOcr);

  const qpInput: any = {
    pages: qpVision.pages as any,
    hints: [] as string[],
    fileMime: qpVision.mime,
  };
  // If OCR text available, attach as hint for LLM to use as evidence (provider may ignore but prompt should use)
  if ((qpVision as any).ocrText) qpInput.hints.push(`OCR_TEXT:\n${(qpVision as any).ocrText.slice(0, 20000)}`);

  const asInput: any = {
    pages: asVision.pages as any,
    fileMime: asVision.mime,
  };
  if ((asVision as any).ocrText) (asInput as any).hints = [`OCR_TEXT:\n${(asVision as any).ocrText.slice(0, 30000)}`];

  let qpExtracted, asDetected;
  const t0 = Date.now();
  console.log(JSON.stringify({ jobId, stage: "EXTRACTING", event: "extractStructure_start", qpPages: qpVision.pages.length, hasOcr: !!(qpVision as any).ocrText }));
  try {
    qpExtracted = await provider.extractStructure(qpInput);
    console.log(JSON.stringify({ jobId, stage: "EXTRACTING", event: "extractStructure_ok", duration: Date.now() - t0, qCount: (qpExtracted as any).questions?.length }));
  } catch (e: any) {
    console.error(JSON.stringify({ jobId, stage: "EXTRACTING", event: "extractStructure_failed", duration: Date.now() - t0, code: e.code, msg: e.message?.slice(0, 200) }));
    throw new AppError(e.code || ErrorCodes.QUESTION_EXTRACTION_FAILED, `Question extraction failed: ${e.message}`);
  }
  const t1 = Date.now();
  console.log(JSON.stringify({ jobId, stage: "EXTRACTING", event: "detectAnswerRegions_start", asPages: asVision.pages.length, hasOcr: !!(asVision as any).ocrText }));
  try {
    // If OCR provides blocks, we can synthesize answer regions from OCR blocks instead of pure LLM vision
    // Current: still call LLM but LLM can use OCR_TEXT hints
    asDetected = await provider.detectAnswerRegions(asInput);
    // Augment with OCR evidence: if OCR had text but LLM returned sparse regions, merge
    if (asOcr && (asDetected as any).regions.length < asOcr.pages.length) {
      console.log(JSON.stringify({ jobId, stage: "EXTRACTING", event: "augment_with_ocr", ocrPages: asOcr.pages.length, llmRegions: (asDetected as any).regions.length }));
      for (let i = (asDetected as any).regions.length; i < asOcr.pages.length; i++) {
        const page = asOcr.pages[i];
        const pageId = asPages[i]?.id || asPages[0]?.id;
        // Heuristic: split OCR text into pseudo-regions per block
        for (const block of page.blocks.slice(0, 2)) {
          (asDetected as any).regions.push({
            pageId,
            boxes: [[block.boundingBox.x, block.boundingBox.y, block.boundingBox.width, block.boundingBox.height]],
            rawText: block.paragraphs.map((p: any) => p.words.map((w: any) => w.text).join(" ")).join("\n").slice(0, 2000),
            questionLabel: null,
            labelConfidence: 0.3,
            visualConfidence: 0.5,
            ocrConfidence: block.confidence || 0.85,
            orderIndex: (asDetected as any).regions.length,
          });
        }
      }
    }
    console.log(JSON.stringify({ jobId, stage: "EXTRACTING", event: "detectAnswerRegions_ok", duration: Date.now() - t1, rCount: (asDetected as any).regions?.length }));
  } catch (e: any) {
    console.error(JSON.stringify({ jobId, stage: "EXTRACTING", event: "detectAnswerRegions_failed", duration: Date.now() - t1, code: e.code, msg: e.message?.slice(0, 200) }));
    throw new AppError(e.code || ErrorCodes.ANSWER_EXTRACTION_FAILED, `Answer detection failed: ${e.message}`);
  }

  return { qpDoc, asDoc, qpPages, asPages, qpExtracted, asDetected, qpOcr, asOcr };
}

function placeholderPngBase64(pageNum: number): string {
  return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
}

async function structuring(jobId: string, extraction: any) {
  const { qpDoc, asDoc, qpPages, asPages, qpExtracted, asDetected } = extraction;

  const questions: QuestionNode[] = [];
  for (let idx = 0; idx < qpExtracted.questions.length; idx++) {
    const q = qpExtracted.questions[idx];
    const parsed = normalizeNumber(q.rawNumber || q.normalizedNumber || String(idx + 1));
    let parentId: string | undefined;
    if (q.parentNumber) {
      const parent = questions.find((qq) => qq.normalizedNumber === q.parentNumber);
      parentId = parent?.id;
    } else if (parsed.parent) {
      const parent = questions.find((qq) => qq.normalizedNumber === parsed.parent);
      parentId = parent?.id;
    }
    const rawPageRefs = q.pageRefs && q.pageRefs.length > 0 ? q.pageRefs : [qpPages[0]?.id].filter(Boolean);
    const pageRefs = rawPageRefs.map((pr: string) => resolvePageId(pr, qpPages));
    const sourceRegions = (q.sourceRegions || []).map((r: any) => ({
      x: r.box[0],
      y: r.box[1],
      width: r.box[2],
      height: r.box[3],
    }));
    if (sourceRegions.length === 0) {
      sourceRegions.push({ x: 0.05, y: 0.1 + idx * 0.05, width: 0.9, height: 0.04 });
    }
    const node: QuestionNode = {
      id: generateId(),
      sourceDocumentId: qpDoc.id,
      pageRefs,
      sourceRegions,
      rawNumber: q.rawNumber,
      normalizedNumber: q.normalizedNumber || parsed.normalized,
      text: q.text,
      rawText: q.rawText || q.text,
      normalizedText: q.text.trim(),
      parentQuestionId: parentId,
      partType: (q.partType as any) || parsed.partType,
      orderIndex: idx,
      depth: parsed.depth,
      marks: q.marks || undefined,
      confidence: q.confidence,
      evidence: (q.evidence || []).map((e: string) => ({
        type: "OCR_CONFIDENCE" as const,
        source: "extractStructure",
        score: q.confidence,
        explanation: e,
        reliability: 0.6,
      })),
    };
    questions.push(node);
  }

  const answerRegions: AnswerRegion[] = [];
  for (let idx = 0; idx < asDetected.regions.length; idx++) {
    const r = asDetected.regions[idx];
    const boxes = r.boxes.map((b: number[]) => ({
      x: b[0],
      y: b[1],
      width: b[2],
      height: b[3],
    }));
    const resolvedPageId = resolvePageId(r.pageId, asPages);
    const region: AnswerRegion = {
      id: generateId(),
      documentId: asDoc.id,
      pageId: resolvedPageId,
      regionType: r.visualConfidence && r.visualConfidence > 0.6 && !r.rawText ? "DIAGRAM" : "HANDWRITING",
      rawText: r.rawText || "",
      normalizedText: (r.rawText || "").trim(),
      sourceBoxes: boxes,
      normalizedBoxes: boxes,
      questionLabel: r.questionLabel || undefined,
      labelConfidence: r.labelConfidence,
      ocrConfidence: r.ocrConfidence,
      visualConfidence: r.visualConfidence,
      orderIndex: r.orderIndex ?? idx,
    };
    answerRegions.push(region);
  }

  const answerGroups: AnswerGroup[] = answerRegions.map((reg) => ({
    id: generateId(),
    documentId: asDoc.id,
    regions: [reg],
    primaryRegionId: reg.id,
    normalizedText: reg.normalizedText,
    mappedQuestionId: undefined,
  }));

  const groupedByLabel = new Map<string, AnswerGroup>();
  const finalGroups: AnswerGroup[] = [];
  for (const g of answerGroups) {
    const label = g.regions[0].questionLabel;
    if (label && groupedByLabel.has(label)) {
      const existing = groupedByLabel.get(label)!;
      existing.regions.push(...g.regions);
      existing.normalizedText += "\n" + g.normalizedText;
    } else {
      if (label) groupedByLabel.set(label, g);
      finalGroups.push(g);
    }
  }

  return { questions, answerRegions, answerGroups: finalGroups, qpDoc, asDoc, qpPages, asPages };
}

function numericPart(s: string): string {
  const m = s.match(/(\d+)/);
  return m ? m[1] : s;
}

async function matchingStage(jobId: string, structured: any) {
  const { questions, answerGroups } = structured as { questions: QuestionNode[]; answerGroups: AnswerGroup[] };
  const decisions: MappingDecision[] = [];
  const usedAnswerGroups = new Set<string>();
  for (const q of questions) {
    const candidates: { answerGroupId: string; evidence: Evidence[]; score: number }[] = [];
    for (const ag of answerGroups) {
      const reg = ag.regions[0];
      const evidence: Evidence[] = [];
      if (reg.questionLabel) {
        const parsedLabel = normalizeNumber(reg.questionLabel).normalized;
        const labelStripped = parsedLabel.replace(/^[A-Z]+/, "");
        const qStripped = q.normalizedNumber.replace(/^[A-Z]+/, "");
        const labelNum = numericPart(parsedLabel);
        const qNum = numericPart(q.normalizedNumber);
        const labelPrefix = parsedLabel.replace(/[0-9].*/, "");
        const qPrefix = q.normalizedNumber.replace(/[0-9].*/, "");
        const isQPrefix = (p: string) => p === "" || p === "Q";
        if (parsedLabel === q.normalizedNumber) {
          evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.95, `Explicit label ${reg.questionLabel} matched ${q.normalizedNumber}`, 1.0));
        } else if (labelStripped === qStripped) {
          evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.92, `Label ${reg.questionLabel} matched ${q.normalizedNumber} (normalized)`, 0.95));
        } else if (labelNum === qNum && isQPrefix(labelPrefix) && isQPrefix(qPrefix) && labelStripped === qStripped) {
          evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.88, `Label ${reg.questionLabel} matched ${q.normalizedNumber} (prefix-insensitive)`, 0.9));
        } else if (labelNum === qNum && (isQPrefix(labelPrefix) || isQPrefix(qPrefix)) && labelNum === qNum) {
          if (labelStripped === qStripped) {
            evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.88, `Label ${reg.questionLabel} matched ${q.normalizedNumber} (prefix-insensitive)`, 0.9));
          } else {
            evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.35, `Part mismatch ${reg.questionLabel} vs ${q.normalizedNumber}`, 0.7));
          }
        } else if (labelNum === qNum) {
          evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.4, `Same number different prefix ${reg.questionLabel} vs ${q.normalizedNumber}`, 0.6));
        } else if (parsedLabel && q.normalizedNumber.includes(parsedLabel)) {
          evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.6, `Partial label ${reg.questionLabel} vs ${q.normalizedNumber}`, 0.7));
        } else {
          evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.1, `Label ${reg.questionLabel} does not match ${q.normalizedNumber}`, 0.9));
        }
      } else {
        evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.2, "No explicit label", 0.4));
      }
      const qWords = new Set(q.normalizedText.toLowerCase().split(/\W+/).filter(Boolean));
      const aWords = new Set(ag.normalizedText.toLowerCase().split(/\W+/).filter(Boolean));
      let inter = 0;
      for (const w of aWords) if (qWords.has(w)) inter++;
      const union = qWords.size + aWords.size - inter;
      const jaccard = union === 0 ? 0 : inter / union;
      if (jaccard > 0.1) {
        evidence.push(buildEvidence("SEMANTIC_SIMILARITY", "matching", Math.min(0.85, jaccard + 0.3), `Semantic overlap ${jaccard.toFixed(2)}`, 0.5));
      } else {
        evidence.push(buildEvidence("SEMANTIC_SIMILARITY", "matching", 0.15, "Low semantic overlap", 0.5));
      }
      const orderDiff = Math.abs(q.orderIndex - ag.regions[0].orderIndex);
      const layoutScore = Math.max(0, 1 - orderDiff * 0.2);
      evidence.push(buildEvidence("LAYOUT_CONTINUITY", "matching", layoutScore, `Order proximity diff ${orderDiff}`, 0.3));
      const ocrConf = reg.ocrConfidence ?? 0.5;
      evidence.push(buildEvidence("OCR_CONFIDENCE", "matching", ocrConf, `OCR confidence ${ocrConf}`, 0.4));
      if (reg.regionType === "DIAGRAM" && reg.visualConfidence && reg.visualConfidence > 0.6) {
        evidence.push(buildEvidence("VISUAL_EVIDENCE", "matching", reg.visualConfidence, "Diagram visual evidence", 0.6));
      }
      const score = aggregateScore(evidence);
      candidates.push({ answerGroupId: ag.id, evidence, score });
    }
    const sorted = candidates.sort((a, b) => b.score - a.score);
    const topCandidates = sorted.slice(0, 3).map((c) => ({ questionId: q.id, answerGroupId: c.answerGroupId, evidence: c.evidence, score: c.score }));
    const decision = decideForQuestion(topCandidates);
    const chosenId = decision.chosen?.answerGroupId;
    const highlightRegions: HighlightRegion[] = [];
    if (chosenId) {
      const ag = answerGroups.find((a) => a.id === chosenId);
      if (ag) {
        for (const reg of ag.regions) {
          highlightRegions.push({ pageId: reg.pageId, boxes: reg.normalizedBoxes, confidence: decision.confidence, source: "matching" });
        }
      }
      if (decision.status === "MATCHED") usedAnswerGroups.add(chosenId);
    }
    decisions.push({
      id: generateId(),
      questionId: q.id,
      answerGroupId: chosenId,
      answerIds: chosenId ? [chosenId] : [],
      primaryAnswerId: chosenId,
      status: decision.status === "MATCHED" && chosenId ? "MATCHED" : decision.status === "UNCERTAIN" && chosenId ? "UNCERTAIN" : "UNANSWERED",
      confidence: decision.confidence,
      mappingConfidence: decision.confidence,
      evidence: decision.evidence,
      highlightRegions,
    });
  }
  const unmatchedAnswers = answerGroups.filter((ag) => !decisions.some((d) => d.answerGroupId === ag.id && (d.status === "MATCHED" || d.status === "UNCERTAIN")));
  const unmatchedDecisions: MappingDecision[] = unmatchedAnswers.map((ag) => ({
    id: generateId(),
    questionId: "__unmatched__",
    answerGroupId: ag.id,
    answerIds: [ag.id],
    primaryAnswerId: ag.id,
    status: "UNMATCHED" as const,
    confidence: 0,
    evidence: [buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.1, "No reliable question match", 0.5)],
    highlightRegions: ag.regions.map((r) => ({ pageId: r.pageId, boxes: r.normalizedBoxes, confidence: 0.3, source: "unmatched" })),
  }));
  return { questions, answerGroups, decisions: [...decisions, ...unmatchedDecisions], unmatchedAnswers };
}

async function localizing(jobId: string, matching: any) {
  return matching;
}

async function validatingResult(jobId: string, localized: any) {
  const { questions, decisions } = localized;
  if (questions.length === 0) {
    throw new AppError(ErrorCodes.QUESTION_EXTRACTION_FAILED, "No questions detected");
  }
}
