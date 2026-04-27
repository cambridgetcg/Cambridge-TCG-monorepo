"use client";

import { useState } from "react";
import { useCart } from "@/context/CartContext";
import type { CartItem } from "@/lib/cart";

interface AddToCartProps {
  card: {
    sku: string;
    name: string;
    price: number;
    image_url: string | null;
    set_code: string | null;
    card_number: string;
  };
}

export default function AddToCart({ card }: AddToCartProps) {
  const { items, addItem, updateQty, removeItem } = useCart();
  const [added, setAdded] = useState(false);

  const inCart = items.find((i) => i.sku === card.sku);

  function handleAdd() {
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
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  if (inCart) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => updateQty(card.sku, inCart.quantity - 1)}
          className="w-12 h-12 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl transition text-lg"
        >
          -
        </button>
        <span className="text-lg font-bold w-8 text-center">{inCart.quantity}</span>
        <button
          onClick={() => updateQty(card.sku, inCart.quantity + 1)}
          className="w-12 h-12 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl transition text-lg"
        >
          +
        </button>
        <button
          onClick={() => removeItem(card.sku)}
          className="ml-2 text-sm text-neutral-400 hover:text-red-400 transition"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleAdd}
      className="px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl transition text-lg"
    >
      {added ? "Added \u2713" : `Add to Cart \u2014 \u00A3${card.price.toFixed(2)}`}
    </button>
  );
}
