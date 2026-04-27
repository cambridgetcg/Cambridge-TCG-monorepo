"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import {
  type SellCartItem,
  loadSellCart,
  saveSellCart,
  clearSellCart as clearStorage,
  addSellItem,
  removeSellItem,
  updateSellQty,
  sellTotalItems,
  sellCashTotal,
  sellCreditTotal,
} from "@/lib/tradein/cart";

interface SellCartContextValue {
  items: SellCartItem[];
  addItem: (item: SellCartItem) => void;
  removeItem: (sku: string) => void;
  updateQty: (sku: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  cashTotal: number;
  creditTotal: number;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const SellCartContext = createContext<SellCartContextValue | null>(null);

export function SellCartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SellCartItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(loadSellCart());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveSellCart(items);
  }, [items, hydrated]);

  const addItem = useCallback((item: SellCartItem) => {
    setItems((prev) => addSellItem(prev, item));
  }, []);

  const removeItem = useCallback((sku: string) => {
    setItems((prev) => removeSellItem(prev, sku));
  }, []);

  const updateQty = useCallback((sku: string, quantity: number) => {
    setItems((prev) => updateSellQty(prev, sku, quantity));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    clearStorage();
  }, []);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <SellCartContext value={{
      items,
      addItem,
      removeItem,
      updateQty,
      clearCart,
      totalItems: sellTotalItems(items),
      cashTotal: sellCashTotal(items),
      creditTotal: sellCreditTotal(items),
      drawerOpen,
      openDrawer,
      closeDrawer,
    }}>
      {children}
    </SellCartContext>
  );
}

export function useSellCart() {
  const ctx = useContext(SellCartContext);
  if (!ctx) throw new Error("useSellCart must be used within SellCartProvider");
  return ctx;
}
