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

  // File present — show filled card
  if (file) {
    return (
      <div
        className="relative bg-white rounded-[16px] border border-[#E5E5E5] shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-4 flex items-center gap-3 min-h-[110px] transition-all duration-200"
        style={{ animation: "fade-in 200ms ease-out" }}
      >
        {/* Remove button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove file"
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#F2F2F3] hover:bg-[#E5E5E5] flex items-center justify-center text-[#111111] transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Red PDF chip */}
        <div className="w-9 h-9 rounded-[8px] bg-[#FDE3D8] border border-[#F1502F]/20 flex items-center justify-center shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#F1502F">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="#F1502F" />
            <path d="M14 2v6h6" fill="#FFFFFF" opacity="0.85" />
            <text x="12" y="17" textAnchor="middle" fontSize="6" fontWeight="700" fill="white">PDF</text>
          </svg>
        </div>

        <div className="flex-1 min-w-0 pr-6">
          <p className="text-[13px] font-medium text-[#111111] truncate leading-tight">{file.name}</p>
          <p className="text-[12px] text-[#8A8A8E] mt-0.5">
            {formatSize(file.size)} {file.pageCount ? `• ${file.pageCount} Pages` : ""}
            {uploading ? " • Uploading…" : ""}
          </p>
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

/** Decorative avatar with peach ring + 4 dots — pure presentational */
export function UploadAvatar() {
  return (
    <div className="relative w-[80px] h-[80px] lg:w-[88px] lg:h-[88px] flex items-center justify-center">
      {/* outer peach ring */}
      <div className="absolute inset-0 rounded-full bg-[#FDE3D8]/70" />
      <div className="absolute inset-[7px] rounded-full bg-white shadow-sm overflow-hidden border border-white">
        <img
          src="https://i.pravatar.cc/200?img=32"
          alt=""
          className="w-full h-full object-cover"
        />
      </div>
      {/* 4 decorative dots around ring */}
      <span className="absolute w-2 h-2 rounded-full bg-[#F1502F]" style={{ top: "6%", right: "22%" }} />
      <span className="absolute w-2 h-2 rounded-full bg-[#F1502F]/80" style={{ top: "38%", right: "2%" }} />
      <span className="absolute w-1.5 h-1.5 rounded-full bg-[#F1502F]/70" style={{ bottom: "14%", left: "14%" }} />
      <span className="absolute w-1.5 h-1.5 rounded-full bg-[#F1502F]/60" style={{ top: "44%", left: "2%" }} />
    </div>
  );
}
