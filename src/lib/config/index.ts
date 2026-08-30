import { z } from "zod";
import * as dotenv from "dotenv";
// Load .env for tsx scripts (next dev loads automatically, but tsx does not)
try { dotenv.config(); } catch {}

// ── Single source of defaults — do NOT duplicate in adapters ──────────────
const DEFAULTS = {
  openrouterBase: "https://openrouter.ai/api/v1",
  openrouterModel: "qwen/qwen3-vl-32b-instruct",
  nvidiaBase: "https://integrate.api.nvidia.com/v1",
  nvidiaModel: "meta/llama-3.2-90b-vision-instruct",
  opencodeBase: "https://opencode.ai/zen/v1",
  opencodeModel: "mimo-v2.5-free",
} as const;

// Keep legacy constants for backward compat (deprecated, will be removed)
const OPENROUTER_DEFAULT_MODEL = DEFAULTS.openrouterModel;
const OPENROUTER_DEFAULT_BASE = DEFAULTS.openrouterBase;

import type { VisionProviderId, VisionProviderConfig as ProviderConfig, VisionRuntimeConfig as RuntimeConfig } from "@/lib/vision/provider";
const VISION_PROVIDER_IDS = ["nvidia", "openrouter", "opencode"] as const;
export type { VisionProviderId };

// Helper: env booleans come as strings "true"/"false" — z.coerce.boolean treats "false" as true, so custom
const envBool = (def: boolean) =>
  z.preprocess((v) => {
    if (v === undefined || v === null || v === "") return def;
    if (typeof v === "boolean") return v;
    const s = String(v).trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
    if (s === "false" || s === "0" || s === "no" || s === "off") return false;
    return Boolean(v);
  }, z.boolean().default(def));

function parseProviderOrder(val: string | undefined): VisionProviderId[] {
  const fallback: VisionProviderId[] = ["openrouter", "opencode", "nvidia"];
  if (!val || !val.trim()) return fallback;
  const parts = val.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const ids: VisionProviderId[] = [];
  for (const p of parts) {
    if ((VISION_PROVIDER_IDS as readonly string[]).includes(p)) ids.push(p as VisionProviderId);
    else throw new Error(`CONFIGURATION_ERROR: VISION_PROVIDER_ORDER contains unknown provider id "${p}". Allowed: ${VISION_PROVIDER_IDS.join(",")}`);
  }
  return ids.length ? ids : fallback;
}

const envSchema = z.object({
  // ── Canonical LLM provider (legacy, kept for AI provider migration) ──
  AI_PROVIDER: z
    .string()
    .default("openrouter")
    .transform((v) => {
      const s = v.trim().toLowerCase();
      if (s === "opencode-zen" || s === "openai" || s === "openai-compatible") return "openrouter";
      return s;
    })
    .pipe(z.enum(["openrouter", "mock"])),
  AI_MODEL: z.string().default(DEFAULTS.openrouterModel),
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().optional().default(DEFAULTS.openrouterBase).transform((v) => {
    if (!v) return DEFAULTS.openrouterBase;
    if (v.includes("opencode.ai")) return DEFAULTS.openrouterBase;
    return v;
  }).pipe(z.string().url().or(z.literal("")).transform((v) => v || DEFAULTS.openrouterBase)),
  // Legacy OpenRouter vars (deprecated, migrate to OPENROUTER_VISION_MODEL etc)
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().optional().default(DEFAULTS.openrouterBase).transform((v) => {
    if (!v) return DEFAULTS.openrouterBase;
    if (v.includes("opencode.ai")) return DEFAULTS.openrouterBase;
    return v;
  }).pipe(z.string().url().or(z.literal("")).transform((v) => v || DEFAULTS.openrouterBase)),
  // ── New provider configs — source of truth ──
  VISION_PROVIDER_ORDER: z.string().default("openrouter,opencode,nvidia").transform(v => v.trim()),
  VISION_AUTO_FALLBACK: envBool(true),
  // OpenRouter
  OPENROUTER_ENABLED: envBool(true),
  OPENROUTER_VISION_MODEL: z.string().optional(),
  OPENROUTER_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(1),
  // OpenCode
  OPENCODE_ENABLED: envBool(true),
  OPENCODE_API_KEY: z.string().optional(),
  OPENCODE_BASE_URL: z.string().optional().default(DEFAULTS.opencodeBase).transform(v => {
    if (!v) return DEFAULTS.opencodeBase;
    return v;
  }).pipe(z.string().url().or(z.literal("")).transform(v => v || DEFAULTS.opencodeBase)),
  OPENCODE_VISION_MODEL: z.string().optional(),
  OPENCODE_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(1),
  // NVIDIA
  NVIDIA_ENABLED: envBool(false),
  NVIDIA_API_KEY: z.string().optional(),
  NVIDIA_BASE_URL: z.string().optional().default(DEFAULTS.nvidiaBase).transform(v => {
    if (!v) return DEFAULTS.nvidiaBase;
    return v;
  }).pipe(z.string().url().or(z.literal("")).transform(v => v || DEFAULTS.nvidiaBase)),
  NVIDIA_VISION_MODEL: z.string().optional(),
  NVIDIA_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(1),
  // ── Global Vision runtime ──
  VISION_GLOBAL_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(1),
  VISION_BATCH_SIZE: z.coerce.number().int().min(1).max(10).default(3),
  VISION_TIMEOUT_MS: z.coerce.number().default(90000),
  VISION_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(1),
  // Deprecated legacy vision vars (kept for migration, new vars take precedence)
  VISION_PROVIDER: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const s = v.trim().toLowerCase();
      if (s === "opencode-zen") return "openrouter";
      return s;
    }),
  VISION_MODEL: z.string().optional(),
  VISION_API_KEY: z.string().optional(),
  VISION_BASE_URL: z.string().optional().transform((v) => {
    if (!v) return undefined;
    if (v.includes("opencode.ai")) return DEFAULTS.openrouterBase;
    return v;
  }).pipe(z.string().url().or(z.literal("")).optional().transform((v) => v || undefined) as any),
  VISION_ENABLED: envBool(true),
  VISION_MAX_PAGES: z.coerce.number().int().min(1).max(50).default(50),
  MAPPING_VISION_MAX_ADJUDICATIONS: z.coerce.number().int().min(0).max(20).default(6),
  MAPPING_VISION_TIMEOUT_MS: z.coerce.number().default(30000),
  // mapping thresholds
  MAPPING_HIGH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),
  MAPPING_REVIEW_THRESHOLD: z.coerce.number().min(0).max(1).default(0.5),
  MAX_FILE_SIZE_MB: z.coerce.number().default(100),
  MAX_PAGES: z.coerce.number().default(50),
  MAX_CONCURRENT_AI: z.coerce.number().default(2),
  EXTRACT_TIMEOUT_MS: z.coerce.number().default(60000),
  DETECT_TIMEOUT_MS: z.coerce.number().default(60000),
  MAPPING_TIMEOUT_MS: z.coerce.number().default(30000),
  // OCR
  OCR_PROVIDER: z.enum(["textract", "mock", "local", "paddleocr"]).default("local"),
  LOCAL_OCR_ENGINE: z.string().default("paddleocr"),
  LOCAL_OCR_PIPELINE: z.string().default("pp_structure_v3"),
  LOCAL_OCR_DEVICE: z.string().default("cpu"),
  LOCAL_OCR_CONCURRENCY: z.coerce.number().default(2),
  LOCAL_OCR_LANGUAGE: z.string().default("en"),
  LOCAL_OCR_VERSION: z.string().default("PP-OCRv5"),
  LOCAL_OCR_PYTHON: z.string().default("python"),
  LOCAL_OCR_TIMEOUT_MS: z.coerce.number().default(600000),
  AWS_REGION: z.string().default("us-east-1"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_TEXTRACT_OUTPUT_BUCKET: z.string().optional(),
  AWS_S3_INPUT_PREFIX: z.string().default("ocr-input"),
  AWS_S3_OUTPUT_PREFIX: z.string().default("ocr-output"),
  AWS_SNS_TOPIC_ARN: z.string().optional(),
  AWS_SNS_ROLE_ARN: z.string().optional(),
  AWS_SQS_QUEUE_URL: z.string().optional(),
  OCR_OPERATION_TIMEOUT_MS: z.coerce.number().default(600000),
  OCR_POLL_INTERVAL_MS: z.coerce.number().default(5000),
  OCR_MAX_RETRIES: z.coerce.number().default(3),
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional().or(z.literal("")),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  GUEST_RESULT_GRACE_PERIOD_MS: z.coerce.number().default(90000),
  NEXT_PUBLIC_APP_URL: z.string().url().optional().or(z.literal("")),
});

export type AppConfig = z.infer<typeof envSchema> & {
  pipelineVersion: string;
};

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Config validation failed", parsed.error.flatten());
    // Try to surface provider order error clearly
    const orderErr = parsed.error.issues.find(i => String(i.path).includes("VISION_PROVIDER_ORDER"));
    if (orderErr) {
      throw new Error(`CONFIGURATION_ERROR: ${orderErr.message}`);
    }
    const fallback = envSchema.parse({});
    cached = {
      ...fallback,
      pipelineVersion: process.env.npm_package_version || "0.1.0",
    };
    if (fallback.AI_PROVIDER !== "mock" && !(fallback as any).OPENROUTER_API_KEY && !(fallback as any).AI_API_KEY) {
      console.warn("[config] OPENROUTER_API_KEY missing but AI_PROVIDER != mock — will fail at runtime with CONFIGURATION_ERROR");
    }
    return cached;
  }
  // Validate VISION_PROVIDER_ORDER contains known ids (extra check for trim edge)
  try {
    parseProviderOrder((parsed.data as any).VISION_PROVIDER_ORDER);
  } catch (e: any) {
    console.error("Config validation failed: VISION_PROVIDER_ORDER", e.message);
    throw e;
  }
  cached = {
    ...parsed.data,
    pipelineVersion: process.env.npm_package_version || "0.1.0",
  };
  // Deprecation warnings for legacy vars (do not override new)
  const raw: any = parsed.data;
  if (process.env.VISION_PROVIDER && process.env.VISION_PROVIDER_ORDER === undefined) {
    console.warn("[config] DEPRECATED: VISION_PROVIDER is legacy, use VISION_PROVIDER_ORDER. Legacy value ignored if VISION_PROVIDER_ORDER set.");
  }
  if (process.env.OPENROUTER_MODEL && !process.env.OPENROUTER_VISION_MODEL) {
    console.warn("[config] DEPRECATED: OPENROUTER_MODEL → use OPENROUTER_VISION_MODEL. Migrating automatically.");
  }
  if (process.env.VISION_MODEL && !raw.OPENROUTER_VISION_MODEL) {
    // do not auto-migrate VISION_MODEL to new — log
    console.warn("[config] DEPRECATED: VISION_MODEL → use OPENROUTER_VISION_MODEL / NVIDIA_VISION_MODEL / OPENCODE_VISION_MODEL");
  }
  return cached;
}

export function clearConfigCache() {
  cached = null;
}

// ── Vision normalized config (re-export canonical types from provider) ─────
export type VisionProviderConfig = ProviderConfig;
export type VisionRuntimeConfig = RuntimeConfig & {
  providerOrder: VisionProviderId[];
  autoFallback: boolean;
  globalConcurrency: number;
  batchSize: number;
  timeoutMs: number;
  maxRetries: number;
  maxAdjudications: number;
};

export function getVisionRuntimeConfig(): VisionRuntimeConfig {
  const cfg: any = getConfig();
  return {
    providerOrder: parseProviderOrder(cfg.VISION_PROVIDER_ORDER),
    autoFallback: Boolean(cfg.VISION_AUTO_FALLBACK),
    globalConcurrency: cfg.VISION_GLOBAL_CONCURRENCY,
    batchSize: cfg.VISION_BATCH_SIZE,
    timeoutMs: cfg.VISION_TIMEOUT_MS,
    maxRetries: cfg.VISION_MAX_RETRIES,
    maxAdjudications: cfg.MAPPING_VISION_MAX_ADJUDICATIONS,
  };
}

export function getVisionProviderConfigs(): Record<VisionProviderId, VisionProviderConfig> {
  const cfg: any = getConfig();
  // Resolve OpenRouter model: precedence new → legacy OPENROUTER_MODEL → legacy AI_MODEL → default
  const openrouterModel = cfg.OPENROUTER_VISION_MODEL
    || cfg.OPENROUTER_MODEL
    || cfg.VISION_MODEL
    || cfg.AI_MODEL
    || DEFAULTS.openrouterModel;
  // But if new var not set and legacy fallback was actually default, we still get default — that's intentional.
  // If provider disabled, model may be empty — but we still provide it for validation when enabled.
  // For strict "no hidden fallback": if enabled && model is empty string → will be error at requireVisionConfig.
  // To enforce, we check if the raw env for that provider was explicitly missing.
  // However we want default canonical when env not set and provider enabled — that's not hidden, it's the typed default.
  // So we keep default as above.

  const openrouterBase = cfg.OPENROUTER_BASE_URL || DEFAULTS.openrouterBase;
  const nvidiaBase = cfg.NVIDIA_BASE_URL || DEFAULTS.nvidiaBase;
  const opencodeBase = cfg.OPENCODE_BASE_URL || DEFAULTS.opencodeBase;

  return {
    openrouter: {
      id: "openrouter",
      enabled: Boolean(cfg.OPENROUTER_ENABLED),
      apiKey: cfg.OPENROUTER_API_KEY || cfg.VISION_API_KEY || cfg.AI_API_KEY || "",
      baseUrl: openrouterBase,
      model: cfg.OPENROUTER_VISION_MODEL || cfg.OPENROUTER_MODEL || cfg.VISION_MODEL || DEFAULTS.openrouterModel,
      maxConcurrency: cfg.OPENROUTER_MAX_CONCURRENCY,
    },
    nvidia: {
      id: "nvidia",
      enabled: Boolean(cfg.NVIDIA_ENABLED),
      apiKey: cfg.NVIDIA_API_KEY || "",
      baseUrl: nvidiaBase,
      model: cfg.NVIDIA_VISION_MODEL || DEFAULTS.nvidiaModel,
      maxConcurrency: cfg.NVIDIA_MAX_CONCURRENCY,
    },
    opencode: {
      id: "opencode",
      enabled: Boolean(cfg.OPENCODE_ENABLED),
      apiKey: cfg.OPENCODE_API_KEY || "",
      baseUrl: opencodeBase,
      model: cfg.OPENCODE_VISION_MODEL || DEFAULTS.opencodeModel,
      maxConcurrency: cfg.OPENCODE_MAX_CONCURRENCY,
    },
  };
}

export function getOrderedEnabledProviders(): VisionProviderConfig[] {
  const runtime = getVisionRuntimeConfig();
  const all = getVisionProviderConfigs();
  const ordered: VisionProviderConfig[] = [];
  for (const id of runtime.providerOrder) {
    const cfg = all[id];
    if (cfg.enabled) ordered.push(cfg);
    else console.log(JSON.stringify({ stage: "VISION", event: "provider_skipped_disabled", provider: id }));
  }
  return ordered;
}

export function requireVisionProviderConfig(id: VisionProviderId): VisionProviderConfig {
  const all = getVisionProviderConfigs();
  const cfg = all[id];
  if (!cfg.enabled) throw new Error(`CONFIGURATION_ERROR: provider ${id} is disabled (set ${id.toUpperCase()}_ENABLED=true)`);
  if (!cfg.model || !cfg.model.trim()) throw new Error(`CONFIGURATION_ERROR: ${id.toUpperCase()}_VISION_MODEL missing but ${id} is enabled. Set ${id.toUpperCase()}_VISION_MODEL or disable provider.`);
  if (!cfg.apiKey || !cfg.apiKey.trim()) {
    console.warn(JSON.stringify({ provider: id, event: "vision_key_missing", keyPresent: false, model: cfg.model }));
    throw new Error(`CONFIGURATION_ERROR: ${id.toUpperCase()}_API_KEY missing but ${id} is enabled. Set ${id.toUpperCase()}_API_KEY or disable provider.`);
  }
  // Validate baseUrl is url
  try { new URL(cfg.baseUrl); } catch { throw new Error(`CONFIGURATION_ERROR: ${id.toUpperCase()}_BASE_URL invalid: ${cfg.baseUrl}`); }
  return cfg;
}

export function validateVisionConfigOrThrow(): VisionRuntimeConfig {
  const runtime = getVisionRuntimeConfig();
  // Validate order has at least one enabled if any vision needed — but don't fail globally if all disabled (allowed: no vision)
  // Validate numeric ranges
  if (runtime.globalConcurrency < 1) throw new Error("CONFIGURATION_ERROR: VISION_GLOBAL_CONCURRENCY must be >=1");
  if (runtime.batchSize < 1) throw new Error("CONFIGURATION_ERROR: VISION_BATCH_SIZE must be >=1");
  if (runtime.timeoutMs < 1000) throw new Error("CONFIGURATION_ERROR: VISION_TIMEOUT_MS must be >=1000");
  // Validate each enabled provider has model/base
  const all = getVisionProviderConfigs();
  for (const id of runtime.providerOrder) {
    const cfg = all[id];
    if (cfg.enabled) {
      if (!cfg.model?.trim()) throw new Error(`CONFIGURATION_ERROR: ${id.toUpperCase()}_VISION_MODEL required when ${id} enabled`);
      if (!cfg.baseUrl?.trim()) throw new Error(`CONFIGURATION_ERROR: ${id.toUpperCase()}_BASE_URL required when ${id} enabled`);
      try { new URL(cfg.baseUrl); } catch { throw new Error(`CONFIGURATION_ERROR: ${id.toUpperCase()}_BASE_URL invalid`); }
    }
  }
  return runtime;
}

export function requireAiConfig(): AppConfig {
  const cfg = getConfig();
  const hasKey = Boolean((cfg as any).OPENROUTER_API_KEY || (cfg as any).AI_API_KEY);
  if (cfg.AI_PROVIDER !== "mock" && !hasKey) {
    throw new Error(
      `CONFIGURATION_ERROR: AI_PROVIDER=${cfg.AI_PROVIDER} requires OPENROUTER_API_KEY. Set OPENROUTER_API_KEY or use AI_PROVIDER=mock for tests.`
    );
  }
  return cfg;
}

export function isSupabaseConfigured(): boolean {
  const cfg = getConfig() as any;
  return Boolean(cfg.NEXT_PUBLIC_SUPABASE_URL && (cfg.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || cfg.NEXT_PUBLIC_SUPABASE_ANON_KEY));
}

export function getSupabasePublishableKey(): string | null {
  const cfg = getConfig() as any;
  return cfg.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || cfg.NEXT_PUBLIC_SUPABASE_ANON_KEY || null;
}

export function isAwsOcrConfigured(): boolean {
  const cfg = getConfig() as any;
  return Boolean(cfg.AWS_S3_BUCKET && cfg.AWS_REGION);
}

export function requireAwsOcrConfig(): void {
  const cfg = getConfig() as any;
  if (cfg.OCR_PROVIDER === "mock" || cfg.OCR_PROVIDER === "local" || cfg.OCR_PROVIDER === "paddleocr") return;
  const missing: string[] = [];
  if (!cfg.AWS_REGION) missing.push("AWS_REGION");
  if (!cfg.AWS_S3_BUCKET) missing.push("AWS_S3_BUCKET");
  if (missing.length > 0) {
    throw new Error(`OCR_CONFIGURATION_ERROR: Missing ${missing.join(", ")}. Set env or use OCR_PROVIDER=mock for tests.`);
  }
}

export function isGoogleOcrConfigured(): boolean {
  return isAwsOcrConfigured();
}
export function requireGoogleOcrConfig(): void {
  return requireAwsOcrConfig();
}

export const mappingThresholds = {
  get high() {
    return getConfig().MAPPING_HIGH_THRESHOLD;
  },
  get review() {
    return getConfig().MAPPING_REVIEW_THRESHOLD;
  },
};

export const guestGraceMs = {
  get value() {
    return getConfig().GUEST_RESULT_GRACE_PERIOD_MS;
  },
};

export const OPENROUTER_CANONICAL = {
  model: DEFAULTS.openrouterModel,
  baseUrl: DEFAULTS.openrouterBase,
  endpoint: `${DEFAULTS.openrouterBase}/chat/completions`,
} as const;
