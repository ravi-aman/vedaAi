import * as fs from 'fs';
import { renderPdfPagesForVision } from '@/lib/documents/render';
(async()=>{
  const qpPath = 'C:/Users/Dell/AppData/Local/Temp/veda-ai/18645987-aec2-4683-8c8f-2a5fb8f185de/94fce398-d5e0-461f-90f5-a02fae3ff468';
  const b = fs.readFileSync(qpPath);
  console.log('buf size', b.length);
  const res = await renderPdfPagesForVision(b, [1,2,3], 3);
  console.log('rendered', res.length, res[0].mimeType, res[0].imageBase64.slice(0,30), 'width', res[0].width);
  console.log('is png?', res[0].mimeType==='image/png' && res[0].imageBase64.startsWith('iVBOR'));
  if(res[0].mimeType==='image/png'){
    const out = Buffer.from(res[0].imageBase64,'base64');
    console.log('png bytes', out.length, 'header', out.slice(0,8).toString('hex'));
    // save one
    fs.mkdirSync('artifacts/test-render', {recursive:true});
    fs.writeFileSync('artifacts/test-render/page-001.png', out);
    console.log('saved artifacts/test-render/page-001.png');
  }
})();
