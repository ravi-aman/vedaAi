import { getConfig, getVisionRuntimeConfig, getVisionProviderConfigs, getOrderedEnabledProviders, clearConfigCache } from "@/lib/config";
import type { VisionProvider, VisionProviderId, VisionProviderConfig } from "./provider";
import { MockVisionProvider } from "./mock";
import { OpenRouterVisionProvider } from "./providers/openrouter";
import { NvidiaVisionProvider } from "./providers/nvidia";
import { OpenCodeVisionProvider } from "./providers/opencode";

// Cached per provider id
const cache = new Map<VisionProviderId | "mock", VisionProvider>();

function createProviderForConfig(cfg: VisionProviderConfig): VisionProvider {
  const runtime = getVisionRuntimeConfig();
  const opts = { timeoutMs: runtime.timeoutMs, maxRetries: runtime.maxRetries };
  // Validate required fields — no silent fallback
  if (!cfg.model) throw new Error(`CONFIGURATION_ERROR: ${cfg.id.toUpperCase()}_VISION_MODEL missing but ${cfg.id} enabled`);
  if (!cfg.baseUrl) throw new Error(`CONFIGURATION_ERROR: ${cfg.id.toUpperCase()}_BASE_URL missing`);
  if (!cfg.apiKey) throw new Error(`CONFIGURATION_ERROR: ${cfg.id.toUpperCase()}_API_KEY missing but ${cfg.id} enabled`);
  switch (cfg.id) {
    case "openrouter": return new OpenRouterVisionProvider(cfg, opts);
    case "nvidia": return new NvidiaVisionProvider(cfg, opts);
    case "opencode": return new OpenCodeVisionProvider(cfg, opts);
    default: throw new Error(`CONFIGURATION_ERROR: unknown provider ${cfg.id}`);
  }
}

export function getVisionProvider(): VisionProvider | null {
  const cfg: any = getConfig();
  // Legacy mock support
  const legacyProvider = (cfg.VISION_PROVIDER as string | undefined);
  if (legacyProvider === "mock") {
    if (!cache.has("mock")) cache.set("mock", new MockVisionProvider());
    return cache.get("mock")!;
  }
  if (legacyProvider === "disabled") return null;
  // If no enabled providers and no keys, no vision (allow Vision-Only even when OCR_PROVIDER=mock if keys exist)
  const all = getVisionProviderConfigs() as any;
  const enabled = getOrderedEnabledProviders();
  if (enabled.length === 0) {
    const hasAnyKey = Boolean(all.openrouter?.apiKey || all.nvidia?.apiKey || all.opencode?.apiKey);
    if (!hasAnyKey) return null;
  }
  const preferred = getPreferredProviderConfig();
  if (!preferred) return null;
  // Return cached preferred
  if (!cache.has(preferred.id)) {
    try { cache.set(preferred.id, createProviderForConfig(preferred)); } catch (e) { console.warn(JSON.stringify({ stage: "VISION", event: "create_provider_failed", provider: preferred.id, error: String((e as any).message).slice(0,300) })); return null; }
  }
  return cache.get(preferred.id)!;
}

export function getPreferredProviderConfig(): VisionProviderConfig | null {
  const ordered = getOrderedEnabledProviders();
  return ordered[0] || null;
}

export function getVisionProviderChain(): VisionProvider[] {
  const ordered = getOrderedEnabledProviders();
  const providers: VisionProvider[] = [];
  for (const cfg of ordered) {
    let p = cache.get(cfg.id);
    if (!p) {
      try { p = createProviderForConfig(cfg); cache.set(cfg.id, p); } catch (e: any) {
        console.warn(JSON.stringify({ stage: "VISION", event: "chain_skip_provider_config_error", provider: cfg.id, error: String(e.message).slice(0,300) }));
        continue;
      }
    }
    providers.push(p);
  }
  // Also include mock if explicitly tested
  return providers;
}

export function getVisionProviderForId(id: VisionProviderId): VisionProvider | null {
  const all = getVisionProviderConfigs();
  const cfg = (all as any)[id] as VisionProviderConfig | undefined;
  if (!cfg || !cfg.enabled) return null;
  if (!cache.has(id)) {
    try { cache.set(id, createProviderForConfig(cfg)); } catch { return null; }
  }
  return cache.get(id)!;
}

export function getVisionDiagnostics(): { providerOrder: string; preferred: string | null; providers: Array<{ id: string; model: string; baseUrl: string; keyPresent: boolean; enabled: boolean }>; global: any; cached: boolean } {
  const runtime = getVisionRuntimeConfig();
  const all = getVisionProviderConfigs();
  const ordered = getOrderedEnabledProviders();
  return {
    providerOrder: runtime.providerOrder.join(","),
    preferred: ordered[0]?.id || null,
    providers: (Object.keys(all) as VisionProviderId[]).map(id => {
      const c = (all as any)[id] as VisionProviderConfig;
      return { id, model: c.model, baseUrl: c.baseUrl, keyPresent: Boolean(c.apiKey), enabled: c.enabled };
    }),
    global: { timeoutMs: runtime.timeoutMs, maxRetries: runtime.maxRetries, batchSize: runtime.batchSize, globalConcurrency: runtime.globalConcurrency, autoFallback: runtime.autoFallback },
    cached: cache.size > 0,
  };
}

export function clearVisionProviderCache() {
  cache.clear();
}

export function setVisionProviderForTest(p: VisionProvider | null) {
  if (!p) { cache.clear(); return; }
  // Mock test helper — store under mock or its id
  const id = (p as any).id || "mock";
  cache.set(id as any, p);
}

export function isVisionEnabled(): boolean {
  const ordered = getOrderedEnabledProviders();
  // Also check legacy disabled
  const cfg: any = getConfig();
  if ((cfg.VISION_PROVIDER as string) === "disabled") return false;
  return ordered.length > 0;
}

// Backwards compat for runner that checked VISION_PROVIDER auto — now use order
