"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/* Icons — 20px, stroke 1.8, minimal */
function IconGrid(props: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={props.className}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function IconMonitor(props: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={props.className}>
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <path d="M8 20h8M12 14v6" />
    </svg>
  );
}
function IconDoc(props: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={props.className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  );
}
function IconClipboard(props: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={props.className}>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M9 12h6M9 16h6" />
    </svg>
  );
}
function IconClock(props: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={props.className}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function IconGear(props: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={props.className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}
function IconPanel(props: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={props.className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

const NAV = [
  { id: "home", label: "Home", icon: IconGrid },
  { id: "classroom", label: "My Classroom", icon: IconMonitor },
  { id: "assignments", label: "Assignments", icon: IconDoc },
  { id: "exams", label: "Exams", icon: IconClipboard },
  { id: "library", label: "My Library", icon: IconClock },
] as const;

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

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
  activeId = "exams",
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  activeId?: string;
}) {
  const router = useRouter();
  const { user } = useAuth();

  // For tablet overlay detection: we render rail always, plus overlay when expanded on md
  // The parent controls collapsed; on md (768-1023) expanded should overlay.
  // We handle via CSS: overlay drawer absolutely positioned when !collapsed on md.
  return (
    <>
      {/* Desktop + Tablet persistent rail/collapsed/expanded — hidden on mobile (<768), fixed max-height of screen */}
      <aside
        className="hidden md:flex flex-col shrink-0 card-shell sidebar-anim overflow-hidden sticky top-4 self-start h-[calc(100vh-32px)] h-[calc(100dvh-32px)] max-h-[calc(100vh-32px)] max-h-[calc(100dvh-32px)]"
        style={{
          width: collapsed ? "76px" : "264px",
          borderRadius: "24px",
        }}
        aria-label="Sidebar"
      >
        {/* Logo row — collapsed: V logo centered only; expanded: logo + wordmark + toggle */}
        {collapsed ? (
          <div className="flex items-center justify-center h-[56px] shrink-0 px-[12px]">
            <div className="w-8 h-8 rounded-[10px] bg-[#0A0A0A] flex items-center justify-center text-white font-extrabold text-[14px] shrink-0">
              V
            </div>
          </div>
        ) : (
          <div className="flex items-center h-[56px] shrink-0 px-[20px] justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-[10px] bg-[#0A0A0A] flex items-center justify-center text-white font-extrabold text-[14px] shrink-0">
                V
              </div>
              <span
                className="font-semibold text-[18px] tracking-tight text-[#0A0A0A] whitespace-nowrap overflow-hidden sidebar-label-expand"
                style={{
                  opacity: 1,
                  transform: "translateX(0)",
                  transition: "opacity 150ms ease 80ms, transform 150ms ease 80ms",
                }}
              >
                VedaAI
              </span>
            </div>
            <button
              onClick={onToggle}
              aria-label="Collapse sidebar"
              className="w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0 transition-colors border border-transparent hover:bg-[#F5F5F6] bg-transparent text-[#0A0A0A]"
            >
              <IconPanel className="text-[#8A8A8E]" />
            </button>
          </div>
        )}

        {/* AI Teacher's Toolkit — expanded: full pill; collapsed: circular icon with orange ring */}
        {collapsed ? (
          <div className="flex justify-center px-[12px] pb-3">
            <button
              aria-label="AI Teacher's Toolkit"
              onClick={() => router.push("/")}
              className="w-10 h-10 rounded-full bg-[#0A0A0A] border-[2px] border-[#FF5A36] flex items-center justify-center text-white hover:bg-black transition-colors shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="px-[20px]">
            <button
              onClick={() => router.push("/")}
              className="w-full h-[44px] rounded-full bg-[#0A0A0A] text-white text-[14px] font-medium flex items-center justify-center gap-2 hover:bg-black transition-colors active:scale-[0.97] duration-100"
              style={{ marginBottom: 24 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              AI Teacher&apos;s Toolkit
            </button>
          </div>
        )}

        {/* Nav list — icon column fixed so icons don't jump */}
        <nav className={`flex flex-col gap-[4px] ${collapsed ? "items-center px-[12px]" : "px-[20px]"}`}>
          {NAV.map((item) => {
            const isActive = item.id === activeId;
            const Icon = item.icon;
            if (collapsed) {
              return (
                <div key={item.id} className="relative group">
                  <button
                    aria-label={item.label}
                    aria-current={isActive ? "page" : undefined}
                    className={`w-11 h-11 rounded-[12px] flex items-center justify-center transition-colors ${isActive ? "bg-[#F2F3F5] text-[#0A0A0A]" : "text-[#8A8A8E] hover:bg-[#F7F7F8] hover:text-[#0A0A0A]"}`}
                  >
                    <Icon className="shrink-0" />
                  </button>
                  <div className="sidebar-tooltip">{item.label}</div>
                </div>
              );
            }
            // expanded: fixed icon column 20 + gap 12
            return (
              <a
                key={item.id}
                href={item.id === "exams" ? "/" : "#"}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-[12px] h-[44px] px-[12px] rounded-[12px] text-[14px] font-medium transition-colors ${isActive ? "bg-[#F2F3F5] text-[#0A0A0A] font-[600]" : "text-[#3C3C43] hover:bg-[#F7F7F8]"}`}
              >
                <span className={`w-[20px] h-[20px] flex items-center justify-center shrink-0 ${isActive ? "text-[#0A0A0A]" : "text-[#8A8A8E]"}`}>
                  <Icon className={isActive ? "text-[#0A0A0A]" : "text-[#8A8A8E]"} />
                </span>
                <span
                  className="whitespace-nowrap overflow-hidden"
                  style={{
                    opacity: collapsed ? 0 : 1,
                    transform: collapsed ? "translateX(-4px)" : "translateX(0)",
                    transition: collapsed ? "opacity 120ms ease" : "opacity 150ms ease 80ms, transform 150ms ease 80ms",
                  }}
                >
                  {item.label}
                </span>
              </a>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* Bottom — Settings + School card or collapsed chevron */}
        {!collapsed ? (
          <div className="px-[20px] pb-[20px] flex flex-col gap-3">
            <a href="#" className="flex items-center gap-[12px] h-[44px] px-[12px] rounded-[12px] text-[14px] font-medium text-[#3C3C43] hover:bg-[#F7F7F8] transition-colors">
              <span className="w-[20px] h-[20px] flex items-center justify-center shrink-0 text-[#8A8A8E]">
                <IconGear />
              </span>
              <span
                style={{
                  opacity: collapsed ? 0 : 1,
                  transform: collapsed ? "translateX(-4px)" : "translateX(0)",
                  transition: collapsed ? "opacity 120ms ease" : "opacity 150ms ease 80ms, transform 150ms ease 80ms",
                }}
              >
                Settings
              </span>
            </a>
            <div className="bg-white border border-[#ECECEE] rounded-[16px] p-[12px] flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white border border-[#ECECEE] flex items-center justify-center shrink-0 overflow-hidden">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" fill="#3FAE55" />
                  <path d="M7 14l5-6 5 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M9 14v3h6v-3" stroke="white" strokeWidth="1.2" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#0A0A0A] leading-tight whitespace-nowrap">Delhi Public School</p>
                <p className="text-[12px] text-[#8A8A8E] leading-tight">Bokaro Steel City</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 pb-[20px] px-[12px]">
            <div className="relative group">
              <button aria-label="Settings" className="w-11 h-11 rounded-[12px] flex items-center justify-center text-[#8A8A8E] hover:bg-[#F7F7F8] hover:text-[#0A0A0A]">
                <IconGear />
              </button>
              <div className="sidebar-tooltip">Settings</div>
            </div>
            <div className="w-8 h-8 rounded-full bg-white border border-[#ECECEE] flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#3FAE55" />
                <path d="M7 14l5-6 5 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            {/* expand chevron at very bottom — 120ms hover/press scale */}
            <button
              onClick={onToggle}
              aria-label="Expand sidebar"
              className="mt-1 w-7 h-7 rounded-full bg-[#F2F3F5] hover:bg-[#EDEEF0] flex items-center justify-center text-[#0A0A0A] text-[14px] leading-none transition-all duration-[120ms] active:scale-[0.95]"
            >
              »
            </button>
          </div>
        )}
      </aside>

      {/* Tablet overlay when expanded on md (768-1023) — covers content, not push */}
      {mobileOpen && (
        <div className="hidden md:flex lg:hidden fixed inset-0 z-50">
          <button aria-label="Close" onClick={onMobileClose} className="absolute inset-0 bg-black/40 overlay-enter" />
          <div className="relative w-[264px] card-shell flex flex-col h-[calc(100%-32px)] my-[16px] ml-[16px] p-0 overflow-hidden drawer-enter" style={{ borderRadius: 24 }}>
            {/* same expanded content inside overlay */}
            <div className="flex items-center justify-between px-[20px] h-[56px] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[10px] bg-[#0A0A0A] flex items-center justify-center text-white font-extrabold text-[14px]">V</div>
                <span className="font-semibold text-[18px] tracking-tight text-[#0A0A0A]">VedaAI</span>
              </div>
              <button onClick={onMobileClose} className="w-8 h-8 rounded-[8px] flex items-center justify-center hover:bg-[#F5F5F6]">✕</button>
            </div>
            <div className="px-[20px]">
              <button onClick={() => { onMobileClose?.(); router.push("/"); }} className="w-full h-[44px] rounded-full bg-[#0A0A0A] text-white text-[14px] font-medium flex items-center justify-center gap-2"> <span>+</span> AI Teacher&apos;s Toolkit</button>
            </div>
            <nav className="flex flex-col gap-[4px] px-[20px] mt-6">
              {NAV.map((item) => {
                const isActive = item.id === activeId;
                const Icon = item.icon;
                return (
                  <a key={item.id} href={item.id === "exams" ? "/" : "#"} onClick={onMobileClose} className={`flex items-center gap-[12px] h-[44px] px-[12px] rounded-[12px] text-[14px] font-medium ${isActive ? "bg-[#F2F3F5] text-[#0A0A0A] font-[600]" : "text-[#3C3C43]"}`}>
                    <Icon className={isActive ? "text-[#0A0A0A]" : "text-[#8A8A8E]"} /> {item.label}
                  </a>
                );
              })}
            </nav>
            <div className="flex-1" />
            <div className="px-[20px] pb-[20px] flex flex-col gap-3">
              <div className="bg-white border border-[#ECECEE] rounded-[16px] p-[12px] flex items-center gap-3">
                <div className="w-8 h-8 rounded-full border border-[#ECECEE] flex items-center justify-center overflow-hidden"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#3FAE55" /></svg></div>
                <div><p className="text-[13px] font-semibold text-[#0A0A0A]">Delhi Public School</p><p className="text-[12px] text-[#8A8A8E]">Bokaro Steel City</p></div>
              </div>
              {/* Profile inside drawer for tablet */}
              <div className="pt-2 border-t border-[#ECECEE]">
                {user ? (
                  <div className="flex items-center gap-3 px-2 py-2">
                    <img src={user.user_metadata?.avatar_url || "https://i.pravatar.cc/100?img=12"} alt="" className="w-8 h-8 rounded-full object-cover" />
                    <div className="min-w-0"><p className="text-[13px] font-medium truncate">{user.email}</p><p className="text-[11px] text-[#8A8A8E] truncate">{user.user_metadata?.full_name || "Account"}</p></div>
                  </div>
                ) : (
                  <button onClick={() => { onMobileClose?.(); router.push("/auth/login"); }} className="w-full h-9 rounded-full bg-[#0A0A0A] text-white text-[14px] font-medium">Sign In</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile drawer (<768) */}
      <div className="md:hidden">
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex">
            <button aria-label="Close sidebar" onClick={onMobileClose} className="absolute inset-0 bg-black/40 overlay-enter" />
            <aside className="relative bg-white flex flex-col shrink-0 h-full overflow-hidden card-shell drawer-enter" style={{ width: "min(80vw, 300px)", borderRadius: "0 24px 24px 0", borderLeft: "none" }}>
              <div className="flex items-center justify-between px-[20px] h-[56px] shrink-0 border-b border-[#ECECEE]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-[10px] bg-[#0A0A0A] flex items-center justify-center text-white font-extrabold text-[14px]">V</div>
                  <span className="font-semibold text-[18px] tracking-tight text-[#0A0A0A]">VedaAI</span>
                </div>
                <button onClick={onMobileClose} aria-label="Close" className="w-8 h-8 rounded-[8px] flex items-center justify-center hover:bg-[#F5F5F6] text-[#0A0A0A]">✕</button>
              </div>
              <div className="px-[20px] pt-4">
                <button onClick={() => { onMobileClose?.(); router.push("/"); }} className="w-full h-[44px] rounded-full bg-[#0A0A0A] text-white text-[14px] font-medium flex items-center justify-center gap-2"><span>+</span> AI Teacher&apos;s Toolkit</button>
              </div>
              <nav className="flex flex-col gap-[4px] px-[20px] mt-6">
                {NAV.map((item) => {
                  const isActive = item.id === activeId;
                  const Icon = item.icon;
                  return (
                    <a key={item.id} href={item.id === "exams" ? "/" : "#"} onClick={onMobileClose} className={`flex items-center gap-[12px] h-[44px] px-[12px] rounded-[12px] text-[14px] font-medium ${isActive ? "bg-[#F2F3F5] text-[#0A0A0A] font-[600]" : "text-[#3C3C43] hover:bg-[#F7F7F8]"}`}>
                      <Icon className={isActive ? "text-[#0A0A0A]" : "text-[#8A8A8E]"} /> {item.label}
                    </a>
                  );
                })}
                <a href="#" className="flex items-center gap-[12px] h-[44px] px-[12px] rounded-[12px] text-[14px] font-medium text-[#3C3C43] hover:bg-[#F7F7F8]"><IconGear /> Settings</a>
              </nav>
              <div className="flex-1" />
              <div className="px-[20px] pb-[20px] flex flex-col gap-3">
                <div className="bg-white border border-[#ECECEE] rounded-[16px] p-[12px] flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full border border-[#ECECEE] flex items-center justify-center overflow-hidden"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#3FAE55" /><path d="M7 14l5-6 5 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg></div>
                  <div><p className="text-[13px] font-semibold text-[#0A0A0A]">Delhi Public School</p><p className="text-[12px] text-[#8A8A8E]">Bokaro Steel City</p></div>
                </div>
                <div className="pt-2 border-t border-[#ECECEE]">
                  {user ? (
                    <div className="flex items-center gap-3 px-2 py-2">
                      <img src={user.user_metadata?.avatar_url || "https://i.pravatar.cc/100?img=12"} alt="" className="w-8 h-8 rounded-full object-cover" />
                      <div className="min-w-0"><p className="text-[13px] font-medium truncate">{user.email}</p><p className="text-[11px] text-[#8A8A8E] truncate">{user.user_metadata?.full_name || "Account"}</p></div>
                    </div>
                  ) : (
                    <button onClick={() => { onMobileClose?.(); router.push("/auth/login"); }} className="w-full h-[44px] rounded-full bg-[#0A0A0A] text-white text-[14px] font-medium">Sign In</button>
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
