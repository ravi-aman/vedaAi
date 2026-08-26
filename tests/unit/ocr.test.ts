import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseGcsUri, buildGcsUris } from "@/lib/ocr/gcs";
import { MockOcrProvider } from "@/lib/ocr/mock";
import { OcrError, OcrErrorCodes } from "@/lib/ocr/errors";
import { clearConfigCache } from "@/lib/config";

describe("OCR GCS helpers", () => {
  it("parseGcsUri valid", () => {
    expect(parseGcsUri("gs://my-bucket/path/to/file.json")).toEqual({ bucket: "my-bucket", prefix: "path/to/file.json" });
    expect(parseGcsUri("gs://bucket")).toEqual({ bucket: "bucket", prefix: "" });
  });
  it("parseGcsUri invalid throws", () => {
    expect(() => parseGcsUri("https://bucket/path")).toThrow();
  });
  it("buildGcsUris deterministic by jobId", () => {
    process.env.GOOGLE_CLOUD_STORAGE_BUCKET = "test-bucket";
    process.env.GOOGLE_CLOUD_OCR_INPUT_PREFIX = "ocr-input";
    process.env.GOOGLE_CLOUD_OCR_OUTPUT_PREFIX = "ocr-output";
    clearConfigCache();
    const uris = buildGcsUris("job-123");
    expect(uris.inputUri).toBe("gs://test-bucket/ocr-input/job-123/input.pdf");
    expect(uris.outputUri).toBe("gs://test-bucket/ocr-output/job-123/");
    expect(uris.inputUri).not.toContain("student");
    clearConfigCache();
    delete (process.env as any).GOOGLE_CLOUD_STORAGE_BUCKET;
  });
});

describe("MockOcrProvider", () => {
  it("successful submit and result", async () => {
    const p = new MockOcrProvider();
    const { operationId, outputUri } = await p.submitDocument({ jobId: "j1", documentId: "d1", kind: "answerSheet", gcsInputUri: "gs://b/in.pdf", mimeType: "application/pdf", pageCount: 3 });
    expect(operationId).toContain("mock");
    const status = await p.getOperationStatus(operationId);
    expect(status.status).toBe("DONE");
    const result = await p.getOperationResult(operationId, outputUri);
    expect(result.pages.length).toBe(3);
    expect(result.provider).toBe("google-cloud-vision");
    expect(result.pages[0].text).toContain("Mock OCR");
  });

  it("handles 1-page and 39-page", async () => {
    const p = new MockOcrProvider();
    for (const n of [1, 39]) {
      const { operationId, outputUri } = await p.submitDocument({ jobId: `j${n}`, documentId: "d1", kind: "answerSheet", gcsInputUri: "gs://b/in.pdf", mimeType: "application/pdf", pageCount: n });
      const res = await p.getOperationResult(operationId, outputUri);
      expect(res.pages.length).toBe(n);
      expect(res.pages[0].pageNumber).toBe(1);
      expect(res.pages[n - 1].pageNumber).toBe(n);
    }
  });

  it("failure propagation", async () => {
    const p = new MockOcrProvider();
    p.shouldFailSubmit = true;
    await expect(p.submitDocument({ jobId: "j", documentId: "d", kind: "answerSheet", gcsInputUri: "gs://b/in.pdf", mimeType: "application/pdf", pageCount: 1 })).rejects.toThrow();
    p.shouldFailSubmit = false;
    p.shouldFailOperation = true;
    const { operationId } = await p.submitDocument({ jobId: "j2", documentId: "d", kind: "answerSheet", gcsInputUri: "gs://b/in.pdf", mimeType: "application/pdf", pageCount: 1 });
    const st = await p.getOperationStatus(operationId);
    expect(st.status).toBe("FAILED");
  });

  it("duplicate start idempotency - same job reuses op", async () => {
    const p = new MockOcrProvider();
    const r1 = await p.submitDocument({ jobId: "dup", documentId: "d", kind: "answerSheet", gcsInputUri: "gs://b/in.pdf", mimeType: "application/pdf", pageCount: 2 });
    const r2 = await p.submitDocument({ jobId: "dup", documentId: "d", kind: "answerSheet", gcsInputUri: "gs://b/in.pdf", mimeType: "application/pdf", pageCount: 2 });
    expect(r1.operationId).toContain("dup");
    expect(r2.operationId).toContain("dup");
    expect(r1.outputUri).toBe(r2.outputUri);
  });
});

describe("OcrError", () => {
  it("isRetryable", () => {
    const e = new OcrError(OcrErrorCodes.GCS_UPLOAD_FAILED, "fail", null, true);
    expect(OcrError.isRetryable(e)).toBe(true);
    const e2 = new OcrError(OcrErrorCodes.AUTH_ERROR, "auth", null, false);
    expect(OcrError.isRetryable(e2)).toBe(false);
  });
});
