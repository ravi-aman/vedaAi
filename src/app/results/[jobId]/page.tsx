/* eslint-disable */
"use client";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { MappingQuestionCard } from "@/components/results/MappingQuestionCard";
import { AnswerSheetViewer } from "@/components/viewer/AnswerSheetViewer";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopHeader } from "@/components/layout/TopHeader";
import { AuthGate } from "@/components/auth/AuthGate";
import type { ProcessingResult, QuestionResult } from "@/types";

export default function ResultsPage() {
  const params = useParams() as { jobId: string };
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"questions" | "viewer">("questions");
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [authGateDismissed, setAuthGateDismissed] = useState(false);
  const [jobCreatedAt, setJobCreatedAt] = useState<string | null>(null);
  const [expandAll, setExpandAll] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const handleSidebarToggle = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileOpen(true);
    } else {
      setSidebarCollapsed((v) => !v);
    }
  };

  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/jobs/${params.jobId}/result`, { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const code = (data as any).code || "";
          // Auth required → show gate, not error
          if (code === "AUTH_REQUIRED" || code === "UNAUTHORIZED" || res.status === 401 || res.status === 403) {
            if (!cancelled) {
              setShowAuthGate(true);
              setError(null);
              setErrorCode(code || "AUTH_REQUIRED");
            }
            // still try to fetch jobCreatedAt for timer
            try {
              const jobRes = await fetch(`/api/jobs/${params.jobId}`, { credentials: "include" });
              const jobData = await jobRes.json().catch(() => ({}));
              if (jobRes.ok && jobData.job?.createdAt && !cancelled) setJobCreatedAt(jobData.job.createdAt);
            } catch {}
            return;
          }
          // Job/result expired or not found → friendly expired UI
          if (code === "JOB_NOT_FOUND" || code === "STORAGE_ERROR" || res.status === 404) {
            if (!cancelled) {
              setErrorCode(code || "JOB_NOT_FOUND");
              setError("__JOB_EXPIRED__");
            }
            return;
          }
          throw new Error((data as any).error || "Failed to load result");
        }
        if (!cancelled) {
          setResult(data);
          if (data.questionResults?.[0]) setSelectedId(data.questionResults[0].question.id);
        }
        try {
          const jobRes = await fetch(`/api/jobs/${params.jobId}`, { credentials: "include" });
          const jobData = await jobRes.json().catch(() => ({}));
          if (jobRes.ok && jobData.job?.createdAt) {
            if (!cancelled) setJobCreatedAt(jobData.job.createdAt);
          }
        } catch {}
      } catch (e: any) {
        if (!cancelled) {
          // Don't overwrite auth gate
          if (e.message !== "Authentication required" && !showAuthGate) {
            setError(e.message);
            setErrorCode(null);
          }
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [params.jobId]);

  useEffect(() => {
    if (!result || !jobCreatedAt || showAuthGate) return;
    (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          await fetch(`/api/jobs/${params.jobId}/claim`, { method: "POST" }).catch(() => {});
          return;
        }
      } catch {}
      const GUEST_GRACE_MS = 90000;
      const created = new Date(jobCreatedAt).getTime();
      const elapsed = Date.now() - created;
      const remaining = GUEST_GRACE_MS - elapsed;
      if (remaining <= 0) {
        setShowAuthGate(true);
        return;
      }
      const t = setTimeout(() => setShowAuthGate(true), remaining);
      return () => clearTimeout(t);
    })();
  }, [result, jobCreatedAt, showAuthGate, params.jobId]);

  useEffect(() => {
    if (!result || showAuthGate === false) return;
    let cancelled = false;
    let claimed = false;
    const interval = setInterval(async () => {
      if (claimed || cancelled) {
        clearInterval(interval);
        return;
      }
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (data.user && !cancelled) {
          const res = await fetch(`/api/jobs/${params.jobId}/claim`, { method: "POST" });
          if (res.ok && !cancelled) {
            claimed = true;
            clearInterval(interval);
            setShowAuthGate(false);
            setAuthGateDismissed(false);
          }
        }
      } catch {}
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [result, params.jobId, showAuthGate]);

  const [pages, setPages] = useState<any[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfMime, setPdfMime] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/jobs/${params.jobId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.pages && data.pages.length > 0) {
          const answerDocIds = (data.documents || []).filter((d: any) => d.kind === "answerSheet").map((d: any) => d.id);
          const answerPages = data.pages.filter((p: any) => answerDocIds.includes(p.documentId));
          if (answerPages.length > 0) setPages(answerPages);
          else setPages(data.pages);
        }
        const job = data.job;
        if (job?.answerSheetFileId) {
          const doc = (data.documents || []).find((d: any) => d.kind === "answerSheet");
          const mime = doc?.mime || "application/pdf";
          setPdfMime(mime);
          setPdfUrl(`/api/files/${params.jobId}/${job.answerSheetFileId}`);
        }
        if (data.job?.createdAt) setJobCreatedAt(data.job.createdAt);
      })
      .catch(() => {});
  }, [params.jobId]);

  useEffect(() => {
    if (result && pages.length === 0) {
      const pageMap = new Map<string, any>();
      for (const ag of result.answers) {
        for (const reg of ag.regions) {
          if (!pageMap.has(reg.pageId)) pageMap.set(reg.pageId, { id: reg.pageId, pageNumber: pageMap.size + 1, width: 800, height: 1100, rotation: 0, documentId: reg.documentId });
        }
      }
      if (pageMap.size === 0) setPages([{ id: "p1", pageNumber: 1, width: 800, height: 1100, rotation: 0 }]);
      else setPages(Array.from(pageMap.values()));
    }
  }, [result, pages.length]);

  if (error) {
    const isExpired = error === "__JOB_EXPIRED__" || errorCode === "JOB_NOT_FOUND" || errorCode === "STORAGE_ERROR";
    if (isExpired) {
      return (
        <div className="h-[100dvh] h-screen flex items-center justify-center p-6 bg-[#EDEEF0] overflow-hidden">
          <div className="bg-white rounded-[24px] border border-black/5 p-8 max-w-md text-center card-shell">
            <div className="w-12 h-12 rounded-full bg-[#FFF1EA] flex items-center justify-center mx-auto text-[#FF5A36]">↻</div>
            <p className="font-semibold text-[16px] mt-3">Session expired</p>
            <p className="text-sm text-gray-500 mt-2">This result link has expired or the server was restarted. Job data is stored temporarily. Please start a new assessment.</p>
            <button onClick={() => (window.location.href = "/")} className="mt-4 h-10 px-6 rounded-full bg-[#0A0A0A] text-white text-sm font-medium hover:bg-black transition-colors">Start new assessment</button>
          </div>
        </div>
      );
    }
    // Don't show error card if auth gate should be shown
    if (showAuthGate || errorCode === "AUTH_REQUIRED" || errorCode === "UNAUTHORIZED") {
      // fall through to auth gate render below
    } else {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#EDEEF0]">
          <div className="bg-white rounded-[24px] border border-black/5 p-6 max-w-md text-center card-shell">
            <p className="font-medium">Failed to load result</p>
            <p className="text-sm text-gray-500 mt-2">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-3 text-sm text-[#FF5A36] underline">Try again</button>
          </div>
        </div>
      );
    }
  }

  if (!result) {
    // If auth is required, show shell with gate instead of bare spinner
    if (showAuthGate) {
      return (
        <div className="h-[100dvh] h-screen bg-[#EDEEF0] flex flex-col p-0 md:p-3 gap-0 md:gap-3 overflow-hidden">
          <div className="flex flex-1 min-h-0 gap-0 md:gap-3 overflow-hidden">
            <Sidebar collapsed={sidebarCollapsed} onToggle={handleSidebarToggle} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
            <div className="flex flex-1 flex-col min-w-0 gap-0 md:gap-3 min-h-0 overflow-hidden">
              <TopHeader onMenuClick={() => setMobileOpen(true)} mobileDrawerOpen={mobileOpen} />
              <div className="flex-1 flex items-center justify-center card-shell md:rounded-[20px] bg-white m-0 md:m-0 p-8 min-h-0">
                <div className="text-center max-w-sm">
                  <p className="font-semibold">Authentication required</p>
                  <p className="text-sm text-gray-500 mt-1">Please sign in to view this assessment.</p>
                </div>
              </div>
            </div>
          </div>
          <AuthGate jobId={params.jobId} onClose={() => setAuthGateDismissed(true)} />
        </div>
      );
    }
    return (
      <div className="h-[100dvh] h-screen flex items-center justify-center bg-[#EDEEF0] overflow-hidden">
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span className="w-5 h-5 border-2 border-gray-300 border-t-[#FF5A36] rounded-full animate-spin" />
          Loading results…
        </div>
      </div>
    );
  }

  const selected = result.questionResults.find((q) => q.question.id === selectedId) || result.questionResults[0];
  const highlights = selected?.highlightRegions || [];
  const activePageId = highlights[0]?.pageId;
  const activeQuestionLabel = selected?.question?.normalizedNumber || selected?.question?.rawNumber || "";
  // Only show top-level questions as cards (depth 0, no parent) — subparts/options are children, not separate cards (Constraint 14)
  const topLevelResults = result.questionResults.filter((qr) => (qr.question.depth === 0 || qr.question.depth == null) && !qr.question.parentQuestionId);
  const sortedResults = [...(topLevelResults.length ? topLevelResults : result.questionResults)].sort((a, b) => a.question.orderIndex - b.question.orderIndex);
  const handleExpandAll = () => setExpandAll((v) => !v);

  return (
    <div className="h-[100dvh] h-screen bg-[#EDEEF0] flex flex-col p-0 md:p-3 gap-0 md:gap-3 overflow-hidden">
      {showAuthGate && !authGateDismissed && <AuthGate jobId={params.jobId} onClose={() => setAuthGateDismissed(true)} />}

      <div className="flex flex-1 min-h-0 gap-0 md:gap-3 overflow-hidden">
        <Sidebar collapsed={sidebarCollapsed} onToggle={handleSidebarToggle} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

        <div className="flex flex-1 flex-col min-w-0 gap-0 md:gap-3 min-h-0 overflow-hidden">
          <TopHeader onMenuClick={() => setMobileOpen(true)} mobileDrawerOpen={mobileOpen} />

          {/* Mobile segmented control — pixel-matched to Image 1: black pill selected */}
          <div className="md:hidden mx-3 mt-3 shrink-0">
            <div className="flex bg-white rounded-full p-1.5 border border-black/[0.06] shadow-sm gap-1">
              <button
                onClick={() => setMobileTab("questions")}
                className={`flex-1 h-[36px] text-[14px] font-medium rounded-full transition-all duration-150 flex items-center justify-center ${mobileTab === "questions" ? "bg-[#0A0A0A] text-white shadow-sm" : "text-[#5A5A5E] bg-transparent"}`}
              >
                Questions
              </button>
              <button
                onClick={() => setMobileTab("viewer")}
                className={`flex-1 h-[36px] text-[14px] font-medium rounded-full transition-all duration-150 flex items-center justify-center ${mobileTab === "viewer" ? "bg-[#0A0A0A] text-white shadow-sm" : "text-[#5A5A5E] bg-transparent"}`}
              >
                Answer Sheet
              </button>
            </div>
          </div>

          {/* Two independent rounded cards — mobile gets outer margins to match Image 1 */}
          <div className="flex flex-1 min-h-0 gap-3 bg-transparent overflow-hidden mx-3 mt-3 mb-3 md:mx-0 md:mt-0 md:mb-0">
            {/* Left panel — Extracted Questions: white bg, 20px radius, padding 16px */}
            <div className={`flex flex-col shrink-0 bg-white rounded-[20px] card-shell overflow-hidden w-full md:w-[420px] xl:w-[460px] ${mobileTab === "viewer" ? "hidden md:flex" : "flex"}`}>
              <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
                <h2 className="text-[13px] md:text-[14px] font-bold text-[#0A0A0A] leading-none">Extracted Questions (from question paper)</h2>
                <button onClick={handleExpandAll} className="hidden md:block text-[12px] font-medium text-[#FF5A36] hover:underline shrink-0 ml-3">
                  {expandAll ? "Collapse All" : "Expand All"}
                </button>
              </div>

              <div className="flex-1 overflow-auto px-4 pb-4 space-y-3">
                {sortedResults.map((qr) => (
                  <MappingQuestionCard
                    key={qr.question.id}
                    result={qr}
                    isSelected={selectedId === qr.question.id}
                    onSelect={() => {
                      setSelectedId(qr.question.id);
                    }}
                    defaultExpanded={qr.question.id === selectedId}
                    forceExpanded={expandAll}
                  />
                ))}
                {result.unmatchedAnswers.length > 0 && (
                  <div className="p-3 rounded-[12px] bg-amber-50 border border-amber-200">
                    <p className="text-xs font-medium text-amber-800">Unmatched answers ({result.unmatchedAnswers.length})</p>
                    <p className="text-xs text-amber-700 mt-1">These could not be reliably mapped — needs review.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right panel — Answer Sheet: 20px radius, dark header bar, scrollable image with green highlight */}
            <div className={`flex-1 flex flex-col min-w-0 bg-white rounded-[20px] card-shell overflow-hidden ${mobileTab === "questions" ? "hidden md:flex" : "flex"}`}>
              <AnswerSheetViewer
                pages={pages}
                highlights={highlights}
                activePageId={activePageId}
                selectedQuestionId={selectedId || undefined}
                selectedQuestionLabel={activeQuestionLabel}
                pdfUrl={pdfUrl || undefined}
                mime={pdfMime || undefined}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
