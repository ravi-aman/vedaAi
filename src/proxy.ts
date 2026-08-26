import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export default async function proxy(request: NextRequest) {
  return await updateSession(request);
}
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/jobs (polling) and api/files (pdf) — still need auth but we avoid extra supabase roundtrip latency by excluding? Keep api but exclude /messages and other 404 noise.
     * We keep matcher narrow: exclude api polling from heavy auth? Actually auth is needed for those routes server-side anyway, so we let proxy run for api but with optimization in middleware.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|messages|.*\\.map$).*)",
  ],
};
