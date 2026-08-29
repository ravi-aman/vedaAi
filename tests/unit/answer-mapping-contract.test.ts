import { describe, it, expect } from "vitest";
import { buildAnswerGraphV2 } from "@/lib/structure/answer-graph-builder";
import type { OcrDocumentResult } from "@/lib/ocr/types";

function makeOcr(pages: Array<{ pageNumber: number; lines: Array<{ text: string; x: number; y: number }> }>): OcrDocumentResult {
  return {
    jobId: "test-job",
    documentId: "test-doc",
    kind: "answerSheet",
    provider: "paddleocr",
    providerVersion: "PP-OCRv5",
    operationId: "test-op",
    completedAt: new Date().toISOString(),
    pages: pages.map((pg) => ({
      pageNumber: pg.pageNumber,
      text: pg.lines.map((l) => l.text).join("\n"),
      blocks: [],
      lines: pg.lines.map((l, idx) => ({
        text: l.text,
        boundingBox: { x: l.x, y: l.y, width: 0.3, height: 0.02 },
        confidence: 0.9,
        pageNumber: pg.pageNumber,
      })),
      confidence: 0.9,
      width: 1263,
      height: 893,
      rotation: 0,
    })),
  } as any;
}

describe("AnswerGroup suspectedQuestion contract", () => {
  it("AG with suspectedQuestion 3 must reach mapping as explicit label", async () => {
    const ocr = makeOcr([
      { pageNumber: 1, lines: [{ text: "Ans 3", x: 0.05, y: 0.1 }, { text: "answer body for Q3", x: 0.05, y: 0.15 }] },
    ]);
    const pages = [{ id: "p1", documentId: "d1", pageNumber: 1, width: 1263, height: 893, rotation: 0 } as any];
    const { groups } = buildAnswerGraphV2(ocr, pages, null);
    expect(groups.length).toBe(1);
    expect(groups[0].suspectedQuestion).toBe("3");
    expect(groups[0].normalizedLabel).toBe("3");

    // Simulate runner's asDetected mapping (data contract repair)
    const asDetected = {
      regions: groups.map((a: any) => ({
        questionLabel: a.suspectedQuestion || a.normalizedLabel || a.questionLabel || null,
        rawText: a.text,
        bboxesByPage: a.bboxesByPage,
        pageNumbers: a.pageNumbers,
        confidence: a.confidence,
        orderIndex: a.orderIndex,
        _segmented: a,
      })),
    };
    expect(asDetected.regions[0].questionLabel).toBe("3");

    // Simulate matching: Question 3 should match AG-3 via explicit label
    const q = { normalizedNumber: "3", id: "Q3" };
    const reg = asDetected.regions[0];
    expect(reg.questionLabel).toBe(q.normalizedNumber);
  });

  it("bare digit without label must not become suspectedQuestion", async () => {
    const ocr = makeOcr([
      { pageNumber: 1, lines: [{ text: "1", x: 0.5, y: 0.5 }] }, // bare 1 at center, not left margin
    ]);
    const pages = [{ id: "p1", documentId: "d1", pageNumber: 1, width: 1263, height: 893, rotation: 0 } as any];
    const { groups } = buildAnswerGraphV2(ocr, pages, null);
    // Bare digit at x 0.5 should not be strong label, so group should be untagged or filtered
    if (groups.length > 0) {
      expect(groups[0].suspectedQuestion).not.toBe("1");
    }
  });

  it("out-of-order answers preserve orderIndex", async () => {
    const ocr = makeOcr([
      {
        pageNumber: 1,
        lines: [
          { text: "Ans 7", x: 0.05, y: 0.1 },
          { text: "body7", x: 0.05, y: 0.15 },
          { text: "Ans 3", x: 0.05, y: 0.3 },
          { text: "body3", x: 0.05, y: 0.35 },
        ],
      },
    ]);
    const pages = [{ id: "p1", documentId: "d1", pageNumber: 1, width: 1263, height: 893, rotation: 0 } as any];
    const { groups } = buildAnswerGraphV2(ocr, pages, null);
    expect(groups.length).toBe(2);
    expect(groups[0].suspectedQuestion).toBe("7");
    expect(groups[1].suspectedQuestion).toBe("3");
    expect(groups[0].orderIndex).toBe(0);
    expect(groups[1].orderIndex).toBe(1);
  });
});
