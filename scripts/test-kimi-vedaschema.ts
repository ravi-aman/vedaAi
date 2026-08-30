import * as dotenv from "dotenv";
dotenv.config();
import * as fs from "fs";
import * as path from "path";
const key = process.env.NVIDIA_API_KEY!;
const base = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
async function render(pageNum:number, kind:"qp"|"as"){
  const mupdf:any = await import("mupdf");
  const buf = fs.readFileSync(path.join(process.cwd(), kind==="qp" ? "Quetion_paper_Physics_1.pdf" : "handwrittern_answer_sheet_physics_1.pdf"));
  const doc = mupdf.Document.openDocument(buf, "application/pdf");
  const page = doc.loadPage(pageNum-1);
  const pix = page.toPixmap(mupdf.Matrix.scale(1.5,1.5), mupdf.ColorSpace.DeviceRGB, false, true);
  const png = pix.asPNG();
  const b64 = Buffer.from(png).toString("base64");
  doc.destroy();
  return { b64, w: pix.getWidth(), h: pix.getHeight(), kb: Math.round(png.length/1024) };
}
async function test(model:string, b64:string, label:string){
  const sys = 'You are VedaAI document structure analyzer. Analyze the page image visually and structurally. Return JSON per schema: { pageNumber, visualRegions:[{type, description, confidence, coarseBox, blockIds, relatedQuestionLabel}], questionCandidates:[{rawLabel, textHint, confidence, visualEvidence, blockIds, type}], answerGroupHints:[{labelHint, description, confidence, isDiagram, blockIds}], documentStructureHints:{isMultiColumn, hasSectionHeaders, hasInstructions, difficulty}}. Types MUST be one of: QUESTION, SUBPART, OPTION, INSTRUCTION, HEADER, FOOTER, INTERNAL_CHOICE, DIAGRAM, CONTINUATION, SECTION_HEADER, HANDWRITING_BLOCK, FIGURE, TABLE, MARKS.';
  const userText = JSON.stringify({pageNumber:1, hint:"Analyze"});
  const content = [{type:'text', text: userText}, {type:'image_url', image_url:{url:'data:image/png;base64,'+b64}}];
  const body:any = { model, messages:[{role:'system', content: sys}, {role:'user', content}], temperature:0.2, max_tokens:800, response_format:{type:'json_object'} };
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(), 90000);
  const start=Date.now();
  try{
    const res=await fetch(`${base.replace(/\/$/,"")}/chat/completions`, {method:'POST', headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'}, body: JSON.stringify(body), signal: ctrl.signal});
    clearTimeout(t);
    const txt=await res.text();
    console.log(`${model} ${label} status ${res.status} ${Date.now()-start}ms`);
    try{ const j=JSON.parse(txt); const c=j.choices?.[0]?.message?.content||""; console.log(`content ${c.slice(0,700).replace(/\n/g,' ')}`); const p=JSON.parse(c); console.log(`json vr=${p.visualRegions?.length} qc=${p.questionCandidates?.length}`);}catch(e:any){ console.log(`parse fail ${String(e.message).slice(0,400)} raw ${txt.slice(0,600)}`);}
  }catch(e:any){ clearTimeout(t); console.log(`${model} ERR ${e.name} ${String(e.message).slice(0,400)} ${Date.now()-start}ms`);}
}
async function main(){
  const qp = await render(1,"qp");
  console.log(`qp ${qp.kb}KB`);
  await test("moonshotai/kimi-k3", qp.b64, "kimi clean QP VedaAI");
}
main().catch(e=>{console.error(e); process.exit(1);});
