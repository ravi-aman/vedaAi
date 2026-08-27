"use client";
import React, { useEffect, useRef, useState } from "react";
import type { HighlightRegion, DocumentPage } from "@/types";

interface Props {
  pdfUrl: string;
  pages: DocumentPage[]; // for highlight mapping
  highlights: HighlightRegion[];
  activePageId?: string;
}

export function PdfViewer({ pdfUrl, pages, highlights, activePageId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pdfRef = useRef<any>(null);

  const pageIdToNumber = new Map(pages.map((p) => [p.id, p.pageNumber]));
  const activePageNumber = activePageId ? pageIdToNumber.get(activePageId) : undefined;

  useEffect(() => {
    if (activePageNumber && containerRef.current) {
      const el = document.getElementById(`pdf-page-${activePageNumber}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activePageNumber]);

  // Load PDF document (store, set numPages, don't render yet)
  useEffect(() => {
    let cancelled = false;
    let pdfDoc: any = null;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        setNumPages(0);
        pdfRef.current = null;

        const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
        // Configure worker: try real worker, fallback to disable
        try {
          // Use CDN worker matching pdfjs version to avoid bundling issues
          const version = pdfjs.version || "6.2.108";
          pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/legacy/build/pdf.worker.mjs`;
        } catch {
          pdfjs.GlobalWorkerOptions.workerSrc = "";
        }

        console.log(`[PdfViewer] loading ${pdfUrl}`);
        const loadingTask = pdfjs.getDocument({
          url: pdfUrl,
          withCredentials: true,
          verbosity: 0,
          isEvalSupported: false,
          useWorkerFetch: true,
          disableFontFace: true,
        });

        loadingTask.onProgress = (progress: any) => {
          // optional progress
        };

        pdfDoc = await loadingTask.promise;
        if (cancelled) {
          // PDFDocumentProxy in pdfjs-dist 6.x uses cleanup(), loadingTask uses destroy()
          try {
            if (pdfDoc && typeof pdfDoc.cleanup === "function") pdfDoc.cleanup();
            else if (pdfDoc && typeof pdfDoc.destroy === "function") await pdfDoc.destroy();
          } catch {}
          try {
            if (loadingTask && typeof loadingTask.destroy === "function") await loadingTask.destroy();
          } catch {}
          return;
        }
        pdfRef.current = pdfDoc;
        console.log(`[PdfViewer] loaded ${pdfDoc.numPages} pages`);
        setNumPages(pdfDoc.numPages);
        setLoading(false);
      } catch (e: any) {
        console.error("[PdfViewer] load failed", e);
        if (!cancelled) {
          // Try fallback without worker
          if (String(e.message).includes("worker") || String(e.message).includes("Worker")) {
            try {
              const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
              pdfjs.GlobalWorkerOptions.workerSrc = "";
              const loadingTask2 = pdfjs.getDocument({
                url: pdfUrl,
                withCredentials: true,
                verbosity: 0,
                isEvalSupported: false,
                useWorkerFetch: false,
                disableFontFace: true,
                // @ts-ignore - disable worker
                disableWorker: true,
              } as any);
              pdfDoc = await loadingTask2.promise;
              if (!cancelled) {
                pdfRef.current = pdfDoc;
                setNumPages(pdfDoc.numPages);
                setLoading(false);
                setError(null);
                return;
              }
            } catch (e2: any) {
              console.error("[PdfViewer] fallback also failed", e2);
            }
          }
          setError(e.message || String(e));
          setLoading(false);
        }
      }
    }
    if (pdfUrl) load();
    return () => {
      cancelled = true;
      // Use loadingTask.destroy() or pdfDoc.cleanup() per pdfjs-dist 6.x API
      try {
        if (pdfDoc) {
          if (typeof pdfDoc.cleanup === "function") pdfDoc.cleanup();
          else if (typeof pdfDoc.destroy === "function") (pdfDoc as any).destroy().catch(() => {});
        }
      } catch {}
      pdfRef.current = null;
    };
  }, [pdfUrl]);

  // Render pages after pdf loaded and canvases mounted
  useEffect(() => {
    if (!pdfRef.current || numPages === 0) return;
    let cancelled = false;
    async function renderAll() {
      const pdf = pdfRef.current;
      if (!pdf) return;
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) break;
        // Wait for canvas to be in DOM (after numPages render)
        let attempts = 0;
        let canvas: HTMLCanvasElement | null = null;
        while (attempts < 10 && !canvas) {
          canvas = document.getElementById(`pdf-canvas-${i}`) as HTMLCanvasElement | null;
          if (!canvas) {
            await new Promise((r) => setTimeout(r, 50));
            attempts++;
          }
        }
        if (!canvas) {
          console.warn(`[PdfViewer] canvas pdf-canvas-${i} not found after ${attempts} attempts`);
          continue;
        }
        try {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            page.cleanup();
            continue;
          }
          // Handle high-DPI
          const dpr = window.devicePixelRatio || 1;
          canvas.width = viewport.width * dpr;
          canvas.height = viewport.height * dpr;
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          await page.render({ canvasContext: ctx, viewport } as any).promise;
          page.cleanup();
        } catch (e) {
          console.error(`[PdfViewer] render page ${i} failed`, e);
        }
      }
    }
    // Defer to next tick to ensure DOM is painted
    const t = setTimeout(renderAll, 100);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [numPages, pages.length]);

  if (error) {
    return (
      <div className="flex-1 bg-[#F0F0F0] flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sm font-medium">Failed to load answer sheet</p>
        <p className="text-xs text-gray-500 mt-1 max-w-[480px] break-words">{error}</p>
        <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#FF6B2C] mt-2 underline">
          Open PDF directly
        </a>
        <p className="text-[11px] text-gray-400 mt-2">If this persists, try refreshing or re-uploading.</p>
      </div>
    );
  }

  if (numPages === 0 && loading) {
    return (
      <div className="flex-1 bg-[#F0F0F0] flex flex-col items-center justify-center p-6">
        <span className="w-6 h-6 border-2 border-gray-300 border-t-[#FF6B2C] rounded-full animate-spin" />
        <span className="text-sm text-gray-500 mt-3">Loading answer sheet...</span>
        <span className="text-xs text-gray-400 mt-1">{pages.length ? `${pages.length} pages` : ""}</span>
      </div>
    );
  }

  const totalPages = numPages || pages.length || 1;
  return (
    <div ref={containerRef} className="flex-1 overflow-auto bg-[#E8E8E8] p-4 sm:p-6 flex flex-col items-center gap-6">
      {Array.from({ length: totalPages }, (_, idx) => {
        const pageNumber = idx + 1;
        const docPage = pages.find((p) => p.pageNumber === pageNumber);
        const pageId = docPage?.id;
        const pageHighlights = highlights.filter((h) => {
          const hlPageNum = pageIdToNumber.get(h.pageId);
          return hlPageNum === pageNumber || h.pageId === pageId || h.pageId === String(pageNumber) || h.pageId === `page_${pageNumber}`;
        });
        const isActive = activePageNumber === pageNumber;
        return (
          <div
            key={pageNumber}
            id={`pdf-page-${pageNumber}`}
            className={`relative bg-white shadow-md rounded-lg overflow-hidden shrink-0 ${isActive ? "ring-2 ring-[#FF6B2C]" : ""}`}
            style={{ width: "100%", maxWidth: 640 }}
          >
            <canvas id={`pdf-canvas-${pageNumber}`} className="w-full h-auto block bg-white" />
            <div className="absolute inset-0 pointer-events-none">
              {pageHighlights.map((hr, hi) =>
                hr.boxes.map((box, bi) => {
                  const isActiveBox = isActive && hi === 0;
                  return (
                    <div
                      key={`${hi}-${bi}`}
                      className={`absolute border-2 rounded-sm ${isActiveBox ? "bg-[#FF6B2C]/20 border-[#FF6B2C] shadow-[0_0_0_2px_rgba(255,107,44,0.2)]" : "bg-amber-200/20 border-amber-400"}`}
                      style={{
                        left: `${box.x * 100}%`,
                        top: `${box.y * 100}%`,
                        width: `${box.width * 100}%`,
                        height: `${box.height * 100}%`,
                      }}
                    />
                  );
                })
              )}
            </div>
            <div className="absolute bottom-2 right-2 text-[10px] bg-white/80 backdrop-blur px-2 py-0.5 rounded-full border shadow-sm">
              {pageNumber} / {numPages || totalPages}
            </div>
          </div>
        );
      })}
      {highlights.length === 0 && (
        <div className="w-full max-w-[640px] bg-white rounded-xl p-6 text-center text-sm text-gray-500 border">
          No reliable answer region detected
        </div>
      )}
    </div>
  );
}
