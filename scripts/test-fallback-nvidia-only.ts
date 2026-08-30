import * as dotenv from "dotenv";
dotenv.config();
process.env.VISION_PROVIDER_ORDER = "openrouter,nvidia";
process.env.VISION_AUTO_FALLBACK = "true";
process.env.OPENROUTER_ENABLED = "true";
process.env.NVIDIA_ENABLED = "true";
process.env.OPENCODE_ENABLED = "false";
process.env.VISION_TIMEOUT_MS = "120000";

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
  console.log(`order ${runtime.providerOrder.join(",")} chain ${chain.map(p=>p.id).join(",")} timeout ${runtime.timeoutMs}`);
  const { b64, w, h } = await renderSample();
  const pages = [{ pageId:"page-1", pageNumber:1, imageBase64: b64, mimeType:"image/png" as const, width: w, height: h }];
  for(let idx=0; idx<chain.length; idx++){
    const prov = chain[idx];
    console.log(`\n--> try ${prov.id} attempt ${idx+1}`);
    try {
      const res = await prov.analyzeDocumentStructure({ pages: pages as any, ocrTextSample:"", ocrBlocksByPage:{} } as any);
      console.log(`SUCCESS ${prov.id}: pages=${res.pages.length} vr=${res.pages[0]?.visualRegions.length} latency?`);
      console.log(`fallbackUsed=${idx>0} actual=${prov.id}`);
      return;
    } catch(e:any){
      const cls = classifyError(e);
      console.log(`FAILED ${prov.id}: ${cls.code} ${String(e.message).slice(0,300)}`);
      if(idx < chain.length-1 && runtime.autoFallback) console.log(`fallback to ${chain[idx+1].id}`);
      else break;
    }
  }
  console.log("all failed");
}
main().catch(e=>{console.error(e); process.exit(1);});
