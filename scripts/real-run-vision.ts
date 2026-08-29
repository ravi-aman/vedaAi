import * as fs from 'fs';
import * as path from 'path';
import { jobStore, documentStore, pageStoreApi, fileStorage, generateId } from '@/lib/storage';
import { startProcessing, ocrResultStore, resultStore, fusionResultStore, visionResultStore } from '@/lib/jobs/runner';
import { getConfig } from '@/lib/config';
async function main(){
  const qpPath = 'C:/Users/Dell/AppData/Local/Temp/veda-ai/18645987-aec2-4683-8c8f-2a5fb8f185de/94fce398-d5e0-461f-90f5-a02fae3ff468';
  const asPath = 'C:/Users/Dell/AppData/Local/Temp/veda-ai/18645987-aec2-4683-8c8f-2a5fb8f185de/d1926963-a4e9-48ca-8446-431f6bb613fc';
  const qpBuf = fs.readFileSync(qpPath);
  const asBuf = fs.readFileSync(asPath);
  console.log(`qp ${qpBuf.length} as ${asBuf.length}`);
  const cfg = getConfig() as any;
  console.log(`VISION_PROVIDER=${cfg.VISION_PROVIDER} VISION_TIMEOUT=${cfg.VISION_TIMEOUT_MS}`);
  const jobId = generateId();
  const now = new Date().toISOString();
  await jobStore.create({ id: jobId, createdAt: now, updatedAt: now, status: 'CREATED', currentStage: 'CREATED', progress: { stageStates: {} as any }, pipelineVersion: cfg.pipelineVersion || '0.2.0' } as any);
  const qpFileId = generateId(); const asFileId = generateId();
  await jobStore.update(jobId, { questionPaperFileId: qpFileId, answerSheetFileId: asFileId } as any);
  const qpDocId = generateId(); const asDocId = generateId();
  await documentStore.save({ id: qpDocId, jobId, kind: 'questionPaper', originalName: 'questionPaper.pdf', mime: 'application/pdf', size: qpBuf.length, pageCount: 0, pageIds: [], createdAt: now });
  await documentStore.save({ id: asDocId, jobId, kind: 'answerSheet', originalName: 'answerSheet.pdf', mime: 'application/pdf', size: asBuf.length, pageCount: 0, pageIds: [], createdAt: now });
  await jobStore.update(jobId, { questionPaperDocId: qpDocId, answerSheetDocId: asDocId } as any);
  await fileStorage.save(jobId, qpFileId, qpBuf, 'questionPaper.pdf');
  await fileStorage.save(jobId, asFileId, asBuf, 'answerSheet.pdf');
  console.log(`job ${jobId} starting`);
  await startProcessing(jobId);
  const start = Date.now();
  while(true){
    const job = await jobStore.get(jobId);
    console.log(`${new Date().toISOString()} stage=${job?.currentStage} status=${job?.status}`);
    if(job?.status==='COMPLETED' || job?.status==='FAILED') break;
    if(Date.now()-start> 600000){ console.error('timeout'); break; }
    await new Promise(r=>setTimeout(r,5000));
  }
  const finalJob = await jobStore.get(jobId);
  console.log('final', finalJob?.status, finalJob?.currentStage);
  const artDir = path.join(process.cwd(), 'artifacts', jobId);
  await fs.promises.mkdir(artDir, {recursive:true});
  const ocr = ocrResultStore.get(jobId);
  const vision = visionResultStore.get(jobId);
  const fusion = fusionResultStore.get(jobId);
  const result = (resultStore as any).get(jobId);
  await fs.promises.writeFile(path.join(artDir,'01-original-metadata.json'), JSON.stringify({jobId, qpSize: qpBuf.length, asSize: asBuf.length, job: finalJob},null,2));
  if(ocr?.qpOcr) await fs.promises.writeFile(path.join(artDir,'02-textract-raw.json'), JSON.stringify(ocr.qpOcr,null,2));
  if(ocr?.asOcr) await fs.promises.writeFile(path.join(artDir,'03-textract-normalized.json'), JSON.stringify(ocr.asOcr,null,2));
  if(vision) await fs.promises.writeFile(path.join(artDir,'04-vision.json'), JSON.stringify(vision,null,2));
  else await fs.promises.writeFile(path.join(artDir,'04-vision.json'), JSON.stringify({note:'no vision'},null,2));
  // save vision pages as png
  if(vision){
    const vDir = path.join(artDir,'vision-pages');
    await fs.promises.mkdir(vDir,{recursive:true});
    // Also save rendered pngs from tmp debug? Instead save from vision input? For now check if vision has pages with image info, but we need to save actual pngs rendered via mupdf earlier - they are not stored. We can re-render and save here:
    const { renderPdfPagesForVision } = await import('@/lib/documents/render');
    const qpPages = await renderPdfPagesForVision(qpBuf, [1,2,3], 3);
    for(const p of qpPages){
      if(p.mimeType==='image/png') await fs.promises.writeFile(path.join(vDir,`qp-page-${String(p.pageNumber).padStart(3,'0')}.png`), Buffer.from(p.imageBase64,'base64'));
    }
    const asPages = await renderPdfPagesForVision(asBuf, [1,2,3], 3);
    for(const p of asPages){
      if(p.mimeType==='image/png') await fs.promises.writeFile(path.join(vDir,`as-page-${String(p.pageNumber).padStart(3,'0')}.png`), Buffer.from(p.imageBase64,'base64'));
    }
    console.log('saved vision pngs to', vDir);
  }
  if(fusion) await fs.promises.writeFile(path.join(artDir,'05-fusion-document.json'), JSON.stringify(fusion,null,2));
  const tmpDebug = path.join(require('os').tmpdir(),'veda-ai',jobId,'debug');
  try{ const qc = await fs.promises.readFile(path.join(tmpDebug,'question-candidates.json'),'utf8'); await fs.promises.writeFile(path.join(artDir,'06-question-candidates.json'), qc); }catch{}
  if(result){
    await fs.promises.writeFile(path.join(artDir,'07-question-tree.json'), JSON.stringify(result.questions,null,2));
    await fs.promises.writeFile(path.join(artDir,'08-answer-regions.json'), JSON.stringify(result.answerGroups,null,2));
    await fs.promises.writeFile(path.join(artDir,'09-mapping-candidates.json'), JSON.stringify(result.decisions.map((d:any)=>({questionId:d.questionId, answerGroupId:d.answerGroupId, evidence:d.evidence, confidence:d.confidence})),null,2));
    await fs.promises.writeFile(path.join(artDir,'10-mapping-decisions.json'), JSON.stringify(result.decisions,null,2));
    await fs.promises.writeFile(path.join(artDir,'11-highlight-regions.json'), JSON.stringify(result.decisions.flatMap((d:any)=>d.highlightRegions),null,2));
    const tops = result.questions.filter((q:any)=>q.depth===0);
    console.log(`TOP ${tops.length} TOTAL ${result.questions.length} MCQ ${result.questions.filter((q:any)=>q.options?.length).length}`);
  }
  console.log('done artifacts', artDir);
}
main().catch(e=>{ console.error(e); process.exit(1);});
