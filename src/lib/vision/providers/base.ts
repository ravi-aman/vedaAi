// @ts-nocheck
import OpenAI from "openai";
import type { VisionProviderConfig } from "@/lib/vision/provider";
import { AppError, ErrorCodes } from "@/lib/errors/codes";

/**
 * Shared OpenAI-compatible helpers — no process.env, no hardcoding.
 * All provider-specific values come from injected VisionProviderConfig.
 */

export function getOpenAIClient(cfg: VisionProviderConfig, opts?: { referer?: string }): OpenAI {
  if (!cfg.apiKey) throw new AppError(ErrorCodes.CONFIGURATION_ERROR, `${cfg.id.toUpperCase()}_API_KEY missing for Vision provider ${cfg.id}`);
  if (!cfg.baseUrl) throw new AppError(ErrorCodes.CONFIGURATION_ERROR, `${cfg.id.toUpperCase()}_BASE_URL missing`);
  if (!cfg.model) throw new AppError(ErrorCodes.CONFIGURATION_ERROR, `${cfg.id.toUpperCase()}_VISION_MODEL missing but ${cfg.id} is enabled`);
  const sanitizedBase = cfg.baseUrl.replace(/\/chat\/completions\/?$/, "").replace(/\/$/, "");
  const headers: Record<string, string> = {};
  // OpenRouter needs referral headers; NVIDIA/OpenCode not but harmless
  if (cfg.id === "openrouter" && opts?.referer) {
    headers["HTTP-Referer"] = opts.referer;
    headers["X-Title"] = "VedaAI Vision";
  }
  return new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: sanitizedBase,
    timeout: 90000,
    maxRetries: 0,
    defaultHeaders: Object.keys(headers).length ? headers : undefined,
  });
}

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => {
      const err: any = new Error(`${label} timed out after ${ms}ms`);
      err.code = "ETIMEDOUT";
      err.status = 408;
      reject(err);
    }, ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t)) as Promise<T>;
}

export type ClassifiedError = { type: string; retryable: boolean; status?: number; code: string };

export function classifyError(e: any): ClassifiedError {
  const status = e?.status || e?.response?.status || e?.cause?.status;
  const msg = String(e?.message || "").toLowerCase();
  const code = e?.code || "";
  if (status === 401 || status === 403) return { type: "authentication", retryable: false, status, code: "AUTH_ERROR" };
  if (status === 402) {
    const isCredit = msg.includes("credits") || msg.includes("afford") || msg.includes("max_tokens") || msg.includes("in_flight");
    return { type: isCredit ? "credit_exhausted" : "payment_required", retryable: false, status, code: "CREDIT_EXHAUSTED" };
  }
  if (status === 404) return { type: "invalid_model_or_endpoint", retryable: false, status, code: "MODEL_NOT_FOUND" };
  if (status === 429) return { type: "rate_limit", retryable: true, status, code: "RATE_LIMIT" };
  if (status === 400) {
    const isUnsupported = msg.includes("image") || msg.includes("support image") || msg.includes("no endpoints");
    return { type: isUnsupported ? "unsupported_feature" : "invalid_request", retryable: false, status, code: isUnsupported ? "UNSUPPORTED_FEATURE" : "MODEL_OUTPUT_INVALID" };
  }
  if (status >= 500 && status < 600) return { type: "provider_server", retryable: true, status, code: "SERVER_ERROR" };
  if (e?.code === "ETIMEDOUT" || msg.includes("timeout") || msg.includes("aborted")) return { type: "network_timeout", retryable: true, status: status || 408, code: "TIMEOUT" };
  if (code === "ETIMEDOUT" || code === "TIMEOUT") return { type: "network_timeout", retryable: true, status: 408, code: "TIMEOUT" };
  // MODEL_OUTPUT_INVALID for schema failures
  if (msg.includes("parse failed") || msg.includes("schema") || msg.includes("model_output_invalid")) return { type: "schema_error", retryable: false, status, code: "MODEL_OUTPUT_INVALID" };
  return { type: "unknown", retryable: false, status, code: "UNKNOWN_ERROR" };
}

/**
 * Fallback policy — which error types should trigger provider fallback (if VISION_AUTO_FALLBACK=true)
 */
export function shouldFallbackForError(classified: ClassifiedError): boolean {
  const fallbackCodes = new Set(["CONFIGURATION_ERROR", "AUTH_ERROR", "MODEL_NOT_FOUND", "CREDIT_EXHAUSTED", "UNSUPPORTED_FEATURE", "RATE_LIMIT", "TIMEOUT", "NETWORK_ERROR", "SERVER_ERROR", "MODEL_OUTPUT_INVALID", "SCHEMA_ERROR"]);
  // All except unknown? For now allow fallback for all retryable or config/auth etc, but not for unknown that wasn't retried?
  return fallbackCodes.has(classified.code) || classified.retryable;
}

export function logProviderError(opts: { provider: string; model: string; endpoint: string; status?: number; errorType: string; retryCount: number; message: string }) {
  console.error(JSON.stringify({ provider: opts.provider, model: opts.model, endpoint: opts.endpoint, status: opts.status, errorType: opts.errorType, retryCount: opts.retryCount, message: opts.message.slice(0, 500), timestamp: new Date().toISOString() }));
}

export async function withRetry<T>(fn: () => Promise<T>, providerId: string, model: string, maxRetries: number = 1): Promise<T> {
  const endpoint = "/chat/completions";
  let attempt = 0;
  // maxRetries from config is fallback retries before chain; within provider we retry only for retryable errors up to maxRetries+1 internally?
  // For simplicity, use max 3 for retryable, but limited by maxRetries
  const max = Math.max(1, Math.min(3, maxRetries + 1));
  let lastErr: any;
  while (attempt < max) {
    try { return await fn(); } catch (e: any) {
      lastErr = e;
      const classified = classifyError(e);
      const providerMsg = e?.error?.message || e?.response?.data?.error?.message || e?.message || String(e);
      logProviderError({ provider: providerId, model, endpoint, status: classified.status, errorType: classified.type, retryCount: attempt, message: providerMsg });
      if (!classified.retryable) {
        const err: any = new Error(`${providerId} ${classified.type} (${classified.status}): ${providerMsg.slice(0, 300)}`);
        err.status = classified.status;
        err.code = classified.code;
        err.type = classified.type;
        throw err;
      }
      attempt++;
      if (attempt >= max) {
        const err: any = new Error(`${providerId} failed after ${attempt} retries (${classified.type}): ${providerMsg.slice(0, 300)}`);
        err.status = classified.status;
        err.code = classified.code;
        err.type = classified.type;
        throw err;
      }
      const delay = Math.pow(2, attempt) * 600 + Math.random() * 400;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export function stripFences(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return t;
}

export function extractJsonObject(s: string): string {
  const t = s.trim();
  let start = t.indexOf("{");
  if (start === -1) return t;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inString) {
      if (escaped) { escaped = false; }
      else if (ch === "\\") { escaped = true; }
      else if (ch === '"') { inString = false; }
      continue;
    } else {
      if (ch === '"') { inString = true; continue; }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
  }
  if (end !== -1 && start !== -1) return t.slice(start, end + 1);
  const last = t.lastIndexOf("}");
  if (start !== -1 && last !== -1 && last > start) return t.slice(start, last + 1);
  return t;
}

export async function saveMalformedRawArtifact(provider: string, label: string, raw: string, error: string): Promise<void> {
  try {
    const { default: fs } = await import("fs/promises");
    const { default: path } = await import("path");
    const { default: os } = await import("os");
    const dir = path.join(os.tmpdir(), "veda-ai", "vision-malformed");
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`);
    const payload = { provider, label, error: error.slice(0, 1000), raw: raw.slice(0, 20000), timestamp: new Date().toISOString() };
    await fs.writeFile(file, JSON.stringify(payload, null, 2), "utf-8");
    console.error(JSON.stringify({ provider, event: "vision_malformed_saved", label, file, rawLen: raw.length, error: error.slice(0, 300) }));
    try {
      const artDir = path.join(process.cwd(), "artifacts", "vision-malformed");
      await fs.mkdir(artDir, { recursive: true });
      await fs.writeFile(path.join(artDir, `${label}-${Date.now()}.json`), JSON.stringify(payload, null, 2), "utf-8");
    } catch {}
  } catch {}
}

export function buildMultimodalUserContent(text: string, pages: any[]): { content: any[]; imageCount: number; payloadKb: number } {
  const content: any[] = [{ type: "text", text }];
  let imageCount = 0;
  let payloadBytes = Buffer.byteLength(text, "utf-8");
  for (const p of pages.slice(0, 5)) {
    const b64 = p.imageBase64;
    if (!b64) continue;
    if (b64.startsWith("http://") || b64.startsWith("https://")) {
      content.push({ type: "image_url", image_url: { url: b64 } });
      imageCount++;
      payloadBytes += Buffer.byteLength(b64, "utf-8");
      continue;
    }
    const mime = p.mimeType || "image/png";
    const isPdf = mime === "application/pdf" || b64.startsWith("JVBER") || b64.startsWith("JVBERi");
    if (isPdf) {
      continue;
    }
    const url = b64.startsWith("data:") ? b64 : `data:${mime};base64,${b64}`;
    content.push({ type: "image_url", image_url: { url } });
    imageCount++;
    payloadBytes += Buffer.byteLength(b64, "utf-8");
  }
  return { content, imageCount, payloadKb: Math.round(payloadBytes / 1024) };
}
