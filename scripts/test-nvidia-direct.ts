import * as dotenv from "dotenv";
dotenv.config();
process.env.NVIDIA_ENABLED = "true";
process.env.VISION_PROVIDER_ORDER = "nvidia,openrouter,opencode";
import * as fs from "fs";
import * as path from "path";
import { clearConfigCache } from "@/lib/config";
import { clearVisionProviderCache, getVisionProviderChain } from "@/lib/vision/factory";

async function main(){
  clearConfigCache(); clearVisionProviderCache();
  const chain = getVisionProviderChain();
  console.log("chain", chain.map(p=>p.id));
  const nvidia = chain.find(p=>p.id==="nvidia");
  if (!nvidia) { console.log("nvidia not in chain"); return; }
  console.log(`Testing nvidia preflight ${nvidia.id}`);
  const pf = await nvidia.preflight();
  console.log("preflight", pf);
  // Render sample
  const mupdf: any = await import("mupdf");
  const qpBuf = fs.readFileSync(path.join(process.cwd(), "Quetion_paper_Physics_1.pdf"));
  const doc = mupdf.Document.openDocument(qpBuf, "application/pdf");
  const page = doc.loadPage(0);
  const pix = page.toPixmap(mupdf.Matrix.scale(1.5,1.5), mupdf.ColorSpace.DeviceRGB, false, true);
  const png = pix.asPNG();
  const b64 = Buffer.from(png).toString("base64");
  console.log(`image ${pix.getWidth()}x${pix.getHeight()} ${Math.round(png.length/1024)}KB`);
  console.log("calling analyzePage...");
  const start=Date.now();
  try {
    const res = await nvidia.analyzePage({ pageId: "page-1", pageNumber: 1, imageBase64: b64, mimeType: "image/png", width: pix.getWidth(), height: pix.getHeight() } as any);
    console.log(`SUCCESS nvidia analyzePage ${Date.now()-start}ms vr=${res.visualRegions.length} qc=${res.questionCandidates.length}`);
  } catch(e:any){ console.log(`FAILED nvidia ${e.status} ${e.code} ${String(e.message).slice(0,500)}`); }
}
main().catch(e=>{console.error(e); process.exit(1);});
