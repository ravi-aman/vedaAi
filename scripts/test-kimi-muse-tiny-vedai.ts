import * as dotenv from "dotenv";
dotenv.config();
const key = process.env.NVIDIA_API_KEY!;
const base = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
const tiny='iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAEElEQVR42mP8z8BQz0AEYBxVSQAARgAFB/lXigAAAABJRU5ErkJggg==';
async function test(model:string){
  const sys = 'You are VedaAI document structure analyzer. Analyze the page image visually and structurally. Return JSON per schema: { pageNumber, visualRegions:[{type, description, confidence, coarseBox, blockIds, relatedQuestionLabel}], questionCandidates:[{rawLabel, textHint, confidence, visualEvidence, blockIds, type}], answerGroupHints:[{labelHint, description, confidence, isDiagram, blockIds}], documentStructureHints:{isMultiColumn, hasSectionHeaders, hasInstructions, difficulty}}. Types MUST be one of: QUESTION, SUBPART, OPTION, INSTRUCTION, HEADER, FOOTER, INTERNAL_CHOICE, DIAGRAM, CONTINUATION, SECTION_HEADER, HANDWRITING_BLOCK, FIGURE, TABLE, MARKS.';
  const userText = JSON.stringify({pageNumber:1, hint:"Analyze"});
  const content = [{type:'text', text: userText}, {type:'image_url', image_url:{url:'data:image/png;base64,'+tiny}}];
  const body:any = { model, messages:[{role:'system', content: sys}, {role:'user', content}], temperature:0.2, max_tokens:500, response_format:{type:'json_object'} };
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(), 60000);
  const start=Date.now();
  try{
    const res=await fetch(`${base.replace(/\/$/,"")}/chat/completions`, {method:'POST', headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'}, body: JSON.stringify(body), signal: ctrl.signal});
    clearTimeout(t);
    const txt=await res.text();
    console.log(`${model} tiny VedaAI status ${res.status} ${Date.now()-start}ms`);
    try{ const j=JSON.parse(txt); const c=j.choices?.[0]?.message?.content||""; console.log(`content ${c.slice(0,400).replace(/\n/g,' ')}`); const p=JSON.parse(c); console.log(`json vr=${p.visualRegions?.length}`);}catch(e:any){ console.log(`parse fail ${String(e.message).slice(0,300)} raw ${txt.slice(0,400)}`);}
  }catch(e:any){ clearTimeout(t); console.log(`${model} ERR ${e.name} ${String(e.message).slice(0,400)} ${Date.now()-start}ms`);}
}
async function main(){
  await test('moonshotai/kimi-k3');
  await new Promise(r=>setTimeout(r,2000));
  await test('meta/muse-glimmer-30b');
  await new Promise(r=>setTimeout(r,2000));
  await test('meta/llama-3.2-90b-vision-instruct');
}
main().catch(e=>{console.error(e); process.exit(1);});
