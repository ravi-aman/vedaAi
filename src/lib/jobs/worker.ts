// External PaddleOCR Worker — long-running container (Phase 7)
// Pulls jobs from Supabase queue, runs existing pipeline (preserves parallel OCR/Vision)
// Usage: npm run worker  or  docker run ... npm run worker
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PROCESSING_BACKEND=local (worker always uses local pipeline)

import { jobStore } from "@/lib/storage";
import { getConfig } from "@/lib/config";

let running = false;
let heartbeatTimer: NodeJS.Timeout | null = null;
let currentJobId: string | null = null;

function getWorkerId() {
  return `worker-${process.pid}-${Date.now().toString(36)}`;
}
const WORKER_ID = getWorkerId();

async function heartbeatLoop() {
  if (!currentJobId) return;
  try {
    const { jobStore } = await import("@/lib/storage");
    const store: any = jobStore;
    if (store.heartbeat) await store.heartbeat(currentJobId);
    else await store.update(currentJobId, { heartbeatAt: new Date().toISOString() as any, updatedAt: new Date().toISOString() } as any);
  } catch {}
}

async function claimNextJob(): Promise<string | null> {
  const cfg = getConfig() as any;
  const staleMs = cfg.WORKER_STALE_TIMEOUT_MS || 120000;
  const jobs = await jobStore.list();
  // Find QUEUED or stale PROCESSING
  const now = Date.now();
  const candidates = jobs.filter((j: any) => {
    if (j.status === "QUEUED" || j.currentStage === "QUEUED") return true;
    if (j.status === "VALIDATING" || j.status === "PREPROCESSING" || j.currentStage === "VALIDATING") {
      const hb = j.heartbeatAt ? new Date(j.heartbeatAt as any).getTime() : 0;
      if (!hb) return true; // no heartbeat yet, allow claim after 30s
      if (now - hb > staleMs) return true;
    }
    // Also stale jobs stuck in PROCESSING without heartbeat
    const stage = j.currentStage;
    const processingStages = ["PREPROCESSING","OCR_PROCESSING","VISION","FUSION","EXTRACTING","STRUCTURING","MATCHING","LOCALIZING"];
    if (processingStages.includes(stage)) {
      const hb = (j as any).heartbeatAt ? new Date((j as any).heartbeatAt).getTime() : new Date(j.updatedAt).getTime();
      if (now - hb > staleMs) return true;
    }
    return false;
  });
  // Sort by createdAt oldest first
  candidates.sort((a: any,b: any)=> new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  for (const j of candidates) {
    try {
      const store: any = jobStore;
      if (store.claim) {
        const claimed = await store.claim(j.id, WORKER_ID);
        if (claimed) return j.id;
      } else {
        // fallback claim via update if no claim method
        const latest = await jobStore.get(j.id);
        if (!latest) continue;
        if (latest.status === "COMPLETED" || latest.status === "FAILED") continue;
        await jobStore.update(j.id, { status: "VALIDATING" as any, currentStage: "VALIDATING" as any, heartbeatAt: new Date().toISOString() as any, claimedBy: WORKER_ID as any } as any);
        return j.id;
      }
    } catch (e) {
      console.warn(`[worker] claim failed ${j.id}`, e);
    }
  }
  return null;
}

async function processJob(jobId: string) {
  currentJobId = jobId;
  console.log(JSON.stringify({ worker: WORKER_ID, jobId, event: "claim_success" }));
  // Start heartbeat
  const cfg = getConfig() as any;
  const interval = cfg.WORKER_HEARTBEAT_INTERVAL_MS || 15000;
  heartbeatTimer = setInterval(heartbeatLoop, interval);
  try {
    // Ensure job is in VALIDATING state
    const { startProcessing } = await import("./runner");
    // startProcessing handles idempotency and heartbeat via jobStore updates
    await startProcessing(jobId);
    // Wait for completion? startProcessing runs async via runJob but with timeout guard
    // Poll until COMPLETED/FAILED
    for (let i=0;i<600;i++) { // up to 50 min
      await new Promise(r=>setTimeout(r, 5000));
      const j = await jobStore.get(jobId);
      if (!j) break;
      if (j.status === "COMPLETED" || j.status === "FAILED") {
        console.log(JSON.stringify({ worker: WORKER_ID, jobId, event: "job_done", status: j.status, stage: j.currentStage }));
        break;
      }
      // heartbeat is already periodic, but also ensure
      await heartbeatLoop();
    }
  } catch (e: any) {
    console.error(JSON.stringify({ worker: WORKER_ID, jobId, event: "job_error", error: e.message }));
    try { await jobStore.update(jobId, { status: "FAILED" as any, currentStage: "FAILED" as any, error: { code: e.code || "WORKER_ERROR", message: e.message, stage: "FAILED" as any, timestamp: new Date().toISOString() } as any } as any); } catch {}
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    currentJobId = null;
  }
}

export async function startWorkerLoop() {
  if (running) return;
  running = true;
  console.log(JSON.stringify({ worker: WORKER_ID, event: "worker_start", pid: process.pid }));
  const cfg = getConfig() as any;
  const pollMs = cfg.WORKER_POLL_INTERVAL_MS || 5000;
  // Also support processing a single job via env JOB_ID (for one-off container per job)
  const singleJobId = process.env.JOB_ID || process.env.WORKER_JOB_ID;
  if (singleJobId) {
    console.log(JSON.stringify({ worker: WORKER_ID, event: "single_job_mode", jobId: singleJobId }));
    await processJob(singleJobId);
    process.exit(0);
  }
  while (running) {
    try {
      const jobId = await claimNextJob();
      if (jobId) {
        await processJob(jobId);
      } else {
        await new Promise(r=>setTimeout(r, pollMs));
      }
    } catch (e: any) {
      console.error(`[worker] loop error`, e);
      await new Promise(r=>setTimeout(r, pollMs));
    }
  }
}

export function stopWorker() { running = false; if (heartbeatTimer) clearInterval(heartbeatTimer); }

// If run directly: `tsx src/lib/jobs/worker.ts` or `npm run worker`
if (require.main === module) {
  startWorkerLoop().catch(e=>{ console.error(e); process.exit(1); });
  process.on("SIGTERM", ()=>{ console.log("[worker] SIGTERM"); stopWorker(); setTimeout(()=>process.exit(0), 2000); });
  process.on("SIGINT", ()=>{ console.log("[worker] SIGINT"); stopWorker(); setTimeout(()=>process.exit(0), 2000); });
}
