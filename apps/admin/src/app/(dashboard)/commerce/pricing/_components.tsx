"use client";

/**
 * Inline price-edit cell.
 *
 * Click the price → edit mode. Enter saves, Escape cancels. Saves call the
 * `setCardPrice` server action; the wrapper handles auth + governance log
 * + revalidate. We optimistically update the DOM via state; on save error
 * we rollback and surface the message.
 */

import { useState, useTransition, useRef, useEffect } from "react";
import { setCardPrice } from "./_actions";

interface PriceCellProps {
  cardId: number;
  sku: string;
  /** Current override price, in GBP. Null = base price applies. */
  price: number | null;
  /** Computed base price (auto-derived from JPY). Shown when no override. */
  base: number | null;
}

export function PriceCell({ cardId, sku, price, base }: PriceCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(price != null ? price.toFixed(2) : "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<number | null | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const display = optimistic !== undefined ? optimistic : price;
  const drift = display != null && base != null && Math.abs(display - base) > 0.005;

  function commit() {
    const trimmed = draft.trim();
    let next: number | null;
    if (trimmed === "" || trimmed === "—") {
      next = null;
    } else {
      const n = parseFloat(trimmed);
      if (!Number.isFinite(n)) {
        setError("Not a number");
        return;
      }
      next = n;
    }
    setError(null);
    setEditing(false);
    setOptimistic(next);
    startTransition(async () => {
      const reason = `Inline edit on /commerce/pricing for ${sku}`;
      const result = await setCardPrice({ cardId, price: next, reason });
      if (!result.ok) {
        setOptimistic(undefined); // rollback
        setError(result.error);
        window.alert(result.error);
      }
    });
  }

  function cancel() {
    setDraft(price != null ? price.toFixed(2) : "");
    setEditing(false);
    setError(null);
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-neutral-500 text-xs">£</span>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
          onBlur={commit}
          className="w-20 rounded border border-blue-500 bg-neutral-900 px-2 py-0.5 text-right text-xs font-mono text-white focus:outline-none"
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => setEditing(true)}
      className={[
        "font-mono text-sm px-1 -mx-1 rounded hover:bg-neutral-800/60 transition disabled:opacity-50",
        display == null ? "text-neutral-600 italic" : drift ? "text-blue-400" : "text-white",
        error ? "ring-1 ring-red-500/50" : "",
      ].join(" ")}
      title={
        error
          ? error
          : display == null
            ? "No override — using base price"
            : drift
              ? "Manual override (differs from base)"
              : "Click to edit"
      }
    >
      {display == null ? "—" : `£${display.toFixed(2)}`}
    </button>
  );
}
