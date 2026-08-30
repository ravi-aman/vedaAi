// @ts-nocheck
import type { VisionProvider, VisionAnalyzePageInput, VisionAnalyzeDocumentInput, VisionPageStructure, VisionDocumentAnalysis } from "./provider";

export class MockVisionProvider implements VisionProvider {
  readonly id = "openrouter" as const; // mock pretends openrouter for tests
  readonly capabilities = { visionInput: false, structuredOutput: true, multiImage: false, imageToText: false, maxImagesPerRequest: 0 } as const;
  async preflight(): Promise<any> { return { provider: "openrouter", model: "mock", ok: true, available: true, reason: "mock", latencyMs: 0, capabilities: this.capabilities }; }
  async analyzePage(input: VisionAnalyzePageInput): Promise<VisionPageStructure> {
    return {
      pageNumber: input.pageNumber,
      visualRegions: [],
      questionCandidates: [],
      answerGroupHints: [],
      documentStructureHints: { difficulty: "easy" } as any,
    } as any;
  }
  async analyzeDocumentStructure(input: VisionAnalyzeDocumentInput): Promise<VisionDocumentAnalysis> {
    return {
      pages: input.pages.map((p) => ({
        pageNumber: p.pageNumber,
        visualRegions: [],
        questionCandidates: [],
        answerGroupHints: [],
        documentStructureHints: { difficulty: "easy" } as any,
      })),
      globalStructure: { notes: "mock" } as any,
    } as any;
  }
  async analyzeAnswerGrouping(input: VisionAnalyzeDocumentInput): Promise<VisionDocumentAnalysis> {
    return this.analyzeDocumentStructure(input);
  }
  async analyzeAmbiguousMapping(): Promise<{ mappings: unknown[] }> {
    return { mappings: [] };
  }
}
