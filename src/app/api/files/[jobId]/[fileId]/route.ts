import { NextRequest, NextResponse } from "next/server";
import { fileStorage, jobStore } from "@/lib/storage";
import { AppError, ErrorCodes } from "@/lib/errors/codes";

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string; fileId: string }> }) {
  const { jobId, fileId } = await params;
  const job = await jobStore.get(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Ensure fileId belongs to job (either question or answer)
  const isValid = job.questionPaperFileId === fileId || job.answerSheetFileId === fileId || job.questionPaperDocId === fileId || job.answerSheetDocId === fileId;
  if (!isValid) {
    // Allow docId as fileId? For now check existence
    const exists = await fileStorage.exists(jobId, fileId);
    if (!exists) return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    const buffer = await fileStorage.read(jobId, fileId);
    // Determine mime from job? For now try to infer
    const mime = buffer.slice(0, 4).toString("hex").startsWith("25504446") ? "application/pdf" : "application/octet-stream";
    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `inline; filename="${fileId}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "File read failed", code: "STORAGE_ERROR" }, { status: 500 });
  }
}
