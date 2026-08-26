import React from "react";

export function Card({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm ${className}`} {...props}>
      {children}
    </div>
  );
}

export function Badge({ children, variant = "default", className = "" }: { children: React.ReactNode; variant?: "default" | "success" | "warning" | "danger" | "neutral"; className?: string }) {
  const variants: Record<string, string> = {
    default: "bg-gray-100 text-gray-700",
    success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border border-amber-200",
    danger: "bg-red-50 text-red-700 border border-red-200",
    neutral: "bg-gray-50 text-gray-600 border border-gray-200",
  };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`}>{children}</span>;
}
