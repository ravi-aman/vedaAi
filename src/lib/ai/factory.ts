import { getConfig } from "@/lib/config";
import { OpenAIProvider } from "@/lib/ai/providers/openai";
import { MockAIProvider } from "@/lib/ai/providers/mock";
import type { AIProvider } from "@/lib/ai";

export function getAIProvider(): AIProvider {
  const cfg = getConfig();
  if (cfg.AI_PROVIDER === "mock") return new MockAIProvider();
  // openai and openai-compatible both use OpenAI SDK with baseURL
  return new OpenAIProvider();
}
