import type { VisionProvider, VisionAnalyzePageInput, VisionAnalyzeDocumentInput, VisionPageStructure, VisionDocumentAnalysis } from "./provider";
import { AppError, ErrorCodes } from "@/lib/errors/codes";

/**
 * @deprecated — Migrated to OpenRouter Qwen3-VL.
 * Use src/lib/vision/openrouter-vision.ts (OPENROUTER_API_KEY, qwen/qwen3-vl-32b-instruct)
 */
export class OpencodeVisionProvider implements VisionProvider {
  private fail(): never {
    throw new AppError(ErrorCodes.CONFIGURATION_ERROR, "Legacy vision provider opencode-zen removed. Use VISION_PROVIDER=openrouter with OPENROUTER_API_KEY (qwen/qwen3-vl-32b-instruct)");
  }
  async analyzePage(_input: VisionAnalyzePageInput): Promise<VisionPageStructure> { this.fail(); }
  async analyzeDocumentStructure(_input: VisionAnalyzeDocumentInput): Promise<VisionDocumentAnalysis> { this.fail(); }
  async analyzeAnswerGrouping(_input: VisionAnalyzeDocumentInput): Promise<VisionDocumentAnalysis> { this.fail(); }
  async analyzeAmbiguousMapping(_input: any): Promise<any> { this.fail(); }
}
