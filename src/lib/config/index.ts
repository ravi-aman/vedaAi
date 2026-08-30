import { z } from "zod";
import * as dotenv from "dotenv";
// Load .env for tsx scripts (next dev loads automatically, but tsx does not)
try { dotenv.config(); } catch {}

const OPENROUTER_DEFAULT_MODEL = "qwen/qwen3-vl-32b-instruct";
const OPENROUTER_DEFAULT_BASE = "https://openrouter.ai/api/v1";

const envSchema = z.object({
  // Canonical LLM provider — OpenRouter + Qwen3-VL (legacy opencode-zen/openai accepted & migrated)
  AI_PROVIDER: z
    .string()
    .default("openrouter")
    .transform((v) => {
      const s = v.trim().toLowerCase();
      if (s === "opencode-zen" || s === "openai" || s === "openai-compatible") return "openrouter";
      return s;
    })
    .pipe(z.enum(["openrouter", "mock"])),
  AI_MODEL: z.string().default(OPENROUTER_DEFAULT_MODEL),
  AI_API_KEY: z.string().optional(), // deprecated alias for OPENROUTER_API_KEY
  AI_BASE_URL: z.string().optional().default(OPENROUTER_DEFAULT_BASE).transform((v) => {
    if (!v) return OPENROUTER_DEFAULT_BASE;
    // Migrate legacy opencode URL
    if (v.includes("opencode.ai")) return OPENROUTER_DEFAULT_BASE;
    return v;
  }).pipe(z.string().url().or(z.literal("")).transform((v) => v || OPENROUTER_DEFAULT_BASE)),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default(OPENROUTER_DEFAULT_MODEL),
  OPENROUTER_BASE_URL: z.string().optional().default(OPENROUTER_DEFAULT_BASE).transform((v) => {
    if (!v) return OPENROUTER_DEFAULT_BASE;
    if (v.includes("opencode.ai")) return OPENROUTER_DEFAULT_BASE;
    return v;
  }).pipe(z.string().url().or(z.literal("")).transform((v) => v || OPENROUTER_DEFAULT_BASE)),
  // mapping thresholds single source
  MAPPING_HIGH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),
  MAPPING_REVIEW_THRESHOLD: z.coerce.number().min(0).max(1).default(0.5),
  MAX_FILE_SIZE_MB: z.coerce.number().default(100),
  MAX_PAGES: z.coerce.number().default(50),
  MAX_CONCURRENT_AI: z.coerce.number().default(2),
  // AI timeouts (ms) — fail fast instead of hanging
  EXTRACT_TIMEOUT_MS: z.coerce.number().default(60000),
  DETECT_TIMEOUT_MS: z.coerce.number().default(60000),
  MAPPING_TIMEOUT_MS: z.coerce.number().default(30000),
  // OCR — Local PaddleOCR (PP-StructureV3) or legacy Textract
  OCR_PROVIDER: z.enum(["textract", "mock", "local", "paddleocr"]).default("local"),
  // Local OCR (PaddleOCR) settings
  LOCAL_OCR_ENGINE: z.string().default("paddleocr"),
  LOCAL_OCR_PIPELINE: z.string().default("pp_structure_v3"),
  LOCAL_OCR_DEVICE: z.string().default("cpu"),
  LOCAL_OCR_CONCURRENCY: z.coerce.number().default(2),
  LOCAL_OCR_LANGUAGE: z.string().default("en"),
  LOCAL_OCR_VERSION: z.string().default("PP-OCRv5"),
  LOCAL_OCR_PYTHON: z.string().default("python"),
  LOCAL_OCR_TIMEOUT_MS: z.coerce.number().default(600000),
  // Legacy Textract (deprecated, keep for migration period)
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
  // Vision — parallel to Textract (evidence-only, grounded to Textract geometry)
  VISION_PROVIDER: z
    .string()
    .default("auto")
    .transform((v) => {
      const s = v.trim().toLowerCase();
      if (s === "opencode-zen") return "openrouter";
      return s;
    })
    .pipe(z.enum(["openrouter", "mock", "auto", "disabled"])),
  VISION_MODEL: z.string().default(OPENROUTER_DEFAULT_MODEL),
  VISION_API_KEY: z.string().optional(),
  VISION_BASE_URL: z.string().optional().default(OPENROUTER_DEFAULT_BASE).transform((v) => {
    if (!v) return OPENROUTER_DEFAULT_BASE;
    if (v.includes("opencode.ai")) return OPENROUTER_DEFAULT_BASE;
    return v;
  }).pipe(z.string().url().or(z.literal("")).transform((v) => v || OPENROUTER_DEFAULT_BASE)),
  VISION_ENABLED: z.coerce.boolean().default(true),
  // Document-aware routing: not universal 3-page limit — default 50 allows full QP Vision when needed; answerSheet always all pages
  VISION_MAX_PAGES: z.coerce.number().int().min(1).max(50).default(50),
  VISION_TIMEOUT_MS: z.coerce.number().default(90000),
  // Targeted adjudication budget (Phase 50)
  MAPPING_VISION_MAX_ADJUDICATIONS: z.coerce.number().int().min(0).max(20).default(6),
  MAPPING_VISION_TIMEOUT_MS: z.coerce.number().default(30000),
  // Supabase — supports both new publishable (sb_publishable_...) and legacy anon (eyJ...) keys
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
    const fallback = envSchema.parse({});
    cached = {
      ...fallback,
      pipelineVersion: process.env.npm_package_version || "0.1.0",
    };
    if (fallback.AI_PROVIDER !== "mock" && !fallback.OPENROUTER_API_KEY && !fallback.AI_API_KEY) {
      console.warn("[config] OPENROUTER_API_KEY missing but AI_PROVIDER != mock — will fail at runtime with CONFIGURATION_ERROR");
    }
    return cached;
  }
  cached = {
    ...parsed.data,
    pipelineVersion: process.env.npm_package_version || "0.1.0",
  };
  return cached;
}

export function clearConfigCache() {
  cached = null;
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
  model: OPENROUTER_DEFAULT_MODEL,
  baseUrl: OPENROUTER_DEFAULT_BASE,
  endpoint: `${OPENROUTER_DEFAULT_BASE}/chat/completions`,
} as const;
