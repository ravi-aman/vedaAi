// @ts-nocheck
/**
 * Geometry Snap — tightens Vision coarseBox to ink via dark-pixel min/max
 * Pure JS, no ML: reads PNG pixmap bytes via mupdf/canvas fallback, finds dark pixels.
 * ~5ms/page, generic (not paper-specific).
 */

import type { NormalizedBox } from "@/lib/ocr/types";
import * as fs from "fs/promises";

export async function snapBoxToInk(
  imagePath: string,
  box: NormalizedBox,
  dims: { width: number; height: number }
): Promise<NormalizedBox> {
  // Already tight
  if (box.width < 0.08 && box.height < 0.06) return box;
  try {
    const { createCanvas, loadImage } = await import("canvas");
    const img: any = await loadImage(imagePath);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const x0 = Math.max(0, Math.floor(box.x * img.width));
    const y0 = Math.max(0, Math.floor(box.y * img.height));
    const w = Math.max(1, Math.floor(box.width * img.width));
    const h = Math.max(1, Math.floor(box.height * img.height));
    // Clamp to image bounds
    const x1 = Math.min(img.width, x0 + w);
    const y1 = Math.min(img.height, y0 + h);
    const cw = Math.max(1, x1 - x0);
    const ch = Math.max(1, y1 - y0);
    const data = ctx.getImageData(x0, y0, cw, ch).data;
    let minX = cw, minY = ch, maxX = -1, maxY = -1;
    // Luminance threshold < 190 for ink (handwriting/printed)
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const idx = (y * cw + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
        if (a < 10) continue;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum < 190) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX === -1) {
      // No ink found — shrink slightly to avoid whole-page
      const padX = box.width * 0.02;
      const padY = box.height * 0.02;
      return { x: Math.max(0, box.x + padX), y: Math.max(0, box.y + padY), width: Math.max(0.005, box.width - padX * 2), height: Math.max(0.005, box.height - padY * 2) };
    }
    // Add 2px padding in pixel space
    const pad = 2;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(cw - 1, maxX + pad);
    maxY = Math.min(ch - 1, maxY + pad);
    const tightW = maxX - minX + 1;
    const tightH = maxY - minY + 1;
    const tight: NormalizedBox = {
      x: (x0 + minX) / img.width,
      y: (y0 + minY) / img.height,
      width: tightW / img.width,
      height: tightH / img.height,
    };
    // Clamp
    tight.x = Math.max(0, Math.min(1, tight.x));
    tight.y = Math.max(0, Math.min(1, tight.y));
    tight.width = Math.max(0.005, Math.min(1 - tight.x, tight.width));
    tight.height = Math.max(0.005, Math.min(1 - tight.y, tight.height));
    return tight;
  } catch {
    // Fallback shrink
    const padX = box.width * 0.02;
    const padY = box.height * 0.02;
    return { x: Math.max(0, box.x + padX), y: Math.max(0, box.y + padY), width: Math.max(0.005, box.width - padX * 2), height: Math.max(0.005, box.height - padY * 2) };
  }
}
