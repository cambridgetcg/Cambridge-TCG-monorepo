import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages export TS files with `.js`-extension imports
  // (NodeNext-style). Next.js's webpack needs them transpiled so
  // `import { x } from "@cambridge-tcg/data-ingest"` resolves correctly
  // at build time. Without this, the build fails with "Module not found:
  // Can't resolve './registry.js'" because webpack stops at the package
  // boundary instead of walking into the workspace source.
  //
  // Added 2026-05-13 in the same commit that fixed the storefront — both
  // apps had been failing Vercel builds for ~2 weeks for the same reason.
  transpilePackages: [
    "@cambridge-tcg/aws",
    "@cambridge-tcg/data-ingest",
    "@cambridge-tcg/data-spec",
    "@cambridge-tcg/db",
    "@cambridge-tcg/lifecycle",
    "@cambridge-tcg/pricing",
    "@cambridge-tcg/sku",
    "@cambridge-tcg/stock",
  ],
  // Next.js 16 defaults to Turbopack for `next build`. Turbopack
  // honours transpilePackages above and resolves `.js` → `.ts` within
  // workspace packages natively. Empty turbopack key declares it as
  // the bundler.
  turbopack: {},
};

export default nextConfig;
