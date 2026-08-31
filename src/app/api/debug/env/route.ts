import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Do NOT leak full secrets — only metadata
  const cfg = (() => {
    try {
      return getConfig() as any;
    } catch (e: any) {
      return { _configError: e.message };
    }
  })();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  return NextResponse.json({
    vercel: Boolean(process.env.VERCEL),
    vercelEnv: process.env.VERCEL_ENV || null,
    nodeEnv: process.env.NODE_ENV,
    // raw env presence (without leaking full value)
    env: {
      NEXT_PUBLIC_SUPABASE_URL: url ? `${url.slice(0, 30)}... (len=${url.length})` : "MISSING",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable ? `present len=${publishable.length} prefix=${publishable.slice(0, 15)}...` : "MISSING",
      SUPABASE_SERVICE_ROLE_KEY: serviceKey ? `present len=${serviceKey.length} prefix=${serviceKey.slice(0, 10)}...` : "MISSING",
      OCR_PROVIDER: process.env.OCR_PROVIDER || "(default local)",
      AWS_S3_BUCKET: process.env.AWS_S3_BUCKET || "MISSING",
      AWS_REGION: process.env.AWS_REGION || "MISSING (default us-east-1)",
    },
    // parsed config view
    parsed: {
      NEXT_PUBLIC_SUPABASE_URL: cfg.NEXT_PUBLIC_SUPABASE_URL ? `${String(cfg.NEXT_PUBLIC_SUPABASE_URL).slice(0, 30)}...` : "MISSING/INVALID",
      hasServiceKey: Boolean(cfg.SUPABASE_SERVICE_ROLE_KEY),
      serviceKeyLen: cfg.SUPABASE_SERVICE_ROLE_KEY?.length || 0,
      OCR_PROVIDER: cfg.OCR_PROVIDER,
      AWS_S3_BUCKET: cfg.AWS_S3_BUCKET || "MISSING",
      PROCESSING_BACKEND: cfg.PROCESSING_BACKEND,
      isDurableConfigured: Boolean(cfg.NEXT_PUBLIC_SUPABASE_URL && cfg.SUPABASE_SERVICE_ROLE_KEY),
    },
    configError: (cfg as any)._configError || null,
    hint: "If hasServiceKey is false but Vercel shows set, check: 1) Env is for Production not only Preview, 2) Redeploy without cache, 3) No quotes/spaces in value, 4) Use service_role JWT not publishable key",
  });
}
