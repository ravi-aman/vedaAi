import type { OcrDocumentResult, OcrPageResult } from "@/lib/ocr/types";
import type { DocumentPage } from "@/types";
import type { VisionDocumentAnalysis } from "./provider";

/**
 * Canonical Document Representation — provider-neutral
 * Every downstream stage consumes this, not raw Textract or Vision JSON.
 */
export interface CanonicalPage {
  pageNumber: number;
  pageId: string;
  dimensions: { width: number; height: number };
  rotation: number;
  lines: OcrPageResult["lines"];
  blocks: OcrPageResult["blocks"];
  text: string;
  confidence: number;
  visualRegions?: VisionDocumentAnalysis["pages"][number]["visualRegions"];
}

export interface CanonicalDocument {
  jobId: string;
  documentId: string;
  kind: "questionPaper" | "answerSheet";
  pages: CanonicalPage[];
  fullText: string;
  ocrProvider: string;
  ocrConfidence: number;
  visionEvidence?: VisionDocumentAnalysis | null;
  evidence: { type: string; source: string; score: number; explanation: string }[];
  pageCount: number;
  createdAt: string;
}

export function buildCanonicalDocument(
  ocr: OcrDocumentResult,
  pages: DocumentPage[],
  vision?: VisionDocumentAnalysis | null,
  jobId?: string
): CanonicalDocument {
  const pageByNumber = new Map<number, DocumentPage>();
  for (const p of pages) pageByNumber.set(p.pageNumber, p);

  const canonicalPages: CanonicalPage[] = ocr.pages
    .slice()
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((pg) => {
      const docPage = pageByNumber.get(pg.pageNumber);
      const visionPage = vision?.pages.find((v) => v.pageNumber === pg.pageNumber);
      return {
        pageNumber: pg.pageNumber,
        pageId: docPage?.id || `page-${pg.pageNumber}`,
        dimensions: { width: docPage?.width || pg.width || 800, height: docPage?.height || pg.height || 1100 },
        rotation: docPage?.rotation || pg.rotation || 0,
        lines: pg.lines || [],
        blocks: pg.blocks || [],
        text: pg.text || "",
        confidence: pg.confidence ?? 0.9,
        visualRegions: visionPage?.visualRegions,
      };
    });

  const fullText = canonicalPages.map((p) => p.text).join("\n\n");
  const ocrConfidence = canonicalPages.length ? canonicalPages.reduce((a, p) => a + p.confidence, 0) / canonicalPages.length : 0;

  const evidence: CanonicalDocument["evidence"] = [
    { type: "TEXTRACT_GEOMETRY", source: `textract-${ocr.operationId.slice(0, 8)}`, score: ocrConfidence, explanation: `Textract ${ocr.pages.length} pages, ${canonicalPages.reduce((a, p) => a + p.lines.length, 0)} lines` },
  ];
  if (vision) {
    evidence.push({ type: "VISION_STRUCTURE", source: `vision-${vision.pages.length}pages`, score: 0.75, explanation: `Vision ${vision.pages.length} pages analyzed` });
  }

  return {
    jobId: jobId || ocr.jobId,
    documentId: ocr.documentId,
    kind: ocr.kind,
    pages: canonicalPages,
    fullText,
    ocrProvider: ocr.provider,
    ocrConfidence,
    visionEvidence: vision || null,
    evidence,
    pageCount: canonicalPages.length,
    createdAt: new Date().toISOString(),
  };
}
