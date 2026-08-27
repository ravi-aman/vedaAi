import { NextRequest, NextResponse } from "next/server";
import { jobStore } from "@/lib/storage";
import { ocrResultStore } from "@/lib/jobs/runner";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await jobStore.get(jobId);
  if (!job) return NextResponse.json({ error: "Job not found", code: "JOB_NOT_FOUND" }, { status: 404 });

  const mem = ocrResultStore.get(jobId);
  // Try reading dumped files as well
  const safe = jobId.replace(/[^a-zA-Z0-9-]/g, "");
  const debugDir = path.join(os.tmpdir(), "veda-ai", safe, "debug");
  const artDir = path.join(process.cwd(), "artifacts", "ocr-debug", safe);
  let files: Record<string, string> = {};
  for (const dir of [debugDir, artDir]) {
    try {
      const qp = path.join(dir, "questionPaper-textract.json");
      const as = path.join(dir, "answerSheet-textract.json");
      try {
        await fs.access(qp);
        files[`file_${dir.includes("artifacts") ? "artifacts" : "tmp"}_questionPaper`] = qp;
      } catch {}
      try {
        await fs.access(as);
        files[`file_${dir.includes("artifacts") ? "artifacts" : "tmp"}_answerSheet`] = as;
      } catch {}
    } catch {}
  }

  // Build summary
  const summary = {
    jobId,
    ocrProvider: (process.env.OCR_PROVIDER || "textract"),
    qpOcr: mem?.qpOcr ? { pages: mem.qpOcr.pages.length, totalLines: mem.qpOcr.pages.reduce((a, p) => a + p.lines.length, 0), samplePage: mem.qpOcr.pages[0] } : null,
    asOcr: mem?.asOcr ? { pages: mem.asOcr.pages.length, totalLines: mem.asOcr.pages.reduce((a, p) => a + p.lines.length, 0), samplePage: mem.asOcr.pages[0] } : null,
    fullQpOcr: mem?.qpOcr || null,
    fullAsOcr: mem?.asOcr || null,
    debugFiles: files,
    format: {
      OcrDocumentResult: "{ jobId, documentId, kind, pages: OcrPageResult[], provider, operationId }",
      OcrPageResult: "{ pageNumber, text (joined lines), lines: OcrLine[], blocks: OcrBlock[], confidence, width, height }",
      OcrLine: "{ text, boundingBox:{x,y,width,height} 0..1, confidence, pageNumber }",
      OcrBlock: "{ boundingBox, paragraphs:[{boundingBox, words:[{text,boundingBox,confidence}]}], confidence }",
    },
  };

  // If ?download=questionPaper or answerSheet, return raw file
  const url = new URL(req.url);
  const download = url.searchParams.get("download");
  if (download === "questionPaper" && mem?.qpOcr) {
    return new NextResponse(JSON.stringify(mem.qpOcr, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${jobId}-questionPaper-textract.json"` } });
  }
  if (download === "answerSheet" && mem?.asOcr) {
    return new NextResponse(JSON.stringify(mem.asOcr, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${jobId}-answerSheet-textract.json"` } });
  }

  return NextResponse.json(summary);
}
