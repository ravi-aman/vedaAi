import * as fs from "fs";
import * as path from "path";
import { jobStore, documentStore, pageStoreApi, fileStorage, generateId } from "../src/lib/storage/index.ts";
import { getConfig, clearConfigCache } from "../src/lib/config/index.ts";
import { startProcessing } from "../src/lib/jobs/runner.ts";
import { inspectPdf } from "../src/lib/documents/pdf.ts";

process.env.VISION_PROVIDER = "disabled";
clearConfigCache();
const cfg = getConfig();
console.log("VISION", cfg.VISION_PROVIDER, "OCR", cfg.OCR_PROVIDER);

const qpPath = path.join(process.cwd(), "Quetion_paper_Physics_1.pdf");
const asPath = path.join(process.cwd(), "handwrittern_answer_sheet_physics_1.pdf");
const qpBuf = fs.readFileSync(qpPath);
const asBuf = fs.readFileSync(asPath);
console.log("QP", qpBuf.length, "AS", asBuf.length);

const jobId = generateId();
const now = new Date().toISOString();
await jobStore.create({
  id: jobId,
  createdAt: now,
  updatedAt: now,
  status: "CREATED",
  currentStage: "CREATED",
  guestSessionId: null,
  userId: null,
  progress: { stageStates: { CREATED: "completed" } },
  pipelineVersion: cfg.pipelineVersion,
  modelVersion: cfg.AI_MODEL,
});
console.log("created", jobId);

async function upload(kind, buffer, name){
  const fileId = generateId();
  await fileStorage.save(jobId, fileId, buffer, name);
  const ins = await inspectPdf(buffer);
  const docId = generateId();
  await documentStore.save({ id: docId, jobId, kind, originalName: name, mime: "application/pdf", size: buffer.length, pageCount: ins.pageCount, pageIds: [], createdAt: now });
  for(const p of ins.pages){
    const pid = generateId();
    await pageStoreApi.save({ id: pid, documentId: docId, pageNumber: p.pageNumber, width: p.width, height: p.height, rotation: p.rotation });
  }
  const patch={};
  if(kind==="questionPaper"){ patch.questionPaperFileId=fileId; patch.questionPaperDocId=docId; }
  else { patch.answerSheetFileId=fileId; patch.answerSheetDocId=docId; }
  patch.updatedAt=now;
  patch.status="UPLOADED";
  patch.currentStage="UPLOADED";
  await jobStore.update(jobId, patch);
}
await upload("questionPaper", qpBuf, "qp.pdf");
await upload("answerSheet", asBuf, "as.pdf");
await jobStore.update(jobId, { status:"VALIDATING", currentStage:"VALIDATING", updatedAt:new Date().toISOString()});
console.log("startProcessing");
await startProcessing(jobId);
const start=Date.now();
while(Date.now()-start< 600000){
  const cur = await jobStore.get(jobId);
  console.log(`poll ${Math.round((Date.now()-start)/1000)}s ${cur?.currentStage} ${cur?.status}`);
  if(cur?.status==="COMPLETED"||cur?.status==="FAILED"){ console.log("final", cur?.status, cur?.error); break; }
  await new Promise(r=>setTimeout(r,3000));
}
const final = await jobStore.get(jobId);
console.log("DONE", final?.status);
if(final?.status==="COMPLETED"){
  const contractPath = path.join(process.cwd(), "artifacts", jobId, "answer-graph-contract.json");
  if(fs.existsSync(contractPath)){
    const c = JSON.parse(fs.readFileSync(contractPath,"utf-8"));
    console.log("contract", c.logicalGroupCount, c.mappingUnitCount, "invariant", c.logicalGroupCount===c.mappingUnitCount);
    console.log(c.groups.slice(0,3).map(g=>[g.id,g.regionCount,g.pageNumbers]));
  } else {
    console.log("no contract file");
    // check tmp
    const tmp = path.join(fs.realpathSync(require("os").tmpdir()), "veda-ai", jobId, "answer-graph-contract.json");
    console.log("tmp check", tmp, fs.existsSync(tmp));
  }
}
