import * as dotenv from "dotenv";
dotenv.config();
import * as fs from "fs";
import * as path from "path";
import { clearConfigCache } from "@/lib/config";
import { clearVisionProviderCache, getVisionProviderChain, getPreferredProviderConfig } from "@/lib/vision/factory";
import { getVisionProviderConfigs } from "@/lib/config";

async function renderSample() {
  const mupdf: any = await import("mupdf");
  const qpBuf = fs.readFileSync(path.join(process.cwd(), "Quetion_paper_Physics_1.pdf"));
  const page = mupdf.Document.openDocument(qpBuf, "application/pdf").loadPage(0);
  const pix = page.toPixmap(mupdf.Matrix.scale(1.5, 1.5), mupdf.ColorSpace.DeviceRGB, false, true);
  const png = pix.asPNG();
  const b64 = Buffer.from(png).toString("base64");
  return { b64, w: pix.getWidth(), h: pix.getHeight() };
}

async function testProvider(id: string) {
  const cfgs = getVisionProviderConfigs() as any;
  const cfg = cfgs[id];
  if (!cfg) { console.log(`${id}: no config`); return; }
  console.log(`\n=== SMOKE ${id} model=${cfg.model} base=${cfg.baseUrl} enabled=${cfg.enabled} keyPresent=${Boolean(cfg.apiKey)} ===`);
  if (!cfg.enabled) { console.log(`${id} disabled, skip`); return; }
  if (!cfg.apiKey) { console.log(`${id} no key, preflight should fail`); }
  clearVisionProviderCache();
  clearConfigCache();
  // Force chain to include this provider as preferred by setting order
  const origOrder = process.env.VISION_PROVIDER_ORDER;
  process.env.VISION_PROVIDER_ORDER = `${id},openrouter,opencode,nvidia`;
  clearConfigCache(); clearVisionProviderCache();
  const chain = getVisionProviderChain();
  const prov = chain.find(p => (p as any).id === id);
  if (!prov) { console.log(`${id} not in chain (maybe disabled)`); process.env.VISION_PROVIDER_ORDER = origOrder!; clearConfigCache(); clearVisionProviderCache(); return; }
  const start = Date.now();
  const pf = await prov.preflight();
  console.log(`preflight ${id}: ok=${pf.ok} available=${pf.available} latency=${pf.latencyMs} reason=${pf.reason || "ok"} model=${pf.model}`);
  if (!pf.ok) {
    console.log(`${id} preflight failed, will test analyzePage anyway to see error classification`);
  }
  try {
    const { b64, w, h } = await renderSample();
    console.log(`sending analyzePage with ${Math.round(b64.length*0.75/1024)}KB image to ${id}/${cfg.model}`);
    const res = await prov.analyzePage({ pageId: "page-1", pageNumber: 1, imageBase64: b64, mimeType: "image/png", width: w, height: h } as any);
    console.log(`analyzePage SUCCESS ${id}: visualRegions=${res.visualRegions.length} questionCandidates=${res.questionCandidates.length} answerHints=${res.answerGroupHints.length} latency=${Date.now()-start}ms`);
    console.log(`  provider recorded: ${id}, model: ${cfg.model}`);
  } catch (e: any) {
    console.log(`analyzePage FAILED ${id}: status=${e.status} code=${e.code} msg=${String(e.message).slice(0,400)} latency=${Date.now()-start}ms`);
  }
  process.env.VISION_PROVIDER_ORDER = origOrder!;
  clearConfigCache(); clearVisionProviderCache();
}

async function main(){
  console.log("=== VISION SMOKE MULTI-PROVIDER (real images) ===");
  // Test each enabled provider
  await testProvider("openrouter");
  await new Promise(r=>setTimeout(r,1000));
  await testProvider("opencode");
  await new Promise(r=>setTimeout(r,1000));
  await testProvider("nvidia");
  console.log("\n=== SMOKE DONE ===");
}
main().catch(e=>{ console.error(e); process.exit(1); });
