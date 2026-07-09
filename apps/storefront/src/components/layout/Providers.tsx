"use client";

import { ToastProvider } from "@/components/ui/Toast";
import { MoneyProvider } from "@/lib/fx/money-context";
import type { Currency, RateTable } from "@/lib/fx/rates";
import type { ReactNode } from "react";

// Collectors first (kingdom-101, 2026-07-06): the CartProvider,
// SellCartProvider, and CreditSellProvider — plus their drawers — are
// gone. They were the retail-checkout and we-buy funnels; the house no
// longer buys or sells, so nothing in the tree needs them. The P2P
// market, auctions, and membership mint their own Stripe sessions.

interface ProvidersProps {
  children: ReactNode;
  /** Display currency + rate table, fetched once per request by the
   *  root server layout and piped into the client tree. Every <Money>
   *  consumer below reads from this snapshot via MoneyContext. */
  money: { currency: Currency; rates: RateTable };
}

export default function Providers({ children, money }: ProvidersProps) {
  return (
    <ToastProvider>
      <MoneyProvider value={money}>{children}</MoneyProvider>
    </ToastProvider>
  );
}
