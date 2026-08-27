import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getConfig, getSupabasePublishableKey } from "@/lib/config";

export async function createClient() {
  const cfg = getConfig();
  const url = cfg.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabasePublishableKey();
  if (!url || !key) {
    throw new Error("Supabase not configured");
  }
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {}
      },
    },
  });
}

export async function createServiceClient() {
  const cfg = getConfig();
  const url = cfg.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = cfg.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase service role not configured");
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
