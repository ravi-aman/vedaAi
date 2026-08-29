import { segmentAnswersFromTextract } from '@/lib/structure/answer-segmentation';
function makePage(pageNumber: number, lines: { text: string; x?: number; y?: number }[]): any {
  return {
    pageNumber,
    text: lines.map((l) => l.text).join("\n"),
    blocks: [],
    lines: lines.map((l, i) => ({
      text: l.text,
      boundingBox: { x: l.x ?? 0.05, y: l.y ?? 0.1 + i * 0.06, width: 0.9, height: 0.03 },
      confidence: 0.9,
      pageNumber,
    })),
    confidence: 0.9,
    width: 800,
    height: 1100,
    rotation: 0,
  };
}
function makeDoc(pages: any[]): any {
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
function pagesMeta(count: number): any[] {
  return Array.from({ length: count }, (_, i) => ({ id: `page-${i + 1}`, documentId: "d1", pageNumber: i + 1, width: 800, height: 1100, rotation: 0 }));
}
const ocr = makeDoc([
  makePage(1, [{ text: "Ans 1" }, { text: "answer1 with substantial content that is definitely longer than eighty characters to be considered substantial for the test case", y: 0.2 }]),
  makePage(2, [{ text: "Rough work equation here more than twenty chars", y: 0.12 }]),
]);
const res = segmentAnswersFromTextract(ocr, pagesMeta(2));
console.log('res length', res.length);
res.forEach((r,i)=> console.log(i, r.normalizedLabel, r.pageNumbers, r.text.slice(0,30)));
