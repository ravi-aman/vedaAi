import * as dotenv from "dotenv";
dotenv.config();
import * as fs from "fs";
import * as path from "path";

const NV_KEY = process.env.NVIDIA_API_KEY!;
const NV_BASE = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";

async function fetchModels(){
  const res = await fetch(`${NV_BASE.replace(/\/$/,"")}/models`, { headers:{ Authorization:`Bearer ${NV_KEY}` }});
  const j: any = await res.json();
  const ids = (j.data || []).map((m:any)=>m.id);
  console.log(`Total NVIDIA models: ${ids.length}`);
  const targets = ids.filter((id:string)=> /kimi|glimmer|muse|vision|vl|image/i.test(id));
  console.log("Vision-ish candidates:", targets.join(", "));
  const kimi = ids.filter((id:string)=>id.includes("kimi"));
  console.log("Kimi models:", kimi.join(", "));
  const glimmer = ids.filter((id:string)=>id.includes("glimmer"));
  console.log("Glimmer models:", glimmer.join(", "));
  return ids;
}

async function renderSample(pageNum:number, kind:"qp"|"as"){
  const mupdf:any = await import("mupdf");
  const buf = fs.readFileSync(path.join(process.cwd(), kind==="qp" ? "Quetion_paper_Physics_1.pdf" : "handwrittern_answer_sheet_physics_1.pdf"));
  const doc = mupdf.Document.openDocument(buf, "application/pdf");
  const page = doc.loadPage(pageNum-1);
  const pix = page.toPixmap(mupdf.Matrix.scale(1.5,1.5), mupdf.ColorSpace.DeviceRGB, false, true);
  const png = pix.asPNG();
  const b64 = Buffer.from(png).toString("base64");
  doc.destroy();
  return { b64, w: pix.getWidth(), h: pix.getHeight(), pngLen: png.length };
}

async function testModel(model:string, imageB64:string, label:string){
  console.log(`\n=== TEST ${model} ${label} ===`);
  const system = "You are VedaAI document structure analyzer. Analyze the page image visually and structurally. Return JSON per schema: { pageNumber, visualRegions:[{type, description, confidence, coarseBox, blockIds, relatedQuestionLabel}], questionCandidates:[{rawLabel, textHint, confidence, visualEvidence, blockIds, type}], answerGroupHints:[{labelHint, description, confidence, isDiagram, blockIds}], documentStructureHints:{isMultiColumn, hasSectionHeaders, hasInstructions, difficulty}}. Types MUST be one of: QUESTION, SUBPART, OPTION, INSTRUCTION, HEADER, FOOTER, INTERNAL_CHOICE, DIAGRAM, CONTINUATION, SECTION_HEADER, HANDWRITING_BLOCK, FIGURE, TABLE, MARKS.";
  const userText = JSON.stringify({ pageNumber: 1, hint: "Analyze this page structure" });
  const content = [{ type:"text", text: userText }, { type:"image_url", image_url:{url:`data:image/png;base64,${imageB64}`}}];
  const body:any = { model, messages:[{role:"system", content: system},{role:"user", content}], temperature:0.2, max_tokens:2000, response_format:{type:"json_object"} };
  const url = `${NV_BASE.replace(/\/$/,"")}/chat/completions`;
  const start=Date.now();
  const res = await fetch(url, { method:"POST", headers:{Authorization:`Bearer ${NV_KEY}`, "Content-Type":"application/json"}, body: JSON.stringify(body)});
  const txt = await res.text();
  const latency=Date.now()-start;
  console.log(`Status ${res.status} latency ${latency}ms`);
  let parsed:any=null, jsonValid=false, reliable=false;
  try{ const outer=JSON.parse(txt); const raw=outer.choices?.[0]?.message?.content||""; let t=raw.trim(); if(t.startsWith("```")) t=t.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,""); const s=t.indexOf("{"), e=t.lastIndexOf("}"); if(s!==-1&&e!==-1) t=t.slice(s,e+1); parsed=JSON.parse(t); jsonValid=true; reliable = typeof parsed.pageNumber==="number" && Array.isArray(parsed.visualRegions); console.log(`jsonValid ${jsonValid} reliable ${reliable} vr=${parsed.visualRegions?.length} qc=${parsed.questionCandidates?.length} keys=${Object.keys(parsed).join(",")}`); console.log(`content preview ${JSON.stringify(parsed).slice(0,800).replace(/\n/g," ")}`); }catch(e:any){ console.log(`parse failed ${String(e.message).slice(0,500)} raw ${txt.slice(0,800).replace(/\n/g," ")}`); }
  // Save artifact
  const dir = path.join(process.cwd(), "artifacts", "nvidia-vision-test");
  await fs.promises.mkdir(dir, {recursive:true});
  await fs.promises.writeFile(path.join(dir, `${model.replace(/[\/:]/g,"_")}__${label.replace(/\s/g,"_")}.json`), JSON.stringify({model, label, status:res.status, latencyMs:latency, raw: txt.slice(0,8000), parsed}, null, 2), "utf-8");
  return { status: res.status, latency, jsonValid, reliable, parsed, raw: txt };
}

async function main(){
  const ids = await fetchModels();
  // Ensure Kimi K3 exists
  const kimiId = ids.find((id:string)=>id==="moonshotai/kimi-k3") || "moonshotai/kimi-k3";
  const glimmerId = ids.find((id:string)=>id.includes("muse-glimmer")) || "meta/muse-glimmer-30b";
  console.log(`\nWill test Kimi: ${kimiId}, Glimmer: ${glimmerId}`);
  // Render images
  console.log("\nRendering images...");
  const qpClean = await renderSample(1,"qp");
  const qpDense = await renderSample(7,"qp");
  const asHand = await renderSample(5,"as");
  console.log(`qpClean ${Math.round(qpClean.pngLen/1024)}KB ${qpClean.w}x${qpClean.h}, qpDense ${Math.round(qpDense.pngLen/1024)}KB, asHand ${Math.round(asHand.pngLen/1024)}KB ${asHand.w}x${asHand.h}`);
  // Test Kimi K3
  await testModel(kimiId, qpClean.b64, "clean QP");
  await new Promise(r=>setTimeout(r,1500));
  await testModel(kimiId, qpDense.b64, "dense QP");
  await new Promise(r=>setTimeout(r,1500));
  await testModel(kimiId, asHand.b64, "handwritten AS");
  await new Promise(r=>setTimeout(r,1500));
  // Test Glimmer
  await testModel(glimmerId, qpClean.b64, "clean QP");
  await new Promise(r=>setTimeout(r,1500));
  await testModel(glimmerId, asHand.b64, "handwritten AS");
  await new Promise(r=>setTimeout(r,1500));
  // Test also 90b for comparison
  await testModel("meta/llama-3.2-90b-vision-instruct", qpClean.b64, "clean QP");
}

main().catch(e=>{console.error(e); process.exit(1);});
