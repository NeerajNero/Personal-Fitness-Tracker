import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every screen is per-request and single-user; cacheComponents would force a
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
