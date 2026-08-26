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

// In-memory JobStore
export class InMemoryJobStore implements JobStore {
  private jobs = new Map<string, ProcessingJob>();
  async create(job: ProcessingJob) {
    this.jobs.set(job.id, job);
  }
  async get(jobId: string) {
    return this.jobs.get(jobId) || null;
  }
  async update(jobId: string, patch: Partial<ProcessingJob>) {
    const existing = this.jobs.get(jobId);
    if (!existing) throw new Error(`Job ${jobId} not found`);
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() } as ProcessingJob;
    this.jobs.set(jobId, updated);
    return updated;
  }
  async list() {
    return Array.from(this.jobs.values());
  }
}

// Singleton store (job-scoped, no global mutable processing state except store itself which is isolated per job)
export const jobStore = new InMemoryJobStore();

// Document stores
const docStore = new Map<string, Document>();
const pageStore = new Map<string, DocumentPage>();
export const documentStore = {
  async save(doc: Document) { docStore.set(doc.id, doc); },
  async get(id: string) { return docStore.get(id) || null; },
  async getByJob(jobId: string) { return Array.from(docStore.values()).filter(d => d.jobId === jobId); },
  async update(id: string, patch: Partial<Document>) {
    const d = docStore.get(id);
    if (!d) throw new Error(`Doc ${id} not found`);
    const upd = { ...d, ...patch } as Document;
    docStore.set(id, upd);
    return upd;
  }
};
export const pageStoreApi = {
  async save(p: DocumentPage) { pageStore.set(p.id, p); },
  async get(id: string) { return pageStore.get(id) || null; },
  async getByDocument(docId: string) { return Array.from(pageStore.values()).filter(p => p.documentId === docId); },
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
