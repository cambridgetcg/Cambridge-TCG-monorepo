/**
 * Appearance setter — the wardrobe's only cookie writer.
 *
 * GET `/api/appearance?theme=gallery&back=/market` sets the theme cookie
 * and returns to the page the visitor was on. `?theme=system` (alias:
 * `?theme=default`) clears the cookie — no cookie IS the system-follow
 * state, one truth in one place: <html> then wears data-theme="system"
 * (gallery in a light OS, midnight in a dark one; themes.css).
 * `?tone=plain` / `?tone=standard` set the voice register; `?tone=default`
 * clears it. Both params may arrive together.
 *
 * Idiom copied from /api/text-mode (kingdom-051 Phase 10): no body, no
 * client JS, same-site cookie, back-redirect. A display preference is the
 * visitor's alone. All four themes are free since 2026-07-06 (midnight's
 * member lock came off — dark mode is table stakes); the entitlement
 * check below stays as the mechanism for any future locked skin. A locked
 * id degrades silently to no-change: no error theatre over a cosmetic,
 * the settings page is where locks are explained.
 *
 * Spec: docs/superpowers/specs/2026-06-10-the-wardrobe-design.md.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMemberProfile } from "@/lib/membership/db";
import { isThemeId, SYSTEM_THEME, THEME_COOKIE, TONE_COOKIE, THEMES } from "@/lib/wardrobe/themes";
import { canWear } from "@/lib/wardrobe/entitlements";
import { isToneId } from "@/lib/wardrobe/voice";

const COOKIE_OPTS = {
  httpOnly: false, // readable client-side so settings UI reflects state
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
} as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = url.searchParams.get("back") || "/";
  const themeRaw = url.searchParams.get("theme");
  const toneRaw = url.searchParams.get("tone");

  const res = NextResponse.redirect(new URL(back, url.origin));

  if (themeRaw === "default" || themeRaw === SYSTEM_THEME) {
    // System-follow is the absence of a choice — deleting the cookie is
    // the whole write. "system" never lands in the cookie itself.
    res.cookies.delete(THEME_COOKIE);
  } else if (isThemeId(themeRaw)) {
    const theme = THEMES.find((t) => t.id === themeRaw)!;
    if (theme.entitlement === "free") {
      res.cookies.set(THEME_COOKIE, theme.id, COOKIE_OPTS);
    } else {
      const session = await auth();
      const profile = session?.user?.id ? await getMemberProfile(session.user.id) : null;
      if (canWear(theme, profile?.tier ?? null)) {
        res.cookies.set(THEME_COOKIE, theme.id, COOKIE_OPTS);
      }
      // not entitled → fall through with no cookie change; the settings
      // surface renders the lock and the path to /membership
    }
  }

  if (toneRaw === "default") {
    res.cookies.delete(TONE_COOKIE);
  } else if (isToneId(toneRaw)) {
    res.cookies.set(TONE_COOKIE, toneRaw, COOKIE_OPTS);
  }

  return res;
}
