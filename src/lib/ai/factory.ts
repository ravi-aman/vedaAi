import { getConfig } from "@/lib/config";
import { OpenAIProvider } from "@/lib/ai/providers/openai";
import { MockAIProvider } from "@/lib/ai/providers/mock";
import { OpencodeZenProvider } from "@/lib/ai/providers/opencode-zen";
import type { AIProvider } from "@/lib/ai";

export function getAIProvider(): AIProvider {
  const cfg = getConfig();
  if (cfg.AI_PROVIDER === "mock") return new MockAIProvider();
  if (cfg.AI_PROVIDER === "opencode-zen") return new OpencodeZenProvider();
  // openai and openai-compatible both use OpenAI SDK with baseURL
  return new OpenAIProvider();
}
