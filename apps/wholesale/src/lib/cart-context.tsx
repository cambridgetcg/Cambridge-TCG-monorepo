"use client";

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, ReactNode } from "react";

export interface CardData {
  id: number;
  cardNumber: string;
  sku: string;
  name: string;
  setCode: string | null;
  setName: string | null;
  price: number;
}

export interface CartItem {
  card: CardData;
  quantity: number;
}

export interface PriceChange {
  cardId: number;
  cardNumber: string;
  oldPrice: number;
  newPrice: number;
}

interface CartContextValue {
  items: CartItem[];
  addItem: (card: CardData, qty?: number) => void;
  removeItem: (cardId: number) => void;
  updateQuantity: (cardId: number, qty: number) => void;
  clear: () => void;
  flushSync: () => Promise<void>;
  refreshPrices: () => Promise<void>;
  total: number;
  itemCount: number;
  priceChanges: PriceChange[];
  dismissPriceChanges: () => void;
  isRefreshing: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "tcg-cart";
const SYNC_DEBOUNCE_MS = 1500;

/** Migrate old cart items that used priceExVat → price */
function migrateCartItems(items: CartItem[]): CartItem[] {
  return items.map((item) => {
    const card = item.card as CardData & { priceExVat?: number };
    if (card.price == null && card.priceExVat != null) {
      const { priceExVat, ...rest } = card;
      return { ...item, card: { ...rest, price: priceExVat } as CardData };
    }
    return item;
  });
}

function mergeItems(local: CartItem[], server: CartItem[]): CartItem[] {
  const map = new Map<number, CartItem>();
  for (const item of server) map.set(item.card.id, item);
  for (const item of local) {
    const existing = map.get(item.card.id);
    if (existing) {
      map.set(item.card.id, {
        card: item.card,
        quantity: Math.max(item.quantity, existing.quantity),
      });
    } else {
      map.set(item.card.id, item);
    }
  }
  return Array.from(map.values());
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncingFromServer = useRef(false);

  // Debounced PUT to server
  const syncToServer = useCallback((cartItems: CartItem[]) => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      fetch("/api/cart", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cartItems }),
      }).catch(() => {});
    }, SYNC_DEBOUNCE_MS);
  }, []);

  // On mount: hydrate from localStorage, then merge with server
  useEffect(() => {
    let localItems: CartItem[] = [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          localItems = migrateCartItems(parsed);
          setItems(localItems);
        }
      }
    } catch {}
    setHydrated(true);

    fetch("/api/cart")
      .then((res) => {
        if (!res.ok) throw new Error("Not authenticated");
        return res.json();
      })
      .then((serverItems: CartItem[]) => {
        if (!Array.isArray(serverItems)) return;
        if (localItems.length === 0 && serverItems.length > 0) {
          isSyncingFromServer.current = true;
          setItems(serverItems);
        } else if (localItems.length > 0 && serverItems.length > 0) {
          const merged = mergeItems(localItems, serverItems);
          isSyncingFromServer.current = true;
          setItems(merged);
        } else if (localItems.length > 0 && serverItems.length === 0) {
          syncToServer(localItems);
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist to localStorage on change, and sync to server
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    if (isSyncingFromServer.current) {
      isSyncingFromServer.current = false;
      syncToServer(items);
      return;
    }
    syncToServer(items);
  }, [items, hydrated, syncToServer]);

  /**
   * Fetch current prices from the server for all items in the cart.
   * Updates item prices in place and surfaces a list of changes.
   */
  const refreshPrices = useCallback(async () => {
    setItems((current) => {
      if (current.length === 0) return current;
      return current; // start fetch below with latest items
    });

    setIsRefreshing(true);
    try {
      // Capture current items synchronously via a ref-style read
      // (setItems callback gives us the latest snapshot)
      let snapshot: CartItem[] = [];
      setItems((current) => {
        snapshot = current;
        return current;
      });

      if (snapshot.length === 0) return;

      const cardIds = snapshot.map((i) => i.card.id);
      const res = await fetch("/api/cart/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds }),
      });
      if (!res.ok) return;

      const { prices } = await res.json() as { prices: Record<number, number> };
      // Collect changes inside setItems so we get the stable final snapshot.
      // Using a ref avoids the race where React may call the updater multiple
      // times in concurrent mode, causing duplicate entries in `changes`.
      const detectedChanges = { current: [] as PriceChange[] };

      setItems((current) => {
        const localChanges: PriceChange[] = [];
        const updated = current.map((item) => {
          const newPrice = prices[item.card.id];
          if (newPrice == null || newPrice === item.card.price) return item;
          localChanges.push({
            cardId: item.card.id,
            cardNumber: item.card.cardNumber,
            oldPrice: item.card.price,
            newPrice,
          });
          return { ...item, card: { ...item.card, price: newPrice } };
        });
        detectedChanges.current = localChanges;
        return localChanges.length > 0 ? updated : current;
      });

      if (detectedChanges.current.length > 0) setPriceChanges(detectedChanges.current);
    } catch {
      // Silent — price refresh is best-effort
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const dismissPriceChanges = useCallback(() => setPriceChanges([]), []);

  const addItem = useCallback((card: CardData, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.card.id === card.id);
      if (existing) {
        return prev.map((i) =>
          i.card.id === card.id ? { ...i, quantity: i.quantity + qty } : i
        );
      }
      return [...prev, { card, quantity: qty }];
    });
  }, []);

  const removeItem = useCallback((cardId: number) => {
    setItems((prev) => prev.filter((i) => i.card.id !== cardId));
  }, []);

  const updateQuantity = useCallback((cardId: number, qty: number) => {
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.card.id !== cardId));
    } else {
      setItems((prev) =>
        prev.map((i) => (i.card.id === cardId ? { ...i, quantity: qty } : i))
      );
    }
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    setPriceChanges([]);
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    fetch("/api/cart", { method: "DELETE" }).catch(() => {});
  }, []);

  const flushSync = useCallback(async () => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    if (items.length > 0) {
      await fetch("/api/cart", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      }).catch(() => {});
    }
  }, [items]);

  const total = useMemo(
    () => items.reduce((sum, i) => sum + i.card.price * i.quantity, 0),
    [items]
  );

  const itemCount = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items]
  );

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clear,
        flushSync,
        refreshPrices,
        total,
        itemCount,
        priceChanges,
        dismissPriceChanges,
        isRefreshing,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
