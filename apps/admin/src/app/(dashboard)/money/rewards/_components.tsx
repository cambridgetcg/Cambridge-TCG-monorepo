"use client";

/**
 * Client-side action triggers for /money/rewards.
 *
 * Two flavours:
 *   - PrizeActions      (per-row): Ship | Mark fulfilled (state-aware)
 *   - BulkClusterActions (per-cluster): Ship all together
 *
 * Both prompt for tracking + carrier + reason and dispatch to server actions.
 */

import { useTransition, useState } from "react";
import {
  shipPrize,
  bulkShipCluster,
  markFulfilled,
} from "./_actions";

const CARRIER_OPTIONS = [
  "Royal Mail",
  "Evri",
  "DPD",
  "ParcelForce",
  "UPS",
  "FedEx",
];

type PrizeKind = "raffle" | "mystery_box" | "pack";

interface PrizeActionsProps {
  prize: {
    kind: PrizeKind;
    id: string;
    label: string;
    state: "ready" | "shipped";
  };
}

export function PrizeActions({ prize }: PrizeActionsProps) {
  const [pending, startTransition] = useTransition();

  function ship() {
    const carrier = window.prompt(
      `Carrier for "${prize.label}" (optional):\n${CARRIER_OPTIONS.join(" · ")}`,
      "",
    );
    if (carrier === null) return;
    const tracking = window.prompt("Tracking number (optional):", "");
    if (tracking === null) return;
    const reason =
      window.prompt(
        "Note for the audit log (optional, defaults set):",
        `Shipped via ${carrier || "—"}${tracking ? ` (${tracking})` : ""}`,
      ) || "Prize shipped";

    startTransition(async () => {
      const result = await shipPrize({
        kind: prize.kind,
        id: prize.id,
        tracking: tracking || undefined,
        carrier: carrier || undefined,
        reason,
      });
      if (!result.ok) window.alert(result.error);
    });
  }

  function fulfill() {
    if (
      !window.confirm(
        `Mark "${prize.label}" as fully fulfilled? This is the final step.`,
      )
    )
      return;
    const reason =
      window.prompt("Note for the audit log:", "Customer confirmed receipt") ||
      "Prize fulfilled";

    startTransition(async () => {
      const result = await markFulfilled({
        kind: prize.kind,
        id: prize.id,
        reason,
      });
      if (!result.ok) window.alert(result.error);
    });
  }

  if (prize.state === "ready") {
    return (
      <button
        type="button"
        onClick={ship}
        disabled={pending}
        className="text-xs px-2 py-1 bg-amber-500 text-black font-bold rounded hover:bg-amber-400 disabled:opacity-50"
      >
        {pending ? "…" : "Ship"}
      </button>
    );
  }
  // shipped → awaiting confirm
  return (
    <button
      type="button"
      onClick={fulfill}
      disabled={pending}
      className="text-xs px-2 py-1 bg-emerald-500 text-black font-bold rounded hover:bg-emerald-400 disabled:opacity-50"
    >
      {pending ? "…" : "Mark fulfilled"}
    </button>
  );
}

interface BulkClusterActionsProps {
  cluster: { kind: PrizeKind; id: string; label: string }[];
  userLabel: string;
}

export function BulkClusterActions({
  cluster,
  userLabel,
}: BulkClusterActionsProps) {
  const [pending, startTransition] = useTransition();

  function bulkShip() {
    const carrier = window.prompt(
      `Carrier for ${cluster.length} prizes to ${userLabel}:\n${CARRIER_OPTIONS.join(" · ")}`,
      "",
    );
    if (carrier === null) return;
    const tracking = window.prompt(
      `Single tracking number for all ${cluster.length} prizes (optional):`,
      "",
    );
    if (tracking === null) return;
    const reason =
      window.prompt(
        "Note for the audit log:",
        `Bulk-shipped ${cluster.length} prizes via ${carrier || "—"}`,
      ) || `Bulk shipped ${cluster.length} prizes`;

    startTransition(async () => {
      const result = await bulkShipCluster({
        prizes: cluster.map((p) => ({ kind: p.kind, id: p.id })),
        tracking: tracking || undefined,
        carrier: carrier || undefined,
        reason,
      });
      if (!result.ok) window.alert(result.error);
    });
  }

  return (
    <button
      type="button"
      onClick={bulkShip}
      disabled={pending}
      className="text-xs px-3 py-1.5 bg-amber-500 text-black font-bold rounded hover:bg-amber-400 disabled:opacity-50"
    >
      {pending ? "…" : `Ship all ${cluster.length} together`}
    </button>
  );
}
