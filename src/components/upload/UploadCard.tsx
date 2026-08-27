"use client";
import React, { useRef, useState, useCallback } from "react";

type UploadCardProps = {
  kind: "questionPaper" | "answerSheet";
  title: string;
  accentWord: string;
  file: { name: string; size: number; pageCount?: number } | null;
  onFileSelect: (file: File) => void;
  onRemove: () => void;
  uploading?: boolean;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb % 1 === 0 ? kb.toFixed(0) : kb.toFixed(1)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  // Show integer MB if close to integer, else one decimal, no space per spec example "2MB"
  if (Math.abs(mb - Math.round(mb)) < 0.05) return `${Math.round(mb)}MB`;
  return `${mb.toFixed(1)}MB`;
}

export function UploadCard({ kind, title, accentWord, file, onFileSelect, onRemove, uploading }: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) onFileSelect(f);
    },
    [onFileSelect]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFileSelect(f);
    // reset so same file can be re-selected after remove
    e.target.value = "";
  };

  // File present — filled state exactly like Figma image: dashed outer + inner light-gray pill
  if (file) {
    return (
      <div
        className="relative bg-white rounded-[16px] border-[1.5px] border-dashed border-[#ECECEE] p-3 min-h-[110px] transition-all duration-200"
        style={{ animation: "fade-in 200ms ease-out", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)" }}
      >
        {/* Remove button — dark circle as in Figma */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove file"
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#0A0A0A] hover:bg-black border-2 border-white shadow-sm flex items-center justify-center text-white transition-colors z-10"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Inner light-gray pill with file info */}
        <div className="bg-[#F7F7F8] rounded-[12px] p-3 flex items-center gap-3 h-full min-h-[88px]">
          <div className="w-9 h-9 rounded-[8px] bg-[#FFE9E5] border border-[#FFD5CE] flex items-center justify-center shrink-0">
            <span className="text-[9px] font-black text-[#FF3B30] leading-none">PDF</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#0A0A0A] truncate leading-tight">{file.name}</p>
            <p className="text-[11px] text-[#8A8A8E] mt-0.5">
              {formatSize(file.size)} {file.pageCount ? `• ${file.pageCount} Pages` : ""}
              {uploading ? " • Uploading…" : ""}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Empty dropzone
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      className={`relative bg-white rounded-[16px] border-[1.5px] border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-all min-h-[110px] lg:min-h-[120px] p-5
        ${dragOver ? "border-[#F1502F] bg-[#FFF8F5] scale-[0.98]" : "border-[#D9D9DC] hover:border-[#C8C8CC] hover:bg-[#FAFAFA]"}
      `}
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
    >
      <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleChange} className="hidden" />

      {/* Icon box */}
      <div className="w-9 h-9 rounded-[8px] bg-[#F2F2F3] flex items-center justify-center text-[#6B6B70] mb-2.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 16V4M8 8l4-4 4 4" />
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      </div>

      <p className="text-[14px] font-semibold text-[#111111] leading-none">
        {title.split(accentWord)[0]}
        <span className="text-[#F1502F]">{accentWord}</span>
        {title.split(accentWord)[1] ?? ""}
      </p>
      <p className="text-[11px] text-[#8A8A8E] mt-1">Max 10MB</p>
    </div>
  );
}

/** Decorative avatar with peach ring + 4 dots — enlarged per request */
export function UploadAvatar() {
  return (
    <div className="relative w-[112px] h-[112px] md:w-[132px] md:h-[132px] lg:w-[148px] lg:h-[148px] flex items-center justify-center">
      {/* outer peach ring */}
      <div className="absolute inset-0 rounded-full bg-[#FDE3D8]/70" />
      <div className="absolute inset-[8px] md:inset-[9px] rounded-full bg-white shadow-sm overflow-hidden border border-white">
        <img
          src="/lady.png"
          alt=""
          className="w-full h-full object-cover object-top scale-[1.02]"
        />
      </div>
      {/* 4 decorative dots around ring */}
      <span className="absolute w-2.5 h-2.5 rounded-full bg-[#F1502F]" style={{ top: "6%", right: "20%" }} />
      <span className="absolute w-2.5 h-2.5 rounded-full bg-[#F1502F]/80" style={{ top: "38%", right: "1%" }} />
      <span className="absolute w-2 h-2 rounded-full bg-[#F1502F]/70" style={{ bottom: "13%", left: "13%" }} />
      <span className="absolute w-2 h-2 rounded-full bg-[#F1502F]/60" style={{ top: "44%", left: "0.5%" }} />
    </div>
  );
}
