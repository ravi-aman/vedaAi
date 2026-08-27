"use client";
import React, { useState } from "react";
import type { QuestionResult } from "@/types";

export function MappingQuestionCard({
  result,
  isSelected,
  onSelect,
  defaultExpanded = false,
  forceExpanded,
}: {
  result: QuestionResult;
  isSelected: boolean;
  onSelect: () => void;
  defaultExpanded?: boolean;
  forceExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded || isSelected);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const q = result.question;

  // Handle global Expand All / Collapse All
  React.useEffect(() => {
    if (forceExpanded !== undefined) setExpanded(forceExpanded);
  }, [forceExpanded]);

  // Sync expanded when selected — expand automatically when selected if not already
  React.useEffect(() => {
    if (isSelected) {
      setExpanded(true);
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isSelected]);

  const status = result.status;

  // --- Score badge: derive text and precise Figma colors ---
  const scoreText = (() => {
    if (q.marks !== undefined && q.marks !== null) return `${q.marks}/${q.marks}`;
    if (status === "MATCHED") return "2/2";
    if (status === "PARTIAL") return "1/2";
    if (status === "UNCERTAIN") return "1/2";
    if (status === "UNANSWERED" || status === "UNMATCHED") return "0/2";
    return "2/2";
  })();

  // Parse ratio to decide color tier
  const isZero = scoreText.startsWith("0/");
  const isPartial = (() => {
    if (isZero) return false;
    const [a, b] = scoreText.split("/").map(Number);
    if (!isNaN(a) && !isNaN(b) && b > 0) return a < b;
    return scoreText === "1/2";
  })();

  // Figma targets:
  // Full: bg #E4F6E9 text #1E8E3E
  // Zero: bg #FDEBEC text #D93025
  // Partial: bg #FEF3E2 text #B76E00
  const badgeClasses = isZero
    ? "bg-[#FDEBEC] text-[#D93025] border border-[#FAD2D3]"
    : isPartial
      ? "bg-[#FEF3E2] text-[#B76E00] border border-[#FCE6C2]"
      : "bg-[#E4F6E9] text-[#1E8E3E] border border-[#C6EAD0]";

  const feedback = result.evidence?.[0]?.explanation || "No feedback available.";

  const isSelectedOrExpanded = isSelected || expanded;

  return (
    <div
      ref={cardRef}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
      className={`w-full text-left bg-white cursor-pointer transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]
        ${isSelected ? "border-[2px] border-[#FF5A36] rounded-[14px] p-[12px]" : "border border-[#ECECEE] rounded-[14px] p-[12px] hover:border-[#E0E0E2]"}
      `}
      style={{ boxShadow: isSelected ? "0 1px 6px rgba(255,90,54,0.12)" : "0 1px 2px rgba(0,0,0,0.04)" }}
    >
      <div className="flex items-start gap-3">
        {/* Number badge — 24px gray circle */}
        <div className="w-6 h-6 rounded-full bg-[#F2F3F5] flex items-center justify-center text-[12px] font-bold text-[#1C1C1E] shrink-0 mt-0.5">
          {q.normalizedNumber || q.orderIndex + 1}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium text-[#1C1C1E] leading-[18px]">{q.text}</p>
        </div>

        {/* Score badge + black circular chevron */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`inline-flex items-center justify-center min-w-[40px] h-[22px] px-2 rounded-full text-[11px] font-semibold ${badgeClasses}`}>{scoreText}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            aria-label={expanded ? "Collapse" : "Expand"}
            className="w-6 h-6 rounded-full bg-[#0A0A0A] flex items-center justify-center text-white hover:bg-black transition-colors shrink-0"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-transform duration-[150ms]"
              style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>

      {/* AI Feedback — inside same card, light peach #FFF1EA */}
      <div className={`grid transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${expanded ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <div className="bg-[#FFF1EA] rounded-[12px] p-[10px]">
            <p className="text-[13px] font-bold text-[#FF5A36]">AI Feedback</p>
            <p className="text-[13px] text-[#2A2A2E] leading-[18px] mt-1">{feedback}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
