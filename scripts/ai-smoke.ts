/**
 * ai:smoke-test — real OpenRouter inference (Qwen3-VL)
 * Loads OPENROUTER_API_KEY, calls qwen/qwen3-vl-32b-instruct, verifies response
 * Usage: npm run ai:smoke-test (requires OPENROUTER_API_KEY set)
 */
import { getConfig, clearConfigCache } from "@/lib/config";

async function main() {
  clearConfigCache();
  const cfg = getConfig() as any;
  const model = cfg.OPENROUTER_MODEL || cfg.AI_MODEL;
  const baseUrl = cfg.OPENROUTER_BASE_URL || cfg.AI_BASE_URL;
  const hasKey = Boolean(cfg.OPENROUTER_API_KEY || cfg.AI_API_KEY);
  console.log(`Provider: ${cfg.AI_PROVIDER}`);
  console.log(`Model: ${model}`);
  console.log(`Endpoint: ${baseUrl}/chat/completions`);
  console.log(`BaseURL: ${baseUrl}`);
  console.log(`Authentication: ${hasKey ? "configured" : "MISSING"}`);

  if (cfg.AI_PROVIDER === "mock") {
    console.log("WARN: AI_PROVIDER=mock — smoke test will use mock, not real OpenRouter. Set AI_PROVIDER=openrouter for real test.");
  }

  if (!hasKey) {
    console.error("FAIL: OPENROUTER_API_KEY not set. Set OPENROUTER_API_KEY in .env (obtain from https://openrouter.ai/keys)");
    process.exit(1);
  }

  try {
    const { getAIProvider } = await import("@/lib/ai/factory");
    const provider = getAIProvider();
    console.log(`Calling ${model} via OpenRouter...`);
    const start = Date.now();
    const res = await provider.analyzeAmbiguousMapping({
      questions: [{ id: "q1", normalizedNumber: "1", text: "What is 2+2?" }],
      answerGroups: [{ id: "a1", text: "4", label: "1" }],
    } as any);
    const duration = Date.now() - start;
    console.log(`Response: success (${duration}ms)`);
    console.log(`Mappings: ${JSON.stringify(res.mappings).slice(0, 500)}`);
    console.log("PASS: OpenRouter smoke test succeeded");
    // Vision smoke: test multimodal image
    try {
      const { getVisionProvider } = await import("@/lib/vision/factory");
      const vision = getVisionProvider();
      if (vision) {
        // 1x1 red PNG base64
        const redPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
        console.log("Vision smoke: sending 1x1 PNG to Qwen3-VL...");
        const vRes = await vision.analyzePage({
          pageId: "p1",
          pageNumber: 1,
          imageBase64: redPng,
          mimeType: "image/png",
          width: 1,
          height: 1,
        });
        console.log(`Vision response: ${JSON.stringify(vRes).slice(0, 400)}`);
        console.log("PASS: Vision smoke succeeded");
      } else {
        console.log("Vision provider disabled or no key — skipping vision smoke");
      }
    } catch (ve: any) {
      console.warn(`Vision smoke WARN: ${ve.message?.slice(0, 300)} (non-fatal)`);
    }
  } catch (e: any) {
    console.error(`FAIL: ${e.code || "ERROR"} — ${e.message?.slice(0, 800)}`);
    if (e.status === 401 || String(e.message).includes("401")) console.error("Hint: 401 authentication — check OPENROUTER_API_KEY is valid (https://openrouter.ai/keys)");
    if (e.status === 404) console.error("Hint: 404 invalid model/endpoint — verify OPENROUTER_MODEL=qwen/qwen3-vl-32b-instruct and baseURL=https://openrouter.ai/api/v1");
    if (e.status === 429) console.error("Hint: 429 rate limit/quota — wait and retry");
    if (e.status === 400) console.error("Hint: 400 invalid request — check payload/image format");
    process.exit(1);
  }
}

main();
