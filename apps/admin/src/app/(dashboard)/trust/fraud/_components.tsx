"use client";

/**
 * Client-side action triggers for /trust/fraud.
 *
 * Each row gets a dropdown with: resolve, dismiss, escalate (severity
 * bump), suspend user. All four prompt for a reason and feed straight
 * into adminAction-wrapped server actions. Suspended users + already-
 * resolved signals collapse the menu accordingly.
 */

import { useState, useTransition } from "react";
import {
  resolveFraudSignal,
  dismissFraudSignal,
  escalateFraudSignal,
  suspendUser,
} from "./_actions";

interface FraudActionsProps {
  signal: {
    id: string;
    user_id: string;
    severity: string;
    resolved: boolean;
    is_suspended: boolean;
  };
}

export function FraudActions({ signal }: FraudActionsProps) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  if (signal.resolved) {
    return <span className="text-xs text-neutral-600">resolved</span>;
  }

  function run<T extends { ok: boolean; error?: string }>(
    label: string,
    fn: () => Promise<T>,
  ) {
    setOpen(false);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok && "error" in result) {
        window.alert(result.error ?? `${label} failed`);
      }
    });
  }

  function resolve() {
    const reason = window.prompt("Reason for resolving this signal?");
    if (!reason) return;
    run("Resolve", () => resolveFraudSignal({ id: signal.id, reason }));
  }

  function dismiss() {
    const reason = window.prompt("Reason for dismissing? (false positive, duplicate, etc.)");
    if (!reason) return;
    run("Dismiss", () => dismissFraudSignal({ id: signal.id, reason }));
  }

  function escalate() {
    const reason = window.prompt(
      `Reason for escalating severity above ${signal.severity}?`,
    );
    if (!reason) return;
    run("Escalate", () => escalateFraudSignal({ id: signal.id, reason }));
  }

  function suspend() {
    if (signal.is_suspended) {
      window.alert("User is already suspended.");
      return;
    }
    const reason = window.prompt(
      "Reason for suspending this user?\n(Sets trust_profiles.is_suspended=true. Trust score recomputes on next sweep.)",
    );
    if (!reason) return;
    run("Suspend user", () =>
      suspendUser({ user_id: signal.user_id, reason, signal_id: signal.id }),
    );
  }

  const canEscalate = signal.severity !== "critical";

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
            onClick={resolve}
            className="block w-full text-left px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10"
          >
            Resolve
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="block w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Dismiss (false positive)
          </button>
          {canEscalate && (
            <button
              type="button"
              onClick={escalate}
              className="block w-full text-left px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10"
            >
              Escalate severity
            </button>
          )}
          <div className="border-t border-neutral-800 my-1" />
          <button
            type="button"
            onClick={suspend}
            disabled={signal.is_suspended}
            className="block w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50 disabled:hover:bg-transparent"
          >
            {signal.is_suspended ? "Already suspended" : "Suspend user"}
          </button>
        </div>
      )}
    </div>
  );
}
