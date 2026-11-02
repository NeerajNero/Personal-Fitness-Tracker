import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build id for Settings → Diagnostics and the bot's `diag`: Vercel's commit SHA (empty locally) and the build time.
  env: {
    NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7),
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  // Every screen is per-request and per-user; cacheComponents would force a
  // Suspense boundary around each auth()/db call for no benefit. See CLAUDE.md.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
