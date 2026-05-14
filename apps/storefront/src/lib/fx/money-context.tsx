/**
 * MoneyContext — client-side context for the display-currency selector.
 *
 * Server-side, `<MoneyDisplay>` (in `lib/ui/MoneyDisplay.tsx`) reads the
 * `display-currency` cookie + fetches FX rates each render. That works
 * everywhere a server component renders. But Next.js client components
 * can't await an async server component, so a client-side primitive
 * needs another path to the same data.
 *
 * The root layout fetches the cookie + rate table **once per request**
 * server-side and passes the snapshot into `<Providers>`. `<Providers>`
 * wraps the entire client tree in this context, so every client
 * component can read `{ currency, rates }` synchronously via
 * `useMoneyContext()`.
 *
 * One server fetch per request, no client-side network call, no
 * hydration mismatch (the server-rendered initial state matches the
 * client's).
 *
 * Yu 2026-05-14: the provider is now **stateful** — it seeds from the
 * server prop and exposes `setCurrency(next)` so the CurrencySelector
 * can flip the display in-place without a round-trip to /api/currency.
 * On set, the cookie is written client-side too, so subsequent SSR
 * navigations honour the choice. JS-disabled visitors still go through
 * the API-route fallback because the underlying <Link> stays intact.
 */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { Currency, RateTable } from "./rates";
import { DEFAULT_CURRENCY, FALLBACK_RATES } from "./rates";

interface MoneyContextValue {
  currency: Currency;
  rates: RateTable;
  /** In-place toggle. Updates context + writes the display-currency
   *  cookie so future server renders see the same value. No network
   *  call — every <Money> consumer below re-renders synchronously. */
  setCurrency: (next: Currency) => void;
}

/**
 * Default context value — used only when a component renders outside a
 * MoneyProvider (e.g. in isolated tests). Production paths always wrap
 * via the root layout's Providers.
 */
const DEFAULT_CONTEXT: MoneyContextValue = {
  currency: DEFAULT_CURRENCY,
  rates: {
    base: DEFAULT_CURRENCY,
    rates: { ...FALLBACK_RATES },
    source: "fallback",
    fetched_at: "1970-01-01T00:00:00.000Z",
    is_fallback: true,
  },
  setCurrency: () => {},
};

const MoneyContext = createContext<MoneyContextValue>(DEFAULT_CONTEXT);

/** Cookie name — mirrored from `currency-server.ts`. Kept inline so this
 *  pure-client module doesn't transitively depend on next/headers. */
const DISPLAY_CURRENCY_COOKIE = "display-currency";

/** 1 year, root path, lax — mirrors what /api/currency sets server-side
 *  so the two paths produce indistinguishable cookies. */
function persistCurrencyCookie(next: Currency): void {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie =
    `${DISPLAY_CURRENCY_COOKIE}=${encodeURIComponent(next)}` +
    `; path=/; max-age=${maxAge}; samesite=lax`;
}

export function MoneyProvider({
  value,
  children,
}: {
  /** Initial snapshot from the root layout (server-read cookie + rates).
   *  Seeds useState on mount; thereafter state is the source of truth. */
  value: { currency: Currency; rates: RateTable };
  children: ReactNode;
}) {
  const [currency, setCurrencyState] = useState<Currency>(value.currency);

  const setCurrency = useCallback((next: Currency) => {
    setCurrencyState(next);
    persistCurrencyCookie(next);
  }, []);

  return (
    <MoneyContext.Provider
      value={{ currency, rates: value.rates, setCurrency }}
    >
      {children}
    </MoneyContext.Provider>
  );
}

/**
 * Read the current display currency + rate table + setter. Safe to call
 * from any client component below the root <Providers>. Falls back to
 * GBP + fallback rates + no-op setter when no provider is in scope.
 */
export function useMoneyContext(): MoneyContextValue {
  return useContext(MoneyContext);
}
