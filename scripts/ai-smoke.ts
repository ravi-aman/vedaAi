/**
 * ai:smoke-test — real Opencode Zen inference
 * Loads AI_PROVIDER, calls Muse Spark 1.2, verifies response
 * Usage: npm run ai:smoke-test (requires AI_API_KEY set)
 */
import { getConfig, clearConfigCache } from "@/lib/config";

async function main() {
  // Force reload config (in case env changed)
  clearConfigCache();
  const cfg = getConfig();
  console.log(`Provider: ${cfg.AI_PROVIDER}`);
  console.log(`Model: ${cfg.AI_MODEL}`);
  console.log(`Endpoint: ${cfg.AI_BASE_URL || "https://opencode.ai/zen/v1"}`);
  console.log(`Authentication: ${cfg.AI_API_KEY ? "configured" : "MISSING"}`);

  if (cfg.AI_PROVIDER === "mock") {
    console.log("WARN: AI_PROVIDER=mock — smoke test will use mock, not real Zen. Set AI_PROVIDER=opencode-zen for real test.");
  }

  if (!cfg.AI_API_KEY || cfg.AI_API_KEY.includes("REPLACE")) {
    console.error("FAIL: AI_API_KEY not set or is placeholder. Set real key from https://opencode.ai");
    console.log("Set AI_API_KEY in .env and rerun.");
    process.exit(1);
  }

  try {
    const { getAIProvider } = await import("@/lib/ai/factory");
    const provider = getAIProvider();
    console.log(`Calling ${cfg.AI_MODEL} via ${cfg.AI_PROVIDER}...`);
    const start = Date.now();
    // Minimal text-only call via analyzeAmbiguousMapping (cheapest)
    const res = await provider.analyzeAmbiguousMapping({
      questions: [{ id: "q1", normalizedNumber: "1", text: "What is 2+2?" }],
      answerGroups: [{ id: "a1", text: "4", label: "1" }],
    } as any);
    const duration = Date.now() - start;
    console.log(`Response: success (${duration}ms)`);
    console.log(`Mappings: ${JSON.stringify(res.mappings).slice(0, 300)}`);
    console.log("PASS: smoke test succeeded");
  } catch (e: any) {
    console.error(`FAIL: ${e.code || "ERROR"} — ${e.message.slice(0, 500)}`);
    if (e.status === 401) console.error("Hint: check AI_API_KEY is valid for opencode zen");
    if (e.status === 429) console.error("Hint: rate limited, wait and retry");
    process.exit(1);
  }
}

main();
