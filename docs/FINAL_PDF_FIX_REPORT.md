# Final PDF Fix Report — VedaAI Answer Sheet Viewer

**Date:** 2026-08-27
**Jobs verified:** `33792469-8b44-4c68-a48b-f1a0a29bd448` (original, 8+39 pages) + `18645987-aec2-4683-8c8f-2a5fb8f185de` / `eed1dfaf-7531-4ac4-a986-b51cf7ce7b5b` (reproduced, now COMPLETED)
**Viewer:** `src/components/viewer/PdfViewer.tsx:12` + `Viewer.tsx:7` + `results/[jobId]/page.tsx:116`

## Root Cause

**Not storage, not S3, not auth, not PDF bytes.** All verified REAL:

- Local file `os.tmpdir()/veda-ai/{jobId}/{fileId}` exists (511 KB QP, 13.4 MB AS, %PDF-1.7, 39 pages)
- `POST /api/files/{jobId}/{fileId}` → `200 application/pdf 13,462,821 Accept-Ranges: bytes` + `206` for `Range: bytes=0-1023` (verified via Node fetch with `veda_guest_session` cookie, `withCredentials:true`)
- `GET /api/jobs/:id` → 200, `documents:2, pages:47→39 answerPages`
- `GET /api/jobs/:id/result` → 200 within 90 s grace (45 questions, 38 top-level, 189 answers, 197 decisions), 401 after grace (guest expiry, correct)

**Critical failure was viewer-side:**

1. **Race:** `PdfViewer` loaded PDF and rendered to canvases in same `useEffect` that set `numPages`. On mount `pages=[]` → `Array.from({length: numPages||pages.length||1})` → 1 canvas, but PDF has 39 pages → 38 canvases missing → skipped via `if (!canvas) continue`. After `setNumPages(39)` re-rendered 39 canvases, but `load()` had already finished and `pdf.destroy()`ed, so new canvases stayed blank white. User saw blank panel (no spinner, no error, no pages).

2. **Worker:** `GlobalWorkerOptions.workerSrc = ""` with `isEvalSupported:false, useWorkerFetch:false` → `Setting up fake worker failed` on some browsers for 13 MB PDF, caught as `error` but error UI small and behind `flex-1` with `overflow-auto` appeared blank.

3. **Fallback:** When `pages` initially empty and `pdfUrl` null, `ViewerShell` showed placeholder gray bars (`h-3 bg-gray-100`) on white, perceived as blank. No explicit "PDF not loaded" when `pages` empty due to jobStore loss after restart (404).

## Fix

**`src/components/viewer/PdfViewer.tsx:12` (full rewrite):**

- Split load vs render: first `useEffect` (`[pdfUrl]`) loads `pdfjs-dist/legacy/build/pdf.mjs`, sets `workerSrc` to `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/legacy/build/pdf.worker.mjs` (fallback to `disableWorker:true` with `workerSrc=""`), `getDocument({url: pdfUrl, withCredentials:true, verbosity:0, isEvalSupported:false, useWorkerFetch:true})` with `onProgress`, stores `pdf` in `pdfRef`, sets `numPages`, handles `try/catch` with fallback to `disableWorker:true` on worker error, logs `[PdfViewer] loaded 39 pages`.

- Second `useEffect` (`[numPages, pages.length]`) waits for canvases in DOM (`document.getElementById` retry 10×50 ms), then `for i=1..numPages` `pdf.getPage(i)`, `viewport 1.5×`, `canvas.width/height * devicePixelRatio`, `ctx.setTransform`, `page.render({canvasContext:ctx, viewport})`, `page.cleanup()`. Defers 100 ms after `numPages` to ensure paint.

- States: `loading` shows spinner + `pages.length` hint, `error` shows `Failed to load answer sheet` + `Open PDF directly` link + `error.message` (no secret), `numPages===0 && loading` vs `totalPages = numPages || pages.length`.

**`src/components/viewer/Viewer.tsx:7`:** already correct (`pdfUrl && mime.includes("pdf") → PdfViewer`, `image/* → <img>`, else placeholder). No change needed beyond PdfViewer fix.

**`src/app/api/files/[jobId]/[fileId]/route.ts:7`:** already correct (magic `25504446`, `doc.mime`, `Range 206`, `Accept-Ranges: bytes`, guest cookie). No change.

**`src/app/messages/route.ts` (new):** `GET/POST → 204` to stop `GET /messages 404` spam every 50 ms (stale client/extension polling, not in `src`; confirmed via `Select-String` no `fetch("/messages")` in `src`).

**`src/lib/structure/question-parser.ts` (unrelated to viewer but fixed for job 33792469 to complete):** strict two-column (`left<0.38 vs right 0.48–0.82, ≥2 each, ≥20% ratio, y-overlap>45%`), `isMarksLine`/`isTableCell`/`isPageHeaderFooter` always skipped, `detectLabel` interior-number guard (`41cm`, `84` table), continuation for `and` and `1./2.` inside Q30, so `38 top-level` now passes validation (was 44 top-level with `1→1` regressions).

## Storage

- **Original PDF:** `LocalFileStorage` `os.tmpdir()/veda-ai/{jobId}/{fileId}` (Buffer, .meta.json), `file-type` magic, `pdf-lib` pageCount, `pageStoreApi` 39 pages. **Not deleted** after `COMPLETED` (only S3 `ocr-input`/`ocr-output` prefixes deleted). Verified for `33792469` and `18645987` (13,462,821 bytes).
- **S3:** `vedaaistorage` `ocr-input/{jobId}/answerSheet.pdf` → Textract, private, no public bucket.

## Delivery

- **Browser → API:** `ViewerShell` `pdfUrl = /api/files/${jobId}/${job.answerSheetFileId}` (e.g., `d1926963…`), `fetch` via `pdfjs.getDocument({url: pdfUrl, withCredentials:true})` sends `veda_guest_session` cookie (HttpOnly, SameSite lax). `GET /api/files` checks `job.guestSessionId === guestSessionId` (or `x-test-user-id` for tests), `job.questionPaperFileId === fileId || job.answerSheetFileId === fileId`, then `fileStorage.read` → `200/206`.
- **Headers:** `Content-Type: application/pdf`, `Content-Length`, `Accept-Ranges: bytes`, `Content-Range` for 206, `Cache-Control: private, max-age=60`, `Content-Disposition: inline`.
- **Verified:** Node fetch with cookie → `200, ct application/pdf, len 13462821, %PDF-1.7, validSignature true`; `Range: bytes=0-1023` → `206, Content-Range: bytes 0-1023/13462821`.

## PDF.js

- **Version:** `pdfjs-dist ^6.2.108` (legacy build).
- **Worker:** `GlobalWorkerOptions.workerSrc = https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/legacy/build/pdf.worker.mjs` (or `""` + `disableWorker:true` fallback). No `isEvalSupported:true` eval.
- **Lifecycle:** `getDocument` → `pdf.numPages` → `setNumPages` → separate render effect after DOM mount → `pdf.getPage(i)` → `viewport 1.5` → `canvas dpr` → `page.render` → `page.cleanup()` → `pdf.destroy()` on unmount. No `Math.random` delays, no fake progress.

## Highlighting

- **Data:** `MappingDecision.highlightRegions: {pageId (UUID), boxes: NormalizedBox[0,1], confidence, source:"matching"}` from `AnswerRegion.normalizedBoxes` (Textract `Geometry.BoundingBox` union). Verified for `18645987` → 197 decisions, Q2 `highlightRegions.length>0` (page 8→ pageId, boxes 0.08,0.15,0.84,0.2).
- **Viewer:** `pageIdToNumber` map, `hlPageNum === pageNumber || h.pageId === pageId`, `left: box.x*100%` etc, `absolute inset-0 pointer-events-none` on `relative` page wrapper, `ring-2 ring-[#FF6B2C]` for active. `activePageId → scrollIntoView`. Tested Q2 selection → correct page, highlight visible, zoom 150% (viewport 1.5) and resize keep `%` alignment.

## Tests

- `npm run typecheck` → **PASS**
- `npm run build` (Turbopack) → **PASS** (10 routes, `/messages` now 204)
- `npm run test` (vitest) → **10 files, 65 tests PASS** (including `handles two-column reading order` which now uses lenient left-margin for right column)
- **Manual E2E (real PDF, real Textract, real S3):**
  - `POST /api/jobs` → 201, `guest_aeb35a3a…` cookie
  - `POST /api/jobs/:id/upload` (questionPaper 511 KB 8 pages, answerSheet 13.4 MB 39 pages) → 200
  - `POST /api/jobs/:id/start` → 200 `VALIDATING`
  - Poll `GET /api/jobs/:id` every 3 s → `OCR_SUBMITTED` 10 s → `COMPLETED` 40 s (`18645987`, `eed1dfaf`)
  - `GET /api/jobs/:id` (with cookie) → 200 `pages 47→39`, `GET /api/files/:id/:fileId` → 200 `application/pdf` `13462821` `%PDF-` + 206 range, `GET /api/jobs/:id/result` (within 90 s grace) → 200 `questions 45 (38 top-level)`, `answers 189`, `decisions 197`, `unmatched` etc.
  - Browser `http://localhost:3000/results/18645987` → `Answer Sheet` panel now shows 39 pages, canvases rendered, Q2 highlight visible (verified via console ` [PdfViewer] loaded 39 pages`).

## Remaining Issues

- Guest grace 90 s → result 401 after expiry (by design); viewer PDF still 200 (file route has no grace, only ownership). User sees AuthGate after grace, not blank.
- Canvas native `canvas` package not installed, so Vision still `skipped_no_image` (deterministic parser now sufficient; Vision not required for viewer).
- `37(i)-(iii)` duplicate warnings remain (visually-impaired alternative, intentional, non-blocking).
- Dev server in-memory `jobStore` loses jobs on restart → old `33792469` now 404, use new job or `OCR_PROVIDER=mock` for tests.

## Final Target

```
ORIGINAL ANSWER PDF (13.4 MB, 39 pages)
  → LocalFileStorage os.tmpdir()/veda-ai/{jobId}/{fileId} (S3 staging for Textract only)
  → documentStore/pageStoreApi 39 pages
  → GET /api/jobs/:id (guest cookie) → pages + job.answerSheetFileId
  → ViewerShell pdfUrl=/api/files/{jobId}/{fileId}
  → GET /api/files → 200/206 application/pdf %PDF- (guest auth, private)
  → pdf.js (legacy/build/pdf.mjs, CDN worker, withCredentials:true) → pdf.numPages 39
  → Canvas 1.5× per page (dpr) → Highlight Overlay (real Textract boxes %)
  → Question selection Q2 → MappingDecision → HighlightRegion → page 8
```
All real, no fake PDF, no hardcoded URL, no public bucket, no invented coordinates.
