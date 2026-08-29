// @ts-nocheck
/**
 * Render PDF pages to images for Vision input.
 * Preserves pageNumber, original dimensions, and artifact identity.
 * Falls back to PDF base64 if canvas not available.
 */

export interface RenderedPage {
  pageNumber: number;
  imageBase64: string;
  mimeType: "image/png" | "application/pdf";
  width: number;
  height: number;
}

export async function renderPdfPagesForVision(
  buffer: Buffer,
  pageNumbers: number[] = [],
  maxPages = 5
): Promise<RenderedPage[]> {
  const targetPages = pageNumbers.length ? pageNumbers.slice(0, maxPages) : Array.from({ length: maxPages }, (_, i) => i + 1);

  // Try mupdf-based rendering first (most reliable in Node, no canvas factory issues)
  try {
    const mupdf: any = await import("mupdf");
    const doc = mupdf.Document.openDocument(buffer, "application/pdf");
    const total = doc.countPages();
    const rendered: RenderedPage[] = [];
    for (const pn of targetPages) {
      if (pn > total) break;
      const page = doc.loadPage(pn - 1);
      // Scale 1.5 ~ 108 DPI (mupdf default 72, scale 1.5 = 108)
      const pix = page.toPixmap(mupdf.Matrix.scale(1.5, 1.5), mupdf.ColorSpace.DeviceRGB, false, true);
      const png = pix.asPNG(); // Uint8Array
      const b64 = Buffer.from(png).toString("base64");
      rendered.push({ pageNumber: pn, imageBase64: b64, mimeType: "image/png", width: pix.getWidth(), height: pix.getHeight() });
      pix.destroy();
      page.destroy();
    }
    doc.destroy();
    if (rendered.length > 0) return rendered;
  } catch (e) {
    console.log(`[render] mupdf fallback: ${(e as Error).message.slice(0, 200)} — trying pdfjs+canvas`);
  }

  // Try canvas-based pdfjs rendering as second attempt
  try {
    // Polyfill DOM APIs for pdfjs Node canvas BEFORE importing pdfjs (pdfjs caches globals)
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const canvasModPoly: any = eval("require")("canvas");
    const g: any = globalThis as any;
    if (typeof g !== "undefined") {
      if (!g.Image) g.Image = canvasModPoly.Image;
      if (!g.HTMLCanvasElement) g.HTMLCanvasElement = canvasModPoly.Canvas as any;
      if (!g.HTMLImageElement) g.HTMLImageElement = canvasModPoly.Image as any;
      if (!g.ImageData && canvasModPoly.ImageData) g.ImageData = canvasModPoly.ImageData;
      if (!g.Canvas) g.Canvas = canvasModPoly.Canvas as any;
      if (!g.OffscreenCanvas) g.OffscreenCanvas = canvasModPoly.Canvas as any;
      if (!g.DOMMatrix) {
        try {
          const { DOMMatrix } = canvasModPoly;
          if (DOMMatrix) g.DOMMatrix = DOMMatrix;
        } catch {}
      }
      if (!g.Path2D && canvasModPoly.Path2D) g.Path2D = canvasModPoly.Path2D;
    }
    const hasCanvas = await (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        const req = eval("require") as any;
        req.resolve("canvas");
        return true;
      } catch { return false; }
    })();
    if (!hasCanvas) throw new Error("canvas not available");

    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    if (pdfjs.GlobalWorkerOptions) {
      try {
        // @ts-ignore
        const workerMod = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "pdfjs-dist/legacy/build/pdf.worker.mjs";
        void workerMod;
      } catch {
        pdfjs.GlobalWorkerOptions.workerSrc = "";
      }
    }
    const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const doc = await pdfjs.getDocument({ data: uint8, verbosity: 0, useWorkerFetch: false, isEvalSupported: false, disableFontFace: true, disableWorker: true } as any).promise;
    const rendered: RenderedPage[] = [];
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const canvasMod: any = eval("require")("canvas");
    class NodeCanvasFactory {
      create(width: number, height: number) {
        const canvas = canvasMod.createCanvas(width, height);
        const context = canvas.getContext("2d");
        return { canvas, context };
      }
      reset(canvasAndContext: any, width: number, height: number) {
        canvasAndContext.canvas.width = width;
        canvasAndContext.canvas.height = height;
      }
      destroy(canvasAndContext: any) {
        canvasAndContext.canvas.width = 0;
        canvasAndContext.canvas.height = 0;
        canvasAndContext.canvas = null;
        canvasAndContext.context = null;
      }
    }
    const factory = new NodeCanvasFactory();
    for (const pn of targetPages) {
      if (pn > doc.numPages) break;
      const page = await doc.getPage(pn);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvasAndContext = factory.create(viewport.width, viewport.height);
      await page.render({ canvasContext: canvasAndContext.context as any, viewport, canvasFactory: factory } as any).promise;
      const pngBuffer: Buffer = canvasAndContext.canvas.toBuffer("image/png");
      rendered.push({ pageNumber: pn, imageBase64: pngBuffer.toString("base64"), mimeType: "image/png", width: viewport.width, height: viewport.height });
      factory.destroy(canvasAndContext);
      page.cleanup();
    }
    await doc.destroy();
    if (rendered.length > 0) return rendered;
  } catch (e) {
    console.log(`[render] canvas fallback: ${(e as Error).message} — using PDF base64`);
    console.log((e as Error).stack?.slice(0, 2000));
  }

  // Fallback: single entry with full PDF base64 (consumer will slice if needed)
  // Caller should treat this as mimeType application/pdf and send as input_file per page
  const pdfBase64 = buffer.toString("base64");
  // For vision we still need per-page entries; reuse same PDF base64 for each page (Vision analyzes with pageNumber hint)
  return targetPages.slice(0, 3).map((pn) => ({ pageNumber: pn, imageBase64: pdfBase64, mimeType: "application/pdf" as const, width: 800, height: 1100 }));
}

export async function bufferToBase64ForVision(buffer: Buffer, mime: string): Promise<{ base64: string; mimeType: "image/png" | "image/jpeg" | "application/pdf" }> {
  if (mime === "application/pdf") return { base64: buffer.toString("base64"), mimeType: "application/pdf" };
  if (mime === "image/png") return { base64: buffer.toString("base64"), mimeType: "image/png" };
  if (mime === "image/jpeg") return { base64: buffer.toString("base64"), mimeType: "image/jpeg" };
  return { base64: buffer.toString("base64"), mimeType: "image/png" };
}
