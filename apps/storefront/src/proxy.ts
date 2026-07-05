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

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAMES } from "@/lib/auth/cookies";

function hasSessionCookie(req: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => req.cookies.has(name));
}

export default function proxy(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
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
  ],
};
