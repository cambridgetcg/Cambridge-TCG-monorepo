"use client";

/**
 * Client primitives for the B2B cart.
 *
 *   <AddToB2BCart sku={...} />              — used on catalog + detail
 *   <QtyControl sku={...} initial={N} />    — used on cart page rows
 *   <RemoveButton sku={...} />              — used on cart page rows
 *   <ClearButton />                          — used on cart page header
 *
 * All four are thin transitions over the server actions. Optimistic
 * UI is intentionally absent — revalidatePath() re-renders the parent
 * server component, so the next paint shows the new truth.
 */

import { useState, useTransition } from "react";
import {
  addB2BCartItem,
  setB2BCartQuantity,
  removeB2BCartItem,
  clearB2BCart,
} from "./actions";

export function AddToB2BCart({
  sku,
  compact = false,
  disabled = false,
}: {
  sku: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const label = pending ? "Adding…" : done ? "Added ✓" : "Add to cart";
  return (
    <button
      type="button"
      disabled={pending || disabled}
      onClick={() => {
        start(async () => {
          await addB2BCartItem(sku);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className={
        compact
          ? "rounded bg-emerald-500/20 px-2 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50"
          : "rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
      }
    >
      {label}
    </button>
  );
}

export function QtyControl({ sku, initial }: { sku: string; initial: number }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(initial);

  const update = (next: number) => {
    const safe = Math.max(0, Math.floor(next));
    setValue(safe);
    start(async () => {
      await setB2BCartQuantity(sku, safe);
    });
  };

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={pending || value <= 1}
        onClick={() => update(value - 1)}
        className="h-7 w-7 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-30"
      >
        −
      </button>
      <input
        type="number"
        min={1}
        max={9999}
        value={value}
        disabled={pending}
        onChange={(e) => setValue(parseInt(e.target.value, 10) || 0)}
        onBlur={(e) => update(parseInt(e.target.value, 10) || 0)}
        className="h-7 w-14 rounded border border-neutral-700 bg-neutral-900 text-center text-sm"
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => update(value + 1)}
        className="h-7 w-7 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

export function RemoveButton({ sku }: { sku: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { await removeB2BCartItem(sku); })}
      className="text-xs text-neutral-500 hover:text-red-400 disabled:opacity-50"
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}

export function ClearButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Empty the cart?")) return;
        start(async () => { await clearB2BCart(); });
      }}
      className="text-xs text-neutral-500 hover:text-red-400 disabled:opacity-50"
    >
      {pending ? "Clearing…" : "Empty cart"}
    </button>
  );
}
