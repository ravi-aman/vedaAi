// ProcessingBackend abstraction — keeps pipeline backend-independent (Phase 5)
import { jobStore } from "@/lib/storage";
import { isRemoteBackend, getConfig } from "@/lib/config";

export interface ProcessingBackend {
  start(jobId: string): Promise<void>;
  readonly name: string;
}

// Local: runs pipeline in-process (npm run dev, tests)
class LocalBackend implements ProcessingBackend {
  readonly name = "local";
  async start(jobId: string): Promise<void> {
    const { startProcessing } = await import("./runner");
    await startProcessing(jobId);
  }
}

// Remote: enqueues job to durable queue, worker claims it (Vercel production)
class RemoteBackend implements ProcessingBackend {
  readonly name = "remote";
  async start(jobId: string): Promise<void> {
    const job = await jobStore.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    if (job.status === "COMPLETED") return;
    // Atomic transition to QUEUED (durable)
    const now = new Date().toISOString();
    await jobStore.update(jobId, {
      status: "QUEUED" as any,
      currentStage: "QUEUED" as any,
      queuedAt: now as any,
      heartbeatAt: now as any,
      progress: {
        ...job.progress,
        stageStates: { ...job.progress.stageStates, QUEUED: "completed" as const, VALIDATING: "pending" as const } as any,
      } as any,
      updatedAt: now,
    } as any);
    console.log(JSON.stringify({ jobId, stage: "QUEUE", event: "enqueued_remote", backend: "remote", ts: now }));
    // Try to notify worker via HTTP if WORKER_URL configured (optional push)
    const cfg = getConfig() as any;
    const workerUrl = cfg.WORKER_URL || process.env.WORKER_URL;
    if (workerUrl) {
      try {
        const url = `${workerUrl.replace(/\/$/,"")}/process/${jobId}`;
        fetch(url, { method: "POST", headers: { "x-worker-token": cfg.WORKER_TOKEN || "" } }).catch(()=>{});
        console.log(JSON.stringify({ jobId, stage: "QUEUE", event: "worker_webhook_sent", url }));
      } catch {}
    }
    // No await of actual processing — worker will claim
  }
}

export function getProcessingBackend(): ProcessingBackend {
  if (isRemoteBackend()) return new RemoteBackend();
  return new LocalBackend();
}

// Helper for API route: also export direct start that respects backend
export async function dispatchProcessing(jobId: string): Promise<{ backend: string; enqueued: boolean }> {
  const backend = getProcessingBackend();
  await backend.start(jobId);
  return { backend: backend.name, enqueued: backend.name === "remote" };
}
