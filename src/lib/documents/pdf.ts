import { AppError, ErrorCodes } from "@/lib/errors/codes";

export interface PdfInspectionResult {
  pageCount: number;
  pages: { pageNumber: number; width: number; height: number; rotation: number }[];
  isEncrypted: boolean;
}

// Use pdfjs-dist legacy build for Node
export async function inspectPdf(buffer: Buffer): Promise<PdfInspectionResult> {
  try {
    // dynamic import to avoid bundling issues
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: buffer, verbosity: 0 }).promise;
    if (doc.isEncrypted) {
      throw new AppError(ErrorCodes.PDF_PASSWORD_PROTECTED, "PDF is password protected");
    }
    const pageCount = doc.numPages;
    const pages: PdfInspectionResult["pages"] = [];
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      // rotation from page
      const rotation = (page.rotate || 0) % 360;
      pages.push({
        pageNumber: i,
        width: viewport.width,
        height: viewport.height,
        rotation,
      });
      page.cleanup();
    }
    await doc.destroy();
    return { pageCount, pages, isEncrypted: false };
  } catch (e: any) {
    if (e instanceof AppError) throw e;
    // heuristic for corrupted
    const msg = e?.message || String(e);
    if (msg.toLowerCase().includes("password")) {
      throw new AppError(ErrorCodes.PDF_PASSWORD_PROTECTED, "PDF is password protected");
    }
    throw new AppError(ErrorCodes.PDF_CORRUPTED, `PDF inspection failed: ${msg}`);
  }
}

// For image documents, treat as single page with dimensions from buffer header
export async function inspectImage(buffer: Buffer): Promise<PdfInspectionResult> {
  // naive: we can use file-type + manual but for now return single page 800x1100
  // In real impl, use sharp metadata; fallback
  try {
    // try sharp if available
    const sharp = (await import("sharp").catch(() => null)) as any;
    if (sharp) {
      const image = sharp.default || sharp;
      const meta = await image(buffer).metadata();
      const width = meta.width || 800;
      const height = meta.height || 1100;
      const rotation = 0; // TODO: picks exif
      return {
        pageCount: 1,
        pages: [{ pageNumber: 1, width, height, rotation }],
        isEncrypted: false,
      };
    }
  } catch {}
  // fallback
  return {
    pageCount: 1,
    pages: [{ pageNumber: 1, width: 800, height: 1100, rotation: 0 }],
    isEncrypted: false,
  };
}
