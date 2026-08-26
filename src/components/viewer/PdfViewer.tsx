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

  // Map pageId (UUID) to pageNumber
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
    async function load() {
      try {
        setLoading(true);
        setError(null);
        // Dynamic import pdfjs to avoid SSR
        const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
        // Use worker from cdn or disable
        if (pdfjs.GlobalWorkerOptions) {
          // Use fake worker via disable
          pdfjs.GlobalWorkerOptions.workerSrc = "";
        }
        const loadingTask = pdfjs.getDocument({
          url: pdfUrl,
          withCredentials: true,
          verbosity: 0,
          isEvalSupported: false,
          useWorkerFetch: false,
          disableFontFace: true,
        });
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        setNumPages(pdf.numPages);

        // Render each page to canvas
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) break;
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.getElementById(`pdf-canvas-${i}`) as HTMLCanvasElement | null;
          if (!canvas) continue;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          await page.render({ canvasContext: ctx, viewport }).promise;
          page.cleanup();
        }
        if (!cancelled) setLoading(false);
        await pdf.destroy();
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
    };
  }, [pdfUrl]);

  if (error) {
    return (
      <div className="flex-1 bg-[#F0F0F0] flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sm font-medium">Failed to load answer sheet</p>
        <p className="text-xs text-gray-500 mt-1">{error}</p>
        <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#FF6B2C] mt-2 underline">
          Open PDF directly
        </a>
      </div>
    );
  }

  if (numPages === 0 && loading) {
    return (
      <div className="flex-1 bg-[#F0F0F0] flex items-center justify-center">
        <span className="w-6 h-6 border-2 border-gray-300 border-t-[#FF6B2C] rounded-full animate-spin" />
        <span className="text-sm text-gray-500 ml-3">Loading answer sheet...</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-auto bg-[#E8E8E8] p-4 sm:p-6 flex flex-col items-center gap-6">
      {Array.from({ length: numPages || pages.length || 1 }, (_, idx) => {
        const pageNumber = idx + 1;
        // Find DocumentPage for this pageNumber
        const docPage = pages.find((p) => p.pageNumber === pageNumber);
        const pageId = docPage?.id;
        const pageHighlights = highlights.filter((h) => {
          // Highlight pageId is UUID, map to pageNumber
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
            <canvas id={`pdf-canvas-${pageNumber}`} className="w-full h-auto block" />
            {/* Highlight overlay */}
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
              {pageNumber} / {numPages || "?"}
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
