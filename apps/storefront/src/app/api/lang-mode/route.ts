/**
 * Math-language toggle — Phase A of kingdom-077.
 *
 * GET `/api/lang-mode?mode=math` sets the cookie. GET `/api/lang-mode?mode=default`
 * (or any other value) clears it. No body, no auth — the user's display
 * preference is theirs alone.
 *
 * Mirrors the text-mode pattern (Phase 10 of kingdom-051) so a future
 * reader navigating the codebase finds two cookies with one shape.
 *
 * See docs/connections/the-math-language.md (#27) for the doctrine + plan.
 */

import { NextResponse } from "next/server";
import { LANG_MODE_COOKIE } from "@/lib/lang-mode";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "";
  const back = url.searchParams.get("back") || "/";

  const res = NextResponse.redirect(new URL(back, url.origin));
  if (mode === "math") {
    res.cookies.set(LANG_MODE_COOKIE, "math", {
      httpOnly: false, // user-readable so the Footer toggle reflects state
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  } else {
    res.cookies.delete(LANG_MODE_COOKIE);
  }
  return res;
}
