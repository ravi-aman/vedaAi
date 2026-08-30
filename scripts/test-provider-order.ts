import * as dotenv from "dotenv";
dotenv.config();
import { clearConfigCache, getVisionRuntimeConfig, getVisionProviderConfigs, getOrderedEnabledProviders } from "@/lib/config";
import { clearVisionProviderCache, getVisionProviderChain, getPreferredProviderConfig } from "@/lib/vision/factory";

function testCase(name: string, env: Record<string, string>, expectedOrder: string[], expectedPreferred: string) {
  for (const k of Object.keys(process.env).filter(k=>k.includes("VISION")||k.includes("OPENROUTER")||k.includes("OPENCODE")||k.includes("NVIDIA"))) {
    // Keep original but override below
  }
  Object.assign(process.env, env);
  clearConfigCache();
  clearVisionProviderCache();
  const runtime = getVisionRuntimeConfig();
  const ordered = getOrderedEnabledProviders();
  const chain = getVisionProviderChain();
  const pref = getPreferredProviderConfig();
  const ok = JSON.stringify(runtime.providerOrder)===JSON.stringify(expectedOrder) && (pref?.id||null)===expectedPreferred && JSON.stringify(chain.map(p=>p.id))===JSON.stringify(expectedOrder.filter(id=> ordered.some(c=>c.id===id)));
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: order=${runtime.providerOrder.join(",")} preferred=${pref?.id} chain=${chain.map(p=>p.id).join(",")} expectedOrder=${expectedOrder.join(",")} expectedPref=${expectedPreferred}`);
  if (!ok) {
    console.log("  runtime", runtime);
    console.log("  ordered", ordered.map(c=>c.id));
    console.log("  chain", chain.map(p=>p.id));
  }
  return ok;
}

async function main(){
  const baseEnv = { ...process.env };
  console.log("=== Provider Order Tests (no code change) ===");
  // Case A: openrouter,opencode,nvidia (default)
  testCase("A default", { VISION_PROVIDER_ORDER: "openrouter,opencode,nvidia", OPENROUTER_ENABLED: "true", OPENCODE_ENABLED: "true", NVIDIA_ENABLED: "false" }, ["openrouter","opencode","nvidia"], "openrouter");
  // B: opencode first
  testCase("B opencode first", { VISION_PROVIDER_ORDER: "opencode,openrouter,nvidia", OPENROUTER_ENABLED: "true", OPENCODE_ENABLED: "true", NVIDIA_ENABLED: "false" }, ["opencode","openrouter","nvidia"], "opencode");
  // C: nvidia first
  testCase("C nvidia first", { VISION_PROVIDER_ORDER: "nvidia,openrouter,opencode", OPENROUTER_ENABLED: "true", OPENCODE_ENABLED: "true", NVIDIA_ENABLED: "true", NVIDIA_API_KEY: "test-key", OPENROUTER_API_KEY: "test-key", OPENCODE_API_KEY: "test-key" }, ["nvidia","openrouter","opencode"], "nvidia");
  // D: only openrouter
  testCase("D only openrouter", { VISION_PROVIDER_ORDER: "openrouter,opencode,nvidia", OPENROUTER_ENABLED: "true", OPENCODE_ENABLED: "false", NVIDIA_ENABLED: "false" }, ["openrouter","opencode","nvidia"], "openrouter");
  // E: only opencode
  testCase("E only opencode", { VISION_PROVIDER_ORDER: "openrouter,opencode,nvidia", OPENROUTER_ENABLED: "false", OPENCODE_ENABLED: "true", NVIDIA_ENABLED: "false", OPENCODE_API_KEY: "test-key" }, ["openrouter","opencode","nvidia"], "opencode");
  // F: only nvidia
  testCase("F only nvidia", { VISION_PROVIDER_ORDER: "openrouter,opencode,nvidia", OPENROUTER_ENABLED: "false", OPENCODE_ENABLED: "false", NVIDIA_ENABLED: "true", NVIDIA_API_KEY: "test-key" }, ["openrouter","opencode","nvidia"], "nvidia");
  // G: preferred disabled -> fallback
  testCase("G fallback", { VISION_PROVIDER_ORDER: "nvidia,openrouter,opencode", OPENROUTER_ENABLED: "true", OPENCODE_ENABLED: "true", NVIDIA_ENABLED: "false", NVIDIA_API_KEY: "", OPENROUTER_API_KEY: "test-key", OPENCODE_API_KEY: "test-key" }, ["nvidia","openrouter","opencode"], "openrouter");

  // Model switching test
  console.log("\n=== Model Switching (no code change) ===");
  clearConfigCache(); clearVisionProviderCache();
  process.env.OPENROUTER_VISION_MODEL = "qwen/qwen3-vl-8b-instruct";
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_ENABLED = "true";
  clearConfigCache(); clearVisionProviderCache();
  let cfg = getVisionProviderConfigs();
  console.log(`OPENROUTER_VISION_MODEL switch: ${cfg.openrouter.model} ${cfg.openrouter.model==="qwen/qwen3-vl-8b-instruct" ? "PASS" : "FAIL"}`);
  process.env.OPENROUTER_VISION_MODEL = "qwen/qwen3-vl-32b-instruct";
  clearConfigCache(); clearVisionProviderCache();
  cfg = getVisionProviderConfigs();
  console.log(`Back to 32b: ${cfg.openrouter.model} ${cfg.openrouter.model==="qwen/qwen3-vl-32b-instruct" ? "PASS" : "FAIL"}`);

  // Restore
  Object.assign(process.env, baseEnv);
  clearConfigCache(); clearVisionProviderCache();
  console.log("\nAll provider order tests done");
}
main().catch(e=>{ console.error(e); process.exit(1); });
