import { getConfig } from "@/lib/config";
import { GoogleVisionOcrProvider } from "./google-vision";
import type { OcrProvider } from "./types";

let cached: OcrProvider | null = null;

export function getOcrProvider(): OcrProvider {
  if (cached) return cached;
  const cfg = getConfig() as any;
  const provider = (cfg.OCR_PROVIDER || "google-vision") as string;
  if (provider === "mock") {
    // dynamic import to avoid bundling google deps in test-only path
    const { MockOcrProvider } = require("./mock");
    cached = new MockOcrProvider();
    return cached!;
  }
  cached = new GoogleVisionOcrProvider();
  return cached!;
}

export function setOcrProviderForTest(p: OcrProvider | null) {
  (cached as any) = p;
}
