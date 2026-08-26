import { NextRequest, NextResponse } from "next/server";
import { jobStore } from "@/lib/storage";
import { generateId } from "@/lib/storage";
import { getConfig } from "@/lib/config";
import type { ProcessingJob } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const cfg = getConfig();
    const id = generateId();
    const now = new Date().toISOString();
    const job: ProcessingJob = {
      id,
      createdAt: now,
      updatedAt: now,
      status: "CREATED",
      currentStage: "CREATED",
      progress: {
        stageStates: {
          CREATED: "completed",
          UPLOADING: "pending",
          UPLOADED: "pending",
          VALIDATING: "pending",
          PREPROCESSING: "pending",
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
    };
    await jobStore.create(job);
    console.log(JSON.stringify({ jobId: id, stage: "CREATED", status: "created", timestamp: now }));
    return NextResponse.json({ jobId: id, job }, { status: 201 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message, code: "UNKNOWN_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  const jobs = await jobStore.list();
  return NextResponse.json({ jobs });
}
