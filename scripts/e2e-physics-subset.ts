// @ts-nocheck
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { inspectPdf } from "@/lib/documents/pdf";
import { PaddleOcrProvider } from "@/lib/ocr/paddle-provider";
import { parseQuestionsFromTextract } from "@/lib/structure/question-parser";
import { segmentAnswersFromTextract } from "@/lib/structure/answer-segmentation";

async function run() {
  process.env.OCR_PROVIDER = "local";
  const qpBuf = await fs.readFile("E:/vedaAi/Quetion_paper_Physics_1.pdf");
  const asBuf = await fs.readFile("E:/vedaAi/handwrittern_answer_sheet_physics_1.pdf");
  console.log("QP", qpBuf.length, "AS", asBuf.length);
  const qpInspect = await inspectPdf(qpBuf);
  const asInspect = await inspectPdf(asBuf);
  console.log("qp pages", qpInspect.pageCount, "as pages", asInspect.pageCount);
  const qpPages = qpInspect.pages.map((p) => ({ id: "qp-" + p.pageNumber, documentId: "doc-qp", pageNumber: p.pageNumber, width: p.width, height: p.height, rotation: p.rotation }));
  const asPages = asInspect.pages.map((p) => ({ id: "as-" + p.pageNumber, documentId: "doc-as", pageNumber: p.pageNumber, width: p.width, height: p.height, rotation: p.rotation }));
  const provider = new PaddleOcrProvider();
  async function processDoc(buf: Buffer, pages: any[], docId: string, kind: "questionPaper" | "answerSheet") {
    const mupdf: any = await import("mupdf");
    const doc = mupdf.Document.openDocument(buf, "application/pdf");
    const tmpRoot = path.join(os.tmpdir(), "veda-ai", "e2e-" + Date.now() + "-" + kind);
    await fs.mkdir(tmpRoot, { recursive: true });
    const pagesInput: any[] = [];
    for (const p of pages.slice(0, 3)) {
      const page = doc.loadPage(p.pageNumber - 1);
      const pix = page.toPixmap(mupdf.Matrix.scale(1.5, 1.5), mupdf.ColorSpace.DeviceRGB, false, true);
      const png = Buffer.from(pix.asPNG());
      const imagePath = path.join(tmpRoot, "page-" + String(p.pageNumber).padStart(3, "0") + ".png");
      await fs.writeFile(imagePath, png);
      pagesInput.push({ pageNumber: p.pageNumber, imagePath, width: pix.getWidth(), height: pix.getHeight() });
      pix.destroy();
      page.destroy();
    }
    doc.destroy();
    console.log("rendered " + kind + " pages", pagesInput.length);
    const result = await provider.processDocument({ jobId: "e2e-test", documentId: docId, kind, pages: pagesInput });
    console.log(kind + " OCR pages", result.pages.length, "lines", result.pages.reduce((a: number, p: any) => a + p.lines.length, 0));
    console.log(kind + " first page text snippet", result.pages[0].text.slice(0, 300).replace(/\n/g, " | "));
    // Check bbox validation
    let invalid = 0;
    for (const pg of result.pages) for (const l of pg.lines) {
      const b = l.boundingBox;
      if (b.x < 0 || b.y < 0 || b.x + b.width > 1.01 || b.y + b.height > 1.01 || b.width <= 0 || b.height <= 0) invalid++;
    }
    console.log(kind + " invalid boxes", invalid);
    return result;
  }
  const qpOcr = await processDoc(qpBuf, qpPages, "doc-qp", "questionPaper");
  const asOcr = await processDoc(asBuf, asPages, "doc-as", "answerSheet");
  console.log("Parsing questions...");
  const questions = parseQuestionsFromTextract(qpOcr, qpPages.slice(0, 3));
  console.log("questions", questions.length);
  for (let i = 0; i < Math.min(10, questions.length); i++) {
    console.log(" Q", questions[i].normalizedNumber, questions[i].text.slice(0, 80));
  }
  console.log("Segmenting answers...");
  const answers = segmentAnswersFromTextract(asOcr, asPages.slice(0, 3));
  console.log("answers", answers.length);
  for (let i = 0; i < Math.min(10, answers.length); i++) {
    console.log(" A", answers[i].normalizedLabel, answers[i].text.slice(0, 80));
  }
  console.log("E2E subset DONE");
}
run().catch((e) => { console.error(e); process.exit(1); });
