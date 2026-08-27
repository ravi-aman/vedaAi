import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseS3Uri, buildS3Uris, buildS3Keys } from "@/lib/ocr/s3";
import { MockOcrProvider } from "@/lib/ocr/mock";
import { OcrError, OcrErrorCodes } from "@/lib/ocr/errors";
import { clearConfigCache } from "@/lib/config";

describe("OCR S3 helpers", () => {
  it("parseS3Uri valid", () => {
    expect(parseS3Uri("s3://my-bucket/path/to/file.json")).toEqual({ bucket: "my-bucket", prefix: "path/to/file.json" });
    expect(parseS3Uri("s3://bucket")).toEqual({ bucket: "bucket", prefix: "" });
    // legacy gs:// also parsed
    expect(parseS3Uri("gs://my-bucket/path/to/file.json")).toEqual({ bucket: "my-bucket", prefix: "path/to/file.json" });
  });
  it("parseS3Uri invalid throws", () => {
    expect(() => parseS3Uri("https://bucket/path")).toThrow();
  });
  it("buildS3Uris deterministic by jobId", () => {
    process.env.AWS_S3_BUCKET = "test-bucket";
    process.env.AWS_S3_INPUT_PREFIX = "ocr-input";
    process.env.AWS_S3_OUTPUT_PREFIX = "ocr-output";
    clearConfigCache();
    const uris = buildS3Uris("job-123");
    expect(uris.inputUri).toBe("s3://test-bucket/ocr-input/job-123/questionPaper.pdf");
    expect(uris.outputUri).toBe("s3://test-bucket/ocr-output/job-123/questionPaper/");
    expect(uris.inputUri).not.toContain("student");
    clearConfigCache();
    delete (process.env as any).AWS_S3_BUCKET;
  });
  it("buildS3Keys per kind", () => {
    process.env.AWS_S3_BUCKET = "test-bucket";
    clearConfigCache();
    const qp = buildS3Keys("job-123", "questionPaper");
    const as = buildS3Keys("job-123", "answerSheet");
    expect(qp.inputKey).toContain("questionPaper.pdf");
    expect(as.inputKey).toContain("answerSheet.pdf");
    expect(qp.bucket).toBe("test-bucket");
    clearConfigCache();
    delete (process.env as any).AWS_S3_BUCKET;
  });
});

describe("MockOcrProvider", () => {
  it("successful submit and result", async () => {
    const p = new MockOcrProvider();
    const { operationId, outputUri } = await p.submitDocument({ jobId: "j1", documentId: "d1", kind: "answerSheet", s3Bucket: "b", s3Key: "in.pdf", mimeType: "application/pdf", pageCount: 3 });
    expect(operationId).toContain("mock");
    const status = await p.getOperationStatus(operationId);
    expect(status.status).toBe("DONE");
    const result = await p.getOperationResult(operationId, outputUri);
    expect(result.pages.length).toBe(3);
    expect(result.provider).toBe("amazon-textract");
    expect(result.pages[0].text).toContain("Mock OCR");
  });

  it("handles 1-page and 39-page", async () => {
    const p = new MockOcrProvider();
    for (const n of [1, 39]) {
      const { operationId, outputUri } = await p.submitDocument({ jobId: `j${n}`, documentId: "d1", kind: "answerSheet", s3Bucket: "b", s3Key: "in.pdf", mimeType: "application/pdf", pageCount: n });
      const res = await p.getOperationResult(operationId, outputUri);
      expect(res.pages.length).toBe(n);
      expect(res.pages[0].pageNumber).toBe(1);
      expect(res.pages[n - 1].pageNumber).toBe(n);
    }
  });

  it("failure propagation", async () => {
    const p = new MockOcrProvider();
    p.shouldFailSubmit = true;
    await expect(p.submitDocument({ jobId: "j", documentId: "d", kind: "answerSheet", s3Bucket: "b", s3Key: "in.pdf", mimeType: "application/pdf", pageCount: 1 })).rejects.toThrow();
    p.shouldFailSubmit = false;
    p.shouldFailOperation = true;
    const { operationId } = await p.submitDocument({ jobId: "j2", documentId: "d", kind: "answerSheet", s3Bucket: "b", s3Key: "in.pdf", mimeType: "application/pdf", pageCount: 1 });
    const st = await p.getOperationStatus(operationId);
    expect(st.status).toBe("FAILED");
  });

  it("duplicate start idempotency - same job reuses op", async () => {
    const p = new MockOcrProvider();
    const r1 = await p.submitDocument({ jobId: "dup", documentId: "d", kind: "answerSheet", s3Bucket: "b", s3Key: "in.pdf", mimeType: "application/pdf", pageCount: 2 });
    const r2 = await p.submitDocument({ jobId: "dup", documentId: "d", kind: "answerSheet", s3Bucket: "b", s3Key: "in.pdf", mimeType: "application/pdf", pageCount: 2 });
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
