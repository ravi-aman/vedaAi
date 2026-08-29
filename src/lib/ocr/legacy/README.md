# Legacy OCR — Textract / S3 staging (ARCHIVED, NOT IN RUNTIME)

This directory contains the historical AWS Textract implementation that was used before the PaddleOCR migration.

**Status:** NEVER imported by production code. Kept only for reference / rollback audit.

Files:
- `textract.ts` — TextractOcrProvider (TextractClient, StartDocumentAnalysis, GetDocumentAnalysis, pagination, normalizeTextractBlocks)
- `s3.ts` — S3Client staging helpers (uploadBufferToS3, deleteS3Prefix, etc.)

**Active runtime uses:** `src/lib/ocr/paddle-provider.ts` via `getLocalOcrProvider()`.

If any production file imports from `legacy/`, CI must fail.

Search for `legacy` imports should return 0 hits in `src/lib/jobs/runner.ts`, `src/lib/ocr/factory.ts`, `src/app/**`.
