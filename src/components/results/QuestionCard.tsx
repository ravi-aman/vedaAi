"use client";
import React from "react";
import type { QuestionResult } from "@/types";
import { Badge } from "@/components/ui/Card";

export function QuestionCard({
  result,
  isSelected,
  onSelect,
}: {
  result: QuestionResult;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const q = result.question;
  const status = result.status;

  const statusMeta: Record<string, { label: string; variant: any; dot: string }> = {
    MATCHED: { label: "Answered", variant: "success", dot: "bg-emerald-500" },
    UNCERTAIN: { label: "Needs review", variant: "warning", dot: "bg-amber-500" },
    UNANSWERED: { label: "No answer detected", variant: "neutral", dot: "bg-gray-400" },
    UNMATCHED: { label: "Unmatched", variant: "danger", dot: "bg-red-500" },
    PARTIAL: { label: "Partial", variant: "warning", dot: "bg-amber-500" },
  };
  const meta = statusMeta[status] || statusMeta.UNANSWERED;

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-xl border transition-all flex Gap-3 items-start gap-3
        ${isSelected ? "bg-[#FFF1EB] border-[#FF6B2C] shadow-sm" : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm"}
      `}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0 ${isSelected ? "bg-[#FF6B2C] text-white" : "bg-gray-100 text-gray-700"}`}>
        {q.normalizedNumber}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-gray-900 line-clamp-2 leading-5">{q.text}</p>
        <div className="flex items-center gap-2 mt-2">
          <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
          <span className="text-xs text-gray-600">{meta.label}</span>
          {result.mappingConfidence !== undefined && status !== "UNANSWERED" && (
            <span className="text-xs text-gray-400">• {(result.mappingConfidence * 100).toFixed(0)}%</span>
          )}
        </div>
        {result.evidence.length > 0 && isSelected && (
          <div className="mt-2 text-[11px] text-gray-500 bg-white/70 rounded-lg p-2 border">
            <p className="font-medium text-gray-700">Evidence</p>
            <ul className="list-disc pl-4 mt-1 space-y-0.5">
              {result.evidence.slice(0, 2).map((e, i) => (
                <li key={i}>{e.explanation}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </button>
  );
}
