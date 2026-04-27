"use client";

import { useSellCart } from "@/context/SellCartContext";
import { formatPrice } from "@/lib/format";
import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";

export default function SellCartDrawer() {
  const { items, drawerOpen, closeDrawer, updateQty, removeItem, cashTotal, creditTotal } = useSellCart();

  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  const minWarning = creditTotal < 5 && items.length > 0;

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
            <h2 className="text-lg font-bold text-amber-400">Sell Cart</h2>
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-neutral-400">Your sell cart is empty</p>
              <p className="text-neutral-500 text-sm">Add cards from the buylist to get started</p>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {items.map((item) => (
                  <div key={item.sku} className="flex gap-3 bg-neutral-800/50 rounded-xl p-3">
                    <div className="relative w-12 h-16 rounded-lg overflow-hidden bg-neutral-800 shrink-0">
                      {item.image_url ? (
                        <Image
                          src={item.image_url}
                          alt={item.name}
                          fill
                          className="object-cover"
                          sizes="48px"
                        />
                      ) : (
                        <div className="w-full h-full bg-neutral-700" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-neutral-500">{item.card_number}</p>
                      <div className="flex gap-3 mt-1">
                        <span className="text-xs text-neutral-400">
                          Cash: <span className="text-amber-400">{formatPrice(item.cash_price * item.quantity)}</span>
                        </span>
                        <span className="text-xs text-neutral-400">
                          Credit: <span className="text-amber-400">{formatPrice(item.credit_price * item.quantity)}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => updateQty(item.sku, item.quantity - 1)}
                          className="w-9 h-9 bg-neutral-700 hover:bg-neutral-600 rounded-lg text-sm font-bold transition"
                        >
                          -
                        </button>
                        <span className="text-sm font-medium w-5 text-center">{item.quantity}</span>
                        <button
                          onClick={() => updateQty(item.sku, item.quantity + 1)}
                          className="w-9 h-9 bg-neutral-700 hover:bg-neutral-600 rounded-lg text-sm font-bold transition"
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
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">Cash total</span>
                  <span className="text-amber-400 font-bold">{formatPrice(cashTotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">Credit total</span>
                  <span className="text-amber-400 font-bold">{formatPrice(creditTotal)}</span>
                </div>

                {minWarning && (
                  <p className="text-xs text-amber-400/80 bg-amber-500/10 rounded-lg px-3 py-2">
                    Minimum credit value is £5.00. Add more cards to proceed.
                  </p>
                )}

                <Link
                  href="/trade-in/submit"
                  onClick={closeDrawer}
                  className="block w-full text-center px-6 py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition"
                >
                  Submit Trade-In
                </Link>
                <button
                  onClick={closeDrawer}
                  className="block w-full text-center px-6 py-3 text-neutral-400 hover:text-white transition text-sm"
                >
                  Continue Browsing
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
