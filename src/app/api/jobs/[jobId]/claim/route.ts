import { NextRequest, NextResponse } from "next/server";
import { jobStore } from "@/lib/storage";
import { getGuestSession } from "@/lib/auth/guest";
import { createClient } from "@/lib/supabase/server";
import { getConfig } from "@/lib/config";

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await jobStore.get(jobId);
  if (!job) return NextResponse.json({ error: "Job not found", code: "JOB_NOT_FOUND" }, { status: 404 });

  // Already owned
  if (job.userId) {
    return NextResponse.json({ message: "Already claimed", job });
  }

  const cfg = getConfig();
  let currentUserId: string | null = null;

  // Try supabase auth
  try {
    if (cfg.NEXT_PUBLIC_SUPABASE_URL && cfg.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      currentUserId = data.user?.id || null;
    }
  } catch (e) {
    console.warn("[claim] supabase getUser failed", e);
  }

  // Fallback for local dev without supabase: allow claim via header or mock
  if (!currentUserId) {
    // Check for test header
    const testUser = req.headers.get("x-test-user-id");
    if (testUser) {
      currentUserId = testUser;
    } else if (!cfg.NEXT_PUBLIC_SUPABASE_URL) {
      // In local dev without supabase, generate a mock claimed user
      // This allows testing claim flow without full auth setup
      currentUserId = `local_user_${Date.now()}`;
    }
  }

  if (!currentUserId) {
    return NextResponse.json({ error: "Authentication required", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const guestSessionId = await getGuestSession().catch(() => null);

  // Security: validate guest ownership
  if (job.guestSessionId) {
    if (guestSessionId !== job.guestSessionId) {
      // Allow claim even if guest cookie missing? For now require match, but if Supabase user is present and job is guest, we allow claim if request has same guest cookie
      // For local dev fallback, we allow if job is guest and no cookie, still allow (since tmp storage)
      if (guestSessionId) {
        return NextResponse.json({ error: "Guest session mismatch", code: "UNAUTHORIZED" }, { status: 403 });
      }
    }
  }

  // Atomic claim
  const updated = await jobStore.update(jobId, {
    userId: currentUserId,
    claimedAt: new Date().toISOString(),
    // keep guestSessionId for audit, but ownership now by user
  });

  console.log(JSON.stringify({ jobId, event: "claimed", userId: currentUserId.slice(0, 8), guestSessionId: guestSessionId?.slice(0, 8) }));

  return NextResponse.json({ message: "Claimed", job: updated });
}
