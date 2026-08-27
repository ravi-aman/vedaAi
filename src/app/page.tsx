"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopHeader } from "@/components/layout/TopHeader";
import { UploadCard, UploadAvatar } from "@/components/upload/UploadCard";

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Responsive default: on <1024 collapsed, on >=1024 expanded for upload
  useEffect(() => {
    const check = () => {
      if (window.innerWidth < 1024) setSidebarCollapsed(true);
      else setSidebarCollapsed(false);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const handleSidebarToggle = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileOpen(true);
    } else {
      setSidebarCollapsed((v) => !v);
    }
  };

  const uploadFile = async (f: File, kind: "questionPaper" | "answerSheet", setter: (s: FileState) => void) => {
    setter({ file: f, name: f.name, size: f.size, uploading: true });
    setJobError(null);
    try {
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
    <div className="h-[100dvh] h-screen bg-[#EDEEF0] flex p-0 md:p-3 gap-0 md:gap-3 overflow-hidden">
      <Sidebar collapsed={sidebarCollapsed} onToggle={handleSidebarToggle} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

      <div className="flex flex-1 flex-col min-w-0 gap-0 md:gap-3 min-h-0 overflow-hidden">
        <TopHeader onMenuClick={() => setMobileOpen(true)} mobileDrawerOpen={mobileOpen} />

        <main className="flex-1 flex flex-col items-center px-4 md:px-6 py-6 md:py-8 overflow-auto bg-transparent min-h-0">
          <div className="w-full max-w-[820px] flex flex-col items-center">
            {/* Heading — single line on all breakpoints */}
            <h1 className="text-center font-bold tracking-tight leading-tight text-[#0A0A0A] whitespace-nowrap text-[15px] sm:text-[19px] md:text-[26px] lg:text-[30px]">
              <span className="inline">Upload </span>
              <span className="inline-block bg-[#FDE3D8] md:bg-[rgba(241,80,47,0.12)] px-2 py-0.5 rounded-[8px] text-[#0A0A0A] md:text-[#F1502F]">
                Question Paper & Answer Sheets
              </span>
            </h1>
            <p className="text-[13px] md:text-[14px] text-[#8A8A8E] mt-2 text-center">Upload both files to get started</p>

            {/* Avatar */}
            <div className="mt-6 flex justify-center">
              <UploadAvatar />
            </div>

            {/* Upload cards */}
            <div className="w-full mt-6 md:mt-8 grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-5">
              <UploadCard
                kind="questionPaper"
                title="Upload Question Paper"
                accentWord="Question Paper"
                file={qp ? { name: qp.name, size: qp.size, pageCount: qp.pageCount } : null}
                uploading={!!qp?.uploading}
                onFileSelect={(f) => uploadFile(f, "questionPaper", setQp)}
                onRemove={() => handleRemove("questionPaper")}
              />
              <UploadCard
                kind="answerSheet"
                title="Upload Answer Sheet"
                accentWord="Answer Sheet"
                file={as ? { name: as.name, size: as.size, pageCount: as.pageCount } : null}
                uploading={!!as?.uploading}
                onFileSelect={(f) => uploadFile(f, "answerSheet", setAs)}
                onRemove={() => handleRemove("answerSheet")}
              />
            </div>

            {(qp?.error || as?.error) && (
              <div className="w-full mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{qp?.error || as?.error}</div>
            )}
            {jobError && <p className="text-center text-xs text-red-600 mt-3">{jobError}</p>}

            {/* Start Mapping */}
            <div className="mt-6 flex flex-col items-center">
              <button
                onClick={handleStart}
                disabled={!canStart || starting}
                className={`h-[44px] px-7 rounded-full text-[14px] font-medium flex items-center gap-1.5 transition-all duration-150
                  ${canStart && !starting
                    ? "bg-[#0A0A0A] text-white hover:bg-black active:scale-[0.97] shadow-sm animate-pop"
                    : "bg-[#D9D9DC] text-[#9A9A9E] cursor-not-allowed"
                  }`}
                style={{ transition: "background-color 150ms ease, color 150ms ease, transform 100ms ease" }}
              >
                {starting ? "Starting…" : "Start Mapping →"}
              </button>
              <p className="text-[11px] text-[#8A8A8E] mt-2.5 text-center">Once both files are uploaded, you&apos;ll be able to map answers with questions</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
