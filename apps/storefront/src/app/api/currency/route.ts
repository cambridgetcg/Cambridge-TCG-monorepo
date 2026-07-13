/**
 * Display-currency cookie setter — mirrors /api/lang-mode (kingdom-077).
 *
 * GET `/api/currency?code=USD&back=/prices/one-piece` sets the cookie
 * and redirects back. Unknown codes clear the cookie (falling back to
 * GBP default). No body, no auth — the visitor's display preference is
 * theirs alone.
 *
 * Supports both `code` and `currency` query params for hospitality.
 */

import { NextResponse } from "next/server";
import {
  DISPLAY_CURRENCY_COOKIE,
} from "@/lib/fx/currency-server";
import { parseCurrency } from "@/lib/fx/rates";
import { safeRelativeRedirectPath } from "@/lib/safe-redirect";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("code") ?? url.searchParams.get("currency") ?? "";
  const back = safeRelativeRedirectPath(url.searchParams.get("back"), "/prices");

  const code = parseCurrency(raw);

  const target = new URL(back, url.origin);
  const res = NextResponse.redirect(target);

  if (code) {
    res.cookies.set(DISPLAY_CURRENCY_COOKIE, code, {
      httpOnly: false, // user-readable so client-side toggles can reflect state
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  } else {
    res.cookies.delete(DISPLAY_CURRENCY_COOKIE);
  }
  return res;
}
