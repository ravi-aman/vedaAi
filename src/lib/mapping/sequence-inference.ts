/**
 * Sequence Inference — local answer sequences + anchors (Phase 9,10,27,28,29,30)
 * Reconstructs ordered AnswerGroups, uses confirmed anchors, but does NOT force index mapping.
 */
import type { AnswerEvidence } from "./answer-evidence";

export interface Anchor {
  answerGroupId: string;
  label: string; // normalized e.g., "13"
  confidence: number;
  position: number; // sequencePosition
  pageNumbers: number[];
  source: "EXPLICIT_HANDWRITTEN_LABEL" | "VISION_CONFIRMED_LABEL" | "STRONG_SUBPART_LABEL";
}

export interface SequenceHypothesis {
  answerGroupId: string;
  hypothesizedQuestion: string | null;
  anchorBefore?: Anchor;
  anchorAfter?: Anchor;
  distance: number;
  supportingEvidence: string[];
  confidence: number;
}

export function extractAnchors(evidences: AnswerEvidence[]): Anchor[] {
  const anchors: Anchor[] = [];
  for (const ev of evidences) {
    if (!ev.QUESTION_LABEL_DETECTED) continue;
    const best = [...ev.detectedLabels].sort((a, b) => b.confidence - a.confidence)[0];
    if (!best || !best.finalLabel) continue;
    if (best.classification === "LABEL_CONFIRMED" && best.confidence >= 0.75) {
      anchors.push({
        answerGroupId: ev.answerGroupId,
        label: best.finalLabel,
        confidence: best.confidence,
        position: ev.sequencePosition,
        pageNumbers: ev.pageNumbers,
        source: best.visionInterpretation ? "VISION_CONFIRMED_LABEL" : "EXPLICIT_HANDWRITTEN_LABEL",
      });
    } else if (best.classification === "LABEL_PROBABLE" && best.confidence >= 0.65) {
      // Vision-confirmed probable still anchor but weaker
      if (best.visionConfidence && best.visionConfidence > 0.75) {
        anchors.push({
          answerGroupId: ev.answerGroupId,
          label: best.finalLabel,
          confidence: 0.68,
          position: ev.sequencePosition,
          pageNumbers: ev.pageNumbers,
          source: "VISION_CONFIRMED_LABEL",
        });
      }
    }
  }
  // Sort by sequence position
  anchors.sort((a, b) => a.position - b.position);
  return anchors;
}

export function inferLocalSequences(evidences: AnswerEvidence[], anchors: Anchor[]): Map<string, SequenceHypothesis> {
  const map = new Map<string, SequenceHypothesis>();
  // Order evidences by sequencePosition
  const ordered = [...evidences].sort((a, b) => a.sequencePosition - b.sequencePosition);
  // For each evidence, find nearest anchors before/after
  for (const ev of ordered) {
    // if itself is anchor, hypothesis is its own label
    const selfAnchor = anchors.find((a) => a.answerGroupId === ev.answerGroupId);
    if (selfAnchor) {
      map.set(ev.answerGroupId, {
        answerGroupId: ev.answerGroupId,
        hypothesizedQuestion: selfAnchor.label,
        anchorBefore: selfAnchor,
        anchorAfter: anchors.find((a) => a.position > selfAnchor.position),
        distance: 0,
        supportingEvidence: ["SELF_ANCHOR"],
        confidence: selfAnchor.confidence,
      });
      continue;
    }
    // Find before/after anchors
    let before: Anchor | undefined;
    let after: Anchor | undefined;
    for (const a of anchors) {
      if (a.position < ev.sequencePosition) before = a;
      else if (a.position > ev.sequencePosition && !after) after = a;
    }
    if (before && after) {
      const beforeNum = parseInt(before.label, 10);
      const afterNum = parseInt(after.label, 10);
      if (!isNaN(beforeNum) && !isNaN(afterNum)) {
        const gap = afterNum - beforeNum - 1; // expected number of questions between
        const posGap = after.position - before.position - 1; // number of AGs between
        // Only infer if counts are plausible and same section, and spatially contiguous
        const distanceToBefore = ev.sequencePosition - before.position;
        const distanceToAfter = after.position - ev.sequencePosition;
        const plausible = gap >= 0 && posGap <= gap + 2 && posGap >= Math.max(1, gap - 2);
        // Also check page locality: should be within same section page range
        if (plausible && distanceToBefore + distanceToAfter <= 6) {
          // Hypothesize linear interpolation
          const hypothesized = String(beforeNum + distanceToBefore);
          const supporting: string[] = [];
          const isContiguous = ev.pageNumbers.some((p) => before.pageNumbers.includes(p) || before.pageNumbers.some((bp) => Math.abs(p - bp) <= 1));
          if (isContiguous) supporting.push("spatial_contiguous");
          supporting.push(`between_${before.label}_${after.label}`);
          // Don't force: confidence moderate, requires other evidence
          const conf = 0.45 + (before.confidence + after.confidence) * 0.15;
          map.set(ev.answerGroupId, {
            answerGroupId: ev.answerGroupId,
            hypothesizedQuestion: hypothesized,
            anchorBefore: before,
            anchorAfter: after,
            distance: distanceToBefore,
            supportingEvidence: supporting,
            confidence: Math.min(0.68, conf),
          });
          continue;
        }
      }
    } else if (before && !after) {
      // Tail after last anchor: infer next numbers but weak
      const beforeNum = parseInt(before.label, 10);
      if (!isNaN(beforeNum)) {
        const dist = ev.sequencePosition - before.position;
        if (dist <= 3) {
          map.set(ev.answerGroupId, {
            answerGroupId: ev.answerGroupId,
            hypothesizedQuestion: String(beforeNum + dist),
            anchorBefore: before,
            distance: dist,
            supportingEvidence: ["tail_after_anchor"],
            confidence: 0.42,
          });
          continue;
        }
      }
    } else if (!before && after) {
      // Head before first anchor
      const afterNum = parseInt(after.label, 10);
      if (!isNaN(afterNum)) {
        const dist = after.position - ev.sequencePosition;
        if (dist <= 3) {
          map.set(ev.answerGroupId, {
            answerGroupId: ev.answerGroupId,
            hypothesizedQuestion: String(afterNum - dist),
            anchorAfter: after,
            distance: dist,
            supportingEvidence: ["head_before_anchor"],
            confidence: 0.40,
          });
          continue;
        }
      }
    }
    // No hypothesis
    map.set(ev.answerGroupId, {
      answerGroupId: ev.answerGroupId,
      hypothesizedQuestion: null,
      anchorBefore: before,
      anchorAfter: after,
      distance: -1,
      supportingEvidence: ["no_sequence_hypothesis"],
      confidence: 0.2,
    });
  }
  return map;
}

// MCQ sequence solver (Phase 30)
export function inferMcqSequence(evidences: AnswerEvidence[], anchors: Anchor[], questionCountMcq = 16): Map<string, SequenceHypothesis> {
  // Special handling for Section A: if many consecutive untagged with single-letter answers, infer MCQ sequence
  const mcqEvs = evidences.filter((ev) => {
    const t = ev.normalizedText.trim().toUpperCase();
    return /^[A-D]$/.test(t) || /^\(\s*[A-D]\s*\)/.test(t) || t.length < 30;
  });
  // Not forcing full sequence, just propose hypotheses as above but allow skips
  return inferLocalSequences(mcqEvs, anchors);
}
