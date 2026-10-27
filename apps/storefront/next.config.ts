import type { NextConfig } from "next";
import path from "node:path";
import { errandDiscoveryLinkHeader, publicDiscoveryLinkHeader } from "./src/lib/siblings";

const nextConfig: NextConfig = {
  // No `X-Powered-By: Next.js` on responses: it advertises the framework
  // to scanners and tells visitors nothing. Cloudflare's WAF blocked
  // ~160 React2Shell (CVE-2025-55182) probes a day here in October 2026.
  poweredByHeader: false,

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
    "@cambridge-tcg/answering-rhymes",
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
  // ── Runtime fs reads of repo docs ─────────────────────────────────────
  // /api/v1/pillow-book.json and /api/v1/sophias.json read
  // docs/connections/the-pillow-book.md at request time. Vercel's output
  // file tracing doesn't see dynamic path.join() reads, so without this
  // the file is absent from the serverless bundle and both routes 500 in
  // production (verified live 2026-07-05: "Could not read
  // docs/connections/the-pillow-book.md"). Keys are route paths; values
  // are globs resolved from this app's root (apps/storefront), so ../../
  // walks to the monorepo root the routes resolve against process.cwd().
  outputFileTracingIncludes: {
    "/api/v1/pillow-book.json": ["../../docs/connections/the-pillow-book.md"],
    "/api/v1/sophias.json": ["../../docs/connections/the-pillow-book.md"],
  },
  // ── The atmospheric invitation (header-plane) ─────────────────────────
  // Every response — HTML page, static file, API route — carries an
  // RFC 8288 Link header pointing first at the neutral identity invitation,
  // then at the fuller seven-door wake under its own relation. Browsers
  // ignore unknown link relations entirely (zero human-visible change);
  // programmatic agents that read headers discover both surfaces on
  // whatever URL they happened to fetch first. This is the header-plane
  // arm of the distributed-wake protocol (docs/connections/
  // the-distributed-wake.md): the body-plane carries one fragment per
  // /api/v1/* envelope in `_meta.wake_fragment`; the header-plane carries
  // the pointer on everything else. Refusable by construction — a header
  // imposes nothing, and walking past is honored (the five-test
  // invitation discipline applies; see /api/v1/wake's file header).
  // Route-owned Link headers may replace config headers; discovery routes
  // therefore explicitly compose the shared definitions too. Do not assume
  // framework header merging merely because RFC 8288 permits multiple values.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Link",
            value: publicDiscoveryLinkHeader(),
          },
        ],
      },
      // ── The history paths (Yu, 2026-10-23: "history, not for training")
      // The SOPHIA section of llms-full.txt and its sophia-wake fragments
      // are kept as the household's record. robots.txt asks training
      // crawlers to skip them; this header says the same per response, in
      // an IETF draft's Content-Usage form.
      ...["/llms-full.txt", "/.well-known/sophia-wake/:path*"].map((source) => ({
        source,
        headers: [{ key: "Content-Usage", value: "train-ai=n" }],
      })),
      // Quiet Doors (2026-10): data responses under /api/v1/* carry only
      // navigation links; the wake and dear-agents doors keep the full set.
      // For the same key, Next applies the last matching rule.
      { source: "/api/v1", headers: [{ key: "Link", value: errandDiscoveryLinkHeader() }] },
      {
        source: "/api/v1/:path((?!wake(?:/|$)|dear-agents(?:/|$)).*)",
        headers: [{ key: "Link", value: errandDiscoveryLinkHeader() }],
      },
      // Every other data response under /api, the data files, the discovery
      // documents agents read to wire up tools, and the machine-readable
      // standards (/standards.json, /spec/*, /schemas/*) carry the same
      // navigation-only Link; the chosen doors keep the full set, and so does
      // /.well-known/sophia-invitation.json.
      // "/data/:path+" needs a segment, so the HTML page /data keeps its Link;
      // the HTML page /standards keeps its own too.
      ...[
        "/api",
        "/api/:path((?!v1/wake(?:/|$)|v1/dear-agents(?:/|$)).*)",
        "/data.json",
        "/data/:path+",
        "/.well-known/cambridge-tcg.json",
        "/.well-known/mcp.json",
        "/.well-known/mcp-config.json",
        "/.well-known/ai-plugin.json",
        "/.well-known/agent.txt",
        "/standards.json",
        "/spec/:path*",
        "/schemas/:path*",
      ].map((source) => ({
        source,
        headers: [{ key: "Link", value: errandDiscoveryLinkHeader() }],
      })),
    ];
  },
  // ── One public host ───────────────────────────────────────────────────
  // AUTH_URL and NEXT_PUBLIC_SITE_URL both name https://cambridgetcg.com,
  // but www and the production .vercel.app alias also answered 200, so
  // crawlers fetched every page two or three times (2026-10-17: www
  // ~212k and the alias ~13k requests a day beside the apex's ~221k).
  // Pages on those hosts redirect to the apex. /api and /_next stay
  // reachable on every host so webhooks, OAuth callbacks and already
  // open tabs keep working. Preview deployment URLs are untouched.
  // Next.js compiles these into Vercel routing rules, so a redirect does
  // not invoke a function.
  async redirects() {
    return ["www.cambridgetcg.com", "cambridgetcg-storefront.vercel.app"].map((host) => ({
      source: "/:path((?!api(?:/|$)|_next/).*)",
      has: [{ type: "host" as const, value: host }],
      destination: "https://cambridgetcg.com/:path",
      permanent: true,
    }));
  },
  images: {
    // Security boundary (2026-08-25): Next 16.2.11 currently resolves Sharp
    // 0.34.5, whose untrusted-image decoder path is under an upstream high
    // severity advisory. Keep the optimisation endpoint disabled until the
    // supported Next dependency graph carries Sharp >=0.35. Remote images are
    // still constrained by the allow-list below; browsers fetch them directly.
    unoptimized: true,
    // One entry per place card images actually live (the honest ground,
    // spec 2026-07-07 §2): three per-game S3 hi-res buckets + the three
    // CardRush hosts images ride on before the 5-min drain archives them.
    // Only the One Piece pair was listed before — pokemon/dragon-ball
    // images failed next/image for want of a whitelist line.
    //
    // Plus the self-hosted OFFICIAL English card-image host: the /market
    // grid + table now render publisher art served (attributed) from our
    // own S3 bucket (see lib/cards/en-card-data.ts CARD_IMAGE_CDN). Both
    // the region-qualified and bare S3 endpoints are listed so next/image
    // accepts whichever form the CDN env resolves to.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
      },
      {
        protocol: "https",
        hostname: "ctcg-card-images.s3.us-east-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "ctcg-card-images.s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "jp-op-photos.s3.us-east-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "jp-pk-photos.s3.us-east-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "jp-db-photos.s3.us-east-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "www.cardrush-op.jp",
      },
      {
        protocol: "https",
        hostname: "www.cardrush-pokemon.jp",
      },
      {
        protocol: "https",
        hostname: "www.cardrush-db.jp",
      },
    ],
  },
};

export default nextConfig;
