import { Storage } from "@google-cloud/storage";
import { getConfig } from "@/lib/config";
import { OcrError, OcrErrorCodes } from "./errors";

let storageInstance: Storage | null = null;

function getStorage(): Storage {
  if (storageInstance) return storageInstance;
  const cfg = getConfig() as any;
  // Supports GOOGLE_APPLICATION_CREDENTIALS file path (ADC) automatically.
  // If JSON key provided via env, write to temp file or use credentials object.
  const opts: any = {};
  if (cfg.GOOGLE_CLOUD_PROJECT_ID) opts.projectId = cfg.GOOGLE_CLOUD_PROJECT_ID;
  if (cfg.GOOGLE_CLOUD_KEY_JSON) {
    try {
      const parsed = JSON.parse(cfg.GOOGLE_CLOUD_KEY_JSON);
      opts.credentials = parsed;
    } catch (e) {
      throw new OcrError(OcrErrorCodes.CONFIGURATION_ERROR, "Invalid GOOGLE_CLOUD_KEY_JSON", e, false);
    }
  }
  // GOOGLE_APPLICATION_CREDENTIALS is picked up automatically by google-auth-library
  storageInstance = new Storage(opts);
  return storageInstance;
}

export function parseGcsUri(uri: string): { bucket: string; prefix: string } {
  if (!uri.startsWith("gs://")) throw new OcrError(OcrErrorCodes.CONFIGURATION_ERROR, `Invalid GCS URI: ${uri}`, null, false);
  const withoutScheme = uri.slice(5);
  const slash = withoutScheme.indexOf("/");
  if (slash === -1) return { bucket: withoutScheme, prefix: "" };
  return { bucket: withoutScheme.slice(0, slash), prefix: withoutScheme.slice(slash + 1) };
}

export function buildGcsUris(jobId: string): { inputUri: string; outputUri: string; inputObject: string; outputPrefix: string } {
  const cfg = getConfig() as any;
  const bucket: string = cfg.GOOGLE_CLOUD_STORAGE_BUCKET;
  if (!bucket) throw new OcrError(OcrErrorCodes.CONFIGURATION_ERROR, "GOOGLE_CLOUD_STORAGE_BUCKET not configured", null, false);
  const inputPrefix: string = cfg.GOOGLE_CLOUD_OCR_INPUT_PREFIX || "ocr-input";
  const outputPrefix: string = cfg.GOOGLE_CLOUD_OCR_OUTPUT_PREFIX || "ocr-output";
  const safeJob = jobId.replace(/[^a-zA-Z0-9-]/g, "");
  const inputObject = `${inputPrefix}/${safeJob}/input.pdf`;
  const outputPref = `${outputPrefix}/${safeJob}/`;
  return {
    inputUri: `gs://${bucket}/${inputObject}`,
    outputUri: `gs://${bucket}/${outputPref}`,
    inputObject,
    outputPrefix: outputPref,
  };
}

export async function uploadBufferToGcs(bucket: string, objectName: string, buffer: Buffer, mimeType: string): Promise<string> {
  try {
    const storage = getStorage();
    const file = storage.bucket(bucket).file(objectName);
    await file.save(buffer, { contentType: mimeType, resumable: false });
    return `gs://${bucket}/${objectName}`;
  } catch (e: any) {
    throw new OcrError(OcrErrorCodes.GCS_UPLOAD_FAILED, `Failed to upload to GCS gs://${bucket}/${objectName}: ${e.message}`, e, true);
  }
}

export async function downloadGcsFile(bucket: string, objectName: string): Promise<Buffer> {
  try {
    const storage = getStorage();
    const [buf] = await storage.bucket(bucket).file(objectName).download();
    return buf as Buffer;
  } catch (e: any) {
    throw new OcrError(OcrErrorCodes.GCS_DOWNLOAD_FAILED, `Failed to download gs://${bucket}/${objectName}: ${e.message}`, e, true);
  }
}

export async function listGcsOutputFiles(bucket: string, prefix: string): Promise<string[]> {
  try {
    const storage = getStorage();
    const [files] = await storage.bucket(bucket).getFiles({ prefix });
    return files
      .map((f) => f.name)
      .filter((n) => n.endsWith(".json"))
      .sort();
  } catch (e: any) {
    throw new OcrError(OcrErrorCodes.GCS_DOWNLOAD_FAILED, `Failed to list GCS output gs://${bucket}/${prefix}: ${e.message}`, e, true);
  }
}

export async function deleteGcsPrefix(bucket: string, prefix: string): Promise<void> {
  try {
    const storage = getStorage();
    const [files] = await storage.bucket(bucket).getFiles({ prefix });
    await Promise.all(files.map((f) => f.delete().catch(() => {})));
  } catch {}
}

export function resetGcsStorageForTest() {
  storageInstance = null;
}
