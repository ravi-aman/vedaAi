/**
 * Smart Mapping — downstream interpretation & mapping rebuild (Phases 4-59, aggregated)
 * Preserves upstream parallel OCR+Vision, only improves mapping logic.
 * Implements: AnswerEvidence, present detection, label classification, MCQ mapper,
 * sequence/anchor inference, candidate generation with 10+ evidence dims, context weighting,
 * global conflict-aware assignment, confidence margins, targeted Vision, validation, highlights.
 */
import type { QuestionNode, AnswerGroup, AnswerRegion, Evidence, MappingCandidate, MappingDecision, HighlightRegion } from "@/types";
import { buildEvidence, aggregateScore } from "@/lib/evidence/aggregate";
import { decideForQuestion } from "@/lib/decision";
import { generateId } from "@/lib/storage";
import { normalizeNumber } from "@/lib/structure/numbering";
import { buildQuestionIndex, getQuestionByNumber } from "./question-index";
import { buildLabelCandidates, classifyPresentType, type AnswerEvidence, type LabelCandidate } from "./answer-evidence";
import {
  buildExplicitLabelEvidence,
  buildOptionMatchEvidence,
  buildSemanticEvidence,
  buildSectionEvidence,
  buildTypeEvidence,
  buildSequenceEvidence,
  buildPageContinuityEvidence,
  buildHandwritingEvidence,
} from "./evidence-model";
import { extractAnchors, inferLocalSequences } from "./sequence-inference";
import { solveGlobalAssignment } from "./global-assignment";
import { adjudicateWithVision } from "./targeted-vision";
import { mappingThresholds, getConfig } from "@/lib/config";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

function mergeBoxesForHighlightLocal(boxes: { x: number; y: number; width: number; height: number }[]): { x: number; y: number; width: number; height: number }[] {
  if (boxes.length === 0) return [];
  if (boxes.length === 1) {
    const b = boxes[0];
    const pad = 0.012;
    return [{ x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: Math.min(1 - Math.max(0, b.x - pad), b.width + pad * 2), height: Math.min(1 - Math.max(0, b.y - pad), b.height + pad * 2) }];
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes) { minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height); }
  const pad = 0.012;
  const x = Math.max(0, minX - pad); const y = Math.max(0, minY - pad);
  const w = Math.min(1 - x, maxX - minX + pad * 2); const h = Math.min(1 - y, maxY - minY + pad * 2);
  return [{ x, y, width: w, height: h }];
}

// Helper: detect answerType from text + geometry
function classifyAnswerType(text: string, regions: AnswerRegion[], vision?: any): AnswerEvidence["answerType"] {
  const t = text.trim();
  if (!t && regions.some((r) => r.regionType === "DIAGRAM")) return "DIAGRAM";
  if (regions.some((r) => r.regionType === "DIAGRAM") && t.length < 80) return "DIAGRAM";
  if (/ROUGH/i.test(t)) return "ROUGH_WORK";
  if (/^\s*\(?\s*[A-D]\s*[\.\)\]]/.test(t) && t.length < 80) return "MCQ_OPTION";
  if (/^\s*[A-D]\s*$/.test(t)) return "MCQ_OPTION";
  if (t.length > 300 && /(derive|prove|explain|diagram)/i.test(t)) return "LONG_ANSWER";
  if (/[\d\.\+\-\*\/=\^]+/.test(t) && t.length < 120 && /(calculate|find|value)/i.test(t)) return "NUMERICAL";
  if (t.length > 100) return "TEXT_EXPLANATION";
  if (/\(a\)|\(b\)|\(i\)|\(ii\)/i.test(t)) return "CASE_STUDY_PART";
  return "UNKNOWN";
}

// Build AnswerEvidence from AnswerGroup + pages + vision hints
export function buildAnswerEvidences(answerGroups: AnswerGroup[], pages: any[], visionData?: any): AnswerEvidence[] {
  const visionHintsByGroup = new Map<string, any[]>();
  // Collect vision hints per page from visionData
  const visionHintsByPage = new Map<number, any[]>();
  if (visionData?.asVision) {
    for (const vp of visionData.asVision.pages || []) {
      const hints: any[] = [];
      for (const ah of vp.answerGroupHints || []) hints.push(ah);
      for (const vr of vp.visualRegions || []) if (vr.type === "HANDWRITING_BLOCK" || vr.type === "DIAGRAM") hints.push(vr);
      visionHintsByPage.set(vp.pageNumber, hints);
    }
  }
  const evs: AnswerEvidence[] = [];
  for (let idx = 0; idx < answerGroups.length; idx++) {
    const ag = answerGroups[idx];
    const firstReg = ag.regions[0];
    const pageFor = (pageId: string): number => {
      const p = pages.find((pg: any) => pg.id === pageId);
      return p?.pageNumber ?? 1;
    };
    const pageNumbers = [...new Set(ag.regions.map((r) => pageFor(r.pageId)))].sort((a, b) => a - b);
    const rawOCRText = ag.normalizedText || ag.regions.map((r) => r.rawText).join(" ");
    const normalizedText = rawOCRText.trim();
    // Build bboxesByPage + union
    const boxesByPage = new Map<number, any[]>();
    const unionByPage = new Map<number, any>();
    for (const reg of ag.regions) {
      const pn = pageFor(reg.pageId);
      if (!boxesByPage.has(pn)) boxesByPage.set(pn, []);
      boxesByPage.get(pn)!.push(...reg.normalizedBoxes);
    }
    for (const [pn, boxes] of boxesByPage) {
      const merged = mergeBoxesForHighlightLocal(boxes)[0] || boxes[0];
      if (merged) unionByPage.set(pn, merged);
    }
    // Label candidates: look at first line's suspected label + geometry (preserve provenance, don't re-derive bare digit as low)
    const labelCands: LabelCandidate[] = [];
    const regLabel = (firstReg as any).questionLabel as string | undefined;
    const labelConfFromReg = (firstReg as any).labelConfidence as number | undefined;
    const ocrConfForLabel = firstReg.ocrConfidence ?? 0.8;
    if (regLabel) {
      const bbox = firstReg.normalizedBoxes[0] || { x: 0.06, y: 0.1, width: 0.3, height: 0.02 };
      const pageNum = pageNumbers[0] || 1;
      const hints = visionHintsByPage.get(pageNum) || [];
      let normalizedLabel: string = regLabel;
      try { normalizedLabel = normalizeNumber(regLabel).normalized; } catch {}
      // Preserve original high confidence: if answer-graph already confirmed this label, treat as CONFIRMED with ~0.88-0.95
      // For bare "3" from AG-3, original graph had score 0.75 via bare-with-dot; here we have labelConfidence 0.9 from structuring, so use that
      const rawConf = labelConfFromReg && labelConfFromReg >= 0.6 ? labelConfFromReg : ocrConfForLabel > 0.6 ? Math.min(0.92, ocrConfForLabel + 0.1) : 0.72;
      // Detect vision hint for extra boost — exact match preferred, fallback to any hint on same page for disagreement tracking
      let visionHint = hints.find((h: any) => (h.labelHint || h.relatedQuestionLabel) === regLabel || (h.labelHint || "").toLowerCase() === normalizedLabel.toLowerCase());
      if (!visionHint && hints.length > 0) visionHint = hints[0];
      const vConf = visionHint?.confidence;
      const finalConf = vConf ? Math.min(0.96, (rawConf + vConf) / 2 + 0.08) : rawConf;
      const classification = finalConf >= 0.75 ? "LABEL_CONFIRMED" as const : finalConf >= 0.55 ? "LABEL_PROBABLE" as const : "LABEL_UNREADABLE" as const;
      const positionScore = bbox.x < 0.08 ? 0.95 : bbox.x < 0.14 ? 0.85 : 0.5;
      labelCands.push({
        rawText: regLabel,
        normalizedText: normalizedLabel,
        pageNumber: pageNum,
        bbox,
        OCRConfidence: ocrConfForLabel,
        visionInterpretation: visionHint?.labelHint || visionHint?.relatedQuestionLabel,
        visionConfidence: vConf,
        positionScore,
        handwritingScore: ocrConfForLabel,
        contextScore: 0.6,
        sequenceScore: 0.5,
        finalLabel: normalizedLabel,
        confidence: finalConf,
        classification,
        evidence: [
          { signal: "ORIGINAL_GRAPH_LABEL", score: rawConf, explanation: `AnswerGraph suspectedQuestion ${regLabel} labelConfidence ${labelConfFromReg} ocr ${ocrConfForLabel}` },
          { signal: "POSITION", score: positionScore, explanation: `x=${bbox.x.toFixed(3)}` },
          ...(vConf ? [{ signal: "VISION", score: vConf, explanation: `Vision ${visionHint.labelHint}` }] : []),
        ],
      });
    } else {
      // Try to detect from first few words of text if it looks like label
      const firstWords = normalizedText.slice(0, 30);
      const bbox = firstReg.normalizedBoxes[0] || { x: 0.08, y: 0.1, width: 0.3, height: 0.02 };
      const hints = visionHintsByPage.get(pageNumbers[0] || 1) || [];
      const cand = buildLabelCandidates({ rawText: firstWords.split(/\s+/)[0] || "", bbox, pageNumber: pageNumbers[0] || 1, ocrConfidence: firstReg.ocrConfidence ?? 0.6, visionHints: hints });
      if (cand.finalLabel && cand.classification !== "LABEL_ABSENT" && cand.confidence > 0.55) labelCands.push(cand);
    }

    const labelConfidence = labelCands.length ? Math.max(...labelCands.map((c) => c.confidence)) : 0;
    const questionLabelDetected = labelCands.some((c) => c.classification === "LABEL_CONFIRMED" || c.classification === "LABEL_PROBABLE");
    const answerType = classifyAnswerType(normalizedText, ag.regions);
    const diagramPresent = ag.regions.some((r) => r.regionType === "DIAGRAM") || answerType === "DIAGRAM";
    const presentType = classifyPresentType({ rawOCRText: rawOCRText, normalizedText, diagramPresent, geometry: { boxesByPage } } as any);
    const ANSWER_PRESENT = presentType === "REAL_ANSWER" || presentType === "DIAGRAM" || presentType === "CONTINUATION";
    const ANSWER_DETECTED = rawOCRText.length > 5 || diagramPresent;

    // Subpart hint: check for (a) etc at start
    const subpartHint = normalizedText.match(/^\s*\([a-z]\)|^\s*\([ivx]+\)/i)?.[0];
    // Section hint: try to infer from page numbers vs questionIndex later; for now null

    evs.push({
      answerGroupId: ag.id,
      pageNumbers,
      sourceBlockIds: ag.regions.flatMap((r) => [r.id]),
      rawOCRText,
      normalizedText,
      visualText: (firstReg as any).interpretedText,
      detectedLabels: labelCands,
      labelConfidence,
      answerType,
      presentType,
      handwritingConfidence: firstReg.ocrConfidence ?? 0.65,
      continuationInfo: ag.regions.length > 1 ? { isContinuation: true, sequentialPages: pageNumbers.length > 1 } : undefined,
      sequencePosition: (firstReg as any).orderIndex ?? idx,
      sectionHint: undefined,
      subpartHint: subpartHint || undefined,
      diagramPresent,
      geometry: { boxesByPage, unionByPage },
      visionEvidence: { answerHints: visionHintsByPage.get(pageNumbers[0] || 1) || [], visualRegions: [] },
      provenance: { ocrBlocks: ag.regions.flatMap((r) => r.normalizedBoxes).length, visionHints: (visionHintsByPage.get(pageNumbers[0] || 1)?.length || 0), source: "smart-mapping" },
      ANSWER_PRESENT,
      ANSWER_DETECTED,
      QUESTION_LABEL_DETECTED: questionLabelDetected,
    });
  }
  return evs;
}

export interface SmartMappingOptions {
  jobId: string;
  questions: QuestionNode[];
  answerGroups: AnswerGroup[];
  answerEvidences?: AnswerEvidence[];
  visionData?: any;
  pagesAs?: any[];
  enableTargetedVision?: boolean;
}

export interface SmartMappingResult {
  decisions: MappingDecision[];
  answerEvidences: AnswerEvidence[];
  anchors: any[];
  sequenceHyps: Map<string, any>;
  debugPerQuestion: Map<string, any>;
  unmatchedAnswers: AnswerGroup[];
}

export async function runSmartMapping(opts: SmartMappingOptions): Promise<SmartMappingResult> {
  const { jobId, questions, answerGroups, visionData, pagesAs, enableTargetedVision = true } = opts;
  let answerEvidences = opts.answerEvidences || buildAnswerEvidences(answerGroups, pagesAs || [], visionData);
  const qIndex = buildQuestionIndex(questions);
  const topLevelQs = questions.filter((q) => q.depth === 0);
  // Extract anchors
  const anchors = extractAnchors(answerEvidences);
  const seqMap = inferLocalSequences(answerEvidences, anchors);

  // Build candidates per question
  const candidatesByQ = new Map<string, MappingCandidate[]>();
  const debugPerQuestion = new Map<string, any>();
  // Track evidences per candidate for debug
  for (const q of topLevelQs) {
    const qEntry = qIndex.get(q.id);
    if (!qEntry) continue;
    const cands: MappingCandidate[] = [];
    for (const aev of answerEvidences) {
      const ag = answerGroups.find((g) => g.id === aev.answerGroupId);
      if (!ag) continue;
      // Pruning: impossible section/type where strongly supported (but not aggressive)
      // For example, if question is MCQ and answer is diagram-heavy long, prune only if evidence very strong
      // We keep candidates when uncertain (Phase 51)
      const seqCtx = seqMap.get(aev.answerGroupId);
      const anchorCtx = seqCtx ? { anchorBefore: seqCtx.anchorBefore?.label, anchorAfter: seqCtx.anchorAfter?.label } : undefined;

      const evs: Evidence[] = [];
      evs.push(buildExplicitLabelEvidence(aev, qEntry));
      evs.push(buildOptionMatchEvidence(aev, qEntry));
      evs.push(buildSemanticEvidence(aev, qEntry));
      evs.push(buildTypeEvidence(aev, qEntry));
      evs.push(buildSequenceEvidence(aev, qEntry, anchorCtx as any));
      evs.push(buildPageContinuityEvidence(aev, qEntry));
      evs.push(buildHandwritingEvidence(aev));
      // Section (if we had hint)
      evs.push(buildSectionEvidence(aev, qEntry, (aev as any).sectionHint));
      // Add spatial continuity if near anchor
      if (seqCtx?.supportingEvidence?.includes("spatial_contiguous")) {
        evs.push(buildEvidence("LAYOUT_CONTINUITY", "spatial", 0.72, "Spatial contiguous with anchor", 0.6));
      }
      // OCR/VISION confidence
      const ocrConf = ag.regions[0]?.ocrConfidence ?? 0.6;
      evs.push(buildEvidence("OCR_CONFIDENCE", "ocr", ocrConf, `OCR ${ocrConf.toFixed(2)}`, 0.4));
      if (aev.visionEvidence?.answerHints?.length) {
        const vConf = aev.visionEvidence.answerHints[0]?.confidence ?? 0.6;
        evs.push(buildEvidence("VISUAL_EVIDENCE", "vision", vConf, "Vision handwriting block", 0.55));
      }
      // Context-sensitive weighting via reliability boost: we already set reliability per evidence, but for MCQ vs long we adjust?
      // Instead, aggregateScore weights by reliability; for MCQ we gave OPTION_MATCH high reliability 2.2, for long semantic high 0.9
      const score = aggregateScore(evs);
      cands.push({ questionId: q.id, answerGroupId: aev.answerGroupId, evidence: evs, score });
    }
    // Sort descending
    cands.sort((a, b) => b.score - a.score);
    // Prune to top 5 candidates (keep top 5 to reduce cost)
    const pruned = cands.slice(0, 5);
    candidatesByQ.set(q.id, pruned);
    // Debug entry
    debugPerQuestion.set(q.id, {
      questionId: q.id,
      number: q.normalizedNumber,
      candidates: pruned.map((c) => ({
        answerGroupId: c.answerGroupId,
        score: Number(c.score.toFixed(3)),
        margin: 0, // filled later
        evidence: c.evidence.map((e) => ({ type: e.type, score: Number(e.score.toFixed(2)), reliability: e.reliability, explanation: e.explanation })),
      })),
      anchorContext: seqMap.get(cands[0]?.answerGroupId || "") || null,
    });
  }

  // Fill margin in debug
  for (const [qid, cands] of candidatesByQ) {
    const dbg = debugPerQuestion.get(qid);
    if (dbg && dbg.candidates.length >= 2) {
      dbg.candidates[0].margin = Number((dbg.candidates[0].score - dbg.candidates[1].score).toFixed(3));
      dbg.candidates[1].margin = dbg.candidates[0].margin;
    } else if (dbg && dbg.candidates.length === 1) {
      dbg.candidates[0].margin = 1.0;
    }
  }

  // Targeted Vision adjudication for ambiguous cases (Phase 22)
  // Criteria: margin <0.08, or label conflict, or OCR/Vision disagreement, or MCQ option ambiguity
  const ambiguousQs: string[] = [];
  for (const q of topLevelQs) {
    const cands = candidatesByQ.get(q.id) || [];
    if (cands.length < 2) continue;
    const top = cands[0], second = cands[1];
    const margin = top.score - second.score;
    const hasLabelConflict = top.evidence.find((e) => e.type === "EXPLICIT_QUESTION_LABEL" && e.score < 0.35 && top.score > 0.5);
    const isMcqAmbiguous = (qIndex.get(q.id)?.isMCQ && top.evidence.find((e) => e.explanation.includes("Option"))?.score === 0.18);
    if (margin < 0.08 && second.score >= mappingThresholds.review) {
      ambiguousQs.push(q.id);
    } else if (hasLabelConflict) {
      // already handled but could be ambiguous
    }
    if (isMcqAmbiguous && margin < 0.12) ambiguousQs.push(q.id);
  }
  // Deduplicate and bound
  const uniqueAmb = [...new Set(ambiguousQs)].slice(0, (getConfig() as any).MAPPING_VISION_MAX_ADJUDICATIONS ?? 6);
  if (enableTargetedVision && uniqueAmb.length > 0) {
    for (const qid of uniqueAmb) {
      const q = questions.find((qq) => qq.id === qid);
      const cands = candidatesByQ.get(qid) || [];
      if (!q || cands.length === 0) continue;
      const topAg = answerGroups.find((ag) => ag.id === cands[0].answerGroupId);
      if (!topAg) continue;
      // Only adjudicate if Vision provider available and job has vision data
      const adj = await adjudicateWithVision({
        questionCrops: questions.filter((qq) => cands.slice(0, 3).some((c) => c.questionId === qq.id) || cands.some((c) => c.questionId === qq.id)).map((qq) => ({ questionId: qq.id, normalizedNumber: qq.normalizedNumber, text: qq.text.slice(0, 500) })),
        answerGroup: topAg,
        candidateQuestionIds: cands.slice(0, 3).map((c) => c.questionId),
        ambiguity: `margin ${ (cands[0].score - (cands[1]?.score||0)).toFixed(2)} small`,
        jobId,
      });
      if (adj && adj.selectedQuestionId) {
        // Boost the adjudicated candidate's score by +0.12 if it matches this q
        if (adj.selectedQuestionId === qid) {
          const idx = cands.findIndex((c) => c.questionId === qid && c.answerGroupId === topAg.id);
          // Actually cands are for this q, so all have same questionId, we need to boost this AG vs others
          // Instead, we boost this candidate vs runner-up by adding evidence
          const chosen = cands[0];
          chosen.evidence.push(buildEvidence("VISUAL_EVIDENCE", "targeted-vision", adj.confidence, `Vision adjudicated Q${q.normalizedNumber}: ${adj.reason}`, 1.1));
          chosen.score = aggregateScore(chosen.evidence);
          cands.sort((a, b) => b.score - a.score);
        } else {
          // Vision says this AG belongs to different question — penalize this mapping
          const chosen = cands[0];
          chosen.evidence.push(buildEvidence("VISUAL_EVIDENCE", "targeted-vision", 0.25, `Vision rejected Q${q.normalizedNumber} in favor of ${adj.selectedQuestionId}: ${adj.reason}`, 0.9));
          chosen.score = aggregateScore(chosen.evidence);
          cands.sort((a, b) => b.score - a.score);
        }
        // Record in debug
        const dbg = debugPerQuestion.get(qid);
        if (dbg) dbg.visionAdjudication = adj;
      }
    }
  }

  // Global assignment (Phase 19)
  const assignment = solveGlobalAssignment({
    questionIds: topLevelQs.map((q) => q.id),
    answerGroupIds: answerGroups.map((ag) => ag.id),
    candidates: candidatesByQ,
    thresholds: { high: mappingThresholds.high, review: mappingThresholds.review },
  });

  // Build decisions with status semantics (Phase 20,21,57)
  const decisions: MappingDecision[] = [];
  const used = new Set<string>(assignment.assigned.values());

  for (const q of topLevelQs) {
    const cands = candidatesByQ.get(q.id) || [];
    const assignedAgId = assignment.assigned.get(q.id);
    const topCand = cands.find((c) => c.answerGroupId === assignedAgId) || cands[0];
    const secondCand = cands.find((c) => c.answerGroupId !== assignedAgId) || cands[1];
    const topScore = topCand?.score ?? 0;
    const secondScore = secondCand?.score ?? 0;
    const margin = topScore - secondScore;

    // Find AnswerEvidence for this AG to check ANSWER_PRESENT vs LABEL
    const aev = answerEvidences.find((e) => e.answerGroupId === assignedAgId);
    const hasRealAnswer = aev?.ANSWER_PRESENT ?? false;
    const hasLabel = aev?.QUESTION_LABEL_DETECTED ?? false;

    let status: any = "UNANSWERED";
    let confidence = 0;
    let chosenId: string | undefined = assignedAgId;
    let evidence: Evidence[] = topCand?.evidence || [];

    if (!assignedAgId) {
      // Check if any answer exists at all? If untagged real answers exist but not assigned, it's UNANSWERED vs UNMATCHED nuance
      // For question perspective, if no AG assigned and no credible AG near, UNANSWERED
      // If there are UNMATCHED AGs that could be this question but below threshold, it is REVIEW (UNCERTAIN) not UNANSWERED
      const bestOverall = cands[0];
      if (bestOverall && bestOverall.score >= mappingThresholds.review && bestOverall.score < mappingThresholds.high) {
        status = "UNCERTAIN"; // REVIEW tier
        confidence = bestOverall.score;
        evidence = bestOverall.evidence;
        chosenId = undefined; // don't assign low confidence as MATCHED
      } else if (bestOverall && bestOverall.score >= 0.35) {
        status = "UNCERTAIN";
        confidence = bestOverall.score;
        evidence = [...bestOverall.evidence, buildEvidence("SEMANTIC_SIMILARITY", "decision", margin, `Margin ${margin.toFixed(2)} low`, 0.7)];
      } else {
        status = "UNANSWERED";
        confidence = 0;
        evidence = [];
      }
    } else {
      // Have assignment — decide MATCHED vs UNCERTAIN vs REVIEW via margin
      confidence = topScore;
      const hasLabelMatch = topCand.evidence.some((e) => e.type === "EXPLICIT_QUESTION_LABEL" && e.score >= 0.85);
      // Anchor override: explicit LABEL_CONFIRMED match is strong even if aggregate slightly below high (e.g., 0.71 vs 0.75) — prevents false UNANSWERED for real labels
      const isAnchorOverride = hasLabelMatch && hasLabel && topScore >= 0.62;
      if ((topScore >= mappingThresholds.high && (secondScore < mappingThresholds.review || margin >= 0.08)) || isAnchorOverride) {
        // Check if label detected false but other evidence strong → still MATCHED but not fake high confidence
        // Ensure not converting possible into 0.95
        if (!hasLabel && confidence > 0.85 && !qIndex.get(q.id)?.isLongAnswer) {
          // For MCQ without label, cap confidence to 0.78 unless option match strong
          const hasOption = topCand.evidence.some((e) => e.explanation.includes("Option") && e.score > 0.8);
          if (!hasOption) confidence = Math.min(confidence, 0.78);
        }
        // For anchor override, ensure margin not too small if second also high — downgrade to REVIEW if ambiguous
        if (isAnchorOverride && topScore < mappingThresholds.high && secondScore >= mappingThresholds.review && margin < 0.06) {
          status = "UNCERTAIN";
          evidence = [...evidence, buildEvidence("SEMANTIC_SIMILARITY", "decision", margin, `Anchor Q${q.normalizedNumber} but margin ${margin.toFixed(2)} small → REVIEW`, 0.8)];
        } else {
          status = "MATCHED";
          if (isAnchorOverride && topScore < mappingThresholds.high) confidence = Math.min(0.78, confidence + 0.04);
        }
      } else if (topScore >= mappingThresholds.review) {
        // Plausible but margin small or score mid
        status = "UNCERTAIN"; // REVIEW tier
        evidence = [...evidence, buildEvidence("SEMANTIC_SIMILARITY", "decision", margin, `Top ${topScore.toFixed(2)} margin ${margin.toFixed(2)} small → REVIEW`, 0.8)];
      } else {
        status = "UNMATCHED";
      }
    }

    // Highlight regions from AG
    const highlightRegions: HighlightRegion[] = [];
    if (chosenId && status === "MATCHED") {
      const ag = answerGroups.find((a) => a.id === chosenId);
      if (ag) {
        const boxesByPage = new Map<string, any[]>();
        for (const reg of ag.regions) {
          if (!boxesByPage.has(reg.pageId)) boxesByPage.set(reg.pageId, []);
          boxesByPage.get(reg.pageId)!.push(...reg.normalizedBoxes);
        }
        for (const [pageId, boxes] of boxesByPage) {
          const merged = mergeBoxesForHighlightLocal(boxes);
          highlightRegions.push({ pageId, boxes: merged, confidence, source: "smart-mapping" });
        }
      }
    } else if (chosenId && status === "UNCERTAIN") {
      const ag = answerGroups.find((a) => a.id === chosenId);
      if (ag) {
        const boxesByPage = new Map<string, any[]>();
        for (const reg of ag.regions) { if (!boxesByPage.has(reg.pageId)) boxesByPage.set(reg.pageId, []); boxesByPage.get(reg.pageId)!.push(...reg.normalizedBoxes); }
        for (const [pageId, boxes] of boxesByPage) {
          highlightRegions.push({ pageId, boxes: mergeBoxesForHighlightLocal(boxes), confidence, source: "smart-mapping-review" });
        }
      }
    }

    const dbg = debugPerQuestion.get(q.id);
    if (dbg) {
      dbg.finalDecision = { status, confidence: Number(confidence.toFixed(3)), answerGroupId: chosenId, margin: Number(margin.toFixed(3)), evidence: evidence.slice(0, 4).map((e) => e.explanation) };
      if (aev) dbg.answerEvidence = { presentType: aev.presentType, answerType: aev.answerType, labelDetected: aev.QUESTION_LABEL_DETECTED, pageNumbers: aev.pageNumbers, labelCandidates: aev.detectedLabels.map((l) => ({ finalLabel: l.finalLabel, confidence: l.confidence, classification: l.classification })) };
    }

    decisions.push({
      id: generateId(),
      questionId: q.id,
      answerGroupId: chosenId,
      answerIds: chosenId ? [chosenId] : [],
      primaryAnswerId: chosenId,
      status,
      confidence,
      mappingConfidence: confidence,
      evidence,
      highlightRegions,
    });
  }

  // Subparts: handle children independently but keep parent link (Phase 14)
  const subQs = questions.filter((q) => q.depth !== 0);
  for (const sq of subQs) {
    // For subparts, generate candidates similarly but only from AGs that have subpartHint or belong to parent AG
    const parentId = sq.parentQuestionId;
    const parentDecision = decisions.find((d) => d.questionId === parentId);
    const parentAgId = parentDecision?.answerGroupId;
    // If parent matched, try to find sub-region within parent AG that matches subpart label
    let subCand: MappingCandidate | undefined;
    if (parentAgId) {
      const parentAev = answerEvidences.find((e) => e.answerGroupId === parentAgId);
      if (parentAev?.subpartHint && parentAev.subpartHint.toLowerCase().includes(sq.normalizedNumber.slice(-2).toLowerCase())) {
        // Build a pseudo candidate with parent AG
        subCand = { questionId: sq.id, answerGroupId: parentAgId, evidence: [buildEvidence("SUBQUESTION_MATCH", "subpart", 0.78, `Subpart ${sq.normalizedNumber} within parent answer`, 0.9)], score: 0.78 };
      }
    }
    // Also search other AGs with subpart label matching
    const candidates: MappingCandidate[] = [];
    if (subCand) candidates.push(subCand);
    // Add other AGs that have explicit subpart label e.g., 11(a) etc.
    for (const aev of answerEvidences) {
      if (aev.subpartHint && sq.normalizedNumber.endsWith(aev.subpartHint)) {
        candidates.push({ questionId: sq.id, answerGroupId: aev.answerGroupId, evidence: [buildEvidence("SUBQUESTION_MATCH", "subpart", 0.82, `Label ${aev.subpartHint} matches ${sq.normalizedNumber}`, 1.0)], score: 0.82 });
      }
    }
    if (candidates.length === 0) {
      decisions.push({ id: generateId(), questionId: sq.id, answerIds: [], status: "UNANSWERED", confidence: 0, evidence: [], highlightRegions: [] });
    } else {
      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0];
      const isParentMatched = !!parentAgId;
      const status = best.score >= 0.75 && isParentMatched ? "MATCHED" : best.score >= 0.5 ? "UNCERTAIN" : "UNANSWERED";
      const ag = answerGroups.find((g) => g.id === best.answerGroupId);
      const hl: HighlightRegion[] = ag ? (() => { const byPage = new Map<string, any[]>(); for (const r of ag.regions) { if (!byPage.has(r.pageId)) byPage.set(r.pageId, []); byPage.get(r.pageId)!.push(...r.normalizedBoxes); } return Array.from(byPage.entries()).map(([pid, boxes]) => ({ pageId: pid, boxes: mergeBoxesForHighlightLocal(boxes), confidence: best.score, source: "subpart" })); })() : [];
      decisions.push({ id: generateId(), questionId: sq.id, answerGroupId: best.answerGroupId, answerIds: [best.answerGroupId], primaryAnswerId: best.answerGroupId, status: status as any, confidence: best.score, mappingConfidence: best.score, evidence: best.evidence, highlightRegions: status === "MATCHED" ? hl : [] });
    }
  }

  const unmatchedAnswers = answerGroups.filter((ag) => !used.has(ag.id));
  // For UNMATCHED answers, create decisions with evidence explaining why not matched
  // Already handled via assignment.unassignedAnswers

  return { decisions, answerEvidences, anchors, sequenceHyps: seqMap, debugPerQuestion, unmatchedAnswers };
}

export async function writeMappingDebugArtifacts(jobId: string, debugPerQuestion: Map<string, any>, questions: QuestionNode[]) {
  try {
    const safe = jobId.replace(/[^a-zA-Z0-9-]/g, "");
    const artDir = path.join(process.cwd(), "artifacts", safe, "mapping");
    await fs.mkdir(artDir, { recursive: true });
    for (const q of questions.filter((qq) => qq.depth === 0)) {
      const dbg = debugPerQuestion.get(q.id);
      if (!dbg) continue;
      const numPad = q.normalizedNumber.padStart(2, "0").replace(/\(.*/, "");
      const fileName = `Q${numPad}.json`;
      // Also include full candidate list
      await fs.writeFile(path.join(artDir, fileName), JSON.stringify({
        questionId: q.id,
        number: q.normalizedNumber,
        displayNumber: q.displayNumber,
        candidates: dbg.candidates,
        chosen: dbg.finalDecision,
        visionAdjudication: dbg.visionAdjudication || null,
        anchorContext: dbg.anchorContext || null,
        answerEvidence: dbg.answerEvidence || null,
      }, null, 2), "utf-8");
    }
    // Also write combined mapping-debug.json for compat
    const combined = questions.filter((qq) => qq.depth === 0).map((q) => {
      const dbg = debugPerQuestion.get(q.id);
      return {
        questionId: q.id,
        questionNumber: q.normalizedNumber,
        status: dbg?.finalDecision?.status || "UNANSWERED",
        answerGroupId: dbg?.finalDecision?.answerGroupId || null,
        confidence: dbg?.finalDecision?.confidence || 0,
        evidence: dbg?.finalDecision?.evidence || [],
        candidates: dbg?.candidates || [],
      };
    });
    await fs.writeFile(path.join(artDir, "mapping-debug.json"), JSON.stringify(combined, null, 2), "utf-8");
    await fs.writeFile(path.join(process.cwd(), "artifacts", safe, "mapping-debug.json"), JSON.stringify(combined, null, 2), "utf-8");
    // tmp for debug
    const tmpDir = path.join(os.tmpdir(), "veda-ai", safe, "debug");
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(path.join(tmpDir, "mapping-debug.json"), JSON.stringify(combined, null, 2), "utf-8");
    console.log(JSON.stringify({ stage: "MAPPING", event: "debug_artifacts_written", jobId, dir: artDir, count: combined.length }));
  } catch (e: any) {
    console.warn(JSON.stringify({ stage: "MAPPING", event: "debug_write_failed", error: e.message?.slice(0, 200) }));
  }
}
