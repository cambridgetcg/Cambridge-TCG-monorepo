/**
 * Admin dashboard middleware — auth safety net.
 *
 * Every route in this app requires an authenticated admin session.
 * The only exceptions are:
 *   /login          — sign-in page
 *   /login/*        — e.g. /login/check-email (magic link sent confirmation)
 *   /api/auth/*     — NextAuth API routes (required for the flow to work)
 *
 * Defense-in-depth: signIn callback in auth.ts also rejects non-admins,
 * and individual API routes call requireAdmin() for double-checking.
 */

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;

  // Public paths — auth flow itself
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    // Dev-only sign-in shortcut — see app/api/dev-signin/route.ts. The route
    // itself enforces NODE_ENV and localhost-host gates; this just lets it
    // run before the auth check.
    (process.env.NODE_ENV !== "production" && pathname.startsWith("/api/dev-signin"))
  ) {
    return NextResponse.next();
  }

  // All other routes require an authenticated admin session
  if (!req.auth?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (req.auth.user.role !== "admin") {
    // Authenticated but not admin — show error rather than loop
    return NextResponse.redirect(new URL("/login?error=AccessDenied", req.url));
  }

  return NextResponse.next();
});

export const config = {
  // Match all routes — the middleware guards everything except public paths above.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
