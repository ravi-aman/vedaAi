import type { AIProvider, ExtractStructureInput, DetectAnswersInput, AmbiguousMappingInput } from "@/lib/ai";

/**
 * Mock provider for tests and when AI_API_KEY not configured.
 * Returns deterministic fixture-like data, never used in production when AI_PROVIDER != mock.
 * Production route handlers guard: if AI_PROVIDER !== mock, mock is never imported.
 */
export class MockAIProvider implements AIProvider {
  async extractStructure(input: ExtractStructureInput) {
    // Heuristic fallback: generate 3 generic questions if no real AI
    const questions = [
      {
        rawNumber: "1",
        normalizedNumber: "1",
        text: "Sample question 1 extracted via heuristic (mock). Replace with real AI in production.",
        rawText: "1. Sample question 1",
        pageRefs: [input.pages[0]?.pageId || "p1"],
        sourceRegions: [{ pageId: input.pages[0]?.pageId || "p1", box: [0.05, 0.1, 0.9, 0.05] as [number, number, number, number] }],
        parentNumber: null,
        partType: "QUESTION" as const,
        marks: 5,
        confidence: 0.85,
        evidence: ["heuristic fallback"],
      },
      {
        rawNumber: "2",
        normalizedNumber: "2",
        text: "Sample question 2 with subparts",
        rawText: "2. Sample question 2",
        pageRefs: [input.pages[0]?.pageId || "p1"],
        sourceRegions: [{ pageId: input.pages[0]?.pageId || "p1", box: [0.05, 0.2, 0.9, 0.05] as [number, number, number, number] }],
        parentNumber: null,
        partType: "QUESTION" as const,
        marks: 5,
        confidence: 0.82,
        evidence: ["heuristic fallback"],
      },
      {
        rawNumber: "2(a)",
        normalizedNumber: "2(a)",
        text: "Subpart (a) of question 2",
        rawText: "2(a) Subpart a",
        pageRefs: [input.pages[0]?.pageId || "p1"],
        sourceRegions: [{ pageId: input.pages[0]?.pageId || "p1", box: [0.07, 0.25, 0.88, 0.04] as [number, number, number, number] }],
        parentNumber: "2",
        partType: "PART" as const,
        marks: 2,
        confidence: 0.8,
        evidence: ["heuristic fallback"],
      },
    ];
    return { questions };
  }

  async detectAnswerRegions(input: DetectAnswersInput) {
    // Generate one region per page
    const regions = input.pages.map((p, idx) => ({
      pageId: p.pageId,
      boxes: [[0.08, 0.15 + idx * 0.05, 0.84, 0.2] as [number, number, number, number]],
      rawText: `Mock answer region ${idx + 1}`,
      questionLabel: idx === 0 ? "1" : idx === 1 ? "2" : null,
      labelConfidence: idx < 2 ? 0.9 : 0.2,
      visualConfidence: 0.75,
      ocrConfidence: 0.7,
      orderIndex: idx,
    }));
    return { regions };
  }

  async analyzeAmbiguousMapping(input: AmbiguousMappingInput) {
    // Simple label-based mapping
    const mappings = input.answerGroups.map((ag, idx) => {
      const q = input.questions.find((qq) => qq.normalizedNumber === (ag.label || "")) || input.questions[idx];
      if (!q) return { questionId: input.questions[0]?.id || "q1", answerGroupId: ag.id, confidence: 0.2, status: "UNMATCHED" as const, evidence: [{ type: "EXPLICIT_QUESTION_LABEL", explanation: "No candidate", score: 0.2 }] };
      const isMatch = ag.label === q.normalizedNumber;
      return {
        questionId: q.id,
        answerGroupId: ag.id,
        confidence: isMatch ? 0.92 : 0.55,
        status: isMatch ? ("MATCHED" as const) : ("UNCERTAIN" as const),
        evidence: [{ type: isMatch ? "EXPLICIT_QUESTION_LABEL" : "SEMANTIC_SIMILARITY", explanation: isMatch ? `Label ${ag.label} matched` : "Weak semantic", score: isMatch ? 0.9 : 0.5 }],
      };
    });
    return { mappings };
  }
}

export function createMockProvider(): AIProvider {
  return new MockAIProvider();
}
