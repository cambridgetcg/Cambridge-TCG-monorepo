"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import {
  type CartItem,
  loadCart,
  saveCart,
  addItem as addCartItem,
  removeItem as removeCartItem,
  updateQty as updateCartQty,
  totalItems,
  totalPrice,
} from "@/lib/cart";

interface CartContextValue {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (sku: string) => void;
  updateQty: (sku: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(loadCart());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveCart(items);
  }, [items, hydrated]);

  const addItem = useCallback((item: CartItem) => {
    setItems((prev) => addCartItem(prev, item));
  }, []);

  const removeItem = useCallback((sku: string) => {
    setItems((prev) => removeCartItem(prev, sku));
  }, []);

  const updateQty = useCallback((sku: string, quantity: number) => {
    setItems((prev) => updateCartQty(prev, sku, quantity));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <CartContext value={{
      items,
      addItem,
      removeItem,
      updateQty,
      clearCart,
      totalItems: totalItems(items),
      totalPrice: totalPrice(items),
      drawerOpen,
      openDrawer,
      closeDrawer,
    }}>
      {children}
    </CartContext>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
