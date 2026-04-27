"use client";

import { useCart } from "@/context/CartContext";
import type { CartItem } from "@/lib/cart";

interface QuickAddProps {
  card: {
    sku: string;
    name: string;
    price: number;
    image_url: string | null;
    set_code: string | null;
    card_number: string;
  };
  stock: number;
}

export default function QuickAddButton({ card, stock }: QuickAddProps) {
  const { items, addItem } = useCart();
  const inCart = items.find((i) => i.sku === card.sku);

  if (stock === 0) return null;

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (inCart) return;
    const item: CartItem = {
      sku: card.sku,
      name: card.name,
      price: card.price,
      image_url: card.image_url,
      quantity: 1,
      set_code: card.set_code,
      card_number: card.card_number,
    };
    addItem(item);
  }

  if (inCart) {
    return (
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        className="absolute bottom-2 left-2 right-2 flex items-center justify-center gap-1.5 py-1.5 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-default"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        In Cart
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="absolute bottom-2 left-2 right-2 py-1.5 bg-emerald-500 text-black text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-emerald-400"
    >
      Add to Cart
    </button>
  );
}
