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

async function test(model:string, b64:string, withJson:boolean){
  const sys = withJson ? 'You are VedaAI analyzer. Return JSON {\"pages\":[{\"pageNumber\":1}]} only' : 'Describe this image briefly';
  const content = [{type:'text', text:'Analyze image'}, {type:'image_url', image_url:{url:'data:image/png;base64,'+b64}}];
  const body:any = { model, messages:[{role:'system', content: sys}, {role:'user', content}], temperature:0.2, max_tokens: withJson? 500: 100 };
  if(withJson) body.response_format={type:'json_object'};
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(), 90000);
  const start=Date.now();
  try{
    const res=await fetch(`${base.replace(/\/$/,"")}/chat/completions`, {method:'POST', headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'}, body: JSON.stringify(body), signal: ctrl.signal});
    clearTimeout(t);
    const txt=await res.text();
    console.log(`${model} withJson=${withJson} status ${res.status} ${Date.now()-start}ms ${txt.slice(0,600).replace(/\n/g,' ')}`);
    return res.status===200;
  }catch(e:any){ clearTimeout(t); console.log(`${model} ERR ${e.name} ${String(e.message).slice(0,300)} ${Date.now()-start}ms`); return false; }
}

async function main(){
  console.log("Rendering...");
  const qp = await render(1,"qp");
  const as = await render(5,"as");
  console.log(`qp ${qp.kb}KB ${qp.w}x${qp.h} as ${as.kb}KB`);
  for(const model of ["meta/muse-glimmer-30b","moonshotai/kimi-k3","moonshotai/kimi-k2.6","meta/llama-3.2-90b-vision-instruct"]){
    console.log(`\n=== ${model} ===`);
    await test(model, qp.b64, false);
    await new Promise(r=>setTimeout(r,2000));
    await test(model, qp.b64, true);
    await new Promise(r=>setTimeout(r,2000));
    await test(model, as.b64, false);
    await new Promise(r=>setTimeout(r,3000));
  }
}
main().catch(e=>{console.error(e); process.exit(1);});
