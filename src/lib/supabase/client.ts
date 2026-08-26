"use client";
import { createBrowserClient } from "@supabase/ssr";
import { getConfig } from "@/lib/config";

export function createClient() {
  const cfg = getConfig();
  const url = cfg.NEXT_PUBLIC_SUPABASE_URL;
  const key = cfg.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
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
