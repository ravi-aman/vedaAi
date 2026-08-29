import { getConfig } from "@/lib/config";
import type { OcrProvider, LocalOcrProvider } from "./types";

let cached: OcrProvider | null = null;
let cachedLocal: LocalOcrProvider | null = null;

export function getOcrProvider(): OcrProvider {
  if (cached) return cached;
  const cfg = getConfig() as any;
  const provider = (cfg.OCR_PROVIDER || "local") as string;
  if (provider === "mock") {
    // dynamic import to avoid bundling in test-only path
    const { MockOcrProvider } = require("./mock");
    cached = new MockOcrProvider();
    return cached!;
  }
  if (provider === "local" || provider === "paddleocr") {
    // Local provider uses processDocument, not async submit/poll
    const { PaddleOcrProvider } = require("./paddle-provider");
    cached = new PaddleOcrProvider() as unknown as OcrProvider;
    return cached!;
  }
  // Textract removed from active runtime — fail fast so regression cannot silently re-enable it
  throw new Error(
    `OCR_CONFIGURATION_ERROR: OCR_PROVIDER=${provider} is not supported. Active providers: local, paddleocr, mock. Textract was removed. Set OCR_PROVIDER=local.`
  );
}

export function getLocalOcrProvider(): LocalOcrProvider {
  if (cachedLocal) return cachedLocal;
  const cfg = getConfig() as any;
  const provider = (cfg.OCR_PROVIDER || "local") as string;
  if (provider === "mock") {
    const { MockOcrProvider } = require("./mock");
    // Mock also supports processDocument via getOperationResult shape
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
  const { PaddleOcrProvider } = require("./paddle-provider");
  cachedLocal = new PaddleOcrProvider();
  return cachedLocal!;
}

export function setOcrProviderForTest(p: OcrProvider | null) {
  (cached as any) = p;
  cachedLocal = null;
}

export function setLocalOcrProviderForTest(p: LocalOcrProvider | null) {
  cachedLocal = p;
}
