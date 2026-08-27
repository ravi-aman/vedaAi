import { describe, it, expect } from "vitest";
import { segmentAnswersFromTextract } from "@/lib/structure/answer-segmentation";
import type { OcrDocumentResult } from "@/lib/ocr/types";
import type { DocumentPage } from "@/types";

function makePage(pageNumber: number, lines: { text: string; y?: number }[]): any {
  return {
    pageNumber,
    text: lines.map((l) => l.text).join("\n"),
    blocks: [],
    lines: lines.map((l, i) => ({
      text: l.text,
      boundingBox: { x: 0.05, y: l.y ?? 0.1 + i * 0.06, width: 0.9, height: 0.03 },
      confidence: 0.9,
      pageNumber,
    })),
    confidence: 0.9,
    width: 800,
    height: 1100,
    rotation: 0,
  };
}
function makeDoc(pages: any[]): OcrDocumentResult {
  return {
    jobId: "j1",
    documentId: "d1",
    kind: "answerSheet",
    pages,
    provider: "amazon-textract",
    providerVersion: "v1",
    operationId: "op",
    completedAt: new Date().toISOString(),
  };
}
function pagesMeta(count: number): DocumentPage[] {
  return Array.from({ length: count }, (_, i) => ({ id: `page-${i + 1}`, documentId: "d1", pageNumber: i + 1, width: 800, height: 1100, rotation: 0 }));
}

describe("answer-segmentation", () => {
  it("detects explicit labels Q1, Ans 1, 11(a)", () => {
    const ocr = makeDoc([makePage(1, [{ text: "Q1 The answer" }, { text: "Q2 Second" }, { text: "11(a) Third" }])]);
    const res = segmentAnswersFromTextract(ocr, pagesMeta(1));
    expect(res.map((r) => r.normalizedLabel)).toEqual(["1", "2", "11(a)"]);
  });

  it("handles out-of-order answers", () => {
    const ocr = makeDoc([makePage(1, [{ text: "Q5 Fifth" }, { text: "Q1 First" }, { text: "Q3 Third" }])]);
    const res = segmentAnswersFromTextract(ocr, pagesMeta(1));
    expect(res.map((r) => r.questionLabel)).toEqual(["Q5", "Q1", "Q3"]);
    expect(res[0].orderIndex).toBe(0);
    expect(res[1].orderIndex).toBe(1);
  });

  it("handles multi-page answer (Q4 spanning pages)", () => {
    const ocr = makeDoc([makePage(1, [{ text: "Q4 Start page1" }, { text: "continuation" }]), makePage(2, [{ text: "continued page2" }])]);
    const res = segmentAnswersFromTextract(ocr, pagesMeta(2));
    // Q4 should include continuation across pages without new label
    expect(res.length).toBe(1);
    expect(res[0].pageNumbers).toEqual([1, 2]);
    expect(res[0].bboxesByPage.size).toBe(2);
  });

  it("handles multiple boxes per answer (vertical continuity)", () => {
    const ocr = makeDoc([makePage(1, [{ text: "Q1 Answer line1" }, { text: "line2" }, { text: "line3" }])]);
    const res = segmentAnswersFromTextract(ocr, pagesMeta(1));
    expect(res[0].bboxesByPage.get(1)?.length).toBe(3);
  });

  it("filters untagged tiny segments are not split when continuation", () => {
    const ocr = makeDoc([makePage(1, [{ text: "Q1 Answer line" }, { text: "continuation line without label" }])]);
    const res = segmentAnswersFromTextract(ocr, pagesMeta(1));
    // Continuation without label should stay as one segment
    expect(res.length).toBe(1);
    expect(res[0].text).toContain("continuation");
  });
});
