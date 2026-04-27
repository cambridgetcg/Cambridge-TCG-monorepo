"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { useCart } from "@/lib/cart-context";

export default function NewOrderPage() {
  const router = useRouter();
  const {
    items,
    updateQuantity,
    removeItem,
    clear,
    total,
    itemCount,
    refreshPrices,
    priceChanges,
    dismissPriceChanges,
    isRefreshing,
  } = useCart();
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Refresh prices automatically when the page mounts
  useEffect(() => {
    if (items.length > 0) refreshPrices();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submitOrder() {
    if (items.length === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ cardId: i.card.id, quantity: i.quantity })),
          notes: notes.trim() || undefined,
        }),
      });
      if (res.ok) {
        const order = await res.json();
        clear();
        router.push(`/orders/${order.id}?submitted=1`);
      } else {
        setError("Failed to submit quote request. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection.");
    }
    setSubmitting(false);
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="mb-6 text-2xl font-bold">Review Order</h1>

        {/* Price change banner */}
        {priceChanges.length > 0 && (
          <div className="mb-6 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-yellow-400 mb-1">
                  Prices updated — {priceChanges.length} item{priceChanges.length > 1 ? "s" : ""} changed
                </p>
                <ul className="text-xs text-yellow-300/80 space-y-0.5">
                  {priceChanges.map((c) => (
                    <li key={c.cardId}>
                      {c.cardNumber}:{" "}
                      <span className="line-through text-yellow-500/60">£{c.oldPrice.toFixed(2)}</span>
                      {" → "}
                      <span className={c.newPrice > c.oldPrice ? "text-red-400" : "text-green-400"}>
                        £{c.newPrice.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={dismissPriceChanges}
                className="text-yellow-500/60 hover:text-yellow-400 transition text-xs shrink-0"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="rounded-lg border border-[#1e1e2e] bg-[#12121a] p-8 text-center">
            <p className="text-gray-400 mb-4">Your cart is empty.</p>
            <Link
              href="/catalog"
              className="rounded bg-brand-600 px-4 py-2 text-sm font-medium hover:bg-brand-700 transition"
            >
              Browse Catalog
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Editable cart table */}
            <div className="lg:col-span-2 overflow-x-auto rounded-lg border border-[#1e1e2e]">
              <table className="w-full text-sm">
                <thead className="bg-[#12121a]">
                  <tr className="text-left text-gray-400">
                    <th className="px-2 md:px-4 py-3 font-medium">Card #</th>
                    <th className="px-2 md:px-4 py-3 font-medium hidden md:table-cell">Name</th>
                    <th className="px-2 md:px-4 py-3 font-medium text-right">Unit Price</th>
                    <th className="px-2 md:px-4 py-3 font-medium text-right">Qty</th>
                    <th className="px-2 md:px-4 py-3 font-medium text-right">Line Total</th>
                    <th className="px-2 md:px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e1e2e]">
                  {items.map((item) => {
                    const changed = priceChanges.find((c) => c.cardId === item.card.id);
                    return (
                      <tr key={item.card.id} className={changed ? "bg-yellow-500/5" : ""}>
                        <td className="px-2 md:px-4 py-3">
                          <span className="font-mono text-brand-500">{item.card.cardNumber}</span>
                        </td>
                        <td className="px-2 md:px-4 py-3 text-gray-400 hidden md:table-cell text-xs">
                          {item.card.name || "—"}
                        </td>
                        <td className="px-2 md:px-4 py-3 text-right text-gray-400">
                          £{item.card.price.toFixed(2)}
                          {changed && (
                            <span className="ml-1 text-[10px] text-yellow-400">↑</span>
                          )}
                        </td>
                        <td className="px-2 md:px-4 py-3 text-right">
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (val >= 1) updateQuantity(item.card.id, val);
                            }}
                            className="w-16 rounded bg-[#0a0a0f] border border-[#1e1e2e] px-2 py-1 text-right text-sm focus:border-brand-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-2 md:px-4 py-3 text-right font-medium">
                          £{(item.card.price * item.quantity).toFixed(2)}
                        </td>
                        <td className="px-2 md:px-4 py-3 text-right">
                          <button
                            onClick={() => removeItem(item.card.id)}
                            className="text-gray-500 hover:text-red-400 transition text-xs"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Order summary sidebar */}
            <div className="rounded-lg border border-[#1e1e2e] bg-[#12121a] p-4 space-y-4">
              <h2 className="font-semibold">Order Summary</h2>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-400">
                  <span>{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
                </div>
                <div className="border-t border-[#1e1e2e] pt-2 flex justify-between text-lg font-bold">
                  <span>Total (inc. VAT)</span>
                  <span className="text-green-400">£{total.toFixed(2)}</span>
                </div>
              </div>

              {/* Price refresh */}
              <button
                onClick={refreshPrices}
                disabled={isRefreshing}
                className="w-full rounded border border-[#1e1e2e] bg-[#0a0a0f] py-2 text-xs text-gray-400 hover:text-gray-200 hover:border-gray-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isRefreshing ? (
                  <>
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    Refreshing prices…
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh prices
                  </>
                )}
              </button>

              {/* Notes */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special requests, delivery instructions..."
                  rows={3}
                  className="w-full rounded bg-[#0a0a0f] border border-[#1e1e2e] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none resize-none"
                />
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <button
                onClick={submitOrder}
                disabled={submitting || items.length === 0}
                className="w-full rounded bg-green-600 py-2.5 text-sm font-medium hover:bg-green-700 transition disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit for Quote"}
              </button>

              <p className="text-xs text-gray-500 text-center">
                This submits a quote request. We&apos;ll confirm pricing and availability.
              </p>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
