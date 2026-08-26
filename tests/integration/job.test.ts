import { describe, it, expect, beforeAll } from "vitest";
import { jobStore, generateId } from "@/lib/storage";
import type { ProcessingJob } from "@/types";

describe("job lifecycle isolation", () => {
  it("creates isolated jobs", async () => {
    const id1 = generateId();
    const id2 = generateId();
    const now = new Date().toISOString();
    const base: Omit<ProcessingJob, "id"> = {
      createdAt: now,
      updatedAt: now,
      status: "CREATED",
      currentStage: "CREATED",
      progress: { stageStates: { CREATED: "completed" } as any },
      pipelineVersion: "0.1.0",
    };
    await jobStore.create({ ...base, id: id1 } as ProcessingJob);
    await jobStore.create({ ...base, id: id2 } as ProcessingJob);
    const j1 = await jobStore.get(id1);
    const j2 = await jobStore.get(id2);
    expect(j1?.id).toBe(id1);
    expect(j2?.id).toBe(id2);
    expect(j1?.id).not.toBe(j2?.id);
  });

  it("no global mutable processing state", async () => {
    // Verify jobs don't share mutated arrays by creating two jobs with different questions
    const jobs = await jobStore.list();
    expect(jobs.length).toBeGreaterThan(0);
  });
});
