import type { VisionProvider, VisionAnalyzePageInput, VisionAnalyzeDocumentInput, VisionPageStructure, VisionDocumentAnalysis } from "./provider";
import { AppError, ErrorCodes } from "@/lib/errors/codes";

/**
 * @deprecated — Migrated to OpenRouter Qwen3-VL.
 * Use src/lib/vision/openrouter-vision.ts (OPENROUTER_API_KEY, qwen/qwen3-vl-32b-instruct)
 */
export class OpencodeVisionProvider implements VisionProvider {
  readonly id = "opencode" as const;
  readonly capabilities = { visionInput: true, structuredOutput: true, multiImage: false, imageToText: true, maxImagesPerRequest: 1 } as const;
  async preflight(): Promise<any> { this.fail(); }
  private fail(): never {
    throw new AppError(ErrorCodes.CONFIGURATION_ERROR, "Legacy opencode-vision.ts is deprecated — use src/lib/vision/providers/opencode.ts with OPENCODE_API_KEY");
  }
  async analyzePage(_input: VisionAnalyzePageInput): Promise<VisionPageStructure> { this.fail(); }
  async analyzeDocumentStructure(_input: VisionAnalyzeDocumentInput): Promise<VisionDocumentAnalysis> { this.fail(); }
  async analyzeAnswerGrouping(_input: VisionAnalyzeDocumentInput): Promise<VisionDocumentAnalysis> { this.fail(); }
  async analyzeAmbiguousMapping(_input: any): Promise<any> { this.fail(); }
}
