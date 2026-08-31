import type { NormalizedBox } from "@/lib/ocr/types";

export function clampBox(box: NormalizedBox): NormalizedBox {
  const x = Math.max(0, Math.min(1, box.x));
  const y = Math.max(0, Math.min(1, box.y));
  const w = Math.max(0, Math.min(1 - x, box.width));
  const h = Math.max(0, Math.min(1 - y, box.height));
  return { x, y, width: w, height: h };
}

export function validateVisionBox(box: NormalizedBox): boolean {
  if (!Number.isFinite(box.x) || !Number.isFinite(box.y) || !Number.isFinite(box.width) || !Number.isFinite(box.height)) return false;
  if (box.width < 0.005 || box.height < 0.005) return false;
  if (box.width > 0.95 && box.height > 0.9) return false; // whole page -> likely hallucinated
  if (box.x < -0.05 || box.y < -0.05 || box.x + box.width > 1.05 || box.y + box.height > 1.05) return false;
  return true;
}
