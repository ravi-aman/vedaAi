"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { UploadDropzone } from "@/components/upload/UploadDropzone";

type FileState = {
  file: File;
  name: string;
  size: number;
  pageCount?: number;
  fileId?: string;
  documentId?: string;
  uploading?: boolean;
  error?: string;
} | null;

export default function UploadPage() {
  const router = useRouter();
  const [qp, setQp] = useState<FileState>(null);
  const [as, setAs] = useState<FileState>(null);
  const [starting, setStarting] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);

  const uploadFile = async (f: File, kind: "questionPaper" | "answerSheet", setter: (s: FileState) => void) => {
    setter({ file: f, name: f.name, size: f.size, uploading: true });
    setJobError(null);
    try {
      // create job if not exists? We'll handle job creation lazily on Start Mapping
      // But we need jobId to upload ; we'll create on demand and store in state
      let jobId = (window as any).__vedaJobId;
      if (!jobId) {
        const res = await fetch("/api/jobs", { method: "POST" });
        if (!res.ok) throw new Error("Failed to create job");
        const data = await res.json();
        jobId = data.jobId;
        (window as any).__vedaJobId = jobId;
      }
      const form = new FormData();
      form.append("file", f);
      form.append("kind", kind);
      const res = await fetch(`/api/jobs/${jobId}/upload`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setter({
        file: f,
        name: f.name,
        size: f.size,
        pageCount: data.pageCount,
        fileId: data.fileId,
        documentId: data.documentId,
        uploading: false,
      });
    } catch (e: any) {
      setter({ file: f, name: f.name, size: f.size, error: e.message, uploading: false });
      setJobError(e.message);
    }
  };

  const handleRemove = (kind: "questionPaper" | "answerSheet") => {
    if (kind === "questionPaper") setQp(null);
    else setAs(null);
  };

  const canStart = qp && as && !qp.uploading && !as.uploading && !qp.error && !as.error;

  const handleStart = async () => {
    if (!canStart) return;
    setStarting(true);
    setJobError(null);
    const jobId = (window as any).__vedaJobId;
    if (!jobId) {
      setJobError("No job found, please re-upload");
      setStarting(false);
      return;
    }
    try {
      const res = await fetch(`/api/jobs/${jobId}/start`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");
      router.push(`/processing/${jobId}`);
    } catch (e: any) {
      setJobError(e.message);
      setStarting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F7] flex flex-col">
      {/* Header */}
      <header className="h-[56px] bg-white border-b border-gray-200 flex items-center px-4 sm:px-6 justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#FF6B2C] flex items-center justify-center text-white font-bold text-[13px]">V</div>
            <span className="font-semibold text-[16px] tracking-tight">VedaAI</span>
          </div>
          <nav className="hidden sm:flex items-center gap-6 text-sm">
            <span className="text-gray-900 font-medium border-b-2 border-[#FF6B2C] pb-[14px] mt-[14px]">Upload</span>
            <span className="text-gray-400">Results</span>
          </nav>
        </div>
        <div className="w-8 h-8 rounded-full bg-gray-100" />
      </header>

      <div className="flex flex-1">
        {/* Sidebar desktop */}
        <aside className="hidden lg:flex w-[200px] bg-white border-r border-gray-200 flex-col p-4 shrink-0">
          <nav className="flex flex-col gap-1">
            <a className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#FFF1EB] text-[#FF6B2C] text-sm font-medium">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
              Upload
            </a>
            <a className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-500 text-sm hover:bg-gray-50">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
              Results
            </a>
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 flex flex-col items-center px-4 sm:px-6 py-8 sm:py-10">
          <div className="w-full max-w-[760px]">
            <div className="text-center mb-8">
              <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight text-gray-900">Upload Question Paper & Answer Sheets</h1>
              <p className="text-sm text-gray-500 mt-2">Upload both files to get started</p>
            </div>

            {/* Illustration */}
            <div className="flex justify-center mb-8">
              <div className="w-[160px] h-[90px] bg-gradient-to-br from-[#FFF1EB] to-[#FFD8C2] rounded-2xl flex items-center justify-center">
                <svg width="80" height="48" viewBox="0 0 80 48" fill="none">
                  <rect x="10" y="8" width="28" height="32" rx="3" fill="white" stroke="#FF6B2C" strokeWidth="1.2" />
                  <rect x="42" y="8" width="28" height="32" rx="3" fill="white" stroke="#E5E7EB" strokeWidth="1.2" />
                  <path d="M18 20H30 M18 26H30 M18 32H26 M50 20H62 M50 26H62 M50 32H58" stroke="#D1D5DB" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 sm:gap-5">
              <UploadDropzone
                title="Upload Question Paper"
                description="PDF or image with printed questions"
                icon={
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                }
                file={qp ? { name: qp.name, size: qp.size, pageCount: qp.pageCount } : null}
                onFileSelect={(f) => uploadFile(f, "questionPaper", setQp)}
                onRemove={() => handleRemove("questionPaper")}
              />
              <UploadDropzone
                title="Upload Answer Sheet"
                description="PDF or image with handwritten answers"
                icon={
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
                }
                file={as ? { name: as.name, size: as.size, pageCount: as.pageCount } : null}
                onFileSelect={(f) => uploadFile(f, "answerSheet", setAs)}
                onRemove={() => handleRemove("answerSheet")}
              />
            </div>

            {(qp?.error || as?.error) && (
              <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                {qp?.error || as?.error}
              </div>
            )}
            {qp?.uploading || as?.uploading ? (
              <p className="text-center text-xs text-gray-500 mt-3">Uploading…</p>
            ) : null}
            {jobError && <p className="text-center text-xs text-red-600 mt-3">{jobError}</p>}

            <div className="flex justify-center mt-8">
              <Button
                onClick={handleStart}
                disabled={!canStart || starting}
                className="min-w-[180px] shadow-lg shadow-[#FF6B2C]/20"
                size="lg"
              >
                {starting ? "Starting…" : "Start Mapping →"}
              </Button>
            </div>
            {!canStart && !starting && (
              <p className="text-center text-xs text-gray-400 mt-3">Select both files to enable mapping</p>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
