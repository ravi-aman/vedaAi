import { NextRequest, NextResponse } from "next/server";
import { jobStore, fileStorage, documentStore, pageStoreApi, generateId } from "@/lib/storage";
import { validateFile } from "@/lib/files/validation";
import { inspectPdf, inspectImage } from "@/lib/documents/pdf";
import { getConfig } from "@/lib/config";
import { AppError, ErrorCodes } from "@/lib/errors/codes";
import type { DocumentKind, DocumentRole } from "@/types";
import { classifyDocument } from "@/lib/documents/classifier";

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await jobStore.get(jobId);
  if (!job) return NextResponse.json({ error: "Job not found", code: "JOB_NOT_FOUND" }, { status: 404 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const kind = formData.get("kind") as DocumentKind | null;

    if (!file || !kind) {
      return NextResponse.json({ error: "file and kind required", code: "FILE_INVALID" }, { status: 400 });
    }
    if (!["questionPaper", "answerSheet"].includes(kind)) {
      return NextResponse.json({ error: "kind must be questionPaper|answerSheet", code: "FILE_INVALID" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const cfg = getConfig();
    const maxSize = cfg.MAX_FILE_SIZE_MB * 1024 * 1024;

    const validation = await validateFile(buffer, file.name, buffer.length, maxSize);

    // Inspect PDF to get page count
    let inspection;
    try {
      inspection = validation.mime === "application/pdf" ? await inspectPdf(buffer) : await inspectImage(buffer);
    } catch (e: any) {
      if (e instanceof AppError) {
        return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
      }
      return NextResponse.json({ error: (e as Error).message, code: "PDF_CORRUPTED" }, { status: 400 });
    }

    if (inspection.pageCount > cfg.MAX_PAGES) {
      return NextResponse.json({ error: `Too many pages ${inspection.pageCount} > ${cfg.MAX_PAGES}`, code: "FILE_INVALID" }, { status: 400 });
    }

    // Save file
    const fileId = generateId();
    await fileStorage.save(jobId, fileId, buffer, validation.sanitizedName);

    // Classify document role (heuristic, filename + first-page text if available)
    let detectedRole: DocumentRole = "UNKNOWN";
    try {
      // For now, classify based on filename only (OCR not yet available at upload time)
      // Full OCR-based classification happens in job runner after Textract
      const nameLower = file.name.toLowerCase();
      if (kind === "answerSheet" && (nameLower.includes("marking") || nameLower.includes("solution") || nameLower.includes("scheme"))) {
        detectedRole = "MARKING_SCHEME";
      } else if (kind === "questionPaper") {
        detectedRole = "QUESTION_PAPER";
      } else if (kind === "answerSheet") {
        detectedRole = "ANSWER_SHEET";
      }
    } catch {}

    // Create Document
    const docId = generateId();
    const now = new Date().toISOString();
    const doc: any = {
      id: docId,
      jobId,
      kind,
      detectedRole,
      originalName: file.name,
      mime: validation.mime,
      size: buffer.length,
      pageCount: inspection.pageCount,
      pageIds: [] as string[],
      createdAt: now,
    };

    const pageIds: string[] = [];
    for (const p of inspection.pages) {
      const pageId = generateId();
      pageIds.push(pageId);
      await pageStoreApi.save({
        id: pageId,
        documentId: docId,
        pageNumber: p.pageNumber,
        width: p.width,
        height: p.height,
        rotation: p.rotation,
      });
    }
    doc.pageIds = pageIds;
    await documentStore.save(doc as any);

    // Update job
    const patch: any = {};
    if (kind === "questionPaper") patch.questionPaperFileId = fileId;
    if (kind === "answerSheet") patch.answerSheetFileId = fileId;
    if (kind === "questionPaper") patch.questionPaperDocId = docId;
    if (kind === "answerSheet") patch.answerSheetDocId = docId;
    patch.updatedAt = now;
    patch.progress = {
      ...job.progress,
      stageStates: { ...job.progress.stageStates, UPLOADING: "completed" as const, UPLOADED: "completed" as const },
    };
    patch.status = "UPLOADED";
    patch.currentStage = "UPLOADED";
    await jobStore.update(jobId, patch);

    console.log(JSON.stringify({ jobId, stage: "UPLOADED", kind, pageCount: inspection.pageCount, timestamp: now }));

    return NextResponse.json({
      documentId: docId,
      fileId,
      mime: validation.mime,
      pageCount: inspection.pageCount,
      pages: inspection.pages,
    });
  } catch (e: any) {
    console.error(e);
    const code = e?.code || ErrorCodes.UNKNOWN_ERROR;
    const status = code === ErrorCodes.FILE_TOO_LARGE ? 413 : 400;
    return NextResponse.json({ error: e.message, code }, { status });
  }
}
