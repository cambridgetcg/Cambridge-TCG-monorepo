"use client";

import { useState } from "react";
import { useCreditSell } from "@/context/CreditSellContext";
import { formatPrice } from "@/lib/format";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

export default function CreditSellDrawer() {
  const { items, totalItems, totalCredit, isOpen, closeDrawer, updateQty, removeItem, clearCart } = useCreditSell();
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/market/sell-for-credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map(i => ({ sku: i.sku, quantity: i.quantity })),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast(data.error || "Submission failed.", "error");
        setSubmitting(false);
        return;
      }

      toast(`Trade-in submitted! ${data.itemCount} cards for ${formatPrice(data.totalCredit)} credit.`, "success");
      clearCart();
      router.push(`/trade-in/confirm/${data.reference}`);
    } catch {
      toast("Network error. Please try again.", "error");
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={closeDrawer} />
      <div className="relative bg-neutral-950 w-full max-w-md h-full flex flex-col border-l border-neutral-800">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-neutral-800">
          <div>
            <h2 className="text-lg font-bold text-white">Sell for Credit</h2>
            <p className="text-xs text-neutral-500">{totalItems} card{totalItems !== 1 ? "s" : ""} · {formatPrice(totalCredit)} credit</p>
          </div>
          <button onClick={closeDrawer} className="text-neutral-400 hover:text-white transition text-2xl">&times;</button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {items.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-neutral-500">No cards added yet.</p>
              <p className="text-xs text-neutral-600 mt-1">Click &quot;Sell&quot; on any card in the market to add it here.</p>
            </div>
          ) : (
            items.map(item => (
              <div key={item.sku} className="flex gap-3 bg-neutral-900 rounded-xl p-3">
                <div className="relative w-12 h-16 rounded-lg overflow-hidden bg-neutral-800 shrink-0">
                  {item.imageUrl ? (
                    <Image src={item.imageUrl} alt={item.name} fill className="object-cover" sizes="48px" />
                  ) : (
                    <div className="w-full h-full bg-neutral-700" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{item.name}</p>
                  <p className="text-xs text-neutral-500">{item.cardNumber}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => updateQty(item.sku, item.quantity - 1)} className="w-7 h-7 bg-neutral-700 hover:bg-neutral-600 rounded text-sm font-bold transition">-</button>
                    <span className="text-sm font-medium w-5 text-center">{item.quantity}</span>
                    <button onClick={() => updateQty(item.sku, item.quantity + 1)} className="w-7 h-7 bg-neutral-700 hover:bg-neutral-600 rounded text-sm font-bold transition">+</button>
                    <button onClick={() => removeItem(item.sku)} className="ml-auto text-xs text-neutral-500 hover:text-red-400 transition">Remove</button>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-purple-400">{formatPrice(item.creditPrice * item.quantity)}</p>
                  <p className="text-xs text-neutral-500">{formatPrice(item.creditPrice)} ea</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="px-4 py-4 border-t border-neutral-800 space-y-3">
            <div className="flex justify-between text-lg font-bold">
              <span className="text-white">Total Credit</span>
              <span className="text-purple-400">{formatPrice(totalCredit)}</span>
            </div>
            <p className="text-xs text-neutral-500">
              Credit is issued after we review and accept your submission. You&apos;ll receive a formal quotation.
            </p>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3 bg-purple-500 text-white font-bold rounded-lg hover:bg-purple-400 transition disabled:opacity-50"
            >
              {submitting ? "Submitting..." : `Submit ${totalItems} Card${totalItems !== 1 ? "s" : ""} for Credit`}
            </button>
            <button
              onClick={clearCart}
              className="w-full py-2 text-sm text-neutral-500 hover:text-red-400 transition"
            >
              Clear all
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
