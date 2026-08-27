import { z } from "zod";

const envSchema = z.object({
  AI_PROVIDER: z.enum(["opencode-zen", "openai", "openai-compatible", "mock"]).default("opencode-zen"),
  AI_MODEL: z.string().default("laguna-s-2.1-free"),
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().url().optional().or(z.literal("")).default("https://opencode.ai/zen/v1"),
  // opencode agent compatibility (separate from app runtime)
  OPENCODE_DEFAULT_MODEL: z.string().optional(),
  OPENCODE_API_KEY: z.string().optional(),
  OPENCODE_API_BASE: z.string().optional(),
  // mapping thresholds single source
  MAPPING_HIGH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),
  MAPPING_REVIEW_THRESHOLD: z.coerce.number().min(0).max(1).default(0.5),
  MAX_FILE_SIZE_MB: z.coerce.number().default(100),
  MAX_PAGES: z.coerce.number().default(50),
  MAX_CONCURRENT_AI: z.coerce.number().default(2),
  // AI timeouts (ms) — fail fast instead of hanging
  EXTRACT_TIMEOUT_MS: z.coerce.number().default(30000),
  DETECT_TIMEOUT_MS: z.coerce.number().default(30000),
  MAPPING_TIMEOUT_MS: z.coerce.number().default(30000),
  // OCR — Amazon Textract (async PDF)
  OCR_PROVIDER: z.enum(["textract", "mock"]).default("textract"),
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
  OCR_OPERATION_TIMEOUT_MS: z.coerce.number().default(300000),
  OCR_POLL_INTERVAL_MS: z.coerce.number().default(5000),
  OCR_MAX_RETRIES: z.coerce.number().default(3),
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional().or(z.literal("")),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
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
    if (fallback.AI_PROVIDER !== "mock" && !fallback.AI_API_KEY) {
      console.warn("[config] AI_API_KEY missing but AI_PROVIDER != mock — will fail at runtime with CONFIGURATION_ERROR");
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
  if (cfg.AI_PROVIDER !== "mock" && !cfg.AI_API_KEY) {
    throw new Error(
      `CONFIGURATION_ERROR: AI_PROVIDER=${cfg.AI_PROVIDER} requires AI_API_KEY. Set AI_API_KEY or use AI_PROVIDER=mock for tests.`
    );
  }
  // For opencode-zen, base URL must be zen
  if (cfg.AI_PROVIDER === "opencode-zen" && !cfg.AI_BASE_URL.includes("opencode.ai")) {
    console.warn(`[config] AI_PROVIDER=opencode-zen expects AI_BASE_URL https://opencode.ai/zen/v1, got ${cfg.AI_BASE_URL}`);
  }
  return cfg;
}

export function isSupabaseConfigured(): boolean {
  const cfg = getConfig();
  return Boolean(cfg.NEXT_PUBLIC_SUPABASE_URL && cfg.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function isAwsOcrConfigured(): boolean {
  const cfg = getConfig() as any;
  return Boolean(cfg.AWS_S3_BUCKET && cfg.AWS_REGION);
}

export function requireAwsOcrConfig(): void {
  const cfg = getConfig() as any;
  if (cfg.OCR_PROVIDER === "mock") return;
  const missing: string[] = [];
  if (!cfg.AWS_REGION) missing.push("AWS_REGION");
  if (!cfg.AWS_S3_BUCKET) missing.push("AWS_S3_BUCKET");
  // Credentials: either explicit keys or IAM role (no keys needed). Only fail if bucket missing.
  if (missing.length > 0) {
    throw new Error(`OCR_CONFIGURATION_ERROR: Missing ${missing.join(", ")}. Set env or use OCR_PROVIDER=mock for tests.`);
  }
}

// Deprecated aliases — kept for migration grep to fail loudly if old code remains
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
