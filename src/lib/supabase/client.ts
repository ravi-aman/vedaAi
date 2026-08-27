"use client";
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  // Read directly from process.env so Next.js can inline NEXT_PUBLIC at build time (Turbopack)
  // Fallback to getConfig for test/SSR edge cases
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    (() => {
      try {
        const { getConfig } = require("@/lib/config");
        return (getConfig() as any).NEXT_PUBLIC_SUPABASE_URL;
      } catch {
        return null;
      }
    })();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    (() => {
      try {
        const { getSupabasePublishableKey } = require("@/lib/config");
        return getSupabasePublishableKey();
      } catch {
        return null;
      }
    })();
  if (!url || !key) {
    // Diagnostic: log what was seen (helps debug stale Turbopack cache)
    console.error("[supabase client] missing env", {
      hasUrl: !!url,
      hasKey: !!key,
      envUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? "present" : "missing",
      envPub: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? "present" : "missing",
      envAnon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "present" : "missing",
    });
    throw new Error(
      "Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) then restart dev server and hard-refresh (Ctrl+F5)"
    );
  }
  return createBrowserClient(url, key);
}

export function isSupabaseBrowserConfigured(): boolean {
  try {
    createClient();
    return true;
  } catch {
    return false;
  }
}
