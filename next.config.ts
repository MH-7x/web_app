import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  // native / ESM-only packages that must be loaded by Node, not bundled (the SEO audit crawler)
  serverExternalPackages: ["puppeteer", "lighthouse", "exceljs"],
  // Chrome tooling (the SEO audit, competitor insights) only runs from the app on your own computer; on the live site
  // those features are switched off (lib/live.ts). Keep it out of the Vercel function bundles, which are capped at about
  // 250 MB; Lighthouse and Puppeteer alone are about 64 MB of that. Local `pnpm dev` / `next start` do not use these traces.
  outputFileTracingExcludes: {
    "/*": [
      "./node_modules/.pnpm/lighthouse@*/**",
      "./node_modules/.pnpm/puppeteer@*/**",
      "./node_modules/.pnpm/puppeteer-core@*/**",
      "./node_modules/.pnpm/chrome-launcher@*/**",
      "./node_modules/.pnpm/@puppeteer+browsers@*/**",
      "./node_modules/.pnpm/chromium-bidi@*/**",
      "./node_modules/.pnpm/devtools-protocol@*/**",
      "./node_modules/.pnpm/third-party-web@*/**",
      "./node_modules/.pnpm/@paulirish+trace_engine@*/**",
    ],
  },
  cacheComponents: true,
  partialPrefetching: true,
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
