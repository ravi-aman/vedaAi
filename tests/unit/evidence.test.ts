import { describe, it, expect } from "vitest";
import { aggregateScore, buildEvidence } from "@/lib/evidence/aggregate";

describe("evidence aggregation", () => {
  it("weighted average", () => {
    const ev = [
      buildEvidence("EXPLICIT_QUESTION_LABEL", "test", 0.9, "high", 1.0),
      buildEvidence("SEMANTIC_SIMILARITY", "test", 0.5, "mid", 0.5),
    ];
    const score = aggregateScore(ev);
    // (0.9*1 +0.5*0.5)/1.5 = 1.15/1.5=0.766
    expect(score).toBeCloseTo(0.766, 2);
  });
  it("empty returns 0", () => {
    expect(aggregateScore([])).toBe(0);
  });
});
