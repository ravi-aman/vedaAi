import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config();
import { jobStore, documentStore, pageStoreApi, fileStorage, generateId } from "@/lib/storage";
import { startProcessing, visionResultStore, resultStore } from "@/lib/jobs/runner";
import { getVisionRuntimeConfig } from "@/lib/config";

async function main(){
  const qpPath = path.join(process.cwd(), "Quetion_paper_Physics_1.pdf");
  const asPath = path.join(process.cwd(), "handwrittern_answer_sheet_physics_1.pdf");
  const qpBuf = fs.readFileSync(qpPath);
  const asBuf = fs.readFileSync(asPath);
  console.log(`QP ${qpBuf.length} AS ${asBuf.length}`);
  const runtime = getVisionRuntimeConfig();
  console.log(`Vision order ${runtime.providerOrder.join(",")} batch ${runtime.batchSize} concurrency ${runtime.globalConcurrency} timeout ${runtime.timeoutMs} autoFallback ${runtime.autoFallback}`);
  const jobId = generateId();
  const now = new Date().toISOString();
  await jobStore.create({ id: jobId, createdAt: now, updatedAt: now, status: "CREATED", currentStage: "CREATED", progress: { stageStates: {} as any, docStageStates: {} as any }, pipelineVersion: "0.2.0" } as any);
  const qpFileId = generateId(); const asFileId = generateId();
  await jobStore.update(jobId, { questionPaperFileId: qpFileId, answerSheetFileId: asFileId } as any);
  const qpDocId = generateId(); const asDocId = generateId();
  await documentStore.save({ id: qpDocId, jobId, kind: "questionPaper", originalName: "Quetion_paper_Physics_1.pdf", mime: "application/pdf", size: qpBuf.length, pageCount: 27, pageIds: [], createdAt: now });
  await documentStore.save({ id: asDocId, jobId, kind: "answerSheet", originalName: "handwrittern_answer_sheet_physics_1.pdf", mime: "application/pdf", size: asBuf.length, pageCount: 31, pageIds: [], createdAt: now });
  await fileStorage.save(jobId, qpFileId, qpBuf, "questionPaper.pdf");
  await fileStorage.save(jobId, asFileId, asBuf, "answerSheet.pdf");
  console.log(`Job ${jobId} created, starting processing...`);
  const t0 = Date.now();
  await startProcessing(jobId);
  // Poll
  while(true){
    const job = await jobStore.get(jobId);
    const stage = (job as any)?.currentStage;
    const status = (job as any)?.status;
    console.log(`${new Date().toISOString()} stage=${stage} status=${status} elapsed=${Math.round((Date.now()-t0)/1000)}s`);
    if(status==="COMPLETED" || status==="FAILED"){ console.log(`Final ${status} ${stage} error=${JSON.stringify((job as any)?.error)?.slice(0,500)}`); break; }
    if(Date.now()-t0 > 20*60*1000){ console.log("TIMEOUT 20min"); break; }
    await new Promise(r=>setTimeout(r,5000));
  }
  const finalJob = await jobStore.get(jobId);
  console.log(`\nFinal job ${jobId} status=${(finalJob as any)?.status} stage=${(finalJob as any)?.currentStage}`);
  const artDir = path.join(process.cwd(), "artifacts", jobId);
  console.log(`Artifacts dir: ${artDir}`);
  try{
    const files = await fs.promises.readdir(artDir).catch(()=>[]);
    console.log(`Artifacts files: ${files.slice(0,20).join(", ")}`);
    const metricsPath = path.join(artDir, "vision-provider-metrics.json");
    if(fs.existsSync(metricsPath)){
      const m = JSON.parse(fs.readFileSync(metricsPath,"utf8"));
      console.log(`\nVision metrics: preferred=${m.preferredProvider} actual=${m.actualProvider} fallbackUsed=${m.fallbackUsed} fallbackReason=${m.fallbackReason}`);
      console.log(`perProvider: ${JSON.stringify(m.perProvider, null, 2).slice(0,2000)}`);
    }
    const timelinePath = path.join(artDir, "performance-timeline.json");
    if(fs.existsSync(timelinePath)){
      const tl = JSON.parse(fs.readFileSync(timelinePath,"utf8"));
      console.log(`\nTimeline total ${tl.totalWallMs}ms, stages: ${tl.timeline.map((e:any)=>e.stage+":"+e.status).join(", ")}`);
      // Check 4-way parallel
      const parallel = tl.timeline.find((e:any)=>e.stage==="PARALLEL_OCR_VISION");
      if(parallel) console.log(`Parallel stage: ${JSON.stringify(parallel)}`);
    }
    const result = (resultStore as any).get(jobId) || await (resultStore as any).getAsync(jobId);
    if(result){
      console.log(`\nResult: questions=${result.questions.length} answerGroups=${result.answerGroups?.length || 0} decisions=${result.decisions?.length || 0}`);
      const tops = result.questions.filter((q:any)=>q.depth===0);
      console.log(`Top-level ${tops.length} total ${result.questions.length}`);
    }
  }catch(e:any){ console.error("artifact read fail", e.message); }
}

main().catch(e=>{console.error(e); process.exit(1);});
