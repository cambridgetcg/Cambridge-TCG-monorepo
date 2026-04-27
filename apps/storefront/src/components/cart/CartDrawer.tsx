"use client";

import { useCart } from "@/context/CartContext";
import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";

export default function CartDrawer() {
  const { items, drawerOpen, closeDrawer, updateQty, removeItem, totalPrice } = useCart();

  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  return (
    <>
      {/* Backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-50"
          onClick={closeDrawer}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-neutral-900 shadow-2xl z-50 transform transition-transform duration-300 ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-neutral-800">
            <h2 className="text-lg font-bold">Your Cart</h2>
            <button
              onClick={closeDrawer}
              className="w-10 h-10 flex items-center justify-center text-neutral-400 hover:text-white transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Items */}
          {items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <p className="text-neutral-400">Your cart is empty</p>
              <Link
                href="/catalog?game=one-piece"
                onClick={closeDrawer}
                className="px-6 py-3 bg-emerald-500 text-black font-bold rounded-lg hover:bg-emerald-400 transition"
              >
                Browse Catalog
              </Link>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {items.map((item) => (
                  <div key={item.sku} className="flex gap-3 bg-neutral-800/50 rounded-xl p-3">
                    <div className="relative w-16 h-20 rounded-lg overflow-hidden bg-neutral-800 shrink-0">
                      {item.image_url ? (
                        <Image
                          src={item.image_url}
                          alt={item.name}
                          fill
                          className="object-cover"
                          sizes="64px"
                        />
                      ) : (
                        <div className="w-full h-full bg-neutral-700" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-neutral-400">{item.card_number}</p>
                      <p className="text-sm font-bold text-emerald-400 mt-1">
                        {"\u00A3"}{(item.price * item.quantity).toFixed(2)}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => updateQty(item.sku, item.quantity - 1)}
                          className="w-7 h-7 bg-neutral-700 hover:bg-neutral-600 rounded-lg text-sm font-bold transition"
                        >
                          -
                        </button>
                        <span className="text-sm font-medium w-5 text-center">{item.quantity}</span>
                        <button
                          onClick={() => updateQty(item.sku, item.quantity + 1)}
                          className="w-7 h-7 bg-neutral-700 hover:bg-neutral-600 rounded-lg text-sm font-bold transition"
                        >
                          +
                        </button>
                        <button
                          onClick={() => removeItem(item.sku)}
                          className="ml-auto text-xs text-neutral-500 hover:text-red-400 transition"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-neutral-800 space-y-3">
                <div className="flex justify-between text-lg font-bold">
                  <span>Subtotal</span>
                  <span className="text-emerald-400">{"\u00A3"}{totalPrice.toFixed(2)}</span>
                </div>
                <Link
                  href="/checkout"
                  onClick={closeDrawer}
                  className="block w-full text-center px-6 py-3 bg-emerald-500 text-black font-bold rounded-lg hover:bg-emerald-400 transition"
                >
                  Checkout
                </Link>
                <button
                  onClick={closeDrawer}
                  className="block w-full text-center px-6 py-3 text-neutral-400 hover:text-white transition text-sm"
                >
                  Continue Shopping
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
