import { NextRequest, NextResponse } from "next/server";

// Proxy to jobs claim for compatibility
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // forward to jobs claim
  const url = new URL(`/api/jobs/${id}/claim`, req.url);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { cookie: req.headers.get("cookie") || "", "x-test-user-id": req.headers.get("x-test-user-id") || "" },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
