import type { DecisionStatus, Evidence, MappingCandidate } from "@/types";
import { aggregateScore } from "@/lib/evidence/aggregate";
import { mappingThresholds } from "@/lib/config";

export interface DecisionInput {
  candidates: MappingCandidate[]; // sorted descending by score
}

export function decideForQuestion(
  candidates: MappingCandidate[]
): { status: DecisionStatus; chosen?: MappingCandidate; confidence: number; evidence: Evidence[] } {
  if (candidates.length === 0) {
    return { status: "UNANSWERED", confidence: 0, evidence: [] };
  }
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const second = sorted[1];
  const topScore = top.score;
  const margin = second ? topScore - second.score : 1;

  const high = mappingThresholds.high;
  const review = mappingThresholds.review;

  // If topScore below review → UNMATCHED (but this is per answer? For question perspective, UNANSWERED)
  if (topScore < review) {
    return {
      status: "UNCERTAIN",
      confidence: topScore,
      evidence: top.evidence,
    };
  }

  // If margin small and both above review → UNCERTAIN
  if (second && margin < 0.15 && second.score >= review) {
    return {
      status: "UNCERTAIN",
      confidence: topScore,
      evidence: [
        ...top.evidence,
        {
          type: "SEMANTIC_SIMILARITY",
          source: "decision",
          score: margin,
          explanation: `Top two candidates close (margin ${margin.toFixed(2)}), requires review`,
          reliability: 0.8,
        },
      ],
    };
  }

  const status: DecisionStatus = topScore >= high ? "MATCHED" : "UNCERTAIN";
  return { status, chosen: top, confidence: topScore, evidence: top.evidence };
}

export function decideForAnswerGroup(
  candidates: MappingCandidate[]
): { status: DecisionStatus; chosen?: MappingCandidate; confidence: number } {
  if (candidates.length === 0) return { status: "UNMATCHED", confidence: 0 };
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const second = sorted[1];
  const margin = second ? top.score - second.score : 1;
  if (top.score < mappingThresholds.review) return { status: "UNMATCHED", confidence: top.score };
  if (second && margin < 0.15 && second.score >= mappingThresholds.review) {
    return { status: "UNCERTAIN", confidence: top.score };
  }
  return { status: top.score >= mappingThresholds.high ? "MATCHED" : "UNCERTAIN", chosen: top, confidence: top.score };
}
