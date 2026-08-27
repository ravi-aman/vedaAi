# AWS Textract OCR — Async PDF Pipeline

## Overview
VedaAI uses **Amazon Textract** (`StartDocumentAnalysis` / `GetDocumentAnalysis` + `StartDocumentTextDetection`) with **Amazon S3** private staging for all document OCR. This replaces GCP Vision. Textract provides page-aware `Block` geometry (BoundingBox normalized [0,1], Polygon), confidence, and line/word hierarchy needed for exact answer highlighting.

```
Browser → Upload (local tmp + job store) → Server stores file → Upload to private S3 (ocr-input/{jobId}/{kind}.pdf)
→ StartDocumentAnalysis (FeatureTypes=[TABLES, LAYOUT]) → Textract JobId → Poll GetDocumentAnalysis (NextToken pagination)
→ Normalize blocks → Question/Answer extraction (LLM uses OCR_TEXT hints) → Matching → Result
```

Browser never holds AWS credentials, never calls Textract/S3 directly, never sees secrets.

## Environment
```
OCR_PROVIDER=textract              # or mock for tests only
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=                 # server-only, or IAM role
AWS_SECRET_ACCESS_KEY=             # server-only
AWS_S3_BUCKET=veda-ai-documents
AWS_TEXTRACT_OUTPUT_BUCKET=        # optional, defaults to S3_BUCKET
AWS_S3_INPUT_PREFIX=ocr-input
AWS_S3_OUTPUT_PREFIX=ocr-output
# Optional SNS/SQS async (if unset, polling is used)
AWS_SNS_TOPIC_ARN=
AWS_SNS_ROLE_ARN=
AWS_SQS_QUEUE_URL=
OCR_OPERATION_TIMEOUT_MS=300000
OCR_POLL_INTERVAL_MS=5000
OCR_MAX_RETRIES=3
```
Never use `NEXT_PUBLIC_` for AWS secrets. Credentials are server-only via `src/lib/config` and `src/lib/ocr/s3.ts`/`textract.ts`.

## IAM (least privilege)
Do NOT use `AdministratorAccess`. Create user/role `veda-textract`:

**S3:**
```json
{
  "Effect": "Allow",
  "Action": ["s3:PutObject","s3:GetObject","s3:DeleteObject","s3:ListBucket"],
  "Resource": ["arn:aws:s3:::veda-ai-documents","arn:aws:s3:::veda-ai-documents/*"]
}
```

**Textract:**
```json
{ "Effect": "Allow", "Action": ["textract:StartDocumentAnalysis","textract:GetDocumentAnalysis","textract:StartDocumentTextDetection","textract:GetDocumentTextDetection"], "Resource": "*" }
```

If using SNS/SQS:
```json
{ "Effect": "Allow", "Action": ["sns:Publish"], "Resource": "arn:aws:sns:us-east-1:123:veda-textract" }
{ "Effect": "Allow", "Action": ["iam:PassRole"], "Resource": "arn:aws:iam::123:role/veda-textract-sns-role" }
```
Prefer IAM role-based credentials in production (EC2/ECS/Lambda) over long-lived keys.

## S3 Layout
```
ocr-input/{jobId}/questionPaper.pdf
ocr-input/{jobId}/answerSheet.pdf
# Textract reads directly from S3; no intermediate presigned URLs needed for processing
# Output is fetched via GetDocumentAnalysis (not S3 output bucket)
```

## Async Flow
`src/lib/jobs/runner.ts:ocrStage()`:
1. Idempotency check (`ocrResultStore` + `job.ocrCompletedAt`).
2. If `OCR_PROVIDER=mock` → synthetic pages.
3. Else per doc:
   - `fileStorage.read` → `uploadBufferToS3` (retry 3, backoff)
   - `submitDocument` → `StartDocumentAnalysis` (retry, map ACCESS_DENIED→OCR_AUTH_ERROR)
   - Persist `ocrOperationId`, `ocrOutputUri`, `ocrStartedAt` on job
   - Poll `getOperationStatus` every 5s until DONE/FAILED or timeout 300s
   - `getOperationResult` with pagination (`NextToken` loop, MaxResults=1000) → `normalizeTextractBlocks`
4. Store `ocrResultStore`, mark `ocrCompletedAt`, stage `OCR_COMPLETED`.
5. Cleanup `deleteS3Prefix` after success (best-effort).

`src/lib/ocr/textract.ts` handles pagination correctly: do/while NextToken.

## Normalization
`normalizeTextractBlocks(blocks)` → `OcrPageResult[]`:
- Groups PAGE/LINE/WORD blocks by `Page`.
- Synthesizes `OcrBlock` → `paragraphs` → `words` from line gaps (0.025 threshold).
- Preserves: `text`, `confidence` (divided by 100), `boundingBox` (already normalized), `width/height` (0 since Textract normalized), `rotation`.
- Uses `Relationships CHILD` to map LINE→WORD ids; fallback splits line text.
- Sorted by pageNumber, lines sorted by Top (reading order).

Rest of app depends on `OcrDocumentResult`, not raw Textract.

## Highlighting
Each `AnswerRegion.sourceBoxes` comes from Textract `BoundingBox.Left/Top/Width/Height` (already [0,1]). `src/lib/coordinates/transform.ts` maps to display. Multi-box, multi-page supported via `answer.regions[]`.

## Error Codes
| Code | Meaning | Action |
|------|---------|--------|
| `OCR_CONFIGURATION_ERROR` | Missing AWS_S3_BUCKET/REGION | Set env or use mock for tests |
| `OCR_AUTH_ERROR` | AccessDenied | Check IAM, region, keys |
| `OCR_BUCKET_ACCESS_ERROR` | InvalidS3Object/NoSuchBucket | Verify bucket exists, same region as Textract |
| `OCR_SUBMISSION_FAILED` | StartDocument failed | Retryable, check mime, size |
| `OCR_OPERATION_TIMEOUT` | Poll exceeded 300s | Increase timeout or split PDF (<50 pages) |
| `OCR_OUTPUT_MISSING` | No blocks | Re-run, check document valid |
| `OCR_OUTPUT_PARSE_FAILED` | Malformed | Re-run |

## Cost
Textract pricing (us-east-1): ~$1.50 per 1000 pages for DetectDocumentText, ~$10+ for AnalyzeDocument (tables/layout). One OCR per doc per job, idempotent, bounded retries, no repeated fetch. 10-page paper+answer ≈ $0.15–0.30. Budget via job reuse and `MAX_PAGES=50`.

## Testing
- Unit: `tests/unit/textract.test.ts` (single/multi-page, pagination, out-of-order, bbox, confidence, faint handwriting).
- Integration: `tests/integration/textract-integration.test.ts` (pagination contract, multi-page regions).
- Smoke: `npm run test:aws` — requires real AWS creds, uploads small PDF, runs Textract, checks blocks/bboxes/normalization, cleans up.

## Security
- Bucket private, no public ACL, short-lived server access only.
- No secrets in client bundle, logs, or error pages.
- `ocrStage` logs only sizes, pageCounts, operationId prefix.

## References
- Textract async: https://docs.aws.amazon.com/textract/latest/dg/async.html
- StartDocumentAnalysis: https://docs.aws.amazon.com/textract/latest/APIReference/API_StartDocumentAnalysis.html
- GetDocumentAnalysis with NextToken: https://docs.aws.amazon.com/textract/latest/dg/get-results.html
