import { NextRequest, NextResponse } from "next/server";
import { jobStore } from "@/lib/storage";
import { generateId } from "@/lib/storage";
import { getConfig, isSupabaseConfigured } from "@/lib/config";
import type { ProcessingJob } from "@/types";
import { getOrCreateGuestSession } from "@/lib/auth/guest";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const cfg = getConfig();
    const id = generateId();
    const now = new Date().toISOString();
    // guest session
    let guestSessionId: string | null = null;
    try {
      guestSessionId = await getOrCreateGuestSession();
    } catch {}
    // try to get authenticated user if Supabase configured
    let userId: string | null = null;
    try {
      if (isSupabaseConfigured()) {
        const supabase = await createClient();
        const { data } = await supabase.auth.getUser();
        userId = data.user?.id || null;
      }
    } catch {}
    const job: ProcessingJob = {
      id,
      createdAt: now,
      updatedAt: now,
      status: "CREATED",
      currentStage: "CREATED",
      guestSessionId,
      userId,
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
    };
    await jobStore.create(job);
    console.log(JSON.stringify({ jobId: id, stage: "CREATED", guestSessionId: guestSessionId?.slice(0,8), userId: userId?.slice(0,8), timestamp: now }));
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
