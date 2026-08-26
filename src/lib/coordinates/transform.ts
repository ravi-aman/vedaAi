import type { NormalizedBox } from "@/types";

/**
 * Canonical normalized [0,1] coords relative to original page dims.
 * All transforms explicit, invertible, pure.
 */

export interface Dims {
  width: number;
  height: number;
}

export interface TransformParams {
  originalDims: Dims;
  processingDims: Dims;
  displayDims: Dims;
  rotation: number; // 0|90|180|270
  crop?: { x: number; y: number; width: number; height: number }; // in normalized coords
  scale: number; // display / original
}

export function normalizeBox(
  boxPx: { x: number; y: number; width: number; height: number },
  dims: Dims
): NormalizedBox {
  return {
    x: boxPx.x / dims.width,
    y: boxPx.y / dims.height,
    width: boxPx.width / dims.width,
    height: boxPx.height / dims.height,
  };
}

export function denormalizeBox(box: NormalizedBox, dims: Dims) {
  return {
    x: box.x * dims.width,
    y: box.y * dims.height,
    width: box.width * dims.width,
    height: box.height * dims.height,
  };
}

export function scaleBox(box: NormalizedBox, scale: number): NormalizedBox {
  // scaling normalized is identity; display scaling handled in denormalize
  // but for completeness, if processing dims scaled:
  return { ...box };
}

export function rotateBox(box: NormalizedBox, rotation: number): NormalizedBox {
  const r = ((rotation % 360) + 360) % 360;
  if (r === 0) return { ...box };
  if (r === 90) {
    return {
      x: box.y,
      y: 1 - box.x - box.width,
      width: box.height,
      height: box.width,
    };
  }
  if (r === 180) {
    return {
      x: 1 - box.x - box.width,
      y: 1 - box.y - box.height,
      width: box.width,
      height: box.height,
    };
  }
  if (r === 270) {
    return {
      x: 1 - box.y - box.height,
      y: box.x,
      width: box.height,
      height: box.width,
    };
  }
  throw new Error(`Unsupported rotation ${rotation}`);
}

export function cropBox(box: NormalizedBox, crop: { x: number; y: number; width: number; height: number }): NormalizedBox {
  // map from cropped normalized to full normalized inverse
  // cropped coords are relative to crop; convert to full
  // Actually input box is relative to cropped region; convert to original
  // For now, assume box is relative to original and we want to crop: clip
  const x1 = Math.max(box.x, crop.x);
  const y1 = Math.max(box.y, crop.y);
  const x2 = Math.min(box.x + box.width, crop.x + crop.width);
  const y2 = Math.min(box.y + box.height, crop.y + crop.height);
  if (x2 <= x1 || y2 <= y1) return { x: 0, y: 0, width: 0, height: 0 };
  return {
    x: (x1 - crop.x) / crop.width,
    y: (y1 - crop.y) / crop.height,
    width: (x2 - x1) / crop.width,
    height: (y2 - y1) / crop.height,
  };
}

export function toDisplayBox(box: NormalizedBox, displayDims: Dims): { x: number; y: number; width: number; height: number } {
  return denormalizeBox(box, displayDims);
}

export function transformForDisplay(
  box: NormalizedBox,
  params: { displayDims: Dims; rotation: number; crop?: { x: number; y: number; width: number; height: number } }
): NormalizedBox {
  let b = { ...box };
  if (params.crop) {
    // if crop defined, boxes are relative to original; display shows cropped region
    // we need to convert to cropped normalized
    const c = params.crop;
    b = {
      x: (b.x - c.x) / c.width,
      y: (b.y - c.y) / c.height,
      width: b.width / c.width,
      height: b.height / c.height,
    };
  }
  b = rotateBox(b, params.rotation);
  return b;
}

export function invertTransform(box: NormalizedBox, rotation: number): NormalizedBox {
  // rotate back
  const inv = (360 - rotation) % 360;
  return rotateBox(box, inv);
}

// Utility to merge overlapping boxes (for highlight merging)
export function mergeBoxes(boxes: NormalizedBox[]): NormalizedBox {
  if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  if (boxes.length === 1) return { ...boxes[0] };
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.width));
  const y2 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function boxIoU(a: NormalizedBox, b: NormalizedBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return 0;
  const inter = (x2 - x1) * (y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return inter / union;
}
