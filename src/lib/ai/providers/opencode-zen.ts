import type { AIProvider, ExtractStructureInput, DetectAnswersInput, AmbiguousMappingInput } from "@/lib/ai";
import { AppError, ErrorCodes } from "@/lib/errors/codes";

/**
 * @deprecated — Migrated to OpenRouter + qwen/qwen3-vl-32b-instruct.
 * Retained only to surface a clear error if legacy AI_PROVIDER=opencode-zen is still configured.
 * Use OPENROUTER_API_KEY + src/lib/ai/providers/openrouter.ts
 */
export class OpencodeZenProvider implements AIProvider {
  private fail(): never {
    throw new AppError(
      ErrorCodes.CONFIGURATION_ERROR,
      "Legacy provider opencode-zen removed. Migrate to OpenRouter: set OPENROUTER_API_KEY and AI_PROVIDER=openrouter (model qwen/qwen3-vl-32b-instruct, base https://openrouter.ai/api/v1). See .env.example"
    );
  }
  async extractStructure(_input: ExtractStructureInput): Promise<any> { this.fail(); }
  async detectAnswerRegions(_input: DetectAnswersInput): Promise<any> { this.fail(); }
  async analyzeAmbiguousMapping(_input: AmbiguousMappingInput): Promise<any> { this.fail(); }
}
