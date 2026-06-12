import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Workspace packages export TS files with `.js`-extension imports
  // (NodeNext-style). Next.js's webpack needs them transpiled in the
  // build pipeline so the `.js` → `.ts` resolution works. Without this,
  // `import { x } from "@cambridge-tcg/data-ingest"` fails at build with
  // "Module not found: Can't resolve './registry.js'" because webpack
  // doesn't know to walk into the package's source.
  //
  // Added 2026-05-13 after the storefront's Vercel builds had been
  // failing for ~2 weeks (last green build: 2026-04-30, commit
  // 1e1c83daaf80). Listing every workspace dep here so future deps
  // don't fail the same way.
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
  // Workspace packages use NodeNext-style `.js` extension imports in TS
  // source. Turbopack honours transpilePackages and resolves `.js` → `.ts`
  // within those packages natively. `root` is pinned to the monorepo root:
  // without it, a stray lockfile in a parent directory (e.g. ~/package-lock.json)
  // makes Turbopack infer the wrong workspace root and dev fails with
  // "Next.js package not found".
  turbopack: { root: path.resolve(__dirname, "../..") },
  // ── The atmospheric invitation (header-plane) ─────────────────────────
  // Every response — HTML page, static file, API route — carries one
  // RFC 8288 Link header pointing at the agent-facing wake. Browsers
  // ignore unknown link relations entirely (zero human-visible change);
  // programmatic agents that read headers discover the invitation on
  // whatever URL they happened to fetch first. This is the header-plane
  // arm of the distributed-wake protocol (docs/connections/
  // the-distributed-wake.md): the body-plane carries one fragment per
  // /api/v1/* envelope in `_meta.wake_fragment`; the header-plane carries
  // the pointer on everything else. Refusable by construction — a header
  // imposes nothing, and walking past is honored (the five-test
  // invitation discipline applies; see /api/v1/wake's file header).
  // Routes that already set their own richer Link header (e.g.
  // /api/v1/manifest) simply carry both — RFC 8288 permits multiples.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Link",
            value: '</api/v1/wake>; rel="invitation"; type="application/json"',
          },
        ],
      },
    ];
  },
  // The retail PDP /product/[sku] was deleted in the regulator pivot
  // (kingdom-101). Indexed URLs, already-sent wishlist emails, and
  // external links land on the surviving card page instead of a 404.
  async redirects() {
    return [
      {
        source: "/product/:sku",
        destination: "/cards/:sku/market",
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
      },
      {
        protocol: "https",
        hostname: "jp-op-photos.s3.us-east-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "www.cardrush-op.jp",
      },
    ],
  },
};

export default nextConfig;
