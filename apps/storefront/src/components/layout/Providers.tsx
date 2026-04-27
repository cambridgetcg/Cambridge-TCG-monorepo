"use client";

import { CartProvider } from "@/context/CartContext";
import { SellCartProvider } from "@/context/SellCartContext";
import { CreditSellProvider } from "@/context/CreditSellContext";
import { ToastProvider } from "@/components/ui/Toast";
import CartDrawer from "@/components/cart/CartDrawer";
import SellCartDrawer from "@/components/tradein/SellCartDrawer";
import CreditSellDrawer from "@/components/tradein/CreditSellDrawer";
import type { ReactNode } from "react";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
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
    </ToastProvider>
  );
}
