import { getConfig } from "@/lib/config";
import type { VisionProvider } from "./provider";
import { MockVisionProvider } from "./mock";
import { OpenRouterVisionProvider } from "./openrouter-vision";

let cached: VisionProvider | null = null;

export function getVisionProvider(): VisionProvider | null {
  const cfg = getConfig() as any;
  const provider = (cfg.VISION_PROVIDER || "auto") as string;
  if (provider === "disabled") return null;
  if (provider === "mock") {
    if (!cached || !(cached instanceof MockVisionProvider)) cached = new MockVisionProvider();
    return cached;
  }
  // For openrouter/auto, check key directly from process.env as fallback if getConfig cached stale
  // This handles stale config cache where getConfig() was called before .env loaded
  const hasKeyViaConfig = Boolean(cfg.OPENROUTER_API_KEY || cfg.VISION_API_KEY || cfg.AI_API_KEY);
  const hasKeyViaEnv = Boolean(process.env.OPENROUTER_API_KEY || process.env.VISION_API_KEY || process.env.AI_API_KEY);
  const hasKey = hasKeyViaConfig || hasKeyViaEnv;
  if (provider === "openrouter" || provider === "auto") {
    if (provider === "auto" && !hasKey) {
      console.warn(JSON.stringify({ stage: "VISION", event: "provider_no_key", provider, hasKeyViaConfig, hasKeyViaEnv, configKeyPresent: Boolean(cfg.OPENROUTER_API_KEY) }));
      return null;
    }
    if (!cached || !(cached instanceof OpenRouterVisionProvider)) cached = new OpenRouterVisionProvider();
    return cached;
  }
  // Legacy fallback
  if (hasKey) {
    if (!cached || !(cached instanceof OpenRouterVisionProvider)) cached = new OpenRouterVisionProvider();
    return cached;
  }
  return null;
}

export function getVisionDiagnostics(): { provider: string; model: string; baseUrl: string; keyPresent: boolean; enabled: boolean; cached: boolean } {
  const cfg = getConfig() as any;
  const provider = (cfg.VISION_PROVIDER || "auto") as string;
  const hasKey = Boolean(cfg.OPENROUTER_API_KEY || cfg.VISION_API_KEY || cfg.AI_API_KEY || process.env.OPENROUTER_API_KEY);
  return {
    provider,
    model: cfg.OPENROUTER_MODEL || cfg.VISION_MODEL || "qwen/qwen3-vl-32b-instruct",
    baseUrl: cfg.OPENROUTER_BASE_URL || cfg.VISION_BASE_URL || "https://openrouter.ai/api/v1",
    keyPresent: hasKey,
    enabled: provider !== "disabled",
    cached: !!cached,
  };
}

export function clearVisionProviderCache() {
  cached = null;
}

export function setVisionProviderForTest(p: VisionProvider | null) {
  cached = p;
}

export function isVisionEnabled(): boolean {
  const cfg = getConfig() as any;
  return (cfg.VISION_PROVIDER || "auto") !== "disabled";
}
