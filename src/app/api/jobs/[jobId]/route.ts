import { NextRequest, NextResponse } from "next/server";
import { jobStore, documentStore, pageStoreApi } from "@/lib/storage";

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await jobStore.get(jobId);
  if (!job) return NextResponse.json({ error: "Job not found", code: "JOB_NOT_FOUND" }, { status: 404 });
  // Include documents and pages for viewer
  const documents = await documentStore.getByJob(jobId);
  const pages = [];
  for (const doc of documents) {
    const docPages = await pageStoreApi.getByDocument(doc.id);
    pages.push(...docPages);
  }
  return NextResponse.json({ job, documents, pages });
}
