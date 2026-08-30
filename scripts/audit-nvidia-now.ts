import * as dotenv from "dotenv";
dotenv.config();
import { getVisionRuntimeConfig, getVisionProviderConfigs, getOrderedEnabledProviders } from "@/lib/config";
import { getVisionProviderChain, getPreferredProviderConfig } from "@/lib/vision/factory";

const rt = getVisionRuntimeConfig();
const cfgs = getVisionProviderConfigs() as any;
const ordered = getOrderedEnabledProviders();
const chain = getVisionProviderChain();
const pref = getPreferredProviderConfig();

console.log(JSON.stringify({
  providerOrder: rt.providerOrder,
  preferred: pref?.id || null,
  enabled: ordered.map((c:any)=>c.id),
  chain: chain.map(p=> (p as any).id),
  nvidia: { enabled: cfgs.nvidia.enabled, keyPresent: !!cfgs.nvidia.apiKey, baseUrl: cfgs.nvidia.baseUrl, model: cfgs.nvidia.model },
  openrouter: { enabled: cfgs.openrouter.enabled, keyPresent: !!cfgs.openrouter.apiKey, model: cfgs.openrouter.model },
  opencode: { enabled: cfgs.opencode.enabled, keyPresent: !!cfgs.opencode.apiKey, model: cfgs.opencode.model },
  global: { timeoutMs: rt.timeoutMs, batchSize: rt.batchSize, globalConcurrency: rt.globalConcurrency, autoFallback: rt.autoFallback }
}, null, 2));
console.log("\nWhy NVIDIA skipped: ", !cfgs.nvidia.enabled ? "NVIDIA_ENABLED=false" : "not in enabled chain");
