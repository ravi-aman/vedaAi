import { NextRequest, NextResponse } from "next/server";
import { jobStore, fileStorage, documentStore, pageStoreApi, generateId } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
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
    // ── Direct S3 mode: client already PUT to S3 via presigned URL (bypasses Vercel 4.5MB limit) ──
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      const kind = body.kind as DocumentKind | null;
      const s3Key = String(body.s3Key || "");
      const fileId = String(body.fileId || "");
      const fileName = String(body.fileName || "file.pdf");
      const bucket = String(body.bucket || "");
      const sizeHint = Number(body.size || 0);

      if (!kind || !["questionPaper", "answerSheet"].includes(kind)) {
        return NextResponse.json({ error: "kind must be questionPaper|answerSheet", code: "FILE_INVALID" }, { status: 400 });
      }
      if (!s3Key || !fileId) {
        return NextResponse.json({ error: "s3Key and fileId required for direct S3 upload", code: "FILE_INVALID" }, { status: 400 });
      }

      const cfg = getConfig() as any;
      const s3Bucket = bucket || cfg.AWS_S3_BUCKET;
      if (!s3Bucket) return NextResponse.json({ error: "AWS_S3_BUCKET not configured", code: "CONFIGURATION_ERROR" }, { status: 500 });

      // Download from S3 to validate & inspect (outbound, not inbound Vercel limit)
      const { downloadS3File } = await import("@/lib/ocr/legacy/s3");
      let buffer: Buffer;
      try {
        buffer = await downloadS3File(s3Bucket, s3Key);
      } catch (e: any) {
        return NextResponse.json({ error: `Failed to fetch file from S3 s3://${s3Bucket}/${s3Key}: ${e.message}`, code: "S3_FETCH_FAILED" }, { status: 400 });
      }

      const maxSize = cfg.MAX_FILE_SIZE_MB * 1024 * 1024;
      // Use sizeHint if provided else buffer length
      const effectiveSize = sizeHint || buffer.length;
      if (effectiveSize > maxSize) {
        return NextResponse.json({ error: `Too large ${effectiveSize} > ${maxSize}`, code: "FILE_TOO_LARGE" }, { status: 413 });
      }

      const validation = await validateFile(buffer, fileName, buffer.length, maxSize);

      let inspection;
      try {
        inspection = validation.mime === "application/pdf" ? await inspectPdf(buffer) : await inspectImage(buffer);
      } catch (e: any) {
        if (e instanceof AppError) return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
        return NextResponse.json({ error: (e as Error).message, code: "PDF_CORRUPTED" }, { status: 400 });
      }
      if (inspection.pageCount > cfg.MAX_PAGES) {
        return NextResponse.json({ error: `Too many pages ${inspection.pageCount} > ${cfg.MAX_PAGES}`, code: "FILE_INVALID" }, { status: 400 });
      }

      // Persist to durable Supabase Storage as well (so fileStorage.read works without S3 fetch each time)
      // This copies S3 -> Supabase in background (Vercel can do outbound)
      try {
        await fileStorage.save(jobId, fileId, buffer, validation.sanitizedName);
      } catch (e) {
        console.warn(`[upload] S3->Supabase copy failed for ${fileId}, will rely on S3 fallback`, e);
        // Fallback: at least keep in tmp via fileStorage local (already attempted)
      }

      let detectedRole: DocumentRole = "UNKNOWN";
      try {
        const nameLower = fileName.toLowerCase();
        if (kind === "answerSheet" && (nameLower.includes("marking") || nameLower.includes("solution") || nameLower.includes("scheme"))) detectedRole = "MARKING_SCHEME";
        else if (kind === "questionPaper") detectedRole = "QUESTION_PAPER";
        else if (kind === "answerSheet") detectedRole = "ANSWER_SHEET";
      } catch {}

      const docId = generateId();
      const now = new Date().toISOString();
      const doc: any = {
        id: docId,
        jobId,
        kind,
        detectedRole,
        originalName: fileName,
        mime: validation.mime,
        size: buffer.length,
        pageCount: inspection.pageCount,
        pageIds: [] as string[],
        createdAt: now,
        s3Key, // keep direct S3 location for Textract reuse (no re-upload)
        s3Bucket: s3Bucket,
      };
      const pageIds: string[] = [];
      for (const p of inspection.pages) {
        const pageId = generateId();
        pageIds.push(pageId);
        await pageStoreApi.save({ id: pageId, documentId: docId, pageNumber: p.pageNumber, width: p.width, height: p.height, rotation: p.rotation });
      }
      doc.pageIds = pageIds;
      await documentStore.save(doc as any);

      const patch: any = {};
      if (kind === "questionPaper") patch.questionPaperFileId = fileId;
      if (kind === "answerSheet") patch.answerSheetFileId = fileId;
      if (kind === "questionPaper") patch.questionPaperDocId = docId;
      if (kind === "answerSheet") patch.answerSheetDocId = docId;
      patch.updatedAt = now;
      patch.progress = { ...job.progress, stageStates: { ...job.progress.stageStates, UPLOADING: "completed" as const, UPLOADED: "completed" as const } };
      patch.status = "UPLOADED";
      patch.currentStage = "UPLOADED";
      await jobStore.update(jobId, patch);

      console.log(JSON.stringify({ jobId, stage: "UPLOADED_DIRECT_S3", kind, s3Key, pageCount: inspection.pageCount, timestamp: now }));

      return NextResponse.json({ documentId: docId, fileId, mime: validation.mime, pageCount: inspection.pageCount, pages: inspection.pages, s3Key, direct: true });
    }

    // ── Legacy proxy mode: small files via formData (Vercel) ──
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
