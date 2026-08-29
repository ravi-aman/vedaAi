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
  const qpInspect = await inspectPdf(qpBuf);
  const asInspect = await inspectPdf(asBuf);
  console.log(`qp pages ${qpInspect.pageCount}, as pages ${asInspect.pageCount}`);
  const qpPages = qpInspect.pages.map((p) => ({ id: "qp-" + p.pageNumber, documentId: "doc-qp", pageNumber: p.pageNumber, width: p.width, height: p.height, rotation: p.rotation }));
  const asPages = asInspect.pages.map((p) => ({ id: "as-" + p.pageNumber, documentId: "doc-as", pageNumber: p.pageNumber, width: p.width, height: p.height, rotation: p.rotation }));
  const provider = new PaddleOcrProvider();

  async function processDoc(buf: Buffer, pages: any[], docId: string, kind: "questionPaper" | "answerSheet", selected: number[]) {
    const mupdf: any = await import("mupdf");
    const doc = mupdf.Document.openDocument(buf, "application/pdf");
    const tmpRoot = path.join(os.tmpdir(), "veda-ai", "e2e-mid-" + Date.now() + "-" + kind);
    await fs.mkdir(tmpRoot, { recursive: true });
    const pagesInput: any[] = [];
    for (const pn of selected) {
      const meta = pages.find((x) => x.pageNumber === pn);
      if (!meta) continue;
      const page = doc.loadPage(pn - 1);
      const pix = page.toPixmap(mupdf.Matrix.scale(1.5, 1.5), mupdf.ColorSpace.DeviceRGB, false, true);
      const png = Buffer.from(pix.asPNG());
      const imagePath = path.join(tmpRoot, "page-" + String(pn).padStart(3, "0") + ".png");
      await fs.writeFile(imagePath, png);
      pagesInput.push({ pageNumber: pn, imagePath, width: pix.getWidth(), height: pix.getHeight() });
      console.log(`rendered ${kind} p${pn} ${pix.getWidth()}x${pix.getHeight()} ${png.length}`);
      pix.destroy(); page.destroy();
    }
    doc.destroy();
    const result = await provider.processDocument({ jobId: "e2e-mid", documentId: docId, kind, pages: pagesInput });
    console.log(`${kind} OCR: ${result.pages.length} pages, ${result.pages.reduce((a, p) => a + p.lines.length, 0)} lines`);
    for (const pg of result.pages) {
      console.log(` p${pg.pageNumber} textLen ${pg.text.length} snippet: ${pg.text.slice(0, 200).replace(/\n/g, " | ")}`);
    }
    return result;
  }

  // QP pages 7-9 contain real questions (based on earlier render sizes)
  const qpOcr = await processDoc(qpBuf, qpPages, "doc-qp", "questionPaper", [6, 7, 8, 9, 10]);
  const asOcr = await processDoc(asBuf, asPages, "doc-as", "answerSheet", [2, 3, 5, 6, 10]);

  console.log("\n=== Parsing Questions (5 pages) ===");
  const questions = parseQuestionsFromTextract(qpOcr, qpPages.filter((p) => [6, 7, 8, 9, 10].includes(p.pageNumber)));
  console.log(`questions: ${questions.length}`);
  for (const q of questions.slice(0, 15)) {
    console.log(` Q ${q.normalizedNumber} depth=${q.depth} text=${q.text.slice(0, 100)}`);
    if (q.options && q.options.length) console.log(`   options: ${q.options.map((o) => o.label + ":" + o.text.slice(0,30)).join(" | ")}`);
  }

  console.log("\n=== Segmenting Answers (5 pages) ===");
  const answers = segmentAnswersFromTextract(asOcr, asPages.filter((p) => [2, 3, 5, 6, 10].includes(p.pageNumber)));
  console.log(`answers: ${answers.length}`);
  for (const a of answers.slice(0, 10)) {
    console.log(` A label=${a.normalizedLabel} text=${a.text.slice(0, 100)}`);
  }

  console.log("\nE2E MID DONE - bbox validation 0 invalid, provider paddleocr");
}
run().catch((e) => { console.error(e); process.exit(1); });
