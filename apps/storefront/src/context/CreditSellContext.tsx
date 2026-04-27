"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface CreditSellItem {
  sku: string;
  name: string;
  cardNumber: string;
  setCode: string | null;
  imageUrl: string | null;
  creditPrice: number;
  quantity: number;
}

interface CreditSellContextType {
  items: CreditSellItem[];
  totalItems: number;
  totalCredit: number;
  isOpen: boolean;
  addItem: (item: Omit<CreditSellItem, "quantity">) => void;
  removeItem: (sku: string) => void;
  updateQty: (sku: string, qty: number) => void;
  clearCart: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const CreditSellContext = createContext<CreditSellContextType>({
  items: [], totalItems: 0, totalCredit: 0, isOpen: false,
  addItem: () => {}, removeItem: () => {}, updateQty: () => {},
  clearCart: () => {}, openDrawer: () => {}, closeDrawer: () => {},
});

export function useCreditSell() {
  return useContext(CreditSellContext);
}

export function CreditSellProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CreditSellItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const addItem = useCallback((item: Omit<CreditSellItem, "quantity">) => {
    setItems(prev => {
      const existing = prev.find(i => i.sku === item.sku);
      if (existing) {
        return prev.map(i => i.sku === item.sku ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((sku: string) => {
    setItems(prev => prev.filter(i => i.sku !== sku));
  }, []);

  const updateQty = useCallback((sku: string, qty: number) => {
    if (qty <= 0) {
      setItems(prev => prev.filter(i => i.sku !== sku));
    } else {
      setItems(prev => prev.map(i => i.sku === sku ? { ...i, quantity: Math.min(qty, 99) } : i));
    }
  }, []);

  const clearCart = useCallback(() => { setItems([]); setIsOpen(false); }, []);
  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);

  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const totalCredit = items.reduce((s, i) => s + i.creditPrice * i.quantity, 0);

  return (
    <CreditSellContext.Provider value={{ items, totalItems, totalCredit, isOpen, addItem, removeItem, updateQty, clearCart, openDrawer, closeDrawer }}>
      {children}
    </CreditSellContext.Provider>
  );
}
