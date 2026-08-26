import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
    proxyClientMaxBodySize: 100 * 1024 * 1024,
  },
  // Route handlers (upload) need increased body size too; serverActions limit only covers actions
  // For App Router route handlers the limit is configured via `api` bodyParser in pages router, but for app router
  // we rely on Next's default which is 4MB on Vercel — locally we handle via streaming formData.
  // This config documents the intent; actual upload validation is MAX_FILE_SIZE_MB in src/lib/config.
};

export default nextConfig;
