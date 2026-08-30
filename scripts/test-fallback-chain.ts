import * as dotenv from "dotenv";
dotenv.config();
// Force fallback chain: openrouter (credit fail) -> nvidia (should succeed) -> opencode
process.env.VISION_PROVIDER_ORDER = "openrouter,nvidia,opencode";
process.env.VISION_AUTO_FALLBACK = "true";
process.env.OPENROUTER_ENABLED = "true";
process.env.NVIDIA_ENABLED = "true";
process.env.OPENCODE_ENABLED = "true";
process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "test";
process.env.NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "test";
process.env.OPENCODE_API_KEY = process.env.OPENCODE_API_KEY || "test";

import * as fs from "fs";
import * as path from "path";
import { clearConfigCache, getVisionRuntimeConfig } from "@/lib/config";
import { clearVisionProviderCache, getVisionProviderChain, getPreferredProviderConfig } from "@/lib/vision/factory";
import { classifyError } from "@/lib/vision/providers/base";

async function renderSample(){
  const mupdf:any = await import("mupdf");
  const qpBuf = fs.readFileSync(path.join(process.cwd(), "Quetion_paper_Physics_1.pdf"));
  const doc = mupdf.Document.openDocument(qpBuf, "application/pdf");
  const page = doc.loadPage(0);
  const pix = page.toPixmap(mupdf.Matrix.scale(1.5,1.5), mupdf.ColorSpace.DeviceRGB, false, true);
  const png = pix.asPNG();
  const b64 = Buffer.from(png).toString("base64");
  return { b64, w: pix.getWidth(), h: pix.getHeight() };
}

async function main(){
  clearConfigCache(); clearVisionProviderCache();
  const runtime = getVisionRuntimeConfig();
  const chain = getVisionProviderChain();
  const pref = getPreferredProviderConfig();
  console.log(`order ${runtime.providerOrder.join(",")} pref ${pref?.id} chain ${chain.map(p=>p.id).join(",")} autoFallback ${runtime.autoFallback}`);
  const { b64, w, h } = await renderSample();
  const pages = [{ pageId:"page-1", pageNumber:1, imageBase64: b64, mimeType:"image/png" as const, width: w, height: h }];
  let fallbackUsed=false, fallbackReason: string|undefined, actualProvider: string|undefined;
  let preferredForLog = pref?.id || runtime.providerOrder[0];
  console.log(`\nTrying batch with ${pages.length} image(s), preferred ${preferredForLog}`);
  for(let idx=0; idx<chain.length; idx++){
    const prov = chain[idx];
    const isFallback = idx>0;
    console.log(`\n--> try provider ${prov.id} (attempt ${idx+1}/${chain.length}) fallback=${isFallback}`);
    try {
      const res = await prov.analyzeDocumentStructure({ pages: pages as any, ocrTextSample:"", ocrBlocksByPage:{} } as any);
      console.log(`SUCCESS ${prov.id}: pages=${res.pages.length} vr=${res.pages[0]?.visualRegions.length} qc=${res.pages[0]?.questionCandidates.length}`);
      actualProvider = prov.id;
      if(isFallback){ fallbackUsed=true; fallbackReason=`fallback from ${preferredForLog} to ${prov.id}`; }
      break;
    } catch(e:any){
      const cls = classifyError(e);
      console.log(`FAILED ${prov.id}: code=${cls.code} status=${cls.status} type=${cls.type} msg=${String(e.message).slice(0,300)}`);
      if(isFallback) { /* already fallback */ }
      // Decide if fallback should continue
      const shouldFallback = runtime.autoFallback && idx < chain.length-1;
      if(shouldFallback){
        fallbackReason = `${cls.code}`;
        console.log(`  -> will fallback to next provider ${chain[idx+1]?.id}`);
        await new Promise(r=>setTimeout(r,500));
        continue;
      } else {
        console.log(`  -> no fallback (autoFallback=${runtime.autoFallback} or last provider)`);
        break;
      }
    }
  }
  console.log(`\n=== RESULT Fallback Test ===`);
  console.log(`preferredProvider=${preferredForLog}`);
  console.log(`actualProvider=${actualProvider || "none"}`);
  console.log(`fallbackUsed=${fallbackUsed}`);
  console.log(`fallbackReason=${fallbackReason || "none"}`);
  console.log(`fallback chain worked: ${fallbackUsed && actualProvider==="nvidia" && preferredForLog==="openrouter" ? "PASS (openrouter credit -> nvidia success)" : "unknown"}`);
  if(!actualProvider) console.log("No provider succeeded — check billing/rate limits");
}
main().catch(e=>{console.error(e); process.exit(1);});
