import * as fs from 'fs';
import { renderPdfPagesForVision } from '@/lib/documents/render';
import { OpenRouterVisionProvider } from '@/lib/vision/openrouter-vision';
(async()=>{
  const asPath = 'C:/Users/Dell/AppData/Local/Temp/veda-ai/18645987-aec2-4683-8c8f-2a5fb8f185de/d1926963-a4e9-48ca-8446-431f6bb613fc';
  const buf = fs.readFileSync(asPath);
  console.log('rendering as pages 1-2');
  const pages = await renderPdfPagesForVision(buf, [1,2], 2);
  console.log('rendered', pages.length, pages[0].width, pages[0].height, pages[0].mimeType);
  fs.mkdirSync('artifacts/vision-test-as', {recursive:true});
  for(const p of pages) fs.writeFileSync(`artifacts/vision-test-as/as-page-${String(p.pageNumber).padStart(3,'0')}.png`, Buffer.from(p.imageBase64,'base64'));
  console.log('saved pngs');
  const provider = new OpenRouterVisionProvider();
  const input = { pages: pages.map(p=>({ pageId:`page-${p.pageNumber}`, pageNumber:p.pageNumber, imageBase64:p.imageBase64, mimeType:p.mimeType as any, width:p.width, height:p.height })), ocrTextSample: 'handwritten answer sheet sample Q1 answer' };
  console.log('calling Vision for answer sheet...');
  try{
    const res = await provider.analyzeDocumentStructure(input as any);
    console.log('Vision AS success pages', res.pages.length);
    console.log(JSON.stringify(res,null,2).slice(0,4000));
    fs.writeFileSync('artifacts/vision-test-as/vision-as.json', JSON.stringify(res,null,2));
    console.log('saved');
  }catch(e:any){ console.error('fail', e.message); console.error(e.stack?.slice(0,2000)); }
})();
