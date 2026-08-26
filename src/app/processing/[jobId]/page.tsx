"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const STAGES: { key: string; label: string }[] = [
  { key: "VALIDATING", label: "Validating files" },
  { key: "PREPROCESSING", label: "Preparing documents" },
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

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    let abort: AbortController | null = null;
    let terminal = false;
    async function poll() {
      if (terminal || cancelled) return;
      // avoid overlapping requests
      if (abort) return;
      abort = new AbortController();
      const timeout = setTimeout(() => abort!.abort(), 8000);
      try {
        const res = await fetch(`/api/jobs/${params.jobId}`, { signal: abort.signal, cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          // 404 after restart = job lost (in-memory store); surface clearly and stop polling
          if (res.status === 404) {
            if (!cancelled) setError((data as any).error || "Job not found — server restarted and in-memory job was lost. Please re-upload.");
            terminal = true;
            if (interval) clearInterval(interval);
            return;
          }
          throw new Error((data as any).error || `Failed to fetch (${res.status})`);
        }
        if (cancelled) return;
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

  const getStatus = (key: string) => {
    if (!job) return "pending";
    const s = job.progress?.stageStates?.[key];
    if (s) return s;
    // derive: if currentStage beyond this stage -> completed?
    const order = STAGES.map((s) => s.key);
    const curIdx = order.indexOf(job.currentStage);
    const idx = order.indexOf(key);
    if (job.status === "COMPLETED") return "completed";
    if (curIdx > idx) return "completed";
    if (job.currentStage === key) return job.status === "FAILED" ? "failed" : "in_progress";
    return "pending";
  };

  return (
    <div className="min-h-screen bg-[#F7F7F7] flex flex-col">
      <header className="h-[56px] bg-white border-b border-gray-200 flex items-center px-6 justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#FF6B2C] flex items-center justify-center text-white font-bold text-[13px]">V</div>
          <span className="font-semibold">VedaAI</span>
        </div>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-[440px] bg-white rounded-2xl border border-gray-200 p-8 shadow-sm text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#FFF1EB] flex items-center justify-center text-[#FF6B2C] mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="animate-pulse">
              <path d="M12 2l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold">Extracting…</h1>
          <p className="text-sm text-gray-500 mt-1">This may take a while</p>

          <div className="mt-6 text-left space-y-2">
            {STAGES.map((s) => {
              const st = getStatus(s.key);
              return (
                <div key={s.key} className="flex items-center gap-3 text-sm">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0
                    ${st === "completed" ? "bg-emerald-100 text-emerald-700" : st === "in_progress" ? "bg-[#FFF1EB] text-[#FF6B2C] border border-[#FF6B2C]" : st === "failed" ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-400"}`}
                  >
                    {st === "completed" ? "✓" : st === "in_progress" ? "•" : st === "failed" ? "✕" : "○"}
                  </div>
                  <span className={st === "completed" ? "text-gray-700" : st === "in_progress" ? "text-gray-900 font-medium" : "text-gray-400"}>
                    {s.label}
                  </span>
                  {st === "in_progress" && <span className="ml-auto w-4 h-4 border-2 border-[#FF6B2C] border-t-transparent rounded-full animate-spin" />}
                </div>
              );
            })}
          </div>

          {error && (
            <div className="mt-6 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 text-left">
              <p className="font-medium">Processing failed</p>
              <p className="text-xs mt-1">{error}</p>
              <p className="text-xs mt-1 text-gray-500">Job: {params.jobId}</p>
            </div>
          )}

          {job && <p className="text-[11px] text-gray-400 mt-6">Job {job.id.slice(0, 8)} • {job.currentStage}</p>}
        </div>
      </main>
    </div>
  );
}
