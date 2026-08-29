import * as fs from 'fs'; import * as path from 'path'; import * as os from 'os';
const jobId='39ac494f-ecec-4ccc-91ca-c9e9995a644b';
const p = path.join(os.tmpdir(),'veda-ai',jobId,'debug','questionPaper-textract.json');
const ocr = JSON.parse(fs.readFileSync(p,'utf8'));
const pg = ocr.pages.find((x:any)=>x.pageNumber===7);
if(!pg){console.error('no pg7');process.exit(1);}
console.log('page7 lines',pg.lines.length);
pg.lines.forEach((l:any,i:number)=> console.log(`${i} y=${l.boundingBox.y.toFixed(3)} x=${l.boundingBox.x.toFixed(3)} w=${l.boundingBox.width.toFixed(3)} text=${JSON.stringify(l.text)}`));
