"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopHeader } from "@/components/layout/TopHeader";
import { ExtractingScreen } from "@/components/extracting/ExtractingScreen";

const STAGES: { key: string; label: string }[] = [
  { key: "VALIDATING", label: "Validating files" },
  { key: "PREPROCESSING", label: "Preparing documents" },
  { key: "OCR_SUBMITTED", label: "OCR processing" },
  { key: "OCR_PROCESSING", label: "Reading answer sheet" },
  { key: "EXTRACTING", label: "Extracting structure" },
  { key: "STRUCTURING", label: "Detecting answers" },
  { key: "MATCHING", label: "Mapping answers" },
  { key: "LOCALIZING", label: "Preparing highlights" },
  { key: "VALIDATING_RESULT", label: "Final validation" },
];

export default function ProcessingPage() {
  const params = useParams() as { jobId: string };
  const router = useRouter();
  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const handleSidebarToggle = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileOpen(true);
    } else {
      setSidebarCollapsed((v) => !v);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    let abort: AbortController | null = null;
    let terminal = false;
    async function poll() {
      if (terminal || cancelled) return;
      if (abort) return;
      abort = new AbortController();
      const timeout = setTimeout(() => abort!.abort(), 8000);
      try {
        const res = await fetch(`/api/jobs/${params.jobId}`, { signal: abort.signal, cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 404) {
            if (!cancelled) setError((data as any).error || "Job not found — server restarted and in-memory job was lost. Please re-upload.");
            terminal = true;
            if (interval) clearInterval(interval);
            return;
          }
          throw new Error((data as any).error || `Failed to fetch (${res.status})`);
        }
        if (cancelled) return;
        if (!data.job) {
          throw new Error("Job data unavailable — server may have restarted. Please re-upload.");
        }
        setJob(data.job);
        if (data.job.status === "COMPLETED") {
          terminal = true;
          if (interval) clearInterval(interval);
          router.push(`/results/${params.jobId}`);
        } else if (data.job.status === "FAILED") {
          terminal = true;
          if (interval) clearInterval(interval);
          setError(data.job.error?.message || "Processing failed");
        }
      } catch (e: any) {
        if (e.name === "AbortError") return;
        if (!cancelled && !terminal) setError(e.message);
      } finally {
        clearTimeout(timeout);
        abort = null;
      }
    }
    poll();
    interval = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      terminal = true;
      if (interval) clearInterval(interval);
      try { abort?.abort(); } catch {}
    };
  }, [params.jobId, router]);

  return (
    <div className="h-[100dvh] h-screen bg-[#EDEEF0] flex p-0 md:p-3 gap-0 md:gap-3 overflow-hidden">
      <Sidebar collapsed={sidebarCollapsed} onToggle={handleSidebarToggle} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

      <div className="flex flex-1 flex-col min-w-0 gap-0 md:gap-3 min-h-0 overflow-hidden">
        <TopHeader onMenuClick={() => setMobileOpen(true)} mobileDrawerOpen={mobileOpen} />

        <main className="flex-1 flex flex-col min-h-0 card-shell md:rounded-[24px] rounded-none overflow-hidden fade-in">
          <ExtractingScreen />

          {error && (
            <div className="mx-auto w-full max-w-[520px] px-4 pb-6">
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 text-left">
                <p className="font-medium">Processing failed</p>
                <p className="text-xs mt-1">{error}</p>
                <p className="text-xs mt-1 text-gray-500">Job: {params.jobId}</p>
              </div>
            </div>
          )}

          {job && !error && (
            <div className="hidden">
              <p className="text-[11px] text-gray-400 text-center pb-4">Job {job.id.slice(0, 8)} • {job.currentStage}</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
