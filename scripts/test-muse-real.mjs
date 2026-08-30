import * as fs from 'fs';
import * as path from 'path';
const key = fs.readFileSync('E:/vedaAi/.env','utf8').split('\n').find(l=>l.startsWith('NVIDIA_API_KEY=')).split('=')[1].trim();
const base='https://integrate.api.nvidia.com/v1';
const mupdf = await import('mupdf');
const qpBuf = fs.readFileSync(path.join(process.cwd(), 'Quetion_paper_Physics_1.pdf'));
const doc = mupdf.Document.openDocument(qpBuf, 'application/pdf');
const page = doc.loadPage(0);
const pix = page.toPixmap(mupdf.Matrix.scale(1.5,1.5), mupdf.ColorSpace.DeviceRGB, false, true);
const png = pix.asPNG();
const b64 = Buffer.from(png).toString('base64');
console.log(`QP clean ${Math.round(png.length/1024)}KB ${pix.getWidth()}x${pix.getHeight()}`);
async function test(model, label, b64){
  const sys = 'You are VedaAI document structure analyzer. Analyze the page image visually and structurally. Return JSON per schema: { pageNumber, visualRegions:[{type, description, confidence, coarseBox, blockIds, relatedQuestionLabel}], questionCandidates:[{rawLabel, textHint, confidence, visualEvidence, blockIds, type}], answerGroupHints:[{labelHint, description, confidence, isDiagram, blockIds}], documentStructureHints:{isMultiColumn, hasSectionHeaders, hasInstructions, difficulty}}. Types MUST be one of: QUESTION, SUBPART, OPTION, INSTRUCTION, HEADER, FOOTER, INTERNAL_CHOICE, DIAGRAM, CONTINUATION, SECTION_HEADER, HANDWRITING_BLOCK, FIGURE, TABLE, MARKS.';
  const userText = JSON.stringify({pageNumber:1, hint:"Analyze this page structure"});
  const content = [{type:'text', text: userText}, {type:'image_url', image_url:{url:'data:image/png;base64,'+b64}}];
  const body={ model, messages:[{role:'system', content: sys}, {role:'user', content}], temperature:0.2, max_tokens:1500, response_format:{type:'json_object'} };
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(), 90000);
  const start=Date.now();
  try{
    const res=await fetch(`${base}/chat/completions`, {method:'POST', headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'}, body: JSON.stringify(body), signal: ctrl.signal});
    clearTimeout(t);
    const txt=await res.text();
    console.log(`${model} ${label} ${res.status} ${Date.now()-start}ms`);
    try{ const j=JSON.parse(txt); const c=j.choices?.[0]?.message?.content||""; console.log(`content len ${c.length} preview ${c.slice(0,600).replace(/\n/g,' ')}`); let p=null; try{ p=JSON.parse(c); console.log(`json valid vr=${p.visualRegions?.length} qc=${p.questionCandidates?.length}`);}catch(e){ console.log(`json parse failed ${e.message} raw ${c.slice(0,400)}`);} }catch(e){ console.log(`outer parse fail ${txt.slice(0,800)}`); }
    // save
    const dir='E:/vedaAi/artifacts/nvidia-vision-test';
    await fs.promises.mkdir(dir,{recursive:true});
    await fs.promises.writeFile(path.join(dir, `${model.replace(/[\/:]/g,'_')}__${label.replace(/\s/g,'_')}.json`), JSON.stringify({model,label,status:res.status, latencyMs:Date.now()-start, raw:txt.slice(0,8000)}, null, 2), 'utf-8');
  }catch(e){ clearTimeout(t); console.log(model, 'ERR', e.name, String(e.cause||e.message).slice(0,500), Date.now()-start+'ms'); }
}
await test('meta/muse-glimmer-30b', 'clean QP', b64);
await new Promise(r=>setTimeout(r,2000));
// Handwritten
const asBuf = fs.readFileSync(path.join(process.cwd(), 'handwrittern_answer_sheet_physics_1.pdf'));
const asDoc = mupdf.Document.openDocument(asBuf, 'application/pdf');
const asPage = asDoc.loadPage(4);
const asPix = asPage.toPixmap(mupdf.Matrix.scale(1.5,1.5), mupdf.ColorSpace.DeviceRGB, false, true);
const asPng = asPix.asPNG();
const asB64 = Buffer.from(asPng).toString('base64');
console.log(`AS hand ${Math.round(asPng.length/1024)}KB ${asPix.getWidth()}x${asPix.getHeight()}`);
await test('meta/muse-glimmer-30b', 'handwritten AS', asB64);
await new Promise(r=>setTimeout(r,2000));
await test('moonshotai/kimi-k3', 'clean QP', b64);
