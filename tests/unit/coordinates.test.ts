import { describe, it, expect } from "vitest";
import { normalizeBox, denormalizeBox, rotateBox, boxIoU, mergeBoxes, transformForDisplay } from "@/lib/coordinates/transform";

describe("coordinates", () => {
  const dims = { width: 800, height: 1100 };
  const box = { x: 0.1, y: 0.2, width: 0.5, height: 0.3 };

  it("normalize/denormalize roundtrip", () => {
    const px = denormalizeBox(box, dims);
    const norm = normalizeBox(px, dims);
    expect(norm.x).toBeCloseTo(box.x);
    expect(norm.y).toBeCloseTo(box.y);
    expect(norm.width).toBeCloseTo(box.width);
    expect(norm.height).toBeCloseTo(box.height);
  });

  it("scale 0.5/1/2 via display dims", () => {
    for (const scale of [0.5, 1, 2]) {
      const display = { width: dims.width * scale, height: dims.height * scale };
      const px = denormalizeBox(box, display);
      const norm = normalizeBox(px, display);
      expect(norm.x).toBeCloseTo(box.x);
    }
  });

  it("rotation 0", () => {
    const r = rotateBox(box, 0);
    expect(r).toEqual(box);
  });
  it("rotation 90", () => {
    const r = rotateBox(box, 90);
    expect(r.x).toBeCloseTo(box.y);
    expect(r.y).toBeCloseTo(1 - box.x - box.width);
    expect(r.width).toBeCloseTo(box.height);
    expect(r.height).toBeCloseTo(box.width);
  });
  it("rotation 180", () => {
    const r = rotateBox(box, 180);
    expect(r.x).toBeCloseTo(1 - box.x - box.width);
    expect(r.y).toBeCloseTo(1 - box.y - box.height);
  });
  it("rotation 270", () => {
    const r = rotateBox(box, 270);
    expect(r.x).toBeCloseTo(1 - box.y - box.height);
    expect(r.y).toBeCloseTo(box.x);
  });

  it("invert rotation", () => {
    const r90 = rotateBox(box, 90);
    const back = rotateBox(r90, 270);
    expect(back.x).toBeCloseTo(box.x);
    expect(back.y).toBeCloseTo(box.y);
  });

  it("mergeBoxes", () => {
    const merged = mergeBoxes([
      { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      { x: 0.3, y: 0.3, width: 0.2, height: 0.2 },
    ]);
    expect(merged.x).toBe(0.1);
    expect(merged.y).toBe(0.1);
    expect(merged.width).toBeCloseTo(0.4);
  });

  it("boxIoU", () => {
    const a = { x: 0, y: 0, width: 0.5, height: 0.5 };
    const b = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    const iou = boxIoU(a, b);
    expect(iou).toBeGreaterThan(0);
    expect(iou).toBeLessThan(1);
    expect(boxIoU(a, a)).toBe(1);
  });

  it("transformForDisplay with rotation", () => {
    const b = transformForDisplay(box, { displayDims: dims, rotation: 90 });
    expect(b.width).toBeCloseTo(box.height);
  });

  it("multiple regions remain separate but merge works", () => {
    const boxes = [
      { x: 0.1, y: 0.1, width: 0.2, height: 0.1 },
      { x: 0.1, y: 0.3, width: 0.2, height: 0.1 },
      { x: 0.1, y: 0.5, width: 0.2, height: 0.1 },
    ];
    const merged = mergeBoxes(boxes);
    expect(merged.height).toBeCloseTo(0.5);
  });
});
