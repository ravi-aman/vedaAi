// Durable stores for Vercel — Supabase Storage-backed with local fallback
// Keeps pipeline unchanged, only storage layer is durable.
// Uses bucket `assessment-inputs` (already exists) with prefix `__durable__/` to avoid collision with file uploads `${jobId}/${fileId}`.

import type { ProcessingJob, Document, DocumentPage } from "@/types";
import type { JobStore } from "./index";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

// Reuse local persist path for dev fallback
const PERSIST_DIR = path.join(os.tmpdir(), "veda-ai", "persist");
async function persistWrite(file: string, data: any) {
  try { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8"); } catch {}
}
async function persistRead<T>(file: string): Promise<T | null> {
  try { const buf = await fs.readFile(file, "utf-8"); return JSON.parse(buf) as T; } catch { return null; }
}
function jobFile(jobId: string) { const safe = jobId.replace(/[^a-zA-Z0-9-]/g,""); return path.join(PERSIST_DIR, `job-${safe}.json`); }
function docsFile(jobId: string) { const safe = jobId.replace(/[^a-zA-Z0-9-]/g,""); return path.join(PERSIST_DIR, `docs-${safe}.json`); }
function pagesFile(jobId: string) { const safe = jobId.replace(/[^a-zA-Z0-9-]/g,""); return path.join(PERSIST_DIR, `pages-${safe}.json`); }
function resultFile(jobId: string) { const safe = jobId.replace(/[^a-zA-Z0-9-]/g,""); return path.join(PERSIST_DIR, `result-${safe}.json`); }

// Supabase helpers — lazy import to avoid loading when not configured
async function getServiceClient() {
  const { createServiceClient } = await import("@/lib/supabase/server");
  return createServiceClient();
}
function isDurableConfigured(): boolean {
  try {
    const { getConfig } = require("@/lib/config");
    const cfg = getConfig() as any;
    return Boolean(cfg.NEXT_PUBLIC_SUPABASE_URL && cfg.SUPABASE_SERVICE_ROLE_KEY);
  } catch { return false; }
}
function isVercelProduction(): boolean {
  return Boolean(process.env.VERCEL);
}
function assertDurableInProduction(): void {
  if (!isDurableConfigured()) {
    if (isVercelProduction()) {
      throw new Error("CONFIGURATION_ERROR: Durable Supabase not configured — NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in production (VERCEL). Refusing silent fallback to InMemory/tmp. Set SUPABASE_SERVICE_ROLE_KEY in Vercel dashboard.");
    }
    // For remote backend locally without service key, allow tmp fallback but warn (for local testing only)
    const isRemote = (()=>{ try { const { isRemoteBackend } = require("@/lib/config"); return isRemoteBackend(); } catch { return false; }})();
    if (isRemote) {
      console.warn("[durable] PROCESSING_BACKEND=remote but Supabase not configured — using tmp fallback for local test only. Production Vercel will throw.");
    }
  }
}

// Storage bucket + prefixes
const BUCKET = "assessment-inputs";
const JOB_PREFIX = "__durable__/jobs";
const DOC_PREFIX = "__durable__/docs";
const PAGE_PREFIX = "__durable__/pages";
const RESULT_PREFIX = "__durable__/results";

function jobStoragePath(jobId: string) { return `${JOB_PREFIX}/${jobId.replace(/[^a-zA-Z0-9-]/g,"")}.json`; }
function docStoragePath(jobId: string) { return `${DOC_PREFIX}/${jobId.replace(/[^a-zA-Z0-9-]/g,"")}.json`; }
function pageStoragePath(jobId: string) { return `${PAGE_PREFIX}/job-${jobId.replace(/[^a-zA-Z0-9-]/g,"")}.json`; }
function pageDocPath(docId: string) { return `${PAGE_PREFIX}/doc-${docId.replace(/[^a-zA-Z0-9-]/g,"")}.json`; }
function resultStoragePath(jobId: string) { return `${RESULT_PREFIX}/${jobId.replace(/[^a-zA-Z0-9-]/g,"")}.json`; }

async function supabaseUploadJson(filePath: string, data: any): Promise<{ ok: boolean; error?: string }> {
  if (!isDurableConfigured()) return { ok: false, error: "not configured" };
  try {
    const supabase = await getServiceClient();
    const blob = Buffer.from(JSON.stringify(data), "utf-8");
    const { error } = await (supabase as any).storage.from(BUCKET).upload(filePath, blob, { contentType: "application/json", upsert: true });
    if (error) {
      // Auto-create bucket if missing (first deploy)
      if (error.message.toLowerCase().includes("bucket not found") || error.message.toLowerCase().includes("not found")) {
        try {
          const { error: createErr } = await (supabase as any).storage.createBucket(BUCKET, { public: false });
          if (!createErr) {
            const { error: retryErr } = await (supabase as any).storage.from(BUCKET).upload(filePath, blob, { contentType: "application/json", upsert: true });
            if (!retryErr) return { ok: true };
            console.warn(`[durable] upload retry failed ${filePath}: ${retryErr.message}`);
            return { ok: false, error: retryErr.message };
          }
        } catch {}
      }
      console.warn(`[durable] upload failed ${filePath}: ${error.message}`);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e: any) {
    console.warn(`[durable] upload exception ${filePath}: ${e?.message}`);
    return { ok: false, error: e?.message };
  }
}
async function supabaseDownloadJson<T>(filePath: string): Promise<T | null> {
  if (!isDurableConfigured()) return null;
  try {
    const supabase = await getServiceClient();
    const { data, error } = await (supabase as any).storage.from(BUCKET).download(filePath);
    if (error || !data) return null;
    const txt = await (data as Blob).text();
    return JSON.parse(txt) as T;
  } catch { return null; }
}
async function supabaseListJson(prefix: string): Promise<string[]> {
  if (!isDurableConfigured()) return [];
  try {
    const supabase = await getServiceClient();
    const { data, error } = await (supabase as any).storage.from(BUCKET).list(prefix, { limit: 1000 });
    if (error || !data) return [];
    return (data as any[]).filter(f => f.name.endsWith(".json")).map(f => `${prefix}/${f.name}`);
  } catch { return []; }
}

// Attempt Supabase DB table `jobs` if exists — provides atomic claim.
// If table missing we silently fallback to storage.
async function supabaseDbGet(jobId: string): Promise<ProcessingJob | null> {
  if (!isDurableConfigured()) return null;
  try {
    const supabase = await getServiceClient();
    const { data, error } = await (supabase as any).from("jobs").select("data").eq("id", jobId).single();
    if (error || !data) return null;
    return data.data as ProcessingJob;
  } catch { return null; }
}
async function supabaseDbUpsert(job: ProcessingJob): Promise<boolean> {
  if (!isDurableConfigured()) return false;
  try {
    const supabase = await getServiceClient();
    const { error } = await (supabase as any).from("jobs").upsert({ id: job.id, data: job, status: job.status, current_stage: job.currentStage, updated_at: new Date().toISOString(), heartbeat_at: (job as any).heartbeatAt || null }, { onConflict: "id" });
    if (error) {
      // If table doesn't exist error code 42P01 — fallback to storage
      if (String(error.message).includes("42P01") || String(error.code) === "42P01" || String(error.message).toLowerCase().includes("does not exist")) return false;
      console.warn(`[durable] db upsert failed: ${error.message}`);
      return false;
    }
    return true;
  } catch { return false; }
}
async function supabaseDbList(): Promise<ProcessingJob[]> {
  if (!isDurableConfigured()) return [];
  try {
    const supabase = await getServiceClient();
    const { data, error } = await (supabase as any).from("jobs").select("data").limit(200);
    if (error || !data) return [];
    return (data as any[]).map(r => r.data as ProcessingJob);
  } catch { return []; }
}

// Durable JobStore: memory + local tmp + Supabase Storage + optional Supabase DB
export class DurableJobStore implements JobStore {
  private mem = new Map<string, ProcessingJob>();

  async create(job: ProcessingJob): Promise<void> {
    assertDurableInProduction();
    this.mem.set(job.id, job);
    await persistWrite(jobFile(job.id), job);
    // DB first (if table exists), then storage
    const dbOk = await supabaseDbUpsert(job);
    if (!dbOk) {
      const { ok, error } = await supabaseUploadJson(jobStoragePath(job.id), job);
      if (!ok && isVercelProduction()) {
        throw new Error(`CONFIGURATION_ERROR: Failed to persist job to durable Supabase Storage — ${error || "bucket assessment-inputs missing or service key invalid"}. Check Supabase Dashboard > Storage > Create bucket 'assessment-inputs' (private) and verify SUPABASE_SERVICE_ROLE_KEY is service_role (eyJ...), not publishable.`);
      }
    }
  }

  async get(jobId: string): Promise<ProcessingJob | null> {
    const mem = this.mem.get(jobId);
    if (mem) return mem;
    // Try DB first
    const db = await supabaseDbGet(jobId);
    if (db) { this.mem.set(jobId, db); return db; }
    // Try storage
    const stored = await supabaseDownloadJson<ProcessingJob>(jobStoragePath(jobId));
    if (stored) { this.mem.set(jobId, stored); return stored; }
    // Fallback local tmp
    const local = await persistRead<ProcessingJob>(jobFile(jobId));
    if (local) { this.mem.set(jobId, local); return local; }
    return null;
  }

  async update(jobId: string, patch: Partial<ProcessingJob>): Promise<ProcessingJob> {
    assertDurableInProduction();
    let existing: ProcessingJob | null | undefined = this.mem.get(jobId);
    if (!existing) {
      existing = await this.get(jobId);
      if (!existing) throw new Error(`Job ${jobId} not found`);
    }
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() } as ProcessingJob;
    this.mem.set(jobId, updated);
    await persistWrite(jobFile(jobId), updated);
    const dbOk = await supabaseDbUpsert(updated);
    if (!dbOk) {
      const { ok, error } = await supabaseUploadJson(jobStoragePath(jobId), updated);
      if (!ok && isVercelProduction()) {
        console.warn(`[durable] update persisted only to tmp, supabase failed for ${jobId}: ${error} — will be non-durable on Vercel`);
      }
    }
    return updated;
  }

  // Atomic claim: QUEUED -> PROCESSING with heartbeat
  async claim(jobId: string, workerId: string): Promise<boolean> {
    const job = await this.get(jobId);
    if (!job) return false;
    // Allow claim from CREATED/UPLOADED/QUEUED only
    const claimable = ["CREATED","UPLOADED","QUEUED","FAILED"].includes(job.status as string) || (job as any).status === "QUEUED";
    // More precise: if already VALIDATING with recent heartbeat, deny
    const heartbeat = (job as any).heartbeatAt ? new Date((job as any).heartbeatAt).getTime() : 0;
    const staleMs = 120000;
    const isStale = !heartbeat || (Date.now() - heartbeat > staleMs);
    if ((job.status as string) === "PROCESSING" || (job.currentStage as string) === "PROCESSING") {
      if (!isStale) return false;
    }
    if (!claimable && !isStale) {
      // If job already in progress and not stale, don't claim
      if (["VALIDATING","PREPROCESSING","OCR_PROCESSING","VISION","FUSION","EXTRACTING","STRUCTURING","MATCHING","LOCALIZING"].includes(job.currentStage) && !isStale) return false;
    }
    // Try DB atomic: update where id=... and status=QUEUED (or CREATED) — if DB not available, do storage optimistic
    if (isDurableConfigured()) {
      try {
        const supabase = await getServiceClient();
        // Attempt DB atomic claim if table exists
        const { data, error } = await (supabase as any).from("jobs").select("id").eq("id", jobId).single();
        if (!error && data) {
          const now = new Date().toISOString();
          const { data: upd, error: updErr } = await (supabase as any).from("jobs")
            .update({ data: { ...job, status: "VALIDATING", currentStage: "VALIDATING", heartbeatAt: now, claimedBy: workerId, claimedAt: now, updatedAt: now }, status: "VALIDATING", heartbeat_at: now, claimed_by: workerId, updated_at: now })
            .eq("id", jobId)
            .in("status", ["CREATED","UPLOADED","QUEUED","FAILED"])
            .select();
          if (!updErr && upd && (upd as any[]).length > 0) {
            // Refresh mem
            const fresh = await supabaseDbGet(jobId);
            if (fresh) this.mem.set(jobId, fresh);
            return true;
          }
          // If update affected 0 rows, someone else claimed
          if (updErr) {
            // If table missing, fall through to storage
            if (String(updErr.message).includes("42P01")) { /* fallthrough */ }
            else return false;
          } else {
            return false;
          }
        }
      } catch {}
    }
    // Storage fallback: optimistic write if still claimable
    const latest = await this.get(jobId);
    if (!latest) return false;
    // Re-check claimable after refresh
    if (["COMPLETED"].includes(latest.status)) return false;
    const now = new Date().toISOString();
    await this.update(jobId, { status: "VALIDATING" as any, currentStage: "VALIDATING" as any, heartbeatAt: now as any, claimedBy: workerId as any, claimedAt: now as any, updatedAt: now } as any);
    return true;
  }

  async heartbeat(jobId: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      await this.update(jobId, { heartbeatAt: now as any, updatedAt: now } as any);
    } catch {}
  }

  async list(): Promise<ProcessingJob[]> {
    // Merge mem + DB + storage + local tmp
    const seen = new Map<string, ProcessingJob>();
    for (const [k,v] of this.mem) seen.set(k,v);
    // DB
    const dbJobs = await supabaseDbList();
    for (const j of dbJobs) if (!seen.has(j.id)) seen.set(j.id, j);
    // Storage
    const paths = await supabaseListJson(JOB_PREFIX);
    for (const p of paths) {
      const jid = p.split("/").pop()!.replace(".json","");
      if (seen.has(jid)) continue;
      const j = await supabaseDownloadJson<ProcessingJob>(p);
      if (j) seen.set(jid, j);
    }
    // Local tmp
    try {
      const files = await fs.readdir(PERSIST_DIR).catch(()=>[] as string[]);
      for (const f of files) if (f.startsWith("job-") && f.endsWith(".json")) {
        const jid = f.slice(4,-5);
        if (seen.has(jid)) continue;
        const j = await persistRead<ProcessingJob>(path.join(PERSIST_DIR, f));
        if (j) seen.set(jid, j);
      }
    } catch {}
    return Array.from(seen.values());
  }
}

// Durable Document store
export class DurableDocumentStore {
  private mem = new Map<string, Document>();
  async save(doc: Document): Promise<void> {
    this.mem.set(doc.id, doc);
    // Read existing docs for job, merge, persist
    const existing = await this.getByJob(doc.jobId);
    const merged = [...existing.filter(d=>d.id!==doc.id), doc];
    await persistWrite(docsFile(doc.jobId), merged);
    await supabaseUploadJson(docStoragePath(doc.jobId), merged);
    // Also try DB table `documents` if exists
    if (isDurableConfigured()) {
      try {
        const supabase = await getServiceClient();
        await (supabase as any).from("documents").upsert({ id: doc.id, job_id: doc.jobId, data: doc }, { onConflict: "id" });
      } catch {}
    }
  }
  async get(id: string): Promise<Document | null> {
    const mem = this.mem.get(id);
    if (mem) return mem;
    // Need to scan — try DB
    if (isDurableConfigured()) {
      try {
        const supabase = await getServiceClient();
        const { data } = await (supabase as any).from("documents").select("data").eq("id", id).single();
        if (data?.data) { this.mem.set(id, data.data); return data.data; }
      } catch {}
    }
    return null;
  }
  async getByJob(jobId: string): Promise<Document[]> {
    const mem = Array.from(this.mem.values()).filter(d=>d.jobId===jobId);
    if (mem.length>0) return mem;
    // Try storage
    const stored = await supabaseDownloadJson<Document[]>(docStoragePath(jobId));
    if (stored && stored.length>0) { stored.forEach(d=>this.mem.set(d.id,d)); return stored; }
    // Try DB
    if (isDurableConfigured()) {
      try {
        const supabase = await getServiceClient();
        const { data } = await (supabase as any).from("documents").select("data").eq("job_id", jobId);
        if (data && (data as any[]).length>0) {
          const docs = (data as any[]).map(r=>r.data as Document);
          docs.forEach(d=>this.mem.set(d.id,d));
          return docs;
        }
      } catch {}
    }
    // Local
    const local = await persistRead<Document[]>(docsFile(jobId));
    if (local && local.length>0) { local.forEach(d=>this.mem.set(d.id,d)); return local; }
    return [];
  }
  async update(id: string, patch: Partial<Document>): Promise<Document> {
    let d: Document | undefined | null = this.mem.get(id);
    if (!d) {
      // Try to find via getByJob scan
      const all = await this.getByJob((patch as any).jobId || "");
      d = all.find(x=>x.id===id) || null;
      if (!d) throw new Error(`Doc ${id} not found`);
    }
    const upd = { ...d, ...patch } as Document;
    this.mem.set(id, upd);
    const docs = await this.getByJob(upd.jobId);
    const merged = docs.filter(x=>x.id!==id);
    merged.push(upd);
    await persistWrite(docsFile(upd.jobId), merged);
    await supabaseUploadJson(docStoragePath(upd.jobId), merged);
    if (isDurableConfigured()) {
      try { const supabase = await getServiceClient(); await (supabase as any).from("documents").upsert({ id: upd.id, job_id: upd.jobId, data: upd }, { onConflict: "id" }); } catch {}
    }
    return upd;
  }
}

// Durable Page store — per-document file to avoid job lookup circularity
export class DurablePageStore {
  private mem = new Map<string, DocumentPage>();
  async save(p: DocumentPage): Promise<void> {
    this.mem.set(p.id, p);
    // Persist per-document (avoids needing jobId lookup)
    const existing = await this.getByDocument(p.documentId);
    // getByDocument may return mem inclusive of p if already set, but we need to avoid duplicate
    const filtered = existing.filter(x=>x.id!==p.id);
    filtered.push(p);
    // Also persist per-job for legacy compatibility (if jobId known via local file fallback)
    // Try to find jobId via local docs file scan (no circular import)
    let jobId: string | null = null;
    try {
      const files = await fs.readdir(PERSIST_DIR).catch(()=>[] as string[]);
      for (const f of files) if (f.startsWith("docs-")) {
        const docs = await persistRead<Document[]>(path.join(PERSIST_DIR, f));
        const d = docs?.find(x=>x.id===p.documentId);
        if (d) { jobId = d.jobId; break; }
      }
    } catch {}
    if (jobId) {
      try {
        const allLocal = await persistRead<DocumentPage[]>(pagesFile(jobId)) || [];
        const f2 = allLocal.filter(x=>x.id!==p.id);
        f2.push(p);
        await persistWrite(pagesFile(jobId), f2);
        await supabaseUploadJson(pageStoragePath(jobId), f2);
      } catch {}
    }
    await supabaseUploadJson(pageDocPath(p.documentId), filtered);
    if (isDurableConfigured()) {
      try {
        const supabase = await getServiceClient();
        // store without jobId if unknown, else with
        const payload: any = { id: p.id, document_id: p.documentId, data: p };
        if (jobId) payload.job_id = jobId;
        await (supabase as any).from("pages").upsert(payload, { onConflict: "id" });
      } catch {}
    }
  }
  async get(id: string): Promise<DocumentPage | null> {
    const mem = this.mem.get(id);
    if (mem) return mem;
    if (isDurableConfigured()) {
      try {
        const supabase = await getServiceClient();
        const { data } = await (supabase as any).from("pages").select("data").eq("id", id).single();
        if (data?.data) { this.mem.set(id, data.data); return data.data; }
      } catch {}
    }
    return null;
  }
  async getByDocument(docId: string): Promise<DocumentPage[]> {
    const mem = Array.from(this.mem.values()).filter(p=>p.documentId===docId);
    if (mem.length>0) return mem;
    // Try storage per-doc
    const stored = await supabaseDownloadJson<DocumentPage[]>(pageDocPath(docId));
    if (stored && stored.length>0) { stored.forEach(p=>this.mem.set(p.id,p)); return stored; }
    // Try DB
    if (isDurableConfigured()) {
      try {
        const supabase = await getServiceClient();
        const { data } = await (supabase as any).from("pages").select("data").eq("document_id", docId);
        if (data && (data as any[]).length>0) {
          const pages = (data as any[]).map(r=>r.data as DocumentPage);
          pages.forEach(p=>this.mem.set(p.id,p));
          return pages;
        }
      } catch {}
    }
    // Fallback: try legacy per-job files
    try {
      const files = await fs.readdir(PERSIST_DIR).catch(()=>[] as string[]);
      for (const f of files) if (f.startsWith("pages-")) {
        const pages = await persistRead<DocumentPage[]>(path.join(PERSIST_DIR, f));
        if (pages) {
          const filtered = pages.filter(p=>p.documentId===docId);
          if (filtered.length>0) { filtered.forEach(p=>this.mem.set(p.id,p)); return filtered; }
        }
      }
    } catch {}
    // Also try legacy storage per-job
    // brute force: list all page storage per job is expensive, skip
    return [];
  }
}

// Durable result store — replaces os.tmpdir result persistence
export class DurableResultStore {
  private mem = new Map<string, any>();
  private pending = new Map<string, Promise<void>>();
  async setAsync(jobId: string, v: any): Promise<void> {
    this.mem.set(jobId, v);
    const safe = jobId.replace(/[^a-zA-Z0-9-]/g,"");
    const p = resultFile(jobId);
    const existing = this.pending.get(jobId);
    if (existing) await existing.catch(()=>{});
    const wp = (async()=>{
      try { await fs.mkdir(path.dirname(p),{recursive:true}); await fs.writeFile(p, JSON.stringify(v), "utf-8"); } catch {}
      await supabaseUploadJson(resultStoragePath(jobId), v);
      if (isDurableConfigured()) {
        try { const supabase = await getServiceClient(); await (supabase as any).from("results").upsert({ job_id: jobId, data: v }, { onConflict: "job_id" }); } catch {}
      }
    })();
    this.pending.set(jobId, wp);
    await wp;
    this.pending.delete(jobId);
  }
  set(jobId:string,v:any){ this.mem.set(jobId,v); this.setAsync(jobId,v).catch(()=>{}); }
  get(jobId:string){ return this.mem.get(jobId); }
  async getAsync(jobId:string): Promise<any|undefined> {
    const mem = this.mem.get(jobId);
    if (mem) return mem;
    const stored = await supabaseDownloadJson<any>(resultStoragePath(jobId));
    if (stored) { this.mem.set(jobId, stored); return stored; }
    if (isDurableConfigured()) {
      try {
        const supabase = await getServiceClient();
        const { data } = await (supabase as any).from("results").select("data").eq("job_id", jobId).single();
        if (data?.data) { this.mem.set(jobId, data.data); return data.data; }
      } catch {}
    }
    const local = await persistRead<any>(resultFile(jobId));
    if (local) { this.mem.set(jobId, local); return local; }
    return undefined;
  }
}
