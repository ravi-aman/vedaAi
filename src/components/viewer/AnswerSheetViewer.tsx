"use client";
import React, { useEffect, useRef, useState } from "react";
import type { HighlightRegion, DocumentPage } from "@/types";

export function AnswerSheetViewer({
  pages,
  highlights,
  selectedQuestionId,
  activePageId,
  pdfUrl,
  mime,
}: {
  pages: DocumentPage[];
  highlights: HighlightRegion[];
  selectedQuestionId?: string;
  activePageId?: string;
  pdfUrl?: string;
  mime?: string;
}) {
  const [scale, setScale] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(pages.length || 1, 1);
  const activeHighlight = highlights.find((h) => h.pageId === activePageId) || highlights[0];
  const isPdf = pdfUrl && mime?.includes("pdf");
  const isImage = pdfUrl && mime?.startsWith("image/");

  const pageIdToNumber = new Map(pages.map((p) => [p.id, p.pageNumber]));
  const activePageNumber = activePageId ? pageIdToNumber.get(activePageId) : undefined;

  // Keep currentPage in sync with active highlight
  useEffect(() => {
    if (activePageNumber) setCurrentPage(activePageNumber);
  }, [activePageNumber]);

  const handleZoomOut = () => setScale((s) => Math.max(50, s - 10));
  const handleZoomIn = () => setScale((s) => Math.min(200, s + 10));
  const handlePrev = () => setCurrentPage((p) => Math.max(1, p - 1));
  const handleNext = () => setCurrentPage((p) => Math.min(totalPages, p + 1));

  const [flashKey, setFlashKey] = useState(0);
  useEffect(() => {
    if (selectedQuestionId) setFlashKey((k) => k + 1);
  }, [selectedQuestionId]);

  // Shared highlight color
  const HIGHLIGHT_BORDER = "#34C759";
  const HIGHLIGHT_TAG_BG = "#34C759";

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      {/* Dark header bar — 44px, #161616, top two corners 20px, padding 0 16px */}
      <div className="h-[44px] bg-[#161616] flex items-center justify-between px-4 shrink-0" style={{ borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <span className="text-[14px] font-bold text-white">Answer Sheet</span>
        <div className="flex items-center gap-2">
          {/* Zoom stepper */}
          <button
            onClick={handleZoomOut}
            aria-label="Zoom out"
            className="w-6 h-6 rounded-[6px] bg-[#2A2A2A] hover:bg-[#333] flex items-center justify-center text-white text-[14px] leading-none transition-colors"
          >
            −
          </button>
          <span className="text-[13px] font-medium text-white min-w-[36px] text-center">{scale}%</span>
          <button
            onClick={handleZoomIn}
            aria-label="Zoom in"
            className="w-6 h-6 rounded-[6px] bg-[#2A2A2A] hover:bg-[#333] flex items-center justify-center text-white text-[14px] leading-none transition-colors"
          >
            +
          </button>
          <span className="w-px h-5 bg-white/15 mx-1" />
          {/* Page nav */}
          <button
            onClick={handlePrev}
            disabled={currentPage <= 1}
            aria-label="Previous page"
            className="w-6 h-6 rounded-[6px] bg-[#2A2A2A] hover:bg-[#333] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-white transition-colors"
          >
            ‹
          </button>
          <span className="text-[13px] text-white/90">Page {currentPage} of {totalPages}</span>
          <button
            onClick={handleNext}
            disabled={currentPage >= totalPages}
            aria-label="Next page"
            className="w-6 h-6 rounded-[6px] bg-[#2A2A2A] hover:bg-[#333] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-white transition-colors"
          >
            ›
          </button>
        </div>
      </div>

      {/* Body — scrollable, light background, highlight */}
      <div className="flex-1 overflow-auto bg-[#F7F7F8] p-4 lg:p-6 flex flex-col items-center gap-6">
        {isImage ? (
          <>
            <div
              className="relative bg-white rounded-[8px] overflow-hidden shrink-0 border border-[#ECECEE]"
              style={{ width: "100%", maxWidth: 640, transform: `scale(${scale / 100})`, transformOrigin: "top center" }}
            >
              <img src={pdfUrl!} alt="Answer sheet" className="w-full h-auto block" />
              <div className="absolute inset-0 pointer-events-none">
                {highlights.map((hr, idx) =>
                  hr.boxes.map((box, bi) => (
                    <div
                      key={`${idx}-${bi}-${flashKey}`}
                      className="absolute rounded-[8px] bg-[#34C759]/[0.08]"
                      style={{
                        left: `${box.x * 100}%`,
                        top: `${box.y * 100}%`,
                        width: `${box.width * 100}%`,
                        height: `${box.height * 100}%`,
                        border: `2px solid ${HIGHLIGHT_BORDER}`,
                        transition: "all 200ms ease",
                      }}
                    >
                      {idx === 0 && bi === 0 && (
                        <span
                          className="absolute -top-2 -left-1 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                          style={{ background: HIGHLIGHT_TAG_BG }}
                        >
                          {(() => {
                            const num = pageIdToNumber.get(hr.pageId) ?? currentPage;
                            const label = selectedQuestionId ? `Q${num}` : "Q2";
                            // Try to get normalizedNumber from highlight context fallback
                            return label;
                          })()}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            {highlights.length === 0 && <div className="w-full max-w-[640px] bg-white rounded-xl p-6 text-center text-sm text-gray-500 border">No reliable answer region detected</div>}
          </>
        ) : isPdf ? (
          <PdfContent
            pdfUrl={pdfUrl!}
            pages={pages}
            highlights={highlights}
            activePageId={activePageId}
            currentPage={currentPage}
            scale={scale}
            flashKey={flashKey}
            totalPages={totalPages}
          />
        ) : (
          <>
            {pages.map((page) => {
              const pageHighlights = highlights.filter((h) => h.pageId === page.id);
              const isActive = activeHighlight?.pageId === page.id;
              // Only show currentPage when paginated? For placeholder, show all pages but highlight per page
              if (pages.length > 1 && page.pageNumber !== currentPage) {
                // still render but could hide non-current for pagination; but spec shows multiple pages stacked? Keep all for placeholder
              }
              return (
                <div
                  key={page.id}
                  id={`page-${page.id}`}
                  className="relative bg-white rounded-[8px] overflow-hidden shrink-0 border"
                  style={{
                    width: "100%",
                    maxWidth: 640,
                    aspectRatio: `${page.width} / ${page.height}`,
                    borderColor: isActive ? "#34C75933" : "#ECECEE",
                    transform: `scale(${scale / 100})`,
                    transformOrigin: "top center",
                  }}
                >
                  <div className="absolute inset-0 bg-white flex flex-col">
                    <div className="h-[6%] border-b border-gray-100 flex items-center px-4 text-[10px] text-gray-400">Page {page.pageNumber}</div>
                    <div className="flex-1 p-6">
                      <div className="space-y-3 opacity-30">
                        <div className="h-3 bg-gray-100 rounded w-[88%]" />
                        <div className="h-3 bg-gray-100 rounded w-[92%]" />
                        <div className="h-3 bg-[#FFF1EB] rounded w-[84%]" />
                      </div>
                    </div>
                  </div>
                  <div className="absolute inset-0 pointer-events-none">
                    {pageHighlights.map((hr, idx) =>
                      hr.boxes.map((box, bi) => (
                        <div
                          key={`${idx}-${bi}-${flashKey}`}
                          className="absolute rounded-[8px]"
                          style={{
                            left: `${box.x * 100}%`,
                            top: `${box.y * 100}%`,
                            width: `${box.width * 100}%`,
                            height: `${box.height * 100}%`,
                            border: `2px solid ${HIGHLIGHT_BORDER}`,
                            background: isActive && idx === 0 ? "rgba(52,199,89,0.08)" : "rgba(251,191,36,0.12)",
                            transition: "all 200ms ease",
                          }}
                        >
                          {isActive && idx === 0 && bi === 0 && (
                            <span className="absolute -top-2 -left-1 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: HIGHLIGHT_TAG_BG }}>
                              Q{page.pageNumber}
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function PdfContent({
  pdfUrl,
  pages,
  highlights,
  activePageId,
  currentPage,
  scale,
  flashKey,
  totalPages,
}: {
  pdfUrl: string;
  pages: DocumentPage[];
  highlights: HighlightRegion[];
  activePageId?: string;
  currentPage: number;
  scale: number;
  flashKey: number;
  totalPages: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
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
        try {
          const version = pdfjs.version || "6.2.108";
          pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/legacy/build/pdf.worker.mjs`;
        } catch {
          pdfjs.GlobalWorkerOptions.workerSrc = "";
        }
        const loadingTask = pdfjs.getDocument({ url: pdfUrl, withCredentials: true, verbosity: 0, isEvalSupported: false, useWorkerFetch: true, disableFontFace: true });
        pdfDoc = await loadingTask.promise;
        if (cancelled) {
          try { if (pdfDoc?.cleanup) pdfDoc.cleanup(); } catch {}
          return;
        }
        pdfRef.current = pdfDoc;
        setNumPages(pdfDoc.numPages);
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || String(e));
          setLoading(false);
        }
      }
    }
    if (pdfUrl) load();
    return () => {
      cancelled = true;
      try { if (pdfDoc?.cleanup) pdfDoc.cleanup(); } catch {}
      pdfRef.current = null;
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (!pdfRef.current || numPages === 0) return;
    let cancelled = false;
    async function renderAll() {
      const pdf = pdfRef.current;
      if (!pdf) return;
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) break;
        // Only render current page for pagination efficiency, but still need canvas exists
        // Wait for canvas to be in DOM
        let attempts = 0;
        let canvas: HTMLCanvasElement | null = null;
        while (attempts < 10 && !canvas) {
          canvas = document.getElementById(`pdf-canvas-${i}`) as HTMLCanvasElement | null;
          if (!canvas) {
            await new Promise((r) => setTimeout(r, 50));
            attempts++;
          }
        }
        if (!canvas) continue;
        // If not current page and we paginate, skip rendering hidden pages? Still render for scroll.
        try {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const ctx = canvas.getContext("2d");
          if (!ctx) { page.cleanup(); continue; }
          const dpr = window.devicePixelRatio || 1;
          canvas.width = viewport.width * dpr;
          canvas.height = viewport.height * dpr;
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          await page.render({ canvasContext: ctx, viewport } as any).promise;
          page.cleanup();
        } catch (e) {
          console.error(`render page ${i} failed`, e);
        }
      }
    }
    const t = setTimeout(renderAll, 100);
    return () => { cancelled = true; clearTimeout(t); };
  }, [numPages, pages.length]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sm font-medium">Failed to load answer sheet</p>
        <p className="text-xs text-gray-500 mt-1">{error}</p>
        <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#FF5A36] mt-2 underline">Open PDF directly</a>
      </div>
    );
  }
  if (numPages === 0 && loading) {
    return (
      <div className="flex flex-col items-center justify-center p-6">
        <span className="w-6 h-6 border-2 border-gray-300 border-t-[#FF5A36] rounded-full animate-spin" />
        <span className="text-sm text-gray-500 mt-3">Loading answer sheet…</span>
      </div>
    );
  }

  // For paginated view, show only currentPage; for scroll view show all. Use pagination: show currentPage only
  const pagesToRender = [currentPage];
  return (
    <div ref={containerRef} className="flex flex-col items-center gap-6 w-full">
      {pagesToRender.map((pageNumber) => {
        const docPage = pages.find((p) => p.pageNumber === pageNumber);
        const pageId = docPage?.id;
        const pageHighlights = highlights.filter((h) => {
          const hlNum = pageIdToNumber.get(h.pageId);
          return hlNum === pageNumber || h.pageId === pageId || h.pageId === String(pageNumber);
        });
        const isActive = activePageNumber === pageNumber || pageHighlights.length > 0;
        return (
          <div
            key={pageNumber}
            id={`pdf-page-${pageNumber}`}
            className="relative bg-white rounded-[8px] overflow-hidden shrink-0 border"
            style={{ width: "100%", maxWidth: 640, borderColor: isActive ? "rgba(52,199,89,0.2)" : "#ECECEE", transform: `scale(${scale / 100})`, transformOrigin: "top center" }}
          >
            <canvas id={`pdf-canvas-${pageNumber}`} className="w-full h-auto block bg-white" />
            <div className="absolute inset-0 pointer-events-none">
              {pageHighlights.map((hr, hi) =>
                hr.boxes.map((box, bi) => (
                  <div
                    key={`${hi}-${bi}-${flashKey}`}
                    className="absolute rounded-[8px]"
                    style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%`, border: "2px solid #34C759", background: "rgba(52,199,89,0.08)", transition: "all 200ms ease" }}
                  >
                    {hi === 0 && bi === 0 && (
                      <span className="absolute -top-2 -left-1 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#34C759" }}>
                        Q{pageNumber}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
      {/* Render hidden canvases for other pages to keep pdf loading but not visible when paginated */}
      <div className="hidden">
        {Array.from({ length: numPages }, (_, idx) => {
          const pn = idx + 1;
          if (pn === currentPage) return null;
          return <canvas key={pn} id={`pdf-canvas-${pn}`} />;
        })}
      </div>
    </div>
  );
}
