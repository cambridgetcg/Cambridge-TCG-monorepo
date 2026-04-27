"use client";

import { useEffect } from "react";
import { useCart } from "@/context/CartContext";
import Link from "next/link";

export default function OrderDetails() {
  const { clearCart } = useCart();

  useEffect(() => {
    clearCart();
  }, [clearCart]);

  return (
    <div className="text-center mt-8">
      <Link
        href="/catalog?game=one-piece"
        className="inline-block px-6 py-3 bg-emerald-500 text-black font-bold rounded-lg hover:bg-emerald-400 transition"
      >
        Continue Shopping
      </Link>
    </div>
  );
}
