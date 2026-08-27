import type { ProcessingJob, Document, DocumentPage } from "@/types";
import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

// Interfaces
export interface JobStore {
  create(job: ProcessingJob): Promise<void>;
  get(jobId: string): Promise<ProcessingJob | null>;
  update(jobId: string, patch: Partial<ProcessingJob>): Promise<ProcessingJob>;
  list(): Promise<ProcessingJob[]>;
}

export interface FileStorage {
  save(jobId: string, fileId: string, buffer: Buffer, originalName: string): Promise<string>; // returns stored path
  read(jobId: string, fileId: string): Promise<Buffer>;
  exists(jobId: string, fileId: string): Promise<boolean>;
  deleteJob(jobId: string): Promise<void>;
  getPath(jobId: string, fileId: string): string;
}

export interface ArtifactStore {
  savePageImage(jobId: string, pageId: string, buffer: Buffer): Promise<void>;
  getPageImage(jobId: string, pageId: string): Promise<Buffer | null>;
}

// --- Persisted In-memory stores (survive dev restarts via tmp file) ---
const PERSIST_DIR = path.join(os.tmpdir(), "veda-ai", "persist");

async function persistWrite(file: string, data: any) {
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8");
  } catch {}
}
async function persistRead<T>(file: string): Promise<T | null> {
  try {
    const buf = await fs.readFile(file, "utf-8");
    return JSON.parse(buf) as T;
  } catch { return null; }
}
function jobFile(jobId: string) {
  const safe = jobId.replace(/[^a-zA-Z0-9-]/g, "");
  return path.join(PERSIST_DIR, `job-${safe}.json`);
}
function docsFile(jobId: string) {
  const safe = jobId.replace(/[^a-zA-Z0-9-]/g, "");
  return path.join(PERSIST_DIR, `docs-${safe}.json`);
}
function pagesFile(jobId: string) {
  const safe = jobId.replace(/[^a-zA-Z0-9-]/g, "");
  return path.join(PERSIST_DIR, `pages-${safe}.json`);
}

// In-memory JobStore with file fallback
export class InMemoryJobStore implements JobStore {
  private jobs = new Map<string, ProcessingJob>();
  async create(job: ProcessingJob) {
    this.jobs.set(job.id, job);
    await persistWrite(jobFile(job.id), job);
  }
  async get(jobId: string) {
    const mem = this.jobs.get(jobId);
    if (mem) return mem;
    const persisted = await persistRead<ProcessingJob>(jobFile(jobId));
    if (persisted) {
      this.jobs.set(jobId, persisted);
      return persisted;
    }
    return null;
  }
  async update(jobId: string, patch: Partial<ProcessingJob>) {
    let existing: ProcessingJob | null | undefined = this.jobs.get(jobId);
    if (!existing) {
      existing = await persistRead<ProcessingJob>(jobFile(jobId));
      if (!existing) throw new Error(`Job ${jobId} not found`);
      this.jobs.set(jobId, existing);
    }
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() } as ProcessingJob;
    this.jobs.set(jobId, updated);
    await persistWrite(jobFile(jobId), updated);
    return updated;
  }
  async list() {
    // Merge memory + persisted files
    try {
      const files = await fs.readdir(PERSIST_DIR).catch(() => [] as string[]);
      for (const f of files) {
        if (f.startsWith("job-") && f.endsWith(".json")) {
          const jobId = f.slice(4, -5);
          if (!this.jobs.has(jobId)) {
            const j = await persistRead<ProcessingJob>(path.join(PERSIST_DIR, f));
            if (j) this.jobs.set(jobId, j);
          }
        }
      }
    } catch {}
    return Array.from(this.jobs.values());
  }
}

// Singleton store (job-scoped, no global mutable processing state except store itself which is isolated per job)
export const jobStore = new InMemoryJobStore();

// Document stores with persistence
const docStore = new Map<string, Document>();
export const documentStore = {
  async save(doc: Document) {
    docStore.set(doc.id, doc);
    // persist per job
    const existing = await persistRead<Document[]>(docsFile(doc.jobId)) || [];
    const filtered = existing.filter((d) => d.id !== doc.id);
    filtered.push(doc);
    await persistWrite(docsFile(doc.jobId), filtered);
  },
  async get(id: string) {
    const mem = docStore.get(id);
    if (mem) return mem;
    // scan persisted files for doc
    try {
      const files = await fs.readdir(PERSIST_DIR).catch(() => [] as string[]);
      for (const f of files) {
        if (f.startsWith("docs-") && f.endsWith(".json")) {
          const docs = await persistRead<Document[]>(path.join(PERSIST_DIR, f));
          const found = docs?.find((d) => d.id === id);
          if (found) {
            docStore.set(id, found);
            return found;
          }
        }
      }
    } catch {}
    return null;
  },
  async getByJob(jobId: string) {
    const mem = Array.from(docStore.values()).filter((d) => d.jobId === jobId);
    if (mem.length > 0) return mem;
    const persisted = await persistRead<Document[]>(docsFile(jobId));
    if (persisted && persisted.length > 0) {
      persisted.forEach((d) => docStore.set(d.id, d));
      return persisted;
    }
    return [];
  },
  async update(id: string, patch: Partial<Document>) {
    let d = docStore.get(id);
    if (!d) {
      const found = await (documentStore as any).get(id);
      if (!found) throw new Error(`Doc ${id} not found`);
      d = found;
    }
    const upd = { ...d, ...patch } as Document;
    docStore.set(id, upd);
    // update persisted file
    const docs = await persistRead<Document[]>(docsFile(upd.jobId)) || [];
    const filtered = docs.filter((x) => x.id !== id);
    filtered.push(upd);
    await persistWrite(docsFile(upd.jobId), filtered);
    return upd;
  },
};
const pageStore = new Map<string, DocumentPage>();
export const pageStoreApi = {
  async save(p: DocumentPage) {
    pageStore.set(p.id, p);
    // find jobId via document
    const doc = docStore.get(p.documentId);
    let jobId = doc?.jobId;
    if (!jobId) {
      // try to find via persisted docs
      try {
        const files = await fs.readdir(PERSIST_DIR).catch(() => [] as string[]);
        for (const f of files) {
          if (f.startsWith("docs-")) {
            const docs = await persistRead<Document[]>(path.join(PERSIST_DIR, f));
            const d = docs?.find((x) => x.id === p.documentId);
            if (d) { jobId = d.jobId; break; }
          }
        }
      } catch {}
    }
    if (jobId) {
      const existing = (await persistRead<DocumentPage[]>(pagesFile(jobId))) || [];
      const filtered = existing.filter((x) => x.id !== p.id);
      filtered.push(p);
      await persistWrite(pagesFile(jobId), filtered);
    }
  },
  async get(id: string) {
    const mem = pageStore.get(id);
    if (mem) return mem;
    try {
      const files = await fs.readdir(PERSIST_DIR).catch(() => [] as string[]);
      for (const f of files) {
        if (f.startsWith("pages-") && f.endsWith(".json")) {
          const pages = await persistRead<DocumentPage[]>(path.join(PERSIST_DIR, f));
          const found = pages?.find((x) => x.id === id);
          if (found) {
            pageStore.set(id, found);
            return found;
          }
        }
      }
    } catch {}
    return null;
  },
  async getByDocument(docId: string) {
    const mem = Array.from(pageStore.values()).filter((p) => p.documentId === docId);
    if (mem.length > 0) return mem;
    // try persisted
    const doc = await documentStore.get(docId);
    const jobId = doc?.jobId;
    if (jobId) {
      const persisted = await persistRead<DocumentPage[]>(pagesFile(jobId));
      if (persisted) {
        const filtered = persisted.filter((p) => p.documentId === docId);
        filtered.forEach((p) => pageStore.set(p.id, p));
        if (filtered.length > 0) return filtered;
      }
    }
    // fallback scan all pages files
    try {
      const files = await fs.readdir(PERSIST_DIR).catch(() => [] as string[]);
      for (const f of files) {
        if (f.startsWith("pages-")) {
          const pages = await persistRead<DocumentPage[]>(path.join(PERSIST_DIR, f));
          const filtered = pages?.filter((p) => p.documentId === docId) || [];
          if (filtered.length > 0) {
            filtered.forEach((p) => pageStore.set(p.id, p));
            return filtered;
          }
        }
      }
    } catch {}
    return [];
  },
};

// File storage
export class LocalFileStorage implements FileStorage {
  private baseDir: string;
  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(os.tmpdir(), "veda-ai");
  }
  getPath(jobId: string, fileId: string) {
    // sanitize: fileId is uuid, jobId is uuid
    const safeJob = jobId.replace(/[^a-zA-Z0-9-]/g, "");
    const safeFile = fileId.replace(/[^a-zA-Z0-9-]/g, "");
    return path.join(this.baseDir, safeJob, safeFile);
  }
  async save(jobId: string, fileId: string, buffer: Buffer, originalName: string) {
    const filePath = this.getPath(jobId, fileId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    // also save metadata
    await fs.writeFile(filePath + ".meta.json", JSON.stringify({ originalName, size: buffer.length }, null, 2));
    return filePath;
  }
  async read(jobId: string, fileId: string) {
    const p = this.getPath(jobId, fileId);
    return fs.readFile(p);
  }
  async exists(jobId: string, fileId: string) {
    try {
      await fs.access(this.getPath(jobId, fileId));
      return true;
    } catch { return false; }
  }
  async deleteJob(jobId: string) {
    const dir = path.join(this.baseDir, jobId.replace(/[^a-zA-Z0-9-]/g, ""));
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export const fileStorage = new LocalFileStorage();

// Simple in-memory artifact store for page images (fallback to file if large)
export class InMemoryArtifactStore implements ArtifactStore {
  private map = new Map<string, Buffer>();
  private key(jobId: string, pageId: string) { return `${jobId}:${pageId}`; }
  async savePageImage(jobId: string, pageId: string, buffer: Buffer) { this.map.set(this.key(jobId, pageId), buffer); }
  async getPageImage(jobId: string, pageId: string) { return this.map.get(this.key(jobId, pageId)) || null; }
}
export const artifactStore = new InMemoryArtifactStore();

// Helpers
export function generateId() { return randomUUID(); }
