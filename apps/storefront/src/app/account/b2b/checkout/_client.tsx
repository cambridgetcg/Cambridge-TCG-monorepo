"use client";

/**
 * Pay button — runs startB2BCheckout() and redirects to Stripe on
 * success. On failure shows the error inline so the buyer knows
 * which SKU blocked them.
 */

import { useState, useTransition } from "react";
import { startB2BCheckout } from "./actions";

export function PayButton({ disabled = false }: { disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onPay = () => {
    setError(null);
    start(async () => {
      const result = await startB2BCheckout();
      if (result.ok) {
        window.location.href = result.url;
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onPay}
        disabled={pending || disabled}
        className="w-full rounded bg-amber-500 px-6 py-3 text-base font-semibold text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
      >
        {pending ? "Creating Stripe session…" : "Pay with Stripe →"}
      </button>
      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
      <p className="text-xs text-neutral-500">
        You&rsquo;ll be redirected to Stripe to complete payment. Stock is reserved at the
        moment you click Pay; if the session expires (24h) the reservation releases automatically.
      </p>
    </div>
  );
}
