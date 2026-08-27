"use client";
import React from "react";

export function ExtractingScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-16 fade-in">
      {/* Sparkle icon — 4-pointed diamonds */}
      <div className="relative w-[64px] h-[64px] flex items-center justify-center sparkle-pulse">
        {/* large diamond */}
        <svg width="42" height="42" viewBox="0 0 24 24" fill="#F1502F" className="absolute" style={{ top: 4, left: 14 }}>
          <path d="M12 2l2.8 6.2L21 11l-6.2 2.8L12 20l-2.8-6.2L3 11l6.2-2.8z" />
        </svg>
        {/* smaller diamond bottom-left */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#F1502F" className="absolute" style={{ bottom: 6, left: 8 }}>
          <path d="M12 2l2.8 6.2L21 11l-6.2 2.8L12 20l-2.8-6.2L3 11l6.2-2.8z" />
        </svg>
        {/* tiny dots */}
        <span className="absolute w-1.5 h-1.5 rounded-full bg-[#F1502F]/80" style={{ top: 12, left: 4 }} />
        <span className="absolute w-1 h-1 rounded-full bg-[#F1502F]/60" style={{ bottom: 14, right: 6 }} />
      </div>

      <h2 className="text-[18px] font-semibold text-[#111111] mt-4 tracking-tight">Extracting…</h2>
      <p className="text-[13px] text-[#8A8A8E] mt-1">This may take a while</p>
    </div>
  );
}
