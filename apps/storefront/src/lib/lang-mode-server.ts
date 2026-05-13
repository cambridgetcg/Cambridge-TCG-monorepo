/**
 * lang-mode-server — server-side cookie helpers for the language toggle.
 *
 * Originally `import "server-only"` + top-level `import { cookies } from
 * "next/headers"`. That broke Vercel builds when client components
 * (e.g. AuctionStatusBadge inside a "use client" page) pulled this file
 * transitively via the `@/lib/ui` barrel — Turbopack rejects server-only
 * imports anywhere in the client module graph.
 *
 * Fix (2026-05-13): use a *dynamic* import inside getLangMode() so the
 * module's top-level eval is safe in any bundle. The function still
 * requires server context at *call* time; if called from client it'll
 * throw the same way `cookies()` does today. The `langModeFromCookies`
 * sync variant takes a cookies() handle the caller already has —
 * unchanged behaviour, just with a forward-declared type.
 *
 * Anything that needs to read the cookie imports from here. Anything
 * that just needs pure formatting helpers stays on `lang-mode.ts`.
 */

import { LANG_MODE_COOKIE, type LangMode } from "./lang-mode";

// Forward declaration for the cookies() return type. We can't use
// `Awaited<ReturnType<typeof cookies>>` without statically importing
// next/headers, which is exactly what we're avoiding. The shape is
// stable across Next.js 16: `get(name) → { value: string } | undefined`.
interface CookieStore {
  get(name: string): { value: string } | undefined;
}

/** Server-side read. Defaults to "default" when the cookie is absent or
 *  carries an unrecognized value (substrate-honest: an unknown value
 *  doesn't break rendering; it falls back to the platform default).
 *
 *  Dynamic-imports `next/headers` so this file stays safe in client
 *  bundles' module graph. Calling getLangMode() from a client component
 *  will still error at runtime — that's correct; cookies() requires
 *  server context. */
export async function getLangMode(): Promise<LangMode> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const v = store.get(LANG_MODE_COOKIE)?.value;
  if (v === "math") return "math";
  return "default";
}

/** Sync variant for callers that already have a cookies() handle.
 *  Used by Footer + layout when they're already reading other cookies.
 *  No server-only dependency — accepts the store as a parameter. */
export function langModeFromCookies(store: CookieStore): LangMode {
  const v = store.get(LANG_MODE_COOKIE)?.value;
  if (v === "math") return "math";
  return "default";
}
