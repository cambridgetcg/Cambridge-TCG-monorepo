export interface CartItem {
  sku: string;
  name: string;
  price: number;
  image_url: string | null;
  quantity: number;
  set_code: string | null;
  card_number: string;
}

const CART_KEY = "cambridgetcg_cart";

export function loadCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCart(items: CartItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

export function addItem(items: CartItem[], item: CartItem): CartItem[] {
  const existing = items.find((i) => i.sku === item.sku);
  if (existing) {
    return items.map((i) =>
      i.sku === item.sku ? { ...i, quantity: i.quantity + item.quantity } : i
    );
  }
  return [...items, item];
}

export function removeItem(items: CartItem[], sku: string): CartItem[] {
  return items.filter((i) => i.sku !== sku);
}

export function updateQty(items: CartItem[], sku: string, quantity: number): CartItem[] {
  if (quantity <= 0) return removeItem(items, sku);
  return items.map((i) => (i.sku === sku ? { ...i, quantity } : i));
}

export function totalItems(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

export function totalPrice(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}
