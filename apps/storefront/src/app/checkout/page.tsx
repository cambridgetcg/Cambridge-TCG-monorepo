"use client";

import { useCart } from "@/context/CartContext";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { WhyLink } from "@/lib/ui";

export default function CheckoutPage() {
  const { items, totalPrice } = useCart();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Store credit redemption state
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [useCredit, setUseCredit] = useState(false);

  useEffect(() => {
    // Pull current credit balance so the user sees what's available
    fetch("/api/membership")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const balance = d?.profile?.store_credit_balance;
        if (typeof balance === "number") setCreditBalance(balance);
      })
      .catch(() => {});
  }, []);

  // How much credit will actually be applied — capped at balance and
  // total-1p (Stripe needs a non-zero charge).
  const creditApplied = useCredit && creditBalance && creditBalance > 0
    ? Math.min(creditBalance, Math.max(totalPrice - 0.01, 0))
    : 0;
  const cashDue = Math.max(totalPrice - creditApplied, 0);

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          ...(useCredit ? { creditToApply: creditBalance ?? 0 } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-display font-semibold mb-4">Your cart is empty</h1>
        <p className="text-ink-muted mb-6">Add some cards before checking out.</p>
        <Link
          href="/catalog?game=one-piece"
          className="inline-block px-6 py-3 bg-ink text-page font-bold rounded-lg hover:opacity-90 transition"
        >
          Browse Catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-display font-semibold mb-8">Checkout</h1>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Order summary */}
        <div className="lg:col-span-3 space-y-4">
          <h2 className="text-lg font-bold text-ink-muted">Order Summary</h2>
          <div className="bg-surface border border-border-subtle rounded-lg divide-y divide-border-subtle">
            {items.map((item) => (
              <div key={item.sku} className="flex gap-4 p-4">
                <div className="relative w-14 h-18 rounded-lg overflow-hidden bg-surface-subtle shrink-0">
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.name}
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  ) : (
                    <div className="w-full h-full bg-surface-subtle" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-ink-muted">{item.card_number}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-ink">
                    {"£"}{(item.price * item.quantity).toFixed(2)}
                  </p>
                  <p className="text-xs text-ink-muted">Qty: {item.quantity}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment panel */}
        <div className="lg:col-span-2">
          <div className="bg-surface border border-border-subtle rounded-lg p-6 space-y-4 sticky top-24">
            <h2 className="text-lg font-bold text-ink-muted">Payment</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-muted">Subtotal</span>
                <span>{"£"}{totalPrice.toFixed(2)}</span>
              </div>
              {creditApplied > 0 && (
                <div className="flex justify-between">
                  <span className="text-accent inline-flex items-center gap-1">
                    Store credit applied
                    <WhyLink href="/methodology/store-credit" />
                  </span>
                  <span className="text-accent">&minus;{"£"}{creditApplied.toFixed(2)}</span>
                </div>
              )}
              {useCredit &&
                creditBalance !== null &&
                creditBalance - creditApplied > 0.001 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-faint">Credit left unused</span>
                    <span className="text-ink-faint">
                      {"£"}{(creditBalance - creditApplied).toFixed(2)} stays in your account
                    </span>
                  </div>
                )}
              <div className="flex justify-between">
                <span className="text-ink-muted">Shipping</span>
                <span className="text-ink-faint">Calculated at checkout</span>
              </div>
              <div className="border-t border-border-subtle pt-2 flex justify-between text-lg font-bold">
                <span>Cash due</span>
                <span className="text-ink">{"£"}{cashDue.toFixed(2)}</span>
              </div>
            </div>

            {/* Credit redemption */}
            {creditBalance !== null && creditBalance > 0 && (
              <label className="flex items-start gap-2 bg-accent-wash border border-accent/20 rounded-lg p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCredit}
                  onChange={(e) => setUseCredit(e.target.checked)}
                  className="mt-0.5"
                />
                <div className="text-sm">
                  <p className="text-accent-strong font-medium">
                    Apply store credit (&pound;{creditBalance.toFixed(2)} available)
                  </p>
                  <p className="text-xs text-ink-faint mt-0.5">
                    Reduces cash due. Remaining credit stays in your balance.
                    Earned cashback / points apply to the cash-due amount only.
                  </p>
                </div>
              </label>
            )}

            {error && (
              <p className="text-sm text-danger bg-danger/10 rounded-lg p-3">{error}</p>
            )}

            <button
              onClick={handleCheckout}
              disabled={loading}
              className="w-full px-6 py-4 bg-ink text-page font-bold rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed text-lg"
            >
              {loading ? "Redirecting to Stripe..." : "Pay with Stripe"}
            </button>

            <p className="text-xs text-ink-faint text-center">
              You&apos;ll be redirected to Stripe&apos;s secure checkout to complete your payment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
