import type { OcrProvider, SubmitOcrRequest, OcrOperationStatus, OcrDocumentResult } from "./types";

export class MockOcrProvider implements OcrProvider {
  private ops = new Map<string, { status: OcrOperationStatus["status"]; outputUri: string; pages: number }>();
  shouldFailSubmit = false;
  shouldFailOperation = false;

  async submitDocument(request: SubmitOcrRequest): Promise<{ operationId: string; outputUri: string }> {
    if (this.shouldFailSubmit) throw Object.assign(new Error("Mock submit failed"), { code: "OCR_SUBMISSION_FAILED" });
    const opId = `mock-textract-${request.jobId}-${Date.now()}`;
    const uri = `s3://mock-bucket/textract-output/${request.jobId}/`;
    this.ops.set(opId, { status: "DONE", outputUri: uri, pages: request.pageCount });
    return { operationId: opId, outputUri: uri };
  }

  async getOperationStatus(operationId: string): Promise<OcrOperationStatus> {
    const op = this.ops.get(operationId);
    if (!op) return { operationId, status: "DONE" };
    if (this.shouldFailOperation) return { operationId, status: "FAILED", error: { code: "MOCK", message: "Mock failure" } };
    return { operationId, status: op.status, outputUri: op.outputUri };
  }

  async getOperationResult(operationId: string, outputUri: string): Promise<OcrDocumentResult> {
    const op = this.ops.get(operationId);
    const pageCount = op?.pages || 1;
    return {
      jobId: "mock-job",
      documentId: "mock-doc",
      kind: "answerSheet",
      pages: Array.from({ length: pageCount }, (_, i) => ({
        pageNumber: i + 1,
        text: `Mock OCR page ${i + 1} text with handwritten content`,
        blocks: [
          {
            boundingBox: { x: 0.05, y: 0.1, width: 0.9, height: 0.05 },
            paragraphs: [
              {
                boundingBox: { x: 0.05, y: 0.1, width: 0.9, height: 0.05 },
                words: [{ boundingBox: { x: 0.05, y: 0.1, width: 0.2, height: 0.05 }, symbols: [], confidence: 0.9, text: "Mock" }],
                confidence: 0.9,
              },
            ],
            confidence: 0.9,
          },
        ],
        lines: [
          {
            text: `Mock OCR page ${i + 1} text`,
            boundingBox: { x: 0.05, y: 0.1, width: 0.9, height: 0.05 },
            confidence: 0.9,
            pageNumber: i + 1,
          },
        ],
        confidence: 0.92,
        width: 800,
        height: 1100,
        rotation: 0,
      })),
      provider: "amazon-textract",
      providerVersion: "v1-mock",
      operationId,
      completedAt: new Date().toISOString(),
    };
  }

  async cancelOperation(): Promise<void> {}
}
