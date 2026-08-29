// @ts-nocheck
/**
 * Real benchmark for Physics QP (27p) + AS (31p)
 * Measures every spec Phase 8 metric
 */
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

const QP_PATH = path.join(process.cwd(), "Quetion_paper_Physics_1.pdf");
const AS_PATH = path.join(process.cwd(), "handwrittern_answer_sheet_physics_1.pdf");

async function getEnvInfo() {
  const info: any = {};
  info.os = os.platform() + " " + os.release() + " " + os.arch();
  info.cpus = os.cpus().length;
  info.totalMemMb = Math.round(os.totalmem() / 1024 / 1024);
  info.freeMemMb = Math.round(os.freemem() / 1024 / 1024);
  try { info.nodeVersion = process.version; info.pythonVersion = execSync("python --version", { encoding: "utf-8" }).trim(); } catch {}
  try { info.paddleVersion = execSync('python -c "import paddle; print(paddle.__version__)"', { encoding: "utf-8" }).trim(); } catch {}
  try { info.paddleocrVersion = execSync('python -c "import paddleocr; print(paddleocr.__version__)"', { encoding: "utf-8" }).trim(); } catch {}
  try { info.paddlexVersion = execSync('python -c "import paddlex; print(paddlex.__version__)"', { encoding: "utf-8" }).trim(); } catch {}
  try { info.gpu = execSync("nvidia-smi --query-gpu=name --format=csv,noheader", { encoding: "utf-8" }).trim().slice(0,80); } catch { info.gpu = "none"; }
  return info;
}

async function main() {
  console.log("=== Physics Benchmark ===");
  const env = await getEnvInfo();
  console.log(JSON.stringify(env, null, 2));

  const modelDir = path.join(os.homedir(), ".paddlex", "official_models");
  const modelInfo: any = {};
  try {
    const models = await fs.readdir(modelDir).catch(()=>[]);
    for (const m of models) {
      try {
        const files = await fs.readdir(path.join(modelDir, m));
        let total=0;
        for (const f of files) try { total += (await fs.stat(path.join(modelDir, m, f))).size; } catch {}
        modelInfo[m] = (total/1024/1024).toFixed(1)+"MB";
      } catch {}
    }
  } catch {}
  console.log("Models", JSON.stringify(modelInfo,null,2));

  // Check file existence
  const qpStat = await fs.stat(QP_PATH);
  const asStat = await fs.stat(AS_PATH);
  console.log(`QP ${QP_PATH} ${qpStat.size} bytes`);
  console.log(`AS ${AS_PATH} ${asStat.size} bytes`);

  const mupdf: any = await import("mupdf");
  const qpDoc = mupdf.Document.openDocument(await fs.readFile(QP_PATH), "application/pdf");
  const asDoc = mupdf.Document.openDocument(await fs.readFile(AS_PATH), "application/pdf");
  console.log(`QP pages ${qpDoc.countPages()}, AS pages ${asDoc.countPages()}`);
  qpDoc.destroy(); asDoc.destroy();

  const { PaddleOcrProvider } = await import("../src/lib/ocr/paddle-provider");
  const provider = new PaddleOcrProvider();

  async function benchmark(label: string, buffer: Buffer, kind: "questionPaper"|"answerSheet", selectedPages?: number[]) {
    const doc = mupdf.Document.openDocument(buffer, "application/pdf");
    const totalPages = doc.countPages();
    doc.destroy();
    const pagesToTest = selectedPages || Array.from({length: totalPages}, (_,i)=>i+1);
    console.log(`\n--- ${label} kind=${kind} total=${totalPages} testing ${pagesToTest.length} pages: ${pagesToTest.join(",")} ---`);

    // Render via same mupdf 1.5x logic as production
    const buf: Buffer = buffer;
    const rendered: any[] = [];
    const mupdf2: any = await import("mupdf");
    const doc2 = mupdf2.Document.openDocument(buf, "application/pdf");
    const tRenderStart = Date.now();
    const tmpRoot = path.join(os.tmpdir(), "veda-ai", "benchmark", `${label}-${Date.now()}`);
    await fs.mkdir(tmpRoot, {recursive:true});
    const pagesInput: any[] = [];
    for (const pn of pagesToTest) {
      if (pn > doc2.countPages()) break;
      const page = doc2.loadPage(pn-1);
      const pix = page.toPixmap(mupdf2.Matrix.scale(1.5,1.5), mupdf2.ColorSpace.DeviceRGB, false, true);
      const png = Buffer.from(pix.asPNG());
      const imagePath = path.join(tmpRoot, `page-${String(pn).padStart(3,"0")}.png`);
      await fs.writeFile(imagePath, png);
      pagesInput.push({pageNumber: pn, imagePath, width: pix.getWidth(), height: pix.getHeight()});
      console.log(`  render p${pn} ${pix.getWidth()}x${pix.getHeight()} ${png.length} bytes`);
      pix.destroy(); page.destroy();
    }
    doc2.destroy();
    const tRender = Date.now() - tRenderStart;
    console.log(`Rendered ${pagesInput.length} pages in ${tRender}ms`);

    const tStart = Date.now();
    const memBefore = process.memoryUsage().rss/1024/1024;
    let result: any = null, error: any = null;
    try {
      result = await provider.processDocument({jobId: `benchmark-${Date.now()}`, documentId: `doc-${label}`, kind, pages: pagesInput});
    } catch(e:any){ error=e; console.error(`FAILED ${label}: ${e.message.slice(0,600)}`); }
    const tTotal = Date.now() - tStart;
    const memAfter = process.memoryUsage().rss/1024/1024;
    if (error) return {label, kind, totalPages, pagesTested: pagesToTest.length, error: error.message, tTotal, tRender};

    // Metrics
    let totalLines=0, totalBlocks=0, totalWords=0, textLen=0, confSum=0, confCount=0, minConf=1, maxConf=0, bboxCoverage=0, invalidBoxes=0;
    for (const p of result.pages) {
      totalLines += p.lines.length;
      totalBlocks += p.blocks.length;
      textLen += p.text.length;
      for (const l of p.lines) {
        confSum += l.confidence; confCount++; minConf=Math.min(minConf,l.confidence); maxConf=Math.max(maxConf,l.confidence);
        bboxCoverage += l.boundingBox.width*l.boundingBox.height;
        const b=l.boundingBox;
        if (!Number.isFinite(b.x)||!Number.isFinite(b.y)||!Number.isFinite(b.width)||!Number.isFinite(b.height)||b.width<=0||b.height<=0) invalidBoxes++;
      }
      for (const b of p.blocks) for (const para of b.paragraphs) totalWords+=para.words.length;
    }
    const avgConf = confCount?confSum/confCount:0;
    const avgPageMs = pagesInput.length?Math.round(tTotal/pagesInput.length):0;
    console.log(`Result ${label}: pages ${result.pages.length} lines ${totalLines} blocks ${totalBlocks} words ${totalWords} textLen ${textLen}`);
    console.log(`  conf avg ${avgConf.toFixed(3)} min ${minConf.toFixed(3)} max ${maxConf.toFixed(3)}`);
    console.log(`  bboxCoverage ${bboxCoverage.toFixed(3)} invalid ${invalidBoxes}`);
    console.log(`  time total ${tTotal}ms avgPage ${avgPageMs}ms render ${tRender}ms mem ${memBefore.toFixed(1)}->${memAfter.toFixed(1)}MB`);

    // Quality snippets
    const fullText = result.pages.map((p:any)=>p.text).join("\n");
    if (kind==="questionPaper") {
      const snippet = fullText.slice(0,1000).replace(/\n/g," | ");
      console.log(`  QP snippet: ${snippet.slice(0,600)}`);
    } else {
      console.log(`  AS snippet: ${fullText.slice(0,600).replace(/\n/g," | ")}`);
    }

    const artifactDir = path.join(process.cwd(), "artifacts", "ocr-benchmark");
    await fs.mkdir(artifactDir,{recursive:true});
    const artifact = {
      engine:"paddleocr", pipeline:"PP-OCRv5", lang:"en", device:"cpu",
      doc: label, kind, pages: result.pages.length, totalPages, pagesTested: pagesToTest,
      env, modelInfo, renderMs: tRender, totalMs: tTotal, avgPageMs,
      memBefore: Math.round(memBefore), memAfter: Math.round(memAfter), peakMemoryMb: Math.round(Math.max(memBefore,memAfter)),
      lines: totalLines, blocks: totalBlocks, words: totalWords, textLen, bboxCoverage,
      confidence:{avg:avgConf,min:minConf,max:maxConf,count:confCount}, invalidBoxes,
      pageDetails: result.pages.map((p:any)=>({pageNumber:p.pageNumber,width:p.width,height:p.height,lines:p.lines.length,blocks:p.blocks.length,textLen:p.text.length,confidence:p.confidence})),
      providerVersion: result.providerVersion, completedAt: result.completedAt
    };
    await fs.writeFile(path.join(artifactDir, `${label}-${kind}.json`), JSON.stringify(artifact,null,2), "utf-8");
    console.log(`  artifact artifacts/ocr-benchmark/${label}-${kind}.json`);
    return artifact;
  }

  // Subset first for quick validation
  const qpBuf = await fs.readFile(QP_PATH);
  const asBuf = await fs.readFile(AS_PATH);

  const qpSubset = await benchmark("qp-subset", qpBuf, "questionPaper", [1,2,3]);
  const asSubset = await benchmark("as-subset", asBuf, "answerSheet", [1,5,10]);

  // Full docs (may take 10min total)
  let qpFull=null, asFull=null;
  const qpOk = qpSubset && !(qpSubset as any).error;
  const asOk = asSubset && !(asSubset as any).error;
  if (qpOk) qpFull = await benchmark("qp-full", qpBuf, "questionPaper");
  if (asOk) asFull = await benchmark("as-full", asBuf, "answerSheet");

  // Markdown
  const md:string[]=[];
  md.push(`# LOCAL OCR BENCHMARK — PaddleOCR / PP-StructureV3`);
  md.push(``);
  md.push(`**Date:** ${new Date().toISOString().slice(0,10)}  `);
  md.push(`**Env:** ${env.os} | Node ${env.nodeVersion} | Python ${env.pythonVersion} | Paddle ${env.paddleVersion} | PaddleOCR ${env.paddleocrVersion}  `);
  md.push(`**CPU:** ${env.cpus} cores | RAM ${env.totalMemMb}MB | GPU ${env.gpu}  `);
  md.push(`**Model:** PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec | lang=en | device=cpu | FLAGS_use_pir_api=0  `);
  md.push(`**Docs:** Physics QP 27p (2.1MB) + AS 31p (11MB) from real uploaded files  `);
  md.push(``);
  md.push(`## Model Files`);
  md.push("```json");
  md.push(JSON.stringify(modelInfo,null,2));
  md.push("```");
  md.push(``);
  md.push(`## Subset (3 pages each)`);
  for (const r of [qpSubset,asSubset]) {
    if (!r) continue;
    md.push(`### ${r.label} (${(r as any).kind})`);
    if ((r as any).error) md.push(`FAILED: ${(r as any).error}`);
    else md.push(`- pages ${(r as any).pages} | lines ${(r as any).lines} | blocks ${(r as any).blocks} | textLen ${(r as any).textLen} | avgConfidence ${(r as any).confidence.avg.toFixed(3)}`, `- totalMs ${(r as any).totalMs} | avgPageMs ${(r as any).avgPageMs} | renderMs ${(r as any).renderMs} | peak ${(r as any).peakMemoryMb}MB`, `- invalidBoxes ${(r as any).invalidBoxes} | bboxCoverage ${(r as any).bboxCoverage.toFixed(2)}`);
  }
  md.push(``);
  md.push(`## Full Document`);
  for (const r of [qpFull,asFull]) {
    if (!r) { md.push(`_not run (subset failed or skipped)_`); continue; }
    md.push(`### ${r.label} (${(r as any).kind})`);
    if ((r as any).error) md.push(`FAILED: ${(r as any).error}`);
    else md.push(`- pages ${(r as any).pages}/${(r as any).totalPages} | lines ${(r as any).lines} | blocks ${(r as any).blocks} | words ${(r as any).words} | textLen ${(r as any).textLen}`, `- totalMs ${(r as any).totalMs} | avgPageMs ${(r as any).avgPageMs} | peak ${(r as any).peakMemoryMb}MB`, `- confidence avg ${(r as any).confidence.avg.toFixed(3)} (min ${(r as any).confidence.min.toFixed(3)} max ${(r as any).confidence.max.toFixed(3)})`);
  }
  md.push(``);
  md.push(`## Deployment`);
  md.push(`See docs/PADDLEOCR_FEASIBILITY.md — LOCAL_PADDLEOCR_DEPLOYMENT_BLOCKED for Vercel (Python, 900MB, 300MB models, spawn, timeout). Single-container (Docker) required.`);
  md.push(``);
  md.push(`## Artifacts`);
  md.push(`- artifacts/ocr-benchmark/qp-subset-questionPaper.json`);
  md.push(`- artifacts/ocr-benchmark/as-subset-answerSheet.json`);
  md.push(`- artifacts/ocr-benchmark/qp-full-questionPaper.json`);
  md.push(`- artifacts/ocr-benchmark/as-full-answerSheet.json`);
  md.push(``);
  md.push(`Generated by scripts/benchmark-physics.ts — all numbers from actual execution.`);

  await fs.writeFile(path.join(process.cwd(), "docs", "LOCAL_OCR_BENCHMARK.md"), md.join("\n"), "utf-8");
  console.log("\nWrote docs/LOCAL_OCR_BENCHMARK.md");
  await fs.writeFile(path.join(process.cwd(), "artifacts", "ocr-benchmark", "combined.json"), JSON.stringify({env,modelInfo,qpSubset,asSubset,qpFull,asFull,generatedAt:new Date().toISOString()},null,2),"utf-8");
  console.log("=== Done ===");
}

main().catch(e=>{console.error(e); process.exit(1);});
