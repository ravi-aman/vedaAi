import { getConfig } from "@/lib/config";
import type { OcrProvider, LocalOcrProvider } from "./types";

let cached: OcrProvider | null = null;
let cachedLocal: LocalOcrProvider | null = null;

export function getOcrProvider(): OcrProvider {
  if (cached) return cached;
  const cfg = getConfig() as any;
  const raw = String(cfg.OCR_PROVIDER || "local").trim().toLowerCase();
  // Normalize aliases: aws/textract -> aws, paddleocr -> local
  const provider = raw === "aws" || raw === "textract" ? "aws" : raw === "paddleocr" ? "local" : raw;
  if (provider === "mock") {
    // dynamic import to avoid bundling in test-only path
    const { MockOcrProvider } = require("./mock");
    cached = new MockOcrProvider();
    return cached!;
  }
  if (provider === "local") {
    // Local provider uses processDocument, not async submit/poll
    const { PaddleOcrProvider } = require("./paddle-provider");
    cached = new PaddleOcrProvider() as unknown as OcrProvider;
    return cached!;
  }
  if (provider === "aws") {
    // AWS Textract — S3 + async Textract, NO PaddleOCR, NO Python worker
    const { TextractOcrProvider } = require("./textract-provider");
    cached = new TextractOcrProvider() as unknown as OcrProvider;
    return cached!;
  }
  throw new Error(
    `OCR_CONFIGURATION_ERROR: OCR_PROVIDER=${raw} is not supported. Active providers: local, aws (alias textract), mock. Use OCR_PROVIDER=local for PaddleOCR or OCR_PROVIDER=aws for Textract.`,
  );
}

export function getLocalOcrProvider(): LocalOcrProvider {
  if (cachedLocal) return cachedLocal;
  const cfg = getConfig() as any;
  const raw = String(cfg.OCR_PROVIDER || "local").trim().toLowerCase();
  const provider = raw === "aws" || raw === "textract" ? "aws" : raw === "paddleocr" ? "local" : raw;
  if (provider === "mock") {
    // Vision-Only strong: if Vision is configured, use VisionOcrProvider for real text+bbox (not dummy)
    try {
      const { getVisionProvider } = require("@/lib/vision/factory");
      if (getVisionProvider()) {
        const { VisionOcrProvider } = require("./vision-ocr-provider");
        cachedLocal = new VisionOcrProvider();
        return cachedLocal!;
      }
    } catch {}
    const { MockOcrProvider } = require("./mock");
    // Mock also supports processDocument via getOperationResult shape (fallback for tests without Vision keys)
    const mock = new MockOcrProvider() as any;
    // Wrap mock to provide processDocument
    cachedLocal = {
      processDocument: async (input: any) => {
        const res = await mock.getOperationResult("mock-local", "s3://mock/");
        res.jobId = input.jobId;
        res.documentId = input.documentId;
        res.kind = input.kind;
        res.provider = "mock";
        // Adjust page count to match input pages
        if (res.pages.length !== input.pages.length) {
          if (res.pages.length > input.pages.length) res.pages = res.pages.slice(0, input.pages.length);
          else {
            while (res.pages.length < input.pages.length) {
              const last = res.pages[res.pages.length - 1];
              res.pages.push({ ...last, pageNumber: res.pages.length + 1 });
            }
          }
        }
        return res;
      },
    };
    return cachedLocal!;
  }
  if (provider === "local") {
    const { PaddleOcrProvider } = require("./paddle-provider");
    cachedLocal = new PaddleOcrProvider();
    return cachedLocal!;
  }
  if (provider === "aws") {
    // AWS Textract path — NO PaddleOCR, NO Python worker
    const { TextractOcrProvider } = require("./textract-provider");
    cachedLocal = new TextractOcrProvider();
    return cachedLocal!;
  }
  throw new Error(
    `OCR_CONFIGURATION_ERROR: OCR_PROVIDER=${raw} is not supported. Active providers: local, aws (alias textract), mock.`,
  );
}

export function setOcrProviderForTest(p: OcrProvider | null) {
  (cached as any) = p;
  cachedLocal = null;
}

export function setLocalOcrProviderForTest(p: LocalOcrProvider | null) {
  cachedLocal = p;
}
