import { describe, it, expect } from "vitest";
import { normalizeTextractBlocks } from "@/lib/ocr/textract";

function makeBlock(overrides: any) {
  return { Id: overrides.Id || `id-${Math.random()}`, BlockType: overrides.BlockType, Page: overrides.Page || 1, Text: overrides.Text || "", Confidence: overrides.Confidence ?? 95, Geometry: overrides.Geometry || { BoundingBox: { Left: 0.1, Top: 0.1, Width: 0.5, Height: 0.02 }, Polygon: [] }, Relationships: overrides.Relationships || [] };
}

describe("normalizeTextractBlocks", () => {
  it("single page LINE + WORD hierarchy", () => {
    const blocks: any[] = [
      makeBlock({ BlockType: "PAGE", Page: 1 }),
      makeBlock({ BlockType: "LINE", Page: 1, Text: "Q1. What is photosynthesis?", Confidence: 98, Geometry: { BoundingBox: { Left: 0.05, Top: 0.05, Width: 0.9, Height: 0.03 } }, Relationships: [{ Type: "CHILD", Ids: ["w1", "w2"] }] }),
      makeBlock({ Id: "w1", BlockType: "WORD", Page: 1, Text: "Q1.", Confidence: 99, Geometry: { BoundingBox: { Left: 0.05, Top: 0.05, Width: 0.05, Height: 0.03 } } }),
      makeBlock({ Id: "w2", BlockType: "WORD", Page: 1, Text: "What", Confidence: 98, Geometry: { BoundingBox: { Left: 0.12, Top: 0.05, Width: 0.1, Height: 0.03 } } }),
    ];
    const pages = normalizeTextractBlocks(blocks);
    expect(pages.length).toBe(1);
    expect(pages[0].pageNumber).toBe(1);
    expect(pages[0].text).toContain("Q1.");
    expect(pages[0].blocks.length).toBe(1);
    expect(pages[0].blocks[0].paragraphs[0].words.length).toBe(2);
    expect(pages[0].blocks[0].boundingBox.x).toBeCloseTo(0.05);
  });

  it("multi-page answer spanning", () => {
    const blocks: any[] = [
      makeBlock({ BlockType: "PAGE", Page: 1 }),
      makeBlock({ BlockType: "PAGE", Page: 2 }),
      makeBlock({ BlockType: "LINE", Page: 1, Text: "Answer Q4 page1 line1", Geometry: { BoundingBox: { Left: 0.05, Top: 0.1, Width: 0.8, Height: 0.02 } } }),
      makeBlock({ BlockType: "LINE", Page: 1, Text: "continuation line2", Geometry: { BoundingBox: { Left: 0.05, Top: 0.13, Width: 0.8, Height: 0.02 } } }),
      makeBlock({ BlockType: "LINE", Page: 2, Text: "Q4 continued page2", Geometry: { BoundingBox: { Left: 0.05, Top: 0.05, Width: 0.8, Height: 0.02 } } }),
    ];
    const pages = normalizeTextractBlocks(blocks);
    expect(pages.length).toBe(2);
    expect(pages[0].text).toContain("Answer Q4");
    expect(pages[1].text).toContain("continued page2");
    expect(pages[0].blocks.length).toBeGreaterThan(0);
    expect(pages[1].blocks.length).toBeGreaterThan(0);
  });

  it("pagination: 39 pages worth of blocks ordered", () => {
    const blocks: any[] = [];
    for (let p = 1; p <= 39; p++) {
      blocks.push(makeBlock({ BlockType: "PAGE", Page: p }));
      blocks.push(makeBlock({ BlockType: "LINE", Page: p, Text: `Page ${p} line`, Geometry: { BoundingBox: { Left: 0.05, Top: 0.05, Width: 0.8, Height: 0.02 } } }));
    }
    // shuffle to test sorting
    const shuffled = blocks.slice().sort(() => Math.random() - 0.5);
    const pages = normalizeTextractBlocks(shuffled);
    expect(pages.length).toBe(39);
    expect(pages[0].pageNumber).toBe(1);
    expect(pages[38].pageNumber).toBe(39);
    expect(pages[5].text).toContain("Page 6");
  });

  it("out-of-order answer labels preserved", () => {
    const blocks: any[] = [
      makeBlock({ BlockType: "PAGE", Page: 1 }),
      makeBlock({ BlockType: "LINE", Page: 1, Text: "Q5 answer", Geometry: { BoundingBox: { Left: 0.05, Top: 0.05, Width: 0.5, Height: 0.02 } } }),
      makeBlock({ BlockType: "LINE", Page: 1, Text: "Q1 answer", Geometry: { BoundingBox: { Left: 0.05, Top: 0.1, Width: 0.5, Height: 0.02 } } }),
      makeBlock({ BlockType: "LINE", Page: 1, Text: "Q2 answer", Geometry: { BoundingBox: { Left: 0.05, Top: 0.15, Width: 0.5, Height: 0.02 } } }),
    ];
    const pages = normalizeTextractBlocks(blocks);
    expect(pages[0].blocks[0].paragraphs.length).toBeGreaterThan(0);
    // text order preserved by Top sorting
    expect(pages[0].text.indexOf("Q5")).toBeLessThan(pages[0].text.indexOf("Q1"));
  });

  it("unmatched/empty page handled", () => {
    const blocks: any[] = [makeBlock({ BlockType: "PAGE", Page: 1 })];
    const pages = normalizeTextractBlocks(blocks);
    expect(pages.length).toBe(1);
    expect(pages[0].text).toBe("");
    expect(pages[0].blocks.length).toBe(0);
  });

  it("bounding boxes normalized [0,1]", () => {
    const blocks: any[] = [
      makeBlock({ BlockType: "PAGE", Page: 1 }),
      makeBlock({ BlockType: "LINE", Page: 1, Text: "test", Geometry: { BoundingBox: { Left: 0.0, Top: 0.0, Width: 1.0, Height: 0.05 } } }),
      makeBlock({ BlockType: "LINE", Page: 1, Text: "test2", Geometry: { BoundingBox: { Left: 0.99, Top: 0.99, Width: 0.01, Height: 0.01 } } }),
    ];
    const pages = normalizeTextractBlocks(blocks);
    const b0 = pages[0].blocks[0].boundingBox;
    expect(b0.x).toBeGreaterThanOrEqual(0);
    expect(b0.y).toBeGreaterThanOrEqual(0);
    expect(b0.x + b0.width).toBeLessThanOrEqual(1.01);
    expect(b0.y + b0.height).toBeLessThanOrEqual(1.01);
  });

  it("confidence preserved and in [0,1]", () => {
    const blocks: any[] = [
      makeBlock({ BlockType: "PAGE", Page: 1, Confidence: 99 }),
      makeBlock({ BlockType: "LINE", Page: 1, Text: "low conf line", Confidence: 45, Geometry: { BoundingBox: { Left: 0.1, Top: 0.1, Width: 0.5, Height: 0.02 } } }),
    ];
    const pages = normalizeTextractBlocks(blocks);
    // block confidence is avg of lines /100 => 0.45
    expect(pages[0].blocks[0].confidence).toBeCloseTo(0.45);
  });

  it("handwriting faint/pencil handled as low confidence still preserved", () => {
    const blocks: any[] = [
      makeBlock({ BlockType: "PAGE", Page: 1 }),
      makeBlock({ BlockType: "LINE", Page: 1, Text: "faint pencil answer", Confidence: 30, Geometry: { BoundingBox: { Left: 0.1, Top: 0.1, Width: 0.5, Height: 0.02 } } }),
    ];
    const pages = normalizeTextractBlocks(blocks);
    expect(pages[0].text).toContain("faint");
    expect(pages[0].blocks[0].confidence).toBeLessThan(0.5);
  });

  it("word hierarchy fallback when Relationships missing", () => {
    const blocks: any[] = [
      makeBlock({ BlockType: "PAGE", Page: 1 }),
      makeBlock({ BlockType: "LINE", Page: 1, Text: "hello world", Geometry: { BoundingBox: { Left: 0.1, Top: 0.1, Width: 0.6, Height: 0.03 } } }),
    ];
    const pages = normalizeTextractBlocks(blocks);
    expect(pages[0].blocks[0].paragraphs[0].words.length).toBe(2);
    expect(pages[0].blocks[0].paragraphs[0].words[0].text).toBe("hello");
  });

  it("multiple regions per page", () => {
    const blocks: any[] = [
      makeBlock({ BlockType: "PAGE", Page: 1 }),
      makeBlock({ BlockType: "LINE", Page: 1, Text: "Q1 answer top", Geometry: { BoundingBox: { Left: 0.1, Top: 0.1, Width: 0.8, Height: 0.03 } } }),
      // gap >0.025 creates new block
      makeBlock({ BlockType: "LINE", Page: 1, Text: "Q2 answer middle", Geometry: { BoundingBox: { Left: 0.1, Top: 0.5, Width: 0.8, Height: 0.03 } } }),
    ];
    const pages = normalizeTextractBlocks(blocks);
    expect(pages[0].blocks.length).toBe(2);
  });
});
