export * from "./types";
export * from "./errors";
export * from "./factory";
export { MockOcrProvider } from "./mock";
export { PaddleOcrProvider } from "./paddle-provider";
// Legacy is NOT re-exported: src/lib/ocr/legacy/* must never be imported by production
// import from legacy is forbidden — see legacy/README.md
