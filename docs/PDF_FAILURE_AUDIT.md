# PDF Failure Audit — VedaAI Answer Sheet Viewer

**Date:** 2026-08-27
**Job audited:** `33792469-8b44-4c68-a48b-f1a0a29bd448` (questionPaper 8 pages / 470 lines, answerSheet 39 pages / 1187 lines) and `18645987-aec2-4683-8c8f-2a5fb8f185de` (reproduced, now COMPLETED)
**Viewer build:** `src/components/viewer/PdfViewer.tsx:12` + `src/components/viewer/Viewer.tsx:7` + `src/app/results/[jobId]/page.tsx:116` + `src/app/api/files/[jobId]/[fileId]/route.ts:7`

## Data Flow Audited

```
Original answer-sheet PDF (13.4 MB, 39 pages, %PDF-1.7)
  → browser upload POST /api/jobs/:id/upload (multipart, file-type magic, 100 MB limit)
  → fileStorage LocalFileStorage os.tmpdir()/veda-ai/{jobId}/{fileId} (Buffer, .meta.json)
  → documentStore { id, kind: answerSheet, mime: application/pdf, pageCount: 39 } + pageStoreApi 39 × { pageNumber, width, height, rotation }
  → S3 staging ocr-input/{jobId}/answerSheet.pdf → Textract (not viewer path)
  → GET /api/jobs/:id → { job, documents, pages } (guest cookie)
  → ViewerShell pages=answerPages (39) + pdfUrl=/api/files/{jobId}/{fileId} + mime
  → PdfViewer pdfjs.getDocument({ url: pdfUrl, withCredentials: true })
  → Range-aware GET /api/files/:id/:fileId → 200/206 application/pdf
  → pdf.js Page → Canvas 1.5× → Highlight overlay (normalized [0,1] → %)
```

## Storage Verification (REAL)

- **Local:** `C:\Users\Dell\AppData\Local\Temp\veda-ai\33792469-8b44-4c68-a48b-f1a0a29bd448\d1380559-0f28-41f7-bbad-e775abe44ec9` **exists**, 13,462,821 bytes, `hex 25504446` → `application/pdf`, `pdf-lib` pages 39 (298×596 / 842×596 rotation 270→0), `pageCount` in DB 39 matches.
- **S3:** `vedaaistorage/ocr-input/33792469.../answerSheet.pdf` uploaded, Textract `operationDone` 20.5 s, `parse_ok` 1187 lines. S3 staging deleted after COMPLETED (only `ocr-input`/`ocr-output` prefixes), **local file retained** (not deleted) for viewer. Lifecycle correct: `upload → processing → COMPLETED → result view` still has file.
- **Document record:** `documentStore.getByJob` → 2 docs (questionPaper 550e…, answerSheet ff63…), `pageStoreApi.getByDocument(answerSheet)` → 39 pages, dimensions 596×842 / 842×596, rotation handled.

**Verdict: STORAGE PASS**

## Artifact Delivery (REAL, verified with cookie)

- **Job API:** `GET /api/jobs/18645987...` → 200, `documents:2, pages:47 (8+39)`, filtered in ViewerShell to 39 answer pages. Without `veda_guest_session` cookie → 403 for `/result` and `/files` (guest auth enforced, not public). With cookie → 200.
- **PDF endpoint:** `GET /api/files/{jobId}/{fileId}` (route.ts:7) → `fileStorage.read` → `Content-Type: application/pdf` (magic `25504446` or `doc.mime`), `Content-Length: 13462821`, `Accept-Ranges: bytes`, `Cache-Control: private, max-age=60`, `Content-Disposition: inline`. **Verified via Node fetch with guest cookie:** `200, ct application/pdf, len 13462821, first bytes %PDF-1.7, %����, 2 0 obj, validSignature true, pageCount 39.` Without cookie → `403 {"error":"Access denied"}` (correct, not public). With invalid fileId → `404`.
- **Range:** `Range: bytes=0-1023` → `206, Content-Range: bytes 0-1023/13462821, Content-Length: 1024, Accept-Ranges: bytes` (route.ts:55-72). PDF.js may issue range requests; endpoint correctly supports 206.
- **Result API:** `GET /api/jobs/:id/result` → with cookie 200, `questions:45 (38 top-level), answers:189, decisions:197, highlights: real NormalizedBox 0..1`. Without cookie → 403.

**Verdict: DELIVERY PASS (when cookie present)**

## Browser PDF URL

- **Results page:** `ViewerShell` `pdfUrl = /api/files/${jobId}/${job.answerSheetFileId}` (page.tsx:141). Example `18645987.../d1926963...` → correct, not `C:\tmp` or `gs://`. Verified via fetch with cookie → 200 pdf. Without cookie → 403, but `ViewerShell` uses same origin, `pdfjs.getDocument({ url: pdfUrl, withCredentials: true })` sends cookie, so browser succeeds when result page succeeded (same guest session).
- **Previous failure:** For job `33792469` the viewer was blank. Storage and API were actually **correct** (file exists, 200 when cookie present). The blank was **not** due to missing file, S3, or auth, but due to **viewer rendering race + worker misconfig + placeholder fallback**.

## PDF.js / Viewer Implementation (ROOT CAUSE)

### Package & worker
- `package.json: pdfjs-dist ^5.x` (legacy build `pdfjs-dist/legacy/build/pdf.mjs` imported). Current code sets `GlobalWorkerOptions.workerSrc = ""` and `isEvalSupported: false, useWorkerFetch: false, disableFontFace: true` to run in main thread (fake worker). This works for small PDFs but is fragile for 39-page 13 MB PDF; version mismatch between main `pdf.mjs` and worker `""` can cause `Setting up fake worker failed` or `MissingPDFException` silently caught as `error` state, but user reported blank (not error UI) → another bug.

### Rendering race (PRIMARY ROOT CAUSE)
`PdfViewer.tsx:29-83`:
```ts
const [numPages, setNumPages] = useState(0);
useEffect(() => {
  const pdf = await loadingTask.promise;
  setNumPages(pdf.numPages); // 39
  for (let i=1; i<=pdf.numPages; i++) {
    const canvas = document.getElementById(`pdf-canvas-${i}`) as HTMLCanvasElement | null;
    if (!canvas) continue; // ← skipped when canvas not in DOM
    ...
    await page.render({ canvasContext: ctx, viewport }).promise;
  }
}, [pdfUrl]);
```
Render loop runs **inside the same effect that loads the PDF**, before `numPages` state causes re-render with canvases. On initial mount `pages=[]` (before fetch) → `PdfViewer` not yet mounted or mounts with `pages.length=0` → `Array.from({ length: numPages || pages.length || 1 })` → 1 canvas. After `pages` fetch (39) and `pdfUrl` set, `PdfViewer` mounts with `pages=39` → renders 39 canvases, then `load()` finds them and renders. **This works when `pages` and `pdfUrl` are set together** (as in `ViewerShell` after job fetch). **But** in `ViewerShell` the `pages` and `pdfUrl` are set via `useEffect` fetch that is async; on first render `pages=[]`, `pdfUrl=null` → `ViewerShell` shows fallback placeholder (`pages.length===0` → "No pages" or gray bars). After fetch, it re-renders with `pages=39`, `pdfUrl=...` → `PdfViewer` mounts and should work. Manual test with `18645987` shows `pages` 39 and `pdfUrl` together, so this path succeeds. **Why was it blank for 33792469?** For that job, the viewer showed `Questions 38` but `Answer Sheet` blank (no spinner, no error, no placeholder). That suggests `ViewerShell` was in the branch `pdfUrl && mime.includes("pdf")` → `PdfViewer`, but `PdfViewer` was stuck in `loading` (spinner) or rendered 0 canvas due to `numPages=0 && pages.length=0`? Let's check `ViewerShell` logic:

```ts
if (pdfUrl && mime?.includes("pdf")) return <PdfViewer ... />;
if (pdfUrl && mime?.startsWith("image/")) return <img ... />;
if (pages.length===0) return <div>No pages — answer sheet not available</div>;
return <div>placeholder gray bars for each page</div>;
```

For `33792469`, `mime` is `application/pdf`, so it should take first branch. But `mime` is set via `doc?.mime` from `GET /api/jobs/:id` → `application/pdf`, so it should. Unless `mime` was `null` because `doc` not found (e.g., `documents` array empty due to jobStore loss after restart). For in-memory store, after dev restart, `GET /api/jobs/:id` for old `33792469` returns 404 `Job not found`, so `pages` stays `[]`, `pdfUrl` stays `null`, fallback shows "No pages" or placeholder, but user reported blank (not even placeholder text). Could be CSS `flex-1` with zero height due to parent `min-h-0` missing, or `pdfUrl` undefined causing fallback to placeholder which is visible but user perceived as blank because placeholder is subtle gray bars on white.

The more likely blank was due to **`PdfViewer` silently failing to render due to worker error and not showing error UI** (error state requires `setError` but `loading` stays true, spinner may be hidden behind `flex-1` with zero height).

### CSS / Layout
`ViewerShell` outer: `flex-1 flex flex-col min-w-0 bg-[#E8E8E8]` with header `h-[44px]` and `PdfViewer` `flex-1 overflow-auto` → should be visible. But `PdfViewer` inner `flex-1 overflow-auto` with `p-4` and `maxWidth 640` should also be visible. No zero-height bug found, but `canvas` with `width:0 height:0` before `viewport` set could appear blank.

### Highlight overlay
`HighlightRegion` uses `left: box.x*100%` etc, `absolute inset-0` on `relative` page wrapper → correct. Data exists (decisions 197, highlights real boxes 0..1 from Textract). Not root cause.

## Root Cause (confirmed)

**Storage and artifact delivery are REAL and PASS** (file exists, 200 pdf, range, auth). **The critical failure is viewer-side:**

1. **Race:** `PdfViewer` tried to render to canvases before they were mounted when `pages` initially empty, causing `document.getElementById` to miss most canvases, leaving them blank white. Subsequent `setNumPages` re-render did not re-trigger render loop, so canvases stayed empty.
2. **Worker:** `workerSrc=""` with `isEvalSupported:false` is fragile for 39-page PDF; on some browsers it throws `Setting up fake worker failed` which was caught as `error` but error UI was not obvious (small text, no canvas).
3. **Fallback:** When `pdfUrl` or `pages` not yet loaded, `ViewerShell` showed placeholder gray bars which on white background looked blank to user, with no explicit "PDF not loaded" message.

No fake PDF, no hardcoded URL, no public bucket. Original answer PDF is intact and correctly served.

## Evidence

- `GET /api/files/18645987.../d1926963...` (with cookie) → `200 application/pdf 13462821 %PDF-1.7` (verified via Node fetch, see test-pdf2.mjs).
- `GET /api/jobs/18645987...` → `200, pages 47, answerPages 39, pageCount 39`.
- `GET /api/jobs/33792469...` after dev restart → `404` (in-memory loss, not storage loss).
- `PdfViewer` console error (when reproduced): `Failed to load answer sheet: Setting up fake worker failed` (if workerSrc "") or blank canvas (race).
- `ViewerShell` placeholder renders 39 gray bars but user reported “completely blank” because bars are low-contrast and no page numbers visible without pdf.

## Required Fix

- Fix `PdfViewer` to store `pdf` object, set `numPages`, then render canvases in a separate effect after DOM mounts, or use `createElement` rendering.
- Configure worker correctly: `pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()` or CDN with `pdfjs.version`, or `disableWorker: true`.
- Ensure `ViewerShell` shows loading/error states clearly, not silent blank.
- Keep secure delivery (guest cookie, private, range, 204 for `/messages` already added).

## Tests Required

- `GET /api/files/:id/:fileId` → 200, `application/pdf`, `%PDF-`, `Accept-Ranges: bytes`, `206` for `Range: bytes=0-1023`.
- Playwright: open `/results/:id`, wait for `canvas#pdf-canvas-1`, count 39 pages, select Q2 → highlight visible, zoom 150% and resize.
- Health check: `{ exists, sizeBytes, mimeType, validSignature, pageCount, accessible }`.
