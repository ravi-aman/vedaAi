import type { OcrDocumentResult } from "@/lib/ocr/types";

/**
 * Intelligent routing — decides whether Vision is needed.
 * Easy/clear cases → Textract + deterministic.
 * Ambiguous/complex → Vision.
 * Vision is never mandatory for simple docs; failure falls back.
 */

export interface RoutingDecision {
  useVision: boolean;
  reason: string;
  confidence: number;
  estimatedDifficulty: "easy" | "moderate" | "hard";
}

export function shouldInvokeVision(ocr: OcrDocumentResult, opts?: { forceVision?: boolean; kind?: "questionPaper" | "answerSheet" }): RoutingDecision {
  // Vision-Only: when OCR is mock (no real geometry), always use Vision
  try {
    const cfg: any = require("@/lib/config").getConfig();
    if (cfg.OCR_PROVIDER === "mock") {
      return { useVision: true, reason: "vision-primary mock OCR — Vision is primary source", confidence: 0.9, estimatedDifficulty: "hard" };
    }
  } catch {}
  if (opts?.forceVision) {
    return { useVision: true, reason: "forceVision flag", confidence: 1, estimatedDifficulty: "hard" };
  }

  const pages = ocr.pages || [];
  const totalLines = pages.reduce((a, p) => a + (p.lines?.length || 0), 0);
  const avgConfidence = pages.length ? pages.reduce((a, p) => a + (p.confidence || 0.9), 0) / pages.length : 0.9;
  const hasLowConfidenceLines = pages.some((p) => (p.lines || []).some((l) => (l.confidence || 1) < 0.6));
  // Handwriting signals: for answerSheet, handwriting is expected — check avgConf <0.85 or many lines with low conf or sparse
  const hasHandwritingSignals = opts?.kind === "answerSheet"
    ? avgConfidence < 0.85 || hasLowConfidenceLines || totalLines > 20
    : pages.some((p) => p.text.length < 50 && totalLines < 5); // sparse text may be diagram-only

  // For answerSheet, handwriting is inherently difficult — Vision must run (Phase 3,18)
  if (opts?.kind === "answerSheet" && hasHandwritingSignals) {
    return { useVision: true, reason: `answerSheet handwriting: avgConf ${avgConfidence.toFixed(2)}, lowConf=${hasLowConfidenceLines}, lines=${totalLines}`, confidence: 0.8, estimatedDifficulty: "hard" };
  }

  // Easy: high confidence, many lines, structured text
  if (avgConfidence > 0.85 && totalLines > 20 && !hasLowConfidenceLines) {
    return { useVision: false, reason: `easy: avgConf ${avgConfidence.toFixed(2)}, lines ${totalLines}`, confidence: 0.9, estimatedDifficulty: "easy" };
  }

  // Moderate: some ambiguity, short or low-confidence regions, out-of-order hints
  if (hasLowConfidenceLines || totalLines < 10 || hasHandwritingSignals) {
    return { useVision: true, reason: `moderate: lowConf=${hasLowConfidenceLines}, sparse=${totalLines < 10}, handwritingSignal=${hasHandwritingSignals}`, confidence: 0.6, estimatedDifficulty: "moderate" };
  }

  // For question papers: if line count very high but structure ambiguous (e.g., 2-column), Vision helps
  const isLikelyMultiColumn = pages.some((p) => {
    const xs = (p.lines || []).map((l) => l.boundingBox.x);
    const left = xs.filter((x) => x < 0.4).length;
    const right = xs.filter((x) => x >= 0.5).length;
    return left >= 2 && right >= 2;
  });
  if (isLikelyMultiColumn) {
    return { useVision: true, reason: "moderate: multi-column detected", confidence: 0.65, estimatedDifficulty: "moderate" };
  }

  return { useVision: false, reason: `easy-fallback: avgConf ${avgConfidence.toFixed(2)}`, confidence: 0.8, estimatedDifficulty: "easy" };
}

export function shouldInvokeVisionForMapping(uncertainCount: number, totalQuestions: number): boolean {
  if (uncertainCount === 0) return false;
  if (uncertainCount / Math.max(totalQuestions, 1) > 0.2) return true;
  if (uncertainCount >= 3) return true;
  return false;
}
