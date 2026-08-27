"use client";
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (mounted) setUser(data.user ?? null);
        const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
          if (mounted) setUser(session?.user ?? null);
        });
        return () => sub.subscription.unsubscribe();
      } catch {
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);
  return { user, loading };
}

export function TopHeader({
  onMenuClick,
  mobileDrawerOpen,
}: {
  onMenuClick?: () => void;
  mobileDrawerOpen?: boolean;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) && profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setDropdownOpen(false); };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [dropdownOpen]);

  const handleSignIn = () => { router.push("/auth/login"); };
  const handleLogout = async () => {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {}
    setDropdownOpen(false);
    router.push("/auth/login");
  };

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Madhur Rastogi";
  const displayEmail = user?.email || "madhur@vedaai.example";
  const avatarUrl = user?.user_metadata?.avatar_url || "https://i.pravatar.cc/100?img=12";

  return (
    <>
      {/* Desktop floating pill — hidden on mobile */}
      <header className="hidden md:flex h-[56px] card-shell items-center justify-between shrink-0 px-[20px]" style={{ borderRadius: 18 }}>
        {/* Left */}
        <div className="flex items-center gap-3">
          <button aria-label="Back" className="w-8 h-8 rounded-full flex items-center justify-center text-[#0A0A0A] hover:bg-[#F5F5F6] transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <span className="flex items-center gap-1.5 text-[14px] text-[#8A8A8E]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-[#8A8A8E]"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            Exams
          </span>
        </div>

        {/* Right */}
        <div className="flex items-center gap-[12px]">
          <button aria-label="Help" className="w-8 h-8 rounded-full border border-[#ECECEE] flex items-center justify-center text-[#0A0A0A] hover:bg-[#F7F7F8] transition-colors text-[14px] font-medium">?</button>

          <button aria-label="Notifications" className="w-8 h-8 rounded-full border border-[#ECECEE] flex items-center justify-center text-[#0A0A0A] hover:bg-[#F7F7F8] transition-colors relative">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M18 8A6 6 0 0 0 6 8c0 7-6 9-6 9h18s-6-2-6-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            <span className="absolute -top-0.5 -right-0.5 w-[6px] h-[6px] bg-[#FF3B30] rounded-full border border-white" />
          </button>

          <button aria-label="Create" className="w-8 h-8 rounded-full border border-[#ECECEE] flex items-center justify-center text-[#0A0A0A] hover:bg-[#F7F7F8] transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
          </button>

          <span className="w-px h-5 bg-[#E5E5E7] mx-1" />

          {/* Profile control auth-aware */}
          {user ? (
            <div className="relative">
              <button
                ref={profileRef}
                onClick={() => setDropdownOpen((v) => !v)}
                className="flex items-center gap-2 py-1 px-2 rounded-full hover:bg-[#F7F7F8] transition-colors"
                aria-haspopup="menu"
                aria-expanded={dropdownOpen}
              >
                <img src={avatarUrl} alt={displayName} className="w-8 h-8 rounded-full object-cover border border-[#ECECEE]" />
                <span className="text-[14px] font-medium text-[#0A0A0A] whitespace-nowrap hidden md:inline">{displayName}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-[#8A8A8E]"><path d="M6 9l6 6 6-6" /></svg>
              </button>

              {dropdownOpen && (
                <div ref={dropdownRef} className="absolute right-0 top-[calc(100%+8px)] w-[220px] bg-white rounded-[12px] p-2 dropdown-enter" style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.12)", border: "1px solid rgba(0,0,0,0.06)" }} role="menu">
                  <div className="flex items-center gap-3 p-3 border-b border-[#ECECEE] mb-2">
                    <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                    <div className="min-w-0"><p className="text-[13px] font-semibold text-[#0A0A0A] truncate">{displayName}</p><p className="text-[11px] text-[#8A8A8E] truncate">{displayEmail}</p></div>
                  </div>
                  <button role="menuitem" onClick={() => setDropdownOpen(false)} className="w-full flex items-center gap-3 h-10 px-3 rounded-[8px] text-[14px] text-[#0A0A0A] hover:bg-[#F5F5F6] text-left transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-[#8A8A8E]"><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></svg>
                    My Profile
                  </button>
                  <button role="menuitem" onClick={() => setDropdownOpen(false)} className="w-full flex items-center gap-3 h-10 px-3 rounded-[8px] text-[14px] text-[#0A0A0A] hover:bg-[#F5F5F6] text-left transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-[#8A8A8E]"><circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
                    Account Settings
                  </button>
                  <button role="menuitem" onClick={() => setDropdownOpen(false)} className="w-full flex items-center gap-3 h-10 px-3 rounded-[8px] text-[14px] text-[#0A0A0A] hover:bg-[#F5F5F6] text-left transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-[#8A8A8E]"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                    Switch School
                  </button>
                  <button role="menuitem" onClick={() => setDropdownOpen(false)} className="w-full flex items-center gap-3 h-10 px-3 rounded-[8px] text-[14px] text-[#0A0A0A] hover:bg-[#F5F5F6] text-left transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-[#8A8A8E]"><circle cx="12" cy="12" r="10" /><path d="M9 9a3 3 0 1 1 5.1 2.2c-.7.8-1.1 1.5-1.1 2.8" /><path d="M12 17h.01" /></svg>
                    Help & Support
                  </button>
                  <div className="h-px bg-[#ECECEE] my-2" />
                  <button role="menuitem" onClick={handleLogout} className="w-full flex items-center gap-3 h-10 px-3 rounded-[8px] text-[14px] text-[#FF3B30] hover:bg-[#FFF1F0] text-left transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                    Log Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button onClick={handleSignIn} className="h-9 px-4 rounded-full bg-[#0A0A0A] text-white text-[14px] font-medium hover:bg-black transition-colors">Sign In</button>
          )}
        </div>
      </header>

      {/* Mobile flush bar — visible only <768 */}
      <header className="flex md:hidden h-[56px] bg-white border-b border-[#ECECEE] items-center justify-between shrink-0 px-4">
        <div className="flex items-center gap-2">
          <button aria-label="Back" className="w-8 h-8 flex items-center justify-center text-[#0A0A0A]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex items-center gap-1.5">
            <div className="w-7 h-7 rounded-[6px] bg-[#0A0A0A] flex items-center justify-center text-white font-extrabold text-[12px]">V</div>
            <span className="font-bold text-[15px] tracking-tight text-[#0A0A0A]">VedaAI</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button aria-label="Notifications" className="w-8 h-8 rounded-full flex items-center justify-center text-[#0A0A0A] relative">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M18 8A6 6 0 0 0 6 8c0 7-6 9-6 9h18s-6-2-6-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            <span className="absolute top-1 right-1 w-2 h-2 bg-[#FF3B30] rounded-full border border-white" />
          </button>
          <button onClick={onMenuClick} aria-label={mobileDrawerOpen ? "Close menu" : "Open menu"} className="w-8 h-8 flex items-center justify-center text-[#0A0A0A]">
            <span className="relative w-[18px] h-[14px] flex flex-col justify-between">
              <span className={`block h-[2px] bg-current rounded-full transition-all duration-200 ${mobileDrawerOpen ? "rotate-45 translate-y-[6px]" : ""}`} />
              <span className={`block h-[2px] bg-current rounded-full transition-all duration-200 ${mobileDrawerOpen ? "opacity-0" : "opacity-100"}`} />
              <span className={`block h-[2px] bg-current rounded-full transition-all duration-200 ${mobileDrawerOpen ? "-rotate-45 -translate-y-[6px]" : ""}`} />
            </span>
          </button>
        </div>
      </header>
    </>
  );
}
