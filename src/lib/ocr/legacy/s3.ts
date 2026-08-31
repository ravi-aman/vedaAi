// @ts-nocheck
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { getConfig } from "@/lib/config";
import { OcrError, OcrErrorCodes } from "../errors";

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (s3Client) return s3Client;
  const cfg = getConfig() as any;
  const region = cfg.AWS_REGION || "us-east-1";
  const opts: any = {
    region,
    // Disable flexible checksums for presigned PUT (otherwise browser must send x-amz-checksum-* headers -> extra CORS preflight)
    requestChecksumCalculation: "WHEN_REQUIRED" as any,
    responseChecksumValidation: "WHEN_REQUIRED" as any,
  };
  if (cfg.AWS_ACCESS_KEY_ID && cfg.AWS_SECRET_ACCESS_KEY) {
    opts.credentials = {
      accessKeyId: cfg.AWS_ACCESS_KEY_ID,
      secretAccessKey: cfg.AWS_SECRET_ACCESS_KEY,
    };
  }
  // If no explicit credentials, SDK falls back to env, shared config, or IAM role
  s3Client = new S3Client(opts);
  return s3Client;
}

export function buildS3Keys(jobId: string, kind: "questionPaper" | "answerSheet"): { bucket: string; inputKey: string; outputPrefix: string } {
  const cfg = getConfig() as any;
  const bucket: string = cfg.AWS_S3_BUCKET;
  if (!bucket) throw new OcrError(OcrErrorCodes.CONFIGURATION_ERROR, "AWS_S3_BUCKET not configured", null, false);
  const inputPrefix: string = cfg.AWS_S3_INPUT_PREFIX || "ocr-input";
  const outputPrefix: string = cfg.AWS_S3_OUTPUT_PREFIX || "ocr-output";
  const safeJob = jobId.replace(/[^a-zA-Z0-9-]/g, "");
  const inputKey = `${inputPrefix}/${safeJob}/${kind}.pdf`;
  const outPref = `${outputPrefix}/${safeJob}/${kind}/`;
  return { bucket, inputKey, outputPrefix: outPref };
}

export function buildS3Uris(jobId: string): { inputUri: string; outputUri: string; inputObject: string; outputPrefix: string } {
  const qp = buildS3Keys(jobId, "questionPaper");
  // For backward-compat naming, still return inputUri/outputUri shape but as s3://
  return {
    inputUri: `s3://${qp.bucket}/${qp.inputKey}`,
    outputUri: `s3://${qp.bucket}/${qp.outputPrefix}`,
    inputObject: qp.inputKey,
    outputPrefix: qp.outputPrefix,
  };
}

// Backward compat alias for old gcs helpers
export function parseGcsUri(uri: string): { bucket: string; prefix: string } {
  return parseS3Uri(uri);
}

export function parseS3Uri(uri: string): { bucket: string; prefix: string } {
  if (uri.startsWith("s3://")) {
    const withoutScheme = uri.slice(5);
    const slash = withoutScheme.indexOf("/");
    if (slash === -1) return { bucket: withoutScheme, prefix: "" };
    return { bucket: withoutScheme.slice(0, slash), prefix: withoutScheme.slice(slash + 1) };
  }
  if (uri.startsWith("gs://")) {
    const withoutScheme = uri.slice(5);
    const slash = withoutScheme.indexOf("/");
    if (slash === -1) return { bucket: withoutScheme, prefix: "" };
    return { bucket: withoutScheme.slice(0, slash), prefix: withoutScheme.slice(slash + 1) };
  }
  throw new OcrError(OcrErrorCodes.CONFIGURATION_ERROR, `Invalid S3 URI: ${uri}`, null, false);
}

export async function uploadBufferToS3(bucket: string, key: string, buffer: Buffer, mimeType: string): Promise<string> {
  try {
    const client = getS3Client();
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: mimeType }));
    return `s3://${bucket}/${key}`;
  } catch (e: any) {
    throw new OcrError(OcrErrorCodes.GCS_UPLOAD_FAILED, `Failed to upload to S3 s3://${bucket}/${key}: ${e.message}`, e, true);
  }
}

// Legacy name
export const uploadBufferToGcs = uploadBufferToS3;

export async function downloadS3File(bucket: string, key: string): Promise<Buffer> {
  try {
    const client = getS3Client();
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = res.Body as any;
    if (!body) throw new Error("Empty S3 body");
    // Body is ReadableStream in browser, Node: readable; SDK v3 returns transformable
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  } catch (e: any) {
    throw new OcrError(OcrErrorCodes.GCS_DOWNLOAD_FAILED, `Failed to download s3://${bucket}/${key}: ${e.message}`, e, true);
  }
}

export const downloadGcsFile = downloadS3File;

export async function listS3OutputFiles(bucket: string, prefix: string): Promise<string[]> {
  try {
    const client = getS3Client();
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res: any = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
      for (const obj of res.Contents || []) {
        if (obj.Key) keys.push(obj.Key);
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return keys.sort();
  } catch (e: any) {
    throw new OcrError(OcrErrorCodes.GCS_DOWNLOAD_FAILED, `Failed to list S3 output s3://${bucket}/${prefix}: ${e.message}`, e, true);
  }
}

export const listGcsOutputFiles = listS3OutputFiles;

export async function deleteS3Prefix(bucket: string, prefix: string): Promise<void> {
  try {
    const client = getS3Client();
    let token: string | undefined;
    do {
      const res: any = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
      const contents = res.Contents || [];
      if (contents.length > 0) {
        await client.send(
          new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: contents.map((c: any) => ({ Key: c.Key })) } })
        );
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
      if (!res.IsTruncated) break;
    } while (token);
  } catch {}
}

export const deleteGcsPrefix = deleteS3Prefix;

export function resetS3ClientForTest() {
  s3Client = null;
}
export const resetGcsStorageForTest = resetS3ClientForTest;

export async function getPresignedPutUrl(bucket: string, key: string, contentType: string, expiresSec = 3600): Promise<string> {
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const client = getS3Client();
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  // For browser PUT, we sign with content-type; browser must send same header
  return getSignedUrl(client as any, cmd as any, { expiresIn: expiresSec });
}

export async function getPresignedGetUrl(bucket: string, key: string, expiresSec = 3600): Promise<string> {
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const client = getS3Client();
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client as any, cmd as any, { expiresIn: expiresSec });
}

export async function createS3BucketIfNotExists(bucket: string): Promise<void> {
  // no-op: assume bucket exists; creation requires extra permissions
}
