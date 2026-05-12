"use client";

/**
 * Client-side action triggers for /money/chargebacks.
 *
 * Two operations: Annotate (always available) and Force resolve (only when
 * the dispute is not yet terminal). Both prompt for a reason and feed
 * straight into adminAction-wrapped server actions.
 */

import { useState, useTransition } from "react";
import { annotateChargeback, forceResolveChargeback } from "./_actions";
import { Consequences } from "@/lib/ui";

const TERMINAL = ["won", "lost", "warning_closed", "charge_refunded", "admin_resolved"];

// The Heptapod's primitive applied to force-resolve. The operator sees
// what the action will do *before* committing, not after — substrate-
// honest about the local-truth / Stripe-authoritative asymmetry.
// First adoption of <Consequences>; closes the audit's Heptapod check.
// See docs/connections/the-other-minds.md.
const FORCE_RESOLVE_CONSEQUENCES = [
  {
    label: "Local status",
    delta: "→ admin_resolved",
    tone: "red" as const,
    methodology: "/methodology/chargebacks",
  },
  {
    label: "Stripe-side",
    delta: "unchanged (we don't push back to Stripe)",
    tone: "amber" as const,
  },
  {
    label: "Audit",
    delta: "+1 chargeback_lifecycle_log, +1 admin_actions_log",
    tone: "neutral" as const,
  },
  {
    label: "Reversibility",
    delta: "manual SQL only",
    tone: "red" as const,
  },
];

interface ChargebackActionsProps {
  chargeback: { id: string; status: string };
}

export function ChargebackActions({ chargeback }: ChargebackActionsProps) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const isTerminal = TERMINAL.includes(chargeback.status);

  function annotate() {
    const reason = window.prompt(
      "Annotation note?\n(Logged to chargeback_lifecycle_log + governance audit.)",
    );
    if (!reason) return;
    setOpen(false);
    startTransition(async () => {
      const result = await annotateChargeback({ id: chargeback.id, reason });
      if (!result.ok) window.alert(result.error);
    });
  }

  function forceResolve() {
    const reason = window.prompt(
      "Reason for force-resolving this chargeback?\n(Sets stripe_status=admin_resolved. Local truth only — no Stripe-side change.)",
    );
    if (!reason) return;
    setOpen(false);
    startTransition(async () => {
      const result = await forceResolveChargeback({ id: chargeback.id, reason });
      if (!result.ok) window.alert(result.error);
    });
  }

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="text-xs px-2 py-1 border border-neutral-700 rounded text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
      >
        {pending ? "…" : "Action ▾"}
      </button>
      {open && (
        <div
          className="absolute right-0 z-10 mt-1 w-48 rounded-md border border-neutral-700 bg-neutral-900 py-1 shadow-xl"
          onMouseLeave={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={annotate}
            className="block w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Annotate
          </button>
          {!isTerminal && (
            <>
              <div className="px-3 py-2">
                <Consequences
                  title="Force resolve will do"
                  items={FORCE_RESOLVE_CONSEQUENCES}
                />
              </div>
              <button
                type="button"
                onClick={forceResolve}
                className="block w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
              >
                Force resolve
              </button>
            </>
          )}
          {isTerminal && (
            <span className="block px-3 py-1.5 text-xs text-neutral-600 italic">
              terminal — annotate only
            </span>
          )}
        </div>
      )}
    </div>
  );
}
