"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Consequences, WhyLink } from "@/lib/ui";

type UnavailableReason =
  | "seller_only"
  | "handoff_already_prepared"
  | "trade_not_awaiting_payment"
  | "payment_window_expired"
  | "cashloom_profile_required"
  | "cashloom_profile_disabled";

interface CashLoomPacket {
  schema: "cambridgetcg.cashloom-handoff/v1";
  handoff_mode: "offline_bundle";
  merchant_key_id: string;
  identity_assurance: "user-declared-key-pin";
  binding: {
    nonce_hex: string;
    participant_references: { buyer: string; seller: string };
    terms_hash: string;
    expected_purpose_note: string;
  };
  terms: {
    currency: "GBP";
    asset_id: "fiat:iso4217/GBP";
    economics: {
      unit_price_pence: string;
      quantity: number;
      gross_amount_pence: string;
      commission_amount_pence: string;
      seller_payout_pence: string;
    };
    item: { sku: string; card_name: string | null; condition: string };
    escrow: {
      tier: string | null;
      requires_photos: boolean;
      requires_inspection: boolean;
      dispute_window_hours: number | null;
      payout_hold_days: number | null;
    };
    logistics: {
      seller_ships_to: string | null;
      accepts_returns: boolean;
      return_window_days: number | null;
      shipping_address_included: false;
    };
    payment_window_expires_at: string | null;
  };
  effects: { moves_money: false; changes_trade_state: false };
  nonclaims: Record<string, false>;
}

interface CashLoomHandoff {
  packet: CashLoomPacket;
  canonical_json: string;
  handoff_id: string;
  terms_hash: string;
  expected_purpose_note: string;
  created_at: string;
  effects: { moves_money: false; changes_trade_state: false };
  nonclaims: Record<string, false>;
}

interface HandoffView {
  handoff: CashLoomHandoff | null;
  role: "buyer" | "seller";
  can_prepare: boolean;
  unavailable_reason?: UnavailableReason;
  reused?: boolean;
}

function poundsFromPence(value: string): string {
  try {
    const pence = BigInt(value);
    const hundred = BigInt(100);
    const whole = pence / hundred;
    const fraction = (pence % hundred).toString().padStart(2, "0");
    return `£${whole}.${fraction}`;
  } catch {
    return "—";
  }
}

function shortHash(value: string): string {
  if (value.length <= 28) return value;
  return `${value.slice(0, 18)}…${value.slice(-8)}`;
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.error === "string") return body.error;
    return typeof body?.error?.message === "string" ? body.error.message : fallback;
  } catch {
    return fallback;
  }
}

export function CashLoomTradeHandoff({ tradeId }: { tradeId: string }) {
  const [view, setView] = useState<HandoffView | null>(null);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/market/trades/${tradeId}/cashloom`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response, "Could not load the CashLoom handoff."));
        return response.json();
      })
      .then((body: HandoffView) => { if (active) setView(body); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load the CashLoom handoff.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tradeId]);

  async function prepare() {
    setPreparing(true);
    setError(null);
    try {
      const response = await fetch(`/api/market/trades/${tradeId}/cashloom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare" }),
      });
      if (!response.ok) throw new Error(await readError(response, "Could not prepare the handoff."));
      setView(await response.json());
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not prepare the handoff.");
    } finally {
      setPreparing(false);
    }
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("Clipboard access was refused. Select and copy the value manually.");
    }
  }

  function downloadPacket(handoff: CashLoomHandoff) {
    const blob = new Blob([handoff.canonical_json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cambridgetcg-cashloom-${handoff.handoff_id.slice(7, 19)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  if (loading) {
    return <div className="h-24 animate-pulse rounded-lg bg-surface-subtle" aria-label="Loading CashLoom handoff" />;
  }

  if (!view && error) {
    return (
      <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
        <p className="text-sm text-ink-muted">{error}</p>
      </div>
    );
  }

  if (!view) return null;

  const handoff = view.handoff;
  if (!handoff && view.unavailable_reason === "trade_not_awaiting_payment") return null;

  if (!handoff) {
    const needsProfile = view.unavailable_reason === "cashloom_profile_required";
    const profileDisabled = view.unavailable_reason === "cashloom_profile_disabled";
    return (
      <section className="rounded-lg border border-border-subtle bg-surface p-5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink">CashLoom terms handoff</h2>
          <WhyLink href="/methodology/cashloom-settlement" tooltip="Why this packet cannot move money or change the trade" />
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          {view.role === "buyer"
            ? "The seller has not prepared a CashLoom terms packet for this trade. Stripe remains the only live payment path."
            : "Freeze this trade’s exact GBP and fulfilment terms into one immutable, participant-only packet."}
        </p>

        {view.role === "seller" && (needsProfile || profileDisabled) && (
          <Link href="/account/cashloom" className="mt-3 inline-block text-sm font-semibold text-accent hover:underline">
            {needsProfile ? "Declare an optional CashLoom key →" : "Enable terms-only handoffs →"}
          </Link>
        )}

        {view.can_prepare && (
          <div className="mt-4 space-y-3">
            <Consequences
              items={[
                { label: "Money", delta: "none moves", tone: "emerald" },
                { label: "Trade state", delta: "unchanged", tone: "emerald" },
                { label: "Packet", delta: "created once; later key edits cannot rewrite it", tone: "amber" },
              ]}
            />
            <button
              type="button"
              onClick={prepare}
              disabled={preparing}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-page transition hover:opacity-90 disabled:opacity-50"
            >
              {preparing ? "Preparing…" : "Prepare terms packet"}
            </button>
          </div>
        )}
        {view.unavailable_reason === "payment_window_expired" && (
          <p className="mt-3 text-xs text-warning">The payment window has expired, so no new packet can be prepared.</p>
        )}
        {error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}
      </section>
    );
  }

  const economics = handoff.packet.terms.economics;

  return (
    <section className="rounded-lg border border-accent/25 bg-surface p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink">CashLoom terms handoff</h2>
            <WhyLink href="/methodology/cashloom-settlement" tooltip="What this packet proves and what a live settlement still needs" />
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            Immutable participant copy prepared {new Date(handoff.created_at).toLocaleString("en-GB")}.
          </p>
        </div>
        <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-warning">
          Terms only · no payment
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-surface-subtle p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Buyer total</p>
          <p className="mt-1 font-mono text-sm text-ink">{poundsFromPence(economics.gross_amount_pence)}</p>
        </div>
        <div className="rounded-lg bg-surface-subtle p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Commission</p>
          <p className="mt-1 font-mono text-sm text-ink">{poundsFromPence(economics.commission_amount_pence)}</p>
        </div>
        <div className="rounded-lg bg-surface-subtle p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Seller payout</p>
          <p className="mt-1 font-mono text-sm text-ink">{poundsFromPence(economics.seller_payout_pence)}</p>
        </div>
      </div>

      <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-2 text-xs">
        <dt className="text-ink-faint">Declared merchant key</dt>
        <dd className="break-all font-mono text-ink" title={handoff.packet.merchant_key_id}>
          {shortHash(handoff.packet.merchant_key_id)}
        </dd>
        <dt className="text-ink-faint">Terms hash</dt>
        <dd className="break-all font-mono text-ink" title={handoff.terms_hash}>{shortHash(handoff.terms_hash)}</dd>
        <dt className="text-ink-faint">Packet ID</dt>
        <dd className="break-all font-mono text-ink" title={handoff.handoff_id}>{shortHash(handoff.handoff_id)}</dd>
      </dl>

      <div className="rounded-lg border border-border-subtle bg-page p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Expected public CashLoom purpose note</p>
        <code className="mt-1 block break-all text-xs text-ink">{handoff.expected_purpose_note}</code>
        <p className="mt-2 text-xs text-ink-muted">
          This salted note exposes no Cambridge trade or user ID. It binds a future signed request
          to these terms, but Cambridge has not received or verified such a request.
        </p>
      </div>

      <Consequences
        items={[
          { label: "Money", delta: "none moved", tone: "emerald" },
          { label: "Payment / shipping", delta: "not unlocked", tone: "amber" },
          { label: "Identity", delta: "declared fingerprint; key control not proven", tone: "amber" },
        ]}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => copy("note", handoff.expected_purpose_note)}
          className="rounded-lg border border-border-strong px-3 py-2 text-xs font-semibold text-ink hover:bg-surface-subtle"
        >
          {copied === "note" ? "Copied" : "Copy purpose note"}
        </button>
        <button
          type="button"
          onClick={() => copy("packet", handoff.canonical_json)}
          className="rounded-lg border border-border-strong px-3 py-2 text-xs font-semibold text-ink hover:bg-surface-subtle"
        >
          {copied === "packet" ? "Copied" : "Copy packet JSON"}
        </button>
        <button
          type="button"
          onClick={() => downloadPacket(handoff)}
          className="rounded-lg border border-border-strong px-3 py-2 text-xs font-semibold text-ink hover:bg-surface-subtle"
        >
          Download packet
        </button>
      </div>

      <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-ink-muted">
        <strong className="text-warning">Export privacy:</strong> copying or downloading leaves
        Cambridge&rsquo;s participant-only API boundary. The bearer copy contains the stable
        merchant fingerprint and detailed item, GBP, and fulfilment terms. Anyone you share it
        with can retain it and may correlate it with other uses of that fingerprint.
      </p>

      <p className="text-xs text-warning">
        Do not treat this packet as payment for the live trade. It is unsigned, contains no BTC
        amount, and cannot make Cambridge recognise a payment. Use the existing payment prompt
        unless this trade is later migrated through a dedicated settlement-rail release.
      </p>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </section>
  );
}
