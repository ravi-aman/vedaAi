import { getConfig } from "@/lib/config";
import { MockAIProvider } from "@/lib/ai/providers/mock";
import { OpenRouterProvider } from "@/lib/ai/providers/openrouter";
import type { AIProvider } from "@/lib/ai";

export function getAIProvider(): AIProvider {
  const cfg = getConfig();
  if (cfg.AI_PROVIDER === "mock") return new MockAIProvider();
  // Single canonical provider: OpenRouter + qwen/qwen3-vl-32b-instruct
  // All non-mock paths use OpenRouter (legacy opencode-zen/openai removed)
  return new OpenRouterProvider();
}
