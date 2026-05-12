/**
 * lang-mode-server — server-only cookie helpers for the language toggle.
 *
 * Split out from `lang-mode.ts` so client bundles that pull pure helpers
 * (dateAsMath, shortHash) don't transitively import `next/headers` via
 * the `lib/ui` re-export barrel (which is loaded by client components
 * like `app/error.tsx`).
 *
 * Anything that needs to read the cookie imports from here. Anything that
 * just needs pure formatting helpers stays on `lang-mode.ts`.
 */

import "server-only";
import { cookies } from "next/headers";
import { LANG_MODE_COOKIE, type LangMode } from "./lang-mode";

/** Server-side read. Defaults to "default" when the cookie is absent or
 *  carries an unrecognized value (substrate-honest: an unknown value
 *  doesn't break rendering; it falls back to the platform default). */
export async function getLangMode(): Promise<LangMode> {
  const store = await cookies();
  const v = store.get(LANG_MODE_COOKIE)?.value;
  if (v === "math") return "math";
  return "default";
}

/** Sync variant for callers that already have a cookies() handle.
 *  Used by Footer + layout when they're already reading other cookies. */
export function langModeFromCookies(
  store: Awaited<ReturnType<typeof cookies>>,
): LangMode {
  const v = store.get(LANG_MODE_COOKIE)?.value;
  if (v === "math") return "math";
  return "default";
}
