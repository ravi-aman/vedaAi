# OCR Providers — Textract (legacy low-level) + Paddle wrapper

This directory contains the low-level AWS Textract + S3 implementation.

**Status:** Used as internal engine for `OCR_PROVIDER=aws` / `textract` via `src/lib/ocr/textract-provider.ts`.

Files:
- `textract.ts` — TextractOcrProvider (TextractClient, StartDocumentAnalysis, GetDocumentAnalysis, pagination, normalizeTextractBlocks)
- `s3.ts` — S3Client staging helpers (uploadBufferToS3, deleteS3Prefix, etc.)

**Active runtime:**
- `OCR_PROVIDER=local` (or `paddleocr` alias) → `src/lib/ocr/paddle-provider.ts` (Python worker)
- `OCR_PROVIDER=aws` (or `textract` alias) → `src/lib/ocr/textract-provider.ts` → wraps `legacy/textract.ts` + `legacy/s3.ts` (NO Paddle/Python)
- `OCR_PROVIDER=mock` → `src/lib/ocr/mock.ts` (tests)

`textract-provider.ts` is the only production entry point that should import from `legacy/`.
Direct imports from `src/lib/jobs/runner.ts` go through `getLocalOcrProvider()` which lazily requires the correct provider.
