/**
 * Text-mode toggle — Phase 10 of kingdom-051.
 *
 * GET `/api/text-mode?on=1` sets the cookie. GET `/api/text-mode?on=0` clears it.
 * No body, no auth — the user's display preference is theirs alone.
 *
 * The Nav can link to this with `?on=${textMode ? "0" : "1"}` to toggle.
 * Pages reading `?text=1` directly in their query handler is a separate
 * (and lighter) entry point that doesn't persist.
 *
 * Substrate-honest cookie: same-site=lax, no domain, no expiry — the
 * preference survives the session but doesn't follow across browsers or
 * devices. A future Phase 10.5 could persist to users.text_mode for
 * signed-in users.
 *
 * See docs/connections/the-table-extends.md (S20) — the Sensory-Different
 * archetype.
 */

import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const on = url.searchParams.get("on") === "1";
  const back = url.searchParams.get("back") || "/";

  const res = NextResponse.redirect(new URL(back, url.origin));
  if (on) {
    res.cookies.set("text-mode", "1", {
      httpOnly: false, // user-readable so the Nav toggle can reflect state client-side too
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  } else {
    res.cookies.delete("text-mode");
  }
  return res;
}
