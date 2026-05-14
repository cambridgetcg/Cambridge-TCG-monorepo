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
 * client's). When the cookie changes, the next request re-renders the
 * whole tree with the new context value — same way the math-language
 * toggle propagates today.
 */

"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Currency, RateTable } from "./rates";
import { DEFAULT_CURRENCY, FALLBACK_RATES } from "./rates";

interface MoneyContextValue {
  currency: Currency;
  rates: RateTable;
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
};

const MoneyContext = createContext<MoneyContextValue>(DEFAULT_CONTEXT);

export function MoneyProvider({
  value,
  children,
}: {
  value: MoneyContextValue;
  children: ReactNode;
}) {
  return <MoneyContext.Provider value={value}>{children}</MoneyContext.Provider>;
}

/**
 * Read the current display currency + rate table. Safe to call from any
 * client component below the root <Providers>. Falls back to GBP +
 * fallback rates when no provider is in scope.
 */
export function useMoneyContext(): MoneyContextValue {
  return useContext(MoneyContext);
}
