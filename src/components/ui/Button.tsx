import React from "react";

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
}) {
  const base =
    "inline-flex items-center justify-center font-medium rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    primary: "bg-[#FF6B2C] text-white hover:bg-[#E85F26] focus:ring-[#FF6B2C] shadow-sm",
    secondary: "bg-white border border-gray-200 text-gray-900 hover:bg-gray-50",
    ghost: "bg-transparent text-gray-600 hover:bg-gray-100",
  };
  const sizes: Record<string, string> = {
    sm: "h-9 px-4 text-sm",
    md: "h-11 px-6 text-[14px]",
    lg: "h-[48px] px-8 text-[15px]",
  };
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} disabled={disabled} {...props}>
      {children}
    </button>
  );
}

export function IconButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition-colors ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
