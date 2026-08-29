import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { segmentAnswersFromTextract } from '@/lib/structure/answer-segmentation';

async function main(){
  const jobId='39ac494f-ecec-4ccc-91ca-c9e9995a644b';
  const p = path.join(os.tmpdir(),'veda-ai',jobId,'debug','answerSheet-textract.json');
  const ocr = JSON.parse(fs.readFileSync(p,'utf8'));
  const pages = ocr.pages.map((pg:any)=>({id:'page-'+pg.pageNumber, documentId:'d1', pageNumber: pg.pageNumber, width:800, height:1100, rotation:0}));
  const res = segmentAnswersFromTextract(ocr, pages);
  res.forEach((s,i)=> console.log(JSON.stringify({i, label:s.questionLabel, norm:s.normalizedLabel, pages:s.pageNumbers, lines:s.lines.length, text:s.text.slice(0,60).replace(/\n/g,' ')})));
  console.log('total',res.length);
}
main();
