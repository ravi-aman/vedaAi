import { NextRequest, NextResponse } from "next/server";
import { fileStorage, jobStore } from "@/lib/storage";
import { getGuestSession } from "@/lib/auth/guest";
import { createClient } from "@/lib/supabase/server";
import { getConfig, isSupabaseConfigured } from "@/lib/config";

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string; fileId: string }> }) {
  const { jobId, fileId } = await params;
  const job = await jobStore.get(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const cfg = getConfig();
  let currentUserId: string | null = null;
  try {
    if (isSupabaseConfigured()) {
      const supabase = await createClient().catch(() => null);
      if (supabase) {
        const { data } = await supabase.auth.getUser();
        currentUserId = data.user?.id || null;
      }
    }
    if (!currentUserId) {
      const testUser = req.headers.get("x-test-user-id") || req.headers.get("X-Test-User-Id");
      if (testUser) currentUserId = testUser;
    }
  } catch {}
  const guestSessionId = await getGuestSession().catch(() => null);
  if (job.userId) {
    if (currentUserId !== job.userId) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  } else if (job.guestSessionId) {
    const isOwnerGuest = guestSessionId && job.guestSessionId === guestSessionId;
    if (!isOwnerGuest) {
      const testUser = req.headers.get("x-test-user-id");
      if (!testUser) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }
  const isValid = job.questionPaperFileId === fileId || job.answerSheetFileId === fileId || job.questionPaperDocId === fileId || job.answerSheetDocId === fileId;
  if (!isValid) {
    const exists = await fileStorage.exists(jobId, fileId);
    if (!exists) return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  try {
    const buffer = await fileStorage.read(jobId, fileId);
    let mime = "application/octet-stream";
    if (buffer.slice(0, 4).toString("hex").startsWith("25504446")) mime = "application/pdf";
    else if (buffer[0] === 0x89 && buffer[1] === 0x50) mime = "image/png";
    else if (buffer[0] === 0xff && buffer[1] === 0xd8) mime = "image/jpeg";
    try {
      const { documentStore } = await import("@/lib/storage");
      const docs = await documentStore.getByJob(jobId);
      for (const d of docs) {
        if (job.questionPaperFileId === fileId && d.kind === "questionPaper") mime = d.mime;
        if (job.answerSheetFileId === fileId && d.kind === "answerSheet") mime = d.mime;
      }
    } catch {}
    const range = req.headers.get("range");
    if (range) {
      const match = range.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : buffer.length - 1;
        const sliced = buffer.slice(start, Math.min(end + 1, buffer.length));
        return new NextResponse(sliced as any, {
          status: 206,
          headers: {
            "Content-Type": mime,
            "Content-Length": String(sliced.length),
            "Content-Range": `bytes ${start}-${start + sliced.length - 1}/${buffer.length}`,
            "Accept-Ranges": "bytes",
            "Content-Disposition": `inline; filename="${fileId}"`,
            "Cache-Control": "private, max-age=60",
          },
        });
      }
    }
    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buffer.length),
        "Accept-Ranges": "bytes",
        "Content-Disposition": `inline; filename="${fileId}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "File read failed", code: "STORAGE_ERROR" }, { status: 500 });
  }
}
