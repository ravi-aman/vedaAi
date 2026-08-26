import { NextRequest, NextResponse } from "next/server";
import { jobStore } from "@/lib/storage";
import { startProcessing } from "@/lib/jobs/runner";
import { AppError, ErrorCodes } from "@/lib/errors/codes";

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await jobStore.get(jobId);
  if (!job) return NextResponse.json({ error: "Job not found", code: "JOB_NOT_FOUND" }, { status: 404 });

  if (!job.questionPaperFileId || !job.answerSheetFileId) {
    return NextResponse.json({ error: "Both files required", code: "VALIDATION_FAILED" }, { status: 400 });
  }
  if (job.status === "COMPLETED") {
    return NextResponse.json({ jobId, status: "already completed", job });
  }

  try {
    // set to VALIDATING first
    await jobStore.update(jobId, {
      status: "VALIDATING",
      currentStage: "VALIDATING",
      updatedAt: new Date().toISOString(),
    });
    await startProcessing(jobId);
    const updated = await jobStore.get(jobId);
    return NextResponse.json({ jobId, job: updated });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message, code: e.code || "UNKNOWN_ERROR" }, { status: 500 });
  }
}
