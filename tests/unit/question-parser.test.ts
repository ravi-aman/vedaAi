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

  it("regression: generic header garble filtered without paper literals", () => {
    const ocr = makeDoc([
      makePage(1, [
        { text: "4807, D_D", x: 0.7, y: 0.03 }, // generic garble in header band
        { text: "1 Real question text here with sufficient length for validation" },
      ]),
    ]);
    const res = parseQuestionsFromTextract(ocr, pagesMeta(1));
    expect(res.length).toBe(1);
    expect(res[0].normalizedNumber).toBe("1");
  });

  it("regression: MCQ with long mathematical options stays as one question with options", () => {
    const longOpt = "A".repeat(250);
    const ocr = makeDoc([
      makePage(1, [
        { text: "5 Which of the following is correct? This is a longer question stem with math" },
        { text: `(A) ${longOpt}`, x: 0.12, y: 0.2 },
        { text: "(B) Short option B", x: 0.12, y: 0.26 },
        { text: "(C) Short option C", x: 0.12, y: 0.32 },
        { text: "(D) Short option D", x: 0.12, y: 0.38 },
        { text: "6 Next question after MCQ", x: 0.05, y: 0.48 },
      ]),
    ]);
    const res = parseQuestionsFromTextract(ocr, pagesMeta(1));
    // Should be 2 top-level questions, not 6 (options not promoted)
    const top = res.filter((r) => r.depth === 0);
    expect(top.map((r) => r.normalizedNumber)).toEqual(["5", "6"]);
    const q5 = res.find((r) => r.normalizedNumber === "5");
    expect(q5?.options?.length).toBe(4);
    expect(q5?.options?.[0].label).toBe("A");
  });

  it("regression: subparts 22 (i)(ii)(iii) nested under 22", () => {
    const ocr = makeDoc([
      makePage(1, [
        { text: "22 Case study question with introduction text long enough" },
        { text: "(i) First subpart text here sufficiently long", x: 0.1, y: 0.2 },
        { text: "(ii) Second subpart text here", x: 0.1, y: 0.25 },
        { text: "(iii) Third subpart text", x: 0.1, y: 0.30 },
      ]),
    ]);
    const res = parseQuestionsFromTextract(ocr, pagesMeta(1));
    expect(res.find((r) => r.normalizedNumber === "22")).toBeDefined();
    expect(res.find((r) => r.normalizedNumber === "22(i)")?.parent).toBe("22");
    expect(res.find((r) => r.normalizedNumber === "22(ii)")?.parent).toBe("22");
    expect(res.find((r) => r.normalizedNumber === "22(iii)")?.parent).toBe("22");
    expect(res.find((r) => r.normalizedNumber === "22(i)")?.depth).toBe(1);
  });

  it("regression: instruction phrases never become questions", () => {
    const ocr = makeDoc([
      makePage(1, [
        { text: "General Instructions: This paper contains ..." },
        { text: "1 Real question" },
        { text: "All Questions are compulsory." },
        { text: "2 Second real question" },
      ]),
    ]);
    const res = parseQuestionsFromTextract(ocr, pagesMeta(1));
    expect(res.map((r) => r.normalizedNumber)).toEqual(["1", "2"]);
  });
});
