# VISION PIPELINE — PaddleOCR + Vision Fusion

**Model:** `qwen/qwen3-vl-32b-instruct` via OpenRouter, `OPENROUTER_API_KEY` (dotenv), `VISION_PROVIDER=auto`, `VISION_MAX_PAGES=3`, `VISION_TIMEOUT_MS=90000`, `VISION_ENABLED=true`

## INPUT
- `VisionAnalyzeDocumentInput { pages: [{pageId, pageNumber, imageBase64 PNG 893x1263 @1.5x, mimeType, width, height, ocrBlocks: [{id, text, bbox, confidence}]}], ocrTextSample, ocrBlocksByPage }`
- For `ea1ece3c`: QP 27p → Vision 3 pages (498KB payload, 3 images), AS 31p → Vision 3 pages (1787KB payload, 3 images), both `imageCount 3 >0`

## OUTPUT
- `VisionDocumentAnalysis { pages: VisionPageStructure[], globalStructure }`
- `VisionPageStructure { pageNumber, visualRegions: [{type, description, confidence, coarseBox, blockIds, relatedQuestionLabel}], questionCandidates: [{rawLabel, textHint, confidence, visualEvidence, blockIds, type}], answerGroupHints: [{labelHint, description, confidence, isDiagram, blockIds}], documentStructureHints: {sections, isMultiColumn} }`
- Types: `QUESTION, SUBPART, OPTION, INSTRUCTION, HEADER, FOOTER, INTERNAL_CHOICE, DIAGRAM, CONTINUATION, SECTION_HEADER, HANDWRITING_BLOCK, FIGURE, TABLE, MARKS` — normalized via `normalizeRegionType` lenient (handles `regionType: title` → `HEADER`, `handwriting` → `HANDWRITING_BLOCK`, `relatedQuestionLabel: null` → nullable)

## PROMPT (Structural, not transcription)
- System: "You are VedaAI document structure analyzer, not a transcriber. ... For each candidate, include blockIds referencing provided OCR block IDs. Do NOT invent final coordinates."
- User: `pageCount, ocrHint, blockIdsHint` with `ocrBlocksByPage` slice 10 per page

## ALGORITHM
- `buildMultimodalUserContent` → `content: [{type:"text", text: JSON}, {type:"image_url", image_url:{url: data:image/png;base64,...}} x3]` → `client.chat.completions.create` with `model, messages: [system, user], temperature 0.2, response_format json_object, max_tokens 6000` → `withRetry` 3 (exponential backoff 600ms) → `withTimeout` 90000

## ERROR HANDLING
- `stripFences` + `extractJsonObject` + `JSON.parse` → `VisionPageStructureSchema.safeParse` (lenient: `type` optional with `regionType` fallback, `relatedQuestionLabel` nullable, `content` nullable, `confidence` default 0.7)
- Previous failures: `visualRegions[0].type` missing → now `type || regionType || label` fallback to `INSTRUCTION`, `relatedQuestionLabel` null → `z.string().nullable().optional()`
- Logs: `vision_request` with `payloadKb`, `vision_response` latency 29s QP + 34s AS, `vision_schema_fallback` if needed (now 0 for AS after fix), `analyze_ok` with `visionPages 3`

## VISION ROUTING
- `shouldInvokeVision(ocr, {kind})` — for QP: `avgConf>0.85 && lines>20 && !hasLowConfidenceLines` → `useVision false` else `hasLowConfidenceLines || multiColumn` → true; for AS: `avgConf<0.85 || hasLowConfidenceLines || lines>20` → `useVision true, hard, answerSheet handwriting` (fixed Phase 3)
- `getVisionProvider()` — checks `hasKeyViaConfig || hasKeyViaEnv` (dotenv), returns `OpenRouterVisionProvider` cached, `getVisionDiagnostics()` reports `keyPresent`

## FUSION
- `fuseDocuments` (Vision + Paddle) → `canonical: CanonicalDocument` with `evidence: [{type:"VISION_LABEL", source:"vision-page-3", score:0.9, explanation:"Vision 5 not found in ..."}]`, grounding `hasGrounding` via `canonical.pages.some(line.text.includes(...))`

## ARTIFACTS
- `vision-qp.json`, `vision-as.json` (when available), `fusion-qp.json`, `canonical-*.json`

## PERFORMANCE
- For `ea1ece3c`: QP 3 pages 29.7s latency, 667KB payload; AS 3 pages 34.0s, 2384KB payload; total Vision 63s (dominant after OCR 135s)
