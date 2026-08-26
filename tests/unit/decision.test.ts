import { describe, it, expect } from "vitest";
import { decideForQuestion } from "@/lib/decision";

describe("decision", () => {
  it("MATCHED when high confidence", () => {
    const res = decideForQuestion([
      { questionId: "q1", answerGroupId: "a1", evidence: [], score: 0.85 },
      { questionId: "q1", answerGroupId: "a2", evidence: [], score: 0.4 },
    ]);
    expect(res.status).toBe("MATCHED");
  });
  it("UNCERTAIN when top < high but >= review", () => {
    const res = decideForQuestion([
      { questionId: "q1", answerGroupId: "a1", evidence: [], score: 0.6 },
    ]);
    expect(res.status).toBe("UNCERTAIN");
  });
  it("UNCERTAIN when margin small", () => {
    const res = decideForQuestion([
      { questionId: "q1", answerGroupId: "a1", evidence: [], score: 0.8 },
      { questionId: "q1", answerGroupId: "a2", evidence: [], score: 0.78 },
    ]);
    expect(res.status).toBe("UNCERTAIN");
  });
  it("UNANSWERED when no candidates", () => {
    const res = decideForQuestion([]);
    expect(res.status).toBe("UNANSWERED");
  });
});
