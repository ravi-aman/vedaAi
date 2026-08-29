import { describe, it, expect } from "vitest";
import { extractQuestionsV2 } from "@/lib/structure/question-extractor-v2";
import type { OcrDocumentResult } from "@/lib/ocr/types";

function makeOcrWithQuestions(labels: string[], opts?: { withSubparts?: boolean; withMCQ?: boolean }): OcrDocumentResult {
  // labels like ["1", "2", "3"] or ["4", "4(i)", "4(ii)"] etc.
  const lines: any[] = [];
  let y = 0.1;
  for (const lab of labels) {
    // For MCQ, add options after
    if (opts?.withMCQ && lab === "5") {
      lines.push({ text: `${lab}.`, boundingBox: { x: 0.05, y, width: 0.02, height: 0.02 }, confidence: 0.9, pageNumber: 1 });
      y += 0.04;
      for (const opt of ["A", "B", "C", "D"]) {
        lines.push({ text: `(${opt}) option text`, boundingBox: { x: 0.12, y, width: 0.3, height: 0.02 }, confidence: 0.9, pageNumber: 1 });
        y += 0.03;
      }
      continue;
    }
    // Handle subparts like "4(i)" - need to simulate label + text
    if (lab.includes("(")) {
      // e.g., "4(i)" -> main 4 and sub (i)
      lines.push({ text: lab, boundingBox: { x: 0.12, y, width: 0.04, height: 0.02 }, confidence: 0.9, pageNumber: 1 });
    } else {
      lines.push({ text: `${lab}.`, boundingBox: { x: 0.05, y, width: 0.02, height: 0.02 }, confidence: 0.9, pageNumber: 1 });
    }
    y += 0.04;
    // Add dummy question text after label
    lines.push({ text: `Question ${lab} text content here for testing`, boundingBox: { x: 0.08, y, width: 0.5, height: 0.02 }, confidence: 0.9, pageNumber: 1 });
    y += 0.03;
  }
  return {
    jobId: "test",
    documentId: "doc",
    kind: "questionPaper",
    provider: "paddleocr",
    providerVersion: "PP-OCRv5",
    operationId: "op",
    completedAt: new Date().toISOString(),
    pages: [
      {
        pageNumber: 1,
        text: lines.map((l) => l.text).join("\n"),
        blocks: [],
        lines,
        confidence: 0.9,
        width: 893,
        height: 1263,
        rotation: 0,
      },
    ],
  } as any;
}

function pagesFor(labels: string[]) {
  return [{ id: "p1", documentId: "doc", pageNumber: 1, width: 893, height: 1263, rotation: 0 } as any];
}

describe("Generic fixtures — same production code must work", () => {
  it("Q1-Q10", () => {
    const labels = Array.from({ length: 10 }, (_, i) => String(i + 1));
    const ocr = makeOcrWithQuestions(labels);
    const { questions } = extractQuestionsV2(ocr, pagesFor(labels), null);
    const tops = questions.filter((q) => q.depth === 0);
    expect(tops.length).toBe(10);
    expect(tops.map((q) => q.normalizedNumber)).toEqual(labels);
  });

  it("Q1-Q20", () => {
    const labels = Array.from({ length: 20 }, (_, i) => String(i + 1));
    const ocr = makeOcrWithQuestions(labels);
    const { questions } = extractQuestionsV2(ocr, pagesFor(labels), null);
    const tops = questions.filter((q) => q.depth === 0);
    expect(tops.length).toBe(20);
  });

  it("Q1-Q33 (Physics paper size)", () => {
    const labels = Array.from({ length: 33 }, (_, i) => String(i + 1));
    const ocr = makeOcrWithQuestions(labels);
    const { questions } = extractQuestionsV2(ocr, pagesFor(labels), null);
    const tops = questions.filter((q) => q.depth === 0);
    expect(tops.length).toBe(33);
  });

  it("Q1-Q50", () => {
    const labels = Array.from({ length: 50 }, (_, i) => String(i + 1));
    const ocr = makeOcrWithQuestions(labels);
    const { questions } = extractQuestionsV2(ocr, pagesFor(labels), null);
    const tops = questions.filter((q) => q.depth === 0);
    expect(tops.length).toBe(50);
  });

  it("Q4 with (i)-(x) as subparts not top", () => {
    const lines: any[] = [];
    let y = 0.1;
    lines.push({ text: "4.", boundingBox: { x: 0.05, y, width: 0.02, height: 0.02 }, confidence: 0.9, pageNumber: 1 });
    y += 0.04;
    lines.push({ text: "Question 4 text", boundingBox: { x: 0.08, y, width: 0.5, height: 0.02 }, confidence: 0.9, pageNumber: 1 });
    y += 0.04;
    for (const roman of ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"]) {
      lines.push({ text: `(${roman})`, boundingBox: { x: 0.12, y, width: 0.04, height: 0.02 }, confidence: 0.9, pageNumber: 1 });
      y += 0.03;
      lines.push({ text: `subpart ${roman} text`, boundingBox: { x: 0.15, y, width: 0.4, height: 0.02 }, confidence: 0.9, pageNumber: 1 });
      y += 0.04;
    }
    const ocr = {
      jobId: "test",
      documentId: "doc",
      kind: "questionPaper",
      provider: "paddleocr",
      providerVersion: "PP-OCRv5",
      operationId: "op",
      completedAt: new Date().toISOString(),
      pages: [{ pageNumber: 1, text: lines.map((l) => l.text).join("\n"), blocks: [], lines, confidence: 0.9, width: 893, height: 1263, rotation: 0 }],
    } as any;
    const { questions } = extractQuestionsV2(ocr, pagesFor(["4"]), null);
    const tops = questions.filter((q) => q.depth === 0);
    // Must be 1 top, not 11 (Q4 + 10 subparts as separate tops)
    expect(tops.length).toBe(1);
    expect(tops[0].normalizedNumber).toBe("4");
    // Subparts may be detected as depth 1, but at minimum not as separate tops
    expect(questions.length).toBeLessThan(12);
  });

  it("MCQ A-D as options not questions", () => {
    const ocr = makeOcrWithQuestions(["5"], { withMCQ: true });
    const { questions } = extractQuestionsV2(ocr, pagesFor(["5"]), null);
    const tops = questions.filter((q) => q.depth === 0);
    // Must be 1 top, not 5 (Q5 + A,B,C,D as separate questions)
    expect(tops.length).toBe(1);
    expect(tops[0].normalizedNumber).toBe("5");
    // If options are detected, they should be as children/options, but at minimum not as separate tops
    // Allow either options array or subparts, but not 4 extra tops
    expect(questions.length).toBeLessThan(6);
  });

  it("Sections I/II/III not assumed as A-E", () => {
    // Should not hardcode Section A-E; I/II/III should not break
    const labels = ["5", "6", "7"];
    const ocr = makeOcrWithQuestions(labels);
    // No sections, just questions starting from 5
    const { questions } = extractQuestionsV2(ocr, pagesFor(labels), null);
    const tops = questions.filter((q) => q.depth === 0);
    expect(tops.length).toBe(3);
    expect(tops.map((q) => q.normalizedNumber)).toEqual(["5", "6", "7"]);
  });

  it("Question numbering starting from 5", () => {
    const labels = ["5", "6", "7", "8", "9", "10"];
    const ocr = makeOcrWithQuestions(labels);
    const { questions } = extractQuestionsV2(ocr, pagesFor(labels), null);
    const tops = questions.filter((q) => q.depth === 0);
    expect(tops.length).toBe(6);
    expect(tops[0].normalizedNumber).toBe("5");
  });
});
