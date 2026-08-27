/**
 * AWS Textract smoke test — verifies real S3 + Textract end-to-end.
 * Run: npm run test:aws
 * Requires: AWS_REGION, AWS_S3_BUCKET, AWS credentials (keys or IAM role).
 * Does NOT run in unit tests; only on demand.
 */
import { getConfig } from "../src/lib/config/index";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { TextractClient, StartDocumentTextDetectionCommand, GetDocumentTextDetectionCommand, StartDocumentAnalysisCommand, GetDocumentAnalysisCommand } from "@aws-sdk/client-textract";

async function main() {
  console.log("=== AWS Textract Smoke Test ===");
  const cfg = getConfig() as any;
  console.log(`Region: ${cfg.AWS_REGION} Bucket: ${cfg.AWS_S3_BUCKET} Provider: ${cfg.OCR_PROVIDER}`);

  if (cfg.OCR_PROVIDER === "mock") {
    console.error("FAIL: OCR_PROVIDER=mock — set OCR_PROVIDER=textract for smoke test");
    process.exit(1);
  }
  if (!cfg.AWS_S3_BUCKET) {
    console.error("FAIL: AWS_S3_BUCKET not set — see .env.example");
    process.exit(1);
  }
  // S3 access check
  const region = cfg.AWS_REGION || "us-east-1";
  const s3Opts: any = { region };
  if (cfg.AWS_ACCESS_KEY_ID && cfg.AWS_SECRET_ACCESS_KEY) {
    s3Opts.credentials = { accessKeyId: cfg.AWS_ACCESS_KEY_ID, secretAccessKey: cfg.AWS_SECRET_ACCESS_KEY };
  }
  const s3 = new S3Client(s3Opts);
  const textract = new TextractClient(s3Opts);

  const testKey = `smoke-test/textract-smoke-${Date.now()}.txt`;
  const testBody = Buffer.from("Hello Textract smoke test — handwritten text VedaAI Q1 answer");

  console.log(`1. Head bucket ${cfg.AWS_S3_BUCKET}...`);
  try {
    await s3.send(new HeadBucketCommand({ Bucket: cfg.AWS_S3_BUCKET }));
    console.log("   OK - bucket accessible");
  } catch (e: any) {
    console.error(`   FAIL - bucket not accessible: ${e.message}`);
    process.exit(1);
  }

  console.log(`2. Put object s3://${cfg.AWS_S3_BUCKET}/${testKey}...`);
  try {
    await s3.send(new PutObjectCommand({ Bucket: cfg.AWS_S3_BUCKET, Key: testKey, Body: testBody, ContentType: "text/plain" }));
    console.log("   OK");
  } catch (e: any) {
    console.error(`   FAIL - put: ${e.message}`);
    process.exit(1);
  }

  console.log(`3. Get object...`);
  try {
    const res: any = await s3.send(new GetObjectCommand({ Bucket: cfg.AWS_S3_BUCKET, Key: testKey }));
    const bytes = await res.Body.transformToByteArray();
    if (bytes.length === 0) throw new Error("Empty body");
    console.log(`   OK - ${bytes.length} bytes`);
  } catch (e: any) {
    console.error(`   FAIL - get: ${e.message}`);
    process.exit(1);
  }

  // Textract: upload a tiny PDF and run StartDocumentTextDetection
  console.log(`4. Textract - upload small PDF + StartDocumentAnalysis...`);
  // Generate minimal PDF (single page text)
  let pdfBuffer: Buffer;
  try {
    const { PDFDocument, StandardFonts } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText("VedaAI Textract smoke Q1: What is 2+2? Answer: 4", { x: 50, y: 700, size: 14, font });
    page.drawText("Handwritten style answer block at 0.1,0.2", { x: 50, y: 650, size: 10, font });
    pdfBuffer = Buffer.from(await pdf.save());
  } catch (e: any) {
    console.error(`   FAIL - pdf gen: ${e.message}`);
    process.exit(1);
  }
  const pdfKey = `smoke-test/textract-smoke-${Date.now()}.pdf`;
  try {
    await s3.send(new PutObjectCommand({ Bucket: cfg.AWS_S3_BUCKET, Key: pdfKey, Body: pdfBuffer, ContentType: "application/pdf" }));
    console.log(`   Uploaded ${pdfBuffer.length} bytes to ${pdfKey}`);
  } catch (e: any) {
    console.error(`   FAIL - pdf upload: ${e.message}`);
    process.exit(1);
  }

  let jobId: string | undefined;
  try {
    const cmd = new StartDocumentTextDetectionCommand({ DocumentLocation: { S3Object: { Bucket: cfg.AWS_S3_BUCKET, Name: pdfKey } } });
    const res: any = await textract.send(cmd as any);
    jobId = res.JobId;
    console.log(`   StartDocumentTextDetection OK - JobId ${jobId?.slice(0, 20)}...`);
  } catch (e: any) {
    // Try analysis
    try {
      const cmd2 = new StartDocumentAnalysisCommand({ DocumentLocation: { S3Object: { Bucket: cfg.AWS_S3_BUCKET, Name: pdfKey } }, FeatureTypes: ["TABLES"] });
      const res2: any = await textract.send(cmd2 as any);
      jobId = res2.JobId;
      console.log(`   StartDocumentAnalysis OK - JobId ${jobId?.slice(0, 20)}...`);
    } catch (e2: any) {
      console.error(`   FAIL - StartDocument failed: ${e2.message}`);
      await cleanup(s3, cfg.AWS_S3_BUCKET, testKey, pdfKey);
      process.exit(1);
    }
  }

  if (!jobId) {
    console.error("   FAIL - no JobId");
    await cleanup(s3, cfg.AWS_S3_BUCKET, testKey, pdfKey);
    process.exit(1);
  }

  console.log(`5. Polling Textract job...`);
  const start = Date.now();
  let blocks: any[] = [];
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      let res: any;
      try {
        res = await textract.send(new GetDocumentTextDetectionCommand({ JobId: jobId!, MaxResults: 10 }) as any);
      } catch {
        res = await textract.send(new GetDocumentAnalysisCommand({ JobId: jobId!, MaxResults: 10 }) as any);
      }
      const status = res.JobStatus;
      console.log(`   Poll ${i + 1}: ${status} (${((Date.now() - start) / 1000).toFixed(0)}s)`);
      if (status === "SUCCEEDED") {
        // fetch all with pagination
        let token: string | undefined;
        blocks = [];
        do {
          let r2: any;
          try {
            r2 = await textract.send(new GetDocumentTextDetectionCommand({ JobId: jobId!, MaxResults: 1000, NextToken: token }) as any);
          } catch {
            r2 = await textract.send(new GetDocumentAnalysisCommand({ JobId: jobId!, MaxResults: 1000, NextToken: token }) as any);
          }
          blocks.push(...(r2.Blocks || []));
          token = r2.NextToken;
        } while (token);
        break;
      }
      if (status === "FAILED") {
        console.error(`   FAIL - job failed: ${res.StatusMessage}`);
        await cleanup(s3, cfg.AWS_S3_BUCKET, testKey, pdfKey);
        process.exit(1);
      }
    } catch (e: any) {
      console.warn(`   Poll error: ${e.message}`);
    }
    if (Date.now() - start > 120000) {
      console.error("   FAIL - timeout after 120s");
      await cleanup(s3, cfg.AWS_S3_BUCKET, testKey, pdfKey);
      process.exit(1);
    }
  }

  if (blocks.length === 0) {
    console.error("   FAIL - no blocks returned");
    await cleanup(s3, cfg.AWS_S3_BUCKET, testKey, pdfKey);
    process.exit(1);
  }
  const lines = blocks.filter((b) => b.BlockType === "LINE");
  console.log(`6. Verify blocks: total ${blocks.length}, lines ${lines.length}`);
  if (lines.length === 0) {
    console.error("   FAIL - no LINE blocks");
    await cleanup(s3, cfg.AWS_S3_BUCKET, testKey, pdfKey);
    process.exit(1);
  }
  const hasText = lines.some((l) => l.Text && l.Text.length > 0);
  const hasBox = lines.some((l) => l.Geometry?.BoundingBox);
  console.log(`   hasText=${hasText} hasBoundingBox=${hasBox}`);
  if (!hasText) console.warn("   WARN - no text in lines");
  if (!hasBox) console.warn("   WARN - no boundingBox in lines");

  // Normalize check
  const { normalizeTextractBlocks } = await import("../src/lib/ocr/textract");
  const pages = normalizeTextractBlocks(blocks);
  console.log(`7. Normalized pages: ${pages.length}, page1 text len ${pages[0]?.text.length}, blocks ${pages[0]?.blocks.length}`);
  if (pages.length === 0 || pages[0].blocks.length === 0) {
    console.error("   FAIL - normalized empty");
    await cleanup(s3, cfg.AWS_S3_BUCKET, testKey, pdfKey);
    process.exit(1);
  }
  // Check bbox [0,1]
  const box = pages[0].blocks[0].boundingBox;
  console.log(`   sample bbox x=${box.x} y=${box.y} w=${box.width} h=${box.height}`);
  if (box.x < 0 || box.x > 1 || box.y < 0 || box.y > 1) {
    console.warn("   WARN - bbox out of [0,1]");
  }

  console.log("8. Cleanup...");
  await cleanup(s3, cfg.AWS_S3_BUCKET, testKey, pdfKey);
  console.log("=== SMOKE PASS ===");
}

async function cleanup(s3: S3Client, bucket: string, ...keys: string[]) {
  for (const k of keys) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: k }));
      console.log(`   deleted ${k}`);
    } catch {}
  }
}

main().catch((e) => {
  console.error("Smoke unhandled", e);
  process.exit(1);
});
