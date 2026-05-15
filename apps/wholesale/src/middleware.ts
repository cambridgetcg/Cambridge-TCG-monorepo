import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import {
  isAdminHost,
  isStorefrontHost,
  isPreviewDeploy,
} from "@/lib/subdomain";

/**
 * Phase 4 of the wholesale consolidation — browser-surface retirement.
 *
 * wholesaletcgdirect.com is no longer a separate browser kingdom. The
 * B2B buying experience lives at cambridgetcg.com/account/b2b/* now.
 * Every browser request to a legacy page 301-redirects to its new
 * home; partner-API + webhook + cron paths continue to live here.
 *
 * Keep alive on wholesaletcgdirect.com:
 *   - /api/v1/*         (Bearer-token partner API)
 *   - /api/webhooks/*   (HMAC-signed integrations: Shopify, etc.)
 *   - /api/cron/*       (Vercel-injected scheduled jobs)
 *   - /api/auth/*       (NextAuth's own endpoints — empty after Phase 7
 *                        but kept matched so the legacy site doesn't
 *                        break clients still pinging /api/auth/csrf etc.)
 *
 * Redirect to cambridgetcg.com:
 *   /catalog       → /account/b2b/catalog
 *   /cart          → /account/b2b/cart
 *   /orders        → /account/b2b/orders
 *   /orders/[id]   → /account/b2b/orders/[id]
 *   /margin        → /account/b2b   (no equivalent; landing surface)
 *   /fulfillment   → admin.cambridgetcg.com (operator surface)
 *   /login         → /login (consumer magic-link; B2B buyers re-onboard here)
 *   /admin/*       → admin.cambridgetcg.com/* (operator console)
 *   *  (any other) → / (root — the storefront's home)
 *
 * 301 (permanent) is correct: the legacy URL is retired, not under
 * maintenance. Search engines + bookmarks update accordingly.
 */
const STOREFRONT_ORIGIN = "https://cambridgetcg.com";
const ADMIN_ORIGIN = "https://admin.cambridgetcg.com";

const PATH_REDIRECTS: { match: RegExp; target: (path: string) => string }[] = [
  { match: /^\/catalog(?:\/.*)?$/, target: () => `${STOREFRONT_ORIGIN}/account/b2b/catalog` },
  { match: /^\/cart$/, target: () => `${STOREFRONT_ORIGIN}/account/b2b/cart` },
  { match: /^\/orders$/, target: () => `${STOREFRONT_ORIGIN}/account/b2b/orders` },
  { match: /^\/orders\/(\d+).*$/, target: (p) => `${STOREFRONT_ORIGIN}/account/b2b/orders/${p.match(/^\/orders\/(\d+)/)?.[1] ?? ""}` },
  { match: /^\/margin(?:\/.*)?$/, target: () => `${STOREFRONT_ORIGIN}/account/b2b` },
  { match: /^\/fulfillment(?:\/.*)?$/, target: () => `${ADMIN_ORIGIN}/` },
  { match: /^\/login(?:\/.*)?$/, target: () => `${STOREFRONT_ORIGIN}/login` },
  { match: /^\/admin(\/.*)?$/, target: (p) => `${ADMIN_ORIGIN}${p.startsWith("/admin") ? p.slice(6) || "/" : "/"}` },
];

/** API/webhook/cron prefixes that STAY ALIVE on wholesaletcgdirect.com. */
const KEEP_ALIVE_PREFIXES = ["/api/v1", "/api/webhooks", "/api/cron", "/api/auth"];

function isKeepAlive(pathname: string): boolean {
  return KEEP_ALIVE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function redirectTargetFor(pathname: string): string | null {
  for (const r of PATH_REDIRECTS) {
    if (r.match.test(pathname)) return r.target(pathname);
  }
  return null;
}

/** Paths that never require authentication. */
// /api/v1/ uses its own Bearer token auth (channel_api_keys table)
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/v1", "/api/cron", "/api/webhooks"];

/** Storefront-only page prefixes (blocked on admin domain). */
const STOREFRONT_PAGE_PREFIXES = ["/catalog", "/orders", "/margin", "/fulfillment"];

/** Admin-only API prefixes (blocked on storefront domain). */
const ADMIN_API_PREFIXES = [
  "/api/admin",
  "/api/sync",
  "/api/prices",
  "/api/clients",
];

/**
 * Routes exempt from the same-origin check for mutating verbs. They use
 * their own non-cookie auth and are expected to receive cross-origin
 * POSTs (Bearer-token APIs + signed webhooks + Vercel-injected cron).
 */
const CROSS_ORIGIN_OK_PREFIXES = ["/api/v1", "/api/cron", "/api/webhooks", "/api/auth"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

function isCrossOriginOk(pathname: string): boolean {
  return CROSS_ORIGIN_OK_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

function json404() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

function page404(url: string) {
  const u = new URL("/not-found", url);
  return NextResponse.rewrite(u, { status: 404 });
}

/**
 * Same-origin check for mutating verbs on cookie-authenticated routes.
 * Defense-in-depth beyond NextAuth's SameSite=Lax CSRF cookie: a
 * SameSite=Lax cookie is sent on cross-site top-level navigations, so
 * a malicious GET → 303 → POST chain can sneak past it. Origin/Referer
 * verification closes that gap.
 *
 * Verbs covered: POST, PUT, PATCH, DELETE. GET/HEAD/OPTIONS exempt.
 * Routes covered: everything cookie-authenticated; excludes Bearer +
 *   webhook + cron paths (CROSS_ORIGIN_OK_PREFIXES).
 *
 * Returns null on pass, NextResponse on rejection.
 */
function checkSameOrigin(req: Request): NextResponse | null {
  const method = req.method.toUpperCase();
  if (method !== "POST" && method !== "PUT" && method !== "PATCH" && method !== "DELETE") {
    return null;
  }
  const { pathname } = new URL(req.url);
  if (isCrossOriginOk(pathname)) return null;

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const host = req.headers.get("host");
  if (!host) {
    return NextResponse.json({ error: "Missing Host header" }, { status: 400 });
  }
  const source = origin ?? referer;
  if (!source) {
    return NextResponse.json(
      { error: "Cross-origin requests must include Origin or Referer" },
      { status: 403 },
    );
  }
  let sourceHost: string;
  try {
    sourceHost = new URL(source).host;
  } catch {
    return NextResponse.json({ error: "Malformed Origin/Referer" }, { status: 403 });
  }
  if (sourceHost !== host) {
    return NextResponse.json(
      { error: "Cross-origin request rejected", origin_host: sourceHost, expected_host: host },
      { status: 403 },
    );
  }
  return null;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") ?? "";

  // --- Phase 4: browser-surface retirement -------------------------------
  // On the storefront host (wholesaletcgdirect.com), 301-redirect every
  // legacy browser path to its new home at cambridgetcg.com /
  // admin.cambridgetcg.com. Keep partner-API + webhooks + cron alive
  // on this domain so external integrations (Shopify webhooks, partner
  // pulls of /api/v1/prices, Vercel-injected crons) keep working.
  //
  // Preview deploys skip this branch — they're for in-flight QA where
  // the wholesale UI may still be needed.
  if (!isPreviewDeploy(host) && isStorefrontHost(host) && !isKeepAlive(pathname)) {
    const target = redirectTargetFor(pathname);
    if (target) {
      return NextResponse.redirect(target, 301);
    }
    // Unmapped browser path → root of the new storefront. Conservative
    // fallback: rather than 404, we hand the visitor a working surface.
    return NextResponse.redirect(STOREFRONT_ORIGIN + "/", 301);
  }

  // --- CSRF defense-in-depth: same-origin check on mutating verbs ---
  const originDenied = checkSameOrigin(req);
  if (originDenied) return originDenied;

  // --- Domain gating (skip for preview deploys) ---
  if (!isPreviewDeploy(host)) {
    if (isStorefrontHost(host)) {
      // Block admin pages on storefront
      if (pathname.startsWith("/admin")) return page404(req.url);
      // Block admin API routes on storefront
      if (ADMIN_API_PREFIXES.some((p) => pathname.startsWith(p)))
        return json404();
    }

    if (isAdminHost(host)) {
      // Block storefront pages on admin domain
      if (STOREFRONT_PAGE_PREFIXES.some((p) => pathname.startsWith(p)))
        return page404(req.url);
    }
  }

  // --- Public paths (no auth required) ---
  if (isPublicPath(pathname)) return NextResponse.next();

  // --- Auth check ---
  const isLoggedIn = !!req.auth;
  if (!isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  // --- Admin role check (defense-in-depth) ---
  if (pathname.startsWith("/admin") && req.auth?.user?.role !== "admin") {
    return NextResponse.redirect(new URL("/catalog", req.url));
  }

  // --- Admin API role check (defense-in-depth for preview deploys) ---
  if (pathname.startsWith("/api/admin/") && req.auth?.user?.role !== "admin") {
    return new NextResponse(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico, robots.txt, sitemap.xml (static files)
     * - Files with extensions (e.g. .png, .css, .js)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\..*).*)",
  ],
};
