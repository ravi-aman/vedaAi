import { NextRequest, NextResponse } from "next/server";
import { jobStore } from "@/lib/storage";
import { generateId } from "@/lib/storage";
import { getConfig } from "@/lib/config";
import { getPresignedPutUrl } from "@/lib/ocr/legacy/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * POST /api/jobs/:jobId/presign
 * Body: { kind: "questionPaper"|"answerSheet", fileName: string, contentType: string, fileSize: number }
 * Returns: { fileId, s3Key, bucket, presignedUrl, expiresAt }
 *
 * Browser then PUTs file directly to S3 (bypasses Vercel 4.5MB limit).
 * After PUT, call POST /api/jobs/:jobId/upload with { fileId, s3Key, ... } JSON to register.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await jobStore.get(jobId);
  if (!job) return NextResponse.json({ error: "Job not found", code: "JOB_NOT_FOUND" }, { status: 404 });

  try {
    const body = await req.json().catch(() => ({}));
    const kind = body.kind as string;
    const fileName = String(body.fileName || "file.pdf");
    const contentType = String(body.contentType || "application/pdf");
    const fileSize = Number(body.fileSize || 0);

    if (!kind || !["questionPaper", "answerSheet"].includes(kind)) {
      return NextResponse.json({ error: "kind must be questionPaper|answerSheet", code: "FILE_INVALID" }, { status: 400 });
    }

    const cfg = getConfig() as any;
    const bucket = cfg.AWS_S3_BUCKET;
    const region = cfg.AWS_REGION || "ap-south-1";
    if (!bucket) {
      return NextResponse.json({ error: "AWS_S3_BUCKET not configured", code: "CONFIGURATION_ERROR" }, { status: 500 });
    }

    // Validate size against our app limit (not Vercel limit)
    const maxSize = (cfg.MAX_FILE_SIZE_MB || 100) * 1024 * 1024;
    if (fileSize > maxSize) {
      return NextResponse.json({ error: `File too large ${fileSize} > ${maxSize}`, code: "FILE_TOO_LARGE" }, { status: 413 });
    }

    const fileId = generateId();
    const safeJob = jobId.replace(/[^a-zA-Z0-9-]/g, "");
    const safeFile = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(0, 80);
    // Store under uploads/{jobId}/{fileId}-{name} so we can map fileId -> s3Key later
    const s3Key = `uploads/${safeJob}/${fileId}-${safeFile}`;

    // For browser PUT we must sign with same ContentType the browser will send
    // Use application/pdf fallback if detection fails
    const ct = contentType.includes("/") ? contentType : "application/pdf";

    const presignedUrl = await getPresignedPutUrl(bucket, s3Key, ct, 3600);

    console.log(JSON.stringify({ jobId, stage: "PRESIGN", kind, fileId: fileId.slice(0, 8), s3Key, bucket, contentType: ct }));

    return NextResponse.json({
      fileId,
      s3Key,
      bucket,
      region,
      presignedUrl,
      expiresIn: 3600,
      // hint for client: PUT with header Content-Type: ct
      requiredHeaders: { "Content-Type": ct },
    });
  } catch (e: any) {
    console.error("[presign] failed", e);
    return NextResponse.json({ error: e.message || "Failed to presign", code: e.code || "UNKNOWN_ERROR" }, { status: 500 });
  }
}
