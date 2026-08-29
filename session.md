# New session - 2026-08-29T08:26:48.136Z

**Session ID:** ses_fb35f1a37ffeHuahO9Y2mEyT6O
**Created:** 8/29/2026, 1:56:48 PM
**Updated:** 8/29/2026, 2:18:37 PM

---

## User

# VedaAI — COMPLETE AWS TEXTRACT → LOCAL PADDLEOCR / PP-STRUCTUREV3 MIGRATION
# FULL FORENSIC AUDIT → BENCHMARK → IMPLEMENTATION → REAL E2E → ACCURACY VERIFICATION
# NO BLACK BOXES • NO MOCKS • NO STUBS • NO PAPER-SPECIFIC HACKS

You are working on the existing VedaAI Next.js application.

The application currently has a real document-processing pipeline using:

PDF/Image
→ S3
→ AWS Textract
→ OCR blocks + bounding boxes
→ Vision Model
→ Fusion
→ Question Tree
→ Answer Graph
→ Mapping
→ Localization
→ PDF.js
→ Highlight

The objective is to REMOVE AWS TEXTRACT FROM THE ACTIVE OCR RUNTIME PIPELINE and replace it with a LOCAL OCR implementation using PaddleOCR / PP-StructureV3.

The local OCR must run WITHOUT a separately deployed OCR server.

The existing Vision Model must remain and continue to operate as the visual/semantic understanding layer.

The final architecture should be:

                         ORIGINAL PDF / IMAGE
                                  │
                                  ▼
                          PAGE NORMALIZATION
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
               LOCAL OCR                    VISION MODEL
            PaddleOCR / PP-              Actual page image
            StructureV3                  visual understanding
                    │                           │
                    │                           │
            text + bbox +                 structure +
            confidence +                  handwriting +
            layout + page                 semantic context
                    │                           │
                    └─────────────┬─────────────┘
                                  ▼
                            FUSION LAYER
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
               QUESTION TREE                ANSWER GRAPH
                    │                           │
                    └─────────────┬─────────────┘
                                  ▼
                            MAPPING ENGINE
                                  │
                                  ▼
                           VALIDATION ENGINE
                                  │
                                  ▼
                           ANSWER REGIONS
                                  │
                                  ▼
                                PDF.js
                                  │
                                  ▼
                              HIGHLIGHTS

IMPORTANT RESPONSIBILITY SPLIT:

LOCAL OCR:
- text detection
- line/word detection
- bounding boxes/polygons
- confidence
- reading order
- layout evidence
- page-level geometry

VISION MODEL:
- handwriting understanding
- visual structure
- answer grouping
- ambiguous labels
- semantic interpretation
- diagrams
- continuation reasoning
- visual evidence

YOUR APPLICATION CODE:
- canonical data model
- hierarchy
- question parsing
- answer segmentation
- candidate generation
- mapping
- conflict resolution
- confidence aggregation
- coordinate transformations
- highlighting

DO NOT let one model perform all responsibilities.

================================================================
ABSOLUTE ENGINEERING RULES
================================================================

DO NOT:

- use fake OCR
- use fake Vision
- use fake mapping
- use fake coordinates
- hardcode this exam paper
- hardcode question numbers
- hardcode page numbers
- hardcode answer mappings
- fabricate confidence
- create placeholder OCR JSON
- create synthetic production results
- silently fallback to mocks
- use mock OCR in production
- keep Textract in the active OCR path after migration
- create a separate OCR server
- hide OCR failures
- hide Vision failures
- silently skip pages
- simply lower thresholds until tests pass
- weaken tests to create green status
- redesign the UI unnecessarily

Mocks are allowed ONLY in isolated unit/integration tests.

Production runtime must use real local OCR + real Vision + real uploaded documents.

================================================================
PHASE 1 — FORENSIC AUDIT BEFORE ANY CODE CHANGE
================================================================

DO NOT MODIFY PRODUCTION CODE YET.

Inspect the COMPLETE repository.

Read and inspect:

- package.json
- lockfile
- next.config.*
- tsconfig
- eslint config
- .env
- .env.example
- README.md
- TODO.md
- docs/**
- src/**
- tests/**
- scripts/**
- all OCR code
- Textract code
- Vision code
- document rendering
- PDF.js viewer
- job runner
- storage
- API routes
- artifact generation

Search repository-wide for:

textract
@aws-sdk/client-textract
StartDocumentAnalysis
GetDocumentAnalysis
DetectDocumentText
Textract
OCR_PROVIDER
OCR
PaddleOCR
Paddle
PPStructureV3
Surya
Tesseract
Vision
OpenRouter
Gemini
OpenAI
bbox
boundingBox
polygon
pageNumber
confidence
mock
fake
stub
fallback
hardcoded
GCS
Google Cloud

Trace the exact runtime execution path.

Document:

1. upload
2. validation
3. storage
4. PDF rendering
5. page normalization
6. OCR
7. OCR normalization
8. Vision
9. fusion
10. structure
11. answer segmentation
12. mapping
13. localization
14. PDF viewer
15. highlighting

Create:

docs/LOCAL_OCR_MIGRATION_AUDIT.md

The audit MUST identify:

- every Textract dependency
- every OCR abstraction
- OCR data contract
- geometry contract
- page coordinate contract
- current Vision input contract
- current Vision output contract
- current Fusion contract
- current QuestionTree contract
- current AnswerGraph contract
- current mapping contract
- current HighlightRegion contract
- all current tests
- all known production issues
- all deployment constraints

Do not trust previous documentation.

Trust actual code and actual runtime behavior.

================================================================
PHASE 2 — LOCAL OCR CANDIDATE DECISION
================================================================

The final selected OCR engine must be:

PaddleOCR / PP-StructureV3

unless the audit proves it is technically impossible in the current environment.

Do NOT switch to Tesseract merely because it is smaller.

Do NOT switch to Surya merely because it is popular.

The intended local OCR stack is:

PaddleOCR 3.x
+
PP-StructureV3 where useful
+
English recognition model/configuration where appropriate
+
lighter/faster modules where possible

PaddleOCR officially supports local inference and PP-StructureV3 provides OCR plus document layout/reading-order functionality. Use those capabilities only where they are actually beneficial; disable expensive optional modules that are unnecessary for VedaAI's OCR contract. :contentReference[oaicite:1]{index=1}

For this product, prioritize:

1. low latency
2. real bounding boxes
3. confidence
4. page identity
5. line grouping
6. printed question-paper accuracy
7. acceptable handwriting OCR
8. memory usage
9. deployment simplicity
10. no separate OCR server

================================================================
PHASE 3 — BENCHMARK REAL DOCUMENTS
================================================================

Before removing Textract, benchmark the selected PaddleOCR configuration.

Use the real documents already used in VedaAI testing:

- real question paper
- real handwritten answer sheet

If the real files are unavailable locally, locate the existing real artifacts/files in the repository.

DO NOT create synthetic documents for the benchmark.

Benchmark at minimum:

QUESTION PAPER:
- representative clean printed pages
- MCQ page
- subpart page
- dense layout page
- page with diagrams/internal choices

ANSWER SHEET:
- clean handwriting page
- dense handwriting page
- page with question labels
- out-of-order answers
- difficult handwriting
- diagram page
- continuation page

Prefer full-document benchmark after candidate configuration is finalized.

================================================================
PHASE 4 — MEASURE EVERYTHING
================================================================

Measure actual numbers.

For each OCR configuration record:

- OS
- CPU
- RAM
- GPU if present
- Python version
- PaddlePaddle version
- PaddleOCR version
- PP-StructureV3 version/config
- model names
- model download size
- loaded model memory
- initialization time
- first-page latency
- warm-page latency
- total OCR time
- average ms/page
- peak memory
- block count
- line count
- word count
- bbox coverage
- polygon coverage
- confidence coverage
- page correctness
- reading-order quality

Generate:

docs/LOCAL_OCR_BENCHMARK.md

and:

artifacts/ocr-benchmark/*.json

Example:

{
  "engine": "paddleocr",
  "pipeline": "PPStructureV3",
  "pages": 39,
  "coldStartMs": ...,
  "warmupMs": ...,
  "totalMs": ...,
  "avgPageMs": ...,
  "peakMemoryMb": ...,
  "lines": ...,
  "words": ...,
  "bboxCoverage": ...,
  "confidenceCoverage": ...
}

DO NOT invent these values.

They must come from actual execution.

================================================================
PHASE 5 — SPEED-FIRST MODEL CONFIGURATION
================================================================

The goal is NOT maximum model complexity.

The goal is:

FAST ENOUGH + ACCURATE ENOUGH + GEOMETRY AVAILABLE.

Audit all optional PP-StructureV3 modules.

Do NOT load unnecessary:

- formula recognition
- chart parsing
- table recognition
- document unwarping
- orientation classification
- other expensive modules

unless the real VedaAI data requires them.

For the question-paper workload, determine exactly which modules are necessary.

For example:

core OCR
+
layout detection
+
textline orientation only if needed

may be enough.

Use the lightest practical configuration that preserves:

text
bbox
confidence
page
layout/order

Official PaddleOCR documentation notes that PP-StructureV3 can become slow or memory-heavy and recommends disabling unnecessary modules / using lighter models when appropriate. :contentReference[oaicite:2]{index=2}

================================================================
PHASE 6 — ENGLISH OCR
================================================================

The question papers are primarily English.

Do NOT blindly use the default multilingual model if a more suitable English recognition model is available.

Audit recognition-model options.

Measure:

default model
vs
English-specific model

on the real question paper.

Choose the better configuration based on measured accuracy and latency.

Document the result.

PaddleOCR's current PP-StructureV3 documentation specifically notes that its default Chinese-English recognizer can have limited accuracy for purely English text and recommends selecting an English recognition model in English-only scenarios. :contentReference[oaicite:3]{index=3}

================================================================
PHASE 7 — LOCAL OCR SERVICE INSIDE NEXT.JS
================================================================

Do NOT build a separate OCR server.

The selected OCR engine must be invoked from the current application/job architecture.

However, because PaddleOCR is Python-native, first determine the cleanest way to run it WITHOUT a separate always-on service.

Possible approach:

Next.js
→ child process / worker
→ Python PaddleOCR runner
→ JSON result
→ Next.js canonical OCR layer

This is acceptable because the OCR is still locally executed as part of the application deployment.

DO NOT create:

Next.js
→ HTTP
→ separately deployed OCR server

unless the current deployment environment absolutely requires it.

The application should treat the Python runner as an internal implementation detail.

================================================================
PHASE 8 — IMPORTANT DEPLOYMENT CHECK
================================================================

Audit the current deployment target.

If the current environment is Vercel/serverless:

DO NOT assume Python/PaddleOCR inference will automatically work there.

Determine whether:

- runtime supports Python
- model files can be packaged
- native dependencies are supported
- execution time is sufficient
- memory is sufficient
- cold-start time is acceptable

If the current deployment cannot support local PaddleOCR reliably:

DO NOT fake compatibility.

Report:

LOCAL_OCR_DEPLOYMENT_BLOCKED

and explain exactly why.

Then investigate whether the existing MVP can use a Node-compatible local OCR path instead.

Do not create a second permanent server unless explicitly required.

================================================================
PHASE 9 — OCR PROVIDER ABSTRACTION
================================================================

Preserve/strengthen:

interface OcrProvider

Example conceptual contract:

processDocument(input): Promise<OcrDocument>

The downstream application MUST NOT depend on PaddleOCR-specific raw output.

Create:

PaddleOcrProvider

The interface must support:

- processPage
- processDocument
- OCR blocks
- lines
- confidence
- bbox
- polygon
- page
- source metadata

Textract code must no longer be required by downstream stages.

================================================================
PHASE 10 — CANONICAL OCR DATA MODEL
================================================================

Normalize PaddleOCR output into the existing canonical model.

Example:

OcrDocument
  pages[]

OcrPage
  pageNumber
  width
  height
  blocks[]
  lines[]
  layout[]

OcrBlock
  id
  text
  bbox
  polygon
  confidence
  type
  pageNumber
  source = "paddleocr"

Every block MUST have stable IDs generated by your application.

Example:

ocr-p003-b042

Never use raw array index as permanent identity.

Preserve source provenance.

================================================================
PHASE 11 — COORDINATE SYSTEM
================================================================

PaddleOCR may return pixel coordinates/polygons.

Normalize them into the existing coordinate contract.

Preserve:

original width
original height
processed width
processed height
scale
rotation
crop
source bbox
normalized bbox

Canonical:

x
y
width
height

normalized to:

0..1

Do NOT lose the original pixel geometry.

Test:

50%
100%
150%
200%

and browser resize.

================================================================
PHASE 12 — PAGE RENDERING
================================================================

Create one consistent page-normalization pipeline.

Input:

PDF / image

Output:

PageImage

with:

pageNumber
imageBuffer
width
height
rotation
sourceDocumentId

This page image should be usable by BOTH:

Local OCR
Vision

Avoid rendering the same page multiple times unnecessarily.

Cache page images within the job scope where safe.

DO NOT retain huge base64 strings in memory unnecessarily.

================================================================
PHASE 13 — VISION STAYS
================================================================

Do NOT remove Vision.

Vision receives:

actual page image
+
OCR blocks
+
coordinates
+
confidence
+
page metadata

Vision responsibilities:

- handwriting interpretation
- answer grouping
- question-label interpretation
- visual structure
- diagrams
- continuation
- ambiguous OCR interpretation
- question hierarchy ambiguity
- semantic evidence

Vision MUST NOT be the final coordinate authority.

OCR/source geometry remains the grounding layer.

================================================================
PHASE 14 — OCR + VISION FUSION
================================================================

Create/maintain an explicit Fusion layer.

Inputs:

Local OCR
+
Vision
+
Page geometry
+
Document metadata

Output:

CanonicalDocument

Do not concatenate outputs.

For each semantic observation preserve provenance:

source
page
blockIds
confidence
evidenceType

Evidence examples:

OCR_TEXT
OCR_BBOX
OCR_CONFIDENCE
VISION_TEXT
VISION_REGION
VISION_LABEL
SPATIAL_CONTINUITY
PAGE_CONTINUITY
LAYOUT
SEMANTIC_SIMILARITY

================================================================
PHASE 15 — QUESTION PAPER
================================================================

The OCR layer does NOT create questions.

Question structure is derived from:

OCR geometry
+
layout
+
numbering
+
hierarchy
+
Vision when ambiguous

Must support:

Question
  ├── SubQuestion
  ├── Option
  └── InternalChoice

Examples:

11
 ├── (a)
 ├── (b)
 └── (c)

MCQ:

5
 ├── A
 ├── B
 ├── C
 └── D

Do NOT allow:

A/B/C/D
to become questions.

Do NOT allow:

(a)/(b)/(c)
to automatically become top-level questions.

================================================================
PHASE 16 — QUESTION ORDER
================================================================

Use:

page
geometry
reading order
numbering
section
hierarchy

not raw OCR response order.

Support:

- multi-column documents
- page breaks
- repeated headers
- instructions
- internal choices

Do not hardcode the current exam.

================================================================
PHASE 17 — ANSWER SHEET
================================================================

Answer sheet is a spatial handwritten document.

Do NOT require perfect OCR transcription.

Use local OCR for:

- candidate labels
- text locations
- lines
- handwriting blocks
- geometry

Use Vision for:

- interpreting handwriting
- grouping visual answer regions
- continuation
- diagrams
- ambiguous labels
- semantic context

AnswerGraph:

AnswerGroup
 ├── AnswerRegion page N
 ├── AnswerRegion page N+1
 └── source block IDs

================================================================
PHASE 18 — ANSWER LABEL DETECTION
================================================================

Do NOT treat any digit as a question label.

Bad:

"1" → Q1

unless the surrounding context supports it.

Support:

Q1
Q.1
Q 1
Ans 1
Answer 1
1.
1)
1(a)
1(b)
etc.

But use evidence from:

- position
- surrounding text
- handwriting
- layout
- indentation
- neighboring blocks
- Vision

A label is a candidate, not absolute truth.

================================================================
PHASE 19 — ANSWER SEGMENTATION
================================================================

Answer segmentation must operate on logical spatial regions.

Not one OCR line = one answer.

Use:

- line proximity
- adaptive gaps
- writing density
- whitespace
- labels
- handwriting
- page boundaries
- Vision grouping
- continuation evidence

Do not use a fixed pixel threshold.

An answer like:

Q7
line 1
line 2
line 3
diagram
line 4

must become ONE logical AnswerGroup.

================================================================
PHASE 20 — MULTI-PAGE CONTINUATION
================================================================

Support:

page N:
Q7
answer

page N+1:
continued answer
(no repeated Q7)

This should produce ONE logical AnswerGroup with multiple page-local regions.

Do NOT merge merely because pages are consecutive.

Use:

- bottom-of-page proximity
- top-of-next-page proximity
- absence of new question label
- visual handwriting continuity
- region similarity
- document sequence
- Vision evidence

================================================================
PHASE 21 — MAPPING
================================================================

Mapping must NEVER be based on array positions.

Never:

questions[0] → answers[0]

Generate candidates:

QuestionNode
→ AnswerGroup[]

Evidence:

- explicit label
- normalized label
- subpart
- spatial evidence
- page continuity
- answer order
- semantic similarity
- OCR confidence
- Vision evidence
- section compatibility

Statuses:

MATCHED
REVIEW
UNANSWERED
UNMATCHED

================================================================
PHASE 22 — GLOBAL MAPPING
================================================================

Do not use simplistic greedy assignment as the only mechanism.

Build:

Question × AnswerGroup candidate matrix

Then perform global conflict-aware assignment.

Constraints:

- one logical answer should not map to unrelated questions
- continuation regions stay together
- subpart compatibility
- explicit labels strongly constrain candidates
- unanswered questions stay unanswered
- unmatched answers remain visible

Use maximum-weight matching or another justified global assignment algorithm.

Document the algorithm.

================================================================
PHASE 23 — SEMANTIC MATCHING
================================================================

Do not rely on Jaccard or lexical overlap as the primary semantic mechanism.

The student answer may use different wording.

Use a real semantic layer:

- embeddings if available
- semantic model
- Vision evidence
- LLM verification for ambiguous cases

Do not make semantic similarity alone decisive.

================================================================
PHASE 24 — CONFIDENCE
================================================================

Keep separate:

OCR confidence
Structure confidence
Answer-region confidence
Mapping confidence
Localization confidence

Never fabricate confidence.

Do not use:

"0.95"

merely because the system found a candidate.

Require evidence.

===============================================================
PHASE 25 — HIGHLIGHTING
================================================================

Final highlighting MUST be based on real OCR/source geometry.

Pipeline:

OCR block IDs
→ AnswerRegion
→ source bboxes
→ merged page-local region
→ normalized bbox
→ PDF.js coordinates
→ CSS overlay

Do NOT highlight every OCR word.

Do NOT highlight every OCR line individually.

Represent:

Question
→ AnswerGroup
→ AnswerRegion[]
→ page-local boxes

For multi-page answers:

page N region
+
page N+1 region

same AnswerGroup.

================================================================
PHASE 26 — PDF VIEWER
================================================================

Do NOT redesign the UI.

Verify:

- actual uploaded PDF loads
- page count correct
- first page
- middle page
- last page
- PDF.js worker
- scrolling
- navigation
- question click
- highlight
- zoom 50%
- zoom 100%
- zoom 200%
- resize

Question click MUST do:

Question
→ mapping
→ answer region
→ page
→ scroll
→ highlight.

No hardcoded page number.

================================================================
PHASE 27 — REMOVE TEXTRACT
================================================================

ONLY AFTER PaddleOCR has been independently verified:

remove AWS Textract from ACTIVE runtime.

Remove:

- Textract imports
- Textract clients
- Textract polling
- Textract jobs
- Textract-specific artifacts
- Textract-only configuration
- Textract OCR branches

Do NOT remove S3 if S3 is still used for:

- source PDF storage
- answer PDF storage
- artifact storage
- secure document retrieval

AWS S3 storage may remain.

================================================================
PHASE 28 — ENVIRONMENT
================================================================

Clean .env.example.

Use something conceptually like:

# OCR
OCR_PROVIDER=local
LOCAL_OCR_ENGINE=paddleocr
LOCAL_OCR_PIPELINE=pp_structure_v3
LOCAL_OCR_DEVICE=cpu
LOCAL_OCR_CONCURRENCY=2
LOCAL_OCR_MODEL=...

# VISION
VISION_PROVIDER=...
VISION_MODEL=...
VISION_API_KEY=...
VISION_BASE_URL=...

# STORAGE
AWS_REGION=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=...

Only keep variables actually used.

No fake values.

No obsolete Textract variables after migration.

No secret values in .env.example.

================================================================
PHASE 29 — OCR MODEL LIFECYCLE
================================================================

Model initialization must happen once per worker/process.

BAD:

page 1 → load model → OCR → destroy
page 2 → load model → OCR → destroy

GOOD:

worker starts
→ load PaddleOCR once
→ process pages
→ reuse model.

Implement bounded concurrency.

Do NOT launch 40 independent heavyweight model processes.

Measure memory.

================================================================
PHASE 30 — FAILURE HANDLING
================================================================

If OCR fails:

OCR_FAILED

If page-specific failure:

OCR_PAGE_FAILED

If Vision fails:

VISION_FAILED

If mapping uncertain:

REVIEW_REQUIRED

Never silently substitute:

mock OCR
fake result
cached stale result

No hidden fallback.

================================================================
PHASE 31 — ARTIFACTS
================================================================

For real production jobs store:

01-input-metadata.json
02-page-render-metadata.json
03-local-ocr-raw.json
04-local-ocr-normalized.json
05-vision.json
06-fusion-document.json
07-question-candidates.json
08-question-tree.json
09-answer-regions.json
10-mapping-candidates.json
11-mapping-decisions.json
12-highlight-regions.json

Each artifact must contain:

jobId
pipelineVersion
ocrEngine
ocrVersion
visionModel
timestamp

Never overwrite raw OCR.

================================================================
PHASE 32 — DEBUGGING / OBSERVABILITY
================================================================

Every stage must expose enough information to diagnose failures.

Example OCR log:

{
  jobId,
  stage: "OCR",
  provider: "paddleocr",
  page: 17,
  durationMs,
  blockCount,
  lineCount,
  device
}

Vision:

{
  jobId,
  stage: "VISION",
  page: 17,
  durationMs,
  model,
  imageBytes
}

Mapping:

{
  jobId,
  questionId,
  candidateCount,
  selectedAnswerGroup,
  confidence,
  evidence
}

NEVER log secrets.

================================================================
PHASE 33 — PERFORMANCE
================================================================

The real workload:

Question paper ≈ 8 pages
Answer sheet ≈ 39 pages

Measure:

- cold start
- OCR initialization
- OCR warm time
- per-page OCR
- complete 8-page OCR
- complete 39-page OCR
- Vision processing
- fusion
- mapping
- localization
- total job time
- peak memory

Do NOT guess latency.

================================================================
PHASE 34 — REAL OCR COMPARISON BEFORE CUTOVER
================================================================

IMPORTANT:

Before permanently removing Textract, run:

PaddleOCR
vs
existing Textract results

on the SAME real documents.

Compare:

- question-paper text quality
- question-number recognition
- subpart labels
- MCQ options
- handwriting labels
- line segmentation
- bbox quality
- page identity
- confidence
- answer-region usefulness

This is an internal migration benchmark only.

Do not keep Textract in the final runtime just because it is convenient.

Use it only to compare the old/new extraction during migration.

================================================================
PHASE 35 — MIGRATION CUTOVER
================================================================

Only when:

PaddleOCR produces the required canonical OCR contract
AND
Vision integration works
AND
downstream structure/mapping tests pass

switch:

OCR_PROVIDER=local

Then remove Textract from production execution.

Verify through code search that no runtime path can accidentally call Textract.

================================================================
PHASE 36 — REAL QUESTION PAPER TEST
================================================================

Use the same real question paper.

Verify:

- correct top-level questions
- correct original numbering
- correct subparts
- correct MCQ options
- instructions excluded
- section headers excluded
- page continuation
- source geometry

The parser MUST remain paper-agnostic.

================================================================
PHASE 37 — REAL ANSWER SHEET TEST
================================================================

Use the same real handwritten answer sheet.

Verify:

- question labels
- out-of-order answers
- unlabeled answers
- answer groups
- multi-page continuation
- diagram answers
- rough work
- crossed-out content
- blank regions

================================================================
PHASE 38 — REAL MAPPING ACCURACY TEST
================================================================

For ALL top-level questions:

Generate a table:

Question
Expected status
Actual status
Expected answer group
Actual answer group
Correct?
Confidence
Evidence

Do not only report aggregate:

38/38

Prove each mapping.

If a mapping is wrong, identify the stage:

OCR
Vision
Fusion
Segmentation
Candidate generation
Semantic match
Global assignment
Localization

================================================================
PHASE 39 — REAL HIGHLIGHT TEST
================================================================

For at least 5 known mapped questions:

verify visually in the browser:

Question click
→ correct page
→ correct answer
→ coherent highlight.

The highlight must NOT:

- surround unrelated text
- surround only one OCR word
- cover previous/next answer
- cover whole page
- jump to wrong page

================================================================
PHASE 40 — REAL MULTI-PAGE TEST
================================================================

Find a real multi-page answer if one exists.

If one exists:

verify:

page N
highlight

page N+1
highlight

same AnswerGroup / continuationGroupId.

If the real document contains no genuine multi-page answer:

do not fabricate one for the "real" test.

Use an isolated synthetic fixture ONLY for the continuation algorithm unit/integration test.

Clearly label it synthetic.

================================================================
PHASE 41 — PLAYWRIGHT E2E
================================================================

Playwright is ONLY for verification.

It is not part of production runtime.

Run:

upload real question paper
upload real answer sheet
wait for processing
open results
verify question tree
verify PDF
click question
verify correct page
verify highlight
zoom 50%
zoom 100%
zoom 200%
resize
click another question

Do not mock:

- OCR
- Vision
- storage
- result data
- PDF
- mapping

for the final real-paper E2E.

================================================================
PHASE 42 — TEST REAL ERROR STATES
================================================================

Test where practical:

- invalid local OCR configuration
- OCR process failure
- page OCR failure
- Vision 429
- Vision 5xx
- malformed Vision response
- missing source PDF
- invalid PDF
- PDF rendering failure

Verify stage-specific errors.

================================================================
PHASE 43 — NO PAPER-SPECIFIC HARD-CODING
================================================================

Search:

src/**/*
tests/**/*

for:

specific question numbers
specific question text
specific page numbers
specific answer coordinates
specific answer labels
specific OCR garbage
specific paper title
specific special-case branches

Do not allow special handling for:

21
31
34
35
36
37
38

unless the logic is genuinely generic and data-driven.

The current paper must pass because of a general algorithm.

================================================================
PHASE 44 — TEST SUITE
================================================================

Unit tests:

- OCR normalization
- bbox normalization
- page identity
- reading order
- question parser
- subpart parser
- MCQ parser
- instruction filter
- answer segmentation
- label detection
- continuation
- mapping
- global assignment
- confidence
- highlight regions
- coordinate transforms

Integration:

local OCR
→ Vision
→ fusion
→ structure
→ answer graph
→ mapping

E2E:

real upload
→ real OCR
→ real Vision
→ result
→ PDF
→ click
→ page
→ highlight

================================================================
PHASE 45 — FINAL COMMANDS
================================================================

Run the existing project commands:

npm run lint
npm run typecheck
npm test
npm run build

Then run:

REAL LOCAL OCR TEST
REAL VISION TEST
REAL DOCUMENT PIPELINE
REAL PLAYWRIGHT E2E

Do not stop at unit tests.

================================================================
PHASE 46 — FINAL REPORT
================================================================

Create:

docs/FINAL_LOCAL_OCR_VERIFICATION.md

Include:

# 1. Previous architecture

# 2. Textract dependencies removed

# 3. Selected local OCR engine

# 4. Why this PaddleOCR configuration was selected

# 5. Benchmark results

# 6. Model loading time

# 7. OCR latency

# 8. Memory usage

# 9. OCR quality

# 10. Bounding-box quality

# 11. Vision integration

# 12. Fusion architecture

# 13. Question Tree

# 14. Answer Graph

# 15. Mapping algorithm

# 16. Highlight localization

# 17. PDF.js

# 18. Real-document E2E

# 19. Accuracy metrics

# 20. Known limitations

# 21. Deployment limitations

# 22. Final verdict

================================================================
FINAL ACCEPTANCE GATE
================================================================

DO NOT declare success unless the following are true:

[ ] AWS Textract removed from ACTIVE OCR runtime
[ ] PaddleOCR actually runs locally
[ ] Real question paper processed
[ ] Real handwritten answer sheet processed
[ ] OCR returns real text
[ ] OCR returns real bbox/polygon
[ ] OCR returns confidence
[ ] Page identity preserved
[ ] English question paper OCR verified
[ ] Handwriting labels reasonably detected
[ ] Vision receives actual rendered images
[ ] Vision returns real output
[ ] Fusion works
[ ] Question Tree correct
[ ] Subparts correct
[ ] MCQ options correct
[ ] Answer Graph correct
[ ] Answer segmentation correct
[ ] Multi-page continuation works
[ ] Mapping is evidence-based
[ ] No index-based mapping
[ ] Global conflict resolution works
[ ] Unanswered questions preserved
[ ] Unmatched answers preserved
[ ] Exact answer regions generated
[ ] PDF loads
[ ] Question click navigates
[ ] Correct highlight
[ ] Multi-page highlight
[ ] Zoom alignment
[ ] Resize alignment
[ ] Real Playwright E2E
[ ] No mock production path
[ ] No paper-specific hardcoding
[ ] No secrets exposed
[ ] Lint passes
[ ] Typecheck passes
[ ] Unit tests pass
[ ] Build passes

================================================================
IMPORTANT — DEPLOYMENT REALITY
================================================================

This application must remain an MVP WITHOUT A SEPARATE OCR SERVER.

Therefore you MUST verify whether the selected local PaddleOCR stack can realistically
run inside the current Next.js deployment architecture.

Do NOT merely say:

"PaddleOCR works locally."

That is insufficient.

You must prove:

1. where the model runs
2. how the process is spawned
3. how model files are loaded
4. how memory is managed
5. how the OCR output returns to Next.js
6. how errors propagate
7. how the job waits for completion
8. how multiple pages are processed
9. how multiple jobs are isolated
10. how the chosen deployment environment supports the dependencies.

If the current deployment cannot support the local OCR runtime:

DO NOT fake compatibility.

Report the exact deployment blocker and provide the smallest viable architecture change
needed for the MVP.

================================================================
FINAL PRINCIPLE
================================================================

Do NOT optimize for:

"tests pass"

Optimize for:

REAL QUESTION PAPER
+
REAL HANDWRITTEN ANSWER SHEET
+
FAST LOCAL OCR
+
REAL VISION
+
CORRECT QUESTION TREE
+
CORRECT ANSWER GRAPH
+
CORRECT MAPPING
+
EXACT PDF HIGHLIGHTING

The purpose of removing Textract is:

LOWER OCR COST
+
KEEP GOOD GEOMETRY
+
USE VISION FOR HARD VISUAL/SEMANTIC PROBLEMS
+
KEEP ARCHITECTURE SIMPLE ENOUGH FOR MVP

Start with the audit and benchmark.

DO NOT modify production code before the audit/benchmark is documented.

After benchmark:
implement PaddleOCR.

After implementation:
run real documents.

After real documents:
run browser E2E.

After E2E:
produce the final measured verification report.

NO FAKE.
NO STUB.
NO MOCK IN PRODUCTION.
NO HARDCODED PAPER LOGIC.
NO BLACK BOX CLAIMS.
EVERY STAGE MUST HAVE A CLEAR INPUT, OUTPUT, OWNER, PROVENANCE, AND FAILURE MODE. 

---

## Assistant (Build · Muse Spark 1.2 Free · 10.7s)

_Thinking:_



_Thinking:_



**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "Phase 1: Forensic audit - inspect repo structure, configs, package.json",
      "status": "pending",
      "priority": "high"
    },
    {
      "content": "Trace Textract/OCR/Vision runtime path and contracts",
      "status": "pending",
      "priority": "high"
    },
    {
      "content": "Document all contracts and create docs/LOCAL_OCR_MIGRATION_AUDIT.md",
      "status": "pending",
      "priority": "high"
    },
    {
      "content": "Phase 2-6: Benchmark candidate selection and measurements",
      "status": "pending",
      "priority": "medium"
    },
    {
      "content": "Phase 7-11: Implement local OCR provider + normalization + coordinates",
      "status": "pending",
      "priority": "medium"
    },
    {
      "content": "Phase 12-26: Fusion, structure, mapping, highlighting verification",
      "status": "pending",
      "priority": "medium"
    },
    {
      "content": "Phase 27-46: Cutover, tests, E2E, final verification report",
      "status": "pending",
      "priority": "medium"
    }
  ]
}
```

**Output:**
```
[
  {
    "content": "Phase 1: Forensic audit - inspect repo structure, configs, package.json",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Trace Textract/OCR/Vision runtime path and contracts",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Document all contracts and create docs/LOCAL_OCR_MIGRATION_AUDIT.md",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Phase 2-6: Benchmark candidate selection and measurements",
    "status": "pending",
    "priority": "medium"
  },
  {
    "content": "Phase 7-11: Implement local OCR provider + normalization + coordinates",
    "status": "pending",
    "priority": "medium"
  },
  {
    "content": "Phase 12-26: Fusion, structure, mapping, highlighting verification",
    "status": "pending",
    "priority": "medium"
  },
  {
    "content": "Phase 27-46: Cutover, tests, E2E, final verification report",
    "status": "pending",
    "priority": "medium"
  }
]
```

---

## Assistant (Build · Muse Spark 1.2 Free · 2.8s)

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "Phase 1: Forensic audit - inspect repo structure, configs, package.json",
      "status": "in_progress",
      "priority": "high"
    },
    {
      "content": "Trace Textract/OCR/Vision runtime path and contracts",
      "status": "pending",
      "priority": "high"
    },
    {
      "content": "Document all contracts and create docs/LOCAL_OCR_MIGRATION_AUDIT.md",
      "status": "pending",
      "priority": "high"
    },
    {
      "content": "Phase 2-6: Benchmark candidate selection and measurements",
      "status": "pending",
      "priority": "medium"
    },
    {
      "content": "Phase 7-11: Implement local OCR provider + normalization + coordinates",
      "status": "pending",
      "priority": "medium"
    },
    {
      "content": "Phase 12-26: Fusion, structure, mapping, highlighting verification",
      "status": "pending",
      "priority": "medium"
    },
    {
      "content": "Phase 27-46: Cutover, tests, E2E, final verification report",
      "status": "pending",
      "priority": "medium"
    }
  ]
}
```

**Output:**
```
[
  {
    "content": "Phase 1: Forensic audit - inspect repo structure, configs, package.json",
    "status": "in_progress",
    "priority": "high"
  },
  {
    "content": "Trace Textract/OCR/Vision runtime path and contracts",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Document all contracts and create docs/LOCAL_OCR_MIGRATION_AUDIT.md",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Phase 2-6: Benchmark candidate selection and measurements",
    "status": "pending",
    "priority": "medium"
  },
  {
    "content": "Phase 7-11: Implement local OCR provider + normalization + coordinates",
    "status": "pending",
    "priority": "medium"
  },
  {
    "content": "Phase 12-26: Fusion, structure, mapping, highlighting verification",
    "status": "pending",
    "priority": "medium"
  },
  {
    "content": "Phase 27-46: Cutover, tests, E2E, final verification report",
    "status": "pending",
    "priority": "medium"
  }
]
```

---

## Assistant (Build · Muse Spark 1.2 Free · 2.6s)

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\package.json"
}
```

**Output:**
```
<path>E:\vedaAi\package.json</path>
<type>file</type>
<content>
1: {
2:   "name": "veda-ai",
3:   "version": "0.2.0",
4:   "private": true,
5:   "scripts": {
6:     "dev": "next dev",
7:     "build": "next build",
8:     "start": "next start",
9:     "lint": "eslint",
10:     "typecheck": "tsc --noEmit",
11:     "test": "vitest run",
12:     "test:e2e": "playwright test",
13:     "ai:smoke-test": "tsx scripts/ai-smoke.ts",
14:     "assessment:smoke-test": "tsx scripts/assessment-smoke.ts",
15:     "audit": "tsx scripts/audit.ts",
16:     "evaluate": "tsx scripts/evaluate.ts",
17:     "test:aws": "tsx scripts/aws-smoke.ts"
18:   },
19:   "dependencies": {
20:     "@aws-sdk/client-s3": "^3.800.0",
21:     "@aws-sdk/client-textract": "^3.800.0",
22:     "@supabase/ssr": "^0.12.5",
23:     "@supabase/supabase-js": "^2.112.4",
24:     "canvas": "^3.2.3",
25:     "file-type": "^22.0.2",
26:     "mupdf": "^1.28.0",
27:     "next": "16.3.3",
28:     "openai": "^7.5.0",
29:     "pdf-lib": "^1.17.1",
30:     "pdfjs-dist": "^6.2.108",
31:     "react": "19.2.8",
32:     "react-dom": "19.2.8",
33:     "uuid": "^14.0.2",
34:     "zod": "^4.4.3"
35:   },
36:   "devDependencies": {
37:     "@playwright/test": "^1.62.1",
38:     "@tailwindcss/postcss": "^4",
39:     "@types/node": "^20",
40:     "@types/react": "^19",
41:     "@types/react-dom": "^19",
42:     "@types/uuid": "^10.0.0",
43:     "eslint": "^9",
44:     "eslint-config-next": "16.3.3",
45:     "tailwindcss": "^4",
46:     "tsx": "^4.21.0",
47:     "typescript": "^5",
48:     "vitest": "^4.1.11"
49:   },
50:   "vitest": {
51:     "config": "vitest.config.ts"
52:   }
53: }

(End of file - total 53 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\tsconfig.json"
}
```

**Output:**
```
<path>E:\vedaAi\tsconfig.json</path>
<type>file</type>
<content>
1: {
2:   "compilerOptions": {
3:     "target": "ES2017",
4:     "lib": ["dom", "dom.iterable", "esnext"],
5:     "allowJs": true,
6:     "skipLibCheck": true,
7:     "strict": true,
8:     "noEmit": true,
9:     "esModuleInterop": true,
10:     "module": "esnext",
11:     "moduleResolution": "bundler",
12:     "resolveJsonModule": true,
13:     "isolatedModules": true,
14:     "jsx": "react-jsx",
15:     "incremental": true,
16:     "plugins": [
17:       {
18:         "name": "next"
19:       }
20:     ],
21:     "paths": {
22:       "@/*": ["./src/*"]
23:     }
24:   },
25:   "include": [
26:     "next-env.d.ts",
27:     "**/*.ts",
28:     "**/*.tsx",
29:     ".next/types/**/*.ts",
30:     ".next/dev/types/**/*.ts",
31:     "**/*.mts"
32:   ],
33:   "exclude": ["node_modules"]
34: }

(End of file - total 34 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\next.config.js"
}
```

**Error:**
```
File not found: E:\vedaAi\next.config.js
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\.env.example"
}
```

**Output:**
```
<path>E:\vedaAi\.env.example</path>
<type>file</type>
<content>
1: # LLM — OpenRouter (single canonical provider)
2: # Obtain key: https://openrouter.ai/keys
3: OPENROUTER_API_KEY=
4: OPENROUTER_MODEL=qwen/qwen3-vl-32b-instruct
5: OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
6: AI_PROVIDER=openrouter
7: 
8: # OCR — Amazon Textract (async PDF) — REAL infrastructure, no mock fallback in prod
9: # Primary OCR provider. Use "textract" for production, "mock" ONLY for tests (vitest).
10: OCR_PROVIDER=textract
11: AWS_REGION=ap-south-1
12: AWS_ACCESS_KEY_ID=
13: AWS_SECRET_ACCESS_KEY=
14: AWS_S3_BUCKET=veda-ai-documents
15: # Optional: separate bucket for Textract output artifacts (defaults to AWS_S3_BUCKET)
16: AWS_TEXTRACT_OUTPUT_BUCKET=
17: AWS_S3_INPUT_PREFIX=ocr-input
18: AWS_S3_OUTPUT_PREFIX=ocr-output
19: # Optional async orchestration via SNS/SQS (if not set, polling is used)
20: AWS_SNS_TOPIC_ARN=
21: AWS_SNS_ROLE_ARN=
22: AWS_SQS_QUEUE_URL=
23: OCR_OPERATION_TIMEOUT_MS=300000
24: OCR_POLL_INTERVAL_MS=5000
25: OCR_MAX_RETRIES=3
26: 
27: # Vision — parallel to Textract (evidence-only, grounded to Textract geometry)
28: # Uses OPENROUTER_API_KEY by fallback; no separate VISION_API_KEY needed
29: VISION_PROVIDER=auto
30: VISION_MAX_PAGES=3
31: VISION_TIMEOUT_MS=30000
32: 
33: # Mapping thresholds (single source; empirical calibration needed)
34: MAPPING_HIGH_THRESHOLD=0.75
35: MAPPING_REVIEW_THRESHOLD=0.50
36: 
37: # Limits
38: MAX_FILE_SIZE_MB=100
39: MAX_PAGES=50
40: MAX_CONCURRENT_AI=2
41: 
42: # Supabase Auth & Storage
43: NEXT_PUBLIC_SUPABASE_URL=
44: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
45: # Server-only (never NEXT_PUBLIC)
46: SUPABASE_SERVICE_ROLE_KEY=
47: 
48: # Guest
49: GUEST_RESULT_GRACE_PERIOD_MS=90000
50: 
51: # Application URLs
52: NEXT_PUBLIC_APP_URL=http://localhost:3000

(End of file - total 52 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\src\\types\\index.ts"
}
```

**Output:**
```
<path>E:\vedaAi\src\types\index.ts</path>
<type>file</type>
<content>
1: export type DocumentKind = "questionPaper" | "answerSheet";
2: export type ProcessingStage =
3:   | "CREATED"
4:   | "UPLOADING"
5:   | "UPLOADED"
6:   | "VALIDATING"
7:   | "PREPROCESSING"
8:   | "OCR_SUBMITTED"
9:   | "OCR_PROCESSING"
10:   | "OCR_COMPLETED"
11:   | "OCR_FAILED"
12:   | "VISION"
13:   | "FUSION"
14:   | "EXTRACTING"
15:   | "STRUCTURING"
16:   | "MATCHING"
17:   | "LOCALIZING"
18:   | "VALIDATING_RESULT"
19:   | "COMPLETED"
20:   | "FAILED"
21:   | "CANCELLED";
22: 
23: export type DecisionStatus =
24:   | "MATCHED"
25:   | "UNCERTAIN"
26:   | "UNMATCHED"
27:   | "UNANSWERED"
28:   | "PARTIAL"
29:   | "CONTINUATION"
30:   | "DUPLICATE"
31:   | "INVALID";
32: 
33: export type EvidenceType =
34:   | "EXPLICIT_QUESTION_LABEL"
35:   | "SEMANTIC_SIMILARITY"
36:   | "LAYOUT_CONTINUITY"
37:   | "PAGE_CONTINUITY"
38:   | "SECTION_MATCH"
39:   | "SUBQUESTION_MATCH"
40:   | "NEIGHBOR_CONTEXT"
41:   | "OCR_CONFIDENCE"
42:   | "VISUAL_EVIDENCE"
43:   | "QUESTION_ORDER";
44: 
45: export interface NormalizedBox {
46:   x: number; // 0..1
47:   y: number;
48:   width: number;
49:   height: number;
50: }
51: 
52: export interface DocumentPage {
53:   id: string;
54:   documentId: string;
55:   pageNumber: number; // 1-indexed
56:   width: number;
57:   height: number;
58:   rotation: number; // 0/90/180/270
59:   artifactId?: string;
60: }
61: 
62: export type DocumentRole = "QUESTION_PAPER" | "ANSWER_SHEET" | "MARKING_SCHEME" | "SOLUTION" | "UNKNOWN";
63: 
64: export interface Document {
65:   id: string;
66:   jobId: string;
67:   kind: DocumentKind;
68:   detectedRole?: DocumentRole;
69:   originalName: string;
70:   mime: string;
71:   size: number;
72:   pageCount: number;
73:   pageIds: string[];
74:   createdAt: string;
75: }
76: 
77: export interface PageArtifact {
78:   id: string;
79:   pageId: string;
80:   originalDimensions: { width: number; height: number };
81:   processingDimensions: { width: number; height: number };
82:   displayDimensions?: { width: number; height: number };
83:   rotation: number;
84:   imageBufferId?: string;
85: }
86: 
87: export interface QuestionOption {
88:   label: string; // A, B, C, D
89:   text: string;
90:   rawText: string;
91:   bbox?: NormalizedBox;
92: }
93: 
94: export type QuestionKind = "TOP_LEVEL_QUESTION" | "SUBQUESTION" | "OPTION" | "INSTRUCTION" | "SECTION" | "HEADER" | "FOOTER" | "FIGURE" | "TABLE" | "MARKS";
95: 
96: export interface QuestionNode {
97:   id: string;
98:   sourceDocumentId: string;
99:   pageRefs: string[]; // pageIds
100:   sourceRegions: NormalizedBox[];
101:   rawNumber: string;
102:   normalizedNumber: string;
103:   displayNumber: string;
104:   text: string;
105:   rawText: string;
106:   normalizedText: string;
107:   parentQuestionId?: string;
108:   partType?: "SECTION" | "QUESTION" | "PART" | "SUBPART" | "OPTION" | "INSTRUCTION" | "HEADER" | "FOOTER";
109:   kind?: QuestionKind;
110:   orderIndex: number;
111:   depth: number;
112:   section?: string;
113:   marks?: number;
114:   confidence: number;
115:   evidence: Evidence[];
116:   options?: QuestionOption[];
117:   children?: string[]; // child question ids (populated after tree build)
118:   // provenance
119:   sourcePageNumbers?: number[];
120: }
121: 
122: export interface AnswerRegion {
123:   id: string;
124:   documentId: string;
125:   pageId: string;
126:   regionType: "HANDWRITING" | "DIAGRAM" | "MIXED" | "CROSSED_OUT";
127:   rawText: string;
128:   normalizedText: string;
129:   interpretedText?: string;
130:   sourceBoxes: NormalizedBox[];
131:   normalizedBoxes: NormalizedBox[];
132:   polygon?: number[][];
133:   questionLabel?: string;
134:   labelConfidence?: number;
135:   ocrConfidence?: number;
136:   visualConfidence?: number;
137:   orderIndex: number;
138:   continuationGroupId?: string;
139:   parentRegionId?: string;
140: }
141: 
142: export interface AnswerGroup {
143:   id: string;
144:   documentId: string;
145:   regions: AnswerRegion[];
146:   primaryRegionId: string;
147:   continuationGroupId?: string;
148:   normalizedText: string;
149:   mappedQuestionId?: string;
150: }
151: 
152: export interface Evidence {
153:   type: EvidenceType;
154:   source: string;
155:   score: number; // 0..1
156:   explanation: string;
157:   reliability: number; // 0..1 weight
158:   metadata?: Record<string, unknown>;
159: }
160: 
161: export interface MappingCandidate {
162:   questionId: string;
163:   answerGroupId: string;
164:   evidence: Evidence[];
165:   score: number;
166: }
167: 
168: export interface MappingDecision {
169:   id: string;
170:   questionId: string;
171:   answerGroupId?: string;
172:   answerIds: string[];
173:   primaryAnswerId?: string;
174:   status: DecisionStatus;
175:   confidence?: number;
176:   mappingConfidence?: number;
177:   evidence: Evidence[];
178:   reason?: string;
179:   highlightRegions: HighlightRegion[];
180: }
181: 
182: export interface HighlightRegion {
183:   pageId: string;
184:   boxes: NormalizedBox[];
185:   polygon?: number[][];
186:   confidence: number;
187:   source: string;
188: }
189: 
190: export interface ProcessingError {
191:   code: string;
192:   message: string;
193:   stage: ProcessingStage;
194:   details?: unknown;
195:   timestamp: string;
196: }
197: 
198: export interface ProcessingJob {
199:   id: string;
200:   createdAt: string;
201:   updatedAt: string;
202:   status: ProcessingStage;
203:   currentStage: ProcessingStage;
204:   questionPaperFileId?: string;
205:   answerSheetFileId?: string;
206:   questionPaperDocId?: string;
207:   answerSheetDocId?: string;
208:   // SaaS ownership
209:   guestSessionId?: string | null;
210:   userId?: string | null;
211:   claimedAt?: string | null;
212:   progress: {
213:     stageStates: Record<ProcessingStage, "pending" | "in_progress" | "completed" | "failed" | "skipped">;
214:     currentStageProgress?: number;
215:   };
216:   error?: ProcessingError;
217:   pipelineVersion: string;
218:   modelVersion?: string;
219:   promptVersion?: string;
220:   // OCR metadata (Amazon Textract async)
221:   ocrOperationId?: string;
222:   ocrOutputUri?: string;
223:   ocrInputUri?: string;
224:   ocrAttempt?: number;
225:   ocrStartedAt?: string;
226:   ocrCompletedAt?: string;
227:   ocrErrorCode?: string;
228:   ocrPageCount?: number;
229: }
230: 
231: export interface QuestionResult {
232:   question: QuestionNode;
233:   status: DecisionStatus;
234:   answerIds: string[];
235:   primaryAnswerId?: string;
236:   mappingConfidence?: number;
237:   highlightRegions: HighlightRegion[];
238:   evidence: Evidence[];
239: }
240: 
241: export interface AnswerResult {
242:   id: string;
243:   status: DecisionStatus;
244:   text: string;
245:   regions: AnswerRegion[];
246:   mappedQuestionId?: string;
247:   confidence?: number;
248:   evidence?: Evidence[];
249: }
250: 
251: export interface ProcessingResult {
252:   jobId: string;
253:   questions: QuestionNode[];
254:   answers: AnswerGroup[];
255:   decisions: MappingDecision[];
256:   questionResults: QuestionResult[];
257:   answerResults: AnswerResult[];
258:   unmatchedAnswers: AnswerGroup[];
259:   unansweredQuestions: QuestionNode[];
260: }

(End of file - total 260 lines)
</content>
```

---

## Assistant (Build · Muse Spark 1.2 Free · 10.3s)

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi"
}
```

**Output:**
```
<path>E:\vedaAi</path>
<type>directory</type>
<entries>
.env
.env.example
.git/
.gitignore
.next/
AGENTS.md
artifacts/
CLAUDE.md
docs/
eslint.config.mjs
fixtures/
next-env.d.ts
next.config.ts
node_modules/
opencode.json
package-lock.json
package.json
playwright.config.ts
postcss.config.mjs
public/
README.md
scripts/
session-ses_fbb0.md
session1.md
src/
test-results/
tests/
TODO.md
tsconfig.json
tsconfig.tsbuildinfo
vitest.config.ts

(31 entries)
</entries>
```

**Tool: glob**

**Input:**
```json
{
  "pattern": "next.config.*"
}
```

**Output:**
```
E:\vedaAi\next.config.ts
```

**Tool: glob**

**Input:**
```json
{
  "pattern": "src/**/*"
}
```

**Output:**
```
E:\vedaAi\src\types\index.ts
E:\vedaAi\src\proxy.ts
E:\vedaAi\src\lib\vision\router.ts
E:\vedaAi\src\lib\vision\provider.ts
E:\vedaAi\src\lib\vision\openrouter-vision.ts
E:\vedaAi\src\lib\vision\opencode-vision.ts
E:\vedaAi\src\lib\vision\mock.ts
E:\vedaAi\src\lib\vision\fusion.ts
E:\vedaAi\src\lib\vision\factory.ts
E:\vedaAi\src\lib\vision\canonical.ts
E:\vedaAi\src\app\results\[jobId]\page.tsx
E:\vedaAi\src\app\processing\[jobId]\page.tsx
E:\vedaAi\src\app\page.tsx
E:\vedaAi\src\lib\errors\codes.ts
E:\vedaAi\src\app\messages\route.ts
E:\vedaAi\src\app\layout.tsx
E:\vedaAi\src\app\icon.png
E:\vedaAi\src\app\globals.css
E:\vedaAi\src\lib\decision\index.ts
E:\vedaAi\src\lib\documents\classifier.ts
E:\vedaAi\src\lib\documents\pdf.ts
E:\vedaAi\src\lib\documents\render.ts
E:\vedaAi\src\lib\design\tokens.ts
E:\vedaAi\src\lib\structure\validator.ts
E:\vedaAi\src\lib\structure\question-parser.ts
E:\vedaAi\src\lib\structure\numbering.ts
E:\vedaAi\src\lib\structure\answer-segmentation.ts
E:\vedaAi\src\lib\ocr\types.ts
E:\vedaAi\src\lib\ocr\textract.ts
E:\vedaAi\src\lib\ocr\s3.ts
E:\vedaAi\src\lib\ocr\provider.ts
E:\vedaAi\src\lib\ocr\mock.ts
E:\vedaAi\src\lib\ocr\index.ts
E:\vedaAi\src\lib\ocr\factory.ts
E:\vedaAi\src\lib\ocr\errors.ts
E:\vedaAi\src\lib\supabase\storage.ts
E:\vedaAi\src\lib\supabase\server.ts
E:\vedaAi\src\lib\supabase\middleware.ts
E:\vedaAi\src\lib\supabase\client.ts
E:\vedaAi\src\components\viewer\Viewer.tsx
E:\vedaAi\src\components\viewer\PdfViewer.tsx
E:\vedaAi\src\components\viewer\AnswerSheetViewer.tsx
E:\vedaAi\src\lib\storage\index.ts
E:\vedaAi\src\components\upload\UploadDropzone.tsx
E:\vedaAi\src\components\upload\UploadCard.tsx
E:\vedaAi\src\lib\coordinates\transform.ts
E:\vedaAi\src\lib\config\index.ts
E:\vedaAi\src\app\auth\login\page.tsx
E:\vedaAi\src\lib\jobs\runner.ts
E:\vedaAi\src\app\auth\auth-code-error\page.tsx
E:\vedaAi\src\components\ui\Card.tsx
E:\vedaAi\src\components\ui\Button.tsx
E:\vedaAi\src\lib\ai\index.ts
E:\vedaAi\src\lib\ai\factory.ts
E:\vedaAi\src\app\dashboard\page.tsx
E:\vedaAi\src\components\extracting\ExtractingScreen.tsx
E:\vedaAi\src\components\results\MappingQuestionCard.tsx
E:\vedaAi\src\components\results\QuestionCard.tsx
E:\vedaAi\src\lib\auth\guest.ts
E:\vedaAi\src\app\api\jobs\route.ts
E:\vedaAi\src\app\auth\callback\route.ts
E:\vedaAi\src\components\auth\AuthGate.tsx
E:\vedaAi\src\lib\ai\prompts\question-extraction.v1.ts
E:\vedaAi\src\lib\ai\prompts\mapping.v1.ts
E:\vedaAi\src\lib\ai\prompts\answer-extraction.v1.ts
E:\vedaAi\src\components\layout\TopHeader.tsx
E:\vedaAi\src\components\layout\Sidebar.tsx
E:\vedaAi\src\lib\evidence\aggregate.ts
E:\vedaAi\src\app\api\jobs\[jobId]\route.ts
E:\vedaAi\src\lib\files\validation.ts
E:\vedaAi\src\lib\ai\providers\mock.ts
E:\vedaAi\src\lib\ai\providers\openrouter.ts
E:\vedaAi\src\lib\ai\providers\opencode-zen.ts
E:\vedaAi\src\lib\ai\providers\openai.ts
E:\vedaAi\src\app\api\jobs\[jobId]\upload\route.ts
E:\vedaAi\src\app\api\jobs\[jobId]\result\route.ts
E:\vedaAi\src\app\debug\[jobId]\page.tsx
E:\vedaAi\src\app\api\jobs\[jobId]\debug\route.ts
E:\vedaAi\src\app\api\jobs\[jobId]\claim\route.ts
E:\vedaAi\src\app\api\jobs\[jobId]\start\route.ts
E:\vedaAi\src\app\api\assessments\[id]\claim\route.ts
E:\vedaAi\src\app\api\files\[jobId]\[fileId]\route.ts
```

---

## Assistant (Build · Muse Spark 1.2 Free · 9.9s)

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\next.config.ts"
}
```

**Output:**
```
<path>E:\vedaAi\next.config.ts</path>
<type>file</type>
<content>
1: import type { NextConfig } from "next";
2: 
3: const nextConfig: NextConfig = {
4:   experimental: {
5:     serverActions: {
6:       bodySizeLimit: "100mb",
7:     },
8:     proxyClientMaxBodySize: 100 * 1024 * 1024,
9:   },
10:   // Optional canvas for PDF page rendering (Vision) — not required, fallback to PDF base64
11:   serverExternalPackages: ["canvas"],
12:   turbopack: {},
13:   // Route handlers (upload) need increased body size too; serverActions limit only covers actions
14:   // For App Router route handlers the limit is configured via `api` bodyParser in pages router, but for app router
15:   // we rely on Next's default which is 4MB on Vercel — locally we handle via streaming formData.
16:   // This config documents the intent; actual upload validation is MAX_FILE_SIZE_MB in src/lib/config.
17: };
18: 
19: export default nextConfig;

(End of file - total 19 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\src\\lib\\config\\index.ts"
}
```

**Output:**
```
<path>E:\vedaAi\src\lib\config\index.ts</path>
<type>file</type>
<content>
1: import { z } from "zod";
2: 
3: const OPENROUTER_DEFAULT_MODEL = "qwen/qwen3-vl-32b-instruct";
4: const OPENROUTER_DEFAULT_BASE = "https://openrouter.ai/api/v1";
5: 
6: const envSchema = z.object({
7:   // Canonical LLM provider — OpenRouter + Qwen3-VL (legacy opencode-zen/openai accepted & migrated)
8:   AI_PROVIDER: z
9:     .string()
10:     .default("openrouter")
11:     .transform((v) => {
12:       const s = v.trim().toLowerCase();
13:       if (s === "opencode-zen" || s === "openai" || s === "openai-compatible") return "openrouter";
14:       return s;
15:     })
16:     .pipe(z.enum(["openrouter", "mock"])),
17:   AI_MODEL: z.string().default(OPENROUTER_DEFAULT_MODEL),
18:   AI_API_KEY: z.string().optional(), // deprecated alias for OPENROUTER_API_KEY
19:   AI_BASE_URL: z.string().optional().default(OPENROUTER_DEFAULT_BASE).transform((v) => {
20:     if (!v) return OPENROUTER_DEFAULT_BASE;
21:     // Migrate legacy opencode URL
22:     if (v.includes("opencode.ai")) return OPENROUTER_DEFAULT_BASE;
23:     return v;
24:   }).pipe(z.string().url().or(z.literal("")).transform((v) => v || OPENROUTER_DEFAULT_BASE)),
25:   OPENROUTER_API_KEY: z.string().optional(),
26:   OPENROUTER_MODEL: z.string().default(OPENROUTER_DEFAULT_MODEL),
27:   OPENROUTER_BASE_URL: z.string().optional().default(OPENROUTER_DEFAULT_BASE).transform((v) => {
28:     if (!v) return OPENROUTER_DEFAULT_BASE;
29:     if (v.includes("opencode.ai")) return OPENROUTER_DEFAULT_BASE;
30:     return v;
31:   }).pipe(z.string().url().or(z.literal("")).transform((v) => v || OPENROUTER_DEFAULT_BASE)),
32:   // mapping thresholds single source
33:   MAPPING_HIGH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),
34:   MAPPING_REVIEW_THRESHOLD: z.coerce.number().min(0).max(1).default(0.5),
35:   MAX_FILE_SIZE_MB: z.coerce.number().default(100),
36:   MAX_PAGES: z.coerce.number().default(50),
37:   MAX_CONCURRENT_AI: z.coerce.number().default(2),
38:   // AI timeouts (ms) — fail fast instead of hanging
39:   EXTRACT_TIMEOUT_MS: z.coerce.number().default(60000),
40:   DETECT_TIMEOUT_MS: z.coerce.number().default(60000),
41:   MAPPING_TIMEOUT_MS: z.coerce.number().default(30000),
42:   // OCR — Amazon Textract (async PDF)
43:   OCR_PROVIDER: z.enum(["textract", "mock"]).default("textract"),
44:   AWS_REGION: z.string().default("us-east-1"),
45:   AWS_ACCESS_KEY_ID: z.string().optional(),
46:   AWS_SECRET_ACCESS_KEY: z.string().optional(),
47:   AWS_S3_BUCKET: z.string().optional(),
48:   AWS_TEXTRACT_OUTPUT_BUCKET: z.string().optional(),
49:   AWS_S3_INPUT_PREFIX: z.string().default("ocr-input"),
50:   AWS_S3_OUTPUT_PREFIX: z.string().default("ocr-output"),
51:   AWS_SNS_TOPIC_ARN: z.string().optional(),
52:   AWS_SNS_ROLE_ARN: z.string().optional(),
53:   AWS_SQS_QUEUE_URL: z.string().optional(),
54:   OCR_OPERATION_TIMEOUT_MS: z.coerce.number().default(300000),
55:   OCR_POLL_INTERVAL_MS: z.coerce.number().default(5000),
56:   OCR_MAX_RETRIES: z.coerce.number().default(3),
57:   // Vision — parallel to Textract (evidence-only, grounded to Textract geometry)
58:   VISION_PROVIDER: z
59:     .string()
60:     .default("auto")
61:     .transform((v) => {
62:       const s = v.trim().toLowerCase();
63:       if (s === "opencode-zen") return "openrouter";
64:       return s;
65:     })
66:     .pipe(z.enum(["openrouter", "mock", "auto", "disabled"])),
67:   VISION_MODEL: z.string().default(OPENROUTER_DEFAULT_MODEL),
68:   VISION_API_KEY: z.string().optional(),
69:   VISION_BASE_URL: z.string().optional().default(OPENROUTER_DEFAULT_BASE).transform((v) => {
70:     if (!v) return OPENROUTER_DEFAULT_BASE;
71:     if (v.includes("opencode.ai")) return OPENROUTER_DEFAULT_BASE;
72:     return v;
73:   }).pipe(z.string().url().or(z.literal("")).transform((v) => v || OPENROUTER_DEFAULT_BASE)),
74:   VISION_ENABLED: z.coerce.boolean().default(true),
75:   VISION_MAX_PAGES: z.coerce.number().int().min(1).max(20).default(1),
76:   VISION_TIMEOUT_MS: z.coerce.number().default(90000),
77:   // Supabase — supports both new publishable (sb_publishable_...) and legacy anon (eyJ...) keys
78:   NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional().or(z.literal("")),
79:   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
80:   NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
81:   SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
82:   GUEST_RESULT_GRACE_PERIOD_MS: z.coerce.number().default(90000),
83:   NEXT_PUBLIC_APP_URL: z.string().url().optional().or(z.literal("")),
84: });
85: 
86: export type AppConfig = z.infer<typeof envSchema> & {
87:   pipelineVersion: string;
88: };
89: 
90: let cached: AppConfig | null = null;
91: 
92: export function getConfig(): AppConfig {
93:   if (cached) return cached;
94:   const parsed = envSchema.safeParse(process.env);
95:   if (!parsed.success) {
96:     console.error("Config validation failed", parsed.error.flatten());
97:     const fallback = envSchema.parse({});
98:     cached = {
99:       ...fallback,
100:       pipelineVersion: process.env.npm_package_version || "0.1.0",
101:     };
102:     if (fallback.AI_PROVIDER !== "mock" && !fallback.OPENROUTER_API_KEY && !fallback.AI_API_KEY) {
103:       console.warn("[config] OPENROUTER_API_KEY missing but AI_PROVIDER != mock — will fail at runtime with CONFIGURATION_ERROR");
104:     }
105:     return cached;
106:   }
107:   cached = {
108:     ...parsed.data,
109:     pipelineVersion: process.env.npm_package_version || "0.1.0",
110:   };
111:   return cached;
112: }
113: 
114: export function clearConfigCache() {
115:   cached = null;
116: }
117: 
118: export function requireAiConfig(): AppConfig {
119:   const cfg = getConfig();
120:   const hasKey = Boolean((cfg as any).OPENROUTER_API_KEY || (cfg as any).AI_API_KEY);
121:   if (cfg.AI_PROVIDER !== "mock" && !hasKey) {
122:     throw new Error(
123:       `CONFIGURATION_ERROR: AI_PROVIDER=${cfg.AI_PROVIDER} requires OPENROUTER_API_KEY. Set OPENROUTER_API_KEY or use AI_PROVIDER=mock for tests.`
124:     );
125:   }
126:   return cfg;
127: }
128: 
129: export function isSupabaseConfigured(): boolean {
130:   const cfg = getConfig() as any;
131:   return Boolean(cfg.NEXT_PUBLIC_SUPABASE_URL && (cfg.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || cfg.NEXT_PUBLIC_SUPABASE_ANON_KEY));
132: }
133: 
134: export function getSupabasePublishableKey(): string | null {
135:   const cfg = getConfig() as any;
136:   return cfg.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || cfg.NEXT_PUBLIC_SUPABASE_ANON_KEY || null;
137: }
138: 
139: export function isAwsOcrConfigured(): boolean {
140:   const cfg = getConfig() as any;
141:   return Boolean(cfg.AWS_S3_BUCKET && cfg.AWS_REGION);
142: }
143: 
144: export function requireAwsOcrConfig(): void {
145:   const cfg = getConfig() as any;
146:   if (cfg.OCR_PROVIDER === "mock") return;
147:   const missing: string[] = [];
148:   if (!cfg.AWS_REGION) missing.push("AWS_REGION");
149:   if (!cfg.AWS_S3_BUCKET) missing.push("AWS_S3_BUCKET");
150:   if (missing.length > 0) {
151:     throw new Error(`OCR_CONFIGURATION_ERROR: Missing ${missing.join(", ")}. Set env or use OCR_PROVIDER=mock for tests.`);
152:   }
153: }
154: 
155: export function isGoogleOcrConfigured(): boolean {
156:   return isAwsOcrConfigured();
157: }
158: export function requireGoogleOcrConfig(): void {
159:   return requireAwsOcrConfig();
160: }
161: 
162: export const mappingThresholds = {
163:   get high() {
164:     return getConfig().MAPPING_HIGH_THRESHOLD;
165:   },
166:   get review() {
167:     return getConfig().MAPPING_REVIEW_THRESHOLD;
168:   },
169: };
170: 
171: export const guestGraceMs = {
172:   get value() {
173:     return getConfig().GUEST_RESULT_GRACE_PERIOD_MS;
174:   },
175: };
176: 
177: export const OPENROUTER_CANONICAL = {
178:   model: OPENROUTER_DEFAULT_MODEL,
179:   baseUrl: OPENROUTER_DEFAULT_BASE,
180:   endpoint: `${OPENROUTER_DEFAULT_BASE}/chat/completions`,
181: } as const;

(End of file - total 181 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\src\\lib\\ocr\\provider.ts"
}
```

**Output:**
```
<path>E:\vedaAi\src\lib\ocr\provider.ts</path>
<type>file</type>
<content>
1: export type { OcrProvider, SubmitOcrRequest, OcrOperationStatus, OcrDocumentResult } from "./types";
2: export { OcrError, OcrErrorCodes, toOcrError } from "./errors";

(End of file - total 2 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\src\\lib\\ocr\\types.ts"
}
```

**Output:**
```
<path>E:\vedaAi\src\lib\ocr\types.ts</path>
<type>file</type>
<content>
1: export interface OcrLine {
2:   text: string;
3:   boundingBox: NormalizedBox;
4:   confidence: number;
5:   pageNumber: number;
6: }
7: 
8: export interface OcrPageResult {
9:   pageNumber: number;
10:   text: string;
11:   blocks: OcrBlock[];
12:   lines: OcrLine[];
13:   confidence: number;
14:   width: number;
15:   height: number;
16:   rotation: number;
17: }
18: 
19: export interface OcrBlock {
20:   boundingBox: NormalizedBox;
21:   paragraphs: OcrParagraph[];
22:   confidence: number;
23: }
24: 
25: export interface OcrParagraph {
26:   boundingBox: NormalizedBox;
27:   words: OcrWord[];
28:   confidence: number;
29: }
30: 
31: export interface OcrWord {
32:   boundingBox: NormalizedBox;
33:   symbols: OcrSymbol[];
34:   confidence: number;
35:   text: string;
36: }
37: 
38: export interface OcrSymbol {
39:   boundingBox: NormalizedBox;
40:   text: string;
41:   confidence: number;
42:   property?: {
43:     detectedBreak?: {
44:       type: "SPACE" | "SURE_SPACE" | "EOL_SURE_SPACE" | "HYPHEN" | "LINE_BREAK";
45:       isPrefix: boolean;
46:     };
47:   };
48: }
49: 
50: export interface NormalizedBox {
51:   x: number;
52:   y: number;
53:   width: number;
54:   height: number;
55: }
56: 
57: export interface OcrDocumentResult {
58:   jobId: string;
59:   documentId: string;
60:   kind: "questionPaper" | "answerSheet";
61:   pages: OcrPageResult[];
62:   provider: "amazon-textract";
63:   providerVersion: string;
64:   operationId: string;
65:   completedAt: string;
66: }
67: 
68: export interface OcrOperationStatus {
69:   operationId: string;
70:   status: "PENDING" | "RUNNING" | "DONE" | "FAILED" | "CANCELLED";
71:   progress?: number;
72:   error?: {
73:     code: string;
74:     message: string;
75:   };
76:   outputUri?: string;
77: }
78: 
79: export interface SubmitOcrRequest {
80:   jobId: string;
81:   documentId: string;
82:   kind: "questionPaper" | "answerSheet";
83:   s3Bucket: string;
84:   s3Key: string;
85:   mimeType: "application/pdf" | "image/tiff" | "image/png" | "image/jpeg";
86:   pageCount: number;
87: }
88: 
89: export interface OcrProvider {
90:   submitDocument(request: SubmitOcrRequest): Promise<{ operationId: string; outputUri: string }>;
91:   getOperationStatus(operationId: string): Promise<OcrOperationStatus>;
92:   getOperationResult(operationId: string, outputUri: string): Promise<OcrDocumentResult>;
93:   cancelOperation(operationId: string): Promise<void>;
94: }

(End of file - total 94 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\src\\lib\\ocr\\textract.ts"
}
```

**Output:**
```
<path>E:\vedaAi\src\lib\ocr\textract.ts</path>
<type>file</type>
<content>
1: import {
2:   TextractClient,
3:   StartDocumentAnalysisCommand,
4:   GetDocumentAnalysisCommand,
5:   StartDocumentTextDetectionCommand,
6:   GetDocumentTextDetectionCommand,
7: } from "@aws-sdk/client-textract";
8: import { getConfig } from "@/lib/config";
9: import { OcrError, OcrErrorCodes } from "./errors";
10: import type { OcrProvider, SubmitOcrRequest, OcrOperationStatus, OcrDocumentResult, OcrPageResult } from "./types";
11: 
12: let textractClient: TextractClient | null = null;
13: 
14: function getTextractClient(): TextractClient {
15:   if (textractClient) return textractClient;
16:   const cfg = getConfig() as any;
17:   const region = cfg.AWS_REGION || "us-east-1";
18:   const opts: any = { region };
19:   if (cfg.AWS_ACCESS_KEY_ID && cfg.AWS_SECRET_ACCESS_KEY) {
20:     opts.credentials = {
21:       accessKeyId: cfg.AWS_ACCESS_KEY_ID,
22:       secretAccessKey: cfg.AWS_SECRET_ACCESS_KEY,
23:     };
24:   }
25:   textractClient = new TextractClient(opts);
26:   return textractClient;
27: }
28: 
29: export class TextractOcrProvider implements OcrProvider {
30:   async submitDocument(request: SubmitOcrRequest): Promise<{ operationId: string; outputUri: string }> {
31:     const cfg = getConfig() as any;
32:     if (!cfg.AWS_S3_BUCKET) throw new OcrError(OcrErrorCodes.CONFIGURATION_ERROR, "AWS_S3_BUCKET not configured", null, false);
33:     const bucket = request.s3Bucket || cfg.AWS_S3_BUCKET;
34:     const key = request.s3Key;
35:     if (!bucket || !key) throw new OcrError(OcrErrorCodes.CONFIGURATION_ERROR, "S3 bucket/key missing for Textract", null, false);
36: 
37:     const mime = request.mimeType;
38:     // For images, synchronous DetectDocumentText could be used, but we always use async for uniformity
39:     // Use StartDocumentAnalysis for PDFs/TIFFs to get layout/tables if needed
40:     const client = getTextractClient();
41: 
42:     const snsTopicArn: string | undefined = cfg.AWS_SNS_TOPIC_ARN;
43:     const roleArn: string | undefined = cfg.AWS_SNS_ROLE_ARN;
44: 
45:     // FeatureTypes: include TABLES and LAYOUT for better reading order; keep minimal for cost
46:     const featureTypes: any[] = ["TABLES", "LAYOUT"];
47: 
48:     try {
49:       // Prefer StartDocumentAnalysis for PDFs; fallback to StartDocumentTextDetection if analysis not needed
50:       const cmd = new StartDocumentAnalysisCommand({
51:         DocumentLocation: { S3Object: { Bucket: bucket, Name: key } },
52:         FeatureTypes: featureTypes,
53:         NotificationChannel: snsTopicArn && roleArn ? { SNSTopicArn: snsTopicArn, RoleArn: roleArn } : undefined,
54:       });
55:       const res: any = await client.send(cmd as any);
56:       const jobId = res.JobId as string;
57:       if (!jobId) throw new Error("Textract did not return JobId");
58:       // For compatibility, outputUri is s3 prefix where Textract would write if using OutputConfig (we don't; we fetch via GetDocumentAnalysis)
59:       // Use bucket/prefix convention for tracking
60:       const outputBucket = cfg.AWS_TEXTRACT_OUTPUT_BUCKET || bucket;
61:       const outputUri = `s3://${outputBucket}/textract-output/${request.jobId}/${request.kind}/`;
62:       return { operationId: jobId, outputUri };
63:     } catch (e: any) {
64:       // Fallback: try StartDocumentTextDetection if analysis fails due to feature
65:       if (e?.name === "InvalidParameterException" || e?.message?.includes("FeatureTypes")) {
66:         try {
67:           const cmd2 = new StartDocumentTextDetectionCommand({
68:             DocumentLocation: { S3Object: { Bucket: bucket, Name: key } },
69:             NotificationChannel: snsTopicArn && roleArn ? { SNSTopicArn: snsTopicArn, RoleArn: roleArn } : undefined,
70:           });
71:           const res2: any = await client.send(cmd2 as any);
72:           const jobId2 = res2.JobId as string;
73:           if (!jobId2) throw new Error("Textract text detection did not return JobId");
74:           const outputBucket = cfg.AWS_TEXTRACT_OUTPUT_BUCKET || bucket;
75:           const outputUri = `s3://${outputBucket}/textract-output/${request.jobId}/${request.kind}/`;
76:           return { operationId: jobId2, outputUri };
77:         } catch (e2: any) {
78:           return mapTextractError(e2);
79:         }
80:       }
81:       return mapTextractError(e);
82:     }
83:   }
84: 
85:   async getOperationStatus(operationId: string): Promise<OcrOperationStatus> {
86:     if (!operationId) throw new OcrError(OcrErrorCodes.OPERATION_FAILED, "Missing operationId", null, false);
87:     const client = getTextractClient();
88:     try {
89:       // Try analysis first, then text detection
90:       try {
91:         const res: any = await client.send(new GetDocumentAnalysisCommand({ JobId: operationId, MaxResults: 1 }));
92:         const status = res.JobStatus as string;
93:         if (status === "SUCCEEDED") return { operationId, status: "DONE" };
94:         if (status === "FAILED") return { operationId, status: "FAILED", error: { code: res.StatusMessage || "FAILED", message: res.StatusMessage || "Textract job failed" } };
95:         return { operationId, status: "RUNNING" };
96:       } catch {
97:         const res2: any = await client.send(new GetDocumentTextDetectionCommand({ JobId: operationId, MaxResults: 1 }));
98:         const status2 = res2.JobStatus as string;
99:         if (status2 === "SUCCEEDED") return { operationId, status: "DONE" };
100:         if (status2 === "FAILED") return { operationId, status: "FAILED", error: { code: res2.StatusMessage || "FAILED", message: res2.StatusMessage || "Textract job failed" } };
101:         return { operationId, status: "RUNNING" };
102:       }
103:     } catch (e: any) {
104:       throw new OcrError(OcrErrorCodes.OPERATION_FAILED, `getOperationStatus failed: ${e.message}`, e, true);
105:     }
106:   }
107: 
108:   async getOperationResult(operationId: string, _outputUri: string): Promise<OcrDocumentResult> {
109:     const client = getTextractClient();
110:     let blocks: any[] = [];
111:     let jobStatus: string | undefined;
112:     let nextToken: string | undefined;
113: 
114:     // Textract pagination: NextToken must be handled
115:     const fetchWithPagination = async (useAnalysis: boolean) => {
116:       blocks = [];
117:       nextToken = undefined;
118:       do {
119:         const cmd = useAnalysis
120:           ? new GetDocumentAnalysisCommand({ JobId: operationId, MaxResults: 1000, NextToken: nextToken })
121:           : new GetDocumentTextDetectionCommand({ JobId: operationId, MaxResults: 1000, NextToken: nextToken });
122:         const res: any = await client.send(cmd as any);
123:         jobStatus = res.JobStatus as string;
124:         const pageBlocks: any[] = res.Blocks || [];
125:         blocks.push(...pageBlocks);
126:         nextToken = res.NextToken;
127:       } while (nextToken);
128:       return { jobStatus, blocks };
129:     };
130: 
131:     let useAnalysis = true;
132:     let result: any;
133:     try {
134:       result = await fetchWithPagination(true);
135:     } catch (e: any) {
136:       // If analysis not found, try text detection
137:       const msg = e?.message || "";
138:       if (msg.includes("InvalidJobId") || msg.includes("not found") || e?.name === "InvalidParameterException") {
139:         result = await fetchWithPagination(false);
140:         useAnalysis = false;
141:       } else {
142:         throw new OcrError(OcrErrorCodes.OUTPUT_PARSE_FAILED, `Textract GetDocument failed: ${msg}`, e, true);
143:       }
144:     }
145:     // If still IN_PROGRESS, the caller should have polled to DONE; but handle gracefully
146:     if (result.jobStatus && result.jobStatus !== "SUCCEEDED") {
147:       if (result.jobStatus === "FAILED") {
148:         throw new OcrError(OcrErrorCodes.OPERATION_FAILED, `Textract job failed: ${result.jobStatus}`, null, false);
149:       }
150:       // If not yet succeeded, but we fetched blocks, continue; else throw
151:       if (blocks.length === 0) {
152:         throw new OcrError(OcrErrorCodes.OPERATION_FAILED, `Textract job not yet succeeded: ${result.jobStatus}`, null, true);
153:       }
154:     }
155:     if (blocks.length === 0) {
156:       throw new OcrError(OcrErrorCodes.OUTPUT_MISSING, `No Textract blocks found for job ${operationId}`, null, false);
157:     }
158: 
159:     const pages = normalizeTextractBlocks(blocks);
160: 
161:     return {
162:       jobId: "",
163:       documentId: "",
164:       kind: "answerSheet",
165:       pages,
166:       provider: "amazon-textract",
167:       providerVersion: "v1",
168:       operationId,
169:       completedAt: new Date().toISOString(),
170:     };
171:   }
172: 
173:   async cancelOperation(_operationId: string): Promise<void> {
174:     // Textract has no cancel API; no-op
175:   }
176: }
177: 
178: function mapTextractError(e: any): never {
179:   const msg = e?.message || String(e);
180:   const name = e?.name || "";
181:   if (name === "AccessDeniedException" || msg.includes("AccessDenied") || msg.includes("not authorized")) {
182:     throw new OcrError(OcrErrorCodes.AUTH_ERROR, `Textract access denied: ${msg}`, e, false);
183:   }
184:   if (name === "InvalidS3ObjectException" || msg.includes("InvalidS3Object") || msg.includes("NoSuchKey") || msg.includes("bucket")) {
185:     throw new OcrError(OcrErrorCodes.BUCKET_ACCESS_ERROR, `S3 object error: ${msg}`, e, false);
186:   }
187:   if (name === "UnsupportedDocumentException" || msg.includes("UnsupportedDocument") || msg.includes("Unsupported document")) {
188:     throw new OcrError(OcrErrorCodes.INVALID_DOCUMENT, `Unsupported document: ${msg}`, e, false);
189:   }
190:   if (name === "ThrottlingException" || msg.includes("Throttling") || msg.includes("ProvisionedThroughputExceeded")) {
191:     throw new OcrError(OcrErrorCodes.OPERATION_FAILED, `Textract throttled: ${msg}`, e, true);
192:   }
193:   if (name === "InvalidParameterException") {
194:     throw new OcrError(OcrErrorCodes.CONFIGURATION_ERROR, `Textract invalid parameter: ${msg}`, e, false);
195:   }
196:   throw new OcrError(OcrErrorCodes.SUBMISSION_FAILED, `Textract StartDocument failed: ${msg}`, e, true);
197: }
198: 
199: export function normalizeTextractBlocks(blocks: any[]): OcrPageResult[] {
200:   // Textract BlockType: PAGE, LINE, WORD, TABLE, CELL, etc. We use PAGE/LINE/WORD hierarchy.
201:   // Geometry.BoundingBox is normalized [0,1] with Left, Top, Width, Height (already normalized to page)
202:   // Polygon may be present as Geometry.Polygon [{X,Y}]
203:   const pagesMap = new Map<number, OcrPageResult>();
204: 
205:   // First pass: create page entries from PAGE blocks
206:   const pageBlocks = blocks.filter((b) => b.BlockType === "PAGE");
207:   for (const pb of pageBlocks) {
208:     const pageNum: number = pb.Page || 1;
209:     if (!pagesMap.has(pageNum)) {
210:       pagesMap.set(pageNum, {
211:         pageNumber: pageNum,
212:         text: "",
213:         blocks: [],
214:         lines: [],
215:         confidence: pb.Confidence ?? 0.99,
216:         width: 0, // Textract doesn't give pixel dims; we keep 0 and treat bbox as already normalized
217:         height: 0,
218:         rotation: 0,
219:       } as any);
220:     }
221:   }
222:   // Ensure at least page 1 exists
223:   if (pagesMap.size === 0) {
224:     pagesMap.set(1, { pageNumber: 1, text: "", blocks: [], lines: [], confidence: 0.99, width: 0, height: 0, rotation: 0 } as any);
225:   }
226: 
227:   // Map page -> lines
228:   const linesByPage = new Map<number, any[]>();
229:   for (const b of blocks) {
230:     if (b.BlockType === "LINE") {
231:       const p = b.Page || 1;
232:       if (!linesByPage.has(p)) linesByPage.set(p, []);
233:       linesByPage.get(p)!.push(b);
234:     }
235:   }
236: 
237:   // Map line id -> words
238:   const wordsByLineId = new Map<string, any[]>();
239:   for (const b of blocks) {
240:     if (b.BlockType === "WORD") {
241:       // WORD blocks have no explicit line parent, but Relationships on LINE point to WORD ids
242:       // For fallback, group by Page
243:     }
244:   }
245:   // Build id -> block map
246:   const idMap = new Map<string, any>();
247:   for (const b of blocks) idMap.set(b.Id, b);
248: 
249:   // For each page, construct OcrBlock -> paragraphs -> words structure
250:   // Textract hierarchy: PAGE -> LINE -> WORD; no explicit Paragraph/Block for handwriting, but we synthesize
251:   for (const [pageNum, pageResult] of pagesMap) {
252:     const lines: any[] = linesByPage.get(pageNum) || [];
253:     // Sort lines by Top (reading order)
254:     lines.sort((a, b) => (a.Geometry?.BoundingBox?.Top ?? 0) - (b.Geometry?.BoundingBox?.Top ?? 0));
255: 
256:     // Combine text per page from LINE.Text
257:     const pageText = lines.map((l) => l.Text || "").join("\n");
258:     pageResult.text = pageText;
259:     // Preserve per-line geometry for deterministic parsers
260:     (pageResult as any).lines = lines.map((l: any) => ({
261:       text: l.Text || "",
262:       boundingBox: {
263:         x: l.Geometry?.BoundingBox?.Left ?? 0,
264:         y: l.Geometry?.BoundingBox?.Top ?? 0,
265:         width: l.Geometry?.BoundingBox?.Width ?? 0,
266:         height: l.Geometry?.BoundingBox?.Height ?? 0,
267:       },
268:       confidence: (l.Confidence ?? 95) / 100,
269:       pageNumber: pageNum,
270:     }));
271: 
272:     // Textract doesn't expose paragraphs cleanly for handwriting; we synthesize blocks:
273:     // Group lines into blocks by vertical gap (if gap > 0.03 * page height, new block)
274:     const synthesizedBlocks: any[] = [];
275:     let currentBlockLines: any[] = [];
276:     let lastTop = -1;
277:     let lastHeight = 0;
278:     for (const line of lines) {
279:       const bb = line.Geometry?.BoundingBox;
280:       const top = bb?.Top ?? 0;
281:       const height = bb?.Height ?? 0;
282:       if (lastTop >= 0) {
283:         const gap = top - (lastTop + lastHeight);
284:         if (gap > 0.025) {
285:           if (currentBlockLines.length > 0) {
286:             synthesizedBlocks.push([...currentBlockLines]);
287:             currentBlockLines = [];
288:           }
289:         }
290:       }
291:       currentBlockLines.push(line);
292:       lastTop = top;
293:       lastHeight = height;
294:     }
295:     if (currentBlockLines.length > 0) synthesizedBlocks.push(currentBlockLines);
296: 
297:     // Convert to OcrBlock
298:     for (const blockLines of synthesizedBlocks) {
299:       // bounding box covering all lines
300:       const bbs = blockLines.map((l: any) => l.Geometry?.BoundingBox).filter(Boolean);
301:       const blockBox = unionBoxes(bbs);
302:       const confidence = avg(blockLines.map((l: any) => l.Confidence ?? 95)) / 100;
303: 
304:       // Paragraph: split blockLines into paragraphs by larger gap (0.02)
305:       const paragraphs: any[] = [];
306:       let paraLines: any[] = [blockLines[0]];
307:       for (let i = 1; i < blockLines.length; i++) {
308:         const prev = blockLines[i - 1];
309:         const cur = blockLines[i];
310:         const gap = (cur.Geometry?.BoundingBox?.Top ?? 0) - ((prev.Geometry?.BoundingBox?.Top ?? 0) + (prev.Geometry?.BoundingBox?.Height ?? 0));
311:         if (gap > 0.015) {
312:           paragraphs.push(paraLines);
313:           paraLines = [cur];
314:         } else {
315:           paraLines.push(cur);
316:         }
317:       }
318:       paragraphs.push(paraLines);
319: 
320:       const ocrParagraphs: any[] = paragraphs.map((para) => {
321:         const paraBbs = para.map((l: any) => l.Geometry?.BoundingBox).filter(Boolean);
322:         const pBox = unionBoxes(paraBbs);
323:         const pConf = avg(para.map((l: any) => l.Confidence ?? 95)) / 100;
324:         const words: any[] = [];
325:         for (const line of para) {
326:           // Resolve WORD children via Relationships
327:           const rel = (line.Relationships || []).find((r: any) => r.Type === "CHILD");
328:           const childIds: string[] = rel?.Ids || [];
329:           if (childIds.length > 0) {
330:             for (const wid of childIds) {
331:               const wb = idMap.get(wid);
332:               if (!wb || wb.BlockType !== "WORD") continue;
333:               const wBox = wb.Geometry?.BoundingBox
334:                 ? { x: wb.Geometry.BoundingBox.Left ?? 0, y: wb.Geometry.BoundingBox.Top ?? 0, width: wb.Geometry.BoundingBox.Width ?? 0, height: wb.Geometry.BoundingBox.Height ?? 0 }
335:                 : { x: 0, y: 0, width: 0.05, height: 0.02 };
336:               words.push({
337:                 boundingBox: wBox,
338:                 symbols: [],
339:                 confidence: (wb.Confidence ?? 95) / 100,
340:                 text: wb.Text || "",
341:               });
342:             }
343:           } else {
344:             // Fallback: split line text into words
345:             const parts = (line.Text || "").split(/\s+/).filter(Boolean);
346:             const bb = line.Geometry?.BoundingBox;
347:             const w = bb?.Width ?? 0.9;
348:             const slice = parts.length ? w / parts.length : w;
349:             for (let i = 0; i < parts.length; i++) {
350:               words.push({
351:                 boundingBox: { x: (bb?.Left ?? 0) + i * slice, y: bb?.Top ?? 0, width: slice, height: bb?.Height ?? 0.02 },
352:                 symbols: [],
353:                 confidence: (line.Confidence ?? 95) / 100,
354:                 text: parts[i],
355:               });
356:             }
357:           }
358:         }
359:         return { boundingBox: { x: pBox.Left ?? 0, y: pBox.Top ?? 0, width: pBox.Width ?? 0.9, height: pBox.Height ?? 0.05 }, words, confidence: pConf };
360:       });
361: 
362:       pageResult.blocks.push({
363:         boundingBox: { x: blockBox.Left ?? 0, y: blockBox.Top ?? 0, width: blockBox.Width ?? 0.9, height: blockBox.Height ?? 0.05 },
364:         paragraphs: ocrParagraphs,
365:         confidence,
366:       });
367:     }
368: 
369:     // If no lines at all but blocks exist, keep pages empty text
370:     if (pageResult.blocks.length === 0 && pageResult.text === "") {
371:       pageResult.text = "";
372:     }
373:   }
374: 
375:   return Array.from(pagesMap.values()).sort((a, b) => a.pageNumber - b.pageNumber);
376: }
377: 
378: function unionBoxes(boxes: any[]): any {
379:   if (boxes.length === 0) return { Left: 0, Top: 0, Width: 1, Height: 0.05 };
380:   let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
381:   for (const b of boxes) {
382:     const l = b.Left ?? 0, t = b.Top ?? 0, w = b.Width ?? 0, h = b.Height ?? 0;
383:     minX = Math.min(minX, l);
384:     minY = Math.min(minY, t);
385:     maxX = Math.max(maxX, l + w);
386:     maxY = Math.max(maxY, t + h);
387:   }
388:   return { Left: minX, Top: minY, Width: maxX - minX, Height: maxY - minY };
389: }
390: 
391: function avg(nums: number[]): number {
392:   if (nums.length === 0) return 95;
393:   return nums.reduce((a, b) => a + b, 0) / nums.length;
394: }
395: 
396: export function resetTextractClientForTest() {
397:   textractClient = null;
398: }
399: export const resetVisionClientForTest = resetTextractClientForTest;

(End of file - total 399 lines)
</content>
```

---

## Assistant (Build · Muse Spark 1.2 Free · 2.9s)

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\src\\lib\\ocr\\factory.ts"
}
```

**Output:**
```
<path>E:\vedaAi\src\lib\ocr\factory.ts</path>
<type>file</type>
<content>
1: import { getConfig } from "@/lib/config";
2: import { TextractOcrProvider } from "./textract";
3: import type { OcrProvider } from "./types";
4: 
5: let cached: OcrProvider | null = null;
6: 
7: export function getOcrProvider(): OcrProvider {
8:   if (cached) return cached;
9:   const cfg = getConfig() as any;
10:   const provider = (cfg.OCR_PROVIDER || "textract") as string;
11:   if (provider === "mock") {
12:     // dynamic import to avoid bundling aws deps in test-only path
13:     const { MockOcrProvider } = require("./mock");
14:     cached = new MockOcrProvider();
15:     return cached!;
16:   }
17:   cached = new TextractOcrProvider();
18:   return cached!;
19: }
20: 
21: export function setOcrProviderForTest(p: OcrProvider | null) {
22:   (cached as any) = p;
23: }

(End of file - total 23 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\src\\lib\\ocr\\mock.ts"
}
```

**Output:**
```
<path>E:\vedaAi\src\lib\ocr\mock.ts</path>
<type>file</type>
<content>
1: import type { OcrProvider, SubmitOcrRequest, OcrOperationStatus, OcrDocumentResult } from "./types";
2: 
3: export class MockOcrProvider implements OcrProvider {
4:   private ops = new Map<string, { status: OcrOperationStatus["status"]; outputUri: string; pages: number }>();
5:   shouldFailSubmit = false;
6:   shouldFailOperation = false;
7: 
8:   async submitDocument(request: SubmitOcrRequest): Promise<{ operationId: string; outputUri: string }> {
9:     if (this.shouldFailSubmit) throw Object.assign(new Error("Mock submit failed"), { code: "OCR_SUBMISSION_FAILED" });
10:     const opId = `mock-textract-${request.jobId}-${Date.now()}`;
11:     const uri = `s3://mock-bucket/textract-output/${request.jobId}/`;
12:     this.ops.set(opId, { status: "DONE", outputUri: uri, pages: request.pageCount });
13:     return { operationId: opId, outputUri: uri };
14:   }
15: 
16:   async getOperationStatus(operationId: string): Promise<OcrOperationStatus> {
17:     const op = this.ops.get(operationId);
18:     if (!op) return { operationId, status: "DONE" };
19:     if (this.shouldFailOperation) return { operationId, status: "FAILED", error: { code: "MOCK", message: "Mock failure" } };
20:     return { operationId, status: op.status, outputUri: op.outputUri };
21:   }
22: 
23:   async getOperationResult(operationId: string, outputUri: string): Promise<OcrDocumentResult> {
24:     const op = this.ops.get(operationId);
25:     const pageCount = op?.pages || 1;
26:     return {
27:       jobId: "mock-job",
28:       documentId: "mock-doc",
29:       kind: "answerSheet",
30:       pages: Array.from({ length: pageCount }, (_, i) => ({
31:         pageNumber: i + 1,
32:         text: `Mock OCR page ${i + 1} text with handwritten content`,
33:         blocks: [
34:           {
35:             boundingBox: { x: 0.05, y: 0.1, width: 0.9, height: 0.05 },
36:             paragraphs: [
37:               {
38:                 boundingBox: { x: 0.05, y: 0.1, width: 0.9, height: 0.05 },
39:                 words: [{ boundingBox: { x: 0.05, y: 0.1, width: 0.2, height: 0.05 }, symbols: [], confidence: 0.9, text: "Mock" }],
40:                 confidence: 0.9,
41:               },
42:             ],
43:             confidence: 0.9,
44:           },
45:         ],
46:         lines: [
47:           {
48:             text: `Mock OCR page ${i + 1} text`,
49:             boundingBox: { x: 0.05, y: 0.1, width: 0.9, height: 0.05 },
50:             confidence: 0.9,
51:             pageNumber: i + 1,
52:           },
53:         ],
54:         confidence: 0.92,
55:         width: 800,
56:         height: 1100,
57:         rotation: 0,
58:       })),
59:       provider: "amazon-textract",
60:       providerVersion: "v1-mock",
61:       operationId,
62:       completedAt: new Date().toISOString(),
63:     };
64:   }
65: 
66:   async cancelOperation(): Promise<void> {}
67: }

(End of file - total 67 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\src\\lib\\ocr\\index.ts"
}
```

**Output:**
```
<path>E:\vedaAi\src\lib\ocr\index.ts</path>
<type>file</type>
<content>
1: export * from "./types";
2: export * from "./errors";
3: export * from "./factory";
4: export * from "./s3";
5: export { TextractOcrProvider } from "./textract";
6: export { MockOcrProvider } from "./mock";

(End of file - total 6 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\src\\lib\\ocr\\s3.ts"
}
```

**Output:**
```
<path>E:\vedaAi\src\lib\ocr\s3.ts</path>
<type>file</type>
<content>
1: import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
2: import { getConfig } from "@/lib/config";
3: import { OcrError, OcrErrorCodes } from "./errors";
4: 
5: let s3Client: S3Client | null = null;
6: 
7: function getS3Client(): S3Client {
8:   if (s3Client) return s3Client;
9:   const cfg = getConfig() as any;
10:   const region = cfg.AWS_REGION || "us-east-1";
11:   const opts: any = { region };
12:   if (cfg.AWS_ACCESS_KEY_ID && cfg.AWS_SECRET_ACCESS_KEY) {
13:     opts.credentials = {
14:       accessKeyId: cfg.AWS_ACCESS_KEY_ID,
15:       secretAccessKey: cfg.AWS_SECRET_ACCESS_KEY,
16:     };
17:   }
18:   // If no explicit credentials, SDK falls back to env, shared config, or IAM role
19:   s3Client = new S3Client(opts);
20:   return s3Client;
21: }
22: 
23: export function buildS3Keys(jobId: string, kind: "questionPaper" | "answerSheet"): { bucket: string; inputKey: string; outputPrefix: string } {
24:   const cfg = getConfig() as any;
25:   const bucket: string = cfg.AWS_S3_BUCKET;
26:   if (!bucket) throw new OcrError(OcrErrorCodes.CONFIGURATION_ERROR, "AWS_S3_BUCKET not configured", null, false);
27:   const inputPrefix: string = cfg.AWS_S3_INPUT_PREFIX || "ocr-input";
28:   const outputPrefix: string = cfg.AWS_S3_OUTPUT_PREFIX || "ocr-output";
29:   const safeJob = jobId.replace(/[^a-zA-Z0-9-]/g, "");
30:   const inputKey = `${inputPrefix}/${safeJob}/${kind}.pdf`;
31:   const outPref = `${outputPrefix}/${safeJob}/${kind}/`;
32:   return { bucket, inputKey, outputPrefix: outPref };
33: }
34: 
35: export function buildS3Uris(jobId: string): { inputUri: string; outputUri: string; inputObject: string; outputPrefix: string } {
36:   const qp = buildS3Keys(jobId, "questionPaper");
37:   // For backward-compat naming, still return inputUri/outputUri shape but as s3://
38:   return {
39:     inputUri: `s3://${qp.bucket}/${qp.inputKey}`,
40:     outputUri: `s3://${qp.bucket}/${qp.outputPrefix}`,
41:     inputObject: qp.inputKey,
42:     outputPrefix: qp.outputPrefix,
43:   };
44: }
45: 
46: // Backward compat alias for old gcs helpers
47: export function parseGcsUri(uri: string): { bucket: string; prefix: string } {
48:   return parseS3Uri(uri);
49: }
50: 
51: export function parseS3Uri(uri: string): { bucket: string; prefix: string } {
52:   if (uri.startsWith("s3://")) {
53:     const withoutScheme = uri.slice(5);
54:     const slash = withoutScheme.indexOf("/");
55:     if (slash === -1) return { bucket: withoutScheme, prefix: "" };
56:     return { bucket: withoutScheme.slice(0, slash), prefix: withoutScheme.slice(slash + 1) };
57:   }
58:   if (uri.startsWith("gs://")) {
59:     const withoutScheme = uri.slice(5);
60:     const slash = withoutScheme.indexOf("/");
61:     if (slash === -1) return { bucket: withoutScheme, prefix: "" };
62:     return { bucket: withoutScheme.slice(0, slash), prefix: withoutScheme.slice(slash + 1) };
63:   }
64:   throw new OcrError(OcrErrorCodes.CONFIGURATION_ERROR, `Invalid S3 URI: ${uri}`, null, false);
65: }
66: 
67: export async function uploadBufferToS3(bucket: string, key: string, buffer: Buffer, mimeType: string): Promise<string> {
68:   try {
69:     const client = getS3Client();
70:     await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: mimeType }));
71:     return `s3://${bucket}/${key}`;
72:   } catch (e: any) {
73:     throw new OcrError(OcrErrorCodes.GCS_UPLOAD_FAILED, `Failed to upload to S3 s3://${bucket}/${key}: ${e.message}`, e, true);
74:   }
75: }
76: 
77: // Legacy name
78: export const uploadBufferToGcs = uploadBufferToS3;
79: 
80: export async function downloadS3File(bucket: string, key: string): Promise<Buffer> {
81:   try {
82:     const client = getS3Client();
83:     const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
84:     const body = res.Body as any;
85:     if (!body) throw new Error("Empty S3 body");
86:     // Body is ReadableStream in browser, Node: readable; SDK v3 returns transformable
87:     const bytes = await body.transformToByteArray();
88:     return Buffer.from(bytes);
89:   } catch (e: any) {
90:     throw new OcrError(OcrErrorCodes.GCS_DOWNLOAD_FAILED, `Failed to download s3://${bucket}/${key}: ${e.message}`, e, true);
91:   }
92: }
93: 
94: export const downloadGcsFile = downloadS3File;
95: 
96: export async function listS3OutputFiles(bucket: string, prefix: string): Promise<string[]> {
97:   try {
98:     const client = getS3Client();
99:     const keys: string[] = [];
100:     let token: string | undefined;
101:     do {
102:       const res: any = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
103:       for (const obj of res.Contents || []) {
104:         if (obj.Key) keys.push(obj.Key);
105:       }
106:       token = res.IsTruncated ? res.NextContinuationToken : undefined;
107:     } while (token);
108:     return keys.sort();
109:   } catch (e: any) {
110:     throw new OcrError(OcrErrorCodes.GCS_DOWNLOAD_FAILED, `Failed to list S3 output s3://${bucket}/${prefix}: ${e.message}`, e, true);
111:   }
112: }
113: 
114: export const listGcsOutputFiles = listS3OutputFiles;
115: 
116: export async function deleteS3Prefix(bucket: string, prefix: string): Promise<void> {
117:   try {
118:     const client = getS3Client();
119:     let token: string | undefined;
120:     do {
121:       const res: any = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
122:       const contents = res.Contents || [];
123:       if (contents.length > 0) {
124:         await client.send(
125:           new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: contents.map((c: any) => ({ Key: c.Key })) } })
126:         );
127:       }
128:       token = res.IsTruncated ? res.NextContinuationToken : undefined;
129:       if (!res.IsTruncated) break;
130:     } while (token);
131:   } catch {}
132: }
133: 
134: export const deleteGcsPrefix = deleteS3Prefix;
135: 
136: export function resetS3ClientForTest() {
137:   s3Client = null;
138: }
139: export const resetGcsStorageForTest = resetS3ClientForTest;
140: 
141: export async function createS3BucketIfNotExists(bucket: string): Promise<void> {
142:   // no-op: assume bucket exists; creation requires extra permissions
143: }

(End of file - total 143 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\src\\lib\\jobs\\runner.ts"
}
```

**Output:**
```
<path>E:\vedaAi\src\lib\jobs\runner.ts</path>
<type>file</type>
<content>
1: import { jobStore, documentStore, pageStoreApi, fileStorage } from "@/lib/storage";
2: import type { ProcessingJob, ProcessingStage, QuestionNode, AnswerGroup, AnswerRegion, HighlightRegion, MappingDecision, Evidence } from "@/types";
3: import { getConfig } from "@/lib/config";
4: import { AppError, ErrorCodes } from "@/lib/errors/codes";
5: import { inspectPdf, inspectImage } from "@/lib/documents/pdf";
6: import { aggregateScore, buildEvidence } from "@/lib/evidence/aggregate";
7: import { decideForQuestion } from "@/lib/decision";
8: import { generateId } from "@/lib/storage";
9: import { getOcrProvider } from "@/lib/ocr/factory";
10: import { uploadBufferToS3, deleteS3Prefix } from "@/lib/ocr/s3";
11: import { OcrError, OcrErrorCodes } from "@/lib/ocr/errors";
12: import type { OcrDocumentResult } from "@/lib/ocr/types";
13: import { parseQuestionsFromTextract } from "@/lib/structure/question-parser";
14: import * as fs from "fs/promises";
15: import * as path from "path";
16: import * as os from "os";
17: import { segmentAnswersFromTextract } from "@/lib/structure/answer-segmentation";
18: import { normalizeNumber } from "@/lib/structure/numbering";
19: import { validateQuestionStructure } from "@/lib/structure/validator";
20: import { getVisionProvider } from "@/lib/vision/factory";
21: import { shouldInvokeVision } from "@/lib/vision/router";
22: import { fuseDocuments } from "@/lib/vision/fusion";
23: import { renderPdfPagesForVision } from "@/lib/documents/render";
24: import type { VisionDocumentAnalysis } from "@/lib/vision/provider";
25: 
26: /** Merge per-line boxes into one coherent highlight per page with controlled padding (Phase 28-29) */
27: function mergeBoxesForHighlight(boxes: { x: number; y: number; width: number; height: number }[]): { x: number; y: number; width: number; height: number }[] {
28:   if (boxes.length === 0) return [];
29:   if (boxes.length === 1) {
30:     const b = boxes[0];
31:     const pad = 0.012;
32:     return [{ x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: Math.min(1 - Math.max(0, b.x - pad), b.width + pad * 2), height: Math.min(1 - Math.max(0, b.y - pad), b.height + pad * 2) }];
33:   }
34:   // If boxes are very spread (height >0.6 of page), likely covering unrelated content — keep as separate groups by y clustering
35:   const ys = boxes.map((b) => b.y).sort((a, b) => a - b);
36:   const span = (Math.max(...boxes.map((b) => b.y + b.height)) - Math.min(...boxes.map((b) => b.y)));
37:   if (span > 0.55) {
38:     // Keep up to 3 clusters, but for highlight we merge into one union rather than giant blank — still single union is expected for multi-part answer
39:     // Apply union with padding capped to avoid giant
40:   }
41:   let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
42:   for (const b of boxes) {
43:     minX = Math.min(minX, b.x);
44:     minY = Math.min(minY, b.y);
45:     maxX = Math.max(maxX, b.x + b.width);
46:     maxY = Math.max(maxY, b.y + b.height);
47:   }
48:   const pad = 0.012;
49:   const x = Math.max(0, minX - pad);
50:   const y = Math.max(0, minY - pad);
51:   const w = Math.min(1 - x, maxX - minX + pad * 2);
52:   const h = Math.min(1 - y, maxY - minY + pad * 2);
53:   return [{ x, y, width: w, height: h }];
54: }
55: 
56: function resolvePageId(modelPageId: string | undefined, pages: any[]): string {
57:   if (!modelPageId) return pages[0]?.id;
58:   if (modelPageId.includes("-") && pages.some((p) => p.id === modelPageId)) return modelPageId;
59:   const num = parseInt(String(modelPageId).replace(/[^0-9]/g, ""), 10);
60:   if (!isNaN(num)) {
61:     const byNumber = pages.find((p) => p.pageNumber === num);
62:     if (byNumber) return byNumber.id;
63:     if (pages[num]) return pages[num].id;
64:     if (pages[num - 1]) return pages[num - 1].id;
65:   }
66:   return pages[0]?.id;
67: }
68: 
69: // Stage order includes OCR + Vision (parallel conceptually) + Fusion
70: const STAGE_ORDER: ProcessingStage[] = [
71:   "VALIDATING",
72:   "PREPROCESSING",
73:   "OCR_SUBMITTED",
74:   "OCR_PROCESSING",
75:   "OCR_COMPLETED",
76:   "VISION",
77:   "FUSION",
78:   "EXTRACTING",
79:   "STRUCTURING",
80:   "MATCHING",
81:   "LOCALIZING",
82:   "VALIDATING_RESULT",
83:   "COMPLETED",
84: ];
85: 
86: export async function startProcessing(jobId: string): Promise<void> {
87:   const job = await jobStore.get(jobId);
88:   if (!job) throw new AppError(ErrorCodes.JOB_NOT_FOUND, `Job ${jobId} not found`);
89:   if (job.status === "COMPLETED" || job.currentStage === "COMPLETED") return;
90:   if (job.status === "FAILED") throw new AppError(ErrorCodes.INVALID_STAGE_TRANSITION, "Job already failed");
91:   // Idempotency: if already in OCR or EXTRACTING, do not re-submit duplicate work
92:   if (["OCR_SUBMITTED", "OCR_PROCESSING", "OCR_COMPLETED", "EXTRACTING", "STRUCTURING", "MATCHING"].includes(job.currentStage)) {
93:     // If job is mid-OCR, let existing run continue; avoid duplicate submission
94:     const existing = (job as any).ocrOperationId;
95:     if (existing) {
96:       console.log(JSON.stringify({ jobId, stage: "START", event: "idempotent_skip", currentStage: job.currentStage, ocrOperationId: String(existing).slice(0, 20) }));
97:       return;
98:     }
99:   }
100: 
101:   const HARD_TIMEOUT_MS = 10 * 60 * 1000; // 10min overall pipeline timeout (OCR async needs ~2-5min)
102:   const timeoutGuard = setTimeout(async () => {
103:     try {
104:       const cur = await jobStore.get(jobId);
105:       if (cur && cur.status !== "COMPLETED" && cur.status !== "FAILED") {
106:         console.error(`[job ${jobId}] HARD TIMEOUT after ${HARD_TIMEOUT_MS}ms at stage ${cur.currentStage}`);
107:         await jobStore.update(jobId, {
108:           status: "FAILED",
109:           currentStage: "FAILED",
110:           error: {
111:             code: ErrorCodes.MODEL_TIMEOUT,
112:             message: `Processing timed out at stage ${cur.currentStage} after ${HARD_TIMEOUT_MS / 1000}s. Try a smaller file or fewer pages.`,
113:             stage: cur.currentStage,
114:             timestamp: new Date().toISOString(),
115:           },
116:         });
117:       }
118:     } catch {}
119:   }, HARD_TIMEOUT_MS);
120:   (timeoutGuard as any).unref?.();
121: 
122:   runJob(jobId)
123:     .then(() => clearTimeout(timeoutGuard))
124:     .catch(async (e) => {
125:       clearTimeout(timeoutGuard);
126:       console.error(`[job ${jobId}] runner failed`, e);
127:       try {
128:         await jobStore.update(jobId, {
129:           status: "FAILED",
130:           currentStage: "FAILED",
131:           error: {
132:             code: (e as AppError).code || (e as OcrError).code || ErrorCodes.UNKNOWN_ERROR,
133:             message: (e as Error).message,
134:             stage: "FAILED",
135:             timestamp: new Date().toISOString(),
136:           },
137:         });
138:       } catch {}
139:     });
140: }
141: 
142: async function runJob(jobId: string) {
143:   let job = await jobStore.get(jobId);
144:   if (!job) return;
145: 
146:   const updateStage = async (stage: ProcessingStage, status: "in_progress" | "completed" | "failed") => {
147:     const stageStates = { ...job!.progress.stageStates } as any;
148:     stageStates[stage] = status;
149:     await jobStore.update(jobId, {
150:       currentStage: stage,
151:       status: stage as ProcessingStage,
152:       progress: { ...job!.progress, stageStates },
153:       updatedAt: new Date().toISOString(),
154:     });
155:     job = await jobStore.get(jobId);
156:   };
157: 
158:   try {
159:     await updateStage("VALIDATING", "in_progress");
160:     await validateJob(jobId);
161:     await updateStage("VALIDATING", "completed");
162: 
163:     await updateStage("PREPROCESSING", "in_progress");
164:     const prep = await preprocess(jobId);
165:     await updateStage("PREPROCESSING", "completed");
166: 
167:     // OCR — Amazon Textract async
168:     await updateStage("OCR_SUBMITTED", "in_progress");
169:     const ocrData = await ocrStage(jobId);
170:     await updateStage("OCR_SUBMITTED", "completed");
171: 
172:     await updateStage("OCR_PROCESSING", "in_progress");
173:     // ocrStage already polls to completion; this stage is for progress visibility
174:     await updateStage("OCR_PROCESSING", "completed");
175: 
176:     await updateStage("OCR_COMPLETED", "in_progress");
177:     await updateStage("OCR_COMPLETED", "completed");
178: 
179:     // Vision — parallel visual understanding (real page images, evidence-only, grounded to Textract)
180:     await updateStage("VISION", "in_progress");
181:     const visionData = await visionStage(jobId, ocrData);
182:     await updateStage("VISION", "completed");
183: 
184:     // Fusion — reconcile Textract + Vision + geometry → Canonical
185:     await updateStage("FUSION", "in_progress");
186:     const fusionData = await fusionStage(jobId, ocrData, visionData);
187:     await updateStage("FUSION", "completed");
188: 
189:     await updateStage("EXTRACTING", "in_progress");
190:     const extraction = await extracting(jobId, prep, ocrData, visionData, fusionData);
191:     await updateStage("EXTRACTING", "completed");
192: 
193:     await updateStage("STRUCTURING", "in_progress");
194:     const structured = await structuring(jobId, extraction);
195:     await updateStage("STRUCTURING", "completed");
196: 
197:     await updateStage("MATCHING", "in_progress");
198:     const matching = await matchingStage(jobId, structured);
199:     await updateStage("MATCHING", "completed");
200: 
201:     await updateStage("LOCALIZING", "in_progress");
202:     const localized = await localizing(jobId, matching);
203:     await updateStage("LOCALIZING", "completed");
204: 
205:     await updateStage("VALIDATING_RESULT", "in_progress");
206:     await validatingResult(jobId, localized);
207:     await updateStage("VALIDATING_RESULT", "completed");
208: 
209:     await jobStore.update(jobId, {
210:       status: "COMPLETED",
211:       currentStage: "COMPLETED",
212:       progress: {
213:         stageStates: {
214:           ...job!.progress.stageStates,
215:           COMPLETED: "completed",
216:         } as any,
217:       },
218:     });
219: 
220:     resultStore.set(jobId, localized);
221: 
222:     // Cleanup S3 staging after success (best-effort) — delete temp objects only, never primary Supabase storage
223:     try {
224:       const cfg = getConfig() as any;
225:       const bucket = cfg.AWS_S3_BUCKET;
226:       if (bucket) {
227:         await deleteS3Prefix(bucket, `${cfg.AWS_S3_INPUT_PREFIX || "ocr-input"}/${jobId}/`).catch(() => {});
228:         await deleteS3Prefix(bucket, `${cfg.AWS_S3_OUTPUT_PREFIX || "ocr-output"}/${jobId}/`).catch(() => {});
229:       }
230:     } catch {}
231:   } catch (e: any) {
232:     const code = e?.code || ErrorCodes.UNKNOWN_ERROR;
233:     const stage = job?.currentStage || "FAILED";
234:     await jobStore.update(jobId, {
235:       status: "FAILED",
236:       currentStage: "FAILED",
237:       error: {
238:         code,
239:         message: e?.message || String(e),
240:         stage,
241:         timestamp: new Date().toISOString(),
242:       },
243:       progress: {
244:         ...job!.progress,
245:         stageStates: { ...job!.progress.stageStates, [stage]: "failed" as const } as any,
246:       },
247:     });
248:     throw e;
249:   }
250: }
251: 
252: async function validateJob(jobId: string) {
253:   const job = await jobStore.get(jobId);
254:   if (!job?.questionPaperFileId || !job?.answerSheetFileId) {
255:     throw new AppError(ErrorCodes.VALIDATION_FAILED, "Both files required");
256:   }
257: }
258: 
259: async function preprocess(jobId: string) {
260:   const job = await jobStore.get(jobId);
261:   if (!job) throw new AppError(ErrorCodes.JOB_NOT_FOUND, "Job not found");
262: 
263:   const docs = await documentStore.getByJob(jobId);
264:   for (const doc of docs) {
265:     const fileId = doc.kind === "questionPaper" ? job.questionPaperFileId : doc.kind === "answerSheet" ? job.answerSheetFileId : doc.id;
266:     if (!fileId) throw new AppError(ErrorCodes.STORAGE_ERROR, `No fileId for doc ${doc.id}`);
267:     const buffer = await fileStorage.read(jobId, fileId);
268:     const isPdf = doc.mime === "application/pdf";
269:     const inspection = isPdf ? await inspectPdf(buffer) : await inspectImage(buffer);
270:     if (doc.pageCount !== inspection.pageCount) {
271:       await documentStore.update(doc.id, { pageCount: inspection.pageCount });
272:     }
273:     for (const p of inspection.pages) {
274:       const existing = await pageStoreApi.getByDocument(doc.id);
275:       const match = existing.find((e) => e.pageNumber === p.pageNumber);
276:       if (match) continue;
277:       await pageStoreApi.save({
278:         id: generateId(),
279:         documentId: doc.id,
280:         pageNumber: p.pageNumber,
281:         width: p.width,
282:         height: p.height,
283:         rotation: p.rotation,
284:       });
285:     }
286:   }
287:   return { ok: true };
288: }
289: 
290: // In-memory OCR + Vision + Fusion result stores (jobId -> per-document results) — with disk fallback for refresh persistence
291: const RESULT_PERSIST_DIR = path.join(os.tmpdir(), "veda-ai", "persist");
292: async function resultPersistWrite(jobId: string, data: any) {
293:   try {
294:     await fs.mkdir(RESULT_PERSIST_DIR, { recursive: true });
295:     const safe = jobId.replace(/[^a-zA-Z0-9-]/g, "");
296:     await fs.writeFile(path.join(RESULT_PERSIST_DIR, `result-${safe}.json`), JSON.stringify(data, null, 2), "utf-8");
297:   } catch {}
298: }
299: async function resultPersistRead(jobId: string): Promise<any | null> {
300:   try {
301:     const safe = jobId.replace(/[^a-zA-Z0-9-]/g, "");
302:     const buf = await fs.readFile(path.join(RESULT_PERSIST_DIR, `result-${safe}.json`), "utf-8");
303:     return JSON.parse(buf);
304:   } catch { return null; }
305: }
306: export const ocrResultStore = new Map<string, { qpOcr?: OcrDocumentResult; asOcr?: OcrDocumentResult }>();
307: export const visionResultStore = new Map<string, { qpVision?: VisionDocumentAnalysis; asVision?: VisionDocumentAnalysis }>();
308: export const fusionResultStore = new Map<string, any>();
309: class PersistedResultStore {
310:   private map = new Map<string, any>();
311:   set(jobId: string, v: any) {
312:     this.map.set(jobId, v);
313:     try {
314:       const safe = jobId.replace(/[^a-zA-Z0-9-]/g, "");
315:       const p = path.join(RESULT_PERSIST_DIR, `result-${safe}.json`);
316:       const { mkdirSync, writeFileSync } = require("fs");
317:       const { dirname } = require("path");
318:       mkdirSync(dirname(p), { recursive: true });
319:       writeFileSync(p, JSON.stringify(v, null, 2), "utf-8");
320:     } catch {}
321:     // also async fallback
322:     resultPersistWrite(jobId, v);
323:   }
324:   get(jobId: string) {
325:     const mem = this.map.get(jobId);
326:     if (mem) return mem;
327:     // sync read from disk (blocking) — use deasync-like sync read via fs sync? fallback to async via cache population
328:     // For sync get, we try to read synchronously if available
329:     try {
330:       const safe = jobId.replace(/[^a-zA-Z0-9-]/g, "");
331:       const p = path.join(RESULT_PERSIST_DIR, `result-${safe}.json`);
332:       // sync read if exists
333:       const { readFileSync, existsSync } = require("fs");
334:       if (existsSync(p)) {
335:         const buf = readFileSync(p, "utf-8");
336:         const data = JSON.parse(buf);
337:         this.map.set(jobId, data);
338:         return data;
339:       }
340:     } catch {}
341:     return undefined;
342:   }
343:   // async fallback used by API routes
344:   async getAsync(jobId: string) {
345:     const mem = this.map.get(jobId);
346:     if (mem) return mem;
347:     const persisted = await resultPersistRead(jobId);
348:     if (persisted) {
349:       this.map.set(jobId, persisted);
350:       return persisted;
351:     }
352:     return undefined;
353:   }
354: }
355: export const resultStore: any = new PersistedResultStore();
356: 
357: async function ocrStage(jobId: string): Promise<{ qpOcr?: OcrDocumentResult; asOcr?: OcrDocumentResult }> {
358:   const cfg = getConfig() as any;
359:   const ocrProviderName = cfg.OCR_PROVIDER || "textract";
360: 
361:   // Idempotency: reuse if already completed and stored
362:   const existing = ocrResultStore.get(jobId);
363:   const job = await jobStore.get(jobId);
364:   if (existing && job?.ocrCompletedAt) {
365:     console.log(JSON.stringify({ jobId, stage: "OCR", event: "reuse_cached", hasQp: !!existing.qpOcr, hasAs: !!existing.asOcr }));
366:     return existing;
367:   }
368:   // If operation already submitted and still valid, try to resume polling instead of re-submitting
369:   if (job?.ocrOperationId && job?.ocrOutputUri && ocrProviderName !== "mock") {
370:     try {
371:       console.log(JSON.stringify({ jobId, stage: "OCR", event: "resume_operation", operationId: job.ocrOperationId.slice(0, 30) }));
372:       const provider = getOcrProvider();
373:       const status = await provider.getOperationStatus(job.ocrOperationId);
374:       if (status.status === "DONE") {
375:         const result = await provider.getOperationResult(job.ocrOperationId, job.ocrOutputUri);
376:         // Need to split per doc? We store single op for combined? For per-doc we handle separately below.
377:       }
378:     } catch {}
379:   }
380: 
381:   const docs = await documentStore.getByJob(jobId);
382:   const qpDoc = docs.find((d) => d.kind === "questionPaper");
383:   const asDoc = docs.find((d) => d.kind === "answerSheet");
384:   if (!qpDoc || !asDoc) throw new AppError(ErrorCodes.VALIDATION_FAILED, "Missing docs for OCR");
385: 
386:   const qpPages = await pageStoreApi.getByDocument(qpDoc.id);
387:   const asPages = await pageStoreApi.getByDocument(asDoc.id);
388: 
389:   // Mock path — no S3, immediate synthetic OCR
390:   if (ocrProviderName === "mock") {
391:     const provider = getOcrProvider();
392:     const qpRes = await provider.getOperationResult("mock-qp", `s3://mock/mock/${jobId}/qp/`);
393:     const asRes = await provider.getOperationResult("mock-as", `s3://mock/mock/${jobId}/as/`);
394:     // Override page counts to match real docs
395:     qpRes.pages = qpRes.pages.slice(0, qpPages.length);
396:     asRes.pages = asRes.pages.slice(0, asPages.length);
397:     // Expand if needed to match 39 pages etc.
398:     if (asPages.length > asRes.pages.length) {
399:       const extra = asPages.length - asRes.pages.length;
400:       for (let i = 0; i < extra; i++) {
401:         asRes.pages.push({ pageNumber: asRes.pages.length + 1, text: `Mock page ${asRes.pages.length + 1} additional`, blocks: [], lines: [], confidence: 0.9, width: 800, height: 1100, rotation: 0 } as any);
402:       }
403:     }
404:     qpRes.jobId = jobId;
405:     qpRes.documentId = qpDoc.id;
406:     qpRes.kind = "questionPaper";
407:     asRes.jobId = jobId;
408:     asRes.documentId = asDoc.id;
409:     asRes.kind = "answerSheet";
410:     const out = { qpOcr: qpRes, asOcr: asRes };
411:     ocrResultStore.set(jobId, out);
412:     await jobStore.update(jobId, { ocrStartedAt: new Date().toISOString(), ocrCompletedAt: new Date().toISOString(), ocrPageCount: asPages.length + qpPages.length, ocrAttempt: (job?.ocrAttempt || 0) + 1 } as any);
413:     console.log(JSON.stringify({ jobId, stage: "OCR", event: "mock_completed", qpPages: qpRes.pages.length, asPages: asRes.pages.length }));
414:     // Debug dump for mock as well (exact format)
415:     try {
416:       const safe = jobId.replace(/[^a-zA-Z0-9-]/g, "");
417:       const debugDir = path.join(os.tmpdir(), "veda-ai", safe, "debug");
418:       await fs.mkdir(debugDir, { recursive: true });
419:       await fs.writeFile(path.join(debugDir, "questionPaper-textract.json"), JSON.stringify(qpRes, null, 2), "utf-8");
420:       await fs.writeFile(path.join(debugDir, "answerSheet-textract.json"), JSON.stringify(asRes, null, 2), "utf-8");
421:       const artDir = path.join(process.cwd(), "artifacts", "ocr-debug", safe);
422:       await fs.mkdir(artDir, { recursive: true });
423:       await fs.writeFile(path.join(artDir, "questionPaper-textract.json"), JSON.stringify(qpRes, null, 2), "utf-8");
424:       await fs.writeFile(path.join(artDir, "answerSheet-textract.json"), JSON.stringify(asRes, null, 2), "utf-8");
425:       console.log(JSON.stringify({ jobId, stage: "OCR", event: "debug_dump_mock", path: debugDir }));
426:     } catch {}
427:     return out;
428:   }
429: 
430:   // Real AWS Textract path — explicit mock only when configured
431:   if (!cfg.AWS_S3_BUCKET) {
432:     if (cfg.OCR_PROVIDER === "mock") {
433:       console.warn(JSON.stringify({ jobId, stage: "OCR", event: "mock_explicit", ocrProviderName, reason: "OCR_PROVIDER=mock configured" }));
434:       const mockProvider = new (await import("@/lib/ocr/mock")).MockOcrProvider();
435:       const qpRes = await mockProvider.getOperationResult("mock-qp", `s3://mock/mock/${jobId}/qp/`);
436:       const asRes = await mockProvider.getOperationResult("mock-as", `s3://mock/mock/${jobId}/as/`);
437:       qpRes.pages = qpRes.pages.slice(0, qpPages.length);
438:       asRes.pages = asRes.pages.slice(0, asPages.length);
439:       if (asPages.length > asRes.pages.length) {
440:         const extra = asPages.length - asRes.pages.length;
441:         for (let i = 0; i < extra; i++) asRes.pages.push({ pageNumber: asRes.pages.length + 1, text: `Mock page ${asRes.pages.length + 1} additional`, blocks: [], lines: [], confidence: 0.9, width: 800, height: 1100, rotation: 0 } as any);
442:       }
443:       qpRes.jobId = jobId; qpRes.documentId = qpDoc.id; qpRes.kind = "questionPaper";
444:       asRes.jobId = jobId; asRes.documentId = asDoc.id; asRes.kind = "answerSheet";
445:       const out = { qpOcr: qpRes, asOcr: asRes };
446:       ocrResultStore.set(jobId, out);
447:       await jobStore.update(jobId, { ocrStartedAt: new Date().toISOString(), ocrCompletedAt: new Date().toISOString(), ocrPageCount: asPages.length + qpPages.length, ocrAttempt: (job?.ocrAttempt || 0) + 1 } as any);
448:       return out;
449:     }
450:     throw new AppError(ErrorCodes.OCR_CONFIGURATION_ERROR, "AWS OCR not configured. Set AWS_REGION and AWS_S3_BUCKET or use OCR_PROVIDER=mock (for local dev set OCR_PROVIDER=mock in .env)");
451:   }
452: 
453:   const provider = getOcrProvider();
454:   const bucket = cfg.AWS_S3_BUCKET as string;
455:   const inputPrefix = cfg.AWS_S3_INPUT_PREFIX || "ocr-input";
456:   const outputPrefix = cfg.AWS_S3_OUTPUT_PREFIX || "ocr-output";
457:   const timeoutMs: number = cfg.OCR_OPERATION_TIMEOUT_MS || 300000;
458:   const pollMs: number = cfg.OCR_POLL_INTERVAL_MS || 5000;
459:   const maxRetries: number = cfg.OCR_MAX_RETRIES || 3;
460: 
461:   async function processOneDoc(doc: any, pages: any[], kind: "questionPaper" | "answerSheet"): Promise<OcrDocumentResult> {
462:     const safeJob = jobId.replace(/[^a-zA-Z0-9-]/g, "");
463:     const inputKey = `${inputPrefix}/${safeJob}/${kind}.pdf`;
464:     const outputPref = `${outputPrefix}/${safeJob}/${kind}/`;
465:     const inputUri = `s3://${bucket}/${inputKey}`;
466:     const outputUri = `s3://${bucket}/${outputPref}`;
467: 
468:     // Read buffer (streaming would be better but buffer is okay for 38MB; avoid duplicate copies)
469:     const fileId = kind === "questionPaper" ? (await jobStore.get(jobId))!.questionPaperFileId! : (await jobStore.get(jobId))!.answerSheetFileId!;
470:     const buffer = await fileStorage.read(jobId, fileId);
471:     const mimeType = doc.mime === "application/pdf" ? "application/pdf" : (doc.mime as any);
472: 
473:     // Upload to S3 staging (idempotent: overwrite)
474:     console.log(JSON.stringify({ jobId, stage: "OCR", event: "s3_upload_start", kind, sizeMb: (buffer.length / 1024 / 1024).toFixed(2), inputUri }));
475:     let attempt = 0;
476:     while (true) {
477:       try {
478:         await uploadBufferToS3(bucket, inputKey, buffer, mimeType);
479:         console.log(JSON.stringify({ jobId, stage: "OCR", event: "s3_upload_ok", kind }));
480:         break;
481:       } catch (e: any) {
482:         attempt++;
483:         if (attempt >= maxRetries || e.code === OcrErrorCodes.CONFIGURATION_ERROR || e.code === OcrErrorCodes.AUTH_ERROR) throw e;
484:         const delay = Math.pow(2, attempt) * 500;
485:         console.warn(JSON.stringify({ jobId, stage: "OCR", event: "s3_upload_retry", kind, attempt, delay }));
486:         await new Promise((r) => setTimeout(r, delay));
487:       }
488:     }
489: 
490:     // Submit Textract async analysis
491:     console.log(JSON.stringify({ jobId, stage: "OCR", event: "textract_submit_start", kind, pageCount: pages.length }));
492:     let operationId: string;
493:     let outUri: string;
494:     attempt = 0;
495:     while (true) {
496:       try {
497:         const res = await provider.submitDocument({ jobId, documentId: doc.id, kind, s3Bucket: bucket, s3Key: inputKey, mimeType: "application/pdf", pageCount: pages.length });
498:         operationId = res.operationId;
499:         outUri = res.outputUri;
500:         console.log(JSON.stringify({ jobId, stage: "OCR", event: "textract_submit_ok", kind, operationId: operationId.slice(0, 40) }));
501:         break;
502:       } catch (e: any) {
503:         attempt++;
504:         const retryable = e.retryable !== false && e.code !== OcrErrorCodes.AUTH_ERROR && e.code !== OcrErrorCodes.CONFIGURATION_ERROR;
505:         if (!retryable || attempt >= maxRetries) throw new AppError(e.code || ErrorCodes.OCR_SUBMISSION_FAILED, `OCR submission failed for ${kind}: ${e.message}`);
506:         const delay = Math.pow(2, attempt) * 1000;
507:         console.warn(JSON.stringify({ jobId, stage: "OCR", event: "textract_submit_retry", kind, attempt, delay }));
508:         await new Promise((r) => setTimeout(r, delay));
509:       }
510:     }
511: 
512:     // Persist operation metadata for polling visibility and idempotency
513:     await jobStore.update(jobId, {
514:       ocrOperationId: operationId!,
515:       ocrOutputUri: outUri!,
516:       ocrInputUri: inputUri,
517:       ocrStartedAt: new Date().toISOString(),
518:       ocrAttempt: ((await jobStore.get(jobId))?.ocrAttempt || 0) + 1,
519:       ocrPageCount: pages.length,
520:     } as any);
521: 
522:     // Poll operation
523:     const start = Date.now();
524:     while (true) {
525:       if (Date.now() - start > timeoutMs) {
526:         throw new AppError(ErrorCodes.OCR_OPERATION_TIMEOUT, `OCR operation timed out for ${kind} after ${timeoutMs / 1000}s (operation ${operationId!.slice(0, 30)})`);
527:       }
528:       let status: any;
529:       try {
530:         status = await provider.getOperationStatus(operationId!);
531:       } catch (e: any) {
532:         console.warn(JSON.stringify({ jobId, stage: "OCR", event: "poll_error", kind, msg: e.message?.slice(0, 100) }));
533:         await new Promise((r) => setTimeout(r, pollMs));
534:         continue;
535:       }
536:       if (status.status === "DONE") {
537:         console.log(JSON.stringify({ jobId, stage: "OCR", event: "operation_done", kind, elapsed: Date.now() - start }));
538:         break;
539:       }
540:       if (status.status === "FAILED") {
541:         throw new AppError(ErrorCodes.OCR_OPERATION_FAILED, `OCR operation failed for ${kind}: ${status.error?.message || "unknown"}`);
542:       }
543:       await new Promise((r) => setTimeout(r, pollMs));
544:     }
545: 
546:     // Download and parse output JSON
547:     console.log(JSON.stringify({ jobId, stage: "OCR", event: "parse_start", kind, outputUri: outUri! }));
548:     let docResult: OcrDocumentResult;
549:     attempt = 0;
550:     while (true) {
551:       try {
552:         docResult = await provider.getOperationResult(operationId!, outUri!);
553:         break;
554:       } catch (e: any) {
555:         attempt++;
556:         if (attempt >= maxRetries || e.code === OcrErrorCodes.OUTPUT_PARSE_FAILED || e.code === OcrErrorCodes.OUTPUT_MISSING) throw new AppError(e.code || ErrorCodes.OCR_OUTPUT_PARSE_FAILED, `OCR output parse failed for ${kind}: ${e.message}`);
557:         const delay = Math.pow(2, attempt) * 800;
558:         console.warn(JSON.stringify({ jobId, stage: "OCR", event: "parse_retry", kind, attempt }));
559:         await new Promise((r) => setTimeout(r, delay));
560:       }
561:     }
562:     docResult!.jobId = jobId;
563:     docResult!.documentId = doc.id;
564:     docResult!.kind = kind;
565:     // Ensure pages sorted and pageNumbers correct
566:     docResult!.pages.sort((a, b) => a.pageNumber - b.pageNumber);
567:     console.log(JSON.stringify({ jobId, stage: "OCR", event: "parse_ok", kind, pages: docResult!.pages.length }));
568:     // Debug dump: exact OCR format to file for inspection (log purpose, never secrets)
569:     try {
570:       const debugDir = path.join(os.tmpdir(), "veda-ai", safeJob, "debug");
571:       await fs.mkdir(debugDir, { recursive: true });
572:       const dumpPath = path.join(debugDir, `${kind}-textract.json`);
573:       await fs.writeFile(dumpPath, JSON.stringify(docResult, null, 2), "utf-8");
574:       console.log(JSON.stringify({ jobId, stage: "OCR", event: "debug_dump", kind, path: dumpPath, pages: docResult!.pages.length, totalLines: docResult!.pages.reduce((a, p) => a + p.lines.length, 0) }));
575:       // Also dump to project artifacts for easier dev access (gitignored)
576:       const artDir = path.join(process.cwd(), "artifacts", "ocr-debug", safeJob);
577:       await fs.mkdir(artDir, { recursive: true });
578:       await fs.writeFile(path.join(artDir, `${kind}-textract.json`), JSON.stringify(docResult, null, 2), "utf-8");
579:     } catch {}
580:     return docResult!;
581:   }
582: 
583:   // Process questionPaper and answerSheet — sequential to bound memory, or parallel? Sequential is safer for 38MB
584:   const qpOcr = await processOneDoc(qpDoc, qpPages, "questionPaper");
585:   const asOcr = await processOneDoc(asDoc, asPages, "answerSheet");
586: 
587:   const out = { qpOcr, asOcr };
588:   ocrResultStore.set(jobId, out);
589:   await jobStore.update(jobId, { ocrCompletedAt: new Date().toISOString() } as any);
590:   return out;
591: }
592: 
593: async function visionStage(jobId: string, ocrData?: { qpOcr?: OcrDocumentResult; asOcr?: OcrDocumentResult }): Promise<{ qpVision?: VisionDocumentAnalysis; asVision?: VisionDocumentAnalysis } | null> {
594:   const cfg = getConfig() as any;
595:   const visionProviderName = cfg.VISION_PROVIDER || "auto";
596:   if (visionProviderName === "disabled") {
597:     console.log(JSON.stringify({ jobId, stage: "VISION", event: "skipped_disabled" }));
598:     return null;
599:   }
600:   // Cache reuse
601:   const cached = visionResultStore.get(jobId);
602:   if (cached) {
603:     console.log(JSON.stringify({ jobId, stage: "VISION", event: "reuse_cached" }));
604:     return cached;
605:   }
606:   // Routing: decide per document
607:   const qpOcr = ocrData?.qpOcr;
608:   const asOcr = ocrData?.asOcr;
609:   const qpDecision = qpOcr ? shouldInvokeVision(qpOcr) : { useVision: false, reason: "no ocr", confidence: 0, estimatedDifficulty: "easy" as const };
610:   const asDecision = asOcr ? shouldInvokeVision(asOcr) : { useVision: false, reason: "no ocr", confidence: 0, estimatedDifficulty: "easy" as const };
611:   const useVision = qpDecision.useVision || asDecision.useVision;
612:   // If mock OCR, skip vision (deterministic fallback is sufficient for tests)
613:   if (cfg.OCR_PROVIDER === "mock") {
614:     console.log(JSON.stringify({ jobId, stage: "VISION", event: "skipped_mock_ocr", qpDecision, asDecision }));
615:     return null;
616:   }
617:   if (!useVision && visionProviderName === "auto") {
618:     console.log(JSON.stringify({ jobId, stage: "VISION", event: "skipped_routed_easy", qpDecision, asDecision }));
619:     return null;
620:   }
621:   const provider = getVisionProvider();
622:   if (!provider) {
623:     console.log(JSON.stringify({ jobId, stage: "VISION", event: "skipped_no_provider", provider: visionProviderName }));
624:     return null;
625:   }
626: 
627:   const docs = await documentStore.getByJob(jobId);
628:   const qpDoc = docs.find((d) => d.kind === "questionPaper");
629:   const asDoc = docs.find((d) => d.kind === "answerSheet");
630:   if (!qpDoc || !asDoc) return null;
631: 
632:   const maxPages = cfg.VISION_MAX_PAGES || 3;
633:   const timeoutMs = cfg.VISION_TIMEOUT_MS || 30000;
634: 
635:   async function processDoc(kind: "questionPaper" | "answerSheet", ocr: OcrDocumentResult | undefined): Promise<VisionDocumentAnalysis | undefined> {
636:     if (!ocr || !provider) return undefined;
637:     try {
638:       const fileId = kind === "questionPaper" ? (await jobStore.get(jobId))!.questionPaperFileId! : (await jobStore.get(jobId))!.answerSheetFileId!;
639:       const buffer = await fileStorage.read(jobId, fileId);
640:       const rendered = await renderPdfPagesForVision(buffer, ocr.pages.slice(0, maxPages).map((p) => p.pageNumber), maxPages);
641:       // If no real image rendered (canvas not available), skip vision to avoid timeout on PDF placeholder
642:       const hasRealImage = rendered.some((r) => r.mimeType !== "application/pdf" && !r.imageBase64.startsWith("JVBER"));
643:       if (!hasRealImage) {
644:         console.log(JSON.stringify({ jobId, stage: "VISION", event: "skipped_no_image", kind, reason: "canvas not available, no PNG rendered", pages: rendered.length }));
645:         return undefined;
646:       }
647:       const visionInputPages = rendered.map((r) => ({
648:         pageId: `page-${r.pageNumber}`,
649:         pageNumber: r.pageNumber,
650:         imageBase64: r.imageBase64,
651:         mimeType: r.mimeType as any,
652:         width: r.width,
653:         height: r.height,
654:       }));
655:       const ocrSample = ocr.pages.slice(0, 2).map((p) => p.text.slice(0, 1000)).join("\n").slice(0, 1500);
656:       const payloadKb = Math.round(visionInputPages.reduce((a, p) => a + p.imageBase64.length, 0) * 0.75 / 1024);
657:       console.log(JSON.stringify({ jobId, stage: "VISION", event: "analyze_start", kind, pages: visionInputPages.length, provider: visionProviderName, model: (getConfig() as any).OPENROUTER_MODEL || (getConfig() as any).VISION_MODEL, payloadKb, timeoutMs }));
658:       const result = await provider.analyzeDocumentStructure({ pages: visionInputPages, ocrTextSample: ocrSample });
659:       console.log(JSON.stringify({ jobId, stage: "VISION", event: "analyze_ok", kind, visionPages: result.pages.length }));
660:       return result;
661:     } catch (e: any) {
662:       // Retry with smaller batch on timeout
663:       if (e.code === "ETIMEDOUT" || String(e.message).includes("timed out")) {
664:         console.warn(JSON.stringify({ jobId, stage: "VISION", event: "analyze_timeout_retry", kind, msg: e.message?.slice(0, 200) }));
665:         if (visionProviderName === "auto") return undefined;
666:       }
667:       console.warn(JSON.stringify({ jobId, stage: "VISION", event: "analyze_failed_fallback", kind, msg: e.message?.slice(0, 300), code: e.code, status: e.status }));
668:       if (visionProviderName === "auto") return undefined;
669:       throw new AppError(e.code || ErrorCodes.MODEL_UNAVAILABLE, `Vision analysis failed for ${kind}: ${e.message}`);
670:     }
671:   }
672: 
673:   const qpVision = await processDoc("questionPaper", qpOcr);
674:   const asVision = await processDoc("answerSheet", asOcr);
675: 
676:   const out: any = {};
677:   if (qpVision) out.qpVision = qpVision;
678:   if (asVision) out.asVision = asVision;
679:   if (Object.keys(out).length === 0) {
680:     console.log(JSON.stringify({ jobId, stage: "VISION", event: "no_vision_results" }));
681:     return null;
682:   }
683:   visionResultStore.set(jobId, out);
684:   // Debug dump
685:   try {
686:     const safe = jobId.replace(/[^a-zA-Z0-9-]/g, "");
687:     const debugDir = path.join(os.tmpdir(), "veda-ai", safe, "debug");
688:     await fs.mkdir(debugDir, { recursive: true });
689:     if (qpVision) await fs.writeFile(path.join(debugDir, "vision-qp.json"), JSON.stringify(qpVision, null, 2), "utf-8");
690:     if (asVision) await fs.writeFile(path.join(debugDir, "vision-as.json"), JSON.stringify(asVision, null, 2), "utf-8");
691:     const artDir = path.join(process.cwd(), "artifacts", "debug", safe);
692:     await fs.mkdir(artDir, { recursive: true });
693:     if (qpVision) await fs.writeFile(path.join(artDir, "vision-qp.json"), JSON.stringify(qpVision, null, 2), "utf-8");
694:     if (asVision) await fs.writeFile(path.join(artDir, "vision-as.json"), JSON.stringify(asVision, null, 2), "utf-8");
695:   } catch {}
696:   return out;
697: }
698: 
699: async function fusionStage(jobId: string, ocrData?: { qpOcr?: OcrDocumentResult; asOcr?: OcrDocumentResult }, visionData?: { qpVision?: VisionDocumentAnalysis; asVision?: VisionDocumentAnalysis } | null): Promise<any> {
700:   const qpOcr = ocrData?.qpOcr;
701:   const asOcr = ocrData?.asOcr;
702:   if (!qpOcr || !asOcr) return null;
703:   const docs = await documentStore.getByJob(jobId);
704:   const qpDoc = docs.find((d) => d.kind === "questionPaper");
705:   const asDoc = docs.find((d) => d.kind === "answerSheet");
706:   const qpPages = qpDoc ? await pageStoreApi.getByDocument(qpDoc.id) : [];
707:   const asPages = asDoc ? await pageStoreApi.getByDocument(asDoc.id) : [];
708:   const qpVisionState = visionData?.qpVision ? "VISION_AVAILABLE" : visionData === null ? "VISION_FAILED" : "VISION_NOT_INVOKED";
709:   const asVisionState = visionData?.asVision ? "VISION_AVAILABLE" : visionData === null ? "VISION_FAILED" : "VISION_NOT_INVOKED";
710:   const qpFusion = fuseDocuments(qpOcr, qpPages, visionData?.qpVision || null, jobId);
711:   const asFusion = fuseDocuments(asOcr, asPages, visionData?.asVision || null, jobId);
712:   // Expose structured vision state
713:   (qpFusion as any).visionState = qpVisionState;
714:   (asFusion as any).visionState = asVisionState;
715:   (qpFusion as any).visionReason = !visionData?.qpVision ? (visionData === null ? "vision failed or timed out" : "routing skipped") : "ok";
716:   (asFusion as any).visionReason = !visionData?.asVision ? (visionData === null ? "vision failed or timed out" : "routing skipped") : "ok";
717:   const out = { qpFusion, asFusion, visionState: { qp: qpVisionState, as: asVisionState } };
718:   try {
719:     const safe = jobId.replace(/[^a-zA-Z0-9-]/g, "");
720:     const debugDir = path.join(os.tmpdir(), "veda-ai", safe, "debug");
721:     await fs.mkdir(debugDir, { recursive: true });
722:     await fs.writeFile(path.join(debugDir, "fusion-qp.json"), JSON.stringify(qpFusion, null, 2), "utf-8");
723:     await fs.writeFile(path.join(debugDir, "fusion-as.json"), JSON.stringify(asFusion, null, 2), "utf-8");
724:     await fs.writeFile(path.join(debugDir, "canonical-qp.json"), JSON.stringify(qpFusion.canonical, null, 2), "utf-8");
725:     await fs.writeFile(path.join(debugDir, "canonical-as.json"), JSON.stringify(asFusion.canonical, null, 2), "utf-8");
726:     const artDir = path.join(process.cwd(), "artifacts", "debug", safe);
727:     await fs.mkdir(artDir, { recursive: true });
728:     await fs.writeFile(path.join(artDir, "fusion-qp.json"), JSON.stringify(qpFusion, null, 2), "utf-8");
729:     await fs.writeFile(path.join(artDir, "fusion-as.json"), JSON.stringify(asFusion, null, 2), "utf-8");
730:   } catch {}
731:   console.log(JSON.stringify({ jobId, stage: "FUSION", event: "completed", qpVisionState, asVisionState, qpWarnings: qpFusion.warnings.length, asWarnings: asFusion.warnings.length, qpHints: qpFusion.questionHintsFromVision.length, asHints: asFusion.answerHintsFromVision.length }));
732:   return out;
733: }
734: 
735: async function extracting(jobId: string, prep: any, ocrData?: { qpOcr?: OcrDocumentResult; asOcr?: OcrDocumentResult }, visionData?: any, fusionData?: any) {
736:   const job = await jobStore.get(jobId);
737:   if (!job) throw new AppError(ErrorCodes.JOB_NOT_FOUND, "Job not found");
738:   const docs = await documentStore.getByJob(jobId);
739:   const qpDoc = docs.find((d) => d.kind === "questionPaper");
740:   const asDoc = docs.find((d) => d.kind === "answerSheet");
741:   if (!qpDoc || !asDoc) throw new AppError(ErrorCodes.VALIDATION_FAILED, "Missing docs");
742: 
743:   const qpPages = await pageStoreApi.getByDocument(qpDoc.id);
744:   const asPages = await pageStoreApi.getByDocument(asDoc.id);
745: 
746:   const qpOcr = ocrData?.qpOcr || ocrResultStore.get(jobId)?.qpOcr;
747:   const asOcr = ocrData?.asOcr || ocrResultStore.get(jobId)?.asOcr;
748:   if (!qpOcr || !asOcr) throw new AppError(ErrorCodes.OCR_FAILED, "OCR results missing for deterministic extraction");
749: 
750:   // Document role validation: ensure answerSheet is not a marking scheme
751:   try {
752:     const { classifyDocument } = await import("@/lib/documents/classifier");
753:     const qpRole = classifyDocument(qpDoc.originalName, qpOcr, qpDoc.mime);
754:     const asRole = classifyDocument(asDoc.originalName, asOcr, asDoc.mime);
755:     console.log(JSON.stringify({ jobId, stage: "EXTRACTING", event: "document_role", qpRole: qpRole.role, qpEvidence: qpRole.evidence.slice(0,2), asRole: asRole.role, asEvidence: asRole.evidence.slice(0,2) }));
756:     if (asRole.isMarkingScheme) {
757:       console.warn(JSON.stringify({ jobId, stage: "EXTRACTING", event: "marking_scheme_detected", asDoc: asDoc.originalName, evidence: asRole.evidence }));
758:       // Do not fail hard, but mark for review — the viewer will still show the file, but mapping will be REVIEW_REQUIRED
759:       // We could also throw to force re-upload, but for now we allow processing with warning
760:     }
761:     // Validate that questionPaper is not an answer sheet and vice versa
762:     if (qpRole.role === "MARKING_SCHEME" && qpDoc.kind === "questionPaper") {
763:       console.warn(JSON.stringify({ jobId, stage: "EXTRACTING", event: "qp_is_marking_scheme", qpDoc: qpDoc.originalName }));
764:     }
765:   } catch {}
766: 
767:   const t0 = Date.now();
768:   console.log(JSON.stringify({ jobId, stage: "EXTRACTING", event: "deterministic_start", qpPages: qpOcr.pages.length, asPages: asOcr.pages.length }));
769: 
770:   // Deterministic parsers — Textract is source of truth, no Vision LLM
771:   let parsedQuestions, segmentedAnswers;
772:   const cfgDet = getConfig() as any;
773:   try {
774:     parsedQuestions = parseQuestionsFromTextract(qpOcr, qpPages);
775:     console.log(JSON.stringify({ jobId, stage: "EXTRACTING", event: "questions_parsed", duration: Date.now() - t0, qCount: parsedQuestions.length }));
776:     if (parsedQuestions.length === 0) {
777:       // Test-mode fallback: mock OCR generates generic text without labels; synthesize for test determinism
778:       if (cfgDet.OCR_PROVIDER === "mock") {
779:         console.warn(JSON.stringify({ jobId, stage: "EXTRACTING", event: "mock_questions_fallback" }));
780:         // Synthesize 1 question from mock text so pipeline doesn't fail in unit/integration tests
781:         parsedQuestions = [
782:           {
783:             rawNumber: "1",
784:             normalizedNumber: "1",
785:             displayNumber: "1",
786:             text: qpOcr.pages[0]?.text?.slice(0, 100) || "Mock question",
787:             rawText: qpOcr.pages[0]?.text?.slice(0, 100) || "Mock question",
788:             pageNumbers: [qpPages[0]?.pageNumber || 1],
789:             bboxesByPage: new Map([[qpPages[0]?.pageNumber || 1, [{ x: 0.05, y: 0.1, width: 0.9, height: 0.05 }]]]),
790:             confidence: 0.9,
791:             depth: 0,
792:             partType: "QUESTION" as const,
793:             parent: undefined,
794:             options: [],
795:           },
796:         ];
797:       } else {
798:         throw new AppError(ErrorCodes.QUESTION_EXTRACTION_FAILED, "No questions detected from Textract. Check question paper clarity or increase OCR quality.");
799:       }
800:     }
801:   } catch (e: any) {
802:     console.error(JSON.stringify({ jobId, stage: "EXTRACTING", event: "questions_failed", duration: Date.now() - t0, msg: e.message?.slice(0, 200) }));
803:     throw new AppError(e.code || ErrorCodes.QUESTION_EXTRACTION_FAILED, `Question extraction failed: ${e.message}`);
804:   }
805: 
806:   // Structure validator with bounded repair loop (handles both errors and repairable warnings like duplicate regressions)
807:   let repairedQuestions = [...parsedQuestions];
808:   let validation = validateQuestionStructure(repairedQuestions);
809:   let repairIteration = 0;
810:   const maxRepairIterations = 3;
811:   const repairableWarningCodes = new Set(["INSTRUCTION_AS_QUESTION","SECTION_AS_QUESTION","OPTION_AS_QUESTION","WORD_LIMIT_AS_QUESTION","NUMBER_REGRESSION","DUPLICATE_NUMBER"]);
812:   const hasRepairable = () => !validation.valid || validation.warnings.some(w=>repairableWarningCodes.has(w.code));
813:   while (hasRepairable() && repairIteration < maxRepairIterations) {
814:     repairIteration++;
815:     const beforeCount = repairedQuestions.length;
816:     // Repair: remove questions that are clearly instruction/section/option leakage (matches validator's patterns)
817:     const toKeep: typeof repairedQuestions = [];
818:     for (const q of repairedQuestions) {
819:       const isInstructionLeak = /question paper contains|All Questions are compulsory|divided into.*Sections|Use of calculators is not allowed|Time:\s*3 hours|Time allowed|Please check that this question|Candidates must write the Code|question paper will be distributed|students will read the|write any answer on the answer/i.test(q.text);
820:       const isSectionLeak = /^\s*Section\s+[A-Z]\b/i.test(q.rawNumber) || /^\s*Section\s+[A-Z]\b/i.test(q.text.slice(0, 30));
821:       const isOptionLeak = q.depth === 0 && /^\([a-d]\)$/i.test(q.normalizedNumber) && q.text.length < 80;
822:       const isWordLimitLeak = q.depth === 0 && /^\d+$/.test(q.normalizedNumber) && /words/i.test(q.text) && q.text.length < 60 && [50,60,80,90].includes(parseInt(q.normalizedNumber,10));
823:       if (isInstructionLeak || isSectionLeak || isOptionLeak || isWordLimitLeak) {
824:         console.warn(JSON.stringify({ jobId, stage: "EXTRACTING", event: "repair_remove_leak", rawNumber: q.rawNumber, normalized: q.normalizedNumber, text: q.text.slice(0, 60) }));
825:         continue;
826:       }
827:       toKeep.push(q);
828:     }
829:     // Deduplicate top-level duplicates that cause regression: keep first occurrence with longest text
830:     const seen = new Map<string, typeof repairedQuestions[0]>();
831:     const deduped: typeof repairedQuestions = [];
832:     for (const q of toKeep) {
833:       const norm = q.normalizedNumber;
834:       if (q.depth === 0 && seen.has(norm)) {
835:         const existing = seen.get(norm)!;
836:         // Keep the one with longer text / more pages
837:         if (q.text.length > existing.text.length) {
838:           const idx = deduped.findIndex((x) => x.normalizedNumber === norm);
839:           if (idx !== -1) deduped[idx] = q;
840:           seen.set(norm, q);
841:           console.warn(JSON.stringify({ jobId, stage: "EXTRACTING", event: "repair_dedup_replace", normalized: norm, kept: q.text.slice(0, 40) }));
842:         } else {
843:           console.warn(JSON.stringify({ jobId, stage: "EXTRACTING", event: "repair_dedup_skip", normalized: norm, skipped: q.text.slice(0, 40) }));
844:         }
845:         continue;
846:       }
847:       seen.set(norm, q);
848:       deduped.push(q);
849:     }
850:     repairedQuestions = deduped;
851:     validation = validateQuestionStructure(repairedQuestions);
852:     console.log(JSON.stringify({ jobId, stage: "EXTRACTING", event: "repair_iteration", iteration: repairIteration, beforeCount, afterCount: repairedQuestions.length, valid: validation.valid, errors: validation.errors.map((e) => e.code) }));
853:     if (repairedQuestions.length === beforeCount) break; // No progress
854:   }
855:   if (!validation.valid) {
856:     const msg = validation.errors.map((er) => er.message).join("; ").slice(0, 500);
857:     console.error(JSON.stringify({ jobId, stage: "EXTRACTING", event: "structure_validation_failed", errors: validation.errors, warnings: validation.warnings, repairIterations: repairIteration }));
858:     throw new AppError(ErrorCodes.VALIDATION_FAILED, `STRUCTURE_VALIDATION_FAILED: ${msg}`);
859:   }
860:   if (validation.warnings.length > 0) {
861:     console.warn(JSON.stringify({ jobId, stage: "EXTRACTING", event: "structure_warnings", warnings: validation.warnings, topLevel: validation.topLevelCount, repairIterations: repairIteration }));
862:   }
863:   // Use repaired questions
864:   parsedQuestions = repairedQuestions;
865:   // Log fusion grounding warnings alongside
866:   if (fusionData?.qpFusion?.warnings?.length) {
867:     console.warn(JSON.stringify({ jobId, stage: "EXTRACTING", event: "fusion_warnings_qp", warnings: fusionData.qpFusion.warnings }));
868:   }
869: 
870:   const t1 = Date.now();
871:   try {
872:     segmentedAnswers = segmentAnswersFromTextract(asOcr, asPages);
873:     console.log(JSON.stringify({ jobId, stage: "EXTRACTING", event: "answers_segmented", duration: Date.now() - t1, aCount: segmentedAnswers.length }));
874:     if (segmentedAnswers.length === 0) {
875:       console.warn(JSON.stringify({ jobId, stage: "EXTRACTING", event: "no_answers_detected", msg: "Answer sheet appears empty or no labels found; will mark all questions UNANSWERED" }));
876:     }
877:   } catch (e: any) {
878:     console.error(JSON.stringify({ jobId, stage: "EXTRACTING", event: "answers_failed", duration: Date.now() - t1, msg: e.message?.slice(0, 200) }));
879:     throw new AppError(e.code || ErrorCodes.ANSWER_EXTRACTION_FAILED, `Answer segmentation failed: ${e.message}`);
880:   }
881: 
882:   // Convert deterministic output to shape expected by structuring (preserve raw Textract geometry)
883:   const qpExtracted = {
884:     questions: parsedQuestions.map((q) => ({
885:       rawNumber: q.rawNumber,
886:       normalizedNumber: q.normalizedNumber,
887:       displayNumber: (q as any).displayNumber || q.rawNumber,
888:       text: q.text,
889:       rawText: q.rawText,
890:       pageRefs: q.pageNumbers.map((pn) => qpPages.find((p) => p.pageNumber === pn)?.id || `page-${pn}`),
891:       sourceRegions: Array.from(q.bboxesByPage.entries()).flatMap(([pn, boxes]) =>
892:         boxes.map((b) => ({
893:           pageId: qpPages.find((p) => p.pageNumber === pn)?.id || `page-${pn}`,
894:           box: [b.x, b.y, b.width, b.height] as [number, number, number, number],
895:         }))
896:       ),
897:       parentNumber: q.parent,
898:       partType: q.partType,
899:       pageNumbers: (q as any).pageNumbers || [],
900:       options: (q as any).options || [],
901:       marks: q.marks,
902:       confidence: q.confidence,
903:       evidence: [`Textract deterministic: ${q.rawNumber}`],
904:     })),
905:   };
906: 
907:   const asDetected = {
908:     regions: segmentedAnswers.map((a, idx) => ({
909:       pageId: a.pageNumbers.length > 0 ? asPages.find((p) => p.pageNumber === a.pageNumbers[0])?.id || asPages[0]?.id : asPages[0]?.id,
910:       boxes: Array.from(a.bboxesByPage.values()).flat().map((b) => [b.x, b.y, b.width, b.height] as [number, number, number, number]),
911:       rawText: a.text,
912:       questionLabel: a.questionLabel || null,
913:       labelConfidence: a.questionLabel ? 0.95 : 0.2,
914:       visualConfidence: 0.6,
915:       ocrConfidence: a.confidence,
916:       orderIndex: a.orderIndex,
917:       // Preserve multi-page bboxes via extra field for structuring
918:       _segmented: a,
919:     })),
920:   };
921: 
922:   // Diagnostic dumps for audit
923:   try {
924:     const safe = jobId.replace(/[^a-zA-Z0-9-]/g, "");
925:     const debugDir = path.join(os.tmpdir(), "veda-ai", safe, "debug");
926:     await fs.mkdir(debugDir, { recursive: true });
927:     await fs.writeFile(path.join(debugDir, "question-candidates.json"), JSON.stringify(parsedQuestions.map((q) => ({ ...q, bboxesByPage: Array.from((q as any).bboxesByPage?.entries?.() || []) })), null, 2), "utf-8");
928:     await fs.writeFile(path.join(debugDir, "answer-regions.json"), JSON.stringify(segmentedAnswers.map((a) => ({ ...a, bboxesByPage: Array.from((a as any).bboxesByPage?.entries?.() || []) })), null, 2), "utf-8");
929:     const artDir = path.join(process.cwd(), "artifacts", "debug", safe);
930:     await fs.mkdir(artDir, { recursive: true });
931:     await fs.writeFile(path.join(artDir, "question-candidates.json"), JSON.stringify(parsedQuestions.map((q) => ({ ...q, bboxesByPage: Array.from((q as any).bboxesByPage?.entries?.() || []) })), null, 2), "utf-8");
932:   } catch {}
933:   return { qpDoc, asDoc, qpPages, asPages, qpExtracted, asDetected, qpOcr, asOcr, parsedQuestions, segmentedAnswers, visionData, fusionData };
934: }
935: 
936: async function structuring(jobId: string, extraction: any) {
937:   const { qpDoc, asDoc, qpPages, asPages, qpExtracted, asDetected } = extraction;
938: 
939:   const questions: QuestionNode[] = [];
940:   for (let idx = 0; idx < qpExtracted.questions.length; idx++) {
941:     const q = qpExtracted.questions[idx];
942:     const parsed = normalizeNumber(q.rawNumber || q.normalizedNumber || String(idx + 1));
943:     let parentId: string | undefined;
944:     if (q.parentNumber) {
945:       const parent = questions.find((qq) => qq.normalizedNumber === q.parentNumber);
946:       parentId = parent?.id;
947:     } else if (parsed.parent) {
948:       const parent = questions.find((qq) => qq.normalizedNumber === parsed.parent);
949:       parentId = parent?.id;
950:     }
951:     const rawPageRefs = q.pageRefs && q.pageRefs.length > 0 ? q.pageRefs : [qpPages[0]?.id].filter(Boolean);
952:     const pageRefs = rawPageRefs.map((pr: string) => resolvePageId(pr, qpPages));
953:     const sourceRegions = (q.sourceRegions || []).map((r: any) => ({
954:       x: r.box[0],
955:       y: r.box[1],
956:       width: r.box[2],
957:       height: r.box[3],
958:     }));
959:     if (sourceRegions.length === 0) {
960:       sourceRegions.push({ x: 0.05, y: 0.1 + idx * 0.05, width: 0.9, height: 0.04 });
961:     }
962:     const node: QuestionNode = {
963:       id: generateId(),
964:       sourceDocumentId: qpDoc.id,
965:       pageRefs,
966:       sourceRegions,
967:       rawNumber: q.rawNumber,
968:       normalizedNumber: q.normalizedNumber || parsed.normalized,
969:       displayNumber: q.displayNumber || q.normalizedNumber || q.rawNumber,
970:       text: q.text,
971:       rawText: q.rawText || q.text,
972:       normalizedText: q.text.trim(),
973:       parentQuestionId: parentId,
974:       partType: (q.partType as any) || parsed.partType,
975:       kind: q.depth === 0 ? "TOP_LEVEL_QUESTION" : q.depth === 1 && q.partType === "PART" ? "SUBQUESTION" : q.partType === "OPTION" ? "OPTION" : "SUBQUESTION",
976:       orderIndex: idx,
977:       depth: parsed.depth,
978:       marks: q.marks || undefined,
979:       confidence: q.confidence,
980:       evidence: (q.evidence || []).map((e: string) => ({
981:         type: "OCR_CONFIDENCE" as const,
982:         source: "extractStructure",
983:         score: q.confidence,
984:         explanation: e,
985:         reliability: 0.6,
986:       })),
987:       options: (q.options || []).map((o: any) => ({
988:         label: o.label,
989:         text: o.text,
990:         rawText: o.rawText,
991:         bbox: o.bbox,
992:       })),
993:       children: [],
994:       sourcePageNumbers: q.pageNumbers || [],
995:     };
996:     // Wire child to parent's children array for tree
997:     if (parentId) {

(Output capped at 50 KB. Showing lines 1-997. Use offset=998 to continue.)
</content>
```

---

## Assistant (Build · Muse Spark 1.2 Free · 2.9s)

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\src\\lib\\jobs\\runner.ts",
  "offset": 998
}
```

**Output:**
```
<path>E:\vedaAi\src\lib\jobs\runner.ts</path>
<type>file</type>
<content>
998:       const parentNode = questions.find((qq) => qq.id === parentId);
999:       if (parentNode) {
1000:         if (!parentNode.children) parentNode.children = [];
1001:         parentNode.children.push(node.id);
1002:       }
1003:     }
1004:     questions.push(node);
1005:   }
1006: 
1007:   const answerRegions: AnswerRegion[] = [];
1008:   for (let idx = 0; idx < asDetected.regions.length; idx++) {
1009:     const r: any = asDetected.regions[idx];
1010:     // Deterministic path: r._segmented contains per-page bboxes
1011:     if (r._segmented && r._segmented.bboxesByPage) {
1012:       const seg = r._segmented;
1013:       let subIdx = 0;
1014:       for (const [pn, boxesArr] of seg.bboxesByPage.entries()) {
1015:         const boxes = (boxesArr as any[]).map((b: any) => ({ x: b.x, y: b.y, width: b.width, height: b.height }));
1016:         const pageIdForPn = asPages.find((p: any) => p.pageNumber === pn)?.id || resolvePageId(r.pageId, asPages);
1017:         const region: AnswerRegion = {
1018:           id: generateId(),
1019:           documentId: asDoc.id,
1020:           pageId: pageIdForPn,
1021:           regionType: r.visualConfidence && r.visualConfidence > 0.6 && !r.rawText ? "DIAGRAM" : "HANDWRITING",
1022:           rawText: subIdx === 0 ? r.rawText || "" : "",
1023:           normalizedText: subIdx === 0 ? (r.rawText || "").trim() : "",
1024:           sourceBoxes: boxes,
1025:           normalizedBoxes: boxes,
1026:           questionLabel: r.questionLabel || undefined,
1027:           labelConfidence: r.labelConfidence,
1028:           ocrConfidence: r.ocrConfidence,
1029:           visualConfidence: r.visualConfidence,
1030:           orderIndex: r.orderIndex ?? idx,
1031:           continuationGroupId: `seg-${idx}`,
1032:         };
1033:         answerRegions.push(region);
1034:         subIdx++;
1035:       }
1036:     } else {
1037:       const boxes = r.boxes.map((b: number[]) => ({
1038:         x: b[0],
1039:         y: b[1],
1040:         width: b[2],
1041:         height: b[3],
1042:       }));
1043:       const resolvedPageId = resolvePageId(r.pageId, asPages);
1044:       const region: AnswerRegion = {
1045:         id: generateId(),
1046:         documentId: asDoc.id,
1047:         pageId: resolvedPageId,
1048:         regionType: r.visualConfidence && r.visualConfidence > 0.6 && !r.rawText ? "DIAGRAM" : "HANDWRITING",
1049:         rawText: r.rawText || "",
1050:         normalizedText: (r.rawText || "").trim(),
1051:         sourceBoxes: boxes,
1052:         normalizedBoxes: boxes,
1053:         questionLabel: r.questionLabel || undefined,
1054:         labelConfidence: r.labelConfidence,
1055:         ocrConfidence: r.ocrConfidence,
1056:         visualConfidence: r.visualConfidence,
1057:         orderIndex: r.orderIndex ?? idx,
1058:       };
1059:       answerRegions.push(region);
1060:     }
1061:   }
1062: 
1063:   const answerGroups: AnswerGroup[] = answerRegions.map((reg) => ({
1064:     id: generateId(),
1065:     documentId: asDoc.id,
1066:     regions: [reg],
1067:     primaryRegionId: reg.id,
1068:     normalizedText: reg.normalizedText,
1069:     mappedQuestionId: undefined,
1070:   }));
1071: 
1072:   const groupedByLabel = new Map<string, AnswerGroup>();
1073:   const finalGroups: AnswerGroup[] = [];
1074:   for (const g of answerGroups) {
1075:     const label = g.regions[0].questionLabel;
1076:     if (label && groupedByLabel.has(label)) {
1077:       const existing = groupedByLabel.get(label)!;
1078:       existing.regions.push(...g.regions);
1079:       existing.normalizedText += "\n" + g.normalizedText;
1080:     } else {
1081:       if (label) groupedByLabel.set(label, g);
1082:       finalGroups.push(g);
1083:     }
1084:   }
1085: 
1086:   // Multi-page continuation: merge untagged regions that follow a labeled answer on adjacent page
1087:   // Heuristic: untagged group whose orderIndex = labeled.orderIndex+1 and page is next page (or same page lower half -> continuation on next page top)
1088:   const pageNumForGroup = (g: AnswerGroup): number => {
1089:     const pageId = g.regions[0]?.pageId;
1090:     const pg = asPages.find((p: any) => p.id === pageId);
1091:     return pg ? pg.pageNumber : 999;
1092:   };
1093:   const mergedContinuationGroups: AnswerGroup[] = [];
1094:   for (let i = 0; i < finalGroups.length; i++) {
1095:     const g = finalGroups[i];
1096:     const label = g.regions[0]?.questionLabel;
1097:     if (!label) {
1098:       const prev = mergedContinuationGroups[mergedContinuationGroups.length - 1];
1099:       if (prev && prev.regions[0]?.questionLabel) {
1100:         const prevPage = pageNumForGroup(prev);
1101:         const curPage = pageNumForGroup(g);
1102:         // Merge if adjacent page or same page continuation (untagged trailing lines)
1103:         const isAdjacent = curPage === prevPage + 1 || (curPage === prevPage && g.regions[0].orderIndex === prev.regions[0].orderIndex + 1);
1104:         const prevHasContinuation = g.regions[0].continuationGroupId || isAdjacent;
1105:         if (isAdjacent || g.normalizedText.length < 200) {
1106:           // Treat as continuation of previous labeled answer
1107:           prev.regions.push(...g.regions);
1108:           prev.normalizedText += "\n" + g.normalizedText;
1109:           // Preserve continuation link
1110:           g.regions.forEach((r) => (r.continuationGroupId = prev.regions[0].continuationGroupId));
1111:           continue;
1112:         }
1113:       }
1114:     }
1115:     mergedContinuationGroups.push(g);
1116:   }
1117: 
1118:   return { questions, answerRegions, answerGroups: mergedContinuationGroups, qpDoc, asDoc, qpPages, asPages };
1119: }
1120: 
1121: function numericPart(s: string): string {
1122:   const m = s.match(/(\d+)/);
1123:   return m ? m[1] : s;
1124: }
1125: 
1126: async function matchingStage(jobId: string, structured: any) {
1127:   const { questions, answerGroups } = structured as { questions: QuestionNode[]; answerGroups: AnswerGroup[] };
1128:   const decisions: MappingDecision[] = [];
1129:   const usedAnswerGroups = new Set<string>();
1130:   for (const q of questions) {
1131:     const candidates: { answerGroupId: string; evidence: Evidence[]; score: number }[] = [];
1132:     for (const ag of answerGroups) {
1133:       const reg = ag.regions[0];
1134:       const evidence: Evidence[] = [];
1135:       if (reg.questionLabel) {
1136:         const parsedLabel = normalizeNumber(reg.questionLabel).normalized;
1137:         const labelStripped = parsedLabel.replace(/^[A-Z]+/, "");
1138:         const qStripped = q.normalizedNumber.replace(/^[A-Z]+/, "");
1139:         const labelNum = numericPart(parsedLabel);
1140:         const qNum = numericPart(q.normalizedNumber);
1141:         const labelPrefix = parsedLabel.replace(/[0-9].*/, "");
1142:         const qPrefix = q.normalizedNumber.replace(/[0-9].*/, "");
1143:         const isQPrefix = (p: string) => p === "" || p === "Q";
1144:         if (parsedLabel === q.normalizedNumber) {
1145:           evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.95, `Explicit label ${reg.questionLabel} matched ${q.normalizedNumber}`, 1.0));
1146:         } else if (labelStripped === qStripped) {
1147:           evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.92, `Label ${reg.questionLabel} matched ${q.normalizedNumber} (normalized)`, 0.95));
1148:         } else if (labelNum === qNum && isQPrefix(labelPrefix) && isQPrefix(qPrefix) && labelStripped === qStripped) {
1149:           evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.88, `Label ${reg.questionLabel} matched ${q.normalizedNumber} (prefix-insensitive)`, 0.9));
1150:         } else if (labelNum === qNum && (isQPrefix(labelPrefix) || isQPrefix(qPrefix)) && labelNum === qNum) {
1151:           if (labelStripped === qStripped) {
1152:             evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.88, `Label ${reg.questionLabel} matched ${q.normalizedNumber} (prefix-insensitive)`, 0.9));
1153:           } else {
1154:             evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.35, `Part mismatch ${reg.questionLabel} vs ${q.normalizedNumber}`, 0.7));
1155:           }
1156:         } else if (labelNum === qNum) {
1157:           evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.4, `Same number different prefix ${reg.questionLabel} vs ${q.normalizedNumber}`, 0.6));
1158:         } else if (parsedLabel && q.normalizedNumber.includes(parsedLabel)) {
1159:           evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.6, `Partial label ${reg.questionLabel} vs ${q.normalizedNumber}`, 0.7));
1160:         } else {
1161:           evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.1, `Label ${reg.questionLabel} does not match ${q.normalizedNumber}`, 0.9));
1162:         }
1163:       } else {
1164:         evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.2, "No explicit label", 0.4));
1165:       }
1166:       const qWords = new Set(q.normalizedText.toLowerCase().split(/\W+/).filter(Boolean));
1167:       const aWords = new Set(ag.normalizedText.toLowerCase().split(/\W+/).filter(Boolean));
1168:       let inter = 0;
1169:       for (const w of aWords) if (qWords.has(w)) inter++;
1170:       const union = qWords.size + aWords.size - inter;
1171:       const jaccard = union === 0 ? 0 : inter / union;
1172:       if (jaccard > 0.1) {
1173:         evidence.push(buildEvidence("SEMANTIC_SIMILARITY", "matching", Math.min(0.85, jaccard + 0.3), `Semantic overlap ${jaccard.toFixed(2)}`, 0.5));
1174:       } else {
1175:         evidence.push(buildEvidence("SEMANTIC_SIMILARITY", "matching", 0.15, "Low semantic overlap", 0.5));
1176:       }
1177:       const orderDiff = Math.abs(q.orderIndex - ag.regions[0].orderIndex);
1178:       const layoutScore = Math.max(0, 1 - orderDiff * 0.2);
1179:       evidence.push(buildEvidence("LAYOUT_CONTINUITY", "matching", layoutScore, `Order proximity diff ${orderDiff}`, 0.3));
1180:       const ocrConf = reg.ocrConfidence ?? 0.5;
1181:       evidence.push(buildEvidence("OCR_CONFIDENCE", "matching", ocrConf, `OCR confidence ${ocrConf}`, 0.4));
1182:       if (reg.regionType === "DIAGRAM" && reg.visualConfidence && reg.visualConfidence > 0.6) {
1183:         evidence.push(buildEvidence("VISUAL_EVIDENCE", "matching", reg.visualConfidence, "Diagram visual evidence", 0.6));
1184:       }
1185:       const score = aggregateScore(evidence);
1186:       candidates.push({ answerGroupId: ag.id, evidence, score });
1187:     }
1188:     const sorted = candidates.sort((a, b) => b.score - a.score);
1189:     const topCandidates = sorted.slice(0, 3).map((c) => ({ questionId: q.id, answerGroupId: c.answerGroupId, evidence: c.evidence, score: c.score }));
1190:     // Store all candidates for global conflict resolution (defer decision)
1191:     (q as any).__candidates = sorted;
1192:     (q as any).__topCandidates = topCandidates;
1193:   }
1194: 
1195:   // Global assignment: sort questions by best score desc, then greedy assign
1196:   const sortedQuestions = [...questions].sort((a: any, b: any) => {
1197:     const sa = (a.__candidates?.[0]?.score ?? 0);
1198:     const sb = (b.__candidates?.[0]?.score ?? 0);
1199:     return sb - sa;
1200:   });
1201: 
1202:   for (const q of sortedQuestions) {
1203:     const topCandidates = (q as any).__topCandidates as any[];
1204:     const sorted = (q as any).__candidates as any[];
1205:     let decision = decideForQuestion(topCandidates);
1206:     let chosenId = decision.chosen?.answerGroupId as string | undefined;
1207: 
1208:     // Global conflict: if chosen answer already taken by higher-scoring question, force UNCERTAIN or try next candidate
1209:     if (chosenId && decision.status === "MATCHED" && usedAnswerGroups.has(chosenId)) {
1210:       // Find next candidate that is not used and above review threshold
1211:       const next = sorted.find((c: any) => !usedAnswerGroups.has(c.answerGroupId) && c.score >= 0.5);
1212:       if (next) {
1213:         // Re-evaluate with next as top
1214:         const altCandidates = [next, ...sorted.filter((c: any) => c.answerGroupId !== next.answerGroupId).slice(0, 2)].map((c: any) => ({ questionId: q.id, answerGroupId: c.answerGroupId, evidence: c.evidence, score: c.score }));
1215:         const altDecision = decideForQuestion(altCandidates);
1216:         if (altDecision.chosen && !usedAnswerGroups.has(altDecision.chosen.answerGroupId)) {
1217:           decision = altDecision;
1218:           chosenId = altDecision.chosen.answerGroupId;
1219:         } else {
1220:           // Keep original but downgrade to UNCERTAIN with conflict evidence
1221:           decision = {
1222:             status: "UNCERTAIN" as const,
1223:             confidence: decision.confidence,
1224:             evidence: [
1225:               ...decision.evidence,
1226:               buildEvidence("NEIGHBOR_CONTEXT", "matching", 0.4, `Global conflict: answer ${chosenId} already assigned to higher-scoring question`, 0.9),
1227:             ],
1228:           };
1229:           chosenId = undefined; // do not assign duplicate
1230:         }
1231:       } else {
1232:         decision = {
1233:           status: "UNCERTAIN" as const,
1234:           confidence: decision.confidence,
1235:           evidence: [
1236:             ...decision.evidence,
1237:             buildEvidence("NEIGHBOR_CONTEXT", "matching", 0.35, `Global conflict: answer ${chosenId} already assigned — no alternative above threshold`, 0.9),
1238:           ],
1239:         };
1240:         chosenId = undefined;
1241:       }
1242:     }
1243: 
1244:     const highlightRegions: HighlightRegion[] = [];
1245:     if (chosenId) {
1246:       const ag = answerGroups.find((a) => a.id === chosenId);
1247:       if (ag) {
1248:         // Coherent region: merge per-page boxes into single union box per page (plus small padding) — Phase 28
1249:         const boxesByPage = new Map<string, any[]>();
1250:         for (const reg of ag.regions) {
1251:           if (!boxesByPage.has(reg.pageId)) boxesByPage.set(reg.pageId, []);
1252:           boxesByPage.get(reg.pageId)!.push(...reg.normalizedBoxes);
1253:         }
1254:         for (const [pageId, boxes] of boxesByPage) {
1255:           // Merge to one coherent box per page; if spread >0.35 height, keep separate (avoid giant blank)
1256:           const merged = mergeBoxesForHighlight(boxes);
1257:           highlightRegions.push({ pageId, boxes: merged, confidence: decision.confidence, source: "matching" });
1258:         }
1259:       }
1260:       if (decision.status === "MATCHED") usedAnswerGroups.add(chosenId);
1261:     }
1262:     decisions.push({
1263:       id: generateId(),
1264:       questionId: q.id,
1265:       answerGroupId: chosenId,
1266:       answerIds: chosenId ? [chosenId] : [],
1267:       primaryAnswerId: chosenId,
1268:       status: decision.status === "MATCHED" && chosenId ? "MATCHED" : decision.status === "UNCERTAIN" && chosenId ? "UNCERTAIN" : chosenId ? "UNCERTAIN" : "UNANSWERED",
1269:       confidence: decision.confidence,
1270:       mappingConfidence: decision.confidence,
1271:       evidence: decision.evidence,
1272:       highlightRegions,
1273:     });
1274:   }
1275: 
1276:   // Ensure decisions are in original question order for stable API
1277:   decisions.sort((a, b) => {
1278:     const qa = questions.find((qq: any) => qq.id === a.questionId);
1279:     const qb = questions.find((qq: any) => qq.id === b.questionId);
1280:     return (qa?.orderIndex ?? 0) - (qb?.orderIndex ?? 0);
1281:   });
1282: 
1283:   const unmatchedAnswers = answerGroups.filter((ag) => !decisions.some((d) => d.answerGroupId === ag.id && (d.status === "MATCHED" || d.status === "UNCERTAIN")));
1284:   const unmatchedDecisions: MappingDecision[] = unmatchedAnswers.map((ag) => ({
1285:     id: generateId(),
1286:     questionId: "__unmatched__",
1287:     answerGroupId: ag.id,
1288:     answerIds: [ag.id],
1289:     primaryAnswerId: ag.id,
1290:     status: "UNMATCHED" as const,
1291:     confidence: 0,
1292:     evidence: [buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.1, "No reliable question match", 0.5)],
1293:     highlightRegions: (() => {
1294:       const byPage = new Map<string, any[]>();
1295:       for (const r of ag.regions) {
1296:         if (!byPage.has(r.pageId)) byPage.set(r.pageId, []);
1297:         byPage.get(r.pageId)!.push(...r.normalizedBoxes);
1298:       }
1299:       return Array.from(byPage.entries()).map(([pageId, boxes]) => ({ pageId, boxes: mergeBoxesForHighlight(boxes), confidence: 0.3, source: "unmatched" }));
1300:     })(),
1301:   }));
1302:   return { questions, answerGroups, decisions: [...decisions, ...unmatchedDecisions], unmatchedAnswers };
1303: }
1304: 
1305: async function localizing(jobId: string, matching: any) {
1306:   return matching;
1307: }
1308: 
1309: async function validatingResult(jobId: string, localized: any) {
1310:   const { questions, decisions, answerGroups } = localized;
1311:   if (questions.length === 0) {
1312:     throw new AppError(ErrorCodes.QUESTION_EXTRACTION_FAILED, "No questions detected");
1313:   }
1314:   // Golden validation
1315:   const topLevel = questions.filter((q: any) => q.depth === 0);
1316:   // Check for impossible question IDs (e.g., 400, 4807) - should have been filtered, but if still present, mark REVIEW_REQUIRED
1317:   const impossibleIds = questions.filter((q: any) => {
1318:     const n = parseInt(q.normalizedNumber.match(/^(\d+)/)?.[1] || "0", 10);
1319:     return n > 100 || q.normalizedNumber.includes("400") || q.normalizedNumber.includes("4807");
1320:   });
1321:   if (impossibleIds.length > 0) {
1322:     console.warn(JSON.stringify({ jobId, stage: "VALIDATING_RESULT", event: "impossible_ids", count: impossibleIds.length, sample: impossibleIds.slice(0,3).map((q:any)=>q.normalizedNumber) }));
1323:     // Do not fail, but log for review
1324:   }
1325:   // Check for excessive top-level count (e.g., 48 for 30-question paper)
1326:   if (topLevel.length > 60) {
1327:     console.warn(JSON.stringify({ jobId, stage: "VALIDATING_RESULT", event: "excessive_top_level", topLevel: topLevel.length }));
1328:   }
1329:   // Check that answerSheet has regions
1330:   if (!answerGroups || answerGroups.length === 0) {
1331:     console.warn(JSON.stringify({ jobId, stage: "VALIDATING_RESULT", event: "no_answer_groups" }));
1332:   }
1333:   // Check that decisions have highlights where expected
1334:   const matchedWithNoHighlight = decisions.filter((d: any) => d.status === "MATCHED" && (!d.highlightRegions || d.highlightRegions.length === 0));
1335:   if (matchedWithNoHighlight.length > 0) {
1336:     console.warn(JSON.stringify({ jobId, stage: "VALIDATING_RESULT", event: "matched_no_highlight", count: matchedWithNoHighlight.length }));
1337:   }
1338:   console.log(JSON.stringify({ jobId, stage: "VALIDATING_RESULT", event: "golden_validation_pass", topLevel: topLevel.length, total: questions.length, decisions: decisions.length }));
1339: }

(End of file - total 1339 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\src\\lib\\vision\\provider.ts"
}
```

**Output:**
```
<path>E:\vedaAi\src\lib\vision\provider.ts</path>
<type>file</type>
<content>
1: import { z } from "zod";
2: 
3: /**
4:  * VisionProvider — parallel to Textract OCR, provides visual understanding
5:  * not coordinate invention. All outputs are evidence, grounded to Textract geometry downstream.
6:  */
7: 
8: const KNOWN_REGION_TYPES = ["QUESTION_HEADER", "INSTRUCTION", "SECTION_HEADER", "OPTION", "MARKS", "FIGURE", "TABLE", "HANDWRITING_BLOCK", "DIAGRAM", "HEADER", "FOOTER"] as const;
9: 
10: function normalizeRegionType(input: string): typeof KNOWN_REGION_TYPES[number] {
11:   const up = String(input).toUpperCase().replace(/[\s\-\/]+/g, "_").replace(/[^A-Z_]/g, "");
12:   if ((KNOWN_REGION_TYPES as readonly string[]).includes(up)) return up as any;
13:   // Map common variants
14:   if (up.includes("QUESTION")) return "QUESTION_HEADER";
15:   if (up.includes("INSTRUCT")) return "INSTRUCTION";
16:   if (up.includes("SECTION")) return "SECTION_HEADER";
17:   if (up.includes("OPTION") || up === "A" || up === "B" || up === "C" || up === "D") return "OPTION";
18:   if (up.includes("MARK")) return "MARKS";
19:   if (up.includes("FIGURE") || up.includes("IMAGE") || up.includes("DIAGRAM")) return "DIAGRAM";
20:   if (up.includes("TABLE")) return "TABLE";
21:   if (up.includes("HANDWRITING")) return "HANDWRITING_BLOCK";
22:   if (up.includes("HEADER")) return "HEADER";
23:   if (up.includes("FOOTER")) return "FOOTER";
24:   return "HANDWRITING_BLOCK";
25: }
26: 
27: export const VisionPageStructureSchema = z.object({
28:   pageNumber: z.number().int().min(1),
29:   visualRegions: z.array(
30:     z.object({
31:       type: z.string().transform(normalizeRegionType),
32:       description: z.any().optional().transform((val: any) => {
33:         if (Array.isArray(val)) return val.join("\n").slice(0, 1000);
34:         if (typeof val === "string") return val.slice(0, 1000);
35:         return "";
36:       }).default(""),
37:       content: z.any().optional().transform((val: any) => {
38:         if (Array.isArray(val)) return val.join("\n").slice(0, 1000);
39:         if (typeof val === "string") return val.slice(0, 1000);
40:         return undefined;
41:       }),
42:       confidence: z.number().min(0).max(1).default(0.7),
43:       coarseBox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
44:       relatedQuestionLabel: z.string().optional(),
45:     }).passthrough().transform((v: any) => ({
46:       type: v.type,
47:       description: (v.description || v.content || "").slice(0, 1000),
48:       confidence: v.confidence ?? 0.7,
49:       coarseBox: v.coarseBox,
50:       relatedQuestionLabel: v.relatedQuestionLabel,
51:     }))
52:   ).default([]),
53:   questionCandidates: z.array(
54:     z.union([
55:       z.string().transform((s) => ({ rawLabel: s, textHint: "", confidence: 0.7, visualEvidence: "" })),
56:       z.object({
57:         rawLabel: z.string(),
58:         textHint: z.string().max(2000).default(""),
59:         confidence: z.number().min(0).max(1).default(0.7),
60:         visualEvidence: z.string().max(2000).default(""),
61:       }),
62:       z.object({
63:         label: z.string(),
64:         text: z.string().optional(),
65:       }).passthrough().transform((v: any) => ({ rawLabel: v.label || v.rawLabel, textHint: v.text || "", confidence: 0.7, visualEvidence: "" })),
66:     ])
67:   ).default([]),
68:   answerGroupHints: z.array(
69:     z.union([
70:       z.string().transform((s) => ({ labelHint: s, description: "", confidence: 0.7 })),
71:       z.object({
72:         labelHint: z.string(),
73:         description: z.string().max(2000).default(""),
74:         confidence: z.number().min(0).max(1).default(0.7),
75:         isDiagram: z.boolean().optional(),
76:         isCrossedOut: z.boolean().optional(),
77:       }),
78:       z.object({
79:         label: z.string(),
80:         text: z.string().optional(),
81:       }).passthrough().transform((v: any) => ({ labelHint: v.label || v.labelHint || "", description: v.text || v.description || "", confidence: 0.7 })),
82:     ])
83:   ).default([]),
84:   documentStructureHints: z.any().optional().default({}),
85: });
86: 
87: export type VisionPageStructure = z.infer<typeof VisionPageStructureSchema>;
88: 
89: export const VisionDocumentAnalysisSchema = z.object({
90:   pages: z.array(VisionPageStructureSchema).default([]),
91:   globalStructure: z.any().optional().default({}),
92: }).passthrough();
93: 
94: export type VisionDocumentAnalysis = z.infer<typeof VisionDocumentAnalysisSchema>;
95: 
96: export interface VisionAnalyzePageInput {
97:   pageId: string;
98:   pageNumber: number;
99:   imageBase64: string; // real PNG or PDF base64 from source artifact
100:   mimeType: "image/png" | "image/jpeg" | "application/pdf";
101:   ocrTokens?: unknown; // optional Textract hint (not concatenated into system prompt as raw text)
102:   width: number;
103:   height: number;
104: }
105: 
106: export interface VisionAnalyzeDocumentInput {
107:   pages: VisionAnalyzePageInput[];
108:   hints?: string[];
109:   ocrTextSample?: string; // truncated, for context only, not concatenated into system prompt
110: }
111: 
112: export interface VisionProvider {
113:   /**
114:    * Analyze a single page visually — returns semantic structure, not final coordinates
115:    */
116:   analyzePage(input: VisionAnalyzePageInput): Promise<VisionPageStructure>;
117:   /**
118:    * Analyze whole document structure (question hierarchy interpretation)
119:    */
120:   analyzeDocumentStructure(input: VisionAnalyzeDocumentInput): Promise<VisionDocumentAnalysis>;
121:   /**
122:    * Analyze answer grouping for ambiguous regions
123:    */
124:   analyzeAnswerGrouping(input: VisionAnalyzeDocumentInput): Promise<VisionDocumentAnalysis>;
125:   /**
126:    * Analyze ambiguous mapping with visual context
127:    */
128:   analyzeAmbiguousMapping(input: { questions: { id: string; normalizedNumber: string; text: string }[]; answerGroups: { id: string; text: string; label?: string }[]; visionEvidence?: VisionDocumentAnalysis }): Promise<{ mappings: unknown[] }>;
129: }
130: 
131: export const VisionConfigSchema = z.object({
132:   enabled: z.boolean(),
133:   provider: z.enum(["opencode-zen", "mock", "disabled"]),
134:   model: z.string(),
135:   maxPages: z.number().int().min(1).max(20),
136: });

(End of file - total 136 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\src\\lib\\documents\\render.ts"
}
```

**Output:**
```
<path>E:\vedaAi\src\lib\documents\render.ts</path>
<type>file</type>
<content>
1: // @ts-nocheck
2: /**
3:  * Render PDF pages to images for Vision input.
4:  * Preserves pageNumber, original dimensions, and artifact identity.
5:  * Falls back to PDF base64 if canvas not available.
6:  */
7: 
8: export interface RenderedPage {
9:   pageNumber: number;
10:   imageBase64: string;
11:   mimeType: "image/png" | "application/pdf";
12:   width: number;
13:   height: number;
14: }
15: 
16: export async function renderPdfPagesForVision(
17:   buffer: Buffer,
18:   pageNumbers: number[] = [],
19:   maxPages = 5
20: ): Promise<RenderedPage[]> {
21:   const targetPages = pageNumbers.length ? pageNumbers.slice(0, maxPages) : Array.from({ length: maxPages }, (_, i) => i + 1);
22: 
23:   // Try mupdf-based rendering first (most reliable in Node, no canvas factory issues)
24:   try {
25:     const mupdf: any = await import("mupdf");
26:     const doc = mupdf.Document.openDocument(buffer, "application/pdf");
27:     const total = doc.countPages();
28:     const rendered: RenderedPage[] = [];
29:     for (const pn of targetPages) {
30:       if (pn > total) break;
31:       const page = doc.loadPage(pn - 1);
32:       // Scale 1.5 ~ 108 DPI (mupdf default 72, scale 1.5 = 108)
33:       const pix = page.toPixmap(mupdf.Matrix.scale(1.5, 1.5), mupdf.ColorSpace.DeviceRGB, false, true);
34:       const png = pix.asPNG(); // Uint8Array
35:       const b64 = Buffer.from(png).toString("base64");
36:       rendered.push({ pageNumber: pn, imageBase64: b64, mimeType: "image/png", width: pix.getWidth(), height: pix.getHeight() });
37:       pix.destroy();
38:       page.destroy();
39:     }
40:     doc.destroy();
41:     if (rendered.length > 0) return rendered;
42:   } catch (e) {
43:     console.log(`[render] mupdf fallback: ${(e as Error).message.slice(0, 200)} — trying pdfjs+canvas`);
44:   }
45: 
46:   // Try canvas-based pdfjs rendering as second attempt
47:   try {
48:     // Polyfill DOM APIs for pdfjs Node canvas BEFORE importing pdfjs (pdfjs caches globals)
49:     // eslint-disable-next-line @typescript-eslint/no-implied-eval
50:     const canvasModPoly: any = eval("require")("canvas");
51:     const g: any = globalThis as any;
52:     if (typeof g !== "undefined") {
53:       if (!g.Image) g.Image = canvasModPoly.Image;
54:       if (!g.HTMLCanvasElement) g.HTMLCanvasElement = canvasModPoly.Canvas as any;
55:       if (!g.HTMLImageElement) g.HTMLImageElement = canvasModPoly.Image as any;
56:       if (!g.ImageData && canvasModPoly.ImageData) g.ImageData = canvasModPoly.ImageData;
57:       if (!g.Canvas) g.Canvas = canvasModPoly.Canvas as any;
58:       if (!g.OffscreenCanvas) g.OffscreenCanvas = canvasModPoly.Canvas as any;
59:       if (!g.DOMMatrix) {
60:         try {
61:           const { DOMMatrix } = canvasModPoly;
62:           if (DOMMatrix) g.DOMMatrix = DOMMatrix;
63:         } catch {}
64:       }
65:       if (!g.Path2D && canvasModPoly.Path2D) g.Path2D = canvasModPoly.Path2D;
66:     }
67:     const hasCanvas = await (async () => {
68:       try {
69:         // eslint-disable-next-line @typescript-eslint/no-implied-eval
70:         const req = eval("require") as any;
71:         req.resolve("canvas");
72:         return true;
73:       } catch { return false; }
74:     })();
75:     if (!hasCanvas) throw new Error("canvas not available");
76: 
77:     const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
78:     if (pdfjs.GlobalWorkerOptions) {
79:       try {
80:         // @ts-ignore
81:         const workerMod = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
82:         pdfjs.GlobalWorkerOptions.workerSrc = "pdfjs-dist/legacy/build/pdf.worker.mjs";
83:         void workerMod;
84:       } catch {
85:         pdfjs.GlobalWorkerOptions.workerSrc = "";
86:       }
87:     }
88:     const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
89:     const doc = await pdfjs.getDocument({ data: uint8, verbosity: 0, useWorkerFetch: false, isEvalSupported: false, disableFontFace: true, disableWorker: true } as any).promise;
90:     const rendered: RenderedPage[] = [];
91:     // eslint-disable-next-line @typescript-eslint/no-implied-eval
92:     const canvasMod: any = eval("require")("canvas");
93:     class NodeCanvasFactory {
94:       create(width: number, height: number) {
95:         const canvas = canvasMod.createCanvas(width, height);
96:         const context = canvas.getContext("2d");
97:         return { canvas, context };
98:       }
99:       reset(canvasAndContext: any, width: number, height: number) {
100:         canvasAndContext.canvas.width = width;
101:         canvasAndContext.canvas.height = height;
102:       }
103:       destroy(canvasAndContext: any) {
104:         canvasAndContext.canvas.width = 0;
105:         canvasAndContext.canvas.height = 0;
106:         canvasAndContext.canvas = null;
107:         canvasAndContext.context = null;
108:       }
109:     }
110:     const factory = new NodeCanvasFactory();
111:     for (const pn of targetPages) {
112:       if (pn > doc.numPages) break;
113:       const page = await doc.getPage(pn);
114:       const viewport = page.getViewport({ scale: 1.5 });
115:       const canvasAndContext = factory.create(viewport.width, viewport.height);
116:       await page.render({ canvasContext: canvasAndContext.context as any, viewport, canvasFactory: factory } as any).promise;
117:       const pngBuffer: Buffer = canvasAndContext.canvas.toBuffer("image/png");
118:       rendered.push({ pageNumber: pn, imageBase64: pngBuffer.toString("base64"), mimeType: "image/png", width: viewport.width, height: viewport.height });
119:       factory.destroy(canvasAndContext);
120:       page.cleanup();
121:     }
122:     await doc.destroy();
123:     if (rendered.length > 0) return rendered;
124:   } catch (e) {
125:     console.log(`[render] canvas fallback: ${(e as Error).message} — using PDF base64`);
126:     console.log((e as Error).stack?.slice(0, 2000));
127:   }
128: 
129:   // Fallback: single entry with full PDF base64 (consumer will slice if needed)
130:   // Caller should treat this as mimeType application/pdf and send as input_file per page
131:   const pdfBase64 = buffer.toString("base64");
132:   // For vision we still need per-page entries; reuse same PDF base64 for each page (Vision analyzes with pageNumber hint)
133:   return targetPages.slice(0, 3).map((pn) => ({ pageNumber: pn, imageBase64: pdfBase64, mimeType: "application/pdf" as const, width: 800, height: 1100 }));
134: }
135: 
136: export async function bufferToBase64ForVision(buffer: Buffer, mime: string): Promise<{ base64: string; mimeType: "image/png" | "image/jpeg" | "application/pdf" }> {
137:   if (mime === "application/pdf") return { base64: buffer.toString("base64"), mimeType: "application/pdf" };
138:   if (mime === "image/png") return { base64: buffer.toString("base64"), mimeType: "image/png" };
139:   if (mime === "image/jpeg") return { base64: buffer.toString("base64"), mimeType: "image/jpeg" };
140:   return { base64: buffer.toString("base64"), mimeType: "image/png" };
141: }

(End of file - total 141 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\src\\lib\\structure\\question-parser.ts"
}
```

**Output:**
```
<path>E:\vedaAi\src\lib\structure\question-parser.ts</path>
<type>file</type>
<content>
1: import type { OcrDocumentResult, OcrLine } from "@/lib/ocr/types";
2: import type { DocumentPage } from "@/types";
3: import { normalizeNumber } from "./numbering";
4: 
5: export interface QuestionOptionParsed {
6:   label: string;
7:   text: string;
8:   rawText: string;
9:   bbox?: { x: number; y: number; width: number; height: number };
10: }
11: 
12: export interface ParsedQuestion {
13:   rawNumber: string;
14:   normalizedNumber: string;
15:   displayNumber?: string;
16:   text: string;
17:   rawText: string;
18:   pageNumbers: number[];
19:   bboxesByPage: Map<number, { x: number; y: number; width: number; height: number }[]>;
20:   confidence: number;
21:   marks?: number;
22:   depth: number;
23:   partType: "SECTION" | "QUESTION" | "PART" | "SUBPART" | "OPTION" | "INSTRUCTION";
24:   kind?: string;
25:   parent?: string;
26:   options?: QuestionOptionParsed[];
27: }
28: 
29: // Regex for question label at line start — ONLY numeric-prefixed (require digit base)
30: // Supports: 1, 1., 1), Q1, Q.1, Q 1, Question 1, 11(a), 11 (a), 11(a)(i), 11 (a) (i)
31: // Standalone "(a)" / "(i)" is NOT a top-level label; those are options/subparts handled via parent context
32: const QUESTION_LABEL_RE = /^\s*(?:Q(?:uestion)?\.?\s*)?(\d+[a-z]?\s*(?:\([a-z]\)\s*)?(?:\([ivx0-9]+\))?|\d+\s*[\.\)]\s*(?:\([a-z]\)\s*)?(?:\([ivx0-9]+\))?)\s*[\.\)\-:\s]*\s*/i;
33: 
34: // Subpart-only regex for standalone (a)/(i)/(ii) — used only to detect subparts via parent context, not as top-level
35: const STANDALONE_SUBPART_RE = /^\s*\(([a-z]+|[ivx]+|[0-9]+)\)\s*[\.\)\-:\s]*\s*/i;
36: const STANDALONE_ROMAN_DOT_RE = /^\s*(i{1,3}|iv|v|vi|vii|viii|ix|x)\s*[\.\)]\s*/i;
37: 
38: const SECTION_RE = /^\s*(?:Section|Part)\s+[A-Z]\b/i;
39: const INSTRUCTIONS_RE = /^\s*(?:Instructions|Note|General Instructions)\s*:?/i;
40: const MARKS_RE = /(?:\((\d+)\s*marks?\)|\[(\d+)\s*marks?\]|\[(\d+)\]|(\d+)\s*marks?\b)/i;
41: 
42: // Generic instruction / header detectors — no subject hardcoding, structural only
43: const INSTRUCTION_PHRASES = [
44:   /question paper contains/i,
45:   /All Questions are compulsory/i,
46:   /divided into.*Sections/i,
47:   /Question numbers.*are/i,
48:   /multiple choice/i,
49:   /Assertion.*Reason/i,
50:   /There is no overall choice/i,
51:   /internal choice/i,
52:   /Draw neat/i,
53:   /Take π/i,
54:   /Use of calculators is not allowed/i,
55:   /Time:\s*3 hours/i,
56:   /Time allowed/i,
57:   /For Visually Impaired/i,
58:   /Please note that the assessment scheme/i,
59:   /Please check that this question/i,
60:   /Candidates must write the Code/i,
61:   /question paper will be distributed/i,
62:   /students will read the/i,
63:   /write any answer on the answer/i,
64:   /P\.T\.O\./i,
65:   /Answer question numbers.*to/i,
66:   /Answer should be brief/i,
67:   /word limit be adhered/i,
68:   /There is no overall choice/i,
69:   /separate instructions are given with each section/i,
70: ];
71: 
72: const PAGE_HEADER_FOOTER_RE = /(Page\s*\d+\s*of\s*\d+|^\s*\d+\s*Page\s*\d+|^\s*\d+\s*$)/i;
73: 
74: function isSectionOrInstruction(text: string): boolean {
75:   if (SECTION_RE.test(text)) return true;
76:   if (INSTRUCTIONS_RE.test(text)) return true;
77:   // Generic instruction phrases — if line contains instructional meta and is long
78:   for (const re of INSTRUCTION_PHRASES) {
79:     if (re.test(text)) return true;
80:   }
81:   return false;
82: }
83: 
84: function isPageHeaderFooter(text: string, bbox?: { x: number; y: number; width: number; height: number }): boolean {
85:   const t = text.trim();
86:   if (!t) return false;
87:   // Generic page-footer pattern
88:   if (PAGE_HEADER_FOOTER_RE.test(t) && t.length < 30) return true;
89:   if (/^\s*Page \d+ of \d+/i.test(t)) return true;
90:   if (/^P\.T\.O\./i.test(t)) return true;
91:   if (/^NOTE$/i.test(t) && t.length < 10) return true;
92: 
93:   // Code like "31/2/1" anywhere (not only header band) — short slash code is never a question
94:   if (/^\s*\.?31\/2\/1\.?\s*$/i.test(t)) return true;
95:   if (/^\s*31\/ETCH/.test(t)) return true;
96:   if (/^\s*100A\s*$/.test(t)) return true;
97:   if (/^\s*\.31\/2\/1\.\s*$/.test(t)) return true;
98:   // Generic slash-code: short (<12 chars) with slash and digits, no letters beyond 2-3 chars, often header code
99:   if (t.length < 14 && /^[\d\/\.]+$/.test(t.replace(/\s/g, "")) && /[\/]/.test(t) && /\d/.test(t)) return true;
100: 
101:   // Generic header/footer band: y in top 8% or bottom 8% of page
102:   const inHeaderBand = !!bbox && bbox.y < 0.08;
103:   const inFooterBand = !!bbox && bbox.y > 0.92;
104:   if (inHeaderBand || inFooterBand) {
105:     // Single page number in footer/header
106:     if (/^\s*\d+\s*$/.test(t)) return true;
107:     // Short code-like header fragments (e.g., "Code No.", "Roll No.", "Series :", "SET -", "Maximum Marks:", "Time allowed", subject names)
108:     // Detect via generic cues: contains "Code No", "Roll No", "Maximum Marks", "Time", "CLASS", "SAMPLE", plus very short (<25 chars) and in band
109:     if (t.length < 30) {
110:       if (/^(Code|Roll)\s*No\.?/i.test(t)) return true;
111:       if (/^SET\s*[-–]/i.test(t)) return true;
112:       if (/^Series\s*:/i.test(t)) return true;
113:       if (/^(Maximum Marks|Time)\b/i.test(t)) return true;
114:       if (/^(CLASS|SAMPLE QUESTION PAPER|SCIENCE|MATHEMATICS)\b/i.test(t) && t.length < 35) return true;
115:     }
116:     // Any short (<12 chars) alphanumeric garble in header band with symbols/digits mix is likely header noise — generic OCR garbage filter
117:     if (inHeaderBand && t.length < 18 && /^[\w\s\/\-\.#]+$/.test(t) && /[0-9]/.test(t) && /[A-Z]/.test(t) && t.split(/\s+/).length <= 3) {
118:       // e.g., "31/2/1", "31/ETCH", short codes — generic pattern: short with slash/dash and digits in header
119:       if (/[\/\\]/.test(t) && /\d/.test(t)) return true;
120:     }
121:   }
122: 
123:   // Assessment scheme notice always footer-like (generic)
124:   if (/Please note that the assessment scheme/i.test(t)) return true;
125:   if (/Candidates must write the Code/i.test(t)) return true;
126:   if (/Please check that this question/i.test(t)) return true;
127: 
128:   // Do not flag legitimate question labels as garbage
129:   if (QUESTION_LABEL_RE.test(t) || STANDALONE_SUBPART_RE.test(t)) {
130:     // e.g., "21.(A)", "(a)", "10" at left margin are valid labels, not garbage
131:     // Do not treat as header/garbage
132:   } else {
133:     // OCR garbage: generic generic detection — no paper-specific literals
134:     // Pure symbols or very low alphanumeric content
135:     if (/^[^\w]*$/.test(t) && t.length < 10) return true;
136:     // Generic OCR garbage heuristic: short (<15 chars) with mixed symbols/digits and >40% non-alphanumeric, in any position, and confidence would be low (but we don't have it here)
137:     if (t.length < 18 && t.length >= 4) {
138:       const nonAlpha = (t.match(/[^a-zA-Z0-9\s]/g) || []).length;
139:       const ratio = nonAlpha / t.length;
140:       // e.g., "$21 onl", "4807, D_D", "3772 $41" — generic: many symbols + digits, few real words, short
141:       if (ratio > 0.25 && /\d/.test(t) && !/[a-z]{3,}/i.test(t)) return true;
142:       // Pure short code like "4807", "400 23" — short numeric + maybe short suffix, not a question (which needs accompanying text)
143:       if (/^\d{3,5}(\s+[\w\/\-\.]{1,6})?$/.test(t) && t.length < 14 && !t.includes("marks")) {
144:         // But avoid filtering legitimate question numbers like "1" or "22" alone at left margin — those are handled as labels elsewhere
145:         // Only filter if in header/footer band or mid-page stray with no remaining text expectation
146:         if ((bbox && (bbox.y < 0.10 || bbox.y > 0.88 || bbox.x > 0.7)) || ratio > 0.15) return true;
147:       }
148:     }
149:   }
150:   return false;
151: }
152: 
153: function isMarksLine(text: string, bbox?: { x: number; y: number; width: number; height: number }): boolean {
154:   const t = text.trim();
155:   if (!bbox) return false;
156:   // Marks column: x>0.84 (right margin), width small, single digit 1-5 or "2" etc, and not at top/bottom header
157:   if (bbox.x > 0.84 && bbox.width < 0.03 && /^\d+$/.test(t) && parseInt(t, 10) >= 1 && parseInt(t, 10) <= 10) return true;
158:   // Also marks like "1" at x=0.908 with width 0.007-0.011
159:   if (bbox.x > 0.88 && /^\d+$/.test(t) && t.length <= 2) return true;
160:   return false;
161: }
162: 
163: function isTableCell(text: string, bbox?: { x: number; y: number; width: number; height: number }): boolean {
164:   const t = text.trim();
165:   if (!bbox) return false;
166:   // Table intervals like "15 - 30", "45 - 60", "0 - 15" etc, interior x 0.2-0.8, short (<12 chars), contains dash
167:   if (/^\d+\s*-\s*\d+$/.test(t) && bbox.x > 0.14 && bbox.x < 0.82 && t.length < 12) return true;
168:   // Frequency numbers in table row like "10", "7", "x", "15", "12" but appear in table y-band with multiple neighbors
169:   // Heuristic: single number/short token at y ~0.53-0.75 with x 0.25-0.77 and not left margin, could be table; we flag generic short numeric inside table region
170:   if (/^\d+$/.test(t) && bbox.x > 0.22 && bbox.x < 0.78 && bbox.y > 0.5 && bbox.y < 0.78 && t.length <= 2) {
171:     // Only flag if likely table: check width small
172:     if (bbox.width < 0.07) return true;
173:   }
174:   // Header "Class Interval" split across lines, but "Interval", "Freque", "ncy" etc are fragments
175:   if (/^(Interval|Freque|ncy|Class)$/i.test(t) && bbox.x > 0.12 && bbox.x < 0.8) return true;
176:   return false;
177: }
178: 
179: function isOptionLine(text: string, bbox?: { x: number; y: number; width: number; height: number }): boolean {
180:   const t = text.trim();
181:   if (!t) return false;
182:   // MCQ option markers: (a)-(d) in various forms — but case-study subparts also use (a) with longer text
183:   // Multi-signal: pattern + indentation + length + not roman
184:   // Pattern supports: (a), (A), a), A), a., A., (a. — all with optional leading bullet
185:   const optPattern = /^\s*(?:\(?\s*([a-dA-D])\s*[\)\.\]]\s*)/;
186:   const m = t.match(optPattern);
187:   if (!m) return false;
188:   const label = m[1].toLowerCase();
189:   if (!["a", "b", "c", "d"].includes(label)) return false;
190:   // Distinguish from subpart (i)/(ii) which would be roman — already excluded by [a-d]
191:   // Roman (i) would be single letter but 'i' is beyond d, so not matched here — correct
192: 
193:   // Geometry signal: MCQ options are indented relative to question number column (question numbers at x<0.08)
194:   // Options typically x 0.09–0.35 with similar x across cluster
195:   const isIndented = !bbox || bbox.x > 0.07;
196:   // Options are not at exact left margin; if at x<0.06 it's likely a question label, not option
197:   if (bbox && bbox.x < 0.06) return false;
198: 
199:   // Content length: allow long mathematical options (up to ~280 chars) but not extremely long paragraph subparts
200:   // Subparts (i)(ii) case-study often longer explanatory text (>120 chars) — but we already handled [a-d] only, so (i) not here
201:   // For (a)-(d) we allow any length up to 300, but flag if very long and contains sentence structure vs short option
202:   // Heuristic: options typically have limited punctuation and are not multi-sentence; but allow math
203:   if (t.length > 320) return false;
204: 
205:   // If indented and pattern matches a-d, treat as option regardless of length (fixes long math options bug)
206:   if (isIndented) return true;
207: 
208:   // Fallback: if text is short (<120) and pattern matches, even without bbox, treat as option
209:   if (t.length < 120) return true;
210: 
211:   return false;
212: }
213: 
214: function extractMarks(text: string): { marks?: number; cleaned: string } {
215:   const m = text.match(MARKS_RE);
216:   if (!m) return { cleaned: text };
217:   const val = m[1] || m[2] || m[3] || m[4];
218:   const n = parseInt(val, 10);
219:   if (isNaN(n)) return { cleaned: text };
220:   // Remove marks portion from text
221:   const cleaned = text.replace(m[0], "").trim();
222:   return { marks: n, cleaned };
223: }
224: 
225: let expectedTopLevelSet: Set<number> | null = null;
226: function setExpectedTopLevelFromText(fullText: string) {
227:   const ranges: Array<[number, number]> = [];
228:   const rangeRes = [...fullText.matchAll(/question\s*no\.?\s*(\d+)\s*to\s*(\d+)/gi)];
229:   for (const m of rangeRes) {
230:     const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
231:     if (a >= 1 && b <= 100 && a < b) ranges.push([a, b]);
232:   }
233:   if (ranges.length === 0) {
234:     const secRes = [...fullText.matchAll(/Section\s+[A-C][^]*?(\d+)\s*to\s*(\d+)/gi)];
235:     for (const m of secRes) {
236:       const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
237:       if (a >= 1 && b <= 100 && a < b) ranges.push([a, b]);
238:     }
239:   }
240:   if (ranges.length > 0) {
241:     const ids = new Set<number>();
242:     for (const [a, b] of ranges) for (let i = a; i <= b; i++) ids.add(i);
243:     if (ids.size >= 20 && Math.min(...ids) === 1) expectedTopLevelSet = ids;
244:   }
245: }
246: 
247: function detectLabel(lineText: string, bbox?: { x: number; y: number; width: number; height: number }): { rawNumber: string; remaining: string } | null {
248:   const trimmed = lineText.trim();
249:   if (!trimmed) return null;
250:   if (isSectionOrInstruction(trimmed)) return null;
251:   if (isPageHeaderFooter(trimmed, bbox)) return null;
252:   if (isMarksLine(trimmed, bbox)) return null;
253:   if (isTableCell(trimmed, bbox)) return null;
254:   // Word limit numbers like "90 words" should not be questions
255:   if (/^\s*90\s+words/i.test(trimmed) || /^\s*80\s+to\s*90\s+words/i.test(trimmed)) return null;
256:   if (/^\s*\(vii\)\s+In addition to this/i.test(trimmed)) return null;
257:   if (/^\s*60\s+words/i.test(trimmed) && trimmed.length < 20) return null;
258:   if (/^\s*90\s+words/i.test(trimmed) && trimmed.length < 20) return null;
259:   // Options like "(a) 3" should not start a new top-level question
260:   if (isOptionLine(trimmed)) return null;
261:   // Strict left margin for question labels — single column expects x <0.14, two-column right allowed at 0.48-0.65 but only if truly two-column page
262:   // For generic single-column papers, any x >0.18 is unlikely a question start
263:   const isLeftMarginStrict = !bbox || bbox.x < 0.14;
264:   const isRightColumnMargin = !!bbox && bbox.x >= 0.45 && bbox.x < 0.65;
265:   // If not left and not right column, reject unless Q-prefixed at moderate x
266:   if (!isLeftMarginStrict && !isRightColumnMargin) {
267:     // Allow Q-prefixed even if slightly indented up to 0.22
268:     if (/^\s*Q/i.test(trimmed) && bbox && bbox.x < 0.22) {
269:       // allow
270:     } else {
271:       return null;
272:     }
273:   }
274:   // Geometry: body numbers like "41cm" at interior should not become questions
275:   const isLeftMargin = !bbox || bbox.x < 0.14;
276:   if (!isLeftMargin && /^\d+[a-z]{1,3}\b/.test(trimmed) && !/^\d+\s*[\.\)\(\-]/.test(trimmed) && !/^\s*Q/i.test(trimmed)) {
277:     return null;
278:   }
279:   // Skip fragmented short lowercase continuation that could be misread as "1" — but allow Q-prefixed labels
280:   if (/^Q/i.test(trimmed)) {
281:     // Q-prefixed allowed
282:   } else if (/^[a-z]/i.test(trimmed) && trimmed.length < 15 && !/^\d/.test(trimmed)) {
283:     return null;
284:   }
285: 
286:   // Attempt regex — requires digit prefix
287:   const m = trimmed.match(QUESTION_LABEL_RE);
288:   if (!m) return null;
289: 
290:   const fullMatch = m[0];
291:   const remaining = trimmed.slice(fullMatch.length).trim();
292: 
293:   let rawNumber = fullMatch.trim().replace(/[\s]+/g, " ").trim();
294:   rawNumber = rawNumber.replace(/[\.:\-]\s*$/, "").trim();
295:   if (/^\d+\.$/.test(rawNumber)) rawNumber = rawNumber.slice(0, -1);
296: 
297:   // Must contain digit (since we removed standalone subpart)
298:   if (!/\d/.test(rawNumber)) return null;
299: 
300:   if (rawNumber.length > 20) return null;
301: 
302:   // Plausibility: question numbers should be 1-100, not 400, 4807 etc, unless paper is very long
303:   // For Science paper with 30 questions, 400 is impossible
304:   const numPart = rawNumber.match(/^(\d+)/);
305:   if (numPart) {
306:     const n = parseInt(numPart[1], 10);
307:     if (n > 100) return null;
308:     if (n === 0) return null;
309:     if (expectedTopLevelSet && !expectedTopLevelSet.has(n)) {
310:       return null;
311:     }
312:   }
313: 
314:   // Strict punctuation requirement for bare numbers without Q prefix
315:   // e.g., "15 minute..." -> raw "15" without dot/parens and remaining starts with lowercase word -> not a question
316:   // Real questions have "15." or "15(a)" or "15 )" etc. or "1 What is..." with uppercase
317:   // Check original fullMatch for punctuation (dot/paren), not stripped rawNumber
318:   const hadPunct = /[\.\)\(\:]/.test(fullMatch);
319:   const isQPrefixed = /^\s*Q/i.test(trimmed);
320:   if (!hadPunct && !isQPrefixed) {
321:     // Bare number without punctuation: allow only if remaining starts with uppercase (plausible question stem)
322:     // Reject if remaining starts with lowercase or digit (like "15 minute" or "10 30 out")
323:     if (!remaining) {
324:       // Bare number alone like "1" with no remaining — could be label on its own line, allow if left margin
325:       // But single digit alone at left margin could also be page number; however page numbers are filtered via header band
326:       // Allow for now
327:     } else if (/^[a-z]/.test(remaining)) {
328:       return null;
329:     } else if (/^\d/.test(remaining)) {
330:       return null;
331:     }
332:     // For "1 What is..." remaining starts with "W" uppercase, allow
333:   }
334:   // Additional guard: if remaining starts with digit, likely time like "10.15" or "7)2" -> not question
335:   // Real question after "10." would start with uppercase letter, not digit (except equation)
336:   if (hadPunct && remaining && /^\d/.test(remaining) && !/^\([a-z]\)/i.test(remaining.slice(0,5))) {
337:     // e.g., "10." with remaining "15 a.m." -> time
338:     return null;
339:   }
340:   // Additional guard: if remaining starts with digit, likely time like "10.15" or "7)2" -> not question
341:   if (remaining && /^\d/.test(remaining) && !/^\([a-z]\)/i.test(remaining.slice(0,5))) {
342:     return null;
343:   }
344: 
345:   // Guard: remaining very short and lowercase suggests fragment, not question? Still allow if remaining length >0 or next line will append.
346:   // But if remaining is "equal to" and rawNumber is "1", that would be mis-detection: "1 equal to" rawNumber "1" remaining "equal to"
347:   // To prevent, require that if remaining starts with lowercase and length <15, and rawNumber is single digit, treat as continuation not label unless next char is uppercase or length substantial
348:   // Safer: if remaining is purely lowercase short phrase (<20 chars) and no question keywords, it's likely continuation fragment
349:   if (remaining && /^[a-z]/.test(remaining) && remaining.length < 25 && !/^\d/.test(trimmed) && rawNumber.length <= 2) {
350:     // Could be "equal to" from previous question stem — not a new question
351:     // Check if trimmed originally started with digit; if not, this match is suspicious
352:     // Since we matched digits at start, trimmed must have started with digit; "equal to" doesn't, so this case won't occur.
353:   }
354: 
355:   return { rawNumber, remaining };
356: }
357: 
358: function readingOrderSort(lines: OcrLine[]): OcrLine[] {
359:   const xs = lines.map((l) => l.boundingBox.x).filter((x) => x !== undefined);
360:   if (xs.length === 0) return [...lines].sort((a, b) => a.boundingBox.y - b.boundingBox.y);
361: 
362:   // Strict two-column detection: require substantial content in both columns, excluding marks column (>0.85)
363:   const leftCount = xs.filter((x) => x < 0.38).length;
364:   const rightContentCount = xs.filter((x) => x >= 0.48 && x < 0.82).length;
365:   const total = xs.length;
366:   const leftRatio = leftCount / Math.max(total, 1);
367:   const rightRatio = rightContentCount / Math.max(total, 1);
368:   // Need at least 2 lines in each content column and each >=20% of total, and y-ranges overlap significantly
369:   let isTwoColumn = false;
370:   if (leftCount >= 2 && rightContentCount >= 2 && leftRatio >= 0.2 && rightRatio >= 0.2) {
371:     const leftYs = lines.filter((l) => l.boundingBox.x < 0.38).map((l) => l.boundingBox.y);
372:     const rightYs = lines.filter((l) => l.boundingBox.x >= 0.48 && l.boundingBox.x < 0.82).map((l) => l.boundingBox.y);
373:     if (leftYs.length && rightYs.length) {
374:       const leftMin = Math.min(...leftYs), leftMax = Math.max(...leftYs);
375:       const rightMin = Math.min(...rightYs), rightMax = Math.max(...rightYs);
376:       const overlap = Math.max(0, Math.min(leftMax, rightMax) - Math.max(leftMin, rightMin));
377:       const span = Math.max(leftMax, rightMax) - Math.min(leftMin, rightMin);
378:       if (span > 0 && overlap / span > 0.45) isTwoColumn = true;
379:     }
380:   }
381: 
382:   if (isTwoColumn) {
383:     const left = lines.filter((l) => l.boundingBox.x < 0.48).sort((a, b) => {
384:       const yDiff = a.boundingBox.y - b.boundingBox.y;
385:       if (Math.abs(yDiff) < 0.012) return a.boundingBox.x - b.boundingBox.x;
386:       return yDiff;
387:     });
388:     const right = lines.filter((l) => l.boundingBox.x >= 0.48).sort((a, b) => {
389:       const yDiff = a.boundingBox.y - b.boundingBox.y;
390:       if (Math.abs(yDiff) < 0.012) return a.boundingBox.x - b.boundingBox.x;
391:       return yDiff;
392:     });
393:     return [...left, ...right];
394:   }
395: 
396:   // Single column: sort by y, then x for same y band (threshold 0.012 ~12px)
397:   const sorted = [...lines];
398:   sorted.sort((a, b) => {
399:     const yDiff = a.boundingBox.y - b.boundingBox.y;
400:     if (Math.abs(yDiff) < 0.012) return a.boundingBox.x - b.boundingBox.x;
401:     return yDiff;
402:   });
403:   return sorted;
404: }
405: 
406: export function parseQuestionsFromTextract(
407:   ocr: OcrDocumentResult,
408:   pages: DocumentPage[],
409:   options?: { minConfidence?: number }
410: ): ParsedQuestion[] {
411:   // Detect expected top-level IDs from instructions (e.g., "question no. 1 to 14")
412:   const fullTextEarly = ocr.pages.map((p) => p.text).join("\n");
413:   expectedTopLevelSet = null;
414:   setExpectedTopLevelFromText(fullTextEarly);
415:   const pageByNumber = new Map<number, DocumentPage>();
416:   for (const p of pages) pageByNumber.set(p.pageNumber, p);
417: 
418:   // Flatten lines in reading order per page, then pages in order
419:   const allLines: (OcrLine & { pageId: string })[] = [];
420:   for (const pg of [...ocr.pages].sort((a, b) => a.pageNumber - b.pageNumber)) {
421:     const pageId = pageByNumber.get(pg.pageNumber)?.id || `page-${pg.pageNumber}`;
422:     const sorted = readingOrderSort(pg.lines || []);
423:     for (const l of sorted) {
424:       allLines.push({ ...l, pageId } as any);
425:     }
426:   }
427: 
428:   const questions: ParsedQuestion[] = [];
429:   let current: ParsedQuestion | null = null;
430:   let currentLines: (OcrLine & { pageId: string })[] = [];
431: 
432:   function finalizeCurrent() {
433:     if (!current) return;
434:     // Build text from currentLines remaining parts? Already have text
435:     // Merge bboxes per page
436:     const bboxesByPage = new Map<number, { x: number; y: number; width: number; height: number }[]>();
437:     const pageNumbers: number[] = [];
438:     const byPage = new Map<number, typeof currentLines>();
439:     for (const l of currentLines) {
440:       const pn = (l as any).pageNumber as number;
441:       if (!byPage.has(pn)) byPage.set(pn, []);
442:       byPage.get(pn)!.push(l);
443:     }
444:     for (const [pn, ls] of byPage) {
445:       pageNumbers.push(pn);
446:       // Union boxes per page? For highlight we want per-line boxes, but union is simpler for single highlight. Keep per-line boxes for exact highlights.
447:       const boxes = ls.map((l) => ({ ...l.boundingBox }));
448:       bboxesByPage.set(pn, boxes);
449:     }
450:     // Confidence avg
451:     const avgConf = currentLines.length ? currentLines.reduce((a, l) => a + (l.confidence || 0.9), 0) / currentLines.length : 0.85;
452:     current.confidence = avgConf;
453:     current.pageNumbers = [...pageNumbers].sort((a, b) => a - b);
454:     current.bboxesByPage = bboxesByPage;
455:     // Extract marks from text
456:     const { marks, cleaned } = extractMarks(current.text);
457:     if (marks) {
458:       current.marks = marks;
459:       current.text = cleaned;
460:       current.rawText = cleaned;
461:     }
462:     // Determine depth/partType via normalizeNumber
463:     const parsed = normalizeNumber(current.rawNumber);
464:     current.normalizedNumber = parsed.normalized;
465:     current.depth = parsed.depth;
466:     current.partType = parsed.partType;
467:     current.parent = parsed.parent;
468: 
469:     questions.push(current);
470:     current = null;
471:     currentLines = [];
472:   }
473: 
474:   let inVisuallyImpairedBlock = false;
475:   let lastTopBeforeBlock = 0;
476:   for (const line of allLines) {
477:     const text = line.text.trim();
478:     if (!text) continue;
479:     const bbox = (line as any).boundingBox as { x: number; y: number; width: number; height: number } | undefined;
480: 
481:     // Visually impaired alternative block: generic skip until next valid top-level question
482:     if (/For Visually Impaired/i.test(text)) {
483:       inVisuallyImpairedBlock = true;
484:       // Remember last top-level number before block for exit condition
485:       const tops = questions.filter((q) => q.depth === 0);
486:       if (tops.length) {
487:         const last = tops[tops.length - 1];
488:         const m = last.normalizedNumber.match(/^(\d+)/);
489:         if (m) lastTopBeforeBlock = parseInt(m[1], 10);
490:       } else if (current) {
491:         const m = current.normalizedNumber.match(/^(\d+)/);
492:         if (m) lastTopBeforeBlock = parseInt(m[1], 10);
493:       }
494:       continue;
495:     }
496:     if (inVisuallyImpairedBlock) {
497:       // Exit when we encounter next valid top-level question at left margin with number > lastTopBeforeBlock
498:       const maybeLabel = detectLabel(text, bbox);
499:       if (maybeLabel) {
500:         const nm = maybeLabel.rawNumber.match(/^(\d+)/);
501:         const n = nm ? parseInt(nm[1], 10) : 0;
502:         if (n > lastTopBeforeBlock && n <= 50 && bbox && bbox.x < 0.12) {
503:           inVisuallyImpairedBlock = false;
504:           // fall through to normal processing for this line
505:         } else {
506:           continue;
507:         }
508:       } else {
509:         // Also check if this line looks like next question without explicit detectLabel due to header filtering?
510:         // If text at left margin looks like digit, keep skipping
511:         continue;
512:       }
513:     }
514: 
515:     // Always skip headers/footers, marks, table cells — never become questions nor continuations
516:     if (isPageHeaderFooter(text, bbox)) continue;
517:     if (isMarksLine(text, bbox)) continue;
518:     if (isTableCell(text, bbox)) continue;
519:     if (isSectionOrInstruction(text)) continue;
520:     // MCQ option handling — multi-signal (pattern + indentation + length)
521:     if (isOptionLine(text, bbox)) {
522:       if (current) {
523:         const optMatch = text.trim().match(/^\s*\(?\s*([a-dA-D])\s*[\)\.\]]\s*(.*)$/);
524:         const label = optMatch ? optMatch[1].toUpperCase() : "A";
525:         const optText = optMatch ? optMatch[2].trim() : text.trim();
526:         if (!current.options) current.options = [];
527:         current.options.push({ label, text: optText, rawText: text.trim(), bbox: bbox ? { ...bbox } : undefined });
528:         // Keep geometry for provenance but not as separate question
529:         currentLines.push(line);
530:         // Also append minimal hint to text for context but preserve options separately (UI will render options)
531:         // Do not duplicate full option text into question stem — keep stem clean
532:       }
533:       continue;
534:     }
535: 
536:       const detected = detectLabel(text, (line as any).boundingBox);
537:       if (detected) {
538:         // Guard duplicated label: if detected number equals current's number and remaining is short continuation, merge instead of new
539:         if (current && detected.rawNumber === current.rawNumber && detected.remaining.length < 30) {
540:         const sep = current.text ? " " : "";
541:         current.text += sep + detected.remaining;
542:         current.rawText += sep + detected.remaining;
543:         currentLines.push(line);
544:         continue;
545:       }
546:       // Check if this is actually a continuation of current (e.g., "84 respectively..." inside Q27, or "1. If Vidhi..." inside Q30)
547:       if (current) {
548:         const bbox = (line as any).boundingBox as { x: number; y: number; width: number; height: number } | undefined;
549:         const curNumMatch = current.normalizedNumber.match(/^(\d+)/);
550:         const detNumMatch = detected.rawNumber.match(/^(\d+)/);
551:         const curNum = curNumMatch ? parseInt(curNumMatch[1], 10) : 0;
552:         const detNum = detNumMatch ? parseInt(detNumMatch[1], 10) : 0;
553:         const isIndented = bbox ? bbox.x > 0.09 : false;
554:         const currentEndsWithAnd = /and\s*$/.test(current.text.trim()) || /,\s*$/.test(current.text.trim());
555:         // Case 1: "84 respectively..." continuation of Q27 where current ends with "and"
556:         if (currentEndsWithAnd && isIndented && detNum > 0) {
557:           const sep = current.text ? " " : "";
558:           current.text += sep + text;
559:           current.rawText += sep + text;
560:           currentLines.push(line);
561:           continue;
562:         }
563:         // Case 2: numbered list inside a question like Q30's "1. If Vidhi..." "2. If Unnati..."
564:         if (isIndented && detNum > 0 && detNum < curNum && detNum <= 3 && curNum >= 10) {
565:           const sep = current.text ? " " : "";
566:           current.text += sep + text;
567:           current.rawText += sep + text;
568:           currentLines.push(line);
569:           continue;
570:         }
571:       }
572:       // New question starts
573:       finalizeCurrent();
574:       const { rawNumber, remaining } = detected;
575:       // Synthesize missing top-level parent if label like "21.(A)" appears without prior "21"
576:       const parsedForParent = normalizeNumber(rawNumber);
577:       if (parsedForParent.parent && parsedForParent.depth > 0) {
578:         const parentNorm = parsedForParent.parent;
579:         const parentExists = questions.some((q) => q.normalizedNumber === parentNorm) || (current && current.normalizedNumber === parentNorm);
580:         if (!parentExists) {
581:           // Create synthetic parent placeholder for internal-choice questions like "21.(A)" without explicit "21"
582:           const synthetic: ParsedQuestion = {
583:             rawNumber: parentNorm,
584:             normalizedNumber: parentNorm,
585:             displayNumber: parentNorm,
586:             text: `Question ${parentNorm}`,
587:             rawText: `Question ${parentNorm}`,
588:             pageNumbers: [(line as any).pageNumber as number],
589:             bboxesByPage: new Map([[(line as any).pageNumber as number, [{ ...(line as any).boundingBox }]]]),
590:             confidence: 0.6,
591:             depth: 0,
592:             partType: "QUESTION",
593:             options: [],
594:           };
595:           questions.push(synthetic);
596:         }
597:       }
598:       current = {
599:         rawNumber,
600:         normalizedNumber: rawNumber, // will be normalized at finalize
601:         displayNumber: rawNumber,
602:         text: remaining,
603:         rawText: remaining,
604:         pageNumbers: [],
605:         bboxesByPage: new Map(),
606:         confidence: 0.85,
607:         depth: 0,
608:         partType: "QUESTION",
609:         options: [],
610:       };
611:       currentLines = [line];
612:     } else {
613:       // Standalone subpart like "(a)" or "(i)" or "i." — treat as child if current is numeric parent, else append
614:       const romanDotMatch = text.match(STANDALONE_ROMAN_DOT_RE);
615:       const parenMatch = text.match(STANDALONE_SUBPART_RE);
616:       const subM = parenMatch || romanDotMatch;
617:       if (current && subM) {
618:         const isParen = !!parenMatch;
619:         if (subM) {
620:           finalizeCurrent();
621:           let rawInner: string;
622:           let isRoman: boolean;
623:           let isLetter: boolean;
624:           if (isParen) {
625:             rawInner = (subM as RegExpMatchArray)[1].toLowerCase();
626:             isRoman = /^[ivx]+$/i.test(rawInner) && rawInner.length <= 4;
627:             isLetter = /^[a-z]$/i.test(rawInner);
628:           } else {
629:             rawInner = (subM as RegExpMatchArray)[1].toLowerCase();
630:             isRoman = true;
631:             isLetter = false;
632:           }
633:           const rawNumber = `(${rawInner})`;
634:           const remaining = text.slice((subM as RegExpMatchArray)[0].length).trim();
635:           // Hierarchical parent discovery
636:           let parentCandidate: ParsedQuestion | undefined;
637:           const last = questions[questions.length - 1];
638:           if (isRoman) {
639:             if (last && last.depth === 2) {
640:               const grandParentNorm = last.parent;
641:               parentCandidate = questions.find((q) => q.normalizedNumber === grandParentNorm);
642:             } else if (last && last.depth === 1 && /\([a-d]\)$/i.test(last.normalizedNumber)) {
643:               // e.g., 11(a) -> (i) nested to 11(a)(i)
644:               parentCandidate = last;
645:             } else {
646:               parentCandidate = [...questions].reverse().find((q) => q.depth === 0);
647:             }
648:           } else if (isLetter) {
649:             parentCandidate = [...questions].reverse().find((q) => q.depth === 0);
650:           } else {
651:             parentCandidate = [...questions].reverse().find((q) => q.depth === 0);
652:           }
653:           if (parentCandidate) {
654:             const depth = isRoman && parentCandidate.depth === 1 ? 2 : 1;
655:             const partType = depth === 2 ? "SUBPART" : "PART";
656:             current = {
657:               rawNumber: `${parentCandidate.normalizedNumber}${rawNumber}`,
658:               normalizedNumber: `${parentCandidate.normalizedNumber}${rawNumber}`,
659:               displayNumber: `(${rawInner})`,
660:               text: remaining,
661:               rawText: remaining,
662:               pageNumbers: [],
663:               bboxesByPage: new Map(),
664:               confidence: 0.85,
665:               depth,
666:               partType: partType as any,
667:               parent: parentCandidate.normalizedNumber,
668:               options: [],
669:             };
670:             currentLines = [line];
671:             continue;
672:           }
673:         }
674:       }
675:       // Continuation of current question, or stray text before first question (skip instructions)
676:       if (current) {
677:         const sep = current.text ? " " : "";
678:         current.text += sep + text;
679:         current.rawText += sep + text;
680:         currentLines.push(line);
681:       } else {
682:         // No current question yet, line is likely heading/instructions — skip
683:         continue;
684:       }
685:     }
686:   }
687:   finalizeCurrent();
688: 
689:   // Post-process: filter and validate
690:   let filtered = questions.filter((q) => {
691:     if (q.text.trim().length > 10) return true;
692:     const firstBox = q.bboxesByPage.get(q.pageNumbers[0]!)?.[0];
693:     const hasFooterPageNumber = q.pageNumbers.length === 1 && (firstBox?.y ?? 0) > 0.92 && /^\d+$/.test(q.rawNumber) && q.text.length < 5;
694:     if (hasFooterPageNumber) return false;
695:     // Instruction-like text should be excluded even if length >10
696:     if (isSectionOrInstruction(q.text) && q.text.length > 30) return false;
697:     if (q.text.trim().length > 0 && q.marks !== undefined) return true;
698:     return q.text.trim().length > 0;
699:   });
700: 
701:   // Deduplicate: same normalizedNumber must be single logical question (cross-page continuation)
702:   // Previous 37(i) duplicate across OCR split caused 6 subs instead of 3
703:   const deduped: ParsedQuestion[] = [];
704:   for (const q of filtered) {
705:     const last = deduped[deduped.length - 1];
706:     // Consecutive exact duplicate (same parent same number) → merge always, keep longest text + union boxes
707:     if (last && last.normalizedNumber === q.normalizedNumber) {
708:       // Merge text if not already contained
709:       if (!last.text.includes(q.text) && !q.text.includes(last.text)) {
710:         last.text += " " + q.text;
711:         last.rawText += " " + q.rawText;
712:       } else if (q.text.length > last.text.length) {
713:         last.text = q.text;
714:         last.rawText = q.rawText;
715:       }
716:       for (const [pn, boxes] of q.bboxesByPage) {
717:         if (!last.bboxesByPage.has(pn)) last.bboxesByPage.set(pn, []);
718:         last.bboxesByPage.get(pn)!.push(...boxes);
719:       }
720:       for (const pn of q.pageNumbers) if (!last.pageNumbers.includes(pn)) last.pageNumbers.push(pn);
721:       // Merge options if any
722:       if (q.options && q.options.length) {
723:         if (!last.options) last.options = [];
724:         for (const o of q.options) if (!last.options.some((x) => x.label === o.label)) last.options.push(o);
725:       }
726:       continue;
727:     }
728:     // Non-consecutive duplicate anywhere (e.g., later duplicate of 37(i) after 37(iii) block) → merge into first occurrence
729:     const existing = deduped.find((x) => x.normalizedNumber === q.normalizedNumber);
730:     if (existing) {
731:       if (!existing.text.includes(q.text) && q.text.length > 10) {
732:         if (!existing.text.includes(q.text)) existing.text += " " + q.text;
733:       }
734:       for (const [pn, boxes] of q.bboxesByPage) {
735:         if (!existing.bboxesByPage.has(pn)) existing.bboxesByPage.set(pn, []);
736:         existing.bboxesByPage.get(pn)!.push(...boxes);
737:       }
738:       for (const pn of q.pageNumbers) if (!existing.pageNumbers.includes(pn)) existing.pageNumbers.push(pn);
739:       continue;
740:     }
741:     deduped.push(q);
742:   }
743: 
744:   // MCQ false-positive guard: single "(A)" under a subpart is not an MCQ if no sibling (B) exists nearby
745:   // Demote single-option questions back to text (preserves hierarchy, avoids 37(iii):1)
746:   for (const q of deduped) {
747:     if (q.options && q.options.length === 1) {
748:       const opt = q.options[0];
749:       // Check if sibling option (B) exists elsewhere as another question with same parent? If not, it's isolated (A) -> internal choice without B captured, treat as text
750:       const siblingExists = deduped.some((x) => x !== q && x.parent === q.parent && x.normalizedNumber !== q.normalizedNumber) || q.text.length > 120;
751:       if (!siblingExists) {
752:         // Demote: append option back into text
753:         q.text = (q.text ? q.text + " " : "") + `(${opt.label}) ${opt.text}`;
754:         q.rawText = (q.rawText ? q.rawText + " " : "") + opt.rawText;
755:         q.options = [];
756:       }
757:     }
758:   }
759: 
760:   // Structural validation: if we detect far more top-level than reported count, flag but don't hardcode
761:   // Top-level = depth 0
762:   const topLevel = deduped.filter((q) => q.depth === 0);
763:   // If topLevel > 60, likely over-segmentation; log warning and check for option leakage
764:   if (topLevel.length > 60) {
765:     console.warn(`[question-parser] anomaly: ${topLevel.length} top-level questions detected, likely over-segmentation`);
766:   }
767: 
768:   return deduped;
769: }

(End of file - total 769 lines)
</content>
```

---

## Assistant (Build · Muse Spark 1.2 Free · 2.7s)

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\src\\lib\\structure\\answer-segmentation.ts"
}
```

**Output:**
```
<path>E:\vedaAi\src\lib\structure\answer-segmentation.ts</path>
<type>file</type>
<content>
1: import type { OcrDocumentResult, OcrLine } from "@/lib/ocr/types";
2: import type { DocumentPage } from "@/types";
3: import { normalizeNumber } from "./numbering";
4: 
5: export interface SegmentedAnswer {
6:   questionLabel?: string;
7:   normalizedLabel?: string;
8:   text: string;
9:   pageNumbers: number[];
10:   bboxesByPage: Map<number, { x: number; y: number; width: number; height: number }[]>;
11:   lines: OcrLine[];
12:   confidence: number;
13:   orderIndex: number;
14: }
15: 
16: const PAGE_HEADER_RE = /(Page\s*\d+\s*of\s*\d+|Please note that the assessment scheme|Space for writing|Question Number|Rough work)/i;
17: const PRINTED_HEADER_PHRASES = [
18:   /Space for writing/i,
19:   /Question Number/i,
20:   /Rough work/i,
21:   /^\s*SECTION\s*[A-E]/i,
22:   /^\s*For Visually Impaired/i,
23:   /^\s*Mathematics Standard/i,
24: ];
25: 
26: // Strict label: prefix required OR bare number with punctuation at left margin
27: // Valid with prefix: Ans 1, Ans. 1, Answer 1, Q1, Q.1, Q 1, Question 1
28: // Valid bare: 1., 1), 1(a), 37(i) etc at left margin (x <0.15)
29: // Invalid: standalone "1" or "101" or "L1" or math "101x"
30: const ANS_PREFIX_RE = /^\s*Ans\.?\s*\.?\s*/i;
31: const ANS_FUZZY_PREFIX_RE = /^\s*An[a-z]{1,2}\s*\.?\s*/i; // catches Anss, Anst, Anslo OCR errors but still starts with An
32: const Q_PREFIX_RE = /^\s*Q(?:uestion)?\.?\s*/i;
33: 
34: function isHeaderOrPrinted(text: string, bbox?: { x: number; y: number; width: number; height: number }): boolean {
35:   const t = text.trim();
36:   if (!t) return true;
37:   if (PAGE_HEADER_RE.test(t)) return true;
38:   for (const re of PRINTED_HEADER_PHRASES) if (re.test(t)) return true;
39:   // page number alone at top/bottom
40:   if (/^\s*\d+\s*$/.test(t) && bbox && (bbox.y < 0.06 || bbox.y > 0.90)) return true;
41:   // short numeric at header band
42:   if (bbox && bbox.y < 0.08 && /^\s*\d+\s*$/.test(t) && t.length <= 3) return true;
43:   return false;
44: }
45: 
46: function mapOcrDigits(s: string): string {
47:   // generic OCR confusion: l/I/|/t ->1, O/o ->0
48:   return s.replace(/[lI|tT]/g, "1").replace(/[oO]/g, "0");
49: }
50: 
51: function extractNumericLabel(text: string, hasPrefix: boolean, bbox?: { x: number; y: number; width: number; height: number }): { raw: string; normalized: string; remaining: string } | null {
52:   const trimmed = text.trim();
53:   if (!trimmed) return null;
54:   if (trimmed.length > 40) return null; // label lines are short
55: 
56:   // If has Ans/Q prefix, extract number after prefix fuzzily
57:   if (hasPrefix) {
58:     let after: string;
59:     if (/^\s*Ans/i.test(trimmed)) {
60:       // For Ans, take after first 3 chars, but handle fuzzy like Anss, Anst, Anslo
61:       const m = trimmed.match(/^\s*Ans[^\d]*([^\s]+)/i);
62:       after = m ? m[1] : "";
63:       // remaining after number token - allow t as 1 for OCR error Anst3 ->13
64:       const fullMatch = trimmed.match(/^\s*Ans\s*\.?\s*([0-9lIoOtT]+(?:\s*\([a-z]+\))?(?:\s*\([ivx]+\))?)[\s\.\)\-:]*/i);
65:       if (fullMatch) {
66:         const numPart = mapOcrDigits(fullMatch[1].trim());
67:         if (!/\d/.test(numPart)) return null;
68:         const rawCandidate = `Ans ${numPart}`.trim();
69:         if (numPart.length > 6) return null;
70:         const parsed = normalizeNumber(numPart);
71:         if (!/\d/.test(parsed.normalized)) return null;
72:         const n = parseInt(parsed.normalized.match(/^(\d+)/)?.[1] || "0", 10);
73:         if (n < 1 || n > 100) return null;
74:         const remaining = trimmed.slice(fullMatch[0].length).trim();
75:         // remaining should not start with letter directly attached without space? but okay
76:         return { raw: rawCandidate, normalized: parsed.normalized, remaining };
77:       }
78:       // Fallback: any Ans-like line with <20 chars at left margin, treat as label even if number garbled
79:       // This prevents over-merge when OCR misreads number completely
80:       if (trimmed.length < 20 && bbox && bbox.x < 0.20) {
81:         // Check if line is short and starts with Ans
82:         const isAnsLine = /^\s*Ans/i.test(trimmed) && trimmed.length < 20;
83:         if (isAnsLine) {
84:           // Try to find any digit-like chars
85:           const digits = mapOcrDigits(trimmed).match(/\d+/);
86:           if (digits) {
87:             const num = digits[0];
88:             const parsed = normalizeNumber(num);
89:             const remaining = trimmed.replace(/^\s*Ans[^\d]*/i, "").replace(num, "").trim().replace(/^[\.\)\-:\s]+/, "");
90:             return { raw: `Ans ${num}`, normalized: parsed.normalized, remaining };
91:           }
92:           // No digits found but still Ans line -> mark as unknown label boundary
93:           // Use placeholder normalized as "?" but still treat as label to split
94:           return { raw: trimmed.split(/\s+/)[0], normalized: "__unknown__", remaining: trimmed.slice(trimmed.split(/\s+/)[0].length).trim() };
95:         }
96:       }
97:       return null;
98:     }
99:     if (/^\s*Q/i.test(trimmed)) {
100:       const m = trimmed.match(/^\s*Q(?:uestion)?\.?\s*([0-9lIoOtT]+(?:\s*\([a-z]+\))?(?:\s*\([ivx]+\))?)/i);
101:       if (!m) return null;
102:       const numPart = mapOcrDigits(m[1].trim());
103:       if (!/\d/.test(numPart)) return null;
104:       const parsed = normalizeNumber(numPart);
105:       const n = parseInt(parsed.normalized.match(/^(\d+)/)?.[1] || "0", 10);
106:       if (n < 1 || n > 100) return null;
107:       const full = m[0];
108:       const remaining = trimmed.slice(full.length).trim().replace(/^[\.\)\-:\s]+/, "");
109:       return { raw: `Q${numPart}`, normalized: parsed.normalized, remaining };
110:     }
111:   }
112: 
113:   // No prefix: bare number at left margin with punctuation
114:   // Require left margin and punctuation or parentheses
115:   const isLeft = !bbox || bbox.x < 0.15;
116:   if (!isLeft) return null;
117:   // Bare number must have punctuation or parentheses to be valid
118:   // Patterns: "1.", "1)", "1(a)", "37(i)", "37(ii)" etc
119:   const bareMatch = trimmed.match(/^\s*(\d+[a-z]?(?:\s*\([a-z]\))?(?:\s*\([ivx0-9]+\))?)\s*[\.\)]\s*/i);
120:   if (bareMatch) {
121:     const numPart = bareMatch[1].trim();
122:     if (!/\d/.test(numPart)) return null;
123:     const parsed = normalizeNumber(numPart);
124:     const n = parseInt(parsed.normalized.match(/^(\d+)/)?.[1] || "0", 10);
125:     if (n < 1 || n > 100) return null;
126:     const remaining = trimmed.slice(bareMatch[0].length).trim();
127:     // Ensure remaining does not start with letter directly without space? Already handled
128:     // For bare, require remaining either empty or starts with space/upper or not immediate digit
129:     return { raw: numPart, normalized: parsed.normalized, remaining };
130:   }
131:   // Also bare with parentheses and no dot: "1(a)" or "37(i)"
132:   const bareParen = trimmed.match(/^\s*(\d+\s*\([a-z]\)|\d+\s*\([ivx]+\))\s*[\s\.\)\-:]*/i);
133:   if (bareParen) {
134:     const numPart = bareParen[1].trim().replace(/\s+/g, "");
135:     const parsed = normalizeNumber(numPart);
136:     const n = parseInt(parsed.normalized.match(/^(\d+)/)?.[1] || "0", 10);
137:     if (n < 1 || n > 100) return null;
138:     const remaining = trimmed.slice(bareParen[0].length).trim();
139:     return { raw: numPart, normalized: parsed.normalized, remaining };
140:   }
141:   return null;
142: }
143: 
144: function detectAnswerLabel(text: string, bbox?: { x: number; y: number; width: number; height: number }, confidence?: number): { raw: string; normalized: string; remaining: string } | null {
145:   const trimmed = text.trim();
146:   if (!trimmed) return null;
147:   if (PAGE_HEADER_RE.test(trimmed)) return null;
148:   // Filter page numbers at top/bottom
149:   if (/^\s*\d+\s*$/.test(trimmed) && bbox && (bbox.y < 0.06 || bbox.y > 0.92)) return null;
150:   // Option lines (A) (B) etc at interior x should not be label
151:   if (/^\s*\(\s*[A-Da-d]\s*\)/.test(trimmed) && bbox && bbox.x > 0.07) return null;
152:   if (/^\s*[A-Da-d]\s*[\)\.\]]/.test(trimmed) && bbox && bbox.x > 0.07 && trimmed.length < 30) {
153:     // Could be option, check if indented
154:     if (bbox.x > 0.10) return null;
155:   }
156:   // Very short isolated digit without prefix should not be label
157:   if (/^\s*\d+\s*$/.test(trimmed) && trimmed.length <= 2) return null;
158:   // Math expression starting with digit but followed immediately by letter without punctuation (e.g., "101x") should not be label
159:   if (/^\s*\d+[a-zA-Z]/.test(trimmed) && !/^\s*\d+\s*[\.\)\(]/.test(trimmed)) {
160:     // Check if second char is letter without separator
161:     const m = trimmed.match(/^\s*(\d+)([a-zA-Z])/);
162:     if (m && m[2] && !/[\s\.\)\(]/.test(trimmed[m[0].length - 1] || "")) {
163:       // "101x" -> digit+letter immediately -> not label
164:       return null;
165:     }
166:   }
167:   // Confidence filter: very low confidence isolated token not label
168:   if (confidence !== undefined && confidence < 0.35 && /^\s*\d+\s*$/.test(trimmed)) return null;
169: 
170:   const lower = trimmed.toLowerCase();
171:   const hasAnsPrefix = /^\s*an/i.test(trimmed) && trimmed.length < 12 && bbox !== undefined && bbox.x < 0.20 && /[0-9s]/i.test(trimmed.slice(2, 6));
172:   const hasQPrefix = /^\s*Q/i.test(trimmed);
173: 
174:   if (hasAnsPrefix) {
175:     const r = extractNumericLabel(trimmed, true, bbox);
176:     if (r) return r;
177:     // Even if extraction fails, if line is short and starts with Ans at left margin, treat as label boundary with unknown
178:     if (trimmed.length < 22 && bbox && bbox.x < 0.20) {
179:       const lower = trimmed.toLowerCase();
180:       if (lower.startsWith("ans") || lower.startsWith("an8") || lower.startsWith("an5")) {
181:         // Try to find any digit after
182:         const mapped = mapOcrDigits(trimmed);
183:         const dig = mapped.match(/\d+/);
184:         if (dig) {
185:           const parsed = normalizeNumber(dig[0]);
186:           const remaining = trimmed.slice(trimmed.indexOf(dig[0]) + dig[0].length).trim().replace(/^[\.\)\-:\s]+/, "");
187:           return { raw: `Ans ${dig[0]}`, normalized: parsed.normalized, remaining };
188:         }
189:         return { raw: trimmed.split(/\s+/)[0], normalized: "__unknown__", remaining: trimmed.slice(trimmed.split(/\s+/)[0].length).trim() };
190:       }
191:     }
192:     return null;
193:   }
194:   if (hasQPrefix) {
195:     const r = extractNumericLabel(trimmed, true, bbox);
196:     return r;
197:   }
198:   // For answer sheet, bare numbers without Ans/Q prefix are NOT labels, except those with parentheses (e.g., 11(a), 37(i))
199:   // This prevents step numbers like "1.", "2." inside answer from splitting, but allows 11(a) as in test
200:   const isLeft = !bbox || bbox.x < 0.15;
201:   if (isLeft) {
202:     const bareParen = trimmed.match(/^\s*(\d+\s*\([a-z]\)|\d+\s*\([ivx]+\))\s*[\s\.\)\-:]*/i);
203:     if (bareParen) {
204:       const numPart = bareParen[1].trim().replace(/\s+/g, "");
205:       const parsed = normalizeNumber(numPart);
206:       const n = parseInt(parsed.normalized.match(/^(\d+)/)?.[1] || "0", 10);
207:       if (n >= 1 && n <= 100) {
208:         const remaining = trimmed.slice(bareParen[0].length).trim();
209:         return { raw: numPart, normalized: parsed.normalized, remaining };
210:       }
211:     }
212:   }
213:   return null;
214: }
215: 
216: function readingOrderSort(lines: OcrLine[]): OcrLine[] {
217:   const sorted = [...lines];
218:   sorted.sort((a, b) => {
219:     const yDiff = a.boundingBox.y - b.boundingBox.y;
220:     if (Math.abs(yDiff) < 0.01) return a.boundingBox.x - b.boundingBox.x;
221:     return yDiff;
222:   });
223:   return sorted;
224: }
225: 
226: export function segmentAnswersFromTextract(
227:   ocr: OcrDocumentResult,
228:   pages: DocumentPage[]
229: ): SegmentedAnswer[] {
230:   const pageByNumber = new Map<number, DocumentPage>();
231:   for (const p of pages) pageByNumber.set(p.pageNumber, p);
232: 
233:   const allLines: (OcrLine & { pageId: string; pageNumber: number })[] = [];
234:   for (const pg of [...ocr.pages].sort((a, b) => a.pageNumber - b.pageNumber)) {
235:     const sorted = readingOrderSort(pg.lines || []);
236:     for (const l of sorted) {
237:       allLines.push({ ...l, pageNumber: pg.pageNumber } as any);
238:     }
239:   }
240: 
241:   if (allLines.length === 0) return [];
242: 
243:   // Adaptive gap: median line height *1.8, min 0.02
244:   const heights = allLines.map((l) => l.boundingBox.height).filter((h) => h > 0).sort((a, b) => a - b);
245:   const medianH = heights.length ? heights[Math.floor(heights.length / 2)] : 0.025;
246:   const adaptiveGap = Math.max(0.02, medianH * 1.8);
247: 
248:   const segments: SegmentedAnswer[] = [];
249:   let current: SegmentedAnswer | null = null;
250:   let currentLines: (OcrLine & { pageNumber: number })[] = [];
251:   let expectedNext = 1;
252: 
253:   function finalize() {
254:     if (!current || currentLines.length === 0) return;
255:     const byPage = new Map<number, typeof currentLines>();
256:     for (const l of currentLines) {
257:       const pn = l.pageNumber;
258:       if (!byPage.has(pn)) byPage.set(pn, []);
259:       byPage.get(pn)!.push(l);
260:     }
261:     const bboxesByPage = new Map<number, { x: number; y: number; width: number; height: number }[]>();
262:     const pageNumbers: number[] = [];
263:     for (const [pn, ls] of byPage) {
264:       pageNumbers.push(pn);
265:       bboxesByPage.set(
266:         pn,
267:         ls.map((l) => ({ ...l.boundingBox }))
268:       );
269:     }
270:     current.pageNumbers = [...pageNumbers].sort((a, b) => a - b);
271:     current.bboxesByPage = bboxesByPage;
272:     current.lines = [...currentLines];
273:     // Confidence weighted, but filter extremely low
274:     const validConfs = currentLines.map((l) => l.confidence || 0.85).filter((c) => c > 0);
275:     current.confidence = validConfs.length ? validConfs.reduce((a, b) => a + b, 0) / validConfs.length : 0.85;
276:     // Text already built via current.text
277:     segments.push(current);
278:     current = null;
279:     currentLines = [];
280:   }
281: 
282:   for (const line of allLines) {
283:     const text = line.text.trim();
284:     const bbox = (line as any).boundingBox as { x: number; y: number; width: number; height: number } | undefined;
285:     const conf = (line as any).confidence as number | undefined;
286: 
287:     if (!text) continue;
288:     if (isHeaderOrPrinted(text, bbox)) continue;
289:     // Blank/noise filter: very short isolated symbols with low confidence
290:     if (text.length < 3 && (conf || 0) < 0.55) continue;
291:     if (/^[^\w]*$/.test(text) && text.length < 6) continue;
292:     // Isolated single char at interior not label -> skip if low conf
293:     if (/^\s*[^\w\s]\s*$/.test(text) && text.length === 1) continue;
294: 
295:     const detected = detectAnswerLabel(text, bbox, conf);
296:     if (detected) {
297:       let normalized = detected.normalized;
298:       let raw = detected.raw;
299:       let remaining = detected.remaining;
300:       // Infer unknown Ans labels via expectedNext (handles OCR garble like Anss -> 8)
301:       if (normalized === "__unknown__") {
302:         normalized = String(expectedNext);
303:         raw = `Ans ${normalized}`;
304:       }
305:       let num = parseInt(normalized.match(/^(\d+)/)?.[1] || "0", 10);
306:       // Handle OCR extra digits for Ans-like (e.g., 817 for 17) - infer expectedNext if Ans-like at left margin
307:       if (num > 50 && bbox && bbox.x < 0.20 && text.trim().length < 15 && /^\s*An/i.test(text)) {
308:         normalized = String(expectedNext);
309:         raw = `Ans ${normalized}`;
310:         num = expectedNext;
311:       }
312:       if (num > 50) {
313:         // Likely math like 101 -> not label
314:       } else {
315:         // Handle OCR dropped leading digit: e.g., 3 vs 13, 5 vs 15 (diff 10)
316:         if (num < expectedNext && expectedNext - num === 10 && num < 10 && expectedNext >= 10) {
317:           normalized = String(expectedNext);
318:           raw = `Ans ${normalized}`;
319:           num = expectedNext;
320:         } else if (num < expectedNext && expectedNext - num > 5) {
321:           // Far smaller than expected (likely step number inside answer like Q2 inside 28) -> not new answer
322:           // Treat as continuation, not new label
323:           // Fall through
324:         } else {
325:           // Duplicate same label on same/sequential pages -> treat as continuation (single answer spanning pages or duplicate label lines)
326:           if (current && current.normalizedLabel === normalized) {
327:             const last = currentLines[currentLines.length - 1];
328:             const sequential = Math.abs(line.pageNumber - last.pageNumber) === 1;
329:             const samePage = line.pageNumber === last.pageNumber;
330:             const nearBottomTop = last.boundingBox.y > 0.50 && line.boundingBox.y < 0.35;
331:             if (sequential && nearBottomTop) {
332:               current.text += remaining ? " " + remaining : "";
333:               currentLines.push(line);
334:               expectedNext = Math.max(expectedNext, num + 1);
335:               continue;
336:             }
337:             if (samePage || sequential) {
338:               if (remaining) current.text += " " + remaining;
339:               currentLines.push(line);
340:               continue;
341:             }
342:           }
343:           finalize();
344:           current = {
345:             questionLabel: raw,
346:             normalizedLabel: normalized,
347:             text: remaining,
348:             pageNumbers: [],
349:             bboxesByPage: new Map(),
350:             lines: [],
351:             confidence: 0.85,
352:             orderIndex: segments.length,
353:           };
354:           currentLines = [line];
355:           current.text = remaining || "";
356:           expectedNext = Math.max(expectedNext, num + 1);
357:           continue;
358:         }
359:       }
360:     }
361: 
362:     // No label detected -> continuation or untagged new segment
363:     if (!current) {
364:       // No current -> start untagged segment only if substantial
365:       // Check gap from previous segment (if any)
366:       current = {
367:         questionLabel: undefined,
368:         normalizedLabel: undefined,
369:         text: text,
370:         pageNumbers: [],
371:         bboxesByPage: new Map(),
372:         lines: [],
373:         confidence: 0.85,
374:         orderIndex: segments.length,
375:       };
376:       currentLines = [line];
377:     } else {
378:       // Check gap to decide if this is actually new untagged answer without label (should be REVIEW/UNMATCHED)
379:       // For handwriting, large vertical gap + left margin + substantial previous text may indicate new answer without label
380:       const last = currentLines[currentLines.length - 1];
381:       const gap = line.boundingBox.y - (last.boundingBox.y + last.boundingBox.height);
382:       const samePage = line.pageNumber === last.pageNumber;
383:       const isLargeGap = samePage ? gap > adaptiveGap * 2.2 : gap > adaptiveGap * 1.5; // across pages, gap threshold lower
384:       const isLeftMargin = bbox ? bbox.x < 0.15 : false;
385:       const prevSubstantial = current.text.trim().length > 80 || currentLines.length >= 6;
386: 
387:       // If large gap on same page and left margin and previous substantial, consider splitting as untagged new segment
388:       // But only if not continuation across pages with same label (which we already handled via label)
389:       // For continuity across pages without label, if previous segment ends near bottom (y>0.65) and new line starts near top (y<0.25) and pages sequential, it's continuation, not split
390:       const isPageContinuation = !samePage && Math.abs(line.pageNumber - last.pageNumber) === 1 && last.boundingBox.y > 0.55 && line.boundingBox.y < 0.35;
391: 
392:       // Cross-page untagged that is not continuation should be separate (e.g., rough work on new page)
393:       if (!samePage && !isPageContinuation && prevSubstantial && line.boundingBox.y < 0.25) {
394:         finalize();
395:         current = {
396:           questionLabel: undefined,
397:           normalizedLabel: undefined,
398:           text: text,
399:           pageNumbers: [],
400:           bboxesByPage: new Map(),
401:           lines: [],
402:           confidence: 0.85,
403:           orderIndex: segments.length,
404:         };
405:         currentLines = [line];
406:         continue;
407:       }
408: 
409:       if (isLargeGap && isLeftMargin && prevSubstantial && !isPageContinuation) {
410:         if (gap > 0.06 && /^[A-Z]/.test(text)) {
411:           finalize();
412:           current = {
413:             questionLabel: undefined,
414:             normalizedLabel: undefined,
415:             text: text,
416:             pageNumbers: [],
417:             bboxesByPage: new Map(),
418:             lines: [],
419:             confidence: 0.85,
420:             orderIndex: segments.length,
421:           };
422:           currentLines = [line];
423:           continue;
424:         }
425:       }
426:       // Check for option-like lines that should stay with current (not new label)
427:       // e.g., "(A) ..." at x 0.12 should stay as part of current answer, not new segment
428:       if (/^\s*\(\s*[A-Da-d]\s*\)/.test(text) && bbox && bbox.x > 0.08) {
429:         current.text += " " + text;
430:         currentLines.push(line);
431:         continue;
432:       }
433:       // Normal continuation
434:       current.text += " " + text;
435:       currentLines.push(line);
436:     }
437:   }
438:   finalize();
439: 
440:   // Post-filter: remove blank/noise segments
441:   const filtered = segments.filter((s) => {
442:     // Keep all labeled segments even if text short (they are boundaries)
443:     if (s.questionLabel) {
444:       // But filter if label is implausible and text empty and single line low conf
445:       if (s.normalizedLabel === "__unknown__" && s.text.trim().length === 0 && s.lines.length === 1 && s.confidence < 0.6) return false;
446:       // Keep if has any text or lines
447:       return s.text.trim().length > 0 || s.lines.length >= 1;
448:     }
449:     // Untagged: keep only if substantial
450:     const txt = s.text.trim();
451:     if (txt.length < 20) return false;
452:     if (s.lines.length < 2 && txt.length < 40) return false;
453:     // Filter if average confidence very low
454:     if (s.confidence < 0.45 && txt.length < 30) return false;
455:     // Filter if looks like page number or header
456:     if (/^\s*\d+\s*$/.test(txt) && txt.length <= 3) return false;
457:     return true;
458:   });
459: 
460:   // Reassign orderIndex
461:   const result = filtered.map((s, idx) => ({ ...s, orderIndex: idx }));
462: 
463:   // Validate no catastrophic over-merge: if any segment spans >4 pages with large gaps, split it
464:   // This handles previous Q1 9-page merge: if segment pageNumbers length >4 and spans >5 pages numerically, it's likely over-merge due to missed labels
465:   // We keep as is but log warning; actual fix is label detection, not splitting here
466:   return result;
467: }

(End of file - total 467 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\src\\lib\\vision\\fusion.ts"
}
```

**Output:**
```
<path>E:\vedaAi\src\lib\vision\fusion.ts</path>
<type>file</type>
<content>
1: import type { OcrDocumentResult } from "@/lib/ocr/types";
2: import type { DocumentPage } from "@/types";
3: import type { VisionDocumentAnalysis } from "./provider";
4: import { buildCanonicalDocument, type CanonicalDocument } from "./canonical";
5: import { normalizeNumber } from "@/lib/structure/numbering";
6: 
7: /**
8:  * Fusion Layer — reconciles Textract evidence + Vision evidence + geometry
9:  * Explicit, not concatenation. Vision is evidence-only; coordinates are grounded to Textract.
10:  */
11: 
12: export interface FusionResult {
13:   canonical: CanonicalDocument;
14:   questionHintsFromVision: { rawLabel: string; normalized: string; confidence: number; pageNumber: number }[];
15:   answerHintsFromVision: { labelHint: string; normalized: string; confidence: number; pageNumber: number; isDiagram: boolean }[];
16:   diagramPages: number[];
17:   instructionRegions: { pageNumber: number; description: string }[];
18:   evidence: { type: string; source: string; score: number; explanation: string }[];
19:   warnings: string[];
20: }
21: 
22: export function fuseDocuments(
23:   ocr: OcrDocumentResult,
24:   pages: DocumentPage[],
25:   vision: VisionDocumentAnalysis | null | undefined,
26:   jobId?: string
27: ): FusionResult {
28:   const canonical = buildCanonicalDocument(ocr, pages, vision || null, jobId);
29:   const warnings: string[] = [];
30:   const evidence: FusionResult["evidence"] = [...canonical.evidence];
31: 
32:   const questionHints: FusionResult["questionHintsFromVision"] = [];
33:   const answerHints: FusionResult["answerHintsFromVision"] = [];
34:   const diagramPages: number[] = [];
35:   const instructionRegions: { pageNumber: number; description: string }[] = [];
36: 
37:   if (vision) {
38:     for (const vp of vision.pages) {
39:       // Validate Vision labels against Textract geometry — do not blindly trust coarseBox
40:       for (const qc of vp.questionCandidates || []) {
41:         let normalized = "";
42:         try {
43:           normalized = normalizeNumber(qc.rawLabel).normalized;
44:         } catch {
45:           normalized = qc.rawLabel;
46:         }
47:         // Check if Textract actually has a line with similar label (grounding)
48:         const hasGrounding = canonical.pages.some((cp) =>
49:           cp.lines.some((l) => l.text.toLowerCase().includes(qc.rawLabel.toLowerCase().slice(0, 3)) || l.text.trim().toLowerCase().startsWith(qc.rawLabel.toLowerCase().replace(/\s+/g, "")))
50:         );
51:         if (!hasGrounding) {
52:           warnings.push(`Vision label ${qc.rawLabel} page ${vp.pageNumber} has no Textract grounding — kept as REVIEW evidence, not coordinate`);
53:           evidence.push({ type: "VISION_UNGROUNDED_LABEL", source: `vision-page-${vp.pageNumber}`, score: qc.confidence * 0.5, explanation: `Vision ${qc.rawLabel} not found in Textract lines` });
54:         }
55:         questionHints.push({ rawLabel: qc.rawLabel, normalized, confidence: hasGrounding ? qc.confidence : qc.confidence * 0.5, pageNumber: vp.pageNumber });
56:       }
57:       for (const ah of vp.answerGroupHints || []) {
58:         let normalized = (ah as any).labelHint;
59:         try {
60:           if ((ah as any).labelHint) normalized = normalizeNumber((ah as any).labelHint).normalized;
61:         } catch {}
62:         answerHints.push({ labelHint: (ah as any).labelHint, normalized, confidence: (ah as any).confidence, pageNumber: vp.pageNumber, isDiagram: !!(ah as any).isDiagram });
63:         if ((ah as any).isDiagram) diagramPages.push(vp.pageNumber);
64:       }
65:       for (const vr of vp.visualRegions || []) {
66:         if (vr.type === "DIAGRAM" || vr.type === "FIGURE") diagramPages.push(vp.pageNumber);
67:         if (vr.type === "INSTRUCTION" || vr.type === "SECTION_HEADER") {
68:           instructionRegions.push({ pageNumber: vp.pageNumber, description: vr.description });
69:         }
70:       }
71:     }
72:     // Deduplicate
73:     const uniqDiagrams = [...new Set(diagramPages)].sort((a, b) => a - b);
74:     diagramPages.length = 0;
75:     diagramPages.push(...uniqDiagrams);
76:     evidence.push({ type: "FUSION_VISION_GROUNDED", source: "fusion", score: 0.82, explanation: `Fused ${questionHints.length} Q hints, ${answerHints.length} A hints, ${diagramPages.length} diagram pages` });
77:   } else {
78:     evidence.push({ type: "FUSION_TEXTRACT_ONLY", source: "fusion", score: 0.9, explanation: "Vision not invoked (easy case) — deterministic path" });
79:   }
80: 
81:   return {
82:     canonical,
83:     questionHintsFromVision: questionHints,
84:     answerHintsFromVision: answerHints,
85:     diagramPages: [...new Set(diagramPages)],
86:     instructionRegions,
87:     evidence,
88:     warnings,
89:   };
90: }

(End of file - total 90 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\src\\lib\\coordinates\\transform.ts"
}
```

**Output:**
```
<path>E:\vedaAi\src\lib\coordinates\transform.ts</path>
<type>file</type>
<content>
1: import type { NormalizedBox } from "@/types";
2: 
3: /**
4:  * Canonical normalized [0,1] coords relative to original page dims.
5:  * All transforms explicit, invertible, pure.
6:  */
7: 
8: export interface Dims {
9:   width: number;
10:   height: number;
11: }
12: 
13: export interface TransformParams {
14:   originalDims: Dims;
15:   processingDims: Dims;
16:   displayDims: Dims;
17:   rotation: number; // 0|90|180|270
18:   crop?: { x: number; y: number; width: number; height: number }; // in normalized coords
19:   scale: number; // display / original
20: }
21: 
22: export function normalizeBox(
23:   boxPx: { x: number; y: number; width: number; height: number },
24:   dims: Dims
25: ): NormalizedBox {
26:   return {
27:     x: boxPx.x / dims.width,
28:     y: boxPx.y / dims.height,
29:     width: boxPx.width / dims.width,
30:     height: boxPx.height / dims.height,
31:   };
32: }
33: 
34: export function denormalizeBox(box: NormalizedBox, dims: Dims) {
35:   return {
36:     x: box.x * dims.width,
37:     y: box.y * dims.height,
38:     width: box.width * dims.width,
39:     height: box.height * dims.height,
40:   };
41: }
42: 
43: export function scaleBox(box: NormalizedBox, scale: number): NormalizedBox {
44:   // scaling normalized is identity; display scaling handled in denormalize
45:   // but for completeness, if processing dims scaled:
46:   return { ...box };
47: }
48: 
49: export function rotateBox(box: NormalizedBox, rotation: number): NormalizedBox {
50:   const r = ((rotation % 360) + 360) % 360;
51:   if (r === 0) return { ...box };
52:   if (r === 90) {
53:     return {
54:       x: box.y,
55:       y: 1 - box.x - box.width,
56:       width: box.height,
57:       height: box.width,
58:     };
59:   }
60:   if (r === 180) {
61:     return {
62:       x: 1 - box.x - box.width,
63:       y: 1 - box.y - box.height,
64:       width: box.width,
65:       height: box.height,
66:     };
67:   }
68:   if (r === 270) {
69:     return {
70:       x: 1 - box.y - box.height,
71:       y: box.x,
72:       width: box.height,
73:       height: box.width,
74:     };
75:   }
76:   throw new Error(`Unsupported rotation ${rotation}`);
77: }
78: 
79: export function cropBox(box: NormalizedBox, crop: { x: number; y: number; width: number; height: number }): NormalizedBox {
80:   // map from cropped normalized to full normalized inverse
81:   // cropped coords are relative to crop; convert to full
82:   // Actually input box is relative to cropped region; convert to original
83:   // For now, assume box is relative to original and we want to crop: clip
84:   const x1 = Math.max(box.x, crop.x);
85:   const y1 = Math.max(box.y, crop.y);
86:   const x2 = Math.min(box.x + box.width, crop.x + crop.width);
87:   const y2 = Math.min(box.y + box.height, crop.y + crop.height);
88:   if (x2 <= x1 || y2 <= y1) return { x: 0, y: 0, width: 0, height: 0 };
89:   return {
90:     x: (x1 - crop.x) / crop.width,
91:     y: (y1 - crop.y) / crop.height,
92:     width: (x2 - x1) / crop.width,
93:     height: (y2 - y1) / crop.height,
94:   };
95: }
96: 
97: export function toDisplayBox(box: NormalizedBox, displayDims: Dims): { x: number; y: number; width: number; height: number } {
98:   return denormalizeBox(box, displayDims);
99: }
100: 
101: export function transformForDisplay(
102:   box: NormalizedBox,
103:   params: { displayDims: Dims; rotation: number; crop?: { x: number; y: number; width: number; height: number } }
104: ): NormalizedBox {
105:   let b = { ...box };
106:   if (params.crop) {
107:     // if crop defined, boxes are relative to original; display shows cropped region
108:     // we need to convert to cropped normalized
109:     const c = params.crop;
110:     b = {
111:       x: (b.x - c.x) / c.width,
112:       y: (b.y - c.y) / c.height,
113:       width: b.width / c.width,
114:       height: b.height / c.height,
115:     };
116:   }
117:   b = rotateBox(b, params.rotation);
118:   return b;
119: }
120: 
121: export function invertTransform(box: NormalizedBox, rotation: number): NormalizedBox {
122:   // rotate back
123:   const inv = (360 - rotation) % 360;
124:   return rotateBox(box, inv);
125: }
126: 
127: // Utility to merge overlapping boxes (for highlight merging)
128: export function mergeBoxes(boxes: NormalizedBox[]): NormalizedBox {
129:   if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
130:   if (boxes.length === 1) return { ...boxes[0] };
131:   const x1 = Math.min(...boxes.map((b) => b.x));
132:   const y1 = Math.min(...boxes.map((b) => b.y));
133:   const x2 = Math.max(...boxes.map((b) => b.x + b.width));
134:   const y2 = Math.max(...boxes.map((b) => b.y + b.height));
135:   return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
136: }
137: 
138: export function boxIoU(a: NormalizedBox, b: NormalizedBox): number {
139:   const x1 = Math.max(a.x, b.x);
140:   const y1 = Math.max(a.y, b.y);
141:   const x2 = Math.min(a.x + a.width, b.x + b.width);
142:   const y2 = Math.min(a.y + a.height, b.y + b.height);
143:   if (x2 <= x1 || y2 <= y1) return 0;
144:   const inter = (x2 - x1) * (y2 - y1);
145:   const union = a.width * a.height + b.width * b.height - inter;
146:   return inter / union;
147: }

(End of file - total 147 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\src\\components\\viewer\\PdfViewer.tsx"
}
```

**Output:**
```
<path>E:\vedaAi\src\components\viewer\PdfViewer.tsx</path>
<type>file</type>
<content>
1: "use client";
2: import React, { useEffect, useRef, useState } from "react";
3: import type { HighlightRegion, DocumentPage } from "@/types";
4: 
5: interface Props {
6:   pdfUrl: string;
7:   pages: DocumentPage[]; // for highlight mapping
8:   highlights: HighlightRegion[];
9:   activePageId?: string;
10: }
11: 
12: export function PdfViewer({ pdfUrl, pages, highlights, activePageId }: Props) {
13:   const containerRef = useRef<HTMLDivElement>(null);
14:   const [numPages, setNumPages] = useState<number>(0);
15:   const [error, setError] = useState<string | null>(null);
16:   const [loading, setLoading] = useState(true);
17:   const pdfRef = useRef<any>(null);
18: 
19:   const pageIdToNumber = new Map(pages.map((p) => [p.id, p.pageNumber]));
20:   const activePageNumber = activePageId ? pageIdToNumber.get(activePageId) : undefined;
21: 
22:   useEffect(() => {
23:     if (activePageNumber && containerRef.current) {
24:       const el = document.getElementById(`pdf-page-${activePageNumber}`);
25:       if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
26:     }
27:   }, [activePageNumber]);
28: 
29:   // Load PDF document (store, set numPages, don't render yet)
30:   useEffect(() => {
31:     let cancelled = false;
32:     let pdfDoc: any = null;
33:     async function load() {
34:       try {
35:         setLoading(true);
36:         setError(null);
37:         setNumPages(0);
38:         pdfRef.current = null;
39: 
40:         const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
41:         try {
42:           // @ts-ignore pdfjs worker has no declaration
43:           await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
44:           pdfjs.GlobalWorkerOptions.workerSrc = `pdfjs-dist/legacy/build/pdf.worker.mjs`;
45:         } catch {
46:           try {
47:             const version = pdfjs.version || "6.2.108";
48:             pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/legacy/build/pdf.worker.mjs`;
49:           } catch {
50:             pdfjs.GlobalWorkerOptions.workerSrc = "";
51:           }
52:         }
53: 
54:         console.log(`[PdfViewer] loading ${pdfUrl}`);
55:         const loadingTask = pdfjs.getDocument({
56:           url: pdfUrl,
57:           withCredentials: true,
58:           verbosity: 0,
59:           isEvalSupported: false,
60:           useWorkerFetch: true,
61:           disableFontFace: true,
62:         });
63: 
64:         loadingTask.onProgress = (progress: any) => {
65:           // optional progress
66:         };
67: 
68:         pdfDoc = await loadingTask.promise;
69:         if (cancelled) {
70:           // PDFDocumentProxy in pdfjs-dist 6.x uses cleanup(), loadingTask uses destroy()
71:           try {
72:             if (pdfDoc && typeof pdfDoc.cleanup === "function") pdfDoc.cleanup();
73:             else if (pdfDoc && typeof pdfDoc.destroy === "function") await pdfDoc.destroy();
74:           } catch {}
75:           try {
76:             if (loadingTask && typeof loadingTask.destroy === "function") await loadingTask.destroy();
77:           } catch {}
78:           return;
79:         }
80:         pdfRef.current = pdfDoc;
81:         console.log(`[PdfViewer] loaded ${pdfDoc.numPages} pages`);
82:         setNumPages(pdfDoc.numPages);
83:         setLoading(false);
84:       } catch (e: any) {
85:         console.error("[PdfViewer] load failed", e);
86:         if (!cancelled) {
87:           // Try fallback without worker
88:           if (String(e.message).includes("worker") || String(e.message).includes("Worker")) {
89:             try {
90:               const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
91:               pdfjs.GlobalWorkerOptions.workerSrc = "";
92:               const loadingTask2 = pdfjs.getDocument({
93:                 url: pdfUrl,
94:                 withCredentials: true,
95:                 verbosity: 0,
96:                 isEvalSupported: false,
97:                 useWorkerFetch: false,
98:                 disableFontFace: true,
99:                 // @ts-ignore - disable worker
100:                 disableWorker: true,
101:               } as any);
102:               pdfDoc = await loadingTask2.promise;
103:               if (!cancelled) {
104:                 pdfRef.current = pdfDoc;
105:                 setNumPages(pdfDoc.numPages);
106:                 setLoading(false);
107:                 setError(null);
108:                 return;
109:               }
110:             } catch (e2: any) {
111:               console.error("[PdfViewer] fallback also failed", e2);
112:             }
113:           }
114:           setError(e.message || String(e));
115:           setLoading(false);
116:         }
117:       }
118:     }
119:     if (pdfUrl) load();
120:     return () => {
121:       cancelled = true;
122:       // Use loadingTask.destroy() or pdfDoc.cleanup() per pdfjs-dist 6.x API
123:       try {
124:         if (pdfDoc) {
125:           if (typeof pdfDoc.cleanup === "function") pdfDoc.cleanup();
126:           else if (typeof pdfDoc.destroy === "function") (pdfDoc as any).destroy().catch(() => {});
127:         }
128:       } catch {}
129:       pdfRef.current = null;
130:     };
131:   }, [pdfUrl]);
132: 
133:   // Render pages after pdf loaded and canvases mounted
134:   useEffect(() => {
135:     if (!pdfRef.current || numPages === 0) return;
136:     let cancelled = false;
137:     async function renderAll() {
138:       const pdf = pdfRef.current;
139:       if (!pdf) return;
140:       for (let i = 1; i <= pdf.numPages; i++) {
141:         if (cancelled) break;
142:         // Wait for canvas to be in DOM (after numPages render)
143:         let attempts = 0;
144:         let canvas: HTMLCanvasElement | null = null;
145:         while (attempts < 10 && !canvas) {
146:           canvas = document.getElementById(`pdf-canvas-${i}`) as HTMLCanvasElement | null;
147:           if (!canvas) {
148:             await new Promise((r) => setTimeout(r, 50));
149:             attempts++;
150:           }
151:         }
152:         if (!canvas) {
153:           console.warn(`[PdfViewer] canvas pdf-canvas-${i} not found after ${attempts} attempts`);
154:           continue;
155:         }
156:         try {
157:           const page = await pdf.getPage(i);
158:           const viewport = page.getViewport({ scale: 1.5 });
159:           const ctx = canvas.getContext("2d");
160:           if (!ctx) {
161:             page.cleanup();
162:             continue;
163:           }
164:           // Handle high-DPI
165:           const dpr = window.devicePixelRatio || 1;
166:           canvas.width = viewport.width * dpr;
167:           canvas.height = viewport.height * dpr;
168:           canvas.style.width = "100%";
169:           canvas.style.height = "auto";
170:           ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
171:           await page.render({ canvasContext: ctx, viewport } as any).promise;
172:           page.cleanup();
173:         } catch (e) {
174:           console.error(`[PdfViewer] render page ${i} failed`, e);
175:         }
176:       }
177:     }
178:     // Defer to next tick to ensure DOM is painted
179:     const t = setTimeout(renderAll, 100);
180:     return () => {
181:       cancelled = true;
182:       clearTimeout(t);
183:     };
184:   }, [numPages, pages.length]);
185: 
186:   if (error) {
187:     return (
188:       <div className="flex-1 bg-[#F0F0F0] flex flex-col items-center justify-center p-6 text-center">
189:         <p className="text-sm font-medium">Failed to load answer sheet</p>
190:         <p className="text-xs text-gray-500 mt-1 max-w-[480px] break-words">{error}</p>
191:         <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#FF6B2C] mt-2 underline">
192:           Open PDF directly
193:         </a>
194:         <p className="text-[11px] text-gray-400 mt-2">If this persists, try refreshing or re-uploading.</p>
195:       </div>
196:     );
197:   }
198: 
199:   if (numPages === 0 && loading) {
200:     return (
201:       <div className="flex-1 bg-[#F0F0F0] flex flex-col items-center justify-center p-6">
202:         <span className="w-6 h-6 border-2 border-gray-300 border-t-[#FF6B2C] rounded-full animate-spin" />
203:         <span className="text-sm text-gray-500 mt-3">Loading answer sheet...</span>
204:         <span className="text-xs text-gray-400 mt-1">{pages.length ? `${pages.length} pages` : ""}</span>
205:       </div>
206:     );
207:   }
208: 
209:   const totalPages = numPages || pages.length || 1;
210:   return (
211:     <div ref={containerRef} className="flex-1 overflow-auto bg-[#E8E8E8] p-4 sm:p-6 flex flex-col items-center gap-6">
212:       {Array.from({ length: totalPages }, (_, idx) => {
213:         const pageNumber = idx + 1;
214:         const docPage = pages.find((p) => p.pageNumber === pageNumber);
215:         const pageId = docPage?.id;
216:         const pageHighlights = highlights.filter((h) => {
217:           const hlPageNum = pageIdToNumber.get(h.pageId);
218:           return hlPageNum === pageNumber || h.pageId === pageId || h.pageId === String(pageNumber) || h.pageId === `page_${pageNumber}`;
219:         });
220:         const isActive = activePageNumber === pageNumber;
221:         return (
222:           <div
223:             key={pageNumber}
224:             id={`pdf-page-${pageNumber}`}
225:             className={`relative bg-white shadow-md rounded-lg overflow-hidden shrink-0 ${isActive ? "ring-2 ring-[#FF6B2C]" : ""}`}
226:             style={{ width: "100%", maxWidth: 640 }}
227:           >
228:             <canvas id={`pdf-canvas-${pageNumber}`} className="w-full h-auto block bg-white" />
229:             <div className="absolute inset-0 pointer-events-none">
230:               {pageHighlights.map((hr, hi) =>
231:                 hr.boxes.map((box, bi) => {
232:                   const isActiveBox = isActive && hi === 0;
233:                   return (
234:                     <div
235:                       key={`${hi}-${bi}`}
236:                       className={`absolute border-2 rounded-sm ${isActiveBox ? "bg-[#FF6B2C]/20 border-[#FF6B2C] shadow-[0_0_0_2px_rgba(255,107,44,0.2)]" : "bg-amber-200/20 border-amber-400"}`}
237:                       style={{
238:                         left: `${box.x * 100}%`,
239:                         top: `${box.y * 100}%`,
240:                         width: `${box.width * 100}%`,
241:                         height: `${box.height * 100}%`,
242:                       }}
243:                     />
244:                   );
245:                 })
246:               )}
247:             </div>
248:             <div className="absolute bottom-2 right-2 text-[10px] bg-white/80 backdrop-blur px-2 py-0.5 rounded-full border shadow-sm">
249:               {pageNumber} / {numPages || totalPages}
250:             </div>
251:           </div>
252:         );
253:       })}
254:       {highlights.length === 0 && (
255:         <div className="w-full max-w-[640px] bg-white rounded-xl p-6 text-center text-sm text-gray-500 border">
256:           No reliable answer region detected
257:         </div>
258:       )}
259:     </div>
260:   );
261: }

(End of file - total 261 lines)
</content>
```

---

## Assistant (Build · Muse Spark 1.2 Free · 3.6s)

**Tool: bash**

**Input:**
```json
{
  "command": "rtk ls -la \"E:\\vedaAi\\docs\" 2>&1; echo \"---\"; cat \"E:\\vedaAi\\README.md\" 2>&1 | head -n 200; echo \"---\"; cat \"E:\\vedaAi\\TODO.md\" 2>&1 | head -n 200"
}
```

**Output:**
```
[31;1mrtk: Failed to resolve 'ls' via PATH, falling back to direct exec: Binary 'ls' not found on PATH[0m
[31;1mrtk: Failed to run ls: Failed to spawn process: program not found[0m
---
[31;1mhead: [31;1mThe term 'head' is not recognized as a name of a cmdlet, function, script file, or executable program.[0m
---
[31;1m[31;1mCheck the spelling of the name, or if a path was included, verify that the path is correct and try again.[0m
[31;1mhead: [31;1mThe term 'head' is not recognized as a name of a cmdlet, function, script file, or executable program.[0m
[31;1m[31;1mCheck the spelling of the name, or if a path was included, verify that the path is correct and try again.[0m

```

---

## Assistant (Build · Muse Spark 1.2 Free · 4.6s)

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\README.md"
}
```

**Output:**
```
<path>E:\vedaAi\README.md</path>
<type>file</type>
<content>
1: # VedaAI — AI Assessment Extraction & Answer Mapping
2: 
3: Teacher-facing Next.js application: **UPLOAD → VALIDATE → S3 → TEXTRACT (source of truth) → OCR NORMALIZE → QUESTION PARSER (deterministic) / ANSWER SEGMENTATION (geometry) → MATCH → VALIDATE → LOCALIZE → HIGHLIGHT → REVIEW** (LLM only for ambiguous semantic matching, not for OCR)
4: 
5: Upload a printed question paper (PDF/image) + a handwritten answer sheet (PDF/image) → get ordered questions with sub-parts preserved, answer regions detected, evidence-based mapping with uncertainty, and exact highlight navigation.
6: 
7: ## Table of Contents
8: 1. Product Overview
9: 2. Architecture Diagram
10: 3. Request / Job Lifecycle
11: 4. Frontend Architecture
12: 5. Backend Architecture
13: 6. AI Architecture
14: 7. OCR Pipeline
15: 8. Document-Processing Pipeline
16: 9. Mapping Architecture
17: 10. Evidence Model
18: 11. Confidence Model
19: 12. Highlight-Coordinate System
20: 13. Storage Strategy
21: 14. Error Handling
22: 15. Retry Strategy
23: 16. Deployment Architecture
24: 17. Environment Variables
25: 18. Security Considerations
26: 19. Testing Strategy
27: 20. Known Limitations
28: 21. Model / Provider Details
29: 22. Future Replacement Points
30: 23. Performance Considerations
31: 24. Local Development
32: 25. Deployment Instructions
33: 
34: ---
35: 
36: ### 1. Product Overview
37: VedaAI extracts every question in printed order (preserving raw numbering), detects labelled sub-parts as separate `QuestionNode`s, detects student answer regions (multi-box, multi-page), maps answers to questions via multi-signal evidence, and highlights exact regions in a PDF viewer. Uncertainty is first-class: weak evidence → `UNCERTAIN` / `UNMATCHED` / `UNANSWERED`, never fabricated certainty.
38: 
39: ### 2. Architecture Diagram
40: ```
41: CLIENT (Next.js App Router)            SERVER (Route Handlers)
42: UploadDropzone ──► POST /api/jobs ──► JobStore (in-memory) ──► FileStorage (tmp) ──► S3 (vedaaistorage/ocr-input)
43:       │                  │                    │                      │                     │
44:       └─► /api/jobs/:id/upload              │              PDF/image inspection    Textract async
45:                                              ▼                                   StartDocumentAnalysis
46:                                       Job lifecycle: CREATED→VALIDATING→PREPROCESSING
47:                                                         →OCR_SUBMITTED→OCR_PROCESSING→OCR_COMPLETED
48:                                                         →EXTRACTING (deterministic Textract parsers, no Vision)
49:                                                         →STRUCTURING→MATCHING (deterministic + optional LLM semantic)
50:                                                         →LOCALIZING→VALIDATING_RESULT→COMPLETED
51:                                                         →FAILED/CANCELLED
52:                                              │
53:                               ┌──────────────┼──────────────┐
54:                               │              │              │
55:                      LLM (optional)    Textract      Coordinate transforms
56:                  (semantic only)   (source of truth)  [0,1] normalized
57:                               │              │              │
58:                               └────── Evidence aggregation ─┘
59:                                              │
60:                                         Decision layer MATCHED/UNCERTAIN/UNANSWERED/UNMATCHED
61:                                         HighlightRegion (real bbox)
62:                                              │
63:                               GET /api/jobs/:id/result ──► Results UI
64:                                                             QuestionsPanel | ViewerPanel
65:                                                             HighlightOverlay → pdfjs-dist (exact)
66: ```
67: 
68: ### 3. Request / Job Lifecycle
69: Job is source of truth; no global `let currentQuestions`. `POST /api/jobs` creates job with `pipelineVersion`. Uploads attach `Document`s (questionPaper + answerSheet). `POST /api/jobs/:id/start` runs stages sequentially, updating `currentStage` + `progress.stageStates`. All stages idempotent via key `jobId+stage+pipelineVersion+documentVersion`. Client polls `GET /api/jobs/:id`.
70: 
71: ### 4. Frontend Architecture
72: App Router (`src/app/`): `/` upload → `/processing/[jobId]` → `/results/[jobId]`. State: Zustand-like local + job polling; selection state is `selectedQuestionId` → `activeHighlight` with versioning to avoid race (click Q7→Q8→Q9). Components in `src/components/ui|upload|results|viewer`. Tailwind 4, design tokens: `#FF6B2C` accent, rounded `xl`, restrained shadows.
73: 
74: ### 5. Backend Architecture
75: Route Handlers under `src/app/api/` use `lib/config` (single validated module), `lib/errors` (typed codes), `lib/jobs` (lifecycle), `lib/storage` (interfaces), `lib/logging` (pino). All AI calls server-side.
76: 
77: ### 6. AI Architecture
78: See `docs/AI_PIPELINE.md`. `AIProvider { analyzeAmbiguousMapping }` (LLM only for ambiguous semantic matching, optional). Responses validated via Zod; malformed → bounded retry (max 3, exp backoff+jitter) → `FAILED`. Vision LLM **not** used for normal extraction. See `docs/TEXTRACT_VS_VISION_AUDIT.md`.
79: 
80: ### 7. OCR Pipeline
81: `OcrProvider` → `TextractOcrProvider` (real, `StartDocumentAnalysis` + `GetDocumentAnalysis` + pagination) + `MockOcrProvider` (tests only). `OcrDocumentResult` preserves `lines/blocks/paragraphs/words` with `boundingBox [0,1]`, `confidence`, `pageNumber`, `relationships`. Reading order from geometry (y then x, x-clustering for multi-column), not OCR order. `docs/OCR_PIPELINE.md` + `docs/AWS_TEXTRACT.md`.
82: 
83: ### 8. Document-Processing Pipeline
84: File validation (magic bytes via `file-type`) before PDF work. PDF: `pdfjs-dist` inspect page count/dimensions/rotation; render at 2× for vision; preserve `original→processing` dims. Image: `sharp` orientation, cap 3000px, preserve mapping.
85: 
86: ### 9. Mapping Architecture
87: Candidate generation (label + semantic), evidence collection, scoring, conflict check, validation, decision.
88: 
89: ### 10. Evidence Model
90: `Evidence { type, source, score:0-1, reliability, explanation }` types: `EXPLICIT_LABEL`, `SEMANTIC_SIMILARITY`, `LAYOUT_CONTINUITY`, `PAGE_CONTINUITY`, `NEIGHBOR_CONTEXT`, `OCR_CONFIDENCE`, `VISUAL_EVIDENCE`, etc. Stored per candidate.
91: 
92: ### 11. Confidence Model
93: Four layers: extraction, answer-region, mapping, localization. Mapping confidence = weighted evidence sum. Thresholds in `src/lib/config/mapping.ts` (not scattered): `high>=0.75, review 0.5-0.75, low<0.5 → UNCERTAIN`).
94: 
95: ### 12. Highlight-Coordinate System
96: Canonical normalized `[0,1]` per original page dims. Transforms explicit/invertible: `scale`, `rotation 0/90/180/270`, `crop`. Util at `src/lib/coordinates/transform.ts`, tested at 0.5/1/2 and rotations.
97: 
98: ### 13. Storage Strategy
99: Interfaces `FileStorage`, `JobStore`, `ArtifactStore`. Default: `InMemoryJobStore` + `LocalFileStorage` under `os.tmpdir()/veda-ai/${jobId}`. Not durable on Vercel — documented, replaceable with S3/Redis. Lifecycle cleans on success/fail/cancel.
100: 
101: ### 14. Error Handling
102: Typed codes: `FILE_INVALID`, `FILE_TOO_LARGE`, `PDF_CORRUPTED`, `PAGE_RENDER_FAILED`, `OCR_FAILED`, `MODEL_OUTPUT_INVALID`, `MAPPING_FAILED`, etc. Surfaced per stage; UI shows stage-specific messages, not infinite spinner.
103: 
104: ### 15. Retry Strategy
105: Classify: retry on 429/timeout/5xx/network. Bounded `maxAttempts=3`, exponential backoff `base*2^n + jitter`. No retry on auth/schema-failed-after-retries/invalid-file.
106: 
107: ### 16. Deployment Architecture
108: Next.js standalone. Long processing: server holds job in memory; client polls. Verify limits (Vercel function 10s/60s → use background or self-hosted). On Vercel recommended: host pipeline on separate worker (e.g., Fly, Render) or use Vercel workflow.
109: 
110: ### 17. Environment Variables
111: **App runtime (server-only):**
112: - `OCR_PROVIDER` = `textract` | `mock` (tests only)
113: - `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_TEXTRACT_OUTPUT_BUCKET`, `AWS_S3_INPUT_PREFIX/OUTPUT_PREFIX`, `AWS_SNS_*/SQS` optional
114: - `AI_PROVIDER` = `opencode-zen` (optional semantic) | `mock` (tests)
115: - `AI_MODEL` = `laguna-s-2.1-free` (free, verified) + fallbacks `nemotron-3.5-lightning-free` etc. (see `.env.example`)
116: - `AI_API_KEY`, `AI_BASE_URL` (never NEXT_PUBLIC)
117: - `MAPPING_HIGH_THRESHOLD`, `MAPPING_REVIEW_THRESHOLD` optional
118: 
119: **Coding-agent compatibility (not app creds):**
120: - `OPENCODE_DEFAULT_MODEL`, `OPENCODE_API_KEY`, `OPENCODE_API_BASE` — mirrored via `opencode.json`
121: 
122: Validated in `src/lib/config/index.ts`; missing Textract bucket → `OCR_CONFIGURATION_ERROR` (fails clearly, never silent mock). See `.env.example` + `docs/AWS_TEXTRACT.md`.
123: 
124: ### 18. Security Considerations
125: - Sanitize filenames, generated IDs, magic-byte MIME check, size/page limits, path traversal prevention.
126: - No public guessable permanent URLs; job IDs unguessable (uuid v4).
127: - Treat OCR/text as untrusted; system/data separation mitigates prompt injection.
128: - No secrets in client bundle, logs, or error pages.
129: 
130: ### 19. Testing Strategy
131: Unit: numbering normalization, hierarchy, coordinates, evidence aggregation, grouping, stage transitions.
132: Integration: upload→job→processing→result, OCR/AI adapters (fixture responses), highlight coords.
133: E2E (Playwright): happy path plus unanswered/unmatched/mobile/reload. See `docs/TESTING.md`.
134: 
135: ### 20. Known Limitations
136: See `docs/LIMITATIONS.md`.
137: 
138: ### 21. Model / Provider Details
139: `OpenAIProvider` uses `openai` SDK; supports `openai-compatible` via `baseURL`. Vision stages send page PNGs (base64). Model version recorded per job `modelVersion`, `promptVersion`, `pipelineVersion`.
140: 
141: ### 22. Future Replacement Points
142: - `JobStore` → Redis/DB
143: - `FileStorage` → S3
144: - `OcrProvider` → Google Vision / AWS Textract
145: - `AIProvider` → Anthropic/local model
146: - All behind interfaces; no business logic changes.
147: 
148: ### 23. Performance Considerations
149: Measured on fixture (10 pages): upload ~200ms, preprocessing 1-2s, OCR 2-5s, mapping <500ms. Concurrency cap 2 to avoid rate limits. PDFs rendered streaming.
150: 
151: ### 24. Local Development
152: ```bash
153: npm install
154: cp .env.example .env   # fill AI_PROVIDER, AI_MODEL, AI_API_KEY
155: npm run typecheck
156: npm run lint
157: npm run dev            # http://localhost:3000
158: ```
159: 
160: ### 25. Deployment Instructions
161: ```bash
162: npm run build && npm start   # production validation
163: # Vercel: set env vars, note persistence limitation; or deploy Docker to Fly/Render
164: docker build -t veda-ai .
165: docker run -p 3000:3000 --env-file .env veda-ai
166: ```
167: Docs deeper: `docs/ARCHITECTURE.md`, `docs/AI_PIPELINE.md`, `docs/TESTING.md`, `docs/LIMITATIONS.md`.

(End of file - total 167 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\TODO.md"
}
```

**Output:**
```
<path>E:\vedaAi\TODO.md</path>
<type>file</type>
<content>
1: # TODO — VedaAI Audit-Driven Completion
2: 
3: ## P0 — Blocking / Fake / Broken
4: - [x] **P0-1 Secret leak**: `.env` contained real `OPENCODE_API_KEY=sk-...` — rotate, replace with placeholder, ensure `.env.example` empty, verify `.gitignore` + `git check-ignore`. **Files**: `.env`, `.env.example`, `opencode.json` **AC**: no real key in repo, `git diff` clean. **Verify**: `rg sk- src` none, `git status` no `.env` tracked. (Will be fixed next commit)
5: - [ ] **P0-2 AI default mock**: `AI_PROVIDER=mock` is unacceptable prod default — change to `opencode-zen`, default `AI_MODEL=muse-spark-1.2-contributor-free`, `AI_BASE_URL=https://opencode.ai/zen/v1`. **Files**: `src/lib/config/index.ts`, `.env.example`, `.env` **AC**: `getConfig()` defaults to zen, mock only when explicitly `AI_PROVIDER=mock` for tests. **Verify**: `npm run ai:smoke-test` uses real provider unless `mock` forced.
6: - [ ] **P0-3 OpenCode Zen Responses API**: current `OpenAIProvider` uses `chat.completions` (wrong for Zen). Implement `OpencodeZenProvider` via `https://opencode.ai/zen/v1/responses` using `openai` SDK `responses.create` or direct fetch, with `@ai-sdk/openai` compat. **Files**: `src/lib/ai/providers/opencode-zen.ts`, `src/lib/ai/factory.ts` **AC**: smoke test hits `responses` endpoint, parses JSON, success. **Verify**: `npm run ai:smoke-test` PASS with real key.
7: - [ ] **P0-4 Config separation**: `OPENCODE_*` (coding agent) vs `AI_*` (app runtime) — validate `opencode.json` per current spec (`provider @ai-sdk/openai`, baseUrl substitution). **Files**: `opencode.json`, `src/lib/config/index.ts` **AC**: `opencode.json` validated, app never reads `OPENCODE_API_KEY` as `AI_API_KEY`. **Verify**: `cat opencode.json` correct schema.
8: - [ ] **P0-5 In-memory persistence loss**: jobs lost on restart — implement Supabase fallback with graceful degradation + document retention `GUEST_RESULT_GRACE_PERIOD_MS`. **Files**: `src/lib/storage/index.ts` **AC**: if Supabase env missing, app shows config error not fake success, but still works via tmp for dev. **Verify**: restart poll retains job when Supabase configured, else warns.
9: 
10: ## P1 — Core Functional Gaps
11: - [ ] **P1-1 Real PDF rendering**: replace `placeholderPngBase64` with real render via `pdfjs-dist` + `canvas` (node). **Files**: `src/lib/documents/pdf.ts`, `src/lib/jobs/runner.ts:222` **AC**: page PNG base64 is actual rendered content, not 1×1 transparent. **Verify**: upload PDF → base64 length >10k, not 90 chars.
12: - [ ] **P1-2 Viewer real PDF**: `ViewerShell` currently fake lines — integrate `pdfjs-dist` client viewer or `react-pdf` with highlight overlay using `transformForDisplay`. **Files**: `src/components/viewer/Viewer.tsx` **AC**: viewer loads `GET /api/files/[jobId]/[fileId]` PDF, highlights stay at 100/150/200% zoom. **Verify**: manual browser highlight drift test.
13: - [ ] **P1-3 OCR provider**: create `OcrProvider` + `AiVisionOcrProvider` (uses Zen vision) + `Noop` for tests. **Files**: `src/lib/ocr/` **AC**: tokens with bbox/confidence returned, geometry preserved. **Verify**: `assessment:smoke-test` shows OCR tokens.
14: - [ ] **P1-4 Remove production mock data**: ensure `MockAIProvider` never imported when `AI_PROVIDER != mock` (guard in factory, not just config). **Files**: `src/lib/ai/factory.ts` **AC**: `rg mock` in `src` only under `providers/mock.ts` and tests. **Verify**: `npm run audit` checks.
15: 
16: ## P2 — SaaS Authentication
17: - [ ] **P2-1 Supabase SSR**: add `npm i @supabase/supabase-js @supabase/ssr`, create `src/lib/supabase/{client,server,middleware}.ts` per official SSR. **AC**: server can get session via cookies. **Verify**: `npm run typecheck`.
18: - [ ] **P2-2 Email auth**: signup/signin/signout/confirm UI matching VedaAI design. **Files**: `src/app/auth/`, `src/components/auth/` **AC**: flows work with Supabase email. **Verify**: manual email signup (needs confirmation).
19: - [ ] **P2-3 Google OAuth**: configure provider, callback `app/auth/callback/route.ts`, document `docs/AUTH_SETUP.md`. **AC**: Google button triggers OAuth, session established. **Verify**: manual Google login round-trip (or NOT VERIFIED with docs if creds missing).
20: - [ ] **P2-4 Guest session**: generate secure `guestSessionId` (httpOnly cookie, `crypto.randomUUID`), associate `assessment guestSessionId` until claim. **Files**: `src/lib/auth/guest.ts`, `src/app/api/jobs/route.ts` **AC**: unauthenticated upload creates guest cookie. **Verify**: `curl -c` shows cookie.
21: - [ ] **P2-5 Grace period**: env `GUEST_RESULT_GRACE_PERIOD_MS=90000`, server checks `resultCreatedAt + grace > now` OR `user owns assessment`. **Files**: `src/lib/config`, `src/app/api/jobs/[jobId]/result/route.ts` **AC**: guest after 90s gets 401 auth required. **Verify**: manual wait timer.
22: - [ ] **P2-6 Auth modal**: polished VedaAI modal `Save your assessment` with Continue with Google/Email. **Files**: `src/components/auth/AuthGate.tsx` **AC**: appears after grace, not before. **Verify**: browser wait 90s.
23: - [ ] **P2-7 Claim**: `POST /api/assessments/[id]/claim` validates `guestSession ownership + claim token + assessment state + auth user` atomically, sets `assessment.userId`. **Files**: `src/app/api/assessments/[id]/claim/route.ts` **AC**: after claim, refresh shows owned assessment, other user denied. **Verify**: two-account test.
24: - [ ] **P2-8 Database & RLS**: tables `profiles, assessments, ...` + policies. **Files**: `supabase/migrations/` **AC**: RLS enforced. **Verify**: `user A` cannot read `user B` row (SQL test).
25: 
26: ## P3 — Reliability
27: - [ ] **P3-1 Idempotency**: key `jobId+stage+pipelineVersion+documentHash` prevents duplicate `Start Mapping` double-click. **Files**: `src/lib/jobs/runner.ts` **AC**: double POST creates 1 job. **Verify**: manual double-click test.
28: - [ ] **P3-2 Retry & integrity**: `VALIDATING_RESULT` checks all IDs/bounds before `COMPLETED`; never `COMPLETED` on AI success alone. **Files**: `src/lib/jobs/runner.ts:476` **AC**: invalid AI output → `FAILED MODEL_OUTPUT_INVALID`. **Verify**: `ai-malformed` fixture.
29: 
30: ## P4 — UX / Visual Polish
31: - [ ] **P4-1 Fidelity**: match sidebar 200px, header 56px, orange `#FF6B2C`, card radius. **Files**: `src/app/page.tsx`, `src/components/*` **AC**: pixel check vs reference (needs screenshots). **Verify**: browser.
32: - [ ] **P4-2 Animations**: subtle, `prefers-reduced-motion`. **AC**: no bounce, represents real state.
33: 
34: ## P5 — Testing
35: - [ ] **P5-1 Smoke tests**: `npm run ai:smoke-test` (real Zen call) + `npm run assessment:smoke-test` (fixture PDF→result). **Files**: `scripts/ai-smoke.ts`, `scripts/assessment-smoke.ts` **AC**: both PASS with real creds, print safe diagnostics. **Verify**: run both.
36: - [ ] **P5-2 Expand tests**: file validation, coordinate rotation visual, state machine, RLS, security. **AC**: `npm run test` >50 tests. **Verify**: pass.
37: - [ ] **P5-3 Evaluate harness**: wire `fixtures/` to real pipeline, report precision per §67. **Files**: `scripts/evaluate.ts` **AC**: outputs metrics table. **Verify**: `npm run evaluate`.
38: 
39: ## P6 — Deployment
40: - [ ] **P6-1 Env & checklist**: `docs/PRODUCTION_READINESS.md` + `npm run audit`. **AC**: checklist covers AI/storage/auth/RLS/build. **Verify**: `npm run audit` pass.
41: - [ ] **P6-2 Supabase buckets**: `assessment-inputs` etc. **AC**: upload actually exists in storage dashboard. **Verify**: manual.
42: 
43: ## P7 — Final Audit
44: - [ ] **P7-1 Manual journeys A-D (§56)**: guest → timer → signup → owned → google → deny. **AC**: all 24 steps pass. **Verify**: browser.
45: - [ ] **P7-2 FINAL_AUDIT.md** with Verified/Not Verified/Limitations. **AC**: truthful. **Verify**: doc exists.

(End of file - total 45 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\.env"
}
```

**Output:**
```
<path>E:\vedaAi\.env</path>
<type>file</type>
<content>
1: # LLM — OpenRouter canonical (single source; app code migrated from opencode-zen)
2: # OPENROUTER is the only runtime provider. AI_* legacy aliases removed — kept only AI_PROVIDER for explicitness.
3: OPENROUTER_API_KEY=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
4: OPENROUTER_MODEL=qwen/qwen3-vl-32b-instruct
5: OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
6: AI_PROVIDER=openrouter
7: 
8: # Mapping thresholds
9: MAPPING_HIGH_THRESHOLD=0.75
10: MAPPING_REVIEW_THRESHOLD=0.5
11: 
12: # Limits
13: MAX_FILE_SIZE_MB=100
14: MAX_PAGES=50
15: MAX_CONCURRENT_AI=2
16: 
17: # Supabase (SaaS)
18: SUPABASE_SERVICE_ROLE_KEY=
19: NEXT_PUBLIC_SUPABASE_URL=https://emvjpfeitjtthjrhudii.supabase.co
20: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_q8FUnRvHsNtA6v2_8OQICw_H67lD2LE
21: 
22: # Guest
23: GUEST_RESULT_GRACE_PERIOD_MS=90000
24: 
25: # App URL
26: NEXT_PUBLIC_APP_URL=http://localhost:3000
27: 
28: # OCR — Amazon Textract (async PDF) — REAL infrastructure
29: OCR_PROVIDER=textract
30: AWS_REGION=ap-south-1
31: AWS_ACCESS_KEY_ID=AKIA3FLD6J2NDXVQT2DL
32: AWS_SECRET_ACCESS_KEY=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
33: AWS_S3_BUCKET=vedaaistorage
34: AWS_TEXTRACT_OUTPUT_BUCKET=vedaaistorage
35: AWS_S3_INPUT_PREFIX=ocr-input
36: AWS_S3_OUTPUT_PREFIX=ocr-output
37: # Optional SNS/SQS async orchestration (polling used if not set)
38: # AWS_SNS_TOPIC_ARN=
39: # AWS_SNS_ROLE_ARN=
40: # AWS_SQS_QUEUE_URL=
41: OCR_OPERATION_TIMEOUT_MS=300000
42: OCR_POLL_INTERVAL_MS=5000
43: OCR_MAX_RETRIES=3
44: 
45: # Vision — parallel to Textract (evidence-only, grounded to Textract geometry)
46: # Uses same OPENROUTER_API_KEY/MODEL via fallback; no separate VISION_API_KEY needed
47: VISION_PROVIDER=auto
48: VISION_MAX_PAGES=3
49: VISION_TIMEOUT_MS=90000
50: 
51: # Coding-agent (opencode CLI) — separate from app runtime; only OPENCODE_API_KEY is read by opencode.json
52: OPENCODE_API_KEY=sk-wlZV3DLy2ySMEa3nj60trEdO9RxKToS0A97k0OPC8NU6fSoy4zOJ2S3b339ItG47

(End of file - total 52 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\opencode.json"
}
```

**Output:**
```
<path>E:\vedaAi\opencode.json</path>
<type>file</type>
<content>
1: {
2:   "$schema": "https://opencode.ai/config.json",
3:   "model": "opencode/muse-spark-1.2-contributor-free",
4:   "provider": {
5:     "openai": {
6:       "baseURL": "https://opencode.ai/zen/v1",
7:       "apiKey": "{env:OPENCODE_API_KEY}"
8:     }
9:   },
10:   "mcp": {},
11:   "lsp": true,
12:   "permission": {
13:     "read": "allow",
14:     "write": "allow",
15:     "bash": "allow"
16:   }
17: }

(End of file - total 17 lines)
</content>
```

**Tool: bash**

**Input:**
```json
{
  "command": "Get-ChildItem -LiteralPath \"E:\\vedaAi\\docs\" | Format-Table Name, Length -AutoSize; Write-Output \"---\"; Get-ChildItem -LiteralPath \"E:\\vedaAi\\fixtures\" -Recurse | Select-Object -First 20 FullName; Write-Output \"---\"; Get-ChildItem -LiteralPath \"E:\\vedaAi\\tests\" -Recurse | Select-Object -First 20 FullName"
}
```

**Output:**
```

[32;1mName                              [0m[32;1m Length[0m
[32;1m----                              [0m [32;1m------[0m
design-reference                   
ACCURACY_AUDIT.md                  15840
AI_PIPELINE.md                     5100
ARCHITECTURE_AUDIT.md              22833
ARCHITECTURE.md                    6169
AUTH_SETUP.md                      2888
AWS_TEXTRACT.md                    6030
AWS-TEXTRACT-MIGRATION.md          18194
FINAL_ARCHITECTURE_VERIFICATION.md 19646
FINAL_AUDIT.md                     8849
FINAL_PDF_FIX_REPORT.md            9192
FINAL_PRODUCTION_AUDIT.md          9450
FINAL_PRODUCTION_VERIFICATION.md   7152
FINAL_REAL_WORLD_VERIFICATION.md   21362
FINAL_VERIFICATION.md              10367
FINAL-AWS-MIGRATION-REPORT.md      11016
FORENSIC_AUDIT.md                  17262
IMPLEMENTATION_AUDIT.md            13532
LIMITATIONS.md                     4497
LOCAL_OCR_MIGRATION_AUDIT.md       39403
OCR_PIPELINE.md                    4029
PDF_FAILURE_AUDIT.md               11113
PRODUCTION_READINESS.md            2248
SECURITY.md                        3152
SYSTEM_AUDIT.md                    12419
TESTING.md                         6095
TEXTRACT_VS_VISION_AUDIT.md        12349

---

[32;1mFullName[0m
[32;1m--------[0m
E:\vedaAi\fixtures\11a-11b
E:\vedaAi\fixtures\ai-malformed
E:\vedaAi\fixtures\ai-ratelimit
E:\vedaAi\fixtures\ai-timeout
E:\vedaAi\fixtures\ambiguous
E:\vedaAi\fixtures\continuation
E:\vedaAi\fixtures\coordinate-rotation
E:\vedaAi\fixtures\coordinate-scaling
E:\vedaAi\fixtures\crossed-out
E:\vedaAi\fixtures\diagram-only
E:\vedaAi\fixtures\duplicate-number
E:\vedaAi\fixtures\extra-unmatched
E:\vedaAi\fixtures\file-corruption
E:\vedaAi\fixtures\low-quality
E:\vedaAi\fixtures\multi-column
E:\vedaAi\fixtures\multi-page-answer
E:\vedaAi\fixtures\multiple-regions
E:\vedaAi\fixtures\no-number
E:\vedaAi\fixtures\out-of-order
E:\vedaAi\fixtures\oversized
---
E:\vedaAi\tests\e2e
E:\vedaAi\tests\integration
E:\vedaAi\tests\unit
E:\vedaAi\tests\e2e\real-paper.spec.ts
E:\vedaAi\tests\e2e\verify-after-fix.spec.ts
E:\vedaAi\tests\integration\job.test.ts
E:\vedaAi\tests\integration\textract-integration.test.ts
E:\vedaAi\tests\unit\answer-segmentation.test.ts
E:\vedaAi\tests\unit\blocker-fix.test.ts
E:\vedaAi\tests\unit\coordinates.test.ts
E:\vedaAi\tests\unit\decision.test.ts
E:\vedaAi\tests\unit\evidence.test.ts
E:\vedaAi\tests\unit\numbering.test.ts
E:\vedaAi\tests\unit\ocr.test.ts
E:\vedaAi\tests\unit\question-parser.test.ts
E:\vedaAi\tests\unit\textract.test.ts


```

---

## Assistant (Build · Muse Spark 1.2 Free · 4.3s)

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\docs\\LOCAL_OCR_MIGRATION_AUDIT.md"
}
```

**Output:**
```
<path>E:\vedaAi\docs\LOCAL_OCR_MIGRATION_AUDIT.md</path>
<type>file</type>
<content>
1: # LOCAL OCR MIGRATION AUDIT — VedaAI
2: 
3: **Date:** 2026-08-29  
4: **Auditor:** automated repo scan + execution trace  
5: **Pipeline version:** 0.2.0  
6: **Current OCR_PROVIDER:** `textract` (AWS Textract async via S3)  
7: **Reference job:** `39ac494f-ecec-4ccc-91ca-c9e9995a644b` — 8 page QP + 39 page AS, COMPLETED, Textract SUCCEEDED in ~21s, Vision 200.
8: 
9: ---
10: 
11: ## 1. Current Architecture (real, not aspirational)
12: 
13: ```
14: ORIGINAL PDF / IMAGE (Buffer)
15:         |
16:         v
17:   File Validation (src/lib/files/validation.ts — file-type magic, size, mime)
18:         |
19:         v
20:   Job Creation (src/app/api/jobs/route.ts → jobStore.create, documentStore, LocalFileStorage)
21:         |
22:         v
23:   Page Normalization / Inspection (src/lib/documents/pdf.ts — pdf-lib primary, pdfjs fallback; inspectImage via sharp fallback)
24:         | -> DocumentPage entries per page with width,height,rotation via pageStoreApi
25:         |
26:         +------------------------------+--------------------------------+
27:         |                              |                                |
28:         v                              v (parallel, conditional)
29:   S3 Staging               Vision Sampling
30:   (src/lib/ocr/s3.ts)      (src/lib/documents/render.ts → mupdf 1.5x PNG, fallback canvas pdfjs, fallback PDF base64)
31:         |                              |
32:         v                              v
33:   AWS Textract async       Vision Model (qwen/qwen3-vl-32b via OpenRouter)
34:   (src/lib/ocr/textract.ts)  (src/lib/vision/openrouter-vision.ts)
35:         |                              |
36:   Poll + Paginate            Zod-validated VisionDocumentAnalysis
37:   (NextToken, 5s poll)       (pages[].visualRegions, questionCandidates, answerGroupHints)
38:         |                              |
39:         +--------------+---------------+
40:                        |
41:                        v
42:                  Fusion Layer (src/lib/vision/fusion.ts + canonical.ts)
43:                        | -> warnings if Vision label has no Textract grounding
44:                        | -> CanonicalDocument (pages + lines + blocks + evidence)
45:                        v
46:                  EXTRACTING — deterministic parsers NOT LLM
47:                        | -> parseQuestionsFromTextract (question-parser.ts)
48:                        | -> segmentAnswersFromTextract (answer-segmentation.ts)
49:                        | -> validator.ts repair loop (instruction/section/option leakage + duplicate regression)
50:                        v
51:                  STRUCTURING (runner.ts structuring)
52:                        | -> QuestionNode[] + AnswerRegion[]/AnswerGroup[] (bboxesByPage Map, continuationGroupId)
53:                        v
54:                  MATCHING (runner.ts matchingStage)
55:                        | -> evidence: EXPLICIT_QUESTION_LABEL, SEMANTIC_SIMILARITY (jaccard), LAYOUT_CONTINUITY, OCR_CONFIDENCE, VISUAL_EVIDENCE
56:                        | -> aggregateScore + decideForQuestion + global conflict resolution (greedy by score)
57:                        | -> decisions with HighlightRegion per page
58:                        v
59:                  LOCALIZING (no-op, merged into matching)
60:                        v
61:                  VALIDATING_RESULT (golden checks topLevel count, impossible IDs)
62:                        v
63:                  COMPLETED → resultStore (memory + tmp persist) → PDF.js viewer
64: 
65: Job state machine: CREATED→VALIDATING→PREPROCESSING→OCR_SUBMITTED→OCR_PROCESSING→OCR_COMPLETED→VISION→FUSION→EXTRACTING→STRUCTURING→MATCHING→LOCALIZING→VALIDATING_RESULT→COMPLETED (src/lib/jobs/runner.ts:70 STAGE_ORDER, runner `runJob` + hard 10m timeout)
66: 
67: Storage: InMemoryJobStore + persisted tmp files (C:\Users\Dell\AppData\Local\Temp\veda-ai\persist\job-*.json / docs-*.json / pages-*.json); LocalFileStorage tmp dir per job; InMemoryArtifactStore; S3 staging only for Textract input/output prefixes (never primary storage — Supabase used only for auth).
68: 
69: ```
70: 
71: **Ten-layer mapping (AGENTS.md) — reality:**
72: 1. File Layer `src/lib/files/validation.ts` + upload route — REAL
73: 2. Document Layer `src/lib/documents/pdf.ts` + render.ts — REAL (pdf-lib + mupdf)
74: 3. Perception Layer `src/lib/ocr/*` — REAL via Textract
75: 4. Structure Layer `src/lib/structure/*` — REAL deterministic
76: 5. Matching Layer `src/lib/jobs/runner.ts matchingStage` — REAL evidence-weighted
77: 6. Evidence Layer `src/lib/evidence/aggregate.ts` — REAL
78: 7. Decision Layer `src/lib/decision/index.ts` — REAL
79: 8. Localization Layer `src/lib/coordinates/transform.ts` — REAL pure functions
80: 9. Presentation Layer `components/viewer/*` `app/results` — REAL
81: 10. Operations Layer `src/lib/jobs/runner.ts` + `src/lib/storage/index.ts` — REAL with persist
82: 
83: Vision was previously removed (ARCHITECTURE_AUDIT), now re-added as parallel evidence-only (router.ts).
84: 
85: ---
86: 
87: ## 2. Current OCR Flow (Textract async — step-by-step)
88: 
89: 1. **Preprocess:** `preprocess(jobId)` reads buffers from `fileStorage`, calls `inspectPdf`/`inspectImage`, upserts DocumentPage.
90: 
91: 2. **OCR Stage `ocrStage(jobId)` — runner.ts:357**
92:    - Reuse cached if `ocrResultStore` + `job.ocrCompletedAt` exists (idempotent).
93:    - Try resume if `job.ocrOperationId` present (calls getOperationStatus).
94:    - For each doc (questionPaper then answerSheet, sequential to bound memory):
95:      a. `buildS3Keys` → `inputKey = ocr-input/{jobId}/{kind}.pdf`, `outputPrefix = ocr-output/{jobId}/{kind}/`, bucket = `AWS_S3_BUCKET`.
96:      b. Read file buffer (`fileStorage.read`), mime `application/pdf`.
97:      c. `uploadBufferToS3(bucket, key, buffer, mime)` with up to `OCR_MAX_RETRIES=3` exp backoff `2^n*500ms` (`src/lib/ocr/s3.ts:67`).
98:      d. `provider.submitDocument({jobId, documentId, kind, s3Bucket, s3Key, mimeType, pageCount})`:
99:         - `TextractOcrProvider.submitDocument` (src/lib/ocr/textract.ts:29) → `TextractClient` with region+credentials (or IAM).
100:         - Tries `StartDocumentAnalysisCommand` with `FeatureTypes: [TABLES, LAYOUT]` + optional `NotificationChannel` (SNS/SQS).
101:         - Fallback to `StartDocumentTextDetectionCommand` on InvalidParameterException.
102:         - Returns `{operationId: JobId, outputUri: s3://outputBucket/textract-output/{jobId}/{kind}/}`.
103:      e. Persist `ocrOperationId`, `ocrOutputUri`, `ocrInputUri`, `ocrAttempt`, `ocrPageCount` to jobStore.
104:      f. **Poll:** `getOperationStatus(operationId)` every `OCR_POLL_INTERVAL_MS=5000` until DONE/FAILED or `OCR_OPERATION_TIMEOUT_MS=300000` (5m). Tries `GetDocumentAnalysisCommand` then fallback `GetDocumentTextDetectionCommand` (MaxResults 1).
105:      g. **Fetch result:** `getOperationResult(operationId, outputUri)` with pagination `MaxResults:1000` + `NextToken` loop over `GetDocumentAnalysis` (or TextDetection fallback), collects all `Blocks`, checks JobStatus.
106:      h. **Normalize:** `normalizeTextractBlocks(blocks)` (line 199) → `OcrDocumentResult { jobId, documentId, kind, pages[], provider:amazon-textract, providerVersion:v1 }` with `OcrPageResult[]`.
107:         - PAGE blocks → pagesMap
108:         - LINE blocks → linesByPage sorted by Top
109:         - Synthesized blocks via vertical gap >0.025, paragraphs via gap >0.015, words via Relationships CHILD Ids.
110:         - Union boxes, avg confidence/100.
111:      i. Dump debug: `os.tmpdir/veda-ai/{jobId}/debug/{kind}-textract.json` + `artifacts/ocr-debug/{jobId}/`.
112:    - Store `ocrResultStore.set(jobId, {qpOcr, asOcr})`, `job.ocrCompletedAt`.
113: 
114: Mock path (`OCR_PROVIDER=mock`): `MockOcrProvider.getOperationResult` synthesizes 1-39 pages with static boxes; no S3.
115: 
116: ---
117: 
118: ## 3. Every Textract Dependency (full repo scan `rg textract|@aws-sdk/client-textract|StartDocumentAnalysis|GetDocumentAnalysis|DetectDocumentText|TEXTRACT|S3 OCR|OCR input/output|Textract JobId|BlockType|OCR_PROVIDER`)
119: 
120: | Scope | Pattern hits | Files |
121: |---|---|---|
122: | Package deps | `@aws-sdk/client-textract@3.800.0`, `@aws-sdk/client-s3@3.800.0` | `package.json:20-21`, `package-lock.json` |
123: | Env config | `OCR_PROVIDER=textract|mock`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_TEXTRACT_OUTPUT_BUCKET`, `AWS_S3_INPUT_PREFIX`, `AWS_S3_OUTPUT_PREFIX`, `AWS_SNS_TOPIC_ARN`, `AWS_SNS_ROLE_ARN`, `AWS_SQS_QUEUE_URL`, `OCR_OPERATION_TIMEOUT_MS`, `OCR_POLL_INTERVAL_MS`, `OCR_MAX_RETRIES` | `.env.example:8-25`, `.env:28-43`, `src/lib/config/index.ts:42-57` |
124: | OCR types | `provider: "amazon-textract"`, `OcrProvider` async interface (`submitDocument`, `getOperationStatus`, `getOperationResult`, `cancelOperation`), `SubmitOcrRequest {s3Bucket,s3Key,mimeType,pageCount}`, `OcrOperationStatus`, `OcrDocumentResult` | `src/lib/ocr/types.ts:62,89-94` |
125: | Textract provider | `TextractClient`, `StartDocumentAnalysisCommand`, `GetDocumentAnalysisCommand`, `StartDocumentTextDetectionCommand`, `GetDocumentTextDetectionCommand`, `JobId`, `FeatureTypes`, `NotificationChannel`, `BlockType PAGE/LINE/WORD`, `Geometry.BoundingBox {Left,Top,Width,Height}`, `Confidence`, `Relationships`, `NextToken`, `JobStatus` | `src/lib/ocr/textract.ts:1-399` |
126: | S3 staging | `S3Client`, `PutObjectCommand`, `GetObjectCommand`, `ListObjectsV2Command`, `DeleteObjectsCommand`, `buildS3Keys`, `buildS3Uris`, `parseS3Uri`, `uploadBufferToS3`, `downloadS3File`, `listS3OutputFiles`, `deleteS3Prefix` | `src/lib/ocr/s3.ts:1-143` |
127: | Factory | `TextractOcrProvider` instantiation, `MockOcrProvider` alternative | `src/lib/ocr/factory.ts:2,11-18` |
128: | Runner OCR | `getOcrProvider`, `uploadBufferToS3`, `deleteS3Prefix`, `ocrOperationId/outputUri/inputUri`, `ocrStage` S3 upload+poll+parse, debug dumps `*-textract.json` | `src/lib/jobs/runner.ts:9-11,306,357-591,807,824,905-933` |
129: | Structure parsers | `parseQuestionsFromTextract`, `segmentAnswersFromTextract` signatures `OcrDocumentResult` | `src/lib/structure/question-parser.ts:406`, `src/lib/structure/answer-segmentation.ts:226` |
130: | Types ProcessingJob | `ocrOperationId`, `ocrOutputUri`, `ocrInputUri`, `ocrAttempt`, `ocrStartedAt`, `ocrCompletedAt`, `ocrPageCount`, `ocrErrorCode` + stages `OCR_SUBMITTED|PROCESSING|COMPLETED|FAILED` | `src/types/index.ts:18,220-228` |
131: | Vision | Comments `parallel to Textract (evidence-only, grounded to Textract geometry)` | `.env.example:27`, `src/lib/config/index.ts:57`, `src/lib/vision/fusion.ts`, `src/lib/vision/canonical.ts` |
132: | Docs | AWS Textract pipeline docs, audit docs | `docs/AWS_TEXTRACT.md`, `docs/TEXTRACT_VS_VISION_AUDIT.md`, `docs/AWS-TEXTRACT-MIGRATION.md`, `docs/ARCHITECTURE_AUDIT.md`, `docs/FINAL_VERIFICATION.md` etc (26 files in docs/) |
133: | Scripts | `scripts/aws-smoke.ts` real S3+Textract test, `scripts/simulate-pipeline.ts`, `scripts/test-mupdf.ts` etc | `scripts/aws-smoke.ts`, `scripts/evaluate.ts`, `scripts/audit.ts` |
134: | Tests | `tests/unit/textract.test.ts`, `tests/integration/textract-integration.test.ts`, `tests/unit/answer-segmentation.test.ts` etc | `tests/unit/textract.test.ts:1-…`, `vitest.config.ts:17-20` (OCR_PROVIDER=mock) |
135: | Artifacts | `artifacts/39ac…/02-textract-raw.json`, `03-textract-normalized.json`, `artifacts/ocr-debug/**` | `artifacts/` |
136: 
137: Search also returns `NEXT_PUBLIC` never holds AWS secrets (verified).
138: 
139: Leak: `.env` committed with real `AWS_SECRET_ACCESS_KEY=Za9f...` + `OPENROUTER_API_KEY` — must rotate.
140: 
141: ---
142: 
143: ## 4. Files That Need Modification for Local OCR Migration
144: 
145: **Must change (runtime pipeline):**
146: - `package.json` — remove `@aws-sdk/client-textract`, keep `@aws-sdk/client-s3` only if S3 remains; add local OCR deps (`tesseract.js` + `sharp` if needed) — or keep canvas/mupdf for rendering.
147: - `src/lib/ocr/types.ts` — extend `OcrDocumentResult.provider` from `"amazon-textract"` to `"amazon-textract" | "local" | "tesseract"` ; keep normalized shape but add `OcrPageResult` dims provenance; optionally add `OcrBlock` id/source metadata.
148: - `src/lib/ocr/textract.ts` — REMOVE from active pipeline (delete or move to `src/lib/ocr/providers/textract.legacy.ts` / delete Textract imports; do not keep `TextractClient` in runtime bundle). Can keep file archived but not imported.
149: - `src/lib/ocr/s3.ts` — REMOVE OCR staging reliance: `uploadBufferToS3` / S3 Textract output prefix no longer needed. Keep S3 only if still required for Supabase alternative? Current primary file storage is `LocalFileStorage` (tmp), S3 is Textract staging only — so can delete S3 Textract staging. If we keep Supabase storage later, this file becomes dead code.
150: - `src/lib/ocr/factory.ts` — switch `getOcrProvider()` to return `LocalOcrProvider` (tesseract) when `OCR_PROVIDER=local|tesseract` (default), keep `mock` for tests. No more `TextractOcrProvider` default.
151: - `src/lib/ocr/index.ts` — update exports to `LocalOcrProvider` / `TesseractOcrProvider`.
152: - `src/lib/ocr/mock.ts` — keep for vitest, but align its `OcrDocumentResult` shape with new provider string.
153: - `src/lib/config/index.ts` — REMOVE/DEPRECATE `AWS_SNS_TOPIC_ARN/ROLE/SQS`, `AWS_TEXTRACT_OUTPUT_BUCKET`, Textract-specific `OCR_PROVIDER=textract` default; replace with `OCR_PROVIDER=local|tesseract|mock`, `LOCAL_OCR_ENGINE=tesseract`, `LOCAL_OCR_LANGUAGES`, `LOCAL_OCR_WORKERS/CONCURRENCY/OEM/PSM`. Keep `AWS_S3_BUCKET` ONLY if S3 still needed (currently not for primary storage — can remove or keep optional). Add `OCR_CONCURRENCY`, `OCR_DPI`, `OCR_LANG`. Validate fail clearly.
154: - `src/lib/jobs/runner.ts` — **largest change**: `ocrStage()` currently does S3 upload → Textract submit → poll → fetch. Replace with local pipeline: `renderPdfPagesToImages (mupdf)` → `LocalOcrProvider.processDocument` with bounded concurrency (worker pool), model load once, per-page OCR, normalize to `OcrDocumentResult`. Remove `buildS3Keys`, `uploadBufferToS3`, `deleteS3Prefix` for OCR staging, `ocrOperationId/outputUri` job fields (or keep as generic `ocrOperationId` for legacy but not used). Keep idempotency/cache but simpler. Persist debug dumps `*-local-ocr.json` instead of `*-textract.json` (keep backward compat path or new names `03-local-ocr-normalized.json` etc as spec section 23). Update logs to `{engine:local, durationMs, blockCount}`.
155: - `src/types/index.ts` — generalize `ProcessingJob.ocrOperationId` comment (`OCR metadata (Amazon Textract async)` → `OCR metadata (provider-agnostic)`), keep fields for compatibility or deprecate Textract-specific names; stages remain same but semantics shift to local processing.
156: - `.env.example` — replace Textract block with Local OCR block (`OCR_PROVIDER=local`, `LOCAL_OCR_ENGINE=tesseract`, `TESSERACT_LANG=eng`, `OCR_CONCURRENCY=4`, `OCR_DPI=200` etc), document distinct sections LOCAL OCR / VISION / STORAGE / APP.
157: 
158: **Should update (pipeline docs, UI, artifacts):**
159: - `src/lib/documents/render.ts` — KEEP but adapt: local OCR also needs rendered images (mupdf). Already supports `renderPdfPagesForVision`; reuse for OCR. Document lifecycle `load model once, reuse across pages` (spec 21).
160: - `src/lib/vision/*` — keep, but change input contract: Fusion doc says Vision input includes `OCR blocks + confidence + page metadata` (spec 8). Update `shouldInvokeVision` routing to handle local OCR confidence.
161: - `src/lib/structure/question-parser.ts` — signature rename `parseQuestionsFromTextract` → `parseQuestionsFromOcr` or keep alias; no logic change (already generic, uses `OcrDocumentResult`).
162: - `src/lib/structure/answer-segmentation.ts` — same rename; logic generic.
163: - `src/lib/vision/fusion.ts` + `canonical.ts` — update grounding warning text from `Textract` to generic OCR; keep evidence types.
164: - `src/components/viewer/PdfViewer.tsx` — NO change expected (already normalized [0,1] via highlightRegions), but verify zoom 50/100/200, navigation.
165: - `src/app/api/*` — ensure no Textract imports remain.
166: - `tests/**` — update mocks that import `TextractOcrProvider`, add new local OCR unit tests (normalization, coordinate, grouping, hierarchy) per spec §24, adversarial tests.
167: - `scripts/*` — add `scripts/ocr-benchmark.ts` harness, update `aws-smoke.ts` deprecation.
168: - `docs/*` — update `ARCHITECTURE.md`, `OCR.md`, `VISION_PIPELINE.md`, `MAPPING.md`, `HIGHLIGHTING.md`, `LIMITATIONS.md`, `TESTING.md`, `FINAL_VERIFICATION.md`, create `LOCAL_OCR_BENCHMARK.md`.
169: - `vitest.config.ts` — change default `OCR_PROVIDER=textract` → `local` / `mock` for tests; keep mock for CI.
170: - `next.config.ts` — `serverExternalPackages: ["canvas"]` remains (mupdf/tesseract may need `sharp`/`tesseract.js` external).
171: - Secrets — rotate `.env` AWS keys, ensure no `NEXT_PUBLIC` secret.
172: 
173: **Can deprecate/remove:**
174: - `src/lib/ocr/s3.ts` Textract staging helpers if no S3 requirement (check Supabase storage need — currently not used for OCR persistence; fileStorage is local tmp). Keep file only if S3 bucket retained; spec §17 says keep S3 only if still actually needed.
175: 
176: ---
177: 
178: ## 5. Current OCR Data Schema
179: 
180: **`src/lib/ocr/types.ts` (94 lines)**
181: 
182: ```ts
183: NormalizedBox { x:0..1, y:0..1, width:0..1, height:0..1 }
184: 
185: OcrLine { text, boundingBox: NormalizedBox, confidence:0..1 (Textract /100), pageNumber }
186: OcrPageResult { pageNumber, text (joined LINES \n), blocks: OcrBlock[], lines: OcrLine[], confidence, width, height, rotation }
187: OcrBlock { boundingBox: NormalizedBox, paragraphs: OcrParagraph[], confidence }
188: OcrParagraph { boundingBox, words: OcrWord[], confidence }
189: OcrWord { boundingBox, symbols: OcrSymbol[], confidence, text }
190: OcrSymbol { boundingBox, text, confidence, property.detectedBreak }
191: 
192: OcrDocumentResult { jobId, documentId, kind:"questionPaper"|"answerSheet", pages:OcrPageResult[], provider:"amazon-textract", providerVersion, operationId (JobId), completedAt }
193: OcrOperationStatus { operationId, status:"PENDING"|"RUNNING"|"DONE"|"FAILED"|"CANCELLED", progress?, error?, outputUri? }
194: SubmitOcrRequest { jobId, documentId, kind, s3Bucket, s3Key, mimeType:"application/pdf"|"image/tiff"|"image/png"|"image/jpeg", pageCount }
195: OcrProvider { submitDocument -> {operationId, outputUri}, getOperationStatus, getOperationResult, cancelOperation }
196: 
197: OcrPageResult.width/height = 0 when from Textract (no pixel dims, bbox already normalized). DocPage width/height from pdf-lib inspection is source of display dims.
198: ```
199: 
200: **Normalization** (`normalizeTextractBlocks`, 199-376):
201: - BoundingBox normalized already `[0,1]` via `Left/Top/Width/Height`; no pixel conversion.
202: - Confidence divided 100 → 0..1.
203: - Blocks synthesized by gap >0.025 (vertical), paragraphs by >0.015, words via Relationships CHILD.
204: - Union boxes for block/paragraph covering lines.
205: 
206: **Future local schema:** keep same but add `OcrDocumentResult.provider: "local"`, `providerVersion: tesseract version`, `OcrPageResult.width/height` = rendered image dims (preserved original vs processing), `OcrBlock.id`, `source:"tesseract"` per block, `polygon` optional. Preserve normalized + original pixel dims.
207: 
208: ---
209: 
210: ## 6. Current BBox Representation
211: 
212: - **Textract:** `Geometry.BoundingBox { Left, Top, Width, Height }` normalized [0,1] relative to page dims as rendered by Textract (internal). Stored as `NormalizedBox {x=Left, y=Top, width, height}` in `OcrLine.boundingBox`, `OcrBlock.boundingBox`, `OcrParagraph`, `OcrWord`. Example from artifact `39ac` line: `{"x":0.0792,"y":0.4675,"w":0.821,"h":0.075}`. No pixel dims; page width/height from `DocumentPage` (pdf-lib) used only for display scaling via `PdfViewer` overlay `%`.
213: - **Coordinate transforms:** `src/lib/coordinates/transform.ts` pure functions `normalizeBox`, `denormalizeBox`, `rotateBox` (0/90/180/270), `cropBox`, `toDisplayBox`, `transformForDisplay`, `mergeBoxes`, `boxIoU`. Highlights rendered as `left/top/width/height %` (PdfViewer.tsx:237).
214: - **Highlight merging:** `mergeBoxesForHighlight` (runner.ts:26) unions boxes per page with pad 0.012, spans capped.
215: - **Limitations:** Textract width/height =0 (ignored), so all bbox are already normalized. For local OCR via rendered PNG, must compute pixel bbox → normalized via `dims` to produce same [0,1] contract. Must preserve `originalDims/processingDims/displayDims` transforms and be invertible/testable at scales 0.5/1/2 rotations 0/90/180/270 per spec §16.
216: 
217: ---
218: 
219: ## 7. Current Coordinate System
220: 
221: - **Canonical:** normalized `[0,1]` relative to original page dimensions (`DocumentPage.width/height` from `inspectPdf`). Textract boxes assumed already normalized.
222: - **Transform chain:** `original (PDF points) -> processing (rendered PNG 1.5x) -> display (viewer canvas 1.5x + DPR)`. `transform.ts` stores `originalDims`, `processingDims`, `displayDims`, `rotation`, `crop`, `scale`. All `HighlightRegion.boxes` are `NormalizedBox` stored per `pageId` and rendered as `%`.
223: - **Multi-page:** `bboxesByPage: Map<number, NormalizedBox[]>` per ParsedQuestion/SegmentedAnswer → multiple `AnswerRegion` per group (same continuationGroupId) → multiple `HighlightRegion` per mapping (`pageId` distinct). Never merge different pages into single rectangle (runner: `boxesByPage` map).
224: - **Vision coarseBox:** Vision returns `coarseBox [x,y,w,h]` 0..1 approximate, but never used as coordinate source — grounded to Textract blockIds via fusion warning (fusion.ts:40).
225: 
226: **Audit check:** `src/lib/coordinates/transform.ts:147` covered; tests `tests/unit/coordinates.test.ts` exist.
227: 
228: ---
229: 
230: ## 8. Current Vision Flow
231: 
232: - **Router** `src/lib/vision/router.ts:16 shouldInvokeVision(ocr)` — decides `useVision` by avgConfidence >0.85, totalLines >20, hasLowConfidenceLines, handwritingSignals, multiColumn detection. Easy → skip, moderate/hard → invoke. Config `VISION_PROVIDER=auto|openrouter|mock|disabled`, `VISION_MAX_PAGES=3`, `VISION_TIMEOUT_MS=90s`.
233: - **Rendering** `renderPdfPagesForVision(buffer, pageNumbers, maxPages)` — mupdf 1.5x PNG → base64, fallback canvas pdfjs, fallback PDF base64 slice.
234: - **Provider** `OpenRouterVisionProvider` (`src/lib/vision/openrouter-vision.ts`) — OpenAI client via OpenRouter base, model `qwen/qwen3-vl-32b-instruct`, `analyzeDocumentStructure` with system prompt, multimodal `image_url: data:image/png;base64`, response_format json_object, Zod `VisionDocumentAnalysisSchema`, retry 3 with exp backoff jitter on 429/5xx/timeout only.
235: - **Vision contract** `VisionDocumentAnalysis { pages: VisionPageStructure[] }` where `VisionPageStructure { pageNumber, visualRegions[], questionCandidates[{rawLabel}], answerGroupHints[{labelHint,isDiagram}] }`.
236: - **Stage** `visionStage` (runner.ts:593) — cache reuse, checks `VISION_PROVIDER disabled`, skips if OCR_PROVIDER=mock, respects `maxPages`, checks `hasRealImage` (not PDF placeholder) before calling, logs `{payloadKb, timeoutMs}`. For `auto`, failure falls back to undefined (not throw); for `openrouter` strict, throws `MODEL_UNAVAILABLE`.
237: - **Artifacts:** `vision-qp.json`, `vision-as.json` in tmp debug + `artifacts/debug/{jobId}/`, rendering to `vision-pages/*.png`.
238: 
239: **Current behavior on 39ac:** Vision invoked, succeeded 200 in 13s, returned hints (see `artifacts/39ac/04-vision.json` 9KB).
240: 
241: ---
242: 
243: ## 9. Current Mapping Flow
244: 
245: - **Input:** `QuestionNode[]` (orderIndex, normalizedNumber, text) from `parseQuestionsFromTextract` + `structuring`, `AnswerGroup[]` (regions[].questionLabel, normalizedText, pageId).
246: - **Candidate generation** `matchingStage` (runner.ts:1126): for each Q vs each AG, evidence:
247:   - `EXPLICIT_QUESTION_LABEL` 0.95 exact, 0.92 normalized strip, 0.88 prefix-insensitive, 0.35 part mismatch, 0.1 no match, 0.2 no label.
248:   - `SEMANTIC_SIMILARITY` jaccard word overlap (union) → min(0.85, j+0.3) if >0.1 else 0.15
249:   - `LAYOUT_CONTINUITY` `max(0, 1 - orderDiff*0.2)`
250:   - `OCR_CONFIDENCE` reg.ocrConfidence
251:   - `VISUAL_EVIDENCE` if diagram
252: - `aggregateScore(evidence)` (lib/evidence), `decideForQuestion(top3)` (lib/decision) → status MATCHED/UNCERTAIN/UNANSWERED (+ thresholds `MAPPING_HIGH=0.75`, `REVIEW=0.50` from config).
253: - **Global conflict:** sort Q by best score desc, greedy assign; if chosen already used, try next candidate >=0.5, else downgrade to UNCERTAIN with `NEIGHBOR_CONTEXT` conflict evidence.
254: - **Highlights:** per AG `boxesByPage` → `mergeBoxesForHighlight` per page → `HighlightRegion {pageId, boxes:[padded union], confidence, source:matching}`; also unmatched answers → `UNMATCHED` decisions.
255: - **Output:** `MappingDecision[]` (`status MATCHED|UNCERTAIN|UNANSWERED|UNMATCHED`, `highlightRegions`), sorted by question orderIndex, `unmatchedAnswers` filtered.
256: - **Known failure (accuracy_audit 39ac):** only 1 MATCHED, 36 UNCERTAIN, 4 UNANSWERED, 152 UNMATCHED — over-matched, indicates mapping thresholds/layout drift; not Textract failure but evidence calibration.
257: 
258: ---
259: 
260: ## 10. Current Highlight Flow
261: 
262: 1. `segmentAnswersFromTextract` → `SegmentedAnswer` with `bboxesByPage Map<number,NormalizedBox[]>` per page + confidence.
263: 2. `structuring` → `AnswerRegion[]` per page box (one per page in group), `AnswerGroup { regions: AnswerRegion[], normalizedText }`, continuation merge for adjacent untagged.
264: 3. `matchingStage` → `decisions[].highlightRegions` via `boxesByPage` union + padding (spec 15: merge line boxes → coherent rectangle per page).
265: 4. `localizing` — no-op (future work: could refine transform).
266: 5. `validatingResult` checks `matchedWithNoHighlight` warning.
267: 6. **UI:** `app/results/[jobId]/page.tsx` fetches `/api/jobs/{jobId}/result` → `resultStore.get` → `QuestionList` + `PdfViewer`/`AnswerSheetViewer`.
268:    - `PdfViewer.tsx` maps `highlight.pageId` → `pageNumber` via `pageIdToNumber`, filters `pageHighlights` where `pageNumber` matches or id equality fallback, renders absolute divs `left: box.x*100%` with `ring-2 ring-[#FF6B2C]` for active first box, otherwise `amber-200/20`.
269:    - Click question → `activePageId` state → scrollIntoView `pdf-page-{num}` + overlay.
270:    - Supports single-page, multi-page (multiple HighlightRegion entries), out-of-order (page mapping), unanswered (0 highlights), zoom 1.5 viewport but CSS % so invariant.
271: 
272: Verified at scales via transform.ts invertibility tests; viewer tests manual.
273: 
274: ---
275: 
276: ## 11. Current Tests
277: 
278: - **Unit** (`tests/unit/`):
279:   - `textract.test.ts` (9 tests): normalizeTextractBlocks parsing, bbox normalized, confidence, pagination.
280:   - `question-parser.test.ts`: Q label regex, hierarchy, marks extraction, reading order, MCQ options.
281:   - `answer-segmentation.test.ts`: Ans/Q label detection, adaptive gap, continuation.
282:   - `ocr.test.ts`: OCR error code mapping, factory selection.
283:   - `numbering.test.ts`: normalizeNumber depth/partType/parent.
284:   - `evidence.test.ts`, `decision.test.ts`, `coordinates.test.ts` (rotate/scale/crop/merge/IoU), `blocker-fix.test.ts` (regressions)
285: - **Integration** (`tests/integration/`):
286:   - `textract-integration.test.ts` (5): end-to-end mock OCR → parsers → mapping → highlights with fixtures.
287:   - `job.test.ts`: startProcessing pipeline with mock provider.
288: - **Fixtures** `fixtures/` 24 dirs: ai-malformed, ambiguous, continuation, duplicate-number, extra-unmatched, low-quality, multi-column, multi-page-answer, multiple-regions, out-of-order, unanswered, etc each with synthetic `groundTruth.json` (788B).
289: - **E2E** `tests/e2e/`: Playwright config `testDir ./tests/e2e`, timeout 180s, webServer `npm run dev` reuseExistingServer. Tests verify upload→processing→viewer→highlight flow (not run in CI with real creds lately; previous single passed in 2.2m per docs).
290: - **Scripts** smoke: `npm run test:aws` (`scripts/aws-smoke.ts` — real S3+Textract 1-page), `npm run test` (vitest), `npm run test:e2e` (playwright).
291: - **Coverage gaps:** No real PDF E2E against live Textract for 38-Q paper prior to 39ac job; fixtures synthetic small groundTruth, not 47-page real doc; no benchmark perf tests; no vision mock contract tests for fusion.
292: 
293: ---
294: 
295: ## 12. Current Known Failures (from docs/ACCURACY_AUDIT.md + SYSTEM_AUDIT.md + real 39ac artifacts)
296: 
297: - **Mapping accuracy:** 39ac: only 1/38 top-level matched, 36 uncertain, 4 unanswered, 152 unmatched — evidence threshold calibration off (global greedy downgrades many to uncertain).
298: - **Q6/Q8/Q10 options:** missing C/B due to Textract truncation + `isOptionLine` skip (3 vs 4 opts) — `Q6 missing C` logged.
299: - **Segmentation over-merge:** prior bug Q1 9-page merge (now fixed via expectedNext inference, but still 152 unmatched suggests over-segmentation of answer sheet into many small groups).
300: - **Credentials:** `SignatureDoesNotMatch` clock skew transient prevents stale job re-run; needs creds rotation.
301: - **`.env` leak:** real AWS secret committed.
302: - **Vision gaps:** prior architecture had no Vision branch; now present but `VISION_MAX_PAGES=3` limits to first 3 pages (may miss middle evidence).
303: - **Highlight:** not per-word noise (union), but uncertain highlights dominate — user sees many REVIEW.
304: - **Performance:** Textract polling 5s * ~4-6 polls = 22s OCR total for 39 pages (measured), Vision 13s, not local yet.
305: - **No S3 removal risk:** if we delete S3 staging without checking Supabase file persistence (not needed — fileStorage is local tmp, persists via tmpdir).
306: - **Instruction leakage:** 400, 4807 false questions previously (fixed via header/footer band filters).
307: 
308: ---
309: 
310: ## 13. Migration Risks
311: 
312: 1. **Accuracy regression:** Tesseract handwriting accuracy ~15-35% vs Textract 95%+ printed — must not depend on OCR text for labels alone; geometry + Vision fusion critical. Risk: Q37 subparts mis-detected if OCR garbles "(i)" as "l" or "I".
313: 2. **Bounding box drift:** Textract bbox normalized [0,1] high precision (3-decimals); Tesseract char/word bbox from pixel rendering may shift ±0.01 due to DPI/scale; need invert transform testing at 0.5/1/2/90°.
314: 3. **Latency vs memory:** 39 pages sequential tesseract may be 60-120s total (2-3s/page) vs Textract 22s async; concurrency 2-4 mitigates but memory peak ~800MB-1.5GB if all pages rendered PNG at 1.5x.
315: 4. **Model loading:** Bad pattern load-per-page (spec 21) would 39x load; must reuse singleton worker.
316: 5. **Node compatibility:** `tesseract.js` WASM needs `fetch` for wasm assets, worker threads; canvas/mupdf rendering uses native `mupdf` (already used for Vision) — keep Dep. Alternative `node-tesseract-ocr` needs binary tesseract installed (not portable).
317: 6. **Reading order:** Textract readingOrderSort handled multi-column via x-clustering; Tesseract LSTM returns natural reading order per image but may still mis-order two-column — retain geometry sort post-OCR.
318: 7. **Retry/failure surface:** Local OCR page failure should not fail entire doc (spec 22) — must record page-specific FAILED and continue.
319: 8. **Secrets rotation:** Deleting AWS creds before verifying local path breaks production; do gradual: keep S3 for potential rollback, feature flag `OCR_PROVIDER`.
320: 9. **Test fixtures stale:** Fixtures mocked Textract output shape; local OCR output shape differs (words/symbols may be absent) — tests must be updated to provider-agnostic shape.
321: 10. **Browser payload:** Viewer previously loads PDFs via `/api/files/[jobId]/[fileId]` (server streams tmp file); local OCR does not change this but ensure highlight coords still [0,1] after OCR switch.
322: 
323: ---
324: 
325: ## 14. Local OCR Candidates — Evaluation Matrix
326: 
327: | Criteria weight → | Latency | BBox quality | Printed acc | Layout/order | Handwriting | CPU feasible | Mem | Node compat | Deploy simple | License |
328: |---|---|---|---|---|---|---|---|---|---|---|
329: | **1. Tesseract (tesseract.js WASM)** | High: 1.5-3s/page WASM, model load 2-4s once, total ~45s for 39p @ conc 2 | High: word/line boxes pixel → normalized, confidence per word | High 95%+ printed English (LSTM) | Medium: no explicit layout LAYOUT, but our synthesis by gap compensates | Low-medium: 30-40% handwritten, but we treat as geometry not transcription | High: CPU-only, no GPU | ~150MB wasm+eng, 200MB peak per worker | High: pure npm, no python/native, works win32 Node 20 | High: npm install only | Apache 2.0 |
330: | **2. PaddleOCR (ONNX JS)** | Medium: 0.8-2s/page after 1-2s load, but needs ONNX runtime + model downloads (det+rec ~15MB+5MB) | High: polygon + oriented boxes, excellent printed tables | Very high printed + tables | High: layout model separate | Medium: better than Tesseract on handwriting (PP-OCRv4) but still needs handwriting-specific model | Medium: ONNX CPU, needs wasm threads | ~300MB | Low: `paddleocr` python canonical, JS wrappers immature (`paddle-ocr`, `paddleocr-js` stale), requires custom ONNX pipeline | Low: complex model fetch | Apache 2.0 |
331: | **3. Surya OCR** | Low: 1.2-2.5s/page, model 500MB+, init 4-6s | High: line polygons, layout | Very high | Very high (native reading order + layout) | High: best handwriting among open, but local | Low: needs torch/python, GPU preferred, 2GB+ mem | ~1-2GB | Very Low: Python-only (`surya-ocr` pip), would require separate server — violates "inside application/server process without separately deployed OCR server" spec | Very Low: pip + CUDA | MIT but heavy |
332: | **4. EasyOCR (alt)** | Similar to Paddle, needs Python | Medium | High | Medium | Medium | Low | High | Very Low (python) | Low | Apache |
333: | **5. DocTR (alt)** | ~1s/page CPU | Medium | High | Medium | Low | Medium | Medium | Low (python) | Low | Apache |
334: 
335: **Shortlist per spec 2.2 priority order 1..10:**
336: - 1 LOW LATENCY → Tesseract and Paddle tie (Paddle slightly faster per page after warmup, but deployment cost higher)
337: - 2 BBox quality → all high, Textract->Tesseract word boxes fine for highlight merging.
338: - 3 Printed accuracy → Paddle/Surya edge, but Tesseract sufficient for 8-page printed QP (98% expected).
339: - 4 Layout → Surya best, but we already have deterministic gap synthesis弥补.
340: - 5 Handwriting → Spec 11 says do NOT expect local OCR to perfectly recognize handwriting; geometry is primary, Vision handles interpretation → Tesseract's weaker handwriting ok if geometry preserved.
341: - 6 CPU feasible → Tesseract best.
342: - 7 Memory → Tesseract smallest.
343: - 8 Node compat → Tesseract only viable pure Node; Paddle/Surya require Python sidecar violates spec 5.
344: - 9 Deploy simple → Tesseract single npm.
345: - 10 License → all open.
346: 
347: **Excluded:** Any client-side OCR (browser wasm) — spec 20 says no browser-side OCR.
348: 
349: ---
350: 
351: ## 15. Benchmark Plan (before final selection — spec §3)
352: 
353: - **Input docs:** Real PDFs from job `39ac` (sizes 0.5MB QP 8p, 13.5MB AS 39p) stored at `C:\Users\Dell\AppData\Local\Temp\veda-ai\39ac…\e9d…` and `0ef…`. Also benchmark subset 5 QP pages + 5 AS pages (representative handwritten).
354: - **Harness:** `scripts/ocr-benchmark.ts` (to be created) — for each engine:
355:   1. Measure `modelLoadMs` (import/createWorker + init lang).
356:   2. Loop pages rendered via same `mupdf` 1.5x PNG path used in production (ensure identical dims).
357:   3. Per-page `ocrMs`, `peakMemoryMb` (process.memoryUsage), `textLength`, `blocks`, `lines`, `bboxCoverage`, `confidenceCoverage`, `readingOrderQuality`.
358:   4. Validate bbox validity (`0..1`, width/height >0, <1, total coverage not 0).
359:   5. Save machine-readable `artifacts/ocr-benchmark/{engine}.json` + markdown `docs/LOCAL_OCR_BENCHMARK.md` with tables.
360: - **Metrics:** `modelLoadMs`, `totalMs`, `avgPageMs`, `peakMemoryMb`, `blocks`, `lines`, `bboxAvailability%`, `confidenceAvailability%`, `printedQuality (char error proxy)`, `handwritingUsefulness (label detection hit rate)`.
361: - **Do not fabricate:** Every number from execution; run harness live, not synthetic.
362: - **Pages:** Prefer entire 8+39 doc after candidate selected; initial benchmark 5+5 sample to keep iteration fast.
363: 
364: ---
365: 
366: ## 16. Final Selected OCR Engine — PRELIMINARY (pending benchmark execution)
367: 
368: **Preliminary selection: Tesseract.js (WASM) via `tesseract.js@5` with ENG traineddata.**
369: 
370: **Why (reasons to be confirmed by benchmark numbers):**
371: 1. **Only candidate that satisfies “inside application/server process without separately deployed OCR server” with pure Node.** Paddle/Surya require Python sidecar or complex ONNX runtime that is not proven in this repo’s Node 20 win32 env. Spec 5 explicitly forbids separate OCR server.
372: 2. **Low latency + CPU feasibility** — WASM model loads once (~2-4s) then reused per spec 21; bounded concurrency 2-4 keeps peak <800MB for 39 pages. Paddle would be similar latency but +200MB ONNX + model fetch fragility.
373: 3. **Geometry sufficient** — provides `text + bounding box (word/line) + confidence + pageNumber + block relationship` (via tesseract `data.lines/words/paragraphs/blocks`); normalized via render dims gives needed `x/y/w/h` for highlight merging.
374: 4. **Printed document accuracy adequate** for QP (LSTM trained on printed); handwriting not required to be perfect — spec 11 says use geometry + Vision for handwriting, preserve REVIEW not MATCHED.
375: 5. **Deployment simplicity:** single `npm install tesseract.js`, no native binary (`canvas`/`mupdf` already present for vision rendering — no extra system deps). Fits `serverExternalPackages: ["canvas"]` pattern.
376: 6. **License Apache 2.0 suitable.**
377: 
378: **Benchmark gate:** If benchmark shows tesseract `avgPageMs` >5000ms or bboxCoverage <60% or printed error >20%, re-evaluate Paddle ONNX as fallback. Benchmark will document decision definitively.
379: 
380: **Model lifecycle (spec 21):**
381: ```
382: process start → createWorker('eng', OEM.LSTM_ONLY, {cachePath}) → load once
383:                → for each page: setImage(PNG Buffer) → recognize() → get bbox → reuse worker
384:                → terminate on shutdown
385: Not: per-page load/destroy
386: ```
387: 
388: ---
389: 
390: ## 17. Migration Plan Outline (post-audit)
391: 
392: **Phase A — Benchmark (next):**
393: - Implement `scripts/ocr-benchmark.ts` harness (supports tesseract local + future paddle stub).
394: - Run 5+5 sample + later full 8+39, record numbers to `docs/LOCAL_OCR_BENCHMARK.md` + `artifacts/ocr-benchmark/*.json`.
395: 
396: **Phase B — Integration:**
397: - Add `src/lib/ocr/local.ts` (LocalOcrProvider implementing OcrProvider simplified sync interface + new `processDocument(input: {buffer, kind, pages}) -> OcrDocumentResult`).
398: - Keep `provider.processDocument` behind `OcrProvider` abstraction (compat with factory).
399: - Wire `src/lib/jobs/runner.ts ocrStage` to local path when `OCR_PROVIDER=local`.
400: - Update `src/lib/config` env schema.
401: - Preserve artifacts `03-local-ocr-normalized.json` plus per-page images for inspection.
402: 
403: **Phase C — Removal:**
404: - After local verified on real 39ac PDFs (question count 38, top-level 38, subparts 3 for 37, MCQ options, answerGroups, mapping stats), flip `OCR_PROVIDER` default to `local` in `.env.example` + config.
405: - Move `src/lib/ocr/textract.ts` to `src/lib/ocr/providers/textract.legacy.ts` (not imported) or delete Textract imports.
406: - Remove S3 Textract staging from active pathway (keep S3 only if fileStorage moves to S3 — currently not).
407: - Update `.env.example` clean sections.
408: 
409: **Phase D — Hardening & Testing:**
410: - Add tests §§24 A-N, adversarial fixtures (11a-11b, 37-patterns, MCQ, out-of-order).
411: - Run unit + integration (`npm run test`), real E2E 8+39 (`npm run test:e2e` upload→validate→render→OCR→vision→fusion→mapping→highlight→PDF.js).
412: - Verify hard gates §33 (every claim backed by execution).
413: 
414: ---
415: 
416: ## 18. Open Findings — Needs Immediate Attention Before Migration
417: 
418: - Rotate leaked `.env` AWS keys.
419: - Benchmark harness must be executed — current doc contains *planned* metrics, not measured.
420: - Vision currently limited to 3 pages — may expand for 39-page AS if OCR confidence low.
421: - System has large artifact dumps (8M question-tree) — local OCR must keep artifact pipeline (01-12 steps per spec 23).
422: 
423: ---
424: 
425: *Audit completed without modifying production code. Next: benchmark execution.*

(End of file - total 425 lines)
</content>
```

**Tool: bash**

**Input:**
```json
{
  "command": "Get-ChildItem -LiteralPath \"E:\\vedaAi\\artifacts\" -Recurse | Select-Object -First 30 FullName; Write-Output \"---ARTIFACTS OCR---\"; Get-ChildItem -LiteralPath \"E:\\vedaAi\\artifacts\\ocr-debug\" -Recurse -ErrorAction SilentlyContinue | Measure-Object | Select-Object Count; Get-ChildItem -LiteralPath \"E:\\vedaAi\\artifacts\\debug\" -Recurse -ErrorAction SilentlyContinue | Measure-Object | Select-Object Count; Write-Output \"---GREP TEXTRACT---\"; rg --help 2>&1 | Select-Object -First 2"
}
```

**Output:**
```

[32;1mFullName[0m
[32;1m--------[0m
E:\vedaAi\artifacts\39ac494f-ecec-4ccc-91ca-c9e9995a644b
E:\vedaAi\artifacts\43e2068c-f40e-4d81-b75f-4f5fe7ead7ee
E:\vedaAi\artifacts\accuracy
E:\vedaAi\artifacts\d9313b31-3e7c-4111-b39b-b32e9870695b
E:\vedaAi\artifacts\debug
E:\vedaAi\artifacts\e2e
E:\vedaAi\artifacts\e6d60e9c-c693-43a9-8baf-d0948793843f
E:\vedaAi\artifacts\ocr-debug
E:\vedaAi\artifacts\test-mupdf
E:\vedaAi\artifacts\test-render
E:\vedaAi\artifacts\vision-test
E:\vedaAi\artifacts\vision-test-as
E:\vedaAi\artifacts\39ac494f-ecec-4ccc-91ca-c9e9995a644b\vision-pages
E:\vedaAi\artifacts\39ac494f-ecec-4ccc-91ca-c9e9995a644b\01-original-metadata.json
E:\vedaAi\artifacts\39ac494f-ecec-4ccc-91ca-c9e9995a644b\02-textract-raw.json
E:\vedaAi\artifacts\39ac494f-ecec-4ccc-91ca-c9e9995a644b\03-textract-normalized.json
E:\vedaAi\artifacts\39ac494f-ecec-4ccc-91ca-c9e9995a644b\04-vision.json
E:\vedaAi\artifacts\39ac494f-ecec-4ccc-91ca-c9e9995a644b\06-question-candidates.json
E:\vedaAi\artifacts\39ac494f-ecec-4ccc-91ca-c9e9995a644b\07-question-tree.json
E:\vedaAi\artifacts\39ac494f-ecec-4ccc-91ca-c9e9995a644b\08-answer-regions.json
E:\vedaAi\artifacts\39ac494f-ecec-4ccc-91ca-c9e9995a644b\09-mapping-candidates.json
E:\vedaAi\artifacts\39ac494f-ecec-4ccc-91ca-c9e9995a644b\10-mapping-decisions.json
E:\vedaAi\artifacts\39ac494f-ecec-4ccc-91ca-c9e9995a644b\11-highlight-regions.json
E:\vedaAi\artifacts\39ac494f-ecec-4ccc-91ca-c9e9995a644b\vision-pages\as-page-001.png
E:\vedaAi\artifacts\39ac494f-ecec-4ccc-91ca-c9e9995a644b\vision-pages\as-page-002.png
E:\vedaAi\artifacts\39ac494f-ecec-4ccc-91ca-c9e9995a644b\vision-pages\as-page-003.png
E:\vedaAi\artifacts\39ac494f-ecec-4ccc-91ca-c9e9995a644b\vision-pages\qp-page-001.png
E:\vedaAi\artifacts\39ac494f-ecec-4ccc-91ca-c9e9995a644b\vision-pages\qp-page-002.png
E:\vedaAi\artifacts\39ac494f-ecec-4ccc-91ca-c9e9995a644b\vision-pages\qp-page-003.png
E:\vedaAi\artifacts\43e2068c-f40e-4d81-b75f-4f5fe7ead7ee\01-original-metadata.json
---ARTIFACTS OCR---


---GREP TEXTRACT---
[31;1mrg: [31;1mThe term 'rg' is not recognized as a name of a cmdlet, function, script file, or executable program.[0m

[31;1m[31;1mCheck the spelling of the name, or if a path was included, verify that the path is correct and try again.[0m

```

---

## Assistant (Build · Muse Spark 1.2 Free · 4.4s)

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\docs\\FINAL_VERIFICATION.md"
}
```

**Output:**
```
<path>E:\vedaAi\docs\FINAL_VERIFICATION.md</path>
<type>file</type>
<content>
1: # FINAL VERIFICATION — VedaAI Second-Pass Repair (2026-08-28)
2: 
3: ## Current Architecture (post second-pass)
4: 
5: ```
6: REAL FILE → S3 staging → Textract async (StartDocumentAnalysis TABLES+LAYOUT, polling) → OcrDocumentResult {pages[].lines[] boundingBox [0,1] + blocks, polygon, confidence}
7:          → Vision (auto-routed, evidence-only via OpenRouterVisionProvider, Zod validated, grounded to Textract; PNG when canvas else skipped honestly) → Fusion (canonical + hints, provenance preserved)
8:          → parseQuestionsFromTextract (generic header/footer via y-band + symbol-ratio, no paper literals; multi-signal MCQ via pattern+indentation; hierarchical parent via context not lastNumeric)
9:          → segmentAnswersFromTextract → structuring (QuestionNode {id,rawNumber,normalizedNumber,displayNumber,options?: QuestionOption[],children[],kind,partType,sourcePageNumbers,sourceRegions} + AnswerRegion per page+ AnswerGroup merged by label + untagged continuation merge via adjacency)
10:          → matchingStage (evidence: explicit label, semantic Jaccard, layout, OCR conf, visual, order; global greedy assignment sorted by score desc with conflict downgrade to UNCERTAIN)
11:          → localizing (merge per-page boxes into coherent HighlightRegion with 1.2% padding via mergeBoxesForHighlight)
12:          → validatingResult → PersistedResultStore → GET /api/jobs/[jobId]/result (questions flat + children links + decisions + highlightRegions)
13:          → frontend ResultsPage (sorted by orderIndex, children rendered via parentQuestionId) → AnswerSheetViewer (all pages stacked, scrollIntoView activePageNumber, coherent highlight, badge Q{normalizedNumber})
14:          → PDF bytes via GET /api/files/[jobId]/[fileId] (Content-Type: application/pdf, Accept-Ranges, Range 206, private auth via guestSession/userId)
15: ```
16: 
17: ## Defects from Audit — Status After Second Pass
18: 
19: | ID | File | Root Cause | Fix | Test | Status |
20: |---|---|---|---|---|---|
21: | P0-1 | `src/lib/structure/question-parser.ts:73` | 15 paper-specific literals (`onls 7.`, `31/2/1`, `FATTRA`, `4807` etc.) | Replaced with generic y-band (y<0.08 or y>0.92) + header code pattern + generic OCR garbage ratio (nonAlpha/len >0.25) | `question-parser.test.ts` regression: `4807, D_D` filtered, `1` not filtered | **FIXED** |
22: | P0-2 | `question-parser.ts:144` | `isOptionLine` `t.length<80` fragile, no geometry, no long math | Multi-signal: pattern `([a-d])`, `x>0.07` indented, `bbox.x<0.06` → not option, allow up to 320 chars, indented true → option | `regression: MCQ with long mathematical options stays as one question with 4 options` | **FIXED** |
23: | P0-2b | `src/types/index.ts:87` | `QuestionNode` had no `options`/`kind`/`children`, `partType` missing `OPTION` | Added `QuestionOption {label,text,rawText,bbox}`, `QuestionKind`, `QuestionNode.options`, `children`, `displayNumber`, `partType OPTION` | typecheck pass, parser stores `current.options` | **FIXED** |
24: | P0-3 | `question-parser.ts:500` | `lastNumeric` attaches `(ii)` to wrong parent | Hierarchical: roman `(i)` checks last depth2 vs depth1 vs top, letter `(a)` always top, sibling roman shares grandparent | `regression: subparts 22 (i)(ii)(iii) nested under 22` (all parent 22) | **FIXED** |
25: | P0-4 | `src/lib/jobs/runner.ts:1059` | Untagged continuation page 2 became separate `UNMATCHED` | Added adjacency merge: untagged `orderIndex+1` page `prev+1` merges into previous labeled group's `regions` | manual multi-page answer synthetic test | **FIXED** |
26: | P0-5 | `src/lib/jobs/runner.ts:1039` | Greedy `for q` without global conflict, duplicate `A10` | Sorted by best score desc, greedy claim with `usedAnswerGroups`, duplicate downgrade to `UNCERTAIN` + try next candidate ≥0.5 | integration `job.test.ts` + manual duplicate label test | **FIXED** |
27: | P0-6 | `AnswerSheetViewer.tsx` / `PdfViewer.tsx` | CDN worker fragile, single-page pagination hid continuation, badge `Q{pageNumber}`, per-line boxes | Local worker `import pdf.worker.mjs` first then CDN fallback; `pagesToRender = Array(numPages)` stacked scroll; badge `Q{selectedQuestionLabel}`; `mergeBoxesForHighlight` per page | typecheck/build pass, manual viewer | **FIXED** |
28: | P0-7 | `src/lib/jobs/runner.ts:430` | Implicit `NODE_ENV !== production` mock fallback hid bucket missing | Now only when `OCR_PROVIDER=mock` explicit; else throw `OCR_CONFIGURATION_ERROR` | config check | **FIXED** |
29: | P0-8 | `src/lib/vision/provider.ts` / `openrouter-vision.ts` | Vision partial, no Zod, PDF bytes as image, canvas missing | Schema already Zod-validated (`VisionPageStructureSchema`, `VisionDocumentAnalysisSchema`), `buildMultimodalUserContent` skips PDF bytes honestly with `vision_no_image_skip`, logs | code review | **PARTIAL→VERIFIED** (honest skip when no canvas, not fake) |
30: | P0-9 | `src/lib/ocr/s3.ts` etc. | Credentials in `.env` | `.env` gitignored (`! .env.example` only), `.env.example` placeholders, rotation documented | `.gitignore` check | **FIXED** |
31: 
32: ## Question Structure (post-fix)
33: 
34: - `numbering.ts` unchanged (verified). Parser now generic: header/footer not paper literals, options via indentation+pattern, long options allowed.
35: - MCQ stored as `QuestionNode.options: [{label:"A",text:"..."},...]` not separate questions; top-level count correct (38 paper example requires real Textract to verify, not hardcoded expectation).
36: - Hierarchy: `parentQuestionId` + `children[]` populated in `structuring` via `parentId` lookup; API could expose tree by following `children` (flat list retained for compat). Depth: 0 top, 1 `(a)`, 2 `(i)` nested under `(a)`.
37: 
38: ## Answer Graph
39: 
40: - `AnswerRegion {pageId, normalizedBoxes, questionLabel, continuationGroupId}` per page; `AnswerGroup {regions[]}` merged by label + adjacency merge for untagged continuation (page+1). Group remains one logical answer spanning pages.
41: 
42: ## Mapping
43: 
44: - Evidence: `EXPLICIT_QUESTION_LABEL` (0.95 exact), semantic Jaccard (still primary, AI semantic pending — documented), layout, OCR, visual, order. `aggregateScore` weighted. Global assignment prevents duplicates. Uncertainty when insufficient score/margin/conflict → `UNCERTAIN`/`UNANSWERED`. No index mapping.
45: 
46: ## Vision / Fusion
47: 
48: - `getVisionProvider` → `OpenRouterVisionProvider` with `VisionDocumentAnalysisSchema.safeParse`, retry 3 with backoff, Zod invalid → `MODEL_OUTPUT_INVALID`. Fusion `fuseDocuments` grounds Vision labels against Textract lines (down-weight 0.5 if ungrounded), provenance via `canonical.evidence` + `warnings`.
49: 
50: ## PDF
51: 
52: - Delivery: `GET /api/files/[jobId]/[fileId]` verifies `jobId+fileId` ownership, returns magic-byte MIME, `Accept-Ranges`, `Range →206` with `Content-Range`. Private S3, no public URL.
53: - Viewer: `pdfjs-dist 6.2.108` local worker first, CDN fallback, error UI with direct open link, all pages stacked, active page `scrollIntoView({block:"center"})`.
54: 
55: ## Highlighting
56: 
57: - Source: Textract `NormalizedBox` [0,1] → `AnswerRegion.normalizedBoxes` → `HighlightRegion.boxes` via `mergeBoxesForHighlight` (union +0.012 padding, clamp). One box per page per logical answer, not per OCR line. Zoom via container `scale()` preserves absolute overlay.
58: 
59: ## Tests
60: 
61: - `npm run typecheck` — **pass**
62: - `npm test` — **69/69 pass** (10 files: +4 new regression cases)
63: - `npm run lint` — warnings only (no errors)
64: - `npm run build` — **pass**
65: - `tests/unit/question-parser.test.ts` new: generic garble, long MCQ, subparts 22, instruction exclusion
66: 
67: ## Evidence Separation
68: 
69: - **UNIT TESTED**: numbering, coordinates, decision, question-parser (incl. MCQ long, subpart hierarchy, instruction, generic header), answer-segmentation, textract normalization
70: - **INTEGRATION TESTED**: `job.test.ts` mock pipeline full stages (questions→answerGroups→decisions→highlights)
71: - **LIVE AWS TESTED**: **NOT VERIFIED** in this CI run (requires `AWS_S3_BUCKET=vedaaistorage` + Textract async ≈2-5 min). Smoke via `npm run test:aws` would verify S3 upload→StartDocumentAnalysis→poll→pagination→normalize; not executed here to avoid cost/auth leakage.
72: - **LIVE VISION TESTED**: **NOT VERIFIED** (requires `OPENROUTER_API_KEY` valid + `canvas` for PNG; current run would skip with `vision_no_image_skip` honestly, not fake)
73: - **REAL MANUAL E2E TESTED**: **NOT VERIFIED** (needs real question paper + handwritten sheet upload via browser, then click Q→page→highlight at zoom 50/100/150)
74: - **NOT VERIFIED**: Playwright E2E, canvas-based Vision PNG path, AI semantic embedding (still Jaccard), Hindi `question no.` validator edge
75: 
76: ## Remaining Genuine Limitations
77: 
78: - Jaccard lexical similarity still primary for handwritten answers; stronger AI embedding semantic pending (AI provider not wired for mapping stage async).
79: - Hindi/alternate instruction pattern validator still English-centric.
80: - `canvas` not installed → Vision receives no image (honest skip, not fake), so visual evidence limited; install `canvas` + `sharp` to enable real PNG.
81: - Playwright E2E for upload→result→PDF→click→highlight→zoom/resize not yet added.
82: - QuestionTree API not yet hierarchical response `GET /result` still flat+children links; frontend builds tree implicitly.
83: - Cross-page `11(a)(i)` nested detection relies on standalone sequence; printed `11(a)(i)` single-line label handled, but rare split across pages not tested.
84: 
85: ## Acceptance Criteria (Phase 43) — Current
86: 
87: - [x] No paper-specific literals
88: - [x] Subparts nested via hierarchy context
89: - [x] MCQ options as `options`, long options supported
90: - [x] Instructions/sections excluded generically
91: - [x] Cross-page questions via `pageNumbers` + `bboxesByPage`
92: - [x] Source geometry preserved
93: - [x] Real Textract (when configured) / explicit mock only when `OCR_PROVIDER=mock`
94: - [x] Vision Zod validated, grounded, honest skip without fake coords
95: - [x] AnswerGraph with continuation merge
96: - [x] No index mapping, candidate generation with explicit label etc.
97: - [ ] Strong AI semantic (still Jaccard — documented)
98: - [x] Global assignment with duplicate handling
99: - [x] Uncertainty supported
100: - [x] PDF bytes real, Range 206, worker local-first
101: - [x] Click→page navigation stacked, multi-page visible
102: - [x] Coherent highlight (one per page, merged)
103: - [x] No credentials in repo, S3 private
104: - [x] Unit/integration pass, build pass
105: - [ ] Live AWS/Vision/manual E2E — **NOT VERIFIED** this run (honest)
106: 

(End of file - total 106 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\vitest.config.ts"
}
```

**Output:**
```
<path>E:\vedaAi\vitest.config.ts</path>
<type>file</type>
<content>
1: import { defineConfig } from "vitest/config";
2: import path from "path";
3: 
4: export default defineConfig({
5:   test: {
6:     include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
7:     environment: "node",
8:     globals: true,
9:     env: {
10:       AI_PROVIDER: "mock",
11:       AI_MODEL: "mock-model",
12:       AI_API_KEY: "test-key",
13:       OPENROUTER_API_KEY: "test-key",
14:       OPENROUTER_MODEL: "qwen/qwen3-vl-32b-instruct",
15:       OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
16:       VISION_PROVIDER: "mock",
17:       OCR_PROVIDER: "mock",
18:       AWS_REGION: "us-east-1",
19:       AWS_S3_BUCKET: "test-bucket",
20:     },
21:   },
22:   resolve: {
23:     alias: {
24:       "@": path.resolve(__dirname, "./src"),
25:     },
26:   },
27: });

(End of file - total 27 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\src\\lib\\ocr\\errors.ts"
}
```

**Output:**
```
<path>E:\vedaAi\src\lib\ocr\errors.ts</path>
<type>file</type>
<content>
1: export const OcrErrorCodes = {
2:   AUTH_ERROR: "OCR_AUTH_ERROR",
3:   BUCKET_ACCESS_ERROR: "OCR_BUCKET_ACCESS_ERROR",
4:   SUBMISSION_FAILED: "OCR_SUBMISSION_FAILED",
5:   OPERATION_TIMEOUT: "OCR_OPERATION_TIMEOUT",
6:   OPERATION_FAILED: "OCR_OPERATION_FAILED",
7:   OUTPUT_MISSING: "OCR_OUTPUT_MISSING",
8:   OUTPUT_PARSE_FAILED: "OCR_OUTPUT_PARSE_FAILED",
9:   INVALID_DOCUMENT: "OCR_INVALID_DOCUMENT",
10:   GCS_UPLOAD_FAILED: "OCR_GCS_UPLOAD_FAILED",
11:   GCS_DOWNLOAD_FAILED: "OCR_GCS_DOWNLOAD_FAILED",
12:   OPERATION_CANCELLED: "OCR_OPERATION_CANCELLED",
13:   CONFIGURATION_ERROR: "OCR_CONFIGURATION_ERROR",
14: } as const;
15: 
16: export type OcrErrorCode = (typeof OcrErrorCodes)[keyof typeof OcrErrorCodes];
17: 
18: export class OcrError extends Error {
19:   code: OcrErrorCode;
20:   stage?: string;
21:   details?: unknown;
22:   retryable: boolean;
23: 
24:   constructor(code: OcrErrorCode, message: string, details?: unknown, retryable = false) {
25:     super(message);
26:     this.name = "OcrError";
27:     this.code = code;
28:     this.details = details;
29:     this.retryable = retryable;
30:   }
31: 
32:   static isRetryable(error: unknown): boolean {
33:     return error instanceof OcrError && error.retryable;
34:   }
35: }
36: 
37: export function toOcrError(error: unknown, defaultCode: OcrErrorCode = OcrErrorCodes.OPERATION_FAILED): OcrError {
38:   if (error instanceof OcrError) return error;
39:   if (error instanceof Error) {
40:     const msg = error.message.toLowerCase();
41:     if (msg.includes("permission") || msg.includes("unauthorized") || msg.includes("403") || msg.includes("401")) {
42:       return new OcrError(OcrErrorCodes.AUTH_ERROR, error.message, error, false);
43:     }
44:     if (msg.includes("bucket") || msg.includes("storage") || msg.includes("gcs")) {
45:       return new OcrError(OcrErrorCodes.BUCKET_ACCESS_ERROR, error.message, error, true);
46:     }
47:     if (msg.includes("timeout") || msg.includes("etimedout")) {
48:       return new OcrError(OcrErrorCodes.OPERATION_TIMEOUT, error.message, error, true);
49:     }
50:     if (msg.includes("not found") || msg.includes("404")) {
51:       return new OcrError(OcrErrorCodes.OUTPUT_MISSING, error.message, error, false);
52:     }
53:     return new OcrError(defaultCode, error.message, error, true);
54:   }
55:   return new OcrError(defaultCode, String(error), error, true);
56: }

(End of file - total 56 lines)
</content>
```

**Tool: bash**

**Input:**
```json
{
  "command": "Get-ChildItem -LiteralPath \"E:\\vedaAi\\src\\lib\\ocr\" | Format-Table Name, Length -AutoSize; Write-Output \"---STORAGE---\"; Get-Content -LiteralPath \"E:\\vedaAi\\src\\lib\\storage\\index.ts\" | Select-Object -First 80; Write-Output \"---ARTIFACTS 39ac JSON size---\"; Get-ChildItem -LiteralPath \"E:\\vedaAi\\artifacts\\39ac494f-ecec-4ccc-91ca-c9e9995a644b\" | Format-Table Name, Length -AutoSize"
}
```

**Output:**
```

[32;1mName       [0m[32;1m Length[0m
[32;1m----       [0m [32;1m------[0m
errors.ts     2200
factory.ts     705
index.ts       192
mock.ts       2630
provider.ts    164
s3.ts         5813
textract.ts  17376
types.ts      2086

---STORAGE---
import type { ProcessingJob, Document, DocumentPage } from "@/types";
import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

// Interfaces
export interface JobStore {
  create(job: ProcessingJob): Promise<void>;
  get(jobId: string): Promise<ProcessingJob | null>;
  update(jobId: string, patch: Partial<ProcessingJob>): Promise<ProcessingJob>;
  list(): Promise<ProcessingJob[]>;
}

export interface FileStorage {
  save(jobId: string, fileId: string, buffer: Buffer, originalName: string): Promise<string>; // returns stored path
  read(jobId: string, fileId: string): Promise<Buffer>;
  exists(jobId: string, fileId: string): Promise<boolean>;
  deleteJob(jobId: string): Promise<void>;
  getPath(jobId: string, fileId: string): string;
}

export interface ArtifactStore {
  savePageImage(jobId: string, pageId: string, buffer: Buffer): Promise<void>;
  getPageImage(jobId: string, pageId: string): Promise<Buffer | null>;
}

// --- Persisted In-memory stores (survive dev restarts via tmp file) ---
const PERSIST_DIR = path.join(os.tmpdir(), "veda-ai", "persist");

async function persistWrite(file: string, data: any) {
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8");
  } catch {}
}
async function persistRead<T>(file: string): Promise<T | null> {
  try {
    const buf = await fs.readFile(file, "utf-8");
    return JSON.parse(buf) as T;
  } catch { return null; }
}
function jobFile(jobId: string) {
  const safe = jobId.replace(/[^a-zA-Z0-9-]/g, "");
  return path.join(PERSIST_DIR, `job-${safe}.json`);
}
function docsFile(jobId: string) {
  const safe = jobId.replace(/[^a-zA-Z0-9-]/g, "");
  return path.join(PERSIST_DIR, `docs-${safe}.json`);
}
function pagesFile(jobId: string) {
  const safe = jobId.replace(/[^a-zA-Z0-9-]/g, "");
  return path.join(PERSIST_DIR, `pages-${safe}.json`);
}

// In-memory JobStore with file fallback
export class InMemoryJobStore implements JobStore {
  private jobs = new Map<string, ProcessingJob>();
  async create(job: ProcessingJob) {
    this.jobs.set(job.id, job);
    await persistWrite(jobFile(job.id), job);
  }
  async get(jobId: string) {
    const mem = this.jobs.get(jobId);
    if (mem) return mem;
    const persisted = await persistRead<ProcessingJob>(jobFile(jobId));
    if (persisted) {
      this.jobs.set(jobId, persisted);
      return persisted;
    }
    return null;
  }
  async update(jobId: string, patch: Partial<ProcessingJob>) {
    let existing: ProcessingJob | null | undefined = this.jobs.get(jobId);
    if (!existing) {
      existing = await persistRead<ProcessingJob>(jobFile(jobId));
      if (!existing) throw new Error(`Job ${jobId} not found`);
      this.jobs.set(jobId, existing);
    }
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() } as ProcessingJob;
---ARTIFACTS 39ac JSON size---

[32;1mName                       [0m[32;1m Length[0m
[32;1m----                       [0m [32;1m------[0m
vision-pages                
01-original-metadata.json   1569
02-textract-raw.json        1308687
03-textract-normalized.json 1699810
04-vision.json              9822
06-question-candidates.json 104297
07-question-tree.json       8205050
08-answer-regions.json      759798
09-mapping-candidates.json  90568
10-mapping-decisions.json   253451
11-highlight-regions.json   97602


```

---

## Assistant (Build · Muse Spark 1.2 Free · 14.7s)

_Thinking:_

Reviewing existing audit against Phase 1 requirements and clarifying migration scope versus document recreation.

_Thinking:_

Verifying the audit checklist against Phase 1 requirements and confirming PaddleOCR as the default engine.

_Thinking:_



**Tool: bash**

**Input:**
```json
{
  "command": "node --version; npm --version; python --version 2>&1; python3 --version 2>&1; pip --version 2>&1; pip3 --version 2>&1; where python 2>&1 | Select-Object -First 5; Get-ChildItem -LiteralPath \"E:\\vedaAi\\artifacts\\39ac494f-ecec-4ccc-91ca-c9e9995a644b\" | Select-Object Name, Length | Format-Table -AutoSize; Write-Output \"---Vercel check---\"; Get-Content -LiteralPath \"E:\\vedaAi\\package.json\" | Select-Object -First 20"
}
```

**Output:**
```
v24.0.2
11.3.0
Python 3.11.7
[31;1mpython3: [31;1mThe term 'python3' is not recognized as a name of a cmdlet, function, script file, or executable program.[0m
[31;1m[31;1mCheck the spelling of the name, or if a path was included, verify that the path is correct and try again.[0m
pip 26.2.1 from C:\Python311\Lib\site-packages\pip (python 3.11)
pip 26.2.1 from C:\Python311\Lib\site-packages\pip (python 3.11)

[32;1mName                       [0m[32;1m Length[0m
[32;1m----                       [0m [32;1m------[0m
vision-pages                
01-original-metadata.json   1569
02-textract-raw.json        1308687
03-textract-normalized.json 1699810
04-vision.json              9822
06-question-candidates.json 104297
07-question-tree.json       8205050
08-answer-regions.json      759798
09-mapping-candidates.json  90568
10-mapping-decisions.json   253451
11-highlight-regions.json   97602

---Vercel check---
{
  "name": "veda-ai",
  "version": "0.2.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "ai:smoke-test": "tsx scripts/ai-smoke.ts",
    "assessment:smoke-test": "tsx scripts/assessment-smoke.ts",
    "audit": "tsx scripts/audit.ts",
    "evaluate": "tsx scripts/evaluate.ts",
    "test:aws": "tsx scripts/aws-smoke.ts"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.800.0",

```

---

## Assistant (Build · Muse Spark 1.2 Free · 9.2s)

**Tool: bash**

**Input:**
```json
{
  "command": "python -c \"import sys; print(sys.executable); print(sys.version)\"; pip list 2>&1 | Select-Object -First 40; Write-Output \"---check paddlepaddle---\"; python -c \"import paddle; print(paddle.__version__)\" 2>&1; python -c \"import paddleocr; print(paddleocr.__version__)\" 2>&1; nvidia-smi 2>&1 | Select-Object -First 5; Write-Output \"---ram---\"; Get-CimInstance Win32_ComputerSystem | Select-Object TotalPhysicalMemory; Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory, TotalVisibleMemorySize"
}
```

**Output:**
```
C:\Python311\python.exe
3.11.7 (tags/v3.11.7:fa7a6f2, Dec  4 2023, 19:24:49) [MSC v.1937 64 bit (AMD64)]
Package                   Version      Editable project location
------------------------- ------------ -------------------------
anyio                     4.11.0
argon2-cffi               25.1.0
argon2-cffi-bindings      25.1.0
arrow                     1.4.0
arxiv                     4.0.0
asttokens                 3.0.0
async-lru                 2.0.5
attrs                     25.4.0
babel                     2.17.0
beautifulsoup4            4.14.2
bleach                    6.3.0
certifi                   2025.10.5
cffi                      2.0.0
charset-normalizer        3.4.4
colorama                  0.4.6
comm                      0.2.3
contourpy                 1.3.3
curl_cffi                 0.16.1
cycler                    0.12.1
debugpy                   1.8.17
decorator                 5.2.1
defusedxml                0.7.1
distlib                   0.4.0
executing                 2.2.1
fastjsonschema            2.21.2
filelock                  3.29.0
fonttools                 4.60.1
fqdn                      1.5.1
fsspec                    2025.9.0
git-filter-repo           2.47.0
h11                       0.16.0
httpcore                  1.0.9
httpx                     0.28.1
idna                      3.11
ipykernel                 7.1.0
ipython                   9.7.0
ipython_pygments_lexers   1.1.1
ipywidgets                8.1.8
---check paddlepaddle---
[31;1mTraceback (most recent call last):[0m
[31;1m  File "<string>", line 1, in <module>[0m
[31;1mModuleNotFoundError: No module named 'paddle'[0m
[31;1mTraceback (most recent call last):[0m
[31;1m  File "<string>", line 1, in <module>[0m
[31;1mModuleNotFoundError: No module named 'paddleocr'[0m
Sat Aug 29 13:58:12 2026       
+-----------------------------------------------------------------------------------------+
| NVIDIA-SMI 596.08                 Driver Version: 596.08         CUDA Version: 13.2     |
+-----------------------------------------+------------------------+----------------------+
| GPU  Name                  Driver-Model | Bus-Id          Disp.A | Volatile Uncorr. ECC |
---ram---

[32;1mTotalPhysicalMemory[0m
[32;1m-------------------[0m
        16849256448
                   


```

---

## Assistant (Build · Muse Spark 1.2 Free · 5.9s)

**Tool: bash**

**Input:**
```json
{
  "command": "pip list 2>&1 | Select-String -Pattern \"paddle|ocr|onnx|torch\"; Write-Output \"---disk---\"; Get-PSDrive C | Select-Object Used, Free; python -c \"import platform; print(platform.platform()); import os; print(os.cpu_count())\"; Write-Output \"---gpu detail---\"; nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv 2>&1 | Select-Object -First 10"
}
```

**Output:**
```

[7mtorch[0m                     2.5.1+cu121
[7mtorch[0maudio                2.5.1+cu121
[7mtorch[0mvision               0.20.1+cu121
---disk---

[32;1mUsed : [0m364447338496
[32;1mFree : [0m130360991744

Windows-10-10.0.26200-SP0
16
---gpu detail---
name, memory.total [MiB], memory.free [MiB]
NVIDIA GeForce RTX 3050 6GB Laptop GPU, 6144 MiB, 5905 MiB


```

---

## Assistant (Build · Muse Spark 1.2 Free · 6.2s)

**Tool: bash**

**Input:**
```json
{
  "command": "pip show torch 2>&1 | Select-Object -First 20; Write-Output \"---try paddle install check---\"; pip index versions paddlepaddle 2>&1 | Select-Object -First 20; pip index versions paddleocr 2>&1 | Select-Object -First 20"
}
```

**Output:**
```
Name: torch
Version: 2.5.1+cu121
Summary: Tensors and Dynamic neural networks in Python with strong GPU acceleration
Home-page: https://pytorch.org/
Author: PyTorch Team
Author-email: packages@pytorch.org
License: BSD-3-Clause
Location: C:\Python311\Lib\site-packages
Requires: filelock, fsspec, jinja2, networkx, sympy, typing-extensions
Required-by: torchaudio, torchvision
---try paddle install check---
paddlepaddle (3.3.1)
Available versions: 3.3.1, 3.3.0, 3.2.2, 3.2.1, 3.2.0, 3.1.1, 3.1.0, 3.0.0, 2.6.2
paddleocr (3.7.0)
Available versions: 3.7.0, 3.6.0, 3.5.0, 3.4.1, 3.4.0, 3.3.3, 3.3.2, 3.3.1, 3.3.0, 3.2.0, 3.1.1, 3.1.0, 3.0.3, 3.0.2, 3.0.1, 3.0.0, 2.10.0, 2.9.1, 2.9.0, 2.8.1, 2.8.0, 2.7.3, 2.7.2, 2.7.0.3, 2.7.0.2, 2.7.0.1, 2.7.0.0, 2.6.1.3, 2.6.1.2, 2.6.1.1, 2.6.1.0, 2.6.0.3, 2.6.0.2, 2.6.0.1, 2.6, 2.5.0.3, 2.5.0.2, 2.5, 2.4.0.4, 2.4.0.3, 2.4.0.2, 2.4.0.1, 2.4, 2.3.0.2, 2.3.0.1, 2.3, 2.2.0.2, 2.2.0.1, 2.2, 2.0.6, 2.0.5, 2.0.4, 2.0.3, 2.0.2, 2.0.1, 1.1.1, 1.0.1, 1.0.0, 0.0.3.1, 0.0.3, 0.0.2, 0.0.1.1, 0.0.0

```

---

## Assistant (Build · Muse Spark 1.2 Free · 10.3s)

_Thinking:_

Assessing PaddleOCR PP-StructureV3 feasibility on CUDA with Python 3.

_Thinking:_

Updating the audit to reflect PaddleOCR feasibility and planning a minimal local install test.

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "Phase 1: Forensic audit - inspect repo structure, configs, package.json",
      "status": "completed",
      "priority": "high"
    },
    {
      "content": "Trace Textract/OCR/Vision runtime path and contracts",
      "status": "completed",
      "priority": "high"
    },
    {
      "content": "Document all contracts and create docs/LOCAL_OCR_MIGRATION_AUDIT.md",
      "status": "in_progress",
      "priority": "high"
    },
    {
      "content": "Phase 2-6: Benchmark PaddleOCR candidate selection and measurements",
      "status": "pending",
      "priority": "high"
    },
    {
      "content": "Phase 7-11: Implement local OCR provider + normalization + coordinates",
      "status": "pending",
      "priority": "high"
    },
    {
      "content": "Phase 12-26: Fusion, structure, mapping, highlighting verification",
      "status": "pending",
      "priority": "medium"
    },
    {
      "content": "Phase 27-46: Cutover, tests, E2E, final verification report",
      "status": "pending",
      "priority": "medium"
    }
  ]
}
```

**Output:**
```
[
  {
    "content": "Phase 1: Forensic audit - inspect repo structure, configs, package.json",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Trace Textract/OCR/Vision runtime path and contracts",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Document all contracts and create docs/LOCAL_OCR_MIGRATION_AUDIT.md",
    "status": "in_progress",
    "priority": "high"
  },
  {
    "content": "Phase 2-6: Benchmark PaddleOCR candidate selection and measurements",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Phase 7-11: Implement local OCR provider + normalization + coordinates",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Phase 12-26: Fusion, structure, mapping, highlighting verification",
    "status": "pending",
    "priority": "medium"
  },
  {
    "content": "Phase 27-46: Cutover, tests, E2E, final verification report",
    "status": "pending",
    "priority": "medium"
  }
]
```

---

## Assistant (Build · Muse Spark 1.2 Free · 3.4s)

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\docs\\FORENSIC_AUDIT.md"
}
```

**Output:**
```
<path>E:\vedaAi\docs\FORENSIC_AUDIT.md</path>
<type>file</type>
<content>
1: # FORENSIC AUDIT — VedaAI (2026-08-28)
2: 
3: > Full repository trace. Each subsystem classified per absolute rules.
4: > Verified via file read + grep + typecheck + tests. No assumptions.
5: 
6: ## Classification Legend
7: 
8: - **REAL + VERIFIED** — real implementation, evidence chain intact, tested
9: - **REAL BUT BROKEN** — real but has bug impacting correctness
10: - **PARTIAL** — structure exists but incomplete or edge-cases unhandled
11: - **MOCK** — uses mock/fixture in production-adjacent path
12: - **STUB** — placeholder
13: - **MISSING** — not implemented
14: - **UNKNOWN** — cannot determine without live Textract/Vision run
15: 
16: ---
17: 
18: ## 1. File Layer `src/lib/files/validation.ts`, `src/lib/documents/pdf.ts`, `src/app/api/jobs/[jobId]/upload/route.ts`
19: 
20: - **Status: REAL + VERIFIED**
21: - Files: `src/lib/files/validation.ts:1`, `src/lib/documents/pdf.ts:1`, `src/lib/documents/classifier.ts:1`
22: - Current: MIME via `file-type` magic bytes, size/pages caps, pdf inspection via `pdf-lib`, Supabase storage fallback to local tmp. Correct.
23: - Root cause N/A
24: - Impact: Low
25: - Fix: None
26: - Verify: unit + integration upload test
27: 
28: **Issue found:** `.env` contains real `AWS_SECRET_ACCESS_KEY`, `OPENROUTER_API_KEY` in plaintext — must rotate after audit (separate security task).
29: 
30: ---
31: 
32: ## 2. Document Layer `src/lib/documents/*`
33: 
34: - **Status: REAL + VERIFIED**
35: - Page dimensions/rotation preserved via `inspectPdf`/`inspectImage`, stored in `DocumentPage` (`src/types/index.ts:52`), routed through `pageStoreApi`.
36: - Verified: `src/lib/jobs/runner.ts:229` preprocess creates pages.
37: 
38: ---
39: 
40: ## 3. Perception Layer — OCR/Textract `src/lib/ocr/*`
41: 
42: - **Status: REAL BUT BROKEN (dev fallback masks failure)**
43: - Files: `src/lib/ocr/textract.ts:1`, `src/lib/ocr/types.ts:1`, `src/lib/ocr/s3.ts`, `src/lib/jobs/runner.ts:327`
44: - Current: `TextractOcrProvider.submitDocument` uses `StartDocumentAnalysis` with TABLES+LAYOUT, polls via `GetDocumentAnalysis`, normalizes blocks to `OcrDocumentResult` with normalized [0,1] `BoundingBox` preserved per LINE (`textract.ts:199`). Geometry preserved.
45: - **Broken:** `runner.ts:401-419` silently falls back to `MockOcrProvider` when `AWS_S3_BUCKET` missing and `NODE_ENV !== production`. This hides prod misconfiguration in dev and violates ABSOLUTE RULE "silently fallback to mock". In production it throws, but in local dev it fakes geometry. Documented as dev-only; risk that staging without bucket still passes.
46: - **Broken:** `normalizeTextractBlocks` synthesizes `OcrBlock` by gap heuristic (`gap>0.025`) — heuristic not tested against diagram-heavy pages; may merge tables incorrectly.
47: - Fix: Make dev fallback explicit via `OCR_PROVIDER=mock` only; remove implicit fallback or log `WARN` with `ok: false`. Add invariant: production pipeline must assert `OCR_PROVIDER !== mock`.
48: - Verify: `npm run test:aws` + live job with real PDF (see `artifacts/ocr-debug/<jobId>/`)
49: 
50: ---
51: 
52: ## 4. Vision Layer `src/lib/vision/*`
53: 
54: - **Status: PARTIAL**
55: - Files: `src/lib/vision/provider.ts`, `openrouter-vision.ts`, `router.ts`, `fusion.ts`, `canonical.ts`
56: - Current: `router.shouldInvokeVision` uses avgConfidence, line count, handwriting signal, multi-column heuristic. Provider sends real page PNG (when `canvas` available) via `renderPdfPagesForVision`. Fusion grounds Vision labels against Textract lines (`fusion.ts:48`) and down-weights ungrounded. Coordinates are NOT taken from Vision; Vision is evidence-only.
57: - **Partial:** `render.ts:32` requires `canvas` npm module which is not installed → `hasCanvas` false → fallback to sending same full PDF base64 per page (`mimeType: application/pdf`). `openrouter-vision.ts` then sends PDF bytes — Qwen3-VL can handle PDF but prompt expects image; coverage untested. Also `VISION_MAX_PAGES=3` but question paper may be 8+ pages; only first pages sent.
58: - **Missing:** `VisionDocumentAnalysis` schema never validated with Zod (prompts have no schema validation per spec).
59: - Fix: Install `canvas` or use `pdfjs-dist` server render via `sharp`; validate Vision response with Zod and bounded retry (see `src/lib/ai/factory.ts` — not done for vision).
60: - Verify: `artifacts/debug/<jobId>/vision-*.json` + inspect `qpOcr` vs `visionResult`.
61: 
62: ---
63: 
64: ## 5. Structure / Question Parser `src/lib/structure/question-parser.ts`
65: 
66: - **Status: REAL BUT BROKEN (hardcoded hacks + fragile regex)**
67: - Current: `QUESTION_LABEL_RE` requires digit base, `STANDALONE_SUBPART_RE` for (a)/(i), reading order with strict two-column detection, marks/table filtering, instruction phrase list. `parseQuestionsFromTextract` builds `ParsedQuestion` with `bboxesByPage: Map<number, boxes>` and correctly appends option lines to parent (`isOptionLine`).
68: - **Broken — hardcoded paper-specific leakage filters:** `isPageHeaderFooter` contains ~15 literals like `onls 7.`, `31/2/1`, `RTCT 7.`, `Parth`, `7)2`, `NKJH #`, `onls 3th`, `FATTRA`, `31/ETCH`, `4807`, `31924`, `400 23` (`question-parser.ts:113-114`). These are subject-specific hacks for one sample paper; violates AGENTS.md "NEVER hardcode subject keywords". They mask OCR errors rather than fix root cause and will miss new papers.
69: - **Broken — over-filtering:** `isTableCell` flags any 1-2 digit number at x 0.22-0.78 y 0.5-0.78 as table cell; may drop legitimate subparts like `(a) 3` inside a table question.
70: - **Broken — subpart explosion guard:** duplicate `expectedTopLevelSet` logic duplicated between parser and validator; sequence `Q1 → A10` not globally validated.
71: - Fix: Remove paper-specific literals; replace with generic geometry/confidence heuristics (low conf + symbol-only + header y-band). Move thresholds to `src/lib/config`. Keep only generic instruction phrases.
72: - Verify: `tests/unit/question-parser.test.ts` + `tests/unit/numbering.test.ts` + manual `questionPaper-textract.json` inspection.
73: 
74: ---
75: 
76: ## 6. Numbering `src/lib/structure/numbering.ts`
77: 
78: - **Status: REAL + VERIFIED (with edge-case gaps)**
79: - Normalizes `Q1`, `11(a)`, `22(i)` etc. Supports `1l→11` OCR fix. Depth logic correct.
80: - **Partial:** Single letter `a` → `(a)` conversion ambiguous when MCQ options vs subparts; relies on caller `isOptionLine` to disambiguate. No test for `Q. 11 (b) (ii)`.
81: - Verify: `tests/unit/numbering.test.ts`.
82: 
83: ---
84: 
85: ## 7. Question Validator `src/lib/structure/validator.ts`
86: 
87: - **Status: REAL BUT BROKEN**
88: - Detects expected IDs from `question no. 1 to 14` ranges, flags instruction/section/option leakage, duplicate numbers, gaps.
89: - **Broken:** `detectExpectedTopLevelIds` only looks for `question no.` English pattern; fails on Hindi or alternate phrasing. Gaps warning threshold `>5` arbitrary.
90: - Not broken: correctly does not silently accept bad structure — throws `STRUCTURE_VALIDATION_FAILED` in `runner.ts:825`.
91: 
92: ---
93: 
94: ## 8. MCQ Handling
95: 
96: - **Status: PARTIAL**
97: - Parser correctly treats `(a)-(d)` short lines (<80 chars) as option text appended to parent, not top-level (`question-parser.ts:384-395`). `answer-segmentation` not involved.
98: - **Broken:** If MCQ spans columns or options are wide (>80 chars with math), `isOptionLine` returns false → options become separate `STANDALONE_SUBPART` questions with depth 1, inflated count. Also `PartType` for option cluster is `PART` not `OPTION` — `QuestionNode.partType` enum has no `OPTION` (`src/types/index.ts:98`). Required by Phase 7.
99: - Fix: Add `partType: OPTION` and use layout proximity + indentation to decide; treat `(a)-(d)` cluster within same y-band as options.
100: - Verify: synthetic MCQ paper with 4-option block.
101: 
102: ---
103: 
104: ## 9. Hierarchy — Parent/Subpart
105: 
106: - **Status: REAL BUT BROKEN**
107: - `normalizeNumber` yields `parent`, `depth`, `partType`. `question-parser.ts:451` infers parent via `lastNumeric` for standalone `(a)`/`(i)`. `structuring` resolves `parentNumber` → `parentQuestionId`.
108: - **Broken:** Standalone `(i)` after MCQ `(a)` may attach to wrong numeric parent (last top-level, not MCQ parent). No explicit `children` array; UI must infer via `parentQuestionId`. Result API does not return tree, only flat `questions` list — frontend must reconstruct hierarchy.
109: - Fix: Return `questionTree` or ensure `parentQuestionId` chain is correct and tested.
110: 
111: ---
112: 
113: ## 10. Answer Segmentation `src/lib/structure/answer-segmentation.ts`
114: 
115: - **Status: REAL BUT BROKEN**
116: - Detects `Ans 1`, `Q1`, `1.` labels via regex, groups lines by label, preserves `bboxesByPage: Map<number, boxes>`.
117: - **Broken — per-page split lost:** `segmentAnswersFromTextract` stores `bboxesByPage` correctly, but `structuring` (`runner.ts:959`) splits segmented answer into **multiple `AnswerRegion` per page** with same `continuationGroupId` but creates **one `AnswerGroup` per region** then merges only if same `questionLabel` (`groupedByLabel`). Multi-page answer with same label gets merged (correct), but untagged continuation (no label on page 2) becomes separate `AnswerGroup` with `questionLabel=undefined` → never merged → shown as `UNMATCHED` though it is continuation.
118: - **Broken — assumption:** `AnswerGroup = AnswerRegion[]` but code creates 1:1 groups then merges only by label, not spatial continuity.
119: - Fix: Merge untagged regions by spatial gap <0.04 and y-proximity to prior labeled region on next page; or concatenate labels via order.
120: - Verify: `tests/unit/answer-segmentation.test.ts`.
121: 
122: ---
123: 
124: ## 11. Mapping `src/lib/jobs/runner.ts:1039`, `src/lib/decision/index.ts`
125: 
126: - **Status: REAL BUT BROKEN — no global conflict detection**
127: - Evidence: explicit label (0.95/0.92), semantic Jaccard, layout continuity, OCR conf, visual. Score via `aggregateScore`. Decision via `decideForQuestion` with thresholds `high=0.75 review=0.5`.
128: - **Broken — Phase 19 violation:** Loops `for q in questions` greedily picks best `answerGroup` per question without checking if same group already assigned to another question. Code has `usedAnswerGroups` set but only for `MATCHED` status and never consulted to filter candidates (`runner.ts:1113`). Multiple questions can map `→ A10`.
129: - **Broken — MCQ parent/subpart unaware:** No `SUBQUESTION_MATCH` or `SECTION_MATCH` evidence used; parent question `22` and child `(i)` compete for same answer region.
130: - Fix: After per-question scoring, run greedy global assignment sorted by score desc, or Hungarian. Add `QUESTION_ORDER` evidence already available but not used.
131: - Verify: integration `job.test.ts` with duplicate labels.
132: 
133: ---
134: 
135: ## 12. Confidence/Evidence `src/lib/evidence/aggregate.ts`, `src/types/index.ts:137`
136: 
137: - **Status: REAL + VERIFIED**
138: - `Evidence {type, score, reliability, explanation}` aggregated via weighted mean. Mapping confidence derived, not fabricated.
139: - Not broken: stores `ocrConfidence`, `labelConfidence`, `mappingConfidence` separately.
140: 
141: ---
142: 
143: ## 13. Coordinates `src/lib/coordinates/transform.ts`
144: 
145: - **Status: REAL + VERIFIED (pure functions, tested)**
146: - `normalizeBox`, `denormalizeBox`, `rotateBox` (0/90/180/270), `mergeBoxes`, `boxIoU`. Tests in `tests/unit/coordinates.test.ts`.
147: - **Partial:** `cropBox` logic inverted comment vs code; `scaleBox` is no-op (correct for normalized). Not used consistently — viewer directly uses `%` style from normalized boxes, correct for 0..1 canonical.
148: - Verify: tested at scales 0.5/1/2, rotations 0/90/180/270 per spec (partial — only unit tests, no e2e zoom test).
149: 
150: ---
151: 
152: ## 14. Storage/Job Lifecycle `src/lib/storage/index.ts`, `src/lib/jobs/runner.ts:26`
153: 
154: - **Status: REAL + VERIFIED**
155: - `jobStore`, `documentStore`, `pageStoreApi`, `fileStorage` (Supabase or local tmp). Idempotency guard at `startProcessing:61`, hard timeout 10 min. Persisted result via `PersistedResultStore` (in-memory + sync disk `os.tmpdir/veda-ai/persist/result-*.json`).
156: - Correct: page reload preserves result (disk fallback).
157: 
158: ---
159: 
160: ## 15. PDF Viewer `src/components/viewer/*`, `src/app/api/files/[jobId]/[fileId]/route.ts`
161: 
162: - **Status: REAL BUT BROKEN**
163: - Files: `src/components/viewer/AnswerSheetViewer.tsx:1`, `src/components/viewer/PdfViewer.tsx:1`, file route `88`
164: - API: returns real PDF bytes with `Content-Type: application/pdf`, `Accept-Ranges`, `Content-Range` for range requests, MIME via magic bytes, auth via guestSession/userId. Verified `route.ts:62` range handling.
165: - Viewer load: `AnswerSheetViewer.PdfContent` imports `pdfjs-dist/legacy/build/pdf.mjs`, sets CDN worker `https://cdn.jsdelivr.net/.../pdf.worker.mjs` (`AnswerSheetViewer.tsx:263`). Renders via canvas at scale 1.5, DPR aware. Shows error UI with direct open link.
166: - **Broken — CDN worker fragility:** Worker URL may 403 or be blocked (no SRI, no fallback to local `pdf.worker.mjs`). Code has try/catch but `PdfViewer.tsx` fallback disables worker only after first failure, causing blank viewer until retry. No `onError` for `InvalidPDFException`, `MissingPDFException` surfaced via error state but not logged to backend.
167: - **Broken — pagination vs highlight:** `AnswerSheetViewer.PdfContent` pagination shows only `pagesToRender = [currentPage]` (`AnswerSheetViewer.tsx:353`) — multi-page answer continuation (`page 5 + page 6`) cannot be seen together; user must page manually but highlight for non-current page hidden (filtered). Spec requires "all continuation regions highlighted if multi-page" — needs scroll-all mode or prev/next highlight navigation.
168: - **Broken — label tag:** Badge shows `Q${pageNumber}` not question number (`AnswerSheetViewer.tsx:124,199,381`). Fabricated label.
169: - **Broken — per-line highlights:** `highlights.filter` then `hr.boxes.map` renders one div per Textract line box (`AnswerSheetViewer.tsx:182`, `PdfViewer.tsx:227`). Per Phase 28 this is BAD — should be one coherent region per page (union). Also `transform: scale(scale/100)` on container distorts absolute overlay if not applied to overlay.
170: - Fix: Merge boxes per `HighlightRegion` via `mergeBoxes` + 2% padding; show both pages stacked with scroll; fix badge to show `selectedQuestion.normalizedNumber`.
171: 
172: ---
173: 
174: ## 16. Question Click → Page Navigation `src/app/results/[jobId]/page.tsx:250`
175: 
176: - **Status: PARTIAL**
177: - `selected = questionResults.find(q=>q.id===selectedId)` → `highlights = selected.highlightRegions` → `activePageId = highlights[0].pageId` → passed to `AnswerSheetViewer` which does `scrollIntoView` via `document.getElementById(pdf-page-${pageNumber})` (`AnswerSheetViewer.tsx:244`). Works for first page only; continuation pages not auto-scrolled.
178: - **Broken:** `QuestionCard` click handler sets `selectedId` but `AnswerSheetViewer` is paginated single-page; `activePageNumber` triggers `setCurrentPage` via effect, but if answer spans 5+6, page 6 not visible. Also `selectedQuestionId` prop is passed but not used to display label (shows page number).
179: - Fix: Support `highlightRegions: HighlightRegion[]` with multiple `pageId`; navigation should scroll to first highlight and keep next/prev to jump between continuation pages.
180: 
181: ---
182: 
183: ## 17. Highlight Positioning `src/app/results/[jobId]/page.tsx`, `AnswerSheetViewer.tsx`
184: 
185: - **Status: REAL BUT BROKEN (per-line vs region)**
186: - Uses `%` style `left: box.x*100%` etc. Correct for normalized [0,1]. But source boxes are per-line LINE boxes, not per-answer-region union. Gap between lines → many small boxes, not one coherent region (Phase 28 violation).
187: - Fix: In `structuring` or `localizing`, compute `mergedBox = mergeBoxes(reg.normalizedBoxes)` + small padding (0.01) per page.
188: 
189: ---
190: 
191: ## 18. Config/Env `src/lib/config/index.ts`
192: 
193: - **Status: REAL + VERIFIED**
194: - Single validated config, Zod, no scattered magic numbers. Thresholds via `mappingThresholds.high/review`. Good.
195: 
196: ---
197: 
198: ## 19. AI Provider Abstraction `src/lib/ai/*`
199: 
200: - **Status: REAL + VERIFIED (unused for deterministic path)**
201: - `AIProvider` interface + OpenAI/OpenRouter impl exist but `runner.ts:706` uses deterministic `parseQuestionsFromTextract` directly; AI not on critical path for question extraction (Vision is separate). Correct per "LLM is not source of truth".
202: 
203: ---
204: 
205: ## 20. Tests `tests/*`
206: 
207: - **Status: PARTIAL**
208: - Unit: numbering, coordinates, decision, question-parser, answer-segmentation, textract normalization — all pass (65 tests). Integration `job.test.ts` exists.
209: - **Missing:** No E2E `playwright` test for upload→result→PDF→click→highlight; no test for MCQ options vs subparts; no test for global conflict; no test for multi-page continuation merge.
210: 
211: ---
212: 
213: ## Overall Verdict
214: 
215: | Subsystem | Verdict |
216: |---|---|
217: | File/Document | REAL + VERIFIED |
218: | Textract OCR + geometry | REAL BUT BROKEN (implicit mock fallback) |
219: | Vision | PARTIAL |
220: | Question parser | REAL BUT BROKEN (hardcoded literals) |
221: | Numbering | REAL + VERIFIED |
222: | Validator | REAL BUT BROKEN |
223: | MCQ structure | PARTIAL |
224: | Hierarchy | REAL BUT BROKEN |
225: | Answer segmentation | REAL BUT BROKEN (continuation) |
226: | Mapping | REAL BUT BROKEN (no global assignment) |
227: | Evidence/Confidence | REAL + VERIFIED |
228: | Coordinates | REAL + VERIFIED |
229: | Storage/Jobs | REAL + VERIFIED |
230: | PDF viewer | REAL BUT BROKEN (worker, pagination, per-line, label) |
231: | Navigation | PARTIAL |
232: | Highlight | REAL BUT BROKEN (per-line) |
233: 
234: Major root causes: (1) sample-paper hardcoded filters, (2) greedy mapping without global conflict, (3) per-line highlights vs region, (4) paginated viewer hiding continuation + wrong label, (5) implicit mock fallback, (6) continuation untagged answers.
235: 

(End of file - total 235 lines)
</content>
```

**Tool: bash**

**Input:**
```json
{
  "command": "Get-Content -LiteralPath \"E:\\vedaAi\\src\\lib\\vision\\canonical.ts\" | Select-Object -First 100"
}
```

**Output:**
```
import type { OcrDocumentResult, OcrPageResult } from "@/lib/ocr/types";
import type { DocumentPage } from "@/types";
import type { VisionDocumentAnalysis } from "./provider";

/**
 * Canonical Document Representation - provider-neutral
 * Every downstream stage consumes this, not raw Textract or Vision JSON.
 */
export interface CanonicalPage {
  pageNumber: number;
  pageId: string;
  dimensions: { width: number; height: number };
  rotation: number;
  lines: OcrPageResult["lines"];
  blocks: OcrPageResult["blocks"];
  text: string;
  confidence: number;
  visualRegions?: VisionDocumentAnalysis["pages"][number]["visualRegions"];
}

export interface CanonicalDocument {
  jobId: string;
  documentId: string;
  kind: "questionPaper" | "answerSheet";
  pages: CanonicalPage[];
  fullText: string;
  ocrProvider: string;
  ocrConfidence: number;
  visionEvidence?: VisionDocumentAnalysis | null;
  evidence: { type: string; source: string; score: number; explanation: string }[];
  pageCount: number;
  createdAt: string;
}

export function buildCanonicalDocument(
  ocr: OcrDocumentResult,
  pages: DocumentPage[],
  vision?: VisionDocumentAnalysis | null,
  jobId?: string
): CanonicalDocument {
  const pageByNumber = new Map<number, DocumentPage>();
  for (const p of pages) pageByNumber.set(p.pageNumber, p);

  const canonicalPages: CanonicalPage[] = ocr.pages
    .slice()
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((pg) => {
      const docPage = pageByNumber.get(pg.pageNumber);
      const visionPage = vision?.pages.find((v) => v.pageNumber === pg.pageNumber);
      return {
        pageNumber: pg.pageNumber,
        pageId: docPage?.id || `page-${pg.pageNumber}`,
        dimensions: { width: docPage?.width || pg.width || 800, height: docPage?.height || pg.height || 1100 },
        rotation: docPage?.rotation || pg.rotation || 0,
        lines: pg.lines || [],
        blocks: pg.blocks || [],
        text: pg.text || "",
        confidence: pg.confidence ?? 0.9,
        visualRegions: visionPage?.visualRegions,
      };
    });

  const fullText = canonicalPages.map((p) => p.text).join("\n\n");
  const ocrConfidence = canonicalPages.length ? canonicalPages.reduce((a, p) => a + p.confidence, 0) / canonicalPages.length : 0;

  const evidence: CanonicalDocument["evidence"] = [
    { type: "TEXTRACT_GEOMETRY", source: `textract-${ocr.operationId.slice(0, 8)}`, score: ocrConfidence, explanation: `Textract ${ocr.pages.length} pages, ${canonicalPages.reduce((a, p) => a + p.lines.length, 0)} lines` },
  ];
  if (vision) {
    evidence.push({ type: "VISION_STRUCTURE", source: `vision-${vision.pages.length}pages`, score: 0.75, explanation: `Vision ${vision.pages.length} pages analyzed` });
  }

  return {
    jobId: jobId || ocr.jobId,
    documentId: ocr.documentId,
    kind: ocr.kind,
    pages: canonicalPages,
    fullText,
    ocrProvider: ocr.provider,
    ocrConfidence,
    visionEvidence: vision || null,
    evidence,
    pageCount: canonicalPages.length,
    createdAt: new Date().toISOString(),
  };
}

```

---

## Assistant (Build · Muse Spark 1.2 Free · 818.2s)

_Thinking:_



**Tool: bash**

**Input:**
```json
{
  "command": "pip install paddlepaddle==3.3.1 -q 2>&1 | Select-Object -First 50; Write-Output \"---PADDLE INSTALLED CHECK---\"; python -c \"import paddle; print(paddle.__version__)\" 2>&1 | Select-Object -First 10"
}
```

**Output:**
```
(no output)

<shell_metadata>
shell tool terminated command after exceeding timeout 120000 ms. If this command is expected to take longer and is not waiting for interactive input, retry with a larger timeout value in milliseconds.
</shell_metadata>
```

---

## Assistant (Build · Muse Spark 1.2 Free · 52.9s)

**Tool: bash**

**Input:**
```json
{
  "command": "timeout 180 pip install paddlepaddle --quiet 2>&1 | head -n 30; echo \"exit code $?\"; python -c \"import paddle; print('paddle ok', paddle.__version__)\" 2>&1 | head -n 10"
}
```

**Output:**
```
[31;1mhead: [31;1mThe term 'head' is not recognized as a name of a cmdlet, function, script file, or executable program.[0m
[31;1m[31;1mCheck the spelling of the name, or if a path was included, verify that the path is correct and try again.[0m
exit code False
[31;1mhead: [31;1mThe term 'head' is not recognized as a name of a cmdlet, function, script file, or executable program.[0m
[31;1m[31;1mCheck the spelling of the name, or if a path was included, verify that the path is correct and try again.[0m

```

---

## Assistant (Build · Muse Spark 1.2 Free · 12.0s)

**Tool: bash**

**Input:**
```json
{
  "command": "pip install --quiet paddlepaddle 2>&1 | ForEach-Object { $_ } | Select-Object -First 30; Write-Output \"DONE_PADDLE\"; python -c \"import paddle; print(paddle.__version__)\" 2>&1 | Select-Object -First 5"
}
```

**Output:**
```
DONE_PADDLE
[31;1mINFO: Could not find files for the given pattern(s).[0m
[31;1mC:\Python311\Lib\site-packages\paddle\utils\cpp_extension\extension_utils.py:712: UserWarning: No ccache found. Please be aware that recompiling all source files may be required. You can download and install ccache from: https://github.com/ccache/ccache/blob/master/doc/INSTALL.md[0m
[31;1m  warnings.warn(warning_message)[0m
3.3.1

```

---

## Assistant (Build · Muse Spark 1.2 Free · 123.6s)

_Thinking:_



**Tool: bash**

**Input:**
```json
{
  "command": "pip install --quiet paddleocr 2>&1 | Select-Object -First 40; Write-Output \"DONE_OCR\"; python -c \"import paddleocr; print(paddleocr.__version__)\" 2>&1 | Select-Object -First 10"
}
```

**Output:**
```
(no output)

<shell_metadata>
shell tool terminated command after exceeding timeout 120000 ms. If this command is expected to take longer and is not waiting for interactive input, retry with a larger timeout value in milliseconds.
</shell_metadata>
```

---

## Assistant (Build · Muse Spark 1.2 Free · 89.0s)

**Tool: bash**

**Input:**
```json
{
  "command": "pip install --quiet paddleocr 2>&1 | ForEach-Object { \"$_\" } | Select-Object -First 50; Write-Output \"END\"; python -c \"import paddleocr; print('ocr version', paddleocr.__version__)\" 2>&1 | Select-Object -First 20"
}
```

**Output:**
```
END
[31;1mC:\Python311\Lib\site-packages\requests\__init__.py:113: RequestsDependencyWarning: urllib3 (2.5.0) or chardet (7.6.0)/charset_normalizer (3.4.4) doesn't match a supported version![0m
[31;1m  warnings.warn([0m
[31;1mMatplotlib is building the font cache; this may take a moment.[0m
ocr version 3.7.0

```

---

## Assistant (Build · Muse Spark 1.2 Free · 6.6s)

_Thinking:_



_Thinking:_



**Tool: bash**

**Input:**
```json
{
  "command": "Get-ChildItem -LiteralPath \"C:\\Users\\Dell\\AppData\\Local\\Temp\\veda-ai\" -Recurse -Filter \"*.pdf\" -ErrorAction SilentlyContinue | Select-Object FullName, Length | Format-Table -AutoSize | Select-Object -First 30; Write-Output \"---persist dir---\"; Get-ChildItem -LiteralPath \"C:\\Users\\Dell\\AppData\\Local\\Temp\\veda-ai\\persist\" | Select-Object Name | Format-Table -AutoSize | Select-Object -First 20; Write-Output \"---artifacts pdf fallback---\"; Get-ChildItem -LiteralPath \"E:\\vedaAi\\artifacts\" -Recurse -Filter \"*.json\" | Where-Object Name -like \"*metadata*\" | Select-Object FullName | Select-Object -First 5"
}
```

**Output:**
```
---persist dir---

[32;1mName[0m
[32;1m----[0m
docs-1993e957-fbb1-4b20-99ae-e2907aaa7167.json
docs-1fb585c0-192d-4a24-a995-f5269cb2b6db.json
docs-27c9e3c2-646d-43f8-b8d2-f8c8472f6093.json
docs-2948b7b5-5049-4e9c-881f-c8af297b4362.json
docs-2a7d6cd2-55cb-464f-8c42-f88979ede767.json
docs-39ac494f-ecec-4ccc-91ca-c9e9995a644b.json
docs-3b420e00-f7f2-4613-b5fc-bb43051f476e.json
docs-43e2068c-f40e-4d81-b75f-4f5fe7ead7ee.json
docs-455f008a-9820-41d6-9dce-3dfa2faab170.json
docs-50251b47-b499-4b86-a696-25a19740fcc0.json
docs-6ede3178-0f32-4153-b179-40fd615e0423.json
docs-7c689ceb-2d46-4ac5-ac30-cd6950413b2e.json
docs-801ee407-30d2-4400-9c12-f3066405446e.json
docs-8b147433-8954-41a3-b933-46f1fc83ffcd.json
docs-a2eec7ab-16f0-442c-aad2-d02b8183a17d.json
docs-a9d43cda-61fc-4b6c-8897-1218a390ce32.json
docs-aede5e44-01dc-4b76-9884-13c74588c5ae.json
docs-b768c47f-2bd8-4d32-81fe-1947ef6aac27.json
---artifacts pdf fallback---


[32;1mFullName[0m
[32;1m--------[0m
E:\vedaAi\artifacts\39ac494f-ecec-4ccc-91ca-c9e9995a644b\01-original-metadata.json


[32;1mFullName[0m
[32;1m--------[0m
E:\vedaAi\artifacts\43e2068c-f40e-4d81-b75f-4f5fe7ead7ee\01-original-metadata.json


[32;1mFullName[0m
[32;1m--------[0m
E:\vedaAi\artifacts\d9313b31-3e7c-4111-b39b-b32e9870695b\01-original-metadata.json


[32;1mFullName[0m
[32;1m--------[0m
E:\vedaAi\artifacts\e6d60e9c-c693-43a9-8baf-d0948793843f\01-original-metadata.json

```

---

## Assistant (Build · Muse Spark 1.2 Free · 5.5s)

**Tool: read**

**Input:**
```json
{
  "filePath": "E:\\vedaAi\\artifacts\\39ac494f-ecec-4ccc-91ca-c9e9995a644b\\01-original-metadata.json"
}
```

**Output:**
```
<path>E:\vedaAi\artifacts\39ac494f-ecec-4ccc-91ca-c9e9995a644b\01-original-metadata.json</path>
<type>file</type>
<content>
1: {
2:   "jobId": "39ac494f-ecec-4ccc-91ca-c9e9995a644b",
3:   "qpSize": 511677,
4:   "asSize": 13462821,
5:   "job": {
6:     "id": "39ac494f-ecec-4ccc-91ca-c9e9995a644b",
7:     "createdAt": "2026-08-28T18:33:01.313Z",
8:     "updatedAt": "2026-08-28T18:35:05.639Z",
9:     "status": "COMPLETED",
10:     "currentStage": "COMPLETED",
11:     "progress": {
12:       "stageStates": {
13:         "VALIDATING": "completed",
14:         "PREPROCESSING": "completed",
15:         "OCR_SUBMITTED": "completed",
16:         "OCR_PROCESSING": "completed",
17:         "OCR_COMPLETED": "completed",
18:         "VISION": "completed",
19:         "FUSION": "completed",
20:         "EXTRACTING": "completed",
21:         "STRUCTURING": "completed",
22:         "MATCHING": "completed",
23:         "LOCALIZING": "completed",
24:         "VALIDATING_RESULT": "completed",
25:         "COMPLETED": "completed"
26:       }
27:     },
28:     "pipelineVersion": "0.2.0",
29:     "questionPaperFileId": "e9d006b0-e076-4f64-a332-5214bf3379f7",
30:     "answerSheetFileId": "0ef16e7c-7899-4834-835a-16bf7532a0fc",
31:     "questionPaperDocId": "b0e83098-c777-447a-b854-5b6b68406038",
32:     "answerSheetDocId": "cfca38f4-7b83-4386-9389-3b0b014b2a06",
33:     "ocrOperationId": "10e160e804d5184654eafe4741a57c3bb3560aa03de4e9ed9b3cf0c770f74636",
34:     "ocrOutputUri": "s3://vedaaistorage/textract-output/39ac494f-ecec-4ccc-91ca-c9e9995a644b/answerSheet/",
35:     "ocrInputUri": "s3://vedaaistorage/ocr-input/39ac494f-ecec-4ccc-91ca-c9e9995a644b/answerSheet.pdf",
36:     "ocrStartedAt": "2026-08-28T18:33:31.213Z",
37:     "ocrAttempt": 2,
38:     "ocrPageCount": 39,
39:     "ocrCompletedAt": "2026-08-28T18:33:51.976Z"
40:   }
41: }

(End of file - total 41 lines)
</content>
```

**Tool: bash**

**Input:**
```json
{
  "command": "Get-Content -LiteralPath \"E:\\vedaAi\\artifacts\\39ac494f-ecec-4ccc-91ca-c9e9995a644b\\02-textract-raw.json\" | Select-Object -First 5; Write-Output \"---check tmp pdf storage---\"; Get-ChildItem -LiteralPath \"C:\\Users\\Dell\\AppData\\Local\\Temp\\veda-ai\" -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.PSIsContainer -eq $false } | Select-Object FullName, Length | ForEach-Object { \"$($_.FullName) $($_.Length)\" } | Select-Object -First 30"
}
```

**Output:**
```
{
  "jobId": "39ac494f-ecec-4ccc-91ca-c9e9995a644b",
  "documentId": "b0e83098-c777-447a-b854-5b6b68406038",
  "kind": "questionPaper",
  "pages": [
---check tmp pdf storage---
C:\Users\Dell\AppData\Local\Temp\veda-ai\052f36e9-9f28-4147-99c3-acb1145ac49a\09dec42f-0d88-4b08-8f72-7505d7e704f3 511677
C:\Users\Dell\AppData\Local\Temp\veda-ai\052f36e9-9f28-4147-99c3-acb1145ac49a\09dec42f-0d88-4b08-8f72-7505d7e704f3.meta.json 63
C:\Users\Dell\AppData\Local\Temp\veda-ai\052f36e9-9f28-4147-99c3-acb1145ac49a\614d4898-e49e-4097-acc6-6d7f8b34c15d 13462821
C:\Users\Dell\AppData\Local\Temp\veda-ai\052f36e9-9f28-4147-99c3-acb1145ac49a\614d4898-e49e-4097-acc6-6d7f8b34c15d.meta.json 58
C:\Users\Dell\AppData\Local\Temp\veda-ai\052f36e9-9f28-4147-99c3-acb1145ac49a\6a0c1139-10f2-458b-addb-6ce71236b34e 511677
C:\Users\Dell\AppData\Local\Temp\veda-ai\052f36e9-9f28-4147-99c3-acb1145ac49a\6a0c1139-10f2-458b-addb-6ce71236b34e.meta.json 63
C:\Users\Dell\AppData\Local\Temp\veda-ai\0aceac8c-1fef-4376-a524-523b24aac971\b1bc152d-c72d-4b37-aa4b-50f927326e62 784259
C:\Users\Dell\AppData\Local\Temp\veda-ai\0aceac8c-1fef-4376-a524-523b24aac971\b1bc152d-c72d-4b37-aa4b-50f927326e62.meta.json 55
C:\Users\Dell\AppData\Local\Temp\veda-ai\0aceac8c-1fef-4376-a524-523b24aac971\d2e3c736-ea03-4c69-9d8a-1be3af7beb71 13462821
C:\Users\Dell\AppData\Local\Temp\veda-ai\0aceac8c-1fef-4376-a524-523b24aac971\d2e3c736-ea03-4c69-9d8a-1be3af7beb71.meta.json 58
C:\Users\Dell\AppData\Local\Temp\veda-ai\0de77189-ffce-40e8-9112-2b35bc7ac5e5\03920d02-8a2a-4731-bc05-106bb2bd0424 68
C:\Users\Dell\AppData\Local\Temp\veda-ai\0de77189-ffce-40e8-9112-2b35bc7ac5e5\03920d02-8a2a-4731-bc05-106bb2bd0424.meta.json 43
C:\Users\Dell\AppData\Local\Temp\veda-ai\0de77189-ffce-40e8-9112-2b35bc7ac5e5\e87c41bb-45fa-4254-bc85-0c097d7b64ac 68
C:\Users\Dell\AppData\Local\Temp\veda-ai\0de77189-ffce-40e8-9112-2b35bc7ac5e5\e87c41bb-45fa-4254-bc85-0c097d7b64ac.meta.json 43
C:\Users\Dell\AppData\Local\Temp\veda-ai\0e1188fc-75d3-48ec-87a4-e6bc69e893b7\9891a254-61d7-47b2-b53d-9400409dd84d 1042
C:\Users\Dell\AppData\Local\Temp\veda-ai\0e1188fc-75d3-48ec-87a4-e6bc69e893b7\9891a254-61d7-47b2-b53d-9400409dd84d.meta.json 62
C:\Users\Dell\AppData\Local\Temp\veda-ai\0e1188fc-75d3-48ec-87a4-e6bc69e893b7\e4c70532-b03c-4862-af8d-b267c0256fde 1159
C:\Users\Dell\AppData\Local\Temp\veda-ai\0e1188fc-75d3-48ec-87a4-e6bc69e893b7\e4c70532-b03c-4862-af8d-b267c0256fde.meta.json 64
C:\Users\Dell\AppData\Local\Temp\veda-ai\1089d5f2-86fb-4a3a-8546-b24e8029f9e9\2e75f66c-52b3-4c0a-b4fd-e25aa391f8d9 467
C:\Users\Dell\AppData\Local\Temp\veda-ai\1089d5f2-86fb-4a3a-8546-b24e8029f9e9\2e75f66c-52b3-4c0a-b4fd-e25aa391f8d9.meta.json 51
C:\Users\Dell\AppData\Local\Temp\veda-ai\1089d5f2-86fb-4a3a-8546-b24e8029f9e9\9ea0e66a-33cb-418c-b7fe-26ad5cb94967 68
C:\Users\Dell\AppData\Local\Temp\veda-ai\1089d5f2-86fb-4a3a-8546-b24e8029f9e9\9ea0e66a-33cb-418c-b7fe-26ad5cb94967.meta.json 48
C:\Users\Dell\AppData\Local\Temp\veda-ai\1153ec56-5258-4236-bd0c-817390070c4d\74a4d4e6-53e1-46f3-b16a-9f3433e58ed8 511677
C:\Users\Dell\AppData\Local\Temp\veda-ai\1153ec56-5258-4236-bd0c-817390070c4d\74a4d4e6-53e1-46f3-b16a-9f3433e58ed8.meta.json 63
C:\Users\Dell\AppData\Local\Temp\veda-ai\12cc2ceb-655d-4902-b4d0-f3675d0409f6\10d9f232-f667-4d72-a7b3-5a40f05bd92d 111206
C:\Users\Dell\AppData\Local\Temp\veda-ai\12cc2ceb-655d-4902-b4d0-f3675d0409f6\10d9f232-f667-4d72-a7b3-5a40f05bd92d.meta.json 72
C:\Users\Dell\AppData\Local\Temp\veda-ai\12cc2ceb-655d-4902-b4d0-f3675d0409f6\f3c3ec6c-e98b-4a51-a3c5-c92b865d0082 72337
C:\Users\Dell\AppData\Local\Temp\veda-ai\12cc2ceb-655d-4902-b4d0-f3675d0409f6\f3c3ec6c-e98b-4a51-a3c5-c92b865d0082.meta.json 49
C:\Users\Dell\AppData\Local\Temp\veda-ai\16575003-683a-4ab0-a17a-cda2ec66ab64\108bb7a2-230b-4970-929d-3a09648493c2 1275
C:\Users\Dell\AppData\Local\Temp\veda-ai\16575003-683a-4ab0-a17a-cda2ec66ab64\108bb7a2-230b-4970-929d-3a09648493c2.meta.json 63

```

---

## Assistant (Build · Muse Spark 1.2 Free · 4.5s)

**Tool: bash**

**Input:**
```json
{
  "command": "Get-ChildItem -LiteralPath \"C:\\Users\\Dell\\AppData\\Local\\Temp\\veda-ai\\39ac494f-ecec-4ccc-91ca-c9e9995a644b\" -ErrorAction SilentlyContinue | Select-Object Name, Length | Format-Table -AutoSize | Select-Object -First 30; Write-Output \"---check tmp per job file existence via storage---\"; python -c \"\nimport os, json, glob\ntmp = r'C:\\Users\\Dell\\AppData\\Local\\Temp\\veda-ai'\ndirs = [d for d in os.listdir(tmp) if os.path.isdir(os.path.join(tmp, d))]\nfor d in dirs[:5]:\n    full = os.path.join(tmp, d)\n    files = os.listdir(full)\n    print(d, files[:4])\n\" 2>&1 | Select-Object -First 20"
}
```

**Output:**
```

[32;1mName                                          [0m[32;1m Length[0m
[32;1m----                                          [0m [32;1m------[0m
debug                                          
0ef16e7c-7899-4834-835a-16bf7532a0fc           13462821
0ef16e7c-7899-4834-835a-16bf7532a0fc.meta.json 59
e9d006b0-e076-4f64-a332-5214bf3379f7           511677
e9d006b0-e076-4f64-a332-5214bf3379f7.meta.json 59

---check tmp per job file existence via storage---
052f36e9-9f28-4147-99c3-acb1145ac49a ['09dec42f-0d88-4b08-8f72-7505d7e704f3', '09dec42f-0d88-4b08-8f72-7505d7e704f3.meta.json', '614d4898-e49e-4097-acc6-6d7f8b34c15d', '614d4898-e49e-4097-acc6-6d7f8b34c15d.meta.json']
0aceac8c-1fef-4376-a524-523b24aac971 ['b1bc152d-c72d-4b37-aa4b-50f927326e62', 'b1bc152d-c72d-4b37-aa4b-50f927326e62.meta.json', 'd2e3c736-ea03-4c69-9d8a-1be3af7beb71', 'd2e3c736-ea03-4c69-9d8a-1be3af7beb71.meta.json']
0de77189-ffce-40e8-9112-2b35bc7ac5e5 ['03920d02-8a2a-4731-bc05-106bb2bd0424', '03920d02-8a2a-4731-bc05-106bb2bd0424.meta.json', 'e87c41bb-45fa-4254-bc85-0c097d7b64ac', 'e87c41bb-45fa-4254-bc85-0c097d7b64ac.meta.json']
0e1188fc-75d3-48ec-87a4-e6bc69e893b7 ['9891a254-61d7-47b2-b53d-9400409dd84d', '9891a254-61d7-47b2-b53d-9400409dd84d.meta.json', 'e4c70532-b03c-4862-af8d-b267c0256fde', 'e4c70532-b03c-4862-af8d-b267c0256fde.meta.json']
1089d5f2-86fb-4a3a-8546-b24e8029f9e9 ['2e75f66c-52b3-4c0a-b4fd-e25aa391f8d9', '2e75f66c-52b3-4c0a-b4fd-e25aa391f8d9.meta.json', '9ea0e66a-33cb-418c-b7fe-26ad5cb94967', '9ea0e66a-33cb-418c-b7fe-26ad5cb94967.meta.json']

```

---

## Assistant (Build · Muse Spark 1.2 Free · 5.5s)

_Thinking:_



**Tool: bash**

**Input:**
```json
{
  "command": "python -c \"\nimport fitz  # pymupdf? check\ntry:\n    import fitz\n    print('fitz ok', fitz.__doc__[:50] if fitz.__doc__ else 'no doc')\nexcept Exception as e:\n    print('fitz fail', e)\ntry:\n    import mupdf\n    print('mupdf imported')\nexcept Exception as e:\n    print('mupdf fail', e)\ntry:\n    from paddleocr import PaddleOCR\n    print('PaddleOCR import ok')\n    import inspect\n    print(inspect.signature(PaddleOCR.__init__))\nexcept Exception as e:\n    print('paddleocr import fail', e)\n    import traceback; traceback.print_exc()\n\" 2>&1 | Select-Object -First 40"
}
```

**Output:**
```
[31;1mTraceback (most recent call last):[0m
[31;1m  File "<string>", line 2, in <module>[0m
[31;1mModuleNotFoundError: No module named 'fitz'[0m

```

---

## Assistant (Build · Muse Spark 1.2 Free · 12.5s)

**Tool: bash**

**Input:**
```json
{
  "command": "python -c \"\nfrom paddleocr import PaddleOCR\nimport inspect\nprint(inspect.signature(PaddleOCR.__init__))\n\" 2>&1 | Select-Object -First 30"
}
```

**Output:**
```
[31;1mC:\Python311\Lib\site-packages\requests\__init__.py:113: RequestsDependencyWarning: urllib3 (2.5.0) or chardet (7.6.0)/charset_normalizer (3.4.4) doesn't match a supported version![0m
[31;1m  warnings.warn([0m
(self, doc_orientation_classify_model_name=None, doc_orientation_classify_model_dir=None, doc_unwarping_model_name=None, doc_unwarping_model_dir=None, text_detection_model_name=None, text_detection_model_dir=None, textline_orientation_model_name=None, textline_orientation_model_dir=None, textline_orientation_batch_size=None, text_recognition_model_name=None, text_recognition_model_dir=None, text_recognition_batch_size=None, use_doc_orientation_classify=None, use_doc_unwarping=None, use_textline_orientation=None, text_det_limit_side_len=None, text_det_limit_type=None, text_det_thresh=None, text_det_box_thresh=None, text_det_unclip_ratio=None, text_det_input_shape=None, text_rec_score_thresh=None, return_word_box=None, text_rec_input_shape=None, lang=None, ocr_version=None, **kwargs)

```

---

## Assistant (Build · Muse Spark 1.2 Free · 67.7s)

**Tool: bash**

**Input:**
```json
{
  "command": "python -c \"\nimport time\nstart = time.time()\nfrom paddleocr import PaddleOCR\nimport os, sys\n# Test minimal instantiation\nprint('creating PaddleOCR instance with minimal config...')\ntry:\n    ocr = PaddleOCR(lang='en', use_textline_orientation=False, use_doc_orientation_classify=False, use_doc_unwarping=False, text_det_thresh=0.3)\n    print('PaddleOCR created in', time.time()-start)\n    print('ocr object', type(ocr))\n    # Check available methods\n    print(dir(ocr))\nexcept Exception as e:\n    import traceback\n    traceback.print_exc()\n\" 2>&1 | Select-Object -First 80"
}
```

**Output:**
```
[31;1mC:\Python311\Lib\site-packages\requests\__init__.py:113: RequestsDependencyWarning: urllib3 (2.5.0) or chardet (7.6.0)/charset_normalizer (3.4.4) doesn't match a supported version![0m
[31;1m  warnings.warn([0m
[31;1mINFO: Could not find files for the given pattern(s).[0m
[31;1mC:\Python311\Lib\site-packages\paddle\utils\cpp_extension\extension_utils.py:712: UserWarning: No ccache found. Please be aware that recompiling all source files may be required. You can download and install ccache from: https://github.com/ccache/ccache/blob/master/doc/INSTALL.md[0m
[31;1m  warnings.warn(warning_message)[0m
[31;1m[32mCreating model: ('PP-OCRv6_medium_det', None, None)[0m[0m
[31;1m[33mChecking connectivity to the model hosters, this may take a while. To bypass this check, set `PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK` to `True`.[0m[0m
[31;1m[32mUsing official model (PP-OCRv6_medium_det), the model files will be automatically downloaded and saved in `C:\Users\Dell\.paddlex\official_models\PP-OCRv6_medium_det`.[0m[0m
creating PaddleOCR instance with minimal config...
[31;1m[0m
[31;1mFetching 5 files:   0%|          | 0/5 [00:00<?, ?it/s][0m
[31;1mFetching 5 files:  20%|##        | 1/5 [00:00<00:01,  3.46it/s][0m
[31;1mFetching 5 files:  80%|########  | 4/5 [00:00<00:00, 11.02it/s][0m
[31;1mFetching 5 files: 100%|##########| 5/5 [00:14<00:00,  2.91s/it][0m
[31;1mWARNING: Logging before InitGoogleLogging() is written to STDERR[0m
[31;1mI0829 14:18:10.574736 11976 onednn_context.cc:81] oneDNN v3.6.2[0m
[31;1m[32mCreating model: ('PP-OCRv6_medium_rec', None, None)[0m[0m
[31;1m[32mUsing official model (PP-OCRv6_medium_rec), the model files will be automatically downloaded and saved in `C:\Users\Dell\.paddlex\official_models\PP-OCRv6_medium_rec`.[0m[0m
[31;1m[0m
[31;1mFetching 5 files:   0%|          | 0/5 [00:00<?, ?it/s][0m
[31;1mFetching 5 files:  20%|##        | 1/5 [00:00<00:01,  3.21it/s][0m
[31;1mFetching 5 files: 100%|##########| 5/5 [00:23<00:00,  4.89s/it][0m
[31;1mFetching 5 files: 100%|##########| 5/5 [00:23<00:00,  4.61s/it][0m
PaddleOCR created in 59.926692724227905
ocr object <class 'paddleocr._pipelines.ocr.PaddleOCR'>
['__abstractmethods__', '__class__', '__delattr__', '__dict__', '__dir__', '__doc__', '__eq__', '__format__', '__ge__', '__getattribute__', '__getstate__', '__gt__', '__hash__', '__init__', '__init_subclass__', '__le__', '__lt__', '__module__', '__ne__', '__new__', '__reduce__', '__reduce_ex__', '__repr__', '__setattr__', '__sizeof__', '__str__', '__subclasshook__', '__weakref__', '_abc_impl', '_common_args', '_create_paddlex_pipeline', '_get_merged_paddlex_config', '_get_ocr_model_names', '_get_paddlex_config_overrides', '_merged_paddlex_config', '_paddlex_config', '_paddlex_pipeline_name', '_params', 'close', 'export_paddlex_config_to_yaml', 'get_cli_subcommand_executor', 'ocr', 'paddlex_pipeline', 'predict', 'predict_iter']

```

---

## Assistant (Build · Muse Spark 1.2 Free · 5.8s)

_Thinking:_



---

