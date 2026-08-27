import { describe, it, expect } from "vitest";
import { parseQuestionsFromTextract } from "@/lib/structure/question-parser";
import type { OcrDocumentResult } from "@/lib/ocr/types";
import type { DocumentPage } from "@/types";

function makePage(pageNumber: number, lines: { text: string; x?: number; y?: number }[]): any {
  return {
    pageNumber,
    text: lines.map((l) => l.text).join("\n"),
    blocks: [],
    lines: lines.map((l, i) => ({
      text: l.text,
      boundingBox: { x: l.x ?? 0.05, y: l.y ?? 0.1 + i * 0.05, width: 0.9, height: 0.03 },
      confidence: 0.95,
      pageNumber,
    })),
    confidence: 0.95,
    width: 800,
    height: 1100,
    rotation: 0,
  };
}

function makeDoc(pages: any[]): OcrDocumentResult {
  return {
    jobId: "j1",
    documentId: "d1",
    kind: "questionPaper",
    pages,
    provider: "amazon-textract",
    providerVersion: "v1",
    operationId: "op",
    completedAt: new Date().toISOString(),
  };
}

function pagesMeta(count: number): DocumentPage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `page-${i + 1}`,
    documentId: "d1",
    pageNumber: i + 1,
    width: 800,
    height: 1100,
    rotation: 0,
  }));
}

describe("question-parser", () => {
  it("supports 1,2,3 and Q1/Q2/Question 1", () => {
    const ocr = makeDoc([
      makePage(1, [{ text: "1 What is photosynthesis?" }, { text: "2 Solve x^2" }, { text: "Q3 Explain" }, { text: "Question 4 Describe" }]),
    ]);
    const res = parseQuestionsFromTextract(ocr, pagesMeta(1));
    expect(res.map((r) => r.normalizedNumber)).toEqual(["1", "2", "3", "4"]);
    expect(res[0].rawNumber).toBe("1");
    expect(res[2].rawNumber).toBe("Q3");
  });

  it("preserves 11(a) 11(b) distinct", () => {
    const ocr = makeDoc([makePage(1, [{ text: "11(a) Define Act" }, { text: "11(b) Explain" }, { text: "12 What is ..." }])]);
    const res = parseQuestionsFromTextract(ocr, pagesMeta(1));
    expect(res.map((r) => r.normalizedNumber)).toEqual(["11(a)", "11(b)", "12"]);
    expect(res[0].rawNumber).toBe("11(a)");
  });

  it("supports 11 (a) with space and 11(a)(i)", () => {
    const ocr = makeDoc([makePage(1, [{ text: "11 (a) Define" }, { text: "11(a)(i) Subpart" }])]);
    const res = parseQuestionsFromTextract(ocr, pagesMeta(1));
    expect(res[0].normalizedNumber).toBe("11(a)");
    expect(res[1].normalizedNumber).toBe("11(a)(i)");
  });

  it("handles multi-line questions", () => {
    const ocr = makeDoc([makePage(1, [{ text: "1 What is photosynthesis?" }, { text: "Explain the process in detail." }, { text: "2 Next question" }])]);
    const res = parseQuestionsFromTextract(ocr, pagesMeta(1));
    expect(res[0].text).toContain("Explain the process");
    expect(res[0].pageNumbers).toEqual([1]);
  });

  it("handles questions spanning pages", () => {
    const ocr = makeDoc([
      makePage(1, [{ text: "1 What is long question that" }, { text: "continues on next page" }]),
      makePage(2, [{ text: "continued text here" }, { text: "2 Next" }]),
    ]);
    const res = parseQuestionsFromTextract(ocr, pagesMeta(2));
    expect(res[0].pageNumbers).toContain(1);
    // Text should include continued
    expect(res[0].text).toContain("continued");
    expect(res[1].normalizedNumber).toBe("2");
  });

  it("preserves original numbering (does not renumber 11(a) to 1)", () => {
    const ocr = makeDoc([makePage(1, [{ text: "11(a) First" }, { text: "11(b) Second" }])]);
    const res = parseQuestionsFromTextract(ocr, pagesMeta(1));
    expect(res[0].normalizedNumber).toBe("11(a)");
    expect(res[1].normalizedNumber).toBe("11(b)");
  });

  it("extracts marks", () => {
    const ocr = makeDoc([makePage(1, [{ text: "1 What is ... (3 marks)" }])]);
    const res = parseQuestionsFromTextract(ocr, pagesMeta(1));
    expect(res[0].marks).toBe(3);
  });

  it("handles two-column reading order", () => {
    const ocr = makeDoc([
      makePage(1, [
        { text: "1 Left column Q", x: 0.05, y: 0.1 },
        { text: "2 Right column Q", x: 0.55, y: 0.1 },
        { text: "3 Left second", x: 0.05, y: 0.2 },
        { text: "4 Right second", x: 0.55, y: 0.2 },
      ]),
    ]);
    const res = parseQuestionsFromTextract(ocr, pagesMeta(1));
    // Two-column: left column fully then right
    expect(res.map((r) => r.normalizedNumber)).toEqual(["1", "3", "2", "4"]);
  });
});
