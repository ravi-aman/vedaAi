"use client";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { QuestionCard } from "@/components/results/QuestionCard";
import { ViewerShell } from "@/components/viewer/Viewer";
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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/jobs/${params.jobId}/result`);
        const data = await res.json();
        if (!res.ok) {
          if (data.code === "AUTH_REQUIRED" || res.status === 401) {
            if (!cancelled) setShowAuthGate(true);
            throw new Error(data.error || "Authentication required");
          }
          throw new Error(data.error || "Failed to load result");
        }
        if (!cancelled) {
          setResult(data);
          if (data.questionResults?.[0]) setSelectedId(data.questionResults[0].question.id);
        }
        // fetch job for grace timer
        try {
          const jobRes = await fetch(`/api/jobs/${params.jobId}`);
          const jobData = await jobRes.json();
          if (jobRes.ok && jobData.job?.createdAt) {
            if (!cancelled) setJobCreatedAt(jobData.job.createdAt);
          }
        } catch {}
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [params.jobId]);

  // Guest grace timer — show AuthGate after 90s (configurable via env, default 90000)
  useEffect(() => {
    if (!result || !jobCreatedAt || showAuthGate) return;
    // Check if already authenticated — skip timer and try claim
    (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          // auto-claim guest result for authenticated user
          await fetch(`/api/jobs/${params.jobId}/claim`, { method: "POST" }).catch(() => {});
          return; // authenticated, no gate
        }
      } catch {
        // supabase not configured, fall through to guest timer
      }
      const GUEST_GRACE_MS = 90000; // should match GUEST_RESULT_GRACE_PERIOD_MS
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

  // Auto-claim when user signs in while viewing result
  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (data.user && !cancelled) {
          const res = await fetch(`/api/jobs/${params.jobId}/claim`, { method: "POST" });
          if (res.ok && !cancelled) {
            setShowAuthGate(false);
            setAuthGateDismissed(false);
          }
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [result, params.jobId]);

  // Real pages and PDF URL from job documents
  const [pages, setPages] = useState<any[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfMime, setPdfMime] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/jobs/${params.jobId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.pages && data.pages.length > 0) {
          // Filter to answer sheet pages
          const answerDocIds = (data.documents || []).filter((d: any) => d.kind === "answerSheet").map((d: any) => d.id);
          const answerPages = data.pages.filter((p: any) => answerDocIds.includes(p.documentId));
          if (answerPages.length > 0) {
            setPages(answerPages);
          } else {
            setPages(data.pages);
          }
        }
        // Build PDF URL from answerSheetFileId
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

  // Fallback: if pages still empty, derive from result
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

  const handleClaimAndReload = async () => {
    try {
      await fetch(`/api/jobs/${params.jobId}/claim`, { method: "POST" });
    } catch {}
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-[#F7F7F7] flex flex-col">
      {showAuthGate && !authGateDismissed && (
        <AuthGate
          jobId={params.jobId}
          onClose={() => setAuthGateDismissed(true)}
        />
      )}
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
          <ViewerShell pages={pages} highlights={highlights} activePageId={activePageId} selectedQuestionId={selectedId || undefined} pdfUrl={pdfUrl || undefined} mime={pdfMime || undefined} />
        </div>
      </div>
    </div>
  );
}
