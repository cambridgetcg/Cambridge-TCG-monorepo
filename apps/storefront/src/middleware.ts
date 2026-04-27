// Storefront middleware — auth safety net.
//
// Defense-in-depth: every admin API route checks isAdmin() independently,
// but this middleware catches any that might be missed. It also prevents
// unauthenticated users from loading admin page bundles.
//
// Regular user routes (login, checkout, trade-in) remain public.
// The middleware only gates /admin/* paths and /api/admin/* endpoints.

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

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Only match admin paths — everything else passes through.
    // This keeps middleware lightweight and avoids touching public pages.
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};
