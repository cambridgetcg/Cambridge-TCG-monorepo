export interface SellCartItem {
  sku: string;
  game: string;
  card_number: string;
  name: string;
  set_code: string | null;
  image_url: string | null;
  cash_price: number;
  credit_price: number;
  quantity: number;
}

const CART_KEY = "cambridgetcg_tradein_cart";

export function loadSellCart(): SellCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CART_KEY);
    const items: SellCartItem[] = raw ? JSON.parse(raw) : [];
    // Carts saved before multi-game support lack a game field
    return items.map((i) => ({ ...i, game: i.game || "one-piece" }));
  } catch {
    return [];
  }
}

export function saveSellCart(items: SellCartItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

export function clearSellCart() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CART_KEY);
}

export function addSellItem(items: SellCartItem[], item: SellCartItem): SellCartItem[] {
  const existing = items.find((i) => i.sku === item.sku);
  if (existing) {
    return items.map((i) =>
      i.sku === item.sku ? { ...i, quantity: i.quantity + item.quantity } : i
    );
  }
  return [...items, item];
}

export function removeSellItem(items: SellCartItem[], sku: string): SellCartItem[] {
  return items.filter((i) => i.sku !== sku);
}

export function updateSellQty(items: SellCartItem[], sku: string, quantity: number): SellCartItem[] {
  if (quantity <= 0) return removeSellItem(items, sku);
  return items.map((i) => (i.sku === sku ? { ...i, quantity } : i));
}

export function sellTotalItems(items: SellCartItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

export function sellCashTotal(items: SellCartItem[]): number {
  return items.reduce((sum, i) => sum + i.cash_price * i.quantity, 0);
}

export function sellCreditTotal(items: SellCartItem[]): number {
  return items.reduce((sum, i) => sum + i.credit_price * i.quantity, 0);
}
