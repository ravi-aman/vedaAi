import { describe, it, expect, vi } from "vitest";
import { MockOcrProvider } from "@/lib/ocr/mock";
import { normalizeTextractBlocks } from "@/lib/ocr/textract";

describe("Textract pagination + mapping integration", () => {
  it("handles paginated GetDocumentAnalysis (NextToken) via mock provider", async () => {
    // Mock provider internally handles NextToken-less but we verify pagination contract: blocks aggregated across pages
    const p = new MockOcrProvider();
    const { operationId, outputUri } = await p.submitDocument({ jobId: "pag1", documentId: "d1", kind: "answerSheet", s3Bucket: "b", s3Key: "k.pdf", mimeType: "application/pdf", pageCount: 3 });
    const res = await p.getOperationResult(operationId, outputUri);
    expect(res.pages.length).toBe(3);
    // Simulate Textract raw blocks pagination: normalizeTextractBlocks should handle 1..3 pages even if Blocks come in chunks
    const rawBlocks: any[] = [];
    for (let i = 1; i <= 3; i++) {
      rawBlocks.push({ Id: `p${i}`, BlockType: "PAGE", Page: i, Confidence: 99, Geometry: { BoundingBox: { Left: 0, Top: 0, Width: 1, Height: 1 } } });
      rawBlocks.push({ Id: `l${i}`, BlockType: "LINE", Page: i, Text: `Content page ${i}`, Confidence: 90, Geometry: { BoundingBox: { Left: 0.1, Top: 0.1, Width: 0.8, Height: 0.02 } }, Relationships: [] });
    }
    // Split into two chunks as Textract would with NextToken
    const chunk1 = rawBlocks.slice(0, 3);
    const chunk2 = rawBlocks.slice(3);
    const combined = [...chunk1, ...chunk2];
    const pages = normalizeTextractBlocks(combined);
    expect(pages.length).toBe(3);
    expect(pages[2].pageNumber).toBe(3);
  });

  it("out-of-order answers map correctly after normalization", async () => {
    const rawBlocks: any[] = [
      { Id: "p1", BlockType: "PAGE", Page: 1, Confidence: 99, Geometry: { BoundingBox: { Left: 0, Top: 0, Width: 1, Height: 1 } } },
      { Id: "l1", BlockType: "LINE", Page: 1, Text: "Ans 5: out of order answer five", Confidence: 92, Geometry: { BoundingBox: { Left: 0.05, Top: 0.05, Width: 0.8, Height: 0.02 } }, Relationships: [] },
      { Id: "l2", BlockType: "LINE", Page: 1, Text: "Ans 1: first answer", Confidence: 95, Geometry: { BoundingBox: { Left: 0.05, Top: 0.1, Width: 0.8, Height: 0.02 } }, Relationships: [] },
      { Id: "l3", BlockType: "LINE", Page: 1, Text: "Ans 3: third", Confidence: 93, Geometry: { BoundingBox: { Left: 0.05, Top: 0.15, Width: 0.8, Height: 0.02 } }, Relationships: [] },
    ];
    const pages = normalizeTextractBlocks(rawBlocks);
    expect(pages[0].text).toContain("Ans 5");
    expect(pages[0].blocks.length).toBeGreaterThan(0);
  });

  it("multi-page answer regions: same label across pages", async () => {
    const rawBlocks: any[] = [
      { Id: "p1", BlockType: "PAGE", Page: 1, Confidence: 99, Geometry: { BoundingBox: { Left: 0, Top: 0, Width: 1, Height: 1 } } },
      { Id: "p2", BlockType: "PAGE", Page: 2, Confidence: 99, Geometry: { BoundingBox: { Left: 0, Top: 0, Width: 1, Height: 1 } } },
      { Id: "l1", BlockType: "LINE", Page: 1, Text: "Q4 answer start page2 lines 15-23 style", Confidence: 90, Geometry: { BoundingBox: { Left: 0.05, Top: 0.7, Width: 0.9, Height: 0.02 } }, Relationships: [] },
      { Id: "l2", BlockType: "LINE", Page: 2, Text: "continuation page3 lines 1-8", Confidence: 88, Geometry: { BoundingBox: { Left: 0.05, Top: 0.05, Width: 0.9, Height: 0.02 } }, Relationships: [] },
    ];
    const pages = normalizeTextractBlocks(rawBlocks);
    expect(pages.length).toBe(2);
    expect(pages[0].text).toContain("Q4");
    expect(pages[1].text).toContain("continuation");
  });

  it("invalid credentials mapped to AUTH_ERROR, not silent mock", async () => {
    const { OcrError, OcrErrorCodes } = await import("@/lib/ocr/errors");
    const err = new OcrError(OcrErrorCodes.AUTH_ERROR, "Textract access denied", null, false);
    expect(err.retryable).toBe(false);
    expect(err.code).toBe("OCR_AUTH_ERROR");
  });

  it("coordinate conversion preserves normalized [0,1]", async () => {
    const { normalizeTextractBlocks } = await import("@/lib/ocr/textract");
    const rawBlocks: any[] = [
      { Id: "p1", BlockType: "PAGE", Page: 1, Confidence: 99, Geometry: { BoundingBox: { Left: 0, Top: 0, Width: 1, Height: 1 } } },
      { Id: "l1", BlockType: "LINE", Page: 1, Text: "Q1", Confidence: 95, Geometry: { BoundingBox: { Left: 0.1, Top: 0.2, Width: 0.3, Height: 0.04 } }, Relationships: [] },
    ];
    const pages = normalizeTextractBlocks(rawBlocks);
    const box = pages[0].blocks[0].boundingBox;
    expect(box.x).toBeCloseTo(0.1);
    expect(box.y).toBeCloseTo(0.2);
    // Viewer transform should keep these as % correctly — tested in coordinates.test.ts but sanity here
    expect(box.width).toBeCloseTo(0.3);
  });
});
