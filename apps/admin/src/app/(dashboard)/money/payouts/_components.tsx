"use client";

/**
 * Client-side row actions for /money/payouts.
 *
 * One operation: Record manual payout. Prompts for method + reference + reason
 * and dispatches to the recordPayout server action. Stripe Connect transfers
 * still happen in the legacy admin — that affordance shows as a deep-link
 * out, substrate-honest about where that work lives today.
 */

import { useTransition, useState } from "react";
import { recordPayout } from "./_actions";

const MANUAL_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "paypal", label: "PayPal" },
  { value: "crypto", label: "Crypto" },
  { value: "store_credit", label: "Store Credit" },
  { value: "stripe_connect", label: "Stripe Connect (already sent)" },
  { value: "other", label: "Other" },
];

interface PayoutActionsProps {
  payout: {
    kind: "trade" | "auction";
    id: string;
    label: string;
    connectReady: boolean;
    dueNow: boolean;
  };
}

export function PayoutActions({ payout }: PayoutActionsProps) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function recordManual() {
    setOpen(false);
    const methodList = MANUAL_METHODS.map((m, i) => `${i + 1}. ${m.label}`).join("\n");
    const choice = window.prompt(
      `Method for "${payout.label}":\n${methodList}\n\nEnter number (1–${MANUAL_METHODS.length}):`,
      "1",
    );
    if (!choice) return;
    const idx = parseInt(choice, 10) - 1;
    const method = MANUAL_METHODS[idx]?.value;
    if (!method) {
      window.alert(`Invalid choice. Pick 1–${MANUAL_METHODS.length}.`);
      return;
    }
    const reference =
      window.prompt("Reference (transfer id, bank ref — optional):") ?? "";
    const reason = window.prompt(
      "Reason / note (logged to admin governance):",
      `Recorded payout via ${method}`,
    );
    if (!reason) return;

    startTransition(async () => {
      const result = await recordPayout({
        kind: payout.kind,
        id: payout.id,
        method,
        reference: reference || undefined,
        reason,
      });
      if (!result.ok) window.alert(result.error);
    });
  }

  const legacyHref =
    payout.kind === "trade"
      ? `https://cambridgetcg.com/admin/payouts`
      : `https://cambridgetcg.com/admin/payouts`;

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending || !payout.dueNow}
        title={payout.dueNow ? "Record payout" : "Hold period not yet elapsed"}
        className="text-xs px-2 py-1 border border-neutral-700 rounded text-neutral-300 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {pending ? "…" : "Action ▾"}
      </button>
      {open && (
        <div
          className="absolute right-0 z-10 mt-1 w-56 rounded-md border border-neutral-700 bg-neutral-900 py-1 shadow-xl"
          onMouseLeave={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={recordManual}
            className="block w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Record manual payout
          </button>
          {payout.connectReady && (
            <a
              href={legacyHref}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10"
              onClick={() => setOpen(false)}
            >
              Pay via Connect (legacy admin) ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}
