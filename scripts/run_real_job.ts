// @ts-nocheck
import * as fs from "fs";
import * as path from "path";
import { jobStore, documentStore, pageStoreApi, fileStorage, generateId } from "../src/lib/storage";
import { getConfig, clearConfigCache } from "../src/lib/config";
import { startProcessing } from "../src/lib/jobs/runner";
import { inspectPdf } from "../src/lib/documents/pdf";

async function main() {
  clearConfigCache();
  const cfg = getConfig();
  console.log("OCR_PROVIDER", cfg.OCR_PROVIDER, "VISION", cfg.VISION_PROVIDER);

  const qpPath = path.join(process.cwd(), "Quetion_paper_Physics_1.pdf");
  const asPath = path.join(process.cwd(), "handwrittern_answer_sheet_physics_1.pdf");
  if (!fs.existsSync(qpPath) || !fs.existsSync(asPath)) {
    console.error("PDFs not found");
    process.exit(1);
  }
  const qpBuf = fs.readFileSync(qpPath);
  const asBuf = fs.readFileSync(asPath);
  console.log("QP", qpBuf.length, "AS", asBuf.length);

  const jobId = generateId();
  const now = new Date().toISOString();
  await jobStore.create({
    id: jobId,
    createdAt: now,
    updatedAt: now,
    status: "CREATED",
    currentStage: "CREATED",
    guestSessionId: null,
    userId: null,
    progress: {
      stageStates: {
        CREATED: "completed",
        UPLOADING: "pending",
        UPLOADED: "pending",
        VALIDATING: "pending",
        PREPROCESSING: "pending",
        OCR_SUBMITTED: "pending",
        OCR_PROCESSING: "pending",
        OCR_COMPLETED: "pending",
        OCR_FAILED: "pending",
        EXTRACTING: "pending",
        STRUCTURING: "pending",
        MATCHING: "pending",
        LOCALIZING: "pending",
        VALIDATING_RESULT: "pending",
        COMPLETED: "pending",
        FAILED: "pending",
        CANCELLED: "pending",
      } as any,
    },
    pipelineVersion: cfg.pipelineVersion,
    modelVersion: cfg.AI_MODEL,
  });
  console.log("created job", jobId);

  // Upload files via fileStorage and create docs
  async function upload(kind, buffer, originalName) {
    const fileId = generateId();
    await fileStorage.save(jobId, fileId, buffer, originalName);
    const inspection = await inspectPdf(buffer);
    const docId = generateId();
    await documentStore.save({
      id: docId,
      jobId,
      kind,
      originalName,
      mime: "application/pdf",
      size: buffer.length,
      pageCount: inspection.pageCount,
      pageIds: [],
      createdAt: now,
    } as any);
    for (const p of inspection.pages) {
      const pageId = generateId();
      await pageStoreApi.save({
        id: pageId,
        documentId: docId,
        pageNumber: p.pageNumber,
        width: p.width,
        height: p.height,
        rotation: p.rotation,
      });
    }
    const patch: any = {};
    if (kind === "questionPaper") patch.questionPaperFileId = fileId;
    if (kind === "answerSheet") patch.answerSheetFileId = fileId;
    if (kind === "questionPaper") patch.questionPaperDocId = docId;
    if (kind === "answerSheet") patch.answerSheetDocId = docId;
    patch.updatedAt = now;
    patch.status = "UPLOADED";
    patch.currentStage = "UPLOADED";
    await jobStore.update(jobId, patch);
    console.log(`uploaded ${kind} ${inspection.pageCount} pages docId ${docId} fileId ${fileId}`);
    return { docId, fileId, pageCount: inspection.pageCount };
  }

  await upload("questionPaper", qpBuf, "Quetion_paper_Physics_1.pdf");
  await upload("answerSheet", asBuf, "handwrittern_answer_sheet_physics_1.pdf");

  const job = await jobStore.get(jobId);
  console.log("job before start", job?.status, job?.currentStage);

  // Start processing (async, need to poll)
  await jobStore.update(jobId, { status: "VALIDATING", currentStage: "VALIDATING", updatedAt: new Date().toISOString() });
  console.log(JSON.stringify({ jobId, stage: "START", event: "start_processing" }));
  // call runner
  await startProcessing(jobId);
  // poll for completion (15min for 31-page Vision batches)
  const start = Date.now();
  while (Date.now() - start < 900000) {
    const cur = await jobStore.get(jobId);
    console.log(`poll ${Math.round((Date.now()-start)/1000)}s stage=${cur?.currentStage} status=${cur?.status} error=${cur?.error?.code || ""} ${cur?.error?.message?.slice(0,80)||""}`);
    if (cur?.status === "COMPLETED" || cur?.status === "FAILED") {
      console.log("final job", JSON.stringify(cur, null, 2));
      // check artifacts
      try {
        const { ocrResultStore, visionResultStore, fusionResultStore, resultStore } = await import("../src/lib/jobs/runner");
        const ocr = ocrResultStore.get(jobId);
        console.log("ocr qp pages", ocr?.qpOcr?.pages.length, "as", ocr?.asOcr?.pages.length, "provider", ocr?.qpOcr?.provider);
        const res = resultStore.get(jobId);
        console.log("result questions", res?.questions?.length, "answers", res?.answerGroups?.length, "decisions", res?.decisions?.length);
        // artifacts
        const artDir = path.join(process.cwd(), "artifacts", jobId);
        console.log("artifacts check, persistence", cur?.currentStage);
      } catch(e){ console.log("artifacts check err", e) }
      break;
    }
    await new Promise(r=>setTimeout(r,5000));
  }
  const final = await jobStore.get(jobId);
  console.log("DONE final", final?.status, final?.currentStage);
  if (final?.error) console.log("error", final.error);
  process.exit(final?.status === "COMPLETED" ? 0 : 1);
}
main().catch(e=>{console.error(e); process.exit(1)});
