import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return supabaseResponse; // not configured, skip
  // Skip heavy auth for static/fast paths to reduce latency
  const pathname = request.nextUrl.pathname;
  if (pathname.endsWith(".map") || pathname.startsWith("/_next/")) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
      },
    },
  });
  // bound with timeout so middleware never hangs polling
  try {
    await Promise.race([
      supabase.auth.getUser(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("auth timeout")), 3000)),
    ]);
  } catch {}
  return supabaseResponse;
}
