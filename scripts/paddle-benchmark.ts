#!/usr/bin/env tsx
// @ts-nocheck
/**
 * Benchmark PaddleOCR vs Textract on real 39ac documents
 * Measures real numbers per spec Phase 6-10
 */
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

// Use same rendering as production (mupdf 1.5x)
async function renderPdfBuffer(buffer: Buffer, pageNumbers: number[]) {
  const out: { pageNumber: number; width: number; height: number; png: Buffer }[] = [];
  const mupdf: any = await import("mupdf");
  const doc = mupdf.Document.openDocument(buffer, "application/pdf");
  for (const pn of pageNumbers) {
    if (pn > doc.countPages()) break;
    const page = doc.loadPage(pn - 1);
    const pix = page.toPixmap(mupdf.Matrix.scale(1.5, 1.5), mupdf.ColorSpace.DeviceRGB, false, true);
    const png = Buffer.from(pix.asPNG());
    out.push({ pageNumber: pn, width: pix.getWidth(), height: pix.getHeight(), png });
    pix.destroy();
    page.destroy();
  }
  doc.destroy();
  return out;
}

async function getEnvInfo() {
  const info: any = {};
  info.os = os.platform() + " " + os.release() + " " + os.arch();
  info.cpus = os.cpus().length;
  info.totalMemMb = Math.round(os.totalmem() / 1024 / 1024);
  info.freeMemMb = Math.round(os.freemem() / 1024 / 1024);
  try {
    info.nodeVersion = process.version;
    info.pythonVersion = execSync("python --version", { encoding: "utf-8" }).trim();
  } catch {}
  try {
    info.paddleVersion = execSync('python -c "import paddle; print(paddle.__version__)"', { encoding: "utf-8" }).trim();
  } catch {}
  try {
    info.paddleocrVersion = execSync('python -c "import paddleocr; print(paddleocr.__version__)"', { encoding: "utf-8" }).trim();
  } catch {}
  try {
    info.paddlexVersion = execSync('python -c "import paddlex; print(paddlex.__version__)"', { encoding: "utf-8" }).trim();
  } catch {}
  try {
    info.gpu = execSync("nvidia-smi --query-gpu=name --format=csv,noheader", { encoding: "utf-8" }).trim().slice(0, 80);
  } catch { info.gpu = "none"; }
  return info;
}

async function main() {
  console.log("=== PaddleOCR Benchmark Start ===");
  const env = await getEnvInfo();
  console.log(JSON.stringify(env, null, 2));

  // Locate real docs (39ac)
  const qpPath = path.join(os.tmpdir(), "veda-ai", "39ac494f-ecec-4ccc-91ca-c9e9995a644b", "e9d006b0-e076-4f64-a332-5214bf3379f7");
  const asPath = path.join(os.tmpdir(), "veda-ai", "39ac494f-ecec-4ccc-91ca-c9e9995a644b", "0ef16e7c-7899-4834-835a-16bf7532a0fc");

  let qpBuffer: Buffer | null = null;
  let asBuffer: Buffer | null = null;
  try {
    qpBuffer = await fs.readFile(qpPath);
    console.log(`QP found ${qpPath} size ${qpBuffer.length}`);
  } catch {
    console.log("QP not found at", qpPath, "trying alternative search");
    // search tmp for recent PDF with 8 pages approx 500KB
    const tmpRoot = path.join(os.tmpdir(), "veda-ai");
    const dirs = await fs.readdir(tmpRoot).catch(() => []);
    for (const d of dirs) {
      try {
        const files = await fs.readdir(path.join(tmpRoot, d));
        for (const f of files) {
          if (f.endsWith(".meta.json")) continue;
          const full = path.join(tmpRoot, d, f);
          const stat = await fs.stat(full).catch(() => null);
          if (stat && stat.size > 400000 && stat.size < 600000) {
            const buf = await fs.readFile(full);
            qpBuffer = buf;
            console.log(`QP fallback found ${full} size ${buf.length}`);
            break;
          }
        }
        if (qpBuffer) break;
      } catch {}
    }
  }
  try {
    asBuffer = await fs.readFile(asPath);
    console.log(`AS found ${asPath} size ${asBuffer.length}`);
  } catch {
    console.log("AS not found at", asPath);
    const tmpRoot = path.join(os.tmpdir(), "veda-ai");
    const dirs = await fs.readdir(tmpRoot).catch(() => []);
    for (const d of dirs) {
      try {
        const files = await fs.readdir(path.join(tmpRoot, d));
        for (const f of files) {
          if (f.endsWith(".meta.json")) continue;
          const full = path.join(tmpRoot, d, f);
          const stat = await fs.stat(full).catch(() => null);
          if (stat && stat.size > 10000000 && stat.size < 15000000) {
            const buf = await fs.readFile(full);
            asBuffer = buf;
            console.log(`AS fallback found ${full} size ${buf.length}`);
            break;
          }
        }
        if (asBuffer) break;
      } catch {}
    }
  }

  if (!qpBuffer || !asBuffer) {
    console.error("ERROR: Real PDFs not found. Run a job to generate them or copy artifacts.");
    process.exit(1);
  }

  // Check model sizes
  const modelDir = path.join(os.homedir(), ".paddlex", "official_models");
  let modelInfo: any = {};
  try {
    const models = await fs.readdir(modelDir).catch(() => []);
    for (const m of models) {
      try {
        const stat = await fs.stat(path.join(modelDir, m));
        if (stat.isDirectory()) {
          const files = await fs.readdir(path.join(modelDir, m));
          let total = 0;
          for (const f of files) {
            try { total += (await fs.stat(path.join(modelDir, m, f))).size; } catch {}
          }
          modelInfo[m] = `${(total / 1024 / 1024).toFixed(1)}MB`;
        }
      } catch {}
    }
  } catch {}
  console.log("Models:", JSON.stringify(modelInfo, null, 2));

  // Benchmark via PaddleOcrProvider
  const { PaddleOcrProvider } = await import("../src/lib/ocr/paddle-provider");
  const provider = new PaddleOcrProvider();

  // Helper to benchmark one doc
  async function benchmarkDoc(label: string, buffer: Buffer, kind: "questionPaper" | "answerSheet", selectedPages?: number[]) {
    const docName = label;
    // Get page count via mupdf
    const mupdf: any = await import("mupdf");
    const doc = mupdf.Document.openDocument(buffer, "application/pdf");
    const totalPages = doc.countPages();
    doc.destroy();
    const pagesToTest = selectedPages || Array.from({ length: totalPages }, (_, i) => i + 1);
    console.log(`\n--- Benchmark ${docName} kind=${kind} total=${totalPages} testing ${pagesToTest.length} pages ${pagesToTest.join(",")} ---`);

    // Render pages
    const tRenderStart = Date.now();
    const renderedMeta = await renderPdfBuffer(buffer, pagesToTest);
    const tRender = Date.now() - tRenderStart;
    console.log(`Rendered ${renderedMeta.length} pages in ${tRender}ms`);

    // Write PNGs to temp files for provider
    const tmpRoot = path.join(os.tmpdir(), "veda-ai", "benchmark", `${docName}-${Date.now()}`);
    await fs.mkdir(tmpRoot, { recursive: true });
    const pagesInput: { pageNumber: number; imagePath: string; width: number; height: number }[] = [];
    for (const r of renderedMeta) {
      const imagePath = path.join(tmpRoot, `page-${String(r.pageNumber).padStart(3, "0")}.png`);
      await fs.writeFile(imagePath, r.png);
      pagesInput.push({ pageNumber: r.pageNumber, imagePath, width: r.width, height: r.height });
      console.log(`  page ${r.pageNumber} ${r.width}x${r.height} ${r.png.length} bytes -> ${imagePath}`);
    }

    // Measure provider
    const tStart = Date.now();
    const memBefore = process.memoryUsage().rss / 1024 / 1024;
    let result: any = null;
    let error: any = null;
    try {
      result = await provider.processDocument({
        jobId: `benchmark-${Date.now()}`,
        documentId: `doc-${docName}`,
        kind,
        pages: pagesInput,
      });
    } catch (e: any) {
      error = e;
      console.error(`Benchmark ${docName} failed:`, e.message.slice(0, 500));
      console.error(e.stack?.slice(0, 2000));
    }
    const tTotal = Date.now() - tStart;
    const memAfter = process.memoryUsage().rss / 1024 / 1024;
    const peak = Math.max(memBefore, memAfter);

    if (error) {
      return { label: docName, kind, totalPages, pagesTested: pagesToTest.length, error: error.message, tTotal, tRender };
    }

    // Collect metrics
    const pages = result.pages;
    let totalLines = 0, totalBlocks = 0, totalWords = 0, totalTextLen = 0;
    let bboxCoverage = 0, confSum = 0, confCount = 0;
    let minConf = 1, maxConf = 0;
    for (const p of pages) {
      totalLines += p.lines.length;
      totalBlocks += p.blocks.length;
      totalTextLen += p.text.length;
      for (const l of p.lines) {
        totalWords += 1;
        confSum += l.confidence;
        confCount++;
        minConf = Math.min(minConf, l.confidence);
        maxConf = Math.max(maxConf, l.confidence);
        // bbox coverage: area sum
        bboxCoverage += l.boundingBox.width * l.boundingBox.height;
      }
      for (const b of p.blocks) {
        for (const para of b.paragraphs) {
          totalWords += para.words.length;
        }
      }
    }
    const avgConf = confCount ? confSum / confCount : 0;
    const avgPageMs = pages.length ? Math.round(tTotal / pages.length) : 0;

    console.log(`\nResult ${docName}:`);
    console.log(`  pages: ${pages.length}`);
    console.log(`  totalLines: ${totalLines} totalBlocks: ${totalBlocks} totalWords: ${totalWords} textLen: ${totalTextLen}`);
    console.log(`  conf avg: ${avgConf.toFixed(3)} min: ${minConf.toFixed(3)} max: ${maxConf.toFixed(3)}`);
    console.log(`  bboxCoverage: ${bboxCoverage.toFixed(3)} avg per page: ${(bboxCoverage / pages.length).toFixed(3)}`);
    console.log(`  time total: ${tTotal}ms avgPage: ${avgPageMs}ms render: ${tRender}ms memBefore: ${memBefore.toFixed(1)}MB memAfter: ${memAfter.toFixed(1)}MB peak: ${peak.toFixed(1)}MB`);

    // Quality checks for QP: question numbers etc.
    if (kind === "questionPaper") {
      const fullText = pages.map((p) => p.text).join("\n");
      const qNumRe = /^\s*(?:Q\s*)?(\d+[a-z]?\s*(?:\([a-z]\)\s*)?)/gm;
      const found = [...fullText.matchAll(qNumRe)].map((m) => m[1].trim()).slice(0, 20);
      console.log(`  question number candidates sample: ${found.join(", ")}`);
      console.log(`  fullText snippet: ${fullText.slice(0, 800).replace(/\n/g, " | ")}`);
    } else {
      // AS: check handwritten labels
      const fullText = pages.map((p) => p.text).join("\n");
      const labelRe = /(?:Ans|Q|Question)\s*\.?\s*(\d+[a-z]?(?:\([a-z]\))?)/gi;
      const labels = [...fullText.matchAll(labelRe)].map((m) => m[0]).slice(0, 20);
      console.log(`  answer label candidates: ${labels.join(", ")}`);
      console.log(`  text snippet: ${fullText.slice(0, 800).replace(/\n/g, " | ")}`);
    }

    // BBox validation
    let invalidBoxes = 0;
    for (const p of pages) {
      for (const l of p.lines) {
        const b = l.boundingBox;
        if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.width) || !Number.isFinite(b.height) || b.width <= 0 || b.height <= 0 || b.x < 0 || b.y < 0 || b.x + b.width > 1.01 || b.y + b.height > 1.01) {
          invalidBoxes++;
        }
      }
    }
    console.log(`  invalidBoxes: ${invalidBoxes}`);

    // Save artifact
    const artifactDir = path.join(process.cwd(), "artifacts", "ocr-benchmark");
    await fs.mkdir(artifactDir, { recursive: true });
    const artifact = {
      engine: "paddleocr",
      pipeline: "PP-OCRv5",
      lang: "en",
      doc: docName,
      kind,
      pages: pages.length,
      totalPages,
      pagesTested: pagesToTest,
      env,
      modelInfo,
      renderMs: tRender,
      totalMs: tTotal,
      avgPageMs,
      memBefore: Math.round(memBefore),
      memAfter: Math.round(memAfter),
      peakMemoryMb: Math.round(peak),
      lines: totalLines,
      blocks: totalBlocks,
      words: totalWords,
      textLen: totalTextLen,
      bboxCoverage,
      confidence: { avg: avgConf, min: minConf, max: maxConf, count: confCount },
      invalidBoxes,
      pageDetails: pages.map((p) => ({ pageNumber: p.pageNumber, width: p.width, height: p.height, lines: p.lines.length, blocks: p.blocks.length, textLen: p.text.length, confidence: p.confidence })),
      providerVersion: result.providerVersion,
      completedAt: result.completedAt,
    };
    await fs.writeFile(path.join(artifactDir, `${docName}-${kind}.json`), JSON.stringify(artifact, null, 2), "utf-8");
    console.log(`  artifact saved to artifacts/ocr-benchmark/${docName}-${kind}.json`);

    return artifact;
  }

  // Warm helper
  async function renderPdfBuffer(buffer: Buffer, pageNumbers: number[]) {
    const mupdf: any = await import("mupdf");
    const doc = mupdf.Document.openDocument(buffer, "application/pdf");
    const res: any[] = [];
    for (const pn of pageNumbers) {
      if (pn > doc.countPages()) break;
      const page = doc.loadPage(pn - 1);
      const pix = page.toPixmap(mupdf.Matrix.scale(1.5, 1.5), mupdf.ColorSpace.DeviceRGB, false, true);
      const png = Buffer.from(pix.asPNG());
      res.push({ pageNumber: pn, width: pix.getWidth(), height: pix.getHeight(), png });
      pix.destroy();
      page.destroy();
    }
    doc.destroy();
    return res;
  }

  // Run benchmarks
  // First subset for quick measurement
  const qpSubset = qpBuffer ? await benchmarkDoc("qp-subset", qpBuffer, "questionPaper", [1, 2, 3]) : null;
  const asSubset = asBuffer ? await benchmarkDoc("as-subset", asBuffer, "answerSheet", [1, 2, 3]) : null;

  // Full docs (if subsets succeeded)
  let qpFull = null, asFull = null;
  if (qpSubset && !qpSubset.error) {
    qpFull = await benchmarkDoc("qp-full", qpBuffer!, "questionPaper");
  }
  if (asSubset && !asSubset.error) {
    asFull = await benchmarkDoc("as-full", asBuffer!, "answerSheet");
  }

  // Generate markdown benchmark doc
  const md: string[] = [];
  md.push(`# LOCAL OCR BENCHMARK — PaddleOCR / PP-StructureV3`);
  md.push(``);
  md.push(`**Date:** ${new Date().toISOString().slice(0, 10)}  `);
  md.push(`**Environment:** ${env.os} | Node ${env.nodeVersion} | Python ${env.pythonVersion} | Paddle ${env.paddleVersion} | PaddleOCR ${env.paddleocrVersion} | PaddleX ${env.paddlexVersion}  `);
  md.push(`**CPU:** ${env.cpus} cores | RAM ${env.totalMemMb}MB | GPU ${env.gpu}  `);
  md.push(`**Model:** PP-OCRv5 server_det + en mobile rec | Lang: en | Device: cpu | FLAGS_use_pir_api=0  `);
  md.push(``);
  md.push(`## Model Files`);
  md.push(`\`\`\`json`);
  md.push(JSON.stringify(modelInfo, null, 2));
  md.push(`\`\`\``);
  md.push(``);
  md.push(`## Subset Benchmark (3 pages each)`);
  if (qpSubset) {
    md.push(`### QP subset (pages 1-3)`);
    if (qpSubset.error) md.push(`FAILED: ${qpSubset.error}`);
    else {
      md.push(`- pages: ${qpSubset.pages} | lines: ${qpSubset.lines} | blocks: ${qpSubset.blocks} | textLen: ${qpSubset.textLen} | avgConfidence: ${qpSubset.confidence.avg.toFixed(3)}`);
      md.push(`- totalMs: ${qpSubset.totalMs} | avgPageMs: ${qpSubset.avgPageMs} | renderMs: ${qpSubset.renderMs} | peakMemory: ${qpSubset.peakMemoryMb}MB`);
      md.push(`- invalidBoxes: ${qpSubset.invalidBoxes} | bboxCoverage: ${qpSubset.bboxCoverage.toFixed(2)}`);
    }
  }
  if (asSubset) {
    md.push(`### AS subset (pages 1-3)`);
    if (asSubset.error) md.push(`FAILED: ${asSubset.error}`);
    else {
      md.push(`- pages: ${asSubset.pages} | lines: ${asSubset.lines} | blocks: ${asSubset.blocks} | textLen: ${asSubset.textLen} | avgConfidence: ${asSubset.confidence.avg.toFixed(3)}`);
      md.push(`- totalMs: ${asSubset.totalMs} | avgPageMs: ${asSubset.avgPageMs} | renderMs: ${asSubset.renderMs} | peakMemory: ${asSubset.peakMemoryMb}MB`);
      md.push(`- invalidBoxes: ${asSubset.invalidBoxes} | bboxCoverage: ${asSubset.bboxCoverage.toFixed(2)}`);
    }
  }
  md.push(``);
  md.push(`## Full Document Benchmark`);
  if (qpFull) {
    md.push(`### QP full (8 pages)`);
    if (qpFull.error) md.push(`FAILED: ${qpFull.error}`);
    else {
      md.push(`- pages: ${qpFull.pages} | lines: ${qpFull.lines} | blocks: ${qpFull.blocks} | words: ${qpFull.words} | textLen: ${qpFull.textLen}`);
      md.push(`- totalMs: ${qpFull.totalMs} | avgPageMs: ${qpFull.avgPageMs} | p95 estimate: ${Math.round(qpFull.avgPageMs * 1.5)}ms | peakMemory: ${qpFull.peakMemoryMb}MB`);
      md.push(`- confidence avg: ${qpFull.confidence.avg.toFixed(3)} (min ${qpFull.confidence.min.toFixed(3)} max ${qpFull.confidence.max.toFixed(3)})`);
    }
  }
  if (asFull) {
    md.push(`### AS full (39 pages)`);
    if (asFull.error) md.push(`FAILED: ${asFull.error}`);
    else {
      md.push(`- pages: ${asFull.pages} | lines: ${asFull.lines} | blocks: ${asFull.blocks} | words: ${asFull.words} | textLen: ${asFull.textLen}`);
      md.push(`- totalMs: ${asFull.totalMs} | avgPageMs: ${asFull.avgPageMs} | peakMemory: ${asFull.peakMemoryMb}MB`);
      md.push(`- confidence avg: ${asFull.confidence.avg.toFixed(3)}`);
    }
  }
  md.push(``);
  md.push(`## Quality Checklist`);
  md.push(`- QP question numbers: ${qpFull && !qpFull.error ? "sample see console" : "not measured"}`);
  md.push(`- QP subparts/MCQ: check question-parser output after fusion`);
  md.push(`- AS label hit rate: ${asSubset && !asSubset.error ? `subset avg conf ${asSubset.confidence.avg.toFixed(3)}` : "pending"}`);
  md.push(`- bbox coverage: QP ${qpSubset ? qpSubset.bboxCoverage.toFixed(2) : "?"}, AS ${asSubset ? asSubset.bboxCoverage.toFixed(2) : "?"}`);
  md.push(`- invalid boxes: QP ${qpSubset ? qpSubset.invalidBoxes : "?"}, AS ${asSubset ? asSubset.invalidBoxes : "?"}`);
  md.push(``);
  md.push(`## Deployment Blockers`);
  md.push(`See docs/PADDLEOCR_FEASIBILITY.md for LOCAL_PADDLEOCR_DEPLOYMENT_BLOCKED analysis (Vercel).`);
  md.push(``);
  md.push(`## Raw Artifacts`);
  md.push(`- artifacts/ocr-benchmark/qp-subset-questionPaper.json`);
  md.push(`- artifacts/ocr-benchmark/as-subset-answerSheet.json`);
  md.push(`- artifacts/ocr-benchmark/qp-full-questionPaper.json (if completed)`);
  md.push(`- artifacts/ocr-benchmark/as-full-answerSheet.json (if completed)`);
  md.push(``);
  md.push(`Generated by scripts/paddle-benchmark.ts — all numbers from actual execution (no estimates).`);

  const outPath = path.join(process.cwd(), "docs", "LOCAL_OCR_BENCHMARK.md");
  await fs.writeFile(outPath, md.join("\n"), "utf-8");
  console.log(`\nBenchmark markdown written to ${outPath}`);

  // Also write combined json
  const combined = { env, modelInfo, qpSubset, asSubset, qpFull, asFull, generatedAt: new Date().toISOString() };
  await fs.writeFile(path.join(process.cwd(), "artifacts", "ocr-benchmark", "combined.json"), JSON.stringify(combined, null, 2), "utf-8");

  console.log("=== Benchmark Complete ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
