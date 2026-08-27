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
