import { NextRequest, NextResponse } from "next/server";
import { jobStore } from "@/lib/storage";
import { dispatchProcessing } from "@/lib/jobs/processing-backend";
import { getConfig, isRemoteBackend } from "@/lib/config";

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
  // Idempotency: if already QUEUED/VALIDATING and remote backend, just return
  if (isRemoteBackend() && ["QUEUED", "VALIDATING", "PREPROCESSING"].includes(job.status as string)) {
    return NextResponse.json({ jobId, job, backend: "remote", queued: true });
  }
  if (!isRemoteBackend() && ["VALIDATING","PREPROCESSING","OCR_PROCESSING","VISION","FUSION","EXTRACTING","STRUCTURING","MATCHING"].includes(job.currentStage)) {
    // Local already processing — idempotent
    return NextResponse.json({ jobId, job, backend: "local", status: "already processing" });
  }

  try {
    console.log(JSON.stringify({ jobId, stage: "START", event: "start_processing", backend: isRemoteBackend() ? "remote" : "local", ts: new Date().toISOString() }));
    const result = await dispatchProcessing(jobId);
    const updated = await jobStore.get(jobId);
    // For local backend, startProcessing is fire-and-forget via runJob (doesn't block HTTP); for remote it's QUEUED
    return NextResponse.json({ jobId, job: updated, backend: result.backend, enqueued: (result as any).enqueued || false });
  } catch (e: any) {
    console.error(JSON.stringify({ jobId, stage: "START", error: e.message, code: e.code }));
    return NextResponse.json({ error: e.message, code: e.code || "UNKNOWN_ERROR" }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 30;
