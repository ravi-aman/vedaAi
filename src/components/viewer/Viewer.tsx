"use client";
import React, { useEffect, useRef } from "react";
import type { HighlightRegion, DocumentPage } from "@/types";
import { transformForDisplay } from "@/lib/coordinates/transform";

export function ViewerShell({
  pages,
  highlights,
  selectedQuestionId,
  activePageId,
  onPageChange,
}: {
  pages: DocumentPage[];
  highlights: HighlightRegion[];
  selectedQuestionId?: string;
  activePageId?: string;
  onPageChange?: (pageId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeHighlight = highlights.find((h) => h.pageId === activePageId) || highlights[0];

  // Scroll to active highlight
  useEffect(() => {
    if (!activeHighlight || !containerRef.current) return;
    const el = document.getElementById(`page-${activeHighlight.pageId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeHighlight]);

  if (pages.length === 0) {
    return (
      <div className="flex-1 bg-[#F0F0F0] flex items-center justify-center text-sm text-gray-500">
        No pages
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-auto bg-[#E8E8E8] p-4 sm:p-6 flex flex-col items-center gap-6">
      {pages.map((page) => {
        const pageHighlights = highlights.filter((h) => h.pageId === page.id);
        const isActivePage = activeHighlight?.pageId === page.id;
        // Use aspect ratio from width/height
        const aspect = page.width / page.height;
        return (
          <div
            key={page.id}
            id={`page-${page.id}`}
            className={`relative bg-white shadow-md rounded-lg overflow-hidden shrink-0 ${isActivePage ? "ring-2 ring-[#FF6B2C]" : ""}`}
            style={{ width: "100%", maxWidth: 640, aspectRatio: `${page.width} / ${page.height}` }}
          >
            {/* Page background placeholder */}
            <div className="absolute inset-0 bg-white flex flex-col">
              <div className="h-[6%] border-b border-gray-100 flex items-center px-4 text-[10px] text-gray-400">Page {page.pageNumber} • {page.width.toFixed(0)}×{page.height.toFixed(0)}</div>
              <div className="flex-1 p-6 text-[11px] text-gray-300 leading-5">
                {/* Fake handwritten lines */}
                <div className="space-y-3">
                  <div className="h-3 bg-gray-100 rounded w-[88%]" />
                  <div className="h-3 bg-gray-100 rounded w-[92%]" />
                  <div className="h-3 bg-[#FFF1EB] rounded w-[84%]" />
                  <div className="h-3 bg-gray-100 rounded w-[76%]" />
                </div>
              </div>
            </div>

            {/* Highlights overlay */}
            <div className="absolute inset-0 pointer-events-none">
              {pageHighlights.map((hr, idx) =>
                hr.boxes.map((box, bi) => {
                  // transformForDisplay currently does rotation; we pass 0
                  const displayBox = box; // already normalized; convert to % for CSS
                  const isActiveBox = isActivePage && idx === 0;
                  return (
                    <div
                      key={`${idx}-${bi}`}
                      className={`absolute border-2 rounded-sm ${isActiveBox ? "bg-[#FF6B2C]/20 border-[#FF6B2C] shadow-[0_0_0_2px_rgba(255,107,44,0.2)]" : "bg-amber-200/20 border-amber-400"}`}
                      style={{
                        left: `${displayBox.x * 100}%`,
                        top: `${displayBox.y * 100}%`,
                        width: `${displayBox.width * 100}%`,
                        height: `${displayBox.height * 100}%`,
                      }}
                    />
                  );
                })
              )}
            </div>

            {/* Page number badge */}
            <div className="absolute bottom-2 right-2 text-[10px] bg-white/80 backdrop-blur px-2 py-0.5 rounded-full border shadow-sm">
              {page.pageNumber}
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
