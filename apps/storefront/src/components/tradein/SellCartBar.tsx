"use client";

import { useSellCart } from "@/context/SellCartContext";
import { formatPrice } from "@/lib/format";

export default function SellCartBar() {
  const { totalItems, cashTotal, creditTotal, openDrawer } = useSellCart();

  if (totalItems === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-accent/30">
      <div className="bg-surface/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 overflow-hidden">
            <span className="text-sm font-bold text-ink shrink-0">
              {totalItems} card{totalItems !== 1 ? "s" : ""}
            </span>
            <span className="text-xs sm:text-sm text-ink-muted truncate">
              <span className="text-accent-strong font-medium">{formatPrice(cashTotal)}</span>
              <span className="mx-1 text-neutral-600">/</span>
              <span className="text-accent-strong font-medium">{formatPrice(creditTotal)}</span>
            </span>
          </div>
          <button
            onClick={openDrawer}
            className="px-4 sm:px-5 py-2.5 bg-accent text-black text-sm font-bold rounded-lg hover:bg-accent-strong transition shrink-0"
          >
            Review
          </button>
        </div>
      </div>
    </div>
  );
}
