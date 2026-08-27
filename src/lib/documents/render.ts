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

  // Try canvas-based rendering if available; otherwise use PDF base64
  // canvas is optional (serverExternalPackages) — avoid bundler warning via eval
  try {
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
    if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = "";
    const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const doc = await pdfjs.getDocument({ data: uint8, verbosity: 0, useWorkerFetch: false, isEvalSupported: false, disableFontFace: true }).promise;
    const rendered: RenderedPage[] = [];
    for (const pn of targetPages) {
      if (pn > doc.numPages) break;
      const page = await doc.getPage(pn);
      const viewport = page.getViewport({ scale: 1.5 });
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const canvasMod: any = eval("require")("canvas");
      const canvas = canvasMod.createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx as any, viewport }).promise;
      const pngBuffer: Buffer = canvas.toBuffer("image/png");
      rendered.push({ pageNumber: pn, imageBase64: pngBuffer.toString("base64"), mimeType: "image/png", width: viewport.width, height: viewport.height });
      page.cleanup();
    }
    await doc.destroy();
    if (rendered.length > 0) return rendered;
  } catch (e) {
    console.log(`[render] canvas fallback: ${(e as Error).message.slice(0, 100)} — using PDF base64`);
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
