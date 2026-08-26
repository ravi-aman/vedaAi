import { z } from "zod";
import { fileTypeFromBuffer } from "file-type";
import { AppError, ErrorCodes } from "@/lib/errors/codes";

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const ALLOWED_EXTS = new Set(["pdf", "jpg", "jpeg", "png", "webp", "heic", "heif"]);

export interface FileValidationResult {
  mime: string;
  ext: string;
  size: number;
  sanitizedName: string;
}

export async function validateFile(
  buffer: Buffer,
  originalName: string,
  size: number,
  maxSizeBytes: number
): Promise<FileValidationResult> {
  if (size > maxSizeBytes) {
    throw new AppError(ErrorCodes.FILE_TOO_LARGE, `File too large: ${size} > ${maxSizeBytes}`);
  }
  if (size === 0) {
    throw new AppError(ErrorCodes.FILE_INVALID, "File is empty");
  }

  // magic bytes
  const type = await fileTypeFromBuffer(buffer);
  let mime = type?.mime || "";
  let ext = type?.ext || "";

  // fallback for PDF: file-type detects pdf
  // for images, if not detected, try extension fallback but still enforce
  const lowerName = originalName.toLowerCase();
  const nameExt = lowerName.split(".").pop() || "";

  if (!mime) {
    // try infer from extension for edge cases
    if (nameExt === "pdf") mime = "application/pdf";
    else if (["jpg", "jpeg"].includes(nameExt)) mime = "image/jpeg";
    else if (nameExt === "png") mime = "image/png";
    else if (nameExt === "webp") mime = "image/webp";
  }
  if (!ext) ext = nameExt;

  if (!ALLOWED_MIMES.has(mime)) {
    throw new AppError(ErrorCodes.FILE_TYPE_UNSUPPORTED, `Unsupported MIME: ${mime} (ext ${ext})`);
  }
  if (!ALLOWED_EXTS.has(ext) && !ALLOWED_EXTS.has(nameExt)) {
    throw new AppError(ErrorCodes.FILE_TYPE_UNSUPPORTED, `Unsupported extension: ${ext}`);
  }

  // filename sanitization: remove path traversal, control chars
  const sanitized = originalName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, "_")
    .slice(0, 100);

  if (sanitized.length === 0) {
    throw new AppError(ErrorCodes.FILE_INVALID, "Invalid filename");
  }

  return { mime, ext, size, sanitizedName: sanitized };
}

// For PDF page count validation, will be done in document layer
export function validatePageCount(count: number, maxPages: number) {
  if (count > maxPages) {
    throw new AppError(ErrorCodes.FILE_INVALID, `Too many pages: ${count} > ${maxPages}`);
  }
  if (count === 0) {
    throw new AppError(ErrorCodes.PDF_CORRUPTED, "No pages found");
  }
}
