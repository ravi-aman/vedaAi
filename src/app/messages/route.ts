import { NextResponse } from "next/server";

// Legacy endpoint — no longer used in VedaAI. Return 204 to prevent 404 spam from stale clients/extensions.
// If a future feature needs /messages, implement proper handler here.
export async function GET() {
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
export async function POST() {
  return new NextResponse(null, { status: 204 });
}
