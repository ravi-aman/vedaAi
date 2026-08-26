import { AppError, ErrorCodes } from "@/lib/errors/codes";

export interface PdfInspectionResult {
  pageCount: number;
  pages: { pageNumber: number; width: number; height: number; rotation: number }[];
  isEncrypted: boolean;
}

// Use pdf-lib for server-side inspection to avoid worker issues; fallback to pdfjs if needed
export async function inspectPdf(buffer: Buffer): Promise<PdfInspectionResult> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const isEncrypted = pdfDoc.isEncrypted;
    if (isEncrypted) {
      throw new AppError(ErrorCodes.PDF_PASSWORD_PROTECTED, "PDF is password protected");
    }
    const pages = pdfDoc.getPages();
    const pageCount = pages.length;
    if (pageCount === 0) throw new AppError(ErrorCodes.PDF_CORRUPTED, "No pages found");
    const resultPages = pages.map((p, idx) => {
      const { width, height } = p.getSize();
      // pdf-lib rotation handling: getRotation().angle
      let rotation = 0;
      try {
        const rot = (p as any).getRotation()?.angle ?? 0;
        rotation = rot % 360;
      } catch {}
      return { pageNumber: idx + 1, width, height, rotation };
    });
    return { pageCount, pages: resultPages, isEncrypted: false };
  } catch (e: any) {
    if (e instanceof AppError) throw e;
    // Try pdfjs as fallback (for image-only PDFs that pdf-lib might handle differently)
    try {
      const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
      // Disable worker for Node
      if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = "";
      const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const doc = await pdfjs.getDocument({ data: uint8, verbosity: 0, useWorkerFetch: false, isEvalSupported: false, disableFontFace: true }).promise;
      if (doc.isEncrypted) throw new AppError(ErrorCodes.PDF_PASSWORD_PROTECTED, "PDF is password protected");
      const pageCount = doc.numPages;
      const pages: PdfInspectionResult["pages"] = [];
      for (let i = 1; i <= pageCount; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        const rotation = (page.rotate || 0) % 360;
        pages.push({ pageNumber: i, width: viewport.width, height: viewport.height, rotation });
        page.cleanup();
      }
      await doc.destroy();
      return { pageCount, pages, isEncrypted: false };
    } catch (e2: any) {
      if (e2 instanceof AppError) throw e2;
      const msg = e?.message || String(e);
      if (msg.toLowerCase().includes("password")) throw new AppError(ErrorCodes.PDF_PASSWORD_PROTECTED, "PDF is password protected");
      throw new AppError(ErrorCodes.PDF_CORRUPTED, `PDF inspection failed: ${msg.slice(0, 300)}`);
    }
  }
}

export async function inspectImage(buffer: Buffer): Promise<PdfInspectionResult> {
  try {
    const sharp = (await import("sharp").catch(() => null)) as any;
    if (sharp) {
      const image = sharp.default || sharp;
      const meta = await image(buffer).metadata();
      const width = meta.width || 800;
      const height = meta.height || 1100;
      const rotation = 0;
      return {
        pageCount: 1,
        pages: [{ pageNumber: 1, width, height, rotation }],
        isEncrypted: false,
      };
    }
  } catch {}
  return {
    pageCount: 1,
    pages: [{ pageNumber: 1, width: 800, height: 1100, rotation: 0 }],
    isEncrypted: false,
  };
}
