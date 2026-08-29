// @ts-nocheck
import { jobStore } from "../src/lib/storage";
const jobId = process.argv[2] || "15580154-a6d8-465b-a493-1dd38f545ff3";
async function main() {
  const job = await jobStore.get(jobId);
  if (!job) { console.log("not found", jobId); return; }
  console.log(JSON.stringify({ jobId: job.id, status: job.status, stage: job.currentStage, error: job.error, ocrStartedAt: (job as any).ocrStartedAt, ocrCompletedAt: (job as any).ocrCompletedAt }, null, 2));
  try {
    const { ocrResultStore, visionResultStore, fusionResultStore, resultStore } = await import("../src/lib/jobs/runner");
    const ocr = ocrResultStore.get(jobId);
    if (ocr) console.log("ocr", { qp: ocr.qpOcr?.pages.length, as: ocr.asOcr?.pages.length, provider: ocr.qpOcr?.provider, qpLines: ocr.qpOcr?.pages.reduce((a,p)=>a+p.lines.length,0), asLines: ocr.asOcr?.pages.reduce((a,p)=>a+p.lines.length,0) });
    else console.log("ocr not yet in memory, try reading persist");
    const res = resultStore.get(jobId);
    if (res) console.log("result", { questions: res.questions?.length, answers: res.answerGroups?.length, decisions: res.decisions?.length });
  } catch(e){ console.log(e) }
}
main();
