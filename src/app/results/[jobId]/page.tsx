"use client";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { QuestionCard } from "@/components/results/QuestionCard";
import { ViewerShell } from "@/components/viewer/Viewer";
import type { ProcessingResult, QuestionResult } from "@/types";

export default function ResultsPage() {
  const params = useParams() as { jobId: string };
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"questions" | "viewer">("questions");

  useEffect(() => {
    fetch(`/api/jobs/${params.jobId}/result`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load result");
        setResult(data);
        if (data.questionResults?.[0]) setSelectedId(data.questionResults[0].question.id);
      })
      .catch((e) => setError(e.message));
  }, [params.jobId]);

  // fetch pages for viewer (from documents)
  const [pages, setPages] = useState<any[]>([]);
  useEffect(() => {
    // try to get answer sheet pages via job fetch
    fetch(`/api/jobs/${params.jobId}`)
      .then((r) => r.json())
      .then(async (data) => {
        // we don't have pages in job directly; derive from result answer regions
        // For viewer we will construct synthetic pages if needed
        if (result) {
          // collect pageIds from answerGroups
          const pageMap = new Map<string, any>();
          for (const ag of result.answers) {
            for (const reg of ag.regions) {
              if (!pageMap.has(reg.pageId)) pageMap.set(reg.pageId, { id: reg.pageId, pageNumber: pageMap.size + 1, width: 800, height: 1100, rotation: 0 });
            }
          }
          if (pageMap.size === 0) {
            // fallback: fetch via document inspection? Use dummy
            setPages([{ id: "p1", pageNumber: 1, width: 800, height: 1100, rotation: 0 }]);
          } else {
            setPages(Array.from(pageMap.values()));
          }
        }
      });
  }, [result]);

  // Simpler: if pages empty, derive from result
  useEffect(() => {
    if (result && pages.length === 0) {
      const pageMap = new Map<string, any>();
      for (const ag of result.answers) {
        for (const reg of ag.regions) {
          if (!pageMap.has(reg.pageId)) pageMap.set(reg.pageId, { id: reg.pageId, pageNumber: pageMap.size + 1, width: 800, height: 1100, rotation: 0, documentId: reg.documentId });
        }
      }
      if (pageMap.size === 0) {
        setPages([{ id: "p1", pageNumber: 1, width: 800, height: 1100, rotation: 0 }]);
      } else {
        setPages(Array.from(pageMap.values()));
      }
    }
  }, [result, pages.length]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#F7F7F7] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border p-6 max-w-md text-center">
          <p className="font-medium">Failed to load result</p>
          <p className="text-sm text-gray-500 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-[#F7F7F7] flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span className="w-5 h-5 border-2 border-gray-300 border-t-[#FF6B2C] rounded-full animate-spin" />
          Loading results…
        </div>
      </div>
    );
  }

  const selected = result.questionResults.find((q) => q.question.id === selectedId) || result.questionResults[0];
  const highlights = selected?.highlightRegions || [];
  const activePageId = highlights[0]?.pageId;

  const unmatched = result.unmatchedAnswers;

  return (
    <div className="min-h-screen bg-[#F7F7F7] flex flex-col">
      <header className="h-[56px] bg-white border-b border-gray-200 flex items-center px-4 sm:px-6 justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#FF6B2C] flex items-center justify-center text-white font-bold text-[13px]">V</div>
          <span className="font-semibold">VedaAI</span>
          <span className="hidden sm:inline text-gray-300 mx-2">/</span>
          <span className="hidden sm:inline text-sm text-gray-600">Results</span>
        </div>
        <div className="text-xs text-gray-500 hidden sm:block">{result.questions.length} questions • {result.answers.length} answers</div>
      </header>

      {/* Mobile tab */}
      <div className="lg:hidden bg-white border-b flex">
        <button onClick={() => setMobileTab("questions")} className={`flex-1 py-3 text-sm font-medium border-b-2 ${mobileTab === "questions" ? "border-[#FF6B2C] text-[#FF6B2C]" : "border-transparent text-gray-500"}`}>Questions ({result.questionResults.length})</button>
        <button onClick={() => setMobileTab("viewer")} className={`flex-1 py-3 text-sm font-medium border-b-2 ${mobileTab === "viewer" ? "border-[#FF6B2C] text-[#FF6B2C]" : "border-transparent text-gray-500"}`}>Answer Sheet</button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Question panel */}
        <div
          className={`w-full lg:w-[380px] bg-white border-r border-gray-200 flex flex-col shrink-0 ${mobileTab === "viewer" ? "hidden lg:flex" : "flex"}`}
        >
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-sm">Questions</h2>
            <p className="text-xs text-gray-500">{result.questions.length} extracted in original order</p>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {result.questionResults.map((qr) => (
              <QuestionCard key={qr.question.id} result={qr} isSelected={selectedId === qr.question.id} onSelect={() => setSelectedId(qr.question.id)} />
            ))}
          </div>
          {unmatched.length > 0 && (
            <div className="p-3 border-t bg-amber-50">
              <p className="text-xs font-medium text-amber-800">Unmatched answers ({unmatched.length})</p>
              <p className="text-xs text-amber-700 mt-1">These could not be reliably mapped — needs review.</p>
            </div>
          )}
        </div>

        {/* Viewer panel */}
        <div className={`flex-1 flex flex-col min-w-0 bg-[#E8E8E8] ${mobileTab === "questions" ? "hidden lg:flex" : "flex"}`}>
          <div className="h-[44px] bg-white border-b flex items-center px-4 justify-between shrink-0">
            <span className="text-sm font-medium">Answer Sheet</span>
            <span className="text-xs text-gray-500">{selected ? `Q ${selected.question.normalizedNumber} selected` : ""}</span>
          </div>
          <ViewerShell pages={pages} highlights={highlights} activePageId={activePageId} selectedQuestionId={selectedId || undefined} />
        </div>
      </div>
    </div>
  );
}
