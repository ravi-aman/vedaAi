"use client";
import React, { useCallback, useState } from "react";

export function UploadDropzone({
  title,
  description,
  icon,
  file,
  onFileSelect,
  onRemove,
  accept = ".pdf,.jpg,.jpeg,.png,.webp",
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  file: { name: string; size: number; pageCount?: number } | null;
  onFileSelect: (file: File) => void;
  onRemove: () => void;
  accept?: string;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

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
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (file) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4 shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-[#FFF1EB] flex items-center justify-center text-[#FF6B2C] shrink-0">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium text-gray-900 truncate">{file.name}</p>
          <p className="text-xs text-gray-500">
            {formatSize(file.size)} {file.pageCount ? `• ${file.pageCount} pages` : ""}
          </p>
        </div>
        <button
          onClick={onRemove}
          className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors"
          aria-label="Remove file"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`group relative bg-white rounded-2xl border-2 border-dashed p-8 flex flex-col items-center text-center cursor-pointer transition-all
        ${dragOver ? "border-[#FF6B2C] bg-[#FFF8F5]" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/50"}
      `}
    >
      <input ref={inputRef} type="file" accept={accept} onChange={handleChange} className="hidden" />
      <div className="w-14 h-14 rounded-2xl bg-[#FFF1EB] flex items-center justify-center text-[#FF6B2C] mb-4 group-hover:scale-105 transition-transform">
        {icon}
      </div>
      <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
      <p className="text-xs text-gray-500 mt-1 max-w-[220px]">{description}</p>
      <p className="text-xs font-medium text-[#FF6B2C] mt-3">Click or drag & drop</p>
      <p className="text-[11px] text-gray-400 mt-1">PDF or image • max 25MB</p>
    </div>
  );
}
