import { getConfig, isSupabaseConfigured } from "@/lib/config";
import type { FileStorage } from "@/lib/storage";
import { LocalFileStorage } from "@/lib/storage";

export class SupabaseStorage implements FileStorage {
  private localFallback: LocalFileStorage;
  private bucket = "assessment-inputs";

  constructor() {
    this.localFallback = new LocalFileStorage();
  }

  private async getSupabase() {
    if (!isSupabaseConfigured()) throw new Error("Supabase not configured");
    const { createServiceClient } = await import("@/lib/supabase/server");
    return createServiceClient();
  }

  getPath(jobId: string, fileId: string) {
    return this.localFallback.getPath(jobId, fileId);
  }

  async save(jobId: string, fileId: string, buffer: Buffer, originalName: string): Promise<string> {
    if (!isSupabaseConfigured()) {
      return this.localFallback.save(jobId, fileId, buffer, originalName);
    }
    try {
      const supabase = await this.getSupabase();
      const path = `${jobId}/${fileId}`;
      const { error } = await (supabase as any).storage.from(this.bucket).upload(path, buffer, {
        contentType: "application/octet-stream",
        upsert: true,
      });
      if (error) throw error;
      // also save locally for processing fallback
      await this.localFallback.save(jobId, fileId, buffer, originalName).catch(() => {});
      return path;
    } catch (e) {
      console.warn("[storage] supabase upload failed, fallback to local", e);
      return this.localFallback.save(jobId, fileId, buffer, originalName);
    }
  }

  async read(jobId: string, fileId: string): Promise<Buffer> {
    if (!isSupabaseConfigured()) return this.localFallback.read(jobId, fileId);
    try {
      const supabase = await this.getSupabase();
      const path = `${jobId}/${fileId}`;
      const { data, error } = await (supabase as any).storage.from(this.bucket).download(path);
      if (error || !data) throw error || new Error("No data");
      const arrayBuf = await (data as Blob).arrayBuffer();
      return Buffer.from(arrayBuf);
    } catch {
      return this.localFallback.read(jobId, fileId);
    }
  }

  async exists(jobId: string, fileId: string): Promise<boolean> {
    if (!isSupabaseConfigured()) return this.localFallback.exists(jobId, fileId);
    try {
      const supabase = await this.getSupabase();
      const path = `${jobId}/${fileId}`;
      const { data } = await (supabase as any).storage.from(this.bucket).list(jobId, { search: fileId });
      if (data && data.length > 0) return true;
      return this.localFallback.exists(jobId, fileId);
    } catch {
      return this.localFallback.exists(jobId, fileId);
    }
  }

  async deleteJob(jobId: string): Promise<void> {
    await this.localFallback.deleteJob(jobId);
    if (!isSupabaseConfigured()) return;
    try {
      const supabase = await this.getSupabase();
      const { data } = await (supabase as any).storage.from(this.bucket).list(jobId);
      if (data && data.length > 0) {
        const paths = data.map((f: any) => `${jobId}/${f.name}`);
        await (supabase as any).storage.from(this.bucket).remove(paths);
      }
    } catch {}
  }
}
