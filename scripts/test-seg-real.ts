import * as fs from 'fs';
import * as path from 'path';
import { segmentAnswersFromTextract } from '@/lib/structure/answer-segmentation';
import * as os from 'os';

async function main(){
  const jobId='39ac494f-ecec-4ccc-91ca-c9e9995a644b';
  const p = path.join(os.tmpdir(),'veda-ai',jobId,'debug','answerSheet-textract.json');
  const q = path.join(os.tmpdir(),'veda-ai',jobId,'debug','fusion-as.json');
  if(!fs.existsSync(p)){ console.error('not found',p); return; }
  const ocr = JSON.parse(fs.readFileSync(p,'utf8'));
  // Need pages meta
  const docs = JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'veda-ai',jobId,'debug','fusion-as.json'),'utf8'));
  // Actually we need DocumentPage[] from fusion, but we can mock
  const fusion = JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'veda-ai',jobId,'debug','fusion-as.json'),'utf8'));
  const pagesMeta = fusion.canonical?.pages?.map((pg:any,i:number)=>({id:`page-${i+1}`, documentId:'d1', pageNumber: pg.pageNumber || i+1, width:800, height:1100, rotation:0})) || [];
  // Fallback: generate from ocr pages
  const pages = ocr.pages.map((pg:any)=>({id:`page-${pg.pageNumber}`, documentId:'d1', pageNumber: pg.pageNumber, width:800, height:1100, rotation:0}));
  console.log('ocr pages',ocr.pages.length,'meta',pages.length);
  const res = segmentAnswersFromTextract(ocr, pages);
  console.log('segments',res.length);
  for(const s of res.slice(0,20)){
    console.log(`${s.normalizedLabel || 'UNLABELED'} | pages ${s.pageNumbers.join(',')} | lines ${s.lines.length} | text ${s.text.slice(0,60).replace(/\n/g,' ')} | label ${s.questionLabel}`);
  }
  // Check Q1
  const q1 = res.find(r=>r.normalizedLabel==='1');
  if(q1) console.log('Q1 found pages',q1.pageNumbers,'lines',q1.lines.length,'text',q1.text.slice(0,100));
  // Check counts per label
  const byLabel:Record<string,number>={};
  for(const s of res) byLabel[s.normalizedLabel||'UNL'] = (byLabel[s.normalizedLabel||'UNL']||0)+1;
  console.log('byLabel',byLabel);
}
main().catch(e=>{console.error(e); process.exit(1);});
