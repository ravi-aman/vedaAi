import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { spawn } from "child_process";
import { getConfig } from "@/lib/config";
import { OcrError, OcrErrorCodes } from "./errors";
import type { OcrDocumentResult, OcrPageResult, NormalizedBox } from "./types";

/**
 * PaddleOCR Provider — local OCR via Python child process
 * Implements processDocument (new) and OcrProvider (legacy) for compatibility
 */

export interface PaddleOcrPageInput {
  pageNumber: number;
  imagePath: string;
  width: number;
  height: number;
}

export interface PaddleOcrRawPage {
  pageNumber: number;
  width: number;
  height: number;
  rec_texts: string[];
  rec_scores: number[];
  dt_polys: number[][][];
  rec_polys: number[][][];
  rec_boxes?: number[][];
  durationMs?: number;
  error?: string;
}

function polyToBox(poly: number[][]): { x: number; y: number; width: number; height: number } {
  if (!poly || poly.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function normalizeBox(
  box: { x: number; y: number; width: number; height: number },
  dims: { width: number; height: number }
): NormalizedBox {
  // Paddle returns pixel coords relative to rendered image dims
  return {
    x: box.x / dims.width,
    y: box.y / dims.height,
    width: box.width / dims.width,
    height: box.height / dims.height,
  };
}

function validateBox(box: NormalizedBox, pageNumber: number): void {
  if (!Number.isFinite(box.x) || !Number.isFinite(box.y) || !Number.isFinite(box.width) || !Number.isFinite(box.height)) {
    throw new OcrError(OcrErrorCodes.OUTPUT_PARSE_FAILED, `Invalid box NaN on page ${pageNumber}: ${JSON.stringify(box)}`, null, false);
  }
  if (box.width <= 0 || box.height <= 0) {
    throw new OcrError(OcrErrorCodes.OUTPUT_PARSE_FAILED, `Invalid box size on page ${pageNumber}: ${JSON.stringify(box)}`, null, false);
  }
  // Allow slight out-of-bounds due to rounding but clamp
  if (box.x < -0.05 || box.y < -0.05 || box.x + box.width > 1.05 || box.y + box.height > 1.05) {
    // log warning but not fail — clamp later
  }
}

export class PaddleOcrProvider {
  private pythonPath: string;
  private workerScript: string;

  constructor(opts?: { pythonPath?: string; workerScript?: string }) {
    const cfg = getConfig() as any;
    this.pythonPath = opts?.pythonPath || cfg.LOCAL_OCR_PYTHON || "python";
    this.workerScript = opts?.workerScript || path.join(process.cwd(), "scripts", "paddle_ocr_worker.py");
  }

  async processDocument(input: {
    jobId: string;
    documentId: string;
    kind: "questionPaper" | "answerSheet";
    pages: { pageNumber: number; imagePath: string; width: number; height: number }[];
  }): Promise<OcrDocumentResult> {
    const start = Date.now();
    const jobId = input.jobId;
    const pages = input.pages;

    if (pages.length === 0) {
      throw new OcrError(OcrErrorCodes.OUTPUT_MISSING, "No pages to OCR", null, false);
    }

    const tmpRoot = path.join(os.tmpdir(), "veda-ai", jobId.replace(/[^a-zA-Z0-9-]/g, ""), "paddle");
    const manifestPath = path.join(tmpRoot, `${input.kind}-manifest.json`);
    const outputDir = path.join(tmpRoot, `${input.kind}-output`);

    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });

    // Clean previous output
    try {
      const existing = await fs.readdir(outputDir);
      for (const f of existing) await fs.unlink(path.join(outputDir, f)).catch(() => {});
    } catch {}

    const manifest = {
      jobId,
      kind: input.kind,
      pages: pages.map((p) => ({
        pageNumber: p.pageNumber,
        imagePath: p.imagePath,
        width: p.width,
        height: p.height,
      })),
    };
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

    console.log(
      JSON.stringify({
        jobId,
        stage: "OCR",
        engine: "paddleocr",
        event: "worker_spawn_start",
        kind: input.kind,
        pages: pages.length,
        manifestPath,
        outputDir,
        pythonPath: this.pythonPath,
      })
    );

    const cfg = getConfig() as any;
    const ocrVersion = cfg.LOCAL_OCR_VERSION || "PP-OCRv5";
    const lang = cfg.LOCAL_OCR_LANGUAGE || "en";
    const timeoutMs = cfg.OCR_OPERATION_TIMEOUT_MS || 600000; // 10m for 39 pages at 13s/page

    const args = [
      this.workerScript,
      "--manifest",
      manifestPath,
      "--output-dir",
      outputDir,
      "--lang",
      lang,
      "--ocr-version",
      ocrVersion,
    ];

    const workerStart = Date.now();
    const result = await this.spawnWorker(this.pythonPath, args, timeoutMs, jobId);
    const workerDur = Date.now() - workerStart;

    console.log(
      JSON.stringify({
        jobId,
        stage: "OCR",
        engine: "paddleocr",
        event: "worker_completed",
        kind: input.kind,
        durationMs: workerDur,
        summary: result.summary,
      })
    );

    // Read per-page results and convert to OcrDocumentResult
    const ocrPages: OcrPageResult[] = [];
    for (const p of pages) {
      const pageJsonPath = path.join(outputDir, `page-${String(p.pageNumber).padStart(3, "0")}.json`);
      try {
        const rawContent = await fs.readFile(pageJsonPath, "utf-8");
        const raw: PaddleOcrRawPage = JSON.parse(rawContent);
        if (raw.error) {
          console.warn(
            JSON.stringify({
              jobId,
              stage: "OCR",
              engine: "paddleocr",
              event: "page_failed",
              kind: input.kind,
              pageNumber: p.pageNumber,
              error: raw.error.slice(0, 200),
            })
          );
          // Create empty page with low confidence but preserve identity
          ocrPages.push({
            pageNumber: p.pageNumber,
            text: "",
            blocks: [],
            lines: [],
            confidence: 0.1,
            width: p.width,
            height: p.height,
            rotation: 0,
          });
          continue;
        }
        const pageResult = this.convertRawToOcrPage(raw, p);
        ocrPages.push(pageResult);
      } catch (e: any) {
        console.error(
          JSON.stringify({
            jobId,
            stage: "OCR",
            engine: "paddleocr",
            event: "page_read_failed",
            pageNumber: p.pageNumber,
            error: e.message.slice(0, 200),
          })
        );
        // Do not silently skip — create empty page and continue (per spec: report page failure)
        ocrPages.push({
          pageNumber: p.pageNumber,
          text: "",
          blocks: [],
          lines: [],
          confidence: 0.1,
          width: p.width,
          height: p.height,
          rotation: 0,
        });
      }
    }

    ocrPages.sort((a, b) => a.pageNumber - b.pageNumber);

    const docResult: OcrDocumentResult = {
      jobId,
      documentId: input.documentId,
      kind: input.kind,
      pages: ocrPages,
      provider: "paddleocr" as any,
      providerVersion: ocrVersion,
      operationId: `paddle-${jobId}-${input.kind}-${Date.now()}`,
      completedAt: new Date().toISOString(),
    };

    // Artifact dump for debugging (preserve raw)
    try {
      const debugDir = path.join(os.tmpdir(), "veda-ai", jobId.replace(/[^a-zA-Z0-9-]/g, ""), "debug");
      await fs.mkdir(debugDir, { recursive: true });
      await fs.writeFile(path.join(debugDir, `${input.kind}-paddle-raw.json`), JSON.stringify({ manifest, summary: result.summary }, null, 2), "utf-8");
      await fs.writeFile(path.join(debugDir, `${input.kind}-paddle-normalized.json`), JSON.stringify(docResult, null, 2), "utf-8");
      const artDir = path.join(process.cwd(), "artifacts", "paddle-debug", jobId.replace(/[^a-zA-Z0-9-]/g, ""));
      await fs.mkdir(artDir, { recursive: true });
      await fs.writeFile(path.join(artDir, `${input.kind}-paddle-raw.json`), JSON.stringify({ manifest, summary: result.summary }, null, 2), "utf-8");
      await fs.writeFile(path.join(artDir, `${input.kind}-paddle-normalized.json`), JSON.stringify(docResult, null, 2), "utf-8");
    } catch {}

    console.log(
      JSON.stringify({
        jobId,
        stage: "OCR",
        engine: "paddleocr",
        event: "normalized",
        kind: input.kind,
        pages: ocrPages.length,
        totalLines: ocrPages.reduce((a, p) => a + p.lines.length, 0),
        totalBlocks: ocrPages.reduce((a, p) => a + p.blocks.length, 0),
        totalDuration: Date.now() - start,
      })
    );

    return docResult;
  }

  private convertRawToOcrPage(raw: PaddleOcrRawPage, input: { pageNumber: number; width: number; height: number }): OcrPageResult {
    const dims = { width: raw.width || input.width, height: raw.height || input.height };
    const texts: string[] = raw.rec_texts || [];
    const scores: number[] = raw.rec_scores || [];
    const polys: number[][][] = raw.dt_polys || [];
    const recPolys: number[][][] = raw.rec_polys || [];

    // Paddle returns dt_polys (detection polygons) and rec_texts aligned by index
    // dt_polys are 4-point polygons in pixel coords
    const lines: any[] = [];
    const blocks: any[] = [];

    // Group by y proximity into blocks for compatibility with synthesis
    const items: { text: string; score: number; poly: number[][]; box: NormalizedBox }[] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i] || "";
      const score = scores[i] ?? 0.9;
      const poly: number[][] = polys[i] || recPolys[i] || [];
      if (!poly || poly.length === 0) continue;
      const pixelBox = polyToBox(poly);
      const normBox = normalizeBox(pixelBox, dims);
      // Clamp to [0,1]
      const clamped: NormalizedBox = {
        x: Math.max(0, Math.min(1, normBox.x)),
        y: Math.max(0, Math.min(1, normBox.y)),
        width: Math.max(0, Math.min(1 - Math.max(0, normBox.x), normBox.width)),
        height: Math.max(0, Math.min(1 - Math.max(0, normBox.y), normBox.height)),
      };
      try {
        validateBox(clamped, raw.pageNumber);
      } catch (e) {
        // skip invalid box but log
        console.warn(JSON.stringify({ stage: "OCR", event: "invalid_box", pageNumber: raw.pageNumber, box: clamped, text: text.slice(0, 50) }));
        continue;
      }
      // Filter tiny boxes (noise)
      if (clamped.width < 0.005 || clamped.height < 0.005) continue;
      items.push({ text, score, poly, box: clamped });
    }

    // Sort by reading order: y then x (0.012 threshold)
    items.sort((a, b) => {
      const yDiff = a.box.y - b.box.y;
      if (Math.abs(yDiff) < 0.012) return a.box.x - b.box.x;
      return yDiff;
    });

    // Build lines (each item is a line)
    for (const it of items) {
      lines.push({
        text: it.text,
        boundingBox: it.box,
        confidence: it.score,
        pageNumber: raw.pageNumber,
        polygon: it.poly,
      });
    }

    // Synthesize blocks via vertical gap merging (same as Textract logic but using normalized coords)
    // Gap >0.025 triggers new block
    const synthesizedBlocks: typeof items[] = [];
    let current: typeof items = [];
    let lastTop = -1;
    let lastHeight = 0;
    for (const it of items) {
      const top = it.box.y;
      const height = it.box.height;
      if (lastTop >= 0) {
        const gap = top - (lastTop + lastHeight);
        if (gap > 0.025) {
          if (current.length > 0) {
            synthesizedBlocks.push([...current]);
            current = [];
          }
        }
      }
      current.push(it);
      lastTop = top;
      lastHeight = height;
    }
    if (current.length > 0) synthesizedBlocks.push(current);

    for (const blockItems of synthesizedBlocks) {
      const bbs = blockItems.map((it) => it.box);
      const blockBox = this.unionNormalizedBoxes(bbs);
      const confidence = blockItems.reduce((a, it) => a + it.score, 0) / blockItems.length;

      // Paragraphs: split by gap >0.015
      const paragraphs: any[] = [];
      let paraItems: typeof items = [blockItems[0]];
      for (let i = 1; i < blockItems.length; i++) {
        const prev = blockItems[i - 1];
        const cur = blockItems[i];
        const gap = cur.box.y - (prev.box.y + prev.box.height);
        if (gap > 0.015) {
          paragraphs.push(paraItems);
          paraItems = [cur];
        } else {
          paraItems.push(cur);
        }
      }
      paragraphs.push(paraItems);

      const ocrParagraphs = paragraphs.map((para) => {
        const paraBbs = para.map((it: any) => it.box);
        const pBox = this.unionNormalizedBoxes(paraBbs);
        const pConf = para.reduce((a: number, it: any) => a + it.score, 0) / para.length;
        const words = para.map((it: any) => ({
          boundingBox: it.box,
          symbols: [],
          confidence: it.score,
          text: it.text,
          polygon: it.poly,
        }));
        return { boundingBox: pBox, words, confidence: pConf };
      });

      blocks.push({
        boundingBox: blockBox,
        paragraphs: ocrParagraphs,
        confidence,
      });
    }

    const text = lines.map((l) => l.text).join("\n");
    const avgConf = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.9;

    return {
      pageNumber: raw.pageNumber,
      text,
      blocks,
      lines,
      confidence: avgConf,
      width: dims.width,
      height: dims.height,
      rotation: 0,
    };
  }

  private unionNormalizedBoxes(boxes: NormalizedBox[]): NormalizedBox {
    if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of boxes) {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  private static activeWorkers = new Map<string, Set<ReturnType<typeof spawn>>>();
  static cancelWorkers(jobId: string) {
    const set = PaddleOcrProvider.activeWorkers.get(jobId);
    if (set) for (const c of set) try { (c as any).kill("SIGTERM"); } catch {}
  }
  private spawnWorker(pythonPath: string, args: string[], timeoutMs: number, jobId: string): Promise<{ stdout: string; stderr: string; summary: any }> {
    return new Promise((resolve, reject) => {
      const child = spawn(pythonPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, FLAGS_use_pir_api: "0", PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: "True" },
      });
      // Track for cancellation (bounded backpressure)
      if (!PaddleOcrProvider.activeWorkers.has(jobId)) PaddleOcrProvider.activeWorkers.set(jobId, new Set());
      PaddleOcrProvider.activeWorkers.get(jobId)!.add(child as any);
      const cleanup = () => { try { PaddleOcrProvider.activeWorkers.get(jobId)?.delete(child as any); } catch {} };

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
        }, 5000);
        reject(
          new OcrError(
            OcrErrorCodes.OPERATION_TIMEOUT,
            `PaddleOCR worker timed out after ${timeoutMs}ms for job ${jobId}. Process may be overloaded or model not loaded.`,
            { stderr: stderr.slice(0, 2000) },
            true
          )
        );
      }, timeoutMs);

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr.on("data", (data) => {
        const chunk = data.toString();
        stderr += chunk;
        // Stream stderr to console for observability
        for (const line of chunk.split("\n")) {
          if (line.trim()) console.error(`[paddle_worker stderr] ${line.slice(0, 500)}`);
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        cleanup();
        reject(new OcrError(OcrErrorCodes.OPERATION_FAILED, `Failed to spawn PaddleOCR worker: ${err.message}`, err, false));
      });

      child.on("close", (code, signal) => {
        clearTimeout(timer);
        cleanup();
        if (timedOut) return;
        if (code === 0) {
          try {
            // stdout should contain summary JSON last line; parse
            const lines = stdout.trim().split("\n");
            const last = lines[lines.length - 1];
            let summary: any = {};
            try {
              summary = JSON.parse(last);
            } catch {
              // if not json, try to find json object in stdout
              const jsonMatch = stdout.match(/\{[^]*"engine"\s*:\s*"paddleocr"[^]*\}/);
              if (jsonMatch) summary = JSON.parse(jsonMatch[0]);
            }
            resolve({ stdout, stderr, summary });
          } catch (e: any) {
            reject(new OcrError(OcrErrorCodes.OUTPUT_PARSE_FAILED, `Failed to parse worker output: ${e.message} stdout:${stdout.slice(0, 500)}`, e, false));
          }
        } else {
          reject(
            new OcrError(
              OcrErrorCodes.OPERATION_FAILED,
              `PaddleOCR worker failed with exit ${code} signal ${signal} stderr:${stderr.slice(0, 1000)}`,
              { code, signal, stderr: stderr.slice(0, 2000) },
              false
            )
          );
        }
      });
    });
  }

  // Legacy OcrProvider compatibility (no-op for async)
  async submitDocument(): Promise<{ operationId: string; outputUri: string }> {
    throw new OcrError(OcrErrorCodes.OPERATION_FAILED, "PaddleOcrProvider does not support async submitDocument — use processDocument", null, false);
  }
  async getOperationStatus(): Promise<any> {
    throw new OcrError(OcrErrorCodes.OPERATION_FAILED, "PaddleOcrProvider does not support getOperationStatus", null, false);
  }
  async getOperationResult(): Promise<any> {
    throw new OcrError(OcrErrorCodes.OPERATION_FAILED, "PaddleOcrProvider does not support getOperationResult", null, false);
  }
  async cancelOperation(): Promise<void> {}
}
