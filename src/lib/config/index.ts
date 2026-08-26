import { z } from "zod";

const envSchema = z.object({
  AI_PROVIDER: z.enum(["openai", "openai-compatible", "mock"]).default("mock"),
  AI_MODEL: z.string().default("gpt-4o-mini"),
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().url().optional().or(z.literal("")),
  OPENCODE_DEFAULT_MODEL: z.string().optional(),
  OPENCODE_API_KEY: z.string().optional(),
  OPENCODE_API_BASE: z.string().optional(),
  // mapping thresholds single source
  MAPPING_HIGH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),
  MAPPING_REVIEW_THRESHOLD: z.coerce.number().min(0).max(1).default(0.5),
  MAX_FILE_SIZE_MB: z.coerce.number().default(25),
  MAX_PAGES: z.coerce.number().default(50),
  MAX_CONCURRENT_AI: z.coerce.number().default(2),
});

export type AppConfig = z.infer<typeof envSchema> & {
  pipelineVersion: string;
};

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // In production, fail clearly; in dev allow defaults
    console.error("Config validation failed", parsed.error.flatten());
    // Use defaults where possible
    const fallback = envSchema.parse({});
    cached = {
      ...fallback,
      pipelineVersion: process.env.npm_package_version || "0.1.0",
    };
    // validate required for non-mock
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

export function requireAiConfig(): AppConfig {
  const cfg = getConfig();
  if (cfg.AI_PROVIDER !== "mock" && !cfg.AI_API_KEY) {
    throw new Error(
      `CONFIGURATION_ERROR: AI_PROVIDER=${cfg.AI_PROVIDER} requires AI_API_KEY. Set AI_API_KEY or use AI_PROVIDER=mock.`
    );
  }
  return cfg;
}

export const mappingThresholds = {
  get high() {
    return getConfig().MAPPING_HIGH_THRESHOLD;
  },
  get review() {
    return getConfig().MAPPING_REVIEW_THRESHOLD;
  },
};
