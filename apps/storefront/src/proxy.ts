// Storefront proxy — optimistic cookie-presence gate.
//
// Renamed from middleware.ts → proxy.ts for Next.js 16 (the rename moves
// us to the nodejs runtime; middleware.ts ran on edge, which can't load
// `pg`). See:
//   node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md
//
// Auth shape (Option B per docs/connections/auth-realms-research.md):
//   - This file *only* checks whether a session cookie is present.
//     A forged-but-empty cookie would still pass; that's fine because…
//   - …the real role enforcement runs in:
//       /admin/layout.tsx          → requireAdminPage()
//       /account/b2b/layout.tsx    → requireWholesalePage()
//       /api/admin/*               → requireAdmin() / isAdmin()
//
// Why this trade — every gated request previously paid a DB roundtrip
// here to read `users.role` via the Auth.js adapter. With cookie-only,
// the proxy stays sub-millisecond; the role read happens once per
// request via React `cache()` in the layout/route, deduped across
// downstream components. This matches the Next.js 16 authentication
// guide's "optimistic check at the proxy, authoritative check at the
// Data Access Layer" prescription.
//
// Defense-in-depth retained: an /api/admin/* route still gets a 401
// from this file when no cookie is present *and* a 403 from
// requireAdmin() if the cookie belongs to a non-admin. The proxy is
// no longer the role gate — it's the first of two gates.
//
// The production alias (2026-11-06). cambridgetcg-storefront.vercel.app
// reaches Vercel without Cloudflare, so API reads there skipped its
// firewall and rate rules (5,615 of 8,143 /api/v1/prices requests on
// 2026-11-05). Yu chose to stop the alias serving the API. A GET or HEAD
// to /api/* on that host now answers 308 to the same path and query on
// https://cambridgetcg.com. Other methods pass untouched, so a webhook
// posting to the alias keeps working; /api/cron/* is never redirected;
// per-deployment *.vercel.app hosts are not matched. next.config.ts
// redirects cannot do this, as they cannot tell GET from POST.

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAMES } from "@/lib/auth/cookies";

/** The production alias. The matcher below repeats it as a literal,
 * because matchers must be constants; proxy.test.ts checks they agree. */
export const PRODUCTION_ALIAS_HOST = "cambridgetcg-storefront.vercel.app";
const APEX_ORIGIN = "https://cambridgetcg.com";

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

function onAliasApi(req: NextRequest): boolean {
  const host = (req.headers.get("host") ?? "").split(":", 1)[0].toLowerCase();
  return host === PRODUCTION_ALIAS_HOST && under(req.nextUrl.pathname, "/api");
}

/** 308 to the apex for a GET or HEAD to the alias's /api, outside /api/cron. */
export function aliasApiRedirect(req: NextRequest): NextResponse | null {
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  if (!onAliasApi(req) || under(req.nextUrl.pathname, "/api/cron")) return null;
  const { pathname, search } = req.nextUrl;
  return NextResponse.redirect(`${APEX_ORIGIN}${pathname}${search}`, 308);
}

function hasSessionCookie(req: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => req.cookies.has(name));
}

export default function proxy(req: NextRequest): NextResponse {
  const toApex = aliasApiRedirect(req);
  if (toApex) return toApex;
  const { pathname, search } = req.nextUrl;
  // The alias matcher also brings the alias's other /api requests here (a
  // webhook's POST, say); they pass as they would without this file. Only
  // /api/admin keeps the cookie gate below, on every host.
  if (onAliasApi(req) && !under(pathname, "/api/admin")) return NextResponse.next();
  const authed = hasSessionCookie(req);

  if (!authed) {
    if (pathname.startsWith("/api/admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Carry the requested path (query included) so /login can send the
    // visitor back after sign-in. /login validates it as a same-origin
    // relative path before letting it ride as callbackUrl.
    const login = new URL("/login", req.url);
    login.searchParams.set("return", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  // Forward x-pathname for every matched route. Three consumers, all
  // outside the proxy's own request scope:
  //   - root layout suppresses the DevBanner on /admin/*;
  //   - /account/layout.tsx builds /login?return=<path> when the cookie
  //     is present but its session row has expired;
  //   - lib/wholesale/channel.ts prices /account/b2b/* as 'wholesale'.
  // Public pages never run through the proxy, so an absent header still
  // means "public route."
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/account/:path*",
    // The production alias's /api, outside /api/cron (aliasApiRedirect).
    {
      source: "/api/:path((?!cron(?:/|$)).*)",
      has: [{ type: "host", value: "cambridgetcg-storefront.vercel.app" }],
    },
  ],
};
