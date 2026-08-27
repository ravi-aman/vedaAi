import type { OcrDocumentResult } from "@/lib/ocr/types";
import type { DocumentPage } from "@/types";
import type { VisionDocumentAnalysis } from "./provider";
import { buildCanonicalDocument, type CanonicalDocument } from "./canonical";
import { normalizeNumber } from "@/lib/structure/numbering";

/**
 * Fusion Layer — reconciles Textract evidence + Vision evidence + geometry
 * Explicit, not concatenation. Vision is evidence-only; coordinates are grounded to Textract.
 */

export interface FusionResult {
  canonical: CanonicalDocument;
  questionHintsFromVision: { rawLabel: string; normalized: string; confidence: number; pageNumber: number }[];
  answerHintsFromVision: { labelHint: string; normalized: string; confidence: number; pageNumber: number; isDiagram: boolean }[];
  diagramPages: number[];
  instructionRegions: { pageNumber: number; description: string }[];
  evidence: { type: string; source: string; score: number; explanation: string }[];
  warnings: string[];
}

export function fuseDocuments(
  ocr: OcrDocumentResult,
  pages: DocumentPage[],
  vision: VisionDocumentAnalysis | null | undefined,
  jobId?: string
): FusionResult {
  const canonical = buildCanonicalDocument(ocr, pages, vision || null, jobId);
  const warnings: string[] = [];
  const evidence: FusionResult["evidence"] = [...canonical.evidence];

  const questionHints: FusionResult["questionHintsFromVision"] = [];
  const answerHints: FusionResult["answerHintsFromVision"] = [];
  const diagramPages: number[] = [];
  const instructionRegions: { pageNumber: number; description: string }[] = [];

  if (vision) {
    for (const vp of vision.pages) {
      // Validate Vision labels against Textract geometry — do not blindly trust coarseBox
      for (const qc of vp.questionCandidates || []) {
        let normalized = "";
        try {
          normalized = normalizeNumber(qc.rawLabel).normalized;
        } catch {
          normalized = qc.rawLabel;
        }
        // Check if Textract actually has a line with similar label (grounding)
        const hasGrounding = canonical.pages.some((cp) =>
          cp.lines.some((l) => l.text.toLowerCase().includes(qc.rawLabel.toLowerCase().slice(0, 3)) || l.text.trim().toLowerCase().startsWith(qc.rawLabel.toLowerCase().replace(/\s+/g, "")))
        );
        if (!hasGrounding) {
          warnings.push(`Vision label ${qc.rawLabel} page ${vp.pageNumber} has no Textract grounding — kept as REVIEW evidence, not coordinate`);
          evidence.push({ type: "VISION_UNGROUNDED_LABEL", source: `vision-page-${vp.pageNumber}`, score: qc.confidence * 0.5, explanation: `Vision ${qc.rawLabel} not found in Textract lines` });
        }
        questionHints.push({ rawLabel: qc.rawLabel, normalized, confidence: hasGrounding ? qc.confidence : qc.confidence * 0.5, pageNumber: vp.pageNumber });
      }
      for (const ah of vp.answerGroupHints || []) {
        let normalized = ah.labelHint;
        try {
          if (ah.labelHint) normalized = normalizeNumber(ah.labelHint).normalized;
        } catch {}
        answerHints.push({ labelHint: ah.labelHint, normalized, confidence: ah.confidence, pageNumber: vp.pageNumber, isDiagram: !!ah.isDiagram });
        if (ah.isDiagram) diagramPages.push(vp.pageNumber);
      }
      for (const vr of vp.visualRegions || []) {
        if (vr.type === "DIAGRAM" || vr.type === "FIGURE") diagramPages.push(vp.pageNumber);
        if (vr.type === "INSTRUCTION" || vr.type === "SECTION_HEADER") {
          instructionRegions.push({ pageNumber: vp.pageNumber, description: vr.description });
        }
      }
    }
    // Deduplicate
    const uniqDiagrams = [...new Set(diagramPages)].sort((a, b) => a - b);
    diagramPages.length = 0;
    diagramPages.push(...uniqDiagrams);
    evidence.push({ type: "FUSION_VISION_GROUNDED", source: "fusion", score: 0.82, explanation: `Fused ${questionHints.length} Q hints, ${answerHints.length} A hints, ${diagramPages.length} diagram pages` });
  } else {
    evidence.push({ type: "FUSION_TEXTRACT_ONLY", source: "fusion", score: 0.9, explanation: "Vision not invoked (easy case) — deterministic path" });
  }

  return {
    canonical,
    questionHintsFromVision: questionHints,
    answerHintsFromVision: answerHints,
    diagramPages: [...new Set(diagramPages)],
    instructionRegions,
    evidence,
    warnings,
  };
}
