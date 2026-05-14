// Storefront proxy (Next.js 16) — auth safety net.
//
// Renamed from `middleware.ts` to `proxy.ts` per Next.js 16's deprecation:
// `proxy.ts` runs on the nodejs runtime, which lets us pull in the postgres
// adapter via `@/lib/auth`. The old `middleware.ts` ran on the edge runtime
// and crashed at module-load with MIDDLEWARE_INVOCATION_FAILED because
// `pg` can't run on edge. See:
//   node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md
//
// Defense-in-depth: every admin API route checks isAdmin() independently,
// but this proxy catches any that might be missed. It also prevents
// unauthenticated users from loading admin page bundles.
//
// Gated path prefixes:
//   /admin/*       → role='admin'
//   /api/admin/*   → role='admin'
//   /account/b2b/* → role IN ('wholesale','admin')  (wholesale consolidation Phase 1)
//
// All other routes (login, checkout, trade-in, public catalog) pass through.

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Admin pages — require authenticated admin
  if (pathname.startsWith("/admin")) {
    if (!req.auth?.user) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (req.auth.user.role !== "admin") {
      return NextResponse.redirect(new URL("/", req.url));
    }
    // Forward x-pathname so the root layout can suppress the DevBanner on admin pages.
    // We only do this for /admin/* (where the proxy already runs) — public pages
    // don't trigger this proxy, so an absent x-pathname means "show the banner."
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-pathname", pathname);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Admin API routes — require authenticated admin
  if (pathname.startsWith("/api/admin")) {
    if (!req.auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (req.auth.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // B2B wholesale shell — require role='wholesale' (admins also pass for
  // operator inspection). Wholesale consolidation Phase 1; see
  // docs/connections/the-four-auth-realms.md (S30).
  if (pathname.startsWith("/account/b2b")) {
    if (!req.auth?.user) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    const role = req.auth.user.role;
    if (role !== "wholesale" && role !== "admin") {
      return NextResponse.redirect(new URL("/account", req.url));
    }
    // Forward x-pathname so server components can read the active path
    // (needed by getChannelForRequest() to route the Falcon's channel).
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-pathname", pathname);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/account/b2b/:path*",
  ],
};
