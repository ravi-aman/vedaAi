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
      VISION_PROVIDER: "mock",
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
