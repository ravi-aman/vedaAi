// @ts-nocheck
/**
 * Answer Graph Builder — forensic rebuild for handwritten answer sheets
 * Constraints 8-14: handles handwriting, label detection, body detection, page locality, continuation, out-of-order
 * Prevents giant merges (31→3) via instrumented merge decisions (Constraint 10)
 */
import type { OcrDocumentResult, OcrLine } from "@/lib/ocr/types";
import type { DocumentPage } from "@/types";
import type { VisionDocumentAnalysis } from "@/lib/vision/provider";
import { normalizeNumber } from "./numbering";

export interface AnswerRegionDebug {
  pageNumber: number;
  blockIds: string[];
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
  type: "LABEL" | "BODY" | "DIAGRAM" | "HEADER" | "FOOTER" | "ROUGH";
  confidence: number;
}

export interface AnswerGroupDebug {
  id: string;
  suspectedQuestion: string | null;
  regions: AnswerRegionDebug[];
  pageNumbers: number[];
  bboxesByPage: Map<number, { x: number; y: number; width: number; height: number }[]>;
  confidence: number;
  evidence: Array<{ type: string; score: number; explanation: string }>;
  mergeDecisions: Array<{
    previousRegion: string;
    nextRegion: string;
    distance: number;
    samePage: boolean;
    pageDelta: number;
    labelEvidence: number;
    visionEvidence: number;
    layoutEvidence: number;
    mergeScore: number;
    decision: "MERGE" | "SPLIT";
  }>;
}

export interface SegmentedAnswerV2 {
  id: string;
  suspectedQuestion: string | null;
  normalizedLabel: string | null;
  text: string;
  pageNumbers: number[];
  bboxesByPage: Map<number, { x: number; y: number; width: number; height: number }[]>;
  regions: AnswerRegionDebug[];
  confidence: number;
  orderIndex: number;
  evidence: any[];
  isContinuation?: boolean;
}

function isHeaderFooter(text: string, bbox: any): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/Page\s*\d+\s*of\s*\d+/i.test(t)) return true;
  if (/^\s*\d+\s*$/.test(t) && (bbox.y < 0.06 || bbox.y > 0.92)) return true;
  if (/Space for writing|Question Number|Rough work/i.test(t)) return true;
  // Filter printed non-answer regions (Phase 8) — must not become AnswerGroups
  if (/SECTION\s*[A-E]/i.test(t)) return true;
  if (/For Visually Impaired/i.test(t)) return true;
  if (/Mathematics Standard/i.test(t)) return true;
  if (/^\s*SECTION\b/i.test(t)) return true;
  return false;
}

function detectAnswerLabelV2(
  text: string,
  bbox: { x: number; y: number; width: number; height: number },
  visionHints: any[]
): { raw: string; normalized: string; score: number; evidence: string } | null {
  const t = text.trim();
  if (!t || t.length > 30) return null;
  if (isHeaderFooter(t, bbox)) return null;

  // Check Vision first — if Vision says this block is ANSWER_LABEL with high conf, use it
  const visionMatch = visionHints.find((v) => v.blockIds?.includes(text) || v.labelHint === t || v.label === t);
  if (visionMatch && visionMatch.confidence > 0.7) {
    const norm = normalizeNumber(visionMatch.labelHint || t).normalized;
    return { raw: visionMatch.labelHint || t, normalized: norm, score: 0.9, evidence: `Vision ${visionMatch.labelHint} conf ${visionMatch.confidence}` };
  }

  // Pattern: Ans 1, Answer 1, Q1, Q.1, 1., 1), 1(a) etc. — but bare "1" not enough
  const patterns: Array<{ re: RegExp; score: number; type: string }> = [
    { re: /^\s*Ans\.?\s*0*(\d+)\s*[\.\)]?\s*$/i, score: 0.95, type: "Ans" },
    { re: /^\s*Answer\s*0*(\d+)\s*[\.\)]?\s*$/i, score: 0.95, type: "Answer" },
    { re: /^\s*Q\.?\s*0*(\d+)\s*[\.\)]?\s*$/i, score: 0.9, type: "Q" },
    { re: /^\s*0*(\d+)\s*[\.\)]\s*$/, score: 0.75, type: "bare with dot" }, // 1. 1) — needs left margin
    { re: /^\s*0*(\d+)\s*\([a-z]\)\s*$/i, score: 0.85, type: "1(a)" },
    { re: /^\s*0*(\d+)\s*\([ivx]+\)\s*$/i, score: 0.85, type: "1(i)" },
  ];

  for (const p of patterns) {
    const m = t.match(p.re);
    if (m) {
      const num = m[1];
      const n = parseInt(num, 10);
      if (n < 1 || n > 100) continue; // generic 1..100, not paper-specific 33
      // Geometry: must be at left margin for bare numbers
      if (p.type === "bare with dot" && bbox.x > 0.18) {
        return { raw: t, normalized: num, score: 0.3, evidence: `bare ${num} but x=${bbox.x.toFixed(2)} >0.18 soft` };
      }
      const normalized = normalizeNumber(num).normalized;
      return { raw: t, normalized, score: p.score, evidence: `${p.type} ${num} x=${bbox.x.toFixed(2)}` };
    }
  }

  // Bare "1" without punctuation — not enough evidence, low score
  if (/^\s*\d+\s*$/.test(t) && t.length <= 2) {
    return { raw: t, normalized: t.trim(), score: 0.25, evidence: `bare digit ${t} low score` };
  }

  return null;
}

export function buildAnswerGraphV2(
  ocr: OcrDocumentResult,
  pages: DocumentPage[],
  vision?: VisionDocumentAnalysis | null
): { groups: SegmentedAnswerV2[]; debug: { groups: AnswerGroupDebug[]; pageArtifacts: any[] } } {
  const pageByNumber = new Map<number, DocumentPage>();
  for (const p of pages) pageByNumber.set(p.pageNumber, p);

  const allLines: Array<OcrLine & { pageNumber: number; blockId: string }> = [];
  let blockIdx = 0;
  for (const pg of [...ocr.pages].sort((a, b) => a.pageNumber - b.pageNumber)) {
    const sorted = [...(pg.lines || [])].sort((a, b) => {
      const yDiff = a.boundingBox.y - b.boundingBox.y;
      if (Math.abs(yDiff) < 0.01) return a.boundingBox.x - b.boundingBox.x;
      return yDiff;
    });
    for (const l of sorted) {
      const id = `ocr-p${String(pg.pageNumber).padStart(3, "0")}-b${String(blockIdx++).padStart(3, "0")}`;
      allLines.push({ ...l, pageNumber: pg.pageNumber, blockId: id } as any);
    }
  }

  if (allLines.length === 0) return { groups: [], debug: { groups: [], pageArtifacts: [] } };

  // Prepare vision hints for answer sheet — collect per page
  const visionHintsByPage = new Map<number, any[]>();
  if (vision) {
    for (const vp of vision.pages) {
      const hints: any[] = [];
      for (const ah of vp.answerGroupHints || []) {
        hints.push({ labelHint: (ah as any).labelHint, confidence: (ah as any).confidence, blockIds: (ah as any).blockIds || [], type: "ANSWER_LABEL" });
      }
      for (const vr of vp.visualRegions || []) {
        if (vr.type === "HANDWRITING_BLOCK" || vr.type === "DIAGRAM") {
          hints.push({ labelHint: vr.relatedQuestionLabel || "", confidence: vr.confidence, blockIds: (vr as any).blockIds || [], type: vr.type });
        }
      }
      visionHintsByPage.set(vp.pageNumber, hints);
    }
  }

  // Adaptive gap for handwriting
  const heights = allLines.map((l) => l.boundingBox.height).filter((h) => h > 0).sort((a, b) => a - b);
  const medianH = heights.length ? heights[Math.floor(heights.length / 2)] : 0.02;
  const adaptiveGap = Math.max(0.015, medianH * 1.8);

  const groups: SegmentedAnswerV2[] = [];
  const debugGroups: AnswerGroupDebug[] = [];
  let current: SegmentedAnswerV2 | null = null;
  let currentRegions: AnswerRegionDebug[] = [];
  let currentMergeDecisions: AnswerGroupDebug["mergeDecisions"] = [];
  let orderIndex = 0;

  function finalize() {
    if (!current || currentRegions.length === 0) return;
    const byPage = new Map<number, typeof currentRegions>();
    for (const r of currentRegions) {
      if (!byPage.has(r.pageNumber)) byPage.set(r.pageNumber, []);
      byPage.get(r.pageNumber)!.push(r);
    }
    const bboxesByPage = new Map<number, { x: number; y: number; width: number; height: number }[]>();
    const pageNumbers: number[] = [];
    for (const [pn, regs] of byPage) {
      pageNumbers.push(pn);
      bboxesByPage.set(pn, regs.map((r) => r.bbox));
    }
    current.pageNumbers = [...pageNumbers].sort((a, b) => a - b);
    current.bboxesByPage = bboxesByPage;
    current.text = currentRegions.map((r) => r.text).join(" ");
    current.regions = [...currentRegions];
    const validConfs = currentRegions.map((r) => r.confidence).filter((c) => c > 0);
    current.confidence = validConfs.length ? validConfs.reduce((a, b) => a + b, 0) / validConfs.length : 0.7;

    groups.push(current);
    debugGroups.push({
      id: current.id,
      suspectedQuestion: current.suspectedQuestion,
      regions: [...currentRegions],
      pageNumbers: current.pageNumbers,
      bboxesByPage,
      confidence: current.confidence,
      evidence: current.evidence,
      mergeDecisions: [...currentMergeDecisions],
    });

    current = null;
    currentRegions = [];
    currentMergeDecisions = [];
  }

  for (const line of allLines) {
    const text = line.text.trim();
    const bbox = line.boundingBox as any;
    if (!text) continue;
    if (isHeaderFooter(text, bbox)) continue;
    if (/^[^\w]*$/.test(text) && text.length < 5) continue;

    const visionHints = visionHintsByPage.get(line.pageNumber) || [];
    const label = detectAnswerLabelV2(text, bbox, visionHints);

    if (label && label.score > 0.6) {
      // Strong label → new group (prevent giant merge)
      // If current exists and has suspectedQuestion same as new label, check if continuation (same label, sequential pages, near bottom/top)
      if (current && current.suspectedQuestion === label.normalized) {
        const last = currentRegions[currentRegions.length - 1];
        const pageDelta = line.pageNumber - last.pageNumber;
        const samePage = pageDelta === 0;
        const isContinuation = pageDelta === 1 && last.bbox.y > 0.6 && bbox.y < 0.3;
        if (isContinuation) {
          // Same label, sequential pages, bottom→top → continuation, merge
          const region: AnswerRegionDebug = {
            pageNumber: line.pageNumber,
            blockIds: [(line as any).blockId],
            text,
            bbox,
            type: "LABEL",
            confidence: label.score,
          };
          currentRegions.push(region);
          currentMergeDecisions.push({
            previousRegion: last.blockIds[0],
            nextRegion: (line as any).blockId,
            distance: bbox.y - (last.bbox.y + last.bbox.height),
            samePage,
            pageDelta,
            labelEvidence: label.score,
            visionEvidence: 0.5,
            layoutEvidence: 0.7,
            mergeScore: 0.8,
            decision: "MERGE",
          });
          continue;
        }
        // Same label but not continuation → new group? Actually duplicate label on different pages not sequential → split
      }
      // New group
      finalize();
      const id = `AG-${label.normalized}-${orderIndex + 1}`;
      current = {
        id,
        suspectedQuestion: label.normalized,
        normalizedLabel: label.normalized,
        text: "",
        pageNumbers: [],
        bboxesByPage: new Map(),
        regions: [],
        confidence: label.score,
        orderIndex: orderIndex++,
        evidence: [{ type: "LABEL", score: label.score, explanation: label.evidence }],
      };
      const region: AnswerRegionDebug = {
        pageNumber: line.pageNumber,
        blockIds: [(line as any).blockId],
        text,
        bbox,
        type: "LABEL",
        confidence: label.score,
      };
      currentRegions = [region];
      currentMergeDecisions = [];
      continue;
    }

    // No strong label → body/handwriting
    if (!current) {
      // No current group → start untagged group (for answers without label)
      const id = `AG-untagged-${orderIndex + 1}`;
      current = {
        id,
        suspectedQuestion: null,
        normalizedLabel: null,
        text: "",
        pageNumbers: [],
        bboxesByPage: new Map(),
        regions: [],
        confidence: 0.5,
        orderIndex: orderIndex++,
        evidence: [{ type: "UNTAGGED", score: 0.4, explanation: `No label, text "${text.slice(0, 20)}"` }],
      };
      currentRegions = [];
    }

    // Decide merge vs split for body — with hard limits to prevent giant merges (Constraint 10)
    // Hard limit check first
    const currentPageCountTmp = new Set(currentRegions.map(r => r.pageNumber)).size;
    if (currentPageCountTmp >= 4 || currentRegions.length >= 50) {
      // Force split due to giant group
      finalize();
      const idTmp = `AG-untagged-${orderIndex + 1}`;
      current = {
        id: idTmp,
        suspectedQuestion: null,
        normalizedLabel: null,
        text: "",
        pageNumbers: [],
        bboxesByPage: new Map(),
        regions: [],
        confidence: 0.5,
        orderIndex: orderIndex++,
        evidence: [{ type: "GIANT_SPLIT", score: 0.9, explanation: `Force split giant ${currentPageCountTmp} pages ${currentRegions.length} regions` }],
      };
      currentRegions = [];
      currentMergeDecisions = [];
    }
    // Decide merge vs split for body
    const last = currentRegions[currentRegions.length - 1];
    if (last) {
      const pageDelta = line.pageNumber - last.pageNumber;
      const samePage = pageDelta === 0;
      const gap = samePage ? bbox.y - (last.bbox.y + last.bbox.height) : 999;
      const isLargeGap = samePage ? gap > adaptiveGap * 2.0 : false;
      const isPageContinuation = pageDelta === 1 && last.bbox.y > 0.6 && bbox.y < 0.3;
      const isLeftMargin = bbox.x < 0.15;
      const prevSubstantial = currentRegions.length >= 4 || currentRegions.map((r) => r.text).join(" ").length > 80;

      let decision: "MERGE" | "SPLIT" = "MERGE";
      let mergeScore = 0.6;
      let layoutEvidence = 0.5;

      if (!samePage && !isPageContinuation && pageDelta === 1 && bbox.y < 0.25 && prevSubstantial) {
        // New page, not continuation, substantial previous → likely new untagged answer
        decision = "SPLIT";
        mergeScore = 0.2;
        layoutEvidence = 0.8;
      } else if (isLargeGap && isLeftMargin && prevSubstantial) {
        // Large gap on same page → possible new answer without label
        if (gap > 0.08 && /^[A-Z]/.test(text)) {
          decision = "SPLIT";
          mergeScore = 0.3;
          layoutEvidence = 0.7;
        }
      } else if (isPageContinuation) {
        decision = "MERGE";
        mergeScore = 0.85;
        layoutEvidence = 0.9;
      }

      currentMergeDecisions.push({
        previousRegion: last.blockIds[0],
        nextRegion: (line as any).blockId,
        distance: gap,
        samePage,
        pageDelta,
        labelEvidence: label ? label.score : 0,
        visionEvidence: 0.5,
        layoutEvidence,
        mergeScore,
        decision,
      });

      if (decision === "SPLIT") {
        finalize();
        // Start new untagged group for this line
        const id = `AG-untagged-${orderIndex + 1}`;
        current = {
          id,
          suspectedQuestion: null,
          normalizedLabel: null,
          text: "",
          pageNumbers: [],
          bboxesByPage: new Map(),
          regions: [],
          confidence: 0.5,
          orderIndex: orderIndex++,
          evidence: [{ type: "SPLIT", score: mergeScore, explanation: `Large gap ${gap.toFixed(3)}` }],
        };
        currentRegions = [];
        currentMergeDecisions = [];
      }
    }

    const region: AnswerRegionDebug = {
      pageNumber: line.pageNumber,
      blockIds: [(line as any).blockId],
      text,
      bbox,
      type: "BODY",
      confidence: (line as any).confidence || 0.7,
    };
    currentRegions.push(region);
    if (current) {
      // Update text incrementally for debugging
      current.text = currentRegions.map((r) => r.text).join(" ");
    }
  }

  finalize();

  // Post-filter: remove tiny/empty groups
  const filtered = groups.filter((g) => {
    if (g.suspectedQuestion) return g.regions.length >= 1;
    // Untagged: keep only if substantial
    if (g.text.trim().length < 20) return false;
    if (g.regions.length < 2 && g.text.length < 40) return false;
    return true;
  });

  // Reassign orderIndex
  const result = filtered.map((g, idx) => ({ ...g, orderIndex: idx }));

  const pageArtifacts = Array.from(new Set(allLines.map((l) => l.pageNumber))).map((pn) => ({
    pageNumber: pn,
    blockCount: allLines.filter((l) => l.pageNumber === pn).length,
    groupCount: result.filter((g) => g.pageNumbers.includes(pn)).length,
  }));

  return { groups: result, debug: { groups: debugGroups, pageArtifacts } };
}
