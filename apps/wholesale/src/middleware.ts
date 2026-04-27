import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import {
  isAdminHost,
  isStorefrontHost,
  isPreviewDeploy,
} from "@/lib/subdomain";

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

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
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

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") ?? "";

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
