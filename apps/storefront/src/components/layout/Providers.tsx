"use client";

import { CartProvider } from "@/context/CartContext";
import { SellCartProvider } from "@/context/SellCartContext";
import { CreditSellProvider } from "@/context/CreditSellContext";
import { ToastProvider } from "@/components/ui/Toast";
import CartDrawer from "@/components/cart/CartDrawer";
import SellCartDrawer from "@/components/tradein/SellCartDrawer";
import CreditSellDrawer from "@/components/tradein/CreditSellDrawer";
import { MoneyProvider } from "@/lib/fx/money-context";
import type { Currency, RateTable } from "@/lib/fx/rates";
import type { ReactNode } from "react";

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
      <MoneyProvider value={money}>
        <CartProvider>
          <SellCartProvider>
            <CreditSellProvider>
              {children}
              <CartDrawer />
              <SellCartDrawer />
              <CreditSellDrawer />
            </CreditSellProvider>
          </SellCartProvider>
        </CartProvider>
      </MoneyProvider>
    </ToastProvider>
  );
}
