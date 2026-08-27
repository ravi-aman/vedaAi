import {
  TextractClient,
  StartDocumentAnalysisCommand,
  GetDocumentAnalysisCommand,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
} from "@aws-sdk/client-textract";
import { getConfig } from "@/lib/config";
import { OcrError, OcrErrorCodes } from "./errors";
import type { OcrProvider, SubmitOcrRequest, OcrOperationStatus, OcrDocumentResult, OcrPageResult } from "./types";

let textractClient: TextractClient | null = null;

function getTextractClient(): TextractClient {
  if (textractClient) return textractClient;
  const cfg = getConfig() as any;
  const region = cfg.AWS_REGION || "us-east-1";
  const opts: any = { region };
  if (cfg.AWS_ACCESS_KEY_ID && cfg.AWS_SECRET_ACCESS_KEY) {
    opts.credentials = {
      accessKeyId: cfg.AWS_ACCESS_KEY_ID,
      secretAccessKey: cfg.AWS_SECRET_ACCESS_KEY,
    };
  }
  textractClient = new TextractClient(opts);
  return textractClient;
}

export class TextractOcrProvider implements OcrProvider {
  async submitDocument(request: SubmitOcrRequest): Promise<{ operationId: string; outputUri: string }> {
    const cfg = getConfig() as any;
    if (!cfg.AWS_S3_BUCKET) throw new OcrError(OcrErrorCodes.CONFIGURATION_ERROR, "AWS_S3_BUCKET not configured", null, false);
    const bucket = request.s3Bucket || cfg.AWS_S3_BUCKET;
    const key = request.s3Key;
    if (!bucket || !key) throw new OcrError(OcrErrorCodes.CONFIGURATION_ERROR, "S3 bucket/key missing for Textract", null, false);

    const mime = request.mimeType;
    // For images, synchronous DetectDocumentText could be used, but we always use async for uniformity
    // Use StartDocumentAnalysis for PDFs/TIFFs to get layout/tables if needed
    const client = getTextractClient();

    const snsTopicArn: string | undefined = cfg.AWS_SNS_TOPIC_ARN;
    const roleArn: string | undefined = cfg.AWS_SNS_ROLE_ARN;

    // FeatureTypes: include TABLES and LAYOUT for better reading order; keep minimal for cost
    const featureTypes: any[] = ["TABLES", "LAYOUT"];

    try {
      // Prefer StartDocumentAnalysis for PDFs; fallback to StartDocumentTextDetection if analysis not needed
      const cmd = new StartDocumentAnalysisCommand({
        DocumentLocation: { S3Object: { Bucket: bucket, Name: key } },
        FeatureTypes: featureTypes,
        NotificationChannel: snsTopicArn && roleArn ? { SNSTopicArn: snsTopicArn, RoleArn: roleArn } : undefined,
      });
      const res: any = await client.send(cmd as any);
      const jobId = res.JobId as string;
      if (!jobId) throw new Error("Textract did not return JobId");
      // For compatibility, outputUri is s3 prefix where Textract would write if using OutputConfig (we don't; we fetch via GetDocumentAnalysis)
      // Use bucket/prefix convention for tracking
      const outputBucket = cfg.AWS_TEXTRACT_OUTPUT_BUCKET || bucket;
      const outputUri = `s3://${outputBucket}/textract-output/${request.jobId}/${request.kind}/`;
      return { operationId: jobId, outputUri };
    } catch (e: any) {
      // Fallback: try StartDocumentTextDetection if analysis fails due to feature
      if (e?.name === "InvalidParameterException" || e?.message?.includes("FeatureTypes")) {
        try {
          const cmd2 = new StartDocumentTextDetectionCommand({
            DocumentLocation: { S3Object: { Bucket: bucket, Name: key } },
            NotificationChannel: snsTopicArn && roleArn ? { SNSTopicArn: snsTopicArn, RoleArn: roleArn } : undefined,
          });
          const res2: any = await client.send(cmd2 as any);
          const jobId2 = res2.JobId as string;
          if (!jobId2) throw new Error("Textract text detection did not return JobId");
          const outputBucket = cfg.AWS_TEXTRACT_OUTPUT_BUCKET || bucket;
          const outputUri = `s3://${outputBucket}/textract-output/${request.jobId}/${request.kind}/`;
          return { operationId: jobId2, outputUri };
        } catch (e2: any) {
          return mapTextractError(e2);
        }
      }
      return mapTextractError(e);
    }
  }

  async getOperationStatus(operationId: string): Promise<OcrOperationStatus> {
    if (!operationId) throw new OcrError(OcrErrorCodes.OPERATION_FAILED, "Missing operationId", null, false);
    const client = getTextractClient();
    try {
      // Try analysis first, then text detection
      try {
        const res: any = await client.send(new GetDocumentAnalysisCommand({ JobId: operationId, MaxResults: 1 }));
        const status = res.JobStatus as string;
        if (status === "SUCCEEDED") return { operationId, status: "DONE" };
        if (status === "FAILED") return { operationId, status: "FAILED", error: { code: res.StatusMessage || "FAILED", message: res.StatusMessage || "Textract job failed" } };
        return { operationId, status: "RUNNING" };
      } catch {
        const res2: any = await client.send(new GetDocumentTextDetectionCommand({ JobId: operationId, MaxResults: 1 }));
        const status2 = res2.JobStatus as string;
        if (status2 === "SUCCEEDED") return { operationId, status: "DONE" };
        if (status2 === "FAILED") return { operationId, status: "FAILED", error: { code: res2.StatusMessage || "FAILED", message: res2.StatusMessage || "Textract job failed" } };
        return { operationId, status: "RUNNING" };
      }
    } catch (e: any) {
      throw new OcrError(OcrErrorCodes.OPERATION_FAILED, `getOperationStatus failed: ${e.message}`, e, true);
    }
  }

  async getOperationResult(operationId: string, _outputUri: string): Promise<OcrDocumentResult> {
    const client = getTextractClient();
    let blocks: any[] = [];
    let jobStatus: string | undefined;
    let nextToken: string | undefined;

    // Textract pagination: NextToken must be handled
    const fetchWithPagination = async (useAnalysis: boolean) => {
      blocks = [];
      nextToken = undefined;
      do {
        const cmd = useAnalysis
          ? new GetDocumentAnalysisCommand({ JobId: operationId, MaxResults: 1000, NextToken: nextToken })
          : new GetDocumentTextDetectionCommand({ JobId: operationId, MaxResults: 1000, NextToken: nextToken });
        const res: any = await client.send(cmd as any);
        jobStatus = res.JobStatus as string;
        const pageBlocks: any[] = res.Blocks || [];
        blocks.push(...pageBlocks);
        nextToken = res.NextToken;
      } while (nextToken);
      return { jobStatus, blocks };
    };

    let useAnalysis = true;
    let result: any;
    try {
      result = await fetchWithPagination(true);
    } catch (e: any) {
      // If analysis not found, try text detection
      const msg = e?.message || "";
      if (msg.includes("InvalidJobId") || msg.includes("not found") || e?.name === "InvalidParameterException") {
        result = await fetchWithPagination(false);
        useAnalysis = false;
      } else {
        throw new OcrError(OcrErrorCodes.OUTPUT_PARSE_FAILED, `Textract GetDocument failed: ${msg}`, e, true);
      }
    }
    // If still IN_PROGRESS, the caller should have polled to DONE; but handle gracefully
    if (result.jobStatus && result.jobStatus !== "SUCCEEDED") {
      if (result.jobStatus === "FAILED") {
        throw new OcrError(OcrErrorCodes.OPERATION_FAILED, `Textract job failed: ${result.jobStatus}`, null, false);
      }
      // If not yet succeeded, but we fetched blocks, continue; else throw
      if (blocks.length === 0) {
        throw new OcrError(OcrErrorCodes.OPERATION_FAILED, `Textract job not yet succeeded: ${result.jobStatus}`, null, true);
      }
    }
    if (blocks.length === 0) {
      throw new OcrError(OcrErrorCodes.OUTPUT_MISSING, `No Textract blocks found for job ${operationId}`, null, false);
    }

    const pages = normalizeTextractBlocks(blocks);

    return {
      jobId: "",
      documentId: "",
      kind: "answerSheet",
      pages,
      provider: "amazon-textract",
      providerVersion: "v1",
      operationId,
      completedAt: new Date().toISOString(),
    };
  }

  async cancelOperation(_operationId: string): Promise<void> {
    // Textract has no cancel API; no-op
  }
}

function mapTextractError(e: any): never {
  const msg = e?.message || String(e);
  const name = e?.name || "";
  if (name === "AccessDeniedException" || msg.includes("AccessDenied") || msg.includes("not authorized")) {
    throw new OcrError(OcrErrorCodes.AUTH_ERROR, `Textract access denied: ${msg}`, e, false);
  }
  if (name === "InvalidS3ObjectException" || msg.includes("InvalidS3Object") || msg.includes("NoSuchKey") || msg.includes("bucket")) {
    throw new OcrError(OcrErrorCodes.BUCKET_ACCESS_ERROR, `S3 object error: ${msg}`, e, false);
  }
  if (name === "UnsupportedDocumentException" || msg.includes("UnsupportedDocument") || msg.includes("Unsupported document")) {
    throw new OcrError(OcrErrorCodes.INVALID_DOCUMENT, `Unsupported document: ${msg}`, e, false);
  }
  if (name === "ThrottlingException" || msg.includes("Throttling") || msg.includes("ProvisionedThroughputExceeded")) {
    throw new OcrError(OcrErrorCodes.OPERATION_FAILED, `Textract throttled: ${msg}`, e, true);
  }
  if (name === "InvalidParameterException") {
    throw new OcrError(OcrErrorCodes.CONFIGURATION_ERROR, `Textract invalid parameter: ${msg}`, e, false);
  }
  throw new OcrError(OcrErrorCodes.SUBMISSION_FAILED, `Textract StartDocument failed: ${msg}`, e, true);
}

export function normalizeTextractBlocks(blocks: any[]): OcrPageResult[] {
  // Textract BlockType: PAGE, LINE, WORD, TABLE, CELL, etc. We use PAGE/LINE/WORD hierarchy.
  // Geometry.BoundingBox is normalized [0,1] with Left, Top, Width, Height (already normalized to page)
  // Polygon may be present as Geometry.Polygon [{X,Y}]
  const pagesMap = new Map<number, OcrPageResult>();

  // First pass: create page entries from PAGE blocks
  const pageBlocks = blocks.filter((b) => b.BlockType === "PAGE");
  for (const pb of pageBlocks) {
    const pageNum: number = pb.Page || 1;
    if (!pagesMap.has(pageNum)) {
      pagesMap.set(pageNum, {
        pageNumber: pageNum,
        text: "",
        blocks: [],
        confidence: pb.Confidence ?? 0.99,
        width: 0, // Textract doesn't give pixel dims; we keep 0 and treat bbox as already normalized
        height: 0,
        rotation: 0,
      });
    }
  }
  // Ensure at least page 1 exists
  if (pagesMap.size === 0) {
    pagesMap.set(1, { pageNumber: 1, text: "", blocks: [], confidence: 0.99, width: 0, height: 0, rotation: 0 });
  }

  // Map page -> lines
  const linesByPage = new Map<number, any[]>();
  for (const b of blocks) {
    if (b.BlockType === "LINE") {
      const p = b.Page || 1;
      if (!linesByPage.has(p)) linesByPage.set(p, []);
      linesByPage.get(p)!.push(b);
    }
  }

  // Map line id -> words
  const wordsByLineId = new Map<string, any[]>();
  for (const b of blocks) {
    if (b.BlockType === "WORD") {
      // WORD blocks have no explicit line parent, but Relationships on LINE point to WORD ids
      // For fallback, group by Page
    }
  }
  // Build id -> block map
  const idMap = new Map<string, any>();
  for (const b of blocks) idMap.set(b.Id, b);

  // For each page, construct OcrBlock -> paragraphs -> words structure
  // Textract hierarchy: PAGE -> LINE -> WORD; no explicit Paragraph/Block for handwriting, but we synthesize
  for (const [pageNum, pageResult] of pagesMap) {
    const lines: any[] = linesByPage.get(pageNum) || [];
    // Sort lines by Top (reading order)
    lines.sort((a, b) => (a.Geometry?.BoundingBox?.Top ?? 0) - (b.Geometry?.BoundingBox?.Top ?? 0));

    // Combine text per page from LINE.Text
    const pageText = lines.map((l) => l.Text || "").join("\n");
    pageResult.text = pageText;

    // Textract doesn't expose paragraphs cleanly for handwriting; we synthesize blocks:
    // Group lines into blocks by vertical gap (if gap > 0.03 * page height, new block)
    const synthesizedBlocks: any[] = [];
    let currentBlockLines: any[] = [];
    let lastTop = -1;
    let lastHeight = 0;
    for (const line of lines) {
      const bb = line.Geometry?.BoundingBox;
      const top = bb?.Top ?? 0;
      const height = bb?.Height ?? 0;
      if (lastTop >= 0) {
        const gap = top - (lastTop + lastHeight);
        if (gap > 0.025) {
          if (currentBlockLines.length > 0) {
            synthesizedBlocks.push([...currentBlockLines]);
            currentBlockLines = [];
          }
        }
      }
      currentBlockLines.push(line);
      lastTop = top;
      lastHeight = height;
    }
    if (currentBlockLines.length > 0) synthesizedBlocks.push(currentBlockLines);

    // Convert to OcrBlock
    for (const blockLines of synthesizedBlocks) {
      // bounding box covering all lines
      const bbs = blockLines.map((l: any) => l.Geometry?.BoundingBox).filter(Boolean);
      const blockBox = unionBoxes(bbs);
      const confidence = avg(blockLines.map((l: any) => l.Confidence ?? 95)) / 100;

      // Paragraph: split blockLines into paragraphs by larger gap (0.02)
      const paragraphs: any[] = [];
      let paraLines: any[] = [blockLines[0]];
      for (let i = 1; i < blockLines.length; i++) {
        const prev = blockLines[i - 1];
        const cur = blockLines[i];
        const gap = (cur.Geometry?.BoundingBox?.Top ?? 0) - ((prev.Geometry?.BoundingBox?.Top ?? 0) + (prev.Geometry?.BoundingBox?.Height ?? 0));
        if (gap > 0.015) {
          paragraphs.push(paraLines);
          paraLines = [cur];
        } else {
          paraLines.push(cur);
        }
      }
      paragraphs.push(paraLines);

      const ocrParagraphs: any[] = paragraphs.map((para) => {
        const paraBbs = para.map((l: any) => l.Geometry?.BoundingBox).filter(Boolean);
        const pBox = unionBoxes(paraBbs);
        const pConf = avg(para.map((l: any) => l.Confidence ?? 95)) / 100;
        const words: any[] = [];
        for (const line of para) {
          // Resolve WORD children via Relationships
          const rel = (line.Relationships || []).find((r: any) => r.Type === "CHILD");
          const childIds: string[] = rel?.Ids || [];
          if (childIds.length > 0) {
            for (const wid of childIds) {
              const wb = idMap.get(wid);
              if (!wb || wb.BlockType !== "WORD") continue;
              const wBox = wb.Geometry?.BoundingBox
                ? { x: wb.Geometry.BoundingBox.Left ?? 0, y: wb.Geometry.BoundingBox.Top ?? 0, width: wb.Geometry.BoundingBox.Width ?? 0, height: wb.Geometry.BoundingBox.Height ?? 0 }
                : { x: 0, y: 0, width: 0.05, height: 0.02 };
              words.push({
                boundingBox: wBox,
                symbols: [],
                confidence: (wb.Confidence ?? 95) / 100,
                text: wb.Text || "",
              });
            }
          } else {
            // Fallback: split line text into words
            const parts = (line.Text || "").split(/\s+/).filter(Boolean);
            const bb = line.Geometry?.BoundingBox;
            const w = bb?.Width ?? 0.9;
            const slice = parts.length ? w / parts.length : w;
            for (let i = 0; i < parts.length; i++) {
              words.push({
                boundingBox: { x: (bb?.Left ?? 0) + i * slice, y: bb?.Top ?? 0, width: slice, height: bb?.Height ?? 0.02 },
                symbols: [],
                confidence: (line.Confidence ?? 95) / 100,
                text: parts[i],
              });
            }
          }
        }
        return { boundingBox: { x: pBox.Left ?? 0, y: pBox.Top ?? 0, width: pBox.Width ?? 0.9, height: pBox.Height ?? 0.05 }, words, confidence: pConf };
      });

      pageResult.blocks.push({
        boundingBox: { x: blockBox.Left ?? 0, y: blockBox.Top ?? 0, width: blockBox.Width ?? 0.9, height: blockBox.Height ?? 0.05 },
        paragraphs: ocrParagraphs,
        confidence,
      });
    }

    // If no lines at all but blocks exist, keep pages empty text
    if (pageResult.blocks.length === 0 && pageResult.text === "") {
      pageResult.text = "";
    }
  }

  return Array.from(pagesMap.values()).sort((a, b) => a.pageNumber - b.pageNumber);
}

function unionBoxes(boxes: any[]): any {
  if (boxes.length === 0) return { Left: 0, Top: 0, Width: 1, Height: 0.05 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes) {
    const l = b.Left ?? 0, t = b.Top ?? 0, w = b.Width ?? 0, h = b.Height ?? 0;
    minX = Math.min(minX, l);
    minY = Math.min(minY, t);
    maxX = Math.max(maxX, l + w);
    maxY = Math.max(maxY, t + h);
  }
  return { Left: minX, Top: minY, Width: maxX - minX, Height: maxY - minY };
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 95;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function resetTextractClientForTest() {
  textractClient = null;
}
export const resetVisionClientForTest = resetTextractClientForTest;
