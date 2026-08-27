# OCR Pipeline — AWS Textract as Source of Truth

## Overview

```
PDF/Image → S3 (PutObject private) → StartDocumentAnalysis (TABLES, LAYOUT) → GetDocumentAnalysis polling (5s, NextToken pagination) → normalizeTextractBlocks → OcrPageResult { lines, blocks, confidence, geometry }
```

Browser never holds AWS creds; Textract jobId persisted on `ProcessingJob.ocrOperationId`.

## Why Textract, Not Vision

- Textract provides `LINE.Geometry.BoundingBox` normalized [0,1], `WORD` children, `Confidence`, `Page`, `Relationships` — exactly what highlighting needs.
- Vision LLM wouldhallucinate boxes; Textract boxes are measured.

## Data Model

```
OcrDocumentResult { jobId, documentId, kind, pages: OcrPageResult[] }
OcrPageResult { pageNumber, text, lines: OcrLine[], blocks: OcrBlock[], confidence, width/height/rotation }
OcrLine { text, boundingBox {x,y,width,height}, confidence, pageNumber }
OcrBlock { boundingBox, paragraphs: OcrParagraph[], confidence }
OcrParagraph { boundingBox, words: OcrWord[], confidence }
OcrWord { boundingBox, text, confidence, symbols }
```

`lines` is the source for deterministic parsers; `blocks` is a synthesized hierarchy (gap 0.025) for fallback.

## S3

- `ocr-input/{jobId}/{kind}.pdf` (PutObject, private)
- `vedaaistorage` (ap-south-1) — region must match Textract `AWS_REGION`
- Cleanup `deleteS3Prefix` after COMPLETED

## IAM (least privilege)

```
s3:PutObject, GetObject, ListBucket, DeleteObject on arn:aws:s3:::vedaaistorage/* 
textract:StartDocumentAnalysis, GetDocumentAnalysis, StartDocumentTextDetection, GetDocumentTextDetection
```

No `AdministratorAccess`.

## Polling

- `OCR_OPERATION_TIMEOUT_MS=300000` (5m per doc), `OCR_POLL_INTERVAL_MS=5000`, `OCR_MAX_RETRIES=3` (exp backoff)
- `getOperationStatus` tries `GetDocumentAnalysis` then `GetDocumentTextDetection`
- `getOperationResult` loops `NextToken` with `MaxResults=1000` until `NextToken` undefined

## Normalization

`normalizeTextractBlocks` in `src/lib/ocr/textract.ts:199`:

- Creates `pagesMap` from `PAGE` blocks; ensures at least 1 page
- Groups `LINE` by `Page`, sorts by `Top`
- Synthesizes `blocks` by vertical gap >0.025, `paragraphs` by gap >0.015
- Resolves `WORD` via `LINE.Relationships.CHILD.Ids` or fallback word split
- Stores per-page `lines` for question parser / answer segmentation

## Deterministic Parsers

### Question Parser `src/lib/structure/question-parser.ts`

- Input: `OcrDocumentResult` + `DocumentPage[]`
- Steps: `readingOrderSort` (y then x, two-column detection via `x<0.4`/`x>=0.5`), regex `QUESTION_LABEL_RE` for `1, Q1, Question 1, 11(a), 11 (a), 11(a)(i), (a), (i)`, preserves `rawNumber`, normalizes via `normalizeNumber`, merges continuation lines, extracts `marks` via `MARKS_RE`, per-page `bboxesByPage` (union per page), confidence avg, filter footer page numbers.

### Answer Segmentation `src/lib/structure/answer-segmentation.ts`

- Input: `OcrDocumentResult` + `DocumentPage[]`
- Regex `ANSWER_LABEL_RE` for `Q1, Ans 1, Answer 1, 11(a)` at line start, groups vertically continuous lines until next label, handles page continuity, produces `SegmentedAnswer { questionLabel, normalizedLabel, text, pageNumbers, bboxesByPage, confidence }`, multi-page via `bboxesByPage.size>1`.

## Mapping

`src/lib/jobs/runner.ts:matchingStage` — deterministic evidence: `EXPLICIT_QUESTION_LABEL` (0.95), `SEMANTIC_SIMILARITY` (Jaccard), `LAYOUT_CONTINUITY`, `OCR_CONFIDENCE` — then `decideForQuestion` thresholds `MAPPING_HIGH=0.75`, `MAPPING_REVIEW=0.50`.

## Highlighting

Textract `Left/Top/Width/Height` → `NormalizedBox` → `src/lib/coordinates/transform.ts` → `HighlightOverlay` CSS `%`. Multi-page via `AnswerGroup.regions[]` (one per page). Tested at scales 0.5/1/2, rotations 0/90/180/270.

## Failure Modes

- `OCR_S3_UPLOAD_FAILED` → stage FAILED
- `TEXTRACT_START_FAILED` / `OCR_OPERATION_TIMEOUT` → FAILED
- `QUESTION_EXTRACTION_FAILED` if 0 questions (mock fallback only for tests)
- Never silent mock; production fails clearly.
