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
  if (provider === "openrouter" || provider === "auto") {
    const hasKey = Boolean(cfg.OPENROUTER_API_KEY || cfg.VISION_API_KEY || cfg.AI_API_KEY);
    if (provider === "auto" && !hasKey) return null;
    if (!cached || !(cached instanceof OpenRouterVisionProvider)) cached = new OpenRouterVisionProvider();
    return cached;
  }
  // Legacy opencode-zen removed — fallback to openrouter if key present
  const hasKey = Boolean(cfg.OPENROUTER_API_KEY || cfg.VISION_API_KEY || cfg.AI_API_KEY);
  if (hasKey) {
    if (!cached || !(cached instanceof OpenRouterVisionProvider)) cached = new OpenRouterVisionProvider();
    return cached;
  }
  return null;
}

export function setVisionProviderForTest(p: VisionProvider | null) {
  cached = p;
}

export function isVisionEnabled(): boolean {
  const cfg = getConfig() as any;
  return (cfg.VISION_PROVIDER || "auto") !== "disabled";
}
