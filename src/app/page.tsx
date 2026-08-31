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

  // Durable jobId: localStorage + window (survives refresh, Vercel multi-invocation, and HMR)
  const getStoredJobId = () => {
    try {
      const ls = typeof window !== "undefined" ? localStorage.getItem("vedaJobId") : null;
      return (window as any).__vedaJobId || ls || null;
    } catch { return (window as any).__vedaJobId || null; }
  };
  const setStoredJobId = (id: string) => {
    (window as any).__vedaJobId = id;
    try { localStorage.setItem("vedaJobId", id); } catch {}
    try { document.cookie = `vedaJobId=${id}; path=/; max-age=86400; SameSite=Lax`; } catch {}
  };
  const clearStoredJobId = () => {
    (window as any).__vedaJobId = null;
    try { localStorage.removeItem("vedaJobId"); } catch {}
    try { document.cookie = `vedaJobId=; path=/; max-age=0`; } catch {}
  };

  const uploadFile = async (f: File, kind: "questionPaper" | "answerSheet", setter: (s: FileState) => void) => {
    setter({ file: f, name: f.name, size: f.size, uploading: true });
    setJobError(null);

    // Direct S3 upload bypasses Vercel 4.5MB limit — used for >4MB files or when presign available
    const attemptDirectS3Upload = async (jobId: string): Promise<any> => {
      // 1. Get presigned PUT URL from server
      const presignRes = await fetch(`/api/jobs/${jobId}/presign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, fileName: f.name, contentType: f.type || "application/pdf", fileSize: f.size }),
      });
      const presignData: any = await presignRes.json().catch(() => ({}));
      if (!presignRes.ok) {
        const err: any = new Error(presignData.error || "Failed to get upload URL");
        err.code = presignData.code;
        err.status = presignRes.status;
        throw err;
      }
      const { presignedUrl, fileId, s3Key, bucket, requiredHeaders } = presignData;
      // 2. PUT directly to S3 (bypasses Vercel)
      const putRes = await fetch(presignedUrl, {
        method: "PUT",
        headers: requiredHeaders || { "Content-Type": f.type || "application/pdf" },
        body: f,
      });
      if (!putRes.ok) {
        const txt = await putRes.text().catch(() => "");
        throw new Error(`S3 upload failed ${putRes.status}: ${txt.slice(0, 200)}`);
      }
      // 3. Tell server to register file (server will fetch from S3 and inspect)
      const completeRes = await fetch(`/api/jobs/${jobId}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, fileId, s3Key, bucket, fileName: f.name, size: f.size }),
      });
      const completeData: any = await completeRes.json().catch(async () => {
        const txt = await completeRes.text().catch(() => "");
        // Handle non-JSON (e.g. 413 plain text)
        if (!completeRes.ok) throw new Error(txt.slice(0, 300) || "Upload failed");
        throw new Error(`Unexpected response: ${txt.slice(0, 200)}`);
      });
      if (!completeRes.ok) {
        const err: any = new Error(completeData.error || "Upload failed");
        err.code = completeData.code;
        err.status = completeRes.status;
        throw err;
      }
      return completeData;
    };

    const attemptProxyUpload = async (jobId: string): Promise<any> => {
      const form = new FormData();
      form.append("file", f);
      form.append("kind", kind);
      const res = await fetch(`/api/jobs/${jobId}/upload`, { method: "POST", body: form });
      // Handle Vercel 413 plain text (not JSON)
      const ct = res.headers.get("content-type") || "";
      let data: any;
      if (ct.includes("application/json")) {
        data = await res.json().catch(() => ({}));
      } else {
        const txt = await res.text().catch(() => "");
        if (!res.ok) {
          // Vercel returns "Request Entity Too Large" as text
          if (txt.includes("Request Entity") || res.status === 413) {
            throw new Error("File too large for direct upload (Vercel 4.5MB limit) — retrying via S3...");
          }
          throw new Error(txt.slice(0, 300) || "Upload failed");
        }
        data = await (async () => { try { return JSON.parse(txt); } catch { return {}; } })();
      }
      if (!res.ok) {
        const err: any = new Error(data.error || "Upload failed");
        err.code = data.code;
        err.status = res.status;
        throw err;
      }
      return data;
    };

    const attemptUpload = async (jobId: string): Promise<any> => {
      // Use direct S3 for >4MB (Vercel limit) or if file is large
      const useDirect = f.size > 4 * 1024 * 1024;
      if (useDirect) {
        try {
          return await attemptDirectS3Upload(jobId);
        } catch (e: any) {
          // If direct fails due to S3 not configured, fallback to proxy for small files
          if (e.code === "CONFIGURATION_ERROR" || String(e.message).includes("S3 upload failed") || String(e.message).includes("Request Entity")) {
            console.warn(`[upload] direct S3 failed for ${f.name}, falling back to proxy:`, e.message);
            // For large files proxy will still fail, so rethrow with helpful msg
            if (f.size > 4 * 1024 * 1024) throw new Error(`File ${ (f.size/1024/1024).toFixed(1)}MB too large for Vercel — S3 direct upload failed: ${e.message}. Check AWS_S3_BUCKET and S3 CORS.`);
          }
          throw e;
        }
      }
      // For small files, try proxy first, on 413 fallback to direct
      try {
        return await attemptProxyUpload(jobId);
      } catch (e: any) {
        if (String(e.message).includes("Request Entity") || e.status === 413) {
          console.warn(`[upload] proxy 413, retrying direct S3 for ${f.name}`);
          return await attemptDirectS3Upload(jobId);
        }
        throw e;
      }
    };
    try {
      let jobId = getStoredJobId();
      if (!jobId) {
        const res = await fetch("/api/jobs", { method: "POST" });
        const j: any = await res.json().catch(()=>({}));
        if (!res.ok) throw new Error(j.error || "Failed to create job");
        jobId = j.jobId;
        setStoredJobId(jobId);
      }
      try {
        const data = await attemptUpload(jobId);
        setter({ file: f, name: f.name, size: f.size, pageCount: data.pageCount, fileId: data.fileId, documentId: data.documentId, uploading: false });
      } catch (e: any) {
        // Old jobId from before durable migration or Vercel cold start -> 404 JOB_NOT_FOUND -> auto-recover with fresh job (once)
        if (e.code === "JOB_NOT_FOUND" && e.status === 404) {
          clearStoredJobId();
          const res = await fetch("/api/jobs", { method: "POST" });
          const j: any = await res.json().catch(()=>({}));
          if (!res.ok) throw new Error(j.error || "Failed to create job");
          const newId = j.jobId;
          setStoredJobId(newId);
          const data = await attemptUpload(newId);
          setter({ file: f, name: f.name, size: f.size, pageCount: data.pageCount, fileId: data.fileId, documentId: data.documentId, uploading: false });
          return;
        }
        throw e;
      }
    } catch (e: any) {
      const msg = e.code === "CONFIGURATION_ERROR" || String(e.message).includes("CONFIGURATION_ERROR")
        ? "Server not configured — set SUPABASE_SERVICE_ROLE_KEY in Vercel and redeploy"
        : e.message;
      setter({ file: f, name: f.name, size: f.size, error: msg, uploading: false });
      setJobError(msg);
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
    const jobId = getStoredJobId();
    if (!jobId) {
      setJobError("No job found, please re-upload");
      setStarting(false);
      return;
    }
    try {
      const res = await fetch(`/api/jobs/${jobId}/start`, { method: "POST" });
      const data: any = await res.json().catch(()=>({}));
      if (!res.ok) {
        if (data.code === "JOB_NOT_FOUND") {
          clearStoredJobId();
          throw new Error("Job expired — please re-upload both files");
        }
        if (data.code === "CONFIGURATION_ERROR" || String(data.error).includes("CONFIGURATION_ERROR")) {
          throw new Error("Server not configured — set SUPABASE_SERVICE_ROLE_KEY in Vercel");
        }
        // Stale job from before durable fix — job has only 1 file on server
        if (data.code === "VALIDATION_FAILED" || String(data.error).includes("Both files required")) {
          clearStoredJobId();
          throw new Error("Session expired — files not linked to server. Please clear and re-upload both files (Ctrl+Shift+R, then upload again)");
        }
        throw new Error(data.error || "Failed to start");
      }
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
