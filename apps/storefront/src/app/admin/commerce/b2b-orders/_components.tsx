"use client";

/**
 * Client components for the B2B order detail page.
 *
 * <TransitionButtons> renders the legal-next-state buttons given the
 * current status. Cancel + refund prompt for a reason.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markAllocated,
  markShipped,
  markDelivered,
  cancelOrder,
  refundOrder,
} from "./_actions";

type B2BStatus =
  | "paid"
  | "allocated"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

interface Props {
  id: number;
  status: B2BStatus;
}

function TransitionButton({
  label,
  tone,
  pending,
  onClick,
}: {
  label: string;
  tone: "amber" | "emerald" | "red" | "neutral";
  pending: boolean;
  onClick: () => void;
}) {
  const toneCls: Record<string, string> = {
    amber: "bg-accent text-neutral-950 hover:bg-accent-strong",
    emerald: "bg-emerald-500 text-neutral-950 hover:bg-emerald-400",
    red: "bg-danger/80 text-ink hover:bg-danger",
    neutral: "border border-border-strong text-ink-muted hover:border-accent",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={`rounded px-4 py-2 text-sm font-semibold disabled:opacity-50 ${toneCls[tone]}`}
    >
      {pending ? "Working…" : label}
    </button>
  );
}

export function TransitionButtons({ id, status }: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        alert(r.error ?? "Action failed");
        return;
      }
      router.refresh();
    });
  };

  const buttons: React.ReactNode[] = [];

  if (status === "paid") {
    buttons.push(
      <TransitionButton
        key="allocate"
        label="Mark allocated"
        tone="amber"
        pending={pending}
        onClick={() => run(() => markAllocated({ id }))}
      />,
    );
  }
  if (status === "allocated") {
    buttons.push(
      <TransitionButton
        key="ship"
        label="Mark shipped"
        tone="amber"
        pending={pending}
        onClick={() => run(() => markShipped({ id }))}
      />,
    );
  }
  if (status === "shipped") {
    buttons.push(
      <TransitionButton
        key="deliver"
        label="Mark delivered"
        tone="emerald"
        pending={pending}
        onClick={() => run(() => markDelivered({ id }))}
      />,
    );
  }

  if (status === "paid" || status === "allocated") {
    buttons.push(
      <TransitionButton
        key="cancel"
        label="Cancel"
        tone="neutral"
        pending={pending}
        onClick={() => {
          const reason = window.prompt("Reason for cancellation?");
          if (!reason?.trim()) return;
          run(() => cancelOrder({ id, reason }));
        }}
      />,
    );
  }

  if (status === "paid" || status === "allocated" || status === "shipped" || status === "delivered") {
    buttons.push(
      <TransitionButton
        key="refund"
        label="Refund"
        tone="red"
        pending={pending}
        onClick={() => {
          const reason = window.prompt("Reason for refund? (this records to admin_actions_log; Stripe refund is a separate manual step)");
          if (!reason?.trim()) return;
          run(() => refundOrder({ id, reason }));
        }}
      />,
    );
  }

  if (buttons.length === 0) {
    return (
      <div className="text-sm text-ink-faint">
        No transitions available — this order is in a terminal state.
      </div>
    );
  }

  return <div className="flex flex-wrap gap-2">{buttons}</div>;
}
