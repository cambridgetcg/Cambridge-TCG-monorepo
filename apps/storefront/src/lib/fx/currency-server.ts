/**
 * currency-server — server-side cookie helpers for the display-currency
 * selector. Mirrors `lang-mode-server.ts` (same dynamic-import shape so
 * client bundles don't transitively pull next/headers).
 *
 * Anything that needs to read the cookie imports from here. Pure helpers
 * + the cookie name + type live in `rates.ts` / sibling pure module so
 * client components can share the type without pulling server-only code.
 */

import { parseCurrency, type Currency, DEFAULT_CURRENCY } from "./rates";

export const DISPLAY_CURRENCY_COOKIE = "display-currency";

interface CookieStore {
  get(name: string): { value: string } | undefined;
}

/** Server-side read. Returns DEFAULT_CURRENCY (GBP) when the cookie is
 *  absent or carries an unrecognized value. */
export async function getDisplayCurrency(): Promise<Currency> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const v = store.get(DISPLAY_CURRENCY_COOKIE)?.value;
  return parseCurrency(v) ?? DEFAULT_CURRENCY;
}

/** Sync variant when the caller already has a cookies() handle. */
export function displayCurrencyFromCookies(store: CookieStore): Currency {
  const v = store.get(DISPLAY_CURRENCY_COOKIE)?.value;
  return parseCurrency(v) ?? DEFAULT_CURRENCY;
}
