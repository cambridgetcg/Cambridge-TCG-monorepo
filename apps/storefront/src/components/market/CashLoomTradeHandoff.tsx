"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Consequences, WhyLink } from "@/lib/ui";
import type { CashloomKarmaDecision } from "@/lib/cashloom/karma";

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
  karma: CashloomKarmaDecision;
}

type PreparationUnavailableReason =
  | "buyer_only"
  | "self_trade"
  | "handoff_required"
  | "trade_not_awaiting_payment"
  | "payment_window_expired"
  | "preparation_already_recorded"
  | "writes_disabled";

interface CashLoomPreparationReceipt {
  schema: "cambridgetcg.cashloom-payment-preparation/v1";
  preparation_id: string;
  handoff_id: string;
  terms_hash: string;
  state: "prepared";
  actor_role: "buyer";
  authority: "cambridge_database_session";
  disclosure_notice_version: "cashloom-preparation-retention-v1";
  created_at: string;
  effects: {
    moves_money: false;
    selects_settlement_rail: false;
    changes_trade_state: false;
    unlocks_shipping: false;
    changes_payout: false;
  };
  nonclaims: {
    is_cashloom_v2_record: false;
    is_payment_or_acceptance: false;
    proves_cashloom_key_control: false;
    creates_escrow: false;
    observes_settlement: false;
  };
}

interface PreparationView {
  preparation: CashLoomPreparationReceipt | null;
  role: "buyer" | "seller";
  mode: "disabled" | "record_only";
  can_record_preparation: boolean;
  unavailable_reason?: PreparationUnavailableReason;
  reused?: boolean;
}

interface PreparationResult {
  handoffId: string;
  view: PreparationView | null;
  error: string | null;
}

function KarmaDecisionPreview({ decision }: { decision: CashloomKarmaDecision }) {
  return (
    <div className="rounded-lg border border-info/30 bg-info/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
            KARMA defence · your local view
          </p>
          <WhyLink
            href="/methodology/karma-loop"
            tooltip="Why this proposed response cannot affect the live trade in observe-only mode"
          />
        </div>
        <span className="font-mono text-[10px] text-info">observe-only</span>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        {decision.state === "evaluated" ? (
          <>
            Policy proposed <strong className="font-mono text-warning">{decision.proposed_response}</strong>{" "}
            from {decision.evidence_count} current local observation{decision.evidence_count === 1 ? "" : "s"};{" "}
          </>
        ) : (
          <>
            Evidence state is <strong className="font-mono text-warning">{decision.state}</strong>;
            the conservative proposal is <strong className="font-mono text-warning">{decision.proposed_response}</strong>.{" "}
          </>
        )}
        Effective response is <strong className="font-mono text-ok">observe</strong>.
        It cannot block this handoff, move money, change escrow, or reveal the other participant&rsquo;s evidence.
      </p>
    </div>
  );
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
  // A dynamic-route navigation may reuse this component instance. Key the
  // stateful implementation so no trade-local view can cross that boundary.
  return <CashLoomTradeHandoffForTrade key={tradeId} tradeId={tradeId} />;
}

function CashLoomTradeHandoffForTrade({ tradeId }: { tradeId: string }) {
  const [view, setView] = useState<HandoffView | null>(null);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [preparationResult, setPreparationResult] = useState<PreparationResult | null>(null);
  const [preparationSubmitting, setPreparationSubmitting] = useState(false);
  const preparationRetry = useRef<{ scope: string; key: string } | null>(null);

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

  const handoffId = view?.handoff?.handoff_id ?? null;
  useEffect(() => {
    if (!handoffId) {
      return;
    }
    let active = true;
    fetch(`/api/market/trades/${tradeId}/cashloom/preparation`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readError(response, "Could not load the preparation receipt."));
        }
        return response.json();
      })
      .then((body: PreparationView) => {
        if (active) setPreparationResult({ handoffId, view: body, error: null });
      })
      .catch((reason: unknown) => {
        if (active) {
          setPreparationResult({
            handoffId,
            view: null,
            error: reason instanceof Error
              ? reason.message
              : "Could not load the preparation receipt.",
          });
        }
      });
    return () => { active = false; };
  }, [tradeId, handoffId]);

  const currentPreparation = preparationResult?.handoffId === handoffId
    ? preparationResult
    : null;
  const preparationView = currentPreparation?.view ?? null;
  const preparationError = currentPreparation?.error ?? null;
  const preparationLoading = handoffId !== null && currentPreparation === null;

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

  async function recordPreparation(handoff: CashLoomHandoff) {
    setPreparationSubmitting(true);
    setPreparationResult((current) => current?.handoffId === handoff.handoff_id
      ? { ...current, error: null }
      : current);
    try {
      // Keep one retry key for this exact trade/handoff/terms scope. A lost
      // response can replay the operation, while a changed scope cannot reuse it.
      const retryScope = `${tradeId}:${handoff.handoff_id}:${handoff.terms_hash}`;
      if (preparationRetry.current?.scope !== retryScope) {
        preparationRetry.current = {
          scope: retryScope,
          key: crypto.randomUUID().toLowerCase(),
        };
      }
      const response = await fetch(`/api/market/trades/${tradeId}/cashloom/preparation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record_preparation",
          handoff_id: handoff.handoff_id,
          terms_hash: handoff.terms_hash,
          expected_trade_state: "awaiting_payment",
          expected_preparation_state: "none",
          disclosure_notice_version: "cashloom-preparation-retention-v1",
          idempotency_key: preparationRetry.current.key,
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Could not record preparation."));
      }
      setPreparationResult({
        handoffId: handoff.handoff_id,
        view: await response.json(),
        error: null,
      });
    } catch (reason: unknown) {
      setPreparationResult((current) => ({
        handoffId: handoff.handoff_id,
        view: current?.handoffId === handoff.handoff_id ? current.view : null,
        error: reason instanceof Error ? reason.message : "Could not record preparation.",
      }));
    } finally {
      setPreparationSubmitting(false);
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

        <div className="mt-4">
          <KarmaDecisionPreview decision={view.karma} />
        </div>

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

      <KarmaDecisionPreview decision={view.karma} />

      <div className="rounded-lg border border-border-subtle bg-page p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
              Buyer preparation receipt
            </p>
            <WhyLink
              href="/methodology/cashloom-settlement"
              tooltip="Why this Cambridge-account receipt is not a payment or CashLoom-key signature"
            />
          </div>
          {preparationView?.preparation && (
            <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-warning">
              Prepared locally · no payment
            </span>
          )}
        </div>

        {preparationLoading ? (
          <p className="mt-2 text-xs text-ink-muted">Loading the participant-only receipt…</p>
        ) : preparationView?.preparation ? (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-ink-muted">
              The buyer&rsquo;s Cambridge database session recorded preparation for this exact
              handoff {new Date(preparationView.preparation.created_at).toLocaleString("en-GB")}.
              This is host-local account evidence, not a CashLoom payer signature.
            </p>
            <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-2 text-xs">
              <dt className="text-ink-faint">Receipt ID</dt>
              <dd
                className="break-all font-mono text-ink"
                title={preparationView.preparation.preparation_id}
              >
                {shortHash(preparationView.preparation.preparation_id)}
              </dd>
              <dt className="text-ink-faint">Authority</dt>
              <dd className="font-mono text-ink">Cambridge account session</dd>
            </dl>
            <Consequences
              items={[
                { label: "Money / rail", delta: "none sent or selected", tone: "emerald" },
                { label: "Escrow / settlement", delta: "not created or observed", tone: "emerald" },
                { label: "Shipping / payout", delta: "unchanged", tone: "emerald" },
              ]}
            />
          </div>
        ) : preparationView?.role === "buyer" && preparationView.can_record_preparation ? (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-ink-muted">
              Record that your signed-in Cambridge account prepared this exact packet. It does
              not prove CashLoom key control and is not acceptance or payment. Both trade
              participants can read the retained, identity-linked receipt. Its production
              retention and erasure policy is still under review.
            </p>
            <Consequences
              items={[
                { label: "Account evidence", delta: "one immutable receipt", tone: "amber" },
                { label: "Visibility", delta: "buyer + seller", tone: "amber" },
                { label: "Money / rail", delta: "none sent or selected", tone: "emerald" },
                { label: "Trade / payout", delta: "unchanged", tone: "emerald" },
              ]}
            />
            <button
              type="button"
              onClick={() => recordPreparation(handoff)}
              disabled={preparationSubmitting}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-page transition hover:opacity-90 disabled:opacity-50"
            >
              {preparationSubmitting ? "Recording…" : "Record account preparation"}
            </button>
          </div>
        ) : preparationView?.role === "seller" ? (
          <p className="mt-2 text-xs text-ink-muted">
            The buyer has not recorded account-local preparation. Absence is not refusal, and a
            future receipt would still not be payment or acceptance.
          </p>
        ) : preparationView?.unavailable_reason === "writes_disabled" ? (
          <p className="mt-2 text-xs text-ink-muted">
            This deployment is read-only for new preparation receipts. Existing receipts remain visible.
          </p>
        ) : (
          <p className="mt-2 text-xs text-ink-muted">
            No preparation receipt can be recorded in the trade&rsquo;s current state.
          </p>
        )}

        {preparationError && (
          <p role="alert" className="mt-3 text-xs text-warning">
            {preparationError} The terms packet above remains usable and unchanged.
          </p>
        )}
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
