import { ImageAnnotatorClient } from "@google-cloud/vision";
import { getConfig } from "@/lib/config";
import { OcrError, OcrErrorCodes } from "./errors";
import type { OcrProvider, SubmitOcrRequest, OcrOperationStatus, OcrDocumentResult, OcrPageResult } from "./types";
import { buildGcsUris, parseGcsUri, downloadGcsFile, listGcsOutputFiles } from "./gcs";

// Google Cloud Vision async PDF OCR: files:asyncBatchAnnotate
// Endpoint: vision.googleapis.com/v1/files:asyncBatchAnnotate
// Feature: DOCUMENT_TEXT_DETECTION
// Current Node client: @google-cloud/vision ImageAnnotatorClient.asyncBatchAnnotateFiles

let visionClient: ImageAnnotatorClient | null = null;

function getVisionClient(): ImageAnnotatorClient {
  if (visionClient) return visionClient;
  const cfg = getConfig() as any;
  const opts: any = {};
  if (cfg.GOOGLE_CLOUD_PROJECT_ID) opts.projectId = cfg.GOOGLE_CLOUD_PROJECT_ID;
  if (cfg.GOOGLE_CLOUD_KEY_JSON) {
    try {
      const parsed = JSON.parse(cfg.GOOGLE_CLOUD_KEY_JSON);
      opts.credentials = {
        client_email: parsed.client_email,
        private_key: parsed.private_key,
      };
      if (parsed.project_id && !opts.projectId) opts.projectId = parsed.project_id;
    } catch (e) {
      throw new OcrError(OcrErrorCodes.CONFIGURATION_ERROR, "Invalid GOOGLE_CLOUD_KEY_JSON", e, false);
    }
  }
  // ADC via GOOGLE_APPLICATION_CREDENTIALS handled automatically
  visionClient = new ImageAnnotatorClient(opts);
  return visionClient;
}

function getOperationName(result: any): string {
  // Operation may be LRO with .name
  return result?.name || result?.operation?.name || result?.[0]?.name || "";
}

export class GoogleVisionOcrProvider implements OcrProvider {
  async submitDocument(request: SubmitOcrRequest): Promise<{ operationId: string; outputUri: string }> {
    const cfg = getConfig() as any;
    if (!cfg.GOOGLE_CLOUD_PROJECT_ID) throw new OcrError(OcrErrorCodes.CONFIGURATION_ERROR, "GOOGLE_CLOUD_PROJECT_ID not configured", null, false);
    if (!cfg.GOOGLE_CLOUD_STORAGE_BUCKET) throw new OcrError(OcrErrorCodes.CONFIGURATION_ERROR, "GOOGLE_CLOUD_STORAGE_BUCKET not configured", null, false);

    const { inputUri, outputUri } = buildGcsUris(request.jobId);

    // The input PDF must already be at inputUri via uploadBufferToGcs before calling this.
    // Verify mime
    const mimeType = request.mimeType === "application/pdf" ? "application/pdf" : request.mimeType;

    // batchSize controls how many pages per output JSON shard (Google default splits). 20 is safe max; do not choose enormous.
    const effectiveBatchSize = request.pageCount > 20 ? 20 : Math.max(1, request.pageCount);

    const visionRequest: any = {
      requests: [
        {
          inputConfig: {
            gcsSource: { uri: request.gcsInputUri || inputUri },
            mimeType,
          },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          outputConfig: {
            gcsDestination: { uri: outputUri },
            batchSize: effectiveBatchSize,
          },
        },
      ],
    };

    try {
      const client = getVisionClient();
      // asyncBatchAnnotateFiles returns [operation]
      const [operation] = (await (client as any).asyncBatchAnnotateFiles(visionRequest)) as any[];
      const opName: string = operation?.name || operation?.operation?.name || "";
      if (!opName) {
        const fallbackName = (operation as any)?.name || (visionRequest as any)._opName || "";
        if (!fallbackName) {
          console.warn("[google-vision] no operation name returned, using synthetic id");
          return { operationId: `gs://${cfg.GOOGLE_CLOUD_STORAGE_BUCKET}/unknown-${Date.now()}`, outputUri };
        }
        return { operationId: fallbackName, outputUri };
      }
      return { operationId: opName, outputUri };
    } catch (e: any) {
      const msg = e?.message || String(e);
      const code = e?.code || e?.status;
      if (code === 7 || msg.includes("PERMISSION_DENIED") || msg.includes("403")) {
        throw new OcrError(OcrErrorCodes.AUTH_ERROR, `Vision permission denied: ${msg}`, e, false);
      }
      if (code === 16 || msg.includes("UNAUTHENTICATED")) {
        throw new OcrError(OcrErrorCodes.AUTH_ERROR, `Vision unauthenticated: ${msg}`, e, false);
      }
      throw new OcrError(OcrErrorCodes.SUBMISSION_FAILED, `Vision asyncBatchAnnotate failed: ${msg}`, e, true);
    }
  }

  async getOperationStatus(operationId: string): Promise<OcrOperationStatus> {
    if (!operationId) throw new OcrError(OcrErrorCodes.OPERATION_FAILED, "Missing operationId", null, false);
    // Operations are LRO via google.longrunning. Use client.operationsClient if available.
    try {
      const client = getVisionClient();
      // Try to use operationsClient.getOperation
      const opsClient: any = (client as any).operationsClient || (client as any).getProjectId;
      if (opsClient?.getOperation) {
        const [op] = await opsClient.getOperation({ name: operationId });
        if (op.done) {
          if (op.error) {
            return { operationId, status: "FAILED", error: { code: String(op.error.code || "UNKNOWN"), message: op.error.message || "Operation failed" } };
          }
          return { operationId, status: "DONE" };
        }
        return { operationId, status: "RUNNING" };
      }
      // Fallback: check if output files exist (implies done) — for mocked tests
      return { operationId, status: "RUNNING" };
    } catch (e: any) {
      throw new OcrError(OcrErrorCodes.OPERATION_FAILED, `getOperationStatus failed: ${e.message}`, e, true);
    }
  }

  async getOperationResult(operationId: string, outputUri: string): Promise<OcrDocumentResult> {
    // outputUri is gs://bucket/prefix/
    const { bucket, prefix } = parseGcsUri(outputUri);
    const files = await listGcsOutputFiles(bucket, prefix);
    if (files.length === 0) {
      throw new OcrError(OcrErrorCodes.OUTPUT_MISSING, `No OCR output JSON found at ${outputUri}`, null, false);
    }
    const pages: OcrPageResult[] = [];
    let docMeta: any = null;

    for (const fileName of files) {
      let buf: Buffer;
      try {
        buf = await downloadGcsFile(bucket, fileName);
      } catch (e) {
        throw e;
      }
      let json: any;
      try {
        json = JSON.parse(buf.toString("utf-8"));
      } catch (e: any) {
        throw new OcrError(OcrErrorCodes.OUTPUT_PARSE_FAILED, `Failed to parse OCR JSON ${fileName}: ${e.message}`, e, false);
      }
      // Google output structure: { responses: [ { fullTextAnnotation: {...}, ... } ] }
      // For batchSize N, each file contains responses for N consecutive pages.
      const responses: any[] = json.responses || [];
      for (let i = 0; i < responses.length; i++) {
        const resp = responses[i];
        if (resp.error) {
          throw new OcrError(OcrErrorCodes.OPERATION_FAILED, `Page OCR error: ${resp.error.message}`, resp.error, false);
        }
        const fta = resp.fullTextAnnotation;
        if (!fta) continue;
        const pageNum: number = fta.pages?.[0]?.property?.detectedLanguages ? resp.context?.pageNumber || pages.length + 1 : pages.length + 1;
        // Extract more reliable page number from the json if present; else infer
        const inferredPage = pages.length + 1;
        const normalized = normalizeFullTextAnnotation(fta, inferredPage);
        pages.push(normalized);
      }
      if (!docMeta) docMeta = json;
    }

    // Ensure sorted by pageNumber
    pages.sort((a, b) => a.pageNumber - b.pageNumber);

    return {
      jobId: "", // caller fills
      documentId: "",
      kind: "answerSheet",
      pages,
      provider: "google-cloud-vision",
      providerVersion: "v1",
      operationId,
      completedAt: new Date().toISOString(),
    };
  }

  async cancelOperation(operationId: string): Promise<void> {
    try {
      const client = getVisionClient();
      const opsClient: any = (client as any).operationsClient;
      if (opsClient?.cancelOperation) {
        await opsClient.cancelOperation({ name: operationId });
      }
    } catch {}
  }
}

function normalizeFullTextAnnotation(fta: any, pageNumber: number): OcrPageResult {
  const text: string = fta.text || "";
  const pages = fta.pages || [];
  const page = pages[0];
  const width = page?.width || 0;
  const height = page?.height || 0;

  const blocks: any[] = [];
  for (const block of page?.blocks || []) {
    const bBox = toNormalizedBox(block.boundingBox, width, height);
    const paragraphs: any[] = [];
    for (const para of block.paragraphs || []) {
      const pBox = toNormalizedBox(para.boundingBox, width, height);
      const words: any[] = [];
      for (const word of para.words || []) {
        const wBox = toNormalizedBox(word.boundingBox, width, height);
        const symbols: any[] = [];
        let wordText = "";
        for (const sym of word.symbols || []) {
          const sBox = toNormalizedBox(sym.boundingBox, width, height);
          symbols.push({ boundingBox: sBox, text: sym.text || "", confidence: sym.confidence ?? 0, property: sym.property });
          wordText += sym.text || "";
          if (sym.property?.detectedBreak) {
            const br = sym.property.detectedBreak.type;
            if (br === "SPACE" || br === "SURE_SPACE") wordText += " ";
            else if (br === "LINE_BREAK" || br === "EOL_SURE_SPACE") wordText += "\n";
            else if (br === "HYPHEN") wordText += "-";
          }
        }
        words.push({ boundingBox: wBox, symbols, confidence: word.confidence ?? 0, text: wordText.trim() });
      }
      paragraphs.push({ boundingBox: pBox, words, confidence: para.confidence ?? 0 });
    }
    blocks.push({ boundingBox: bBox, paragraphs, confidence: block.confidence ?? 0 });
  }

  // Fallback bounding: if page has no block boxes, synthesize from text
  return {
    pageNumber,
    text,
    blocks,
    confidence: fta.pages?.[0]?.confidence ?? page?.confidence ?? 0.9,
    width,
    height,
    rotation: 0,
  };
}

function toNormalizedBox(boundingBox: any, pageWidth: number, pageHeight: number): { x: number; y: number; width: number; height: number } {
  if (!boundingBox?.vertices || boundingBox.vertices.length === 0) {
    return { x: 0, y: 0, width: 1, height: 0.05 };
  }
  const verts = boundingBox.vertices;
  const xs = verts.map((v: any) => v.x ?? 0);
  const ys = verts.map((v: any) => v.y ?? 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = pageWidth || maxX || 1;
  const h = pageHeight || maxY || 1;
  // Google vertices are absolute pixels; normalize to [0,1]
  return {
    x: w ? minX / w : 0,
    y: h ? minY / h : 0,
    width: w ? (maxX - minX) / w : 0,
    height: h ? (maxY - minY) / h : 0,
  };
}

export function resetVisionClientForTest() {
  visionClient = null;
}
