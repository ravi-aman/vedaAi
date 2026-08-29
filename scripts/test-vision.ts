import * as fs from 'fs';
import { renderPdfPagesForVision } from '@/lib/documents/render';
import { OpenRouterVisionProvider } from '@/lib/vision/openrouter-vision';
(async()=>{
  const qpPath = 'C:/Users/Dell/AppData/Local/Temp/veda-ai/18645987-aec2-4683-8c8f-2a5fb8f185de/94fce398-d5e0-461f-90f5-a02fae3ff468';
  const buf = fs.readFileSync(qpPath);
  console.log('rendering qp page 1-2');
  const pages = await renderPdfPagesForVision(buf, [1,2], 2);
  console.log('rendered', pages.length, pages[0].mimeType, pages[0].width, pages[0].height, 'b64 len', pages[0].imageBase64.length);
  // save one
  fs.mkdirSync('artifacts/vision-test', {recursive:true});
  fs.writeFileSync('artifacts/vision-test/page-001.png', Buffer.from(pages[0].imageBase64,'base64'));
  console.log('saved png');
  // call Vision
  const provider = new OpenRouterVisionProvider();
  console.log('calling Vision analyzeDocumentStructure...');
  const input = {
    pages: pages.map(p=>({ pageId:`page-${p.pageNumber}`, pageNumber:p.pageNumber, imageBase64:p.imageBase64, mimeType:p.mimeType as any, width:p.width, height:p.height })),
    ocrTextSample: 'Sample question paper text Q1 What is 2+2?'
  };
  try{
    const res = await provider.analyzeDocumentStructure(input as any);
    console.log('Vision success pages', res.pages.length);
    console.log(JSON.stringify(res, null, 2).slice(0, 3000));
    fs.writeFileSync('artifacts/vision-test/vision.json', JSON.stringify(res, null, 2));
    console.log('saved vision.json');
  }catch(e:any){
    console.error('Vision fail', e.message, e.code, e.status);
    console.error(e.stack?.slice(0,2000));
  }
})();
