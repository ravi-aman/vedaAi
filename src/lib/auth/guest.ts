import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { getConfig } from "@/lib/config";

const GUEST_COOKIE = "veda_guest_session";

export async function getOrCreateGuestSession(): Promise<string> {
  const store = await cookies();
  let id = store.get(GUEST_COOKIE)?.value;
  if (!id) {
    id = `guest_${randomUUID()}`;
    store.set(GUEST_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
  }
  return id;
}

export async function getGuestSession(): Promise<string | null> {
  const store = await cookies();
  return store.get(GUEST_COOKIE)?.value || null;
}

export function isGraceExpired(createdAt: string): boolean {
  const cfg = getConfig();
  const grace = cfg.GUEST_RESULT_GRACE_PERIOD_MS;
  const created = new Date(createdAt).getTime();
  return Date.now() - created > grace;
}

export async function shouldRequireAuth(job: { createdAt: string; userId?: string | null; guestSessionId?: string | null }, currentUserId: string | null, currentGuestId: string | null): Promise<boolean> {
  // Authenticated owner → never requires auth
  if (currentUserId && job.userId === currentUserId) return false;
  // Guest owner within grace → temporary access
  if (currentGuestId && job.guestSessionId === currentGuestId) {
    return isGraceExpired(job.createdAt);
  }
  // No ownership → requires auth
  return true;
}
