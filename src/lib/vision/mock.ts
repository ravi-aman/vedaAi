import type { VisionProvider, VisionAnalyzePageInput, VisionAnalyzeDocumentInput, VisionPageStructure, VisionDocumentAnalysis } from "./provider";

export class MockVisionProvider implements VisionProvider {
  async analyzePage(input: VisionAnalyzePageInput): Promise<VisionPageStructure> {
    return {
      pageNumber: input.pageNumber,
      visualRegions: [],
      questionCandidates: [],
      answerGroupHints: [],
      documentStructureHints: { difficulty: "easy" },
    };
  }
  async analyzeDocumentStructure(input: VisionAnalyzeDocumentInput): Promise<VisionDocumentAnalysis> {
    return {
      pages: input.pages.map((p) => ({
        pageNumber: p.pageNumber,
        visualRegions: [],
        questionCandidates: [],
        answerGroupHints: [],
        documentStructureHints: { difficulty: "easy" },
      })),
      globalStructure: { notes: "mock" },
    };
  }
  async analyzeAnswerGrouping(input: VisionAnalyzeDocumentInput): Promise<VisionDocumentAnalysis> {
    return this.analyzeDocumentStructure(input);
  }
  async analyzeAmbiguousMapping(): Promise<{ mappings: unknown[] }> {
    return { mappings: [] };
  }
}
