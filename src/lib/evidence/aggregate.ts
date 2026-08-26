import type { Evidence } from "@/types";

export function aggregateScore(evidence: Evidence[]): number {
  if (evidence.length === 0) return 0;
  let weightedSum = 0;
  let weightSum = 0;
  for (const e of evidence) {
    const w = e.reliability ?? 0.5;
    weightedSum += e.score * w;
    weightSum += w;
  }
  return weightSum === 0 ? 0 : weightedSum / weightSum;
}

export function marginBetween(top: number, second: number): number {
  return top - second;
}

export function buildEvidence(
  type: Evidence["type"],
  source: string,
  score: number,
  explanation: string,
  reliability = 0.5,
  metadata?: Record<string, unknown>
): Evidence {
  return { type, source, score, explanation, reliability, metadata };
}
