export * from "./types";
export * from "./errors";
export * from "./factory";
export { MockOcrProvider } from "./mock";
export { PaddleOcrProvider } from "./paddle-provider";
export { TextractOcrProvider } from "./textract-provider";
// Legacy helpers (S3/Textract low-level) are used internally by textract-provider
// Direct legacy imports from app code are discouraged — use getLocalOcrProvider() / factory
