import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    globals: true,
    env: {
      AI_PROVIDER: "mock",
      AI_MODEL: "mock-model",
      AI_API_KEY: "test-key",
      OPENROUTER_API_KEY: "test-key",
      OPENROUTER_MODEL: "qwen/qwen3-vl-32b-instruct",
      OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
      // New provider system — tests use mock via legacy VISION_PROVIDER=mock
      VISION_PROVIDER: "mock",
      VISION_PROVIDER_ORDER: "openrouter,opencode,nvidia",
      VISION_AUTO_FALLBACK: "true",
      OPENROUTER_ENABLED: "false",
      OPENROUTER_VISION_MODEL: "qwen/qwen3-vl-32b-instruct",
      OPENCODE_ENABLED: "false",
      OPENCODE_API_KEY: "test-key",
      OPENCODE_VISION_MODEL: "mimo-v2.5-free",
      NVIDIA_ENABLED: "false",
      NVIDIA_API_KEY: "test-key",
      NVIDIA_VISION_MODEL: "meta/llama-3.2-90b-vision-instruct",
      VISION_GLOBAL_CONCURRENCY: "1",
      VISION_BATCH_SIZE: "3",
      VISION_TIMEOUT_MS: "90000",
      OCR_PROVIDER: "mock",
      AWS_REGION: "us-east-1",
      AWS_S3_BUCKET: "test-bucket",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
