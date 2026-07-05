"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DISPUTE_REASONS } from "@/lib/trust/types";
import type { TradeDispute, DisputeMessage, DisputeEvidence } from "@/lib/trust/types";
import type { EscrowTier } from "@/lib/escrow/service-tiers";
import { TIMELINE_STEPS, getActiveStep } from "@/lib/escrow/timeline";
import { DISPUTE_TIMELINE, getDisputeStep, isDisputeTerminal } from "@/lib/trust/dispute-timeline";
import { buildTrackingUrl } from "@/lib/shipping/carriers";

import { Audience, Consequences, MessageButton, WhyLink } from "@/lib/ui";
// ── Escrow tier display ──

interface EscrowRoutingData {
  routing: {
    tier: EscrowTier;
    label: string;
    description: string;
    estimatedDays: string;
  };
  summary: string[];
}

const TIER_BADGE: Record<EscrowTier, { bg: string; text: string; border: string; label: string }> = {
  direct: {
    bg: "bg-ok/15",
    text: "text-ok",
    border: "border-ok/30",
    label: "Seller ships to you directly",
  },
  verified: {
    bg: "bg-info/15",
    text: "text-info",
    border: "border-info/30",
    label: "Photo-verified, seller ships to you",
  },
  full_escrow: {
    bg: "bg-warning/15",
    text: "text-warning",
    border: "border-warning/30",
    label: "Ships through Cambridge TCG",
  },
};

function EscrowTimeline({ tier, escrowStatus }: { tier: EscrowTier; escrowStatus?: string }) {
  const steps = TIMELINE_STEPS[tier];
  const activeIdx = getActiveStep(tier, escrowStatus);
  const style = TIER_BADGE[tier];

  return (
    <div className="flex items-center gap-0 overflow-x-auto py-2">
      <Audience kind="consumer" />
      {steps.map((step, i) => {
        const isDone = i < activeIdx;
        const isCurrent = i === activeIdx;
        const lineColor = isDone ? "bg-ok/40" : "bg-border-subtle";
        const textColor = isDone ? "text-ok" : isCurrent ? style.text : "text-ink-faint";

        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center min-w-[80px]">
              <div
                className={`w-3 h-3 rounded-full ${
                  isDone ? "bg-ok" : isCurrent ? "bg-ink" : "bg-surface-subtle border border-border-subtle"
                }`}
              />
              <span className={`text-[10px] mt-1.5 text-center leading-tight ${textColor}`}>
                {step}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 w-6 shrink-0 ${lineColor} -mt-4`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Dispute timeline — opened → under review → awaiting evidence → resolved.
// Shared with admin via @/lib/trust/dispute-timeline so both roles read
// from the same per-status → step-index table.
function DisputeTimeline({ dispute }: { dispute: TradeDispute }) {
  const activeIdx = getDisputeStep(dispute.status);
  const terminal = isDisputeTerminal(dispute.status);
  const anyResolvedStatus = ["resolved_buyer", "resolved_seller", "resolved_split"].includes(dispute.status);

  return (
    <div className="flex items-center gap-0 overflow-x-auto py-2">
      {DISPUTE_TIMELINE.map((step, i) => {
        // A step is "done" if the matching timestamp is set OR this is
        // the "resolved" terminal step and status indicates resolution.
        const ts = dispute[step.tsField] as string | null | undefined;
        let done: boolean;
        if (step.key === "resolved") {
          done = anyResolvedStatus && !!dispute.resolved_at;
        } else {
          done = !!ts || i < activeIdx;
        }
        const isCurrent = !terminal && i === activeIdx;

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center min-w-[88px]">
              <div
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                  done
                    ? "bg-ok text-page"
                    : isCurrent
                      ? "bg-ink text-page"
                      : "bg-surface-subtle text-ink-faint"
                }`}
              >
                {done ? "✓" : i + 1}
              </div>
              <span className={`text-[10px] mt-1.5 text-center leading-tight ${
                done ? "text-ok" : isCurrent ? "text-ink" : "text-ink-faint"
              }`}>
                {step.label}
              </span>
              {ts && done && (
                <span className="text-[9px] text-ink-faint font-mono whitespace-nowrap mt-0.5">
                  {new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
              )}
            </div>
            {i < DISPUTE_TIMELINE.length - 1 && (
              <div className={`h-0.5 w-6 shrink-0 -mt-6 ${done ? "bg-ok/50" : "bg-surface-subtle"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function EscrowBadgeSection({ tradeId, escrowStatus }: { tradeId: string; escrowStatus?: string }) {
  const [data, setData] = useState<EscrowRoutingData | null>(null);

  useEffect(() => {
    fetch(`/api/escrow/routing?tradeId=${tradeId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch(() => {});
  }, [tradeId]);

  if (!data) return null;

  const badge = TIER_BADGE[data.routing.tier];

  return (
    <div className={`rounded-lg border ${badge.border} ${badge.bg} p-4 space-y-3`}>
      <div className="flex items-center gap-3">
        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold border ${badge.border} ${badge.text}`}>
          {data.routing.label}
        </span>
        <span className="text-sm text-ink-muted">{badge.label}</span>
        <span className="ml-auto text-xs text-ink-faint">{data.routing.estimatedDays}</span>
      </div>

      <EscrowTimeline tier={data.routing.tier} escrowStatus={escrowStatus} />

      <ul className="space-y-1 pt-1 border-t border-border-subtle">
        {data.summary.map((point, i) => (
          <li key={i} className="text-xs text-ink-muted flex items-start gap-1.5">
            <span className={`mt-0.5 ${badge.text}`}>&bull;</span>
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Stripe shipping_details (persisted to market_trades.shipping_address by
// the pay webhook) → printable address lines. Tolerates a JSON-string column
// or an already-parsed object; returns [] when absent or malformed.
function addressLines(raw: unknown): string[] {
  let parsed: any = raw;
  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw); } catch { return []; }
  }
  if (!parsed || typeof parsed !== "object") return [];
  const addr = parsed.address || parsed;
  return [
    parsed.name,
    addr.line1,
    addr.line2,
    [addr.postal_code, addr.city].filter(Boolean).join(" "),
    addr.state,
    addr.country,
  ].filter((l: unknown): l is string => typeof l === "string" && l.length > 0);
}

export default function TradeDetailPage() {
  const params = useParams();
  const tradeId = params.id as string;

  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [trade, setTrade] = useState<any>(null);
  const [dispute, setDispute] = useState<TradeDispute | null>(null);
  const [messages, setMessages] = useState<DisputeMessage[]>([]);
  const [evidence, setEvidence] = useState<DisputeEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Dispute form
  const [reason, setReason] = useState<string>(DISPUTE_REASONS[0].value);
  const [description, setDescription] = useState("");
  const [submittingDispute, setSubmittingDispute] = useState(false);
  const [disputeError, setDisputeError] = useState("");

  // Message form
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  // Evidence upload
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [evidenceLabel, setEvidenceLabel] = useState("");
  const [evidenceError, setEvidenceError] = useState("");

  // Withdraw
  const [withdrawing, setWithdrawing] = useState(false);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);

  // Mark-shipped form (seller, while awaiting_shipment / admin-marked paid)
  const [shipCarrier, setShipCarrier] = useState("");
  const [shipTracking, setShipTracking] = useState("");
  const [markingShipped, setMarkingShipped] = useState(false);
  const [shipError, setShipError] = useState("");

  // Pay-now (buyer, while awaiting_payment)
  const [payingNow, setPayingNow] = useState(false);
  const [payError, setPayError] = useState("");

  // Confirm-received (buyer, once the card has shipped)
  const [confirmingReceipt, setConfirmingReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState("");

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        setLoggedIn(!!data?.user?.email);
        if (data?.user?.id) setSessionUserId(data.user.id);
      })
      .catch(() => setLoggedIn(false));
  }, []);

  useEffect(() => {
    if (loggedIn === null) return;
    if (loggedIn === false) {
      setLoading(false);
      return;
    }

    async function fetchData() {
      try {
        // Try to fetch trade data
        const tradeRes = await fetch(`/api/market/trades/${tradeId}`);
        if (tradeRes.ok) {
          const tradeData = await tradeRes.json();
          setTrade(tradeData.trade || tradeData);
        }

        // Fetch dispute for this trade
        const disputeRes = await fetch(`/api/trust/disputes?trade_id=${tradeId}`);
        if (disputeRes.ok) {
          const disputeData = await disputeRes.json();
          const d = disputeData.dispute || disputeData.disputes?.[0] || null;
          setDispute(d);

          // If dispute exists, fetch messages + evidence in parallel
          if (d) {
            const [msgRes, evRes] = await Promise.all([
              fetch(`/api/trust/disputes/${d.id}/messages`),
              fetch(`/api/trust/disputes/${d.id}/evidence`),
            ]);
            if (msgRes.ok) {
              const msgData = await msgRes.json();
              setMessages(msgData.messages || []);
            }
            if (evRes.ok) {
              const evData = await evRes.json();
              setEvidence(evData.evidence || []);
            }
          }
        }
      } catch {
        setError("Failed to load trade details.");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [loggedIn, tradeId]);

  async function handleRaiseDispute(e: React.FormEvent) {
    e.preventDefault();
    setDisputeError("");
    setSubmittingDispute(true);

    try {
      const res = await fetch("/api/trust/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeId,
          reason,
          description,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to raise dispute.");
      }

      const data = await res.json();
      setDispute(data.dispute);
      setDescription("");
    } catch (err: any) {
      setDisputeError(err.message);
    } finally {
      setSubmittingDispute(false);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!dispute || !newMessage.trim()) return;

    setSendingMessage(true);
    try {
      const res = await fetch(`/api/trust/disputes/${dispute.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: newMessage.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to send message.");
      }

      const data = await res.json();
      if (data.message) {
        setMessages((prev) => [...prev, data.message]);
      } else {
        // Refresh messages
        const msgRes = await fetch(`/api/trust/disputes/${dispute.id}/messages`);
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          setMessages(msgData.messages || []);
        }
      }
      setNewMessage("");
    } catch {
      // silently fail, message stays in input
    } finally {
      setSendingMessage(false);
    }
  }

  async function handleEvidenceUpload(file: File) {
    if (!dispute) return;
    setUploadingEvidence(true);
    setEvidenceError("");
    try {
      // Phase 1: presigned URL
      const presignRes = await fetch(`/api/trust/disputes/${dispute.id}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type }),
      });
      if (!presignRes.ok) {
        const data = await presignRes.json().catch(() => null);
        throw new Error(data?.error || "Could not prepare upload.");
      }
      const { uploadUrl, imageUrl, s3Key } = await presignRes.json();

      // Phase 2: direct S3 PUT
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload to storage failed.");

      // Phase 3: persist the row
      const persistRes = await fetch(`/api/trust/disputes/${dispute.id}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          s3Key,
          url: imageUrl,
          label: evidenceLabel.trim() || undefined,
        }),
      });
      if (!persistRes.ok) {
        const data = await persistRes.json().catch(() => null);
        throw new Error(data?.error || "Upload saved but record failed.");
      }
      const { evidence: ev } = await persistRes.json();
      setEvidence((prev) => [...prev, ev]);
      setEvidenceLabel("");
    } catch (err) {
      setEvidenceError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingEvidence(false);
    }
  }

  async function handleWithdraw() {
    if (!dispute) return;
    setWithdrawing(true);
    try {
      const res = await fetch(`/api/trust/disputes/${dispute.id}/withdraw`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setDisputeError(data?.error || "Withdrawal failed.");
        return;
      }
      // Refetch the dispute to pick up the closed state + withdrawn_at
      const disputeRes = await fetch(`/api/trust/disputes?trade_id=${tradeId}`);
      if (disputeRes.ok) {
        const data = await disputeRes.json();
        setDispute(data.dispute ?? null);
      }
      setShowWithdrawConfirm(false);
    } finally {
      setWithdrawing(false);
    }
  }

  // Seller confirms dispatch — POSTs the (optional) carrier + tracking number
  // to the participant-gated ship route; the response carries the updated
  // trade row (escrow advances, tracking persisted).
  async function handleMarkShipped(e: React.FormEvent) {
    e.preventDefault();
    if (!shipTracking.trim()) {
      setShipError("Tracking number required.");
      return;
    }
    setMarkingShipped(true);
    setShipError("");
    try {
      const res = await fetch(`/api/market/trades/${tradeId}/ship`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carrier: shipCarrier.trim() || undefined,
          trackingNumber: shipTracking.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setShipError(data?.error || "Failed to mark as shipped.");
        return;
      }
      if (data?.trade) {
        setTrade((prev: any) => ({ ...prev, ...data.trade }));
      }
    } finally {
      setMarkingShipped(false);
    }
  }

  // Buyer starts payment — same flow as the trades list: POST creates a
  // Stripe Checkout session, we follow its URL. (This page previously
  // linked to /account/trades/[id]/pay, which never existed.)
  async function handlePayNow() {
    setPayingNow(true);
    setPayError("");
    try {
      const res = await fetch(`/api/market/trades/${tradeId}/pay`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }
      setPayError(data?.error || "Failed to start payment.");
    } finally {
      setPayingNow(false);
    }
  }

  // Buyer confirms the card arrived — completes the escrow and starts
  // the seller's payout clock. Server-side rules in lib/market/completion.ts.
  async function handleConfirmReceived() {
    setConfirmingReceipt(true);
    setReceiptError("");
    try {
      const res = await fetch(`/api/market/trades/${tradeId}/received`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setReceiptError(data?.error || "Failed to confirm receipt.");
        return;
      }
      if (data?.trade) {
        setTrade((prev: unknown) => ({ ...(prev as object), ...data.trade, auto_complete_at: null }));
      }
    } finally {
      setConfirmingReceipt(false);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const statusColors: Record<string, string> = {
    open: "bg-accent-wash text-accent border-accent/30",
    under_review: "bg-accent-wash text-accent border-accent/30",
    awaiting_evidence: "bg-info/15 text-info border-info/30",
    resolved_buyer: "bg-ok/15 text-ok border-ok/30",
    resolved_seller: "bg-ok/15 text-ok border-ok/30",
    resolved_split: "bg-ok/15 text-ok border-ok/30",
    closed: "bg-ink-faint/15 text-ink-muted border-border-strong",
  };

  const statusLabels: Record<string, string> = {
    open: "Open",
    under_review: "Under Review",
    awaiting_evidence: "Awaiting Evidence",
    resolved_buyer: "Resolved (Buyer)",
    resolved_seller: "Resolved (Seller)",
    resolved_split: "Resolved (Split)",
    closed: "Closed",
  };

  // Viewer's side of the trade. Counterparty identity arrives as usernames
  // + user ids only — emails left the trades payload with the global-free-
  // trade release.
  const viewerIsBuyer = !!trade && !!sessionUserId && trade.buyer_id === sessionUserId;
  const viewerIsSeller = !!trade && !!sessionUserId && trade.seller_id === sessionUserId;
  const counterpartyId = trade ? (viewerIsBuyer ? trade.seller_id : trade.buyer_id) : null;
  const counterpartyUsername = trade
    ? (viewerIsBuyer ? trade.seller_username : trade.buyer_username)
    : null;

  // Mirrors isBuyerConfirmableState in lib/market/completion.ts (a server
  // module this client bundle can't import): shipped_to_buyer in any tier,
  // plus direct-tier 'verified' (the admin-set post-delivery hold state).
  const receiptConfirmable =
    !!trade &&
    (trade.escrow_status === "shipped_to_buyer" ||
      (trade.escrow_status === "verified" && trade.escrow_tier === "direct"));
  // The ship route accepts both: the webhook stamps 'awaiting_shipment',
  // an admin marking payment by hand stamps 'paid'.
  const sellerCanShip =
    viewerIsSeller && ["awaiting_shipment", "paid"].includes(trade?.escrow_status);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-surface-subtle rounded w-48 animate-pulse" />
        <div className="h-64 bg-surface rounded-lg animate-pulse" />
      </div>
    );
  }

  if (loggedIn === false) {
    return (
      <div className="bg-surface rounded-lg p-8 text-center">
        <p className="text-ink-muted mb-3">You need to be signed in to view trade details.</p>
        <a href="/login" className="text-accent hover:underline text-sm font-medium">
          Sign in
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/account/trades" className="text-ink-faint hover:text-ink transition text-sm">
          &larr; Back to Trades
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-ink">Trade #{tradeId.slice(0, 8)}</h1>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4">
          <p className="text-danger text-sm">{error}</p>
        </div>
      )}

      {/* Escrow routing & workflow */}
      <EscrowBadgeSection tradeId={tradeId} escrowStatus={trade?.escrow_status || trade?.status} />

      {/* Trade info */}
      {trade && (
        <div className="bg-surface rounded-lg p-6">
          <h2 className="text-sm font-bold text-ink uppercase tracking-wide mb-3">Trade Details</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {trade.card_name && (
              <>
                <span className="text-ink-faint">Card</span>
                <span className="text-ink">{trade.card_name}</span>
              </>
            )}
            {trade.price && (
              <>
                <span className="text-ink-faint">Price</span>
                <span className="text-ink font-mono">
                  &pound;{Number(trade.price).toFixed(2)}
                </span>
              </>
            )}
            {trade.quantity && (
              <>
                <span className="text-ink-faint">Quantity</span>
                <span className="text-ink">{trade.quantity}</span>
              </>
            )}
            {trade.status && (
              <>
                <span className="text-ink-faint">Status</span>
                <span className="text-ink capitalize">{trade.status}</span>
              </>
            )}
            {(viewerIsBuyer || viewerIsSeller) && counterpartyId && (
              <>
                <span className="text-ink-faint">{viewerIsBuyer ? "Seller" : "Buyer"}</span>
                <span className="text-ink flex items-center gap-2 flex-wrap">
                  <span>{counterpartyUsername || "—"}</span>
                  {/* The logistics channel — traders arrange shipping between
                      themselves over DMs, referenced to this trade. */}
                  <MessageButton
                    otherUserId={counterpartyId}
                    referenceType="market_trade"
                    referenceId={tradeId}
                    label={viewerIsBuyer ? "Message seller" : "Message buyer"}
                    size="sm"
                  />
                </span>
              </>
            )}
            {trade.created_at && (
              <>
                <span className="text-ink-faint">Date</span>
                <span className="text-ink">{formatDate(trade.created_at)}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Escrow payment prompt */}
      {trade?.escrow_status === "awaiting_payment" && (
        (() => {
          const isBuyer = sessionUserId && trade.buyer_id === sessionUserId;
          const isSeller = sessionUserId && trade.seller_id === sessionUserId;
          if (isBuyer) {
            return (
              <div className="bg-accent-wash border-2 border-accent/30 rounded-lg p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-accent font-bold text-base">Payment required</p>
                    <p className="text-ink-muted text-sm mt-0.5">
                      Pay by card via Stripe Checkout to move this trade forward.
                    </p>
                  </div>
                  <button
                    onClick={handlePayNow}
                    disabled={payingNow}
                    className="shrink-0 px-4 py-2 rounded-lg font-semibold text-sm bg-ink text-page hover:opacity-90 transition disabled:opacity-50"
                  >
                    {payingNow ? "..." : "Pay Now →"}
                  </button>
                </div>
                {payError && <p className="text-xs text-danger mt-2">{payError}</p>}
              </div>
            );
          }
          if (isSeller) {
            return (
              <div className="bg-surface border border-warning/30 rounded-lg p-5 flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-warning" />
                </span>
                <p className="text-warning text-sm font-medium">
                  Waiting for buyer payment...
                </p>
              </div>
            );
          }
          return null;
        })()
      )}

      {/* Shipping — global free trade: the platform hands over the buyer's
          address; the traders arrange the logistics themselves. The seller
          gets a "Ship to" panel + mark-shipped form while shipment is
          pending; the buyer sees their own address echoed back, plus
          tracking once the seller has set it. The mark-shipped form does
          not require an address on file: admin-marked-paid trades skip
          Stripe's address collection, and the address may have been agreed
          over messages instead. */}
      {trade && (viewerIsBuyer || viewerIsSeller) &&
        (trade.shipping_address || sellerCanShip || trade.tracking_to_buyer || trade.carrier) && (
        <div className="bg-surface rounded-lg p-6">
          <h2 className="text-sm font-bold text-ink uppercase tracking-wide mb-3">
            {viewerIsSeller ? "Ship to" : "Shipping"}
          </h2>
          {trade.shipping_address ? (
            <div className="space-y-0.5">
              {addressLines(trade.shipping_address).map((line, i) => (
                <p key={i} className="text-sm font-mono text-ink">{line}</p>
              ))}
            </div>
          ) : viewerIsSeller ? (
            <p className="text-sm text-ink-muted">
              No shipping address on file for this trade — message the buyer to agree on
              the delivery address before dispatching.
            </p>
          ) : null}
          {(trade.tracking_to_buyer || trade.carrier) && (
            <p className="text-sm mt-3">
              <span className="text-ink-faint">Tracking:</span>{" "}
              {(() => {
                // Carrier is its own column since migration 0108; older
                // shipments carry "Carrier TRACKING" concatenated in the
                // tracking column, for which no link is derivable.
                const trackingUrl = buildTrackingUrl(trade.carrier, trade.tracking_to_buyer);
                const label = [trade.carrier, trade.tracking_to_buyer].filter(Boolean).join(" — ");
                return trackingUrl ? (
                  <a
                    href={trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:text-accent-strong font-mono underline decoration-dotted underline-offset-2"
                  >
                    {label} ↗
                  </a>
                ) : (
                  <span className="text-ink font-mono">{label}</span>
                );
              })()}
            </p>
          )}
          <p className="text-xs text-ink-faint mt-3">
            You arrange shipping yourself — including internationally. Use messaging to agree on timing and customs.
          </p>

          {sellerCanShip && (
            <form onSubmit={handleMarkShipped} className="mt-4 flex gap-2 flex-wrap">
              <input
                type="text"
                value={shipCarrier}
                onChange={(e) => setShipCarrier(e.target.value)}
                placeholder="Carrier (optional)"
                className="w-36 px-3 py-2 bg-surface-subtle border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent/50 transition"
              />
              <input
                type="text"
                value={shipTracking}
                onChange={(e) => setShipTracking(e.target.value)}
                placeholder="Tracking number"
                className="flex-1 min-w-[160px] px-3 py-2 bg-surface-subtle border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent/50 transition"
              />
              <button
                type="submit"
                disabled={markingShipped || !shipTracking.trim()}
                className="px-4 py-2 rounded-lg font-semibold text-sm bg-ink text-page hover:opacity-90 transition disabled:opacity-50"
              >
                {markingShipped ? "..." : "Mark as shipped"}
              </button>
              {shipError && <p className="w-full text-xs text-danger">{shipError}</p>}
            </form>
          )}
        </div>
      )}

      {/* Completion loop — the buyer closes the trade by confirming receipt,
          or the auto-complete sweep closes it when the dispute window lapses
          with nothing open against it. Both dates and consequences are shown
          up front so neither party is waiting on an invisible clock. */}
      {trade && receiptConfirmable && viewerIsBuyer && (
        <div className="bg-surface border border-ok/30 rounded-lg p-6 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-ink uppercase tracking-wide">
              Card arrived?
            </h2>
            <p className="text-sm text-ink-muted mt-1">
              Confirm receipt once the card is in your hands and as described.
              If something is wrong, open a dispute below instead of confirming.
              <WhyLink href="/methodology/trade-completion" tooltip="How trades complete" />
            </p>
          </div>
          <Consequences
            items={[
              {
                label: "Trade",
                delta: "completes immediately",
                tone: "emerald",
                methodology: "/methodology/trade-completion",
              },
              {
                label: "Seller payout clock",
                delta:
                  trade.payout_hold_days != null && trade.payout_hold_days > 0
                    ? `starts — released after a ${trade.payout_hold_days}-day hold`
                    : "starts — eligible for release right away",
                tone: "amber",
                methodology: "/methodology/payout-hold",
              },
              {
                label: "Dispute window",
                delta: "closes — open any dispute before confirming",
                tone: "red",
              },
            ]}
          />
          <button
            onClick={handleConfirmReceived}
            disabled={confirmingReceipt}
            className="px-4 py-2 rounded-lg font-semibold text-sm bg-ink text-page hover:opacity-90 transition disabled:opacity-50"
          >
            {confirmingReceipt ? "..." : "Confirm received"}
          </button>
          {receiptError && <p className="text-xs text-danger">{receiptError}</p>}
          {trade.auto_complete_at && (
            <p className="text-xs text-ink-faint">
              If you do nothing, this trade completes automatically on{" "}
              <span className="text-ink-muted font-mono">{formatDate(trade.auto_complete_at)}</span>{" "}
              provided no dispute, return, or cancellation is open — computed from the
              dispatch time plus this trade&apos;s dispute window, not from a carrier
              delivery event.
            </p>
          )}
        </div>
      )}
      {trade && receiptConfirmable && viewerIsSeller && (
        <div className="bg-surface border border-border-subtle rounded-lg p-4">
          <p className="text-sm text-ink-muted">
            Waiting for the buyer to confirm receipt.
            {trade.auto_complete_at && (
              <>
                {" "}If they don&apos;t, the trade completes automatically on{" "}
                <span className="text-ink-muted font-mono">{formatDate(trade.auto_complete_at)}</span>{" "}
                unless a dispute, return, or cancellation is opened before then.
              </>
            )}
            <WhyLink href="/methodology/trade-completion" tooltip="How trades complete" />
          </p>
        </div>
      )}

      {/* Review loop — terminal trades (completed | refunded) are reviewable.
          Linked unconditionally; the review form's own gates reject
          duplicates. */}
      {trade && (viewerIsBuyer || viewerIsSeller) &&
        ["completed", "refunded"].includes(trade.escrow_status) && (
          <Link
            href={`/account/trades/${tradeId}/review`}
            className="flex items-center justify-between bg-surface border border-accent/30 rounded-lg p-4 hover:bg-accent-wash transition group"
          >
            <div>
              <p className="text-ink font-bold text-sm">Leave a review</p>
              <p className="text-ink-muted text-xs mt-0.5">
                How did this trade go? Your review builds the other party&apos;s reputation.
              </p>
            </div>
            <span className="text-accent font-bold text-sm group-hover:translate-x-1 transition-transform">
              Review &rarr;
            </span>
          </Link>
        )}

      {/* Dispute section */}
      {dispute ? (
        <div className="space-y-4">
          {/* Dispute header + status */}
          <div className="bg-surface rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-ink uppercase tracking-wide">Dispute</h2>
              <span
                className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold border ${
                  statusColors[dispute.status] || statusColors.open
                }`}
              >
                {statusLabels[dispute.status] || dispute.status}
              </span>
            </div>

            <DisputeTimeline dispute={dispute} />

            <div className="space-y-2 text-sm mt-5">
              <div className="flex gap-2">
                <span className="text-ink-faint shrink-0">Reason:</span>
                <span className="text-ink">
                  {DISPUTE_REASONS.find((r) => r.value === dispute.reason)?.label || dispute.reason}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-ink-faint shrink-0">Description:</span>
                <span className="text-ink-muted">{dispute.description}</span>
              </div>
            </div>

            {/* Resolution summary — surfaces once admin has closed the case */}
            {isDisputeTerminal(dispute.status) && dispute.resolution_notes && (
              <div className={`mt-4 rounded-lg p-4 border ${
                dispute.status === "closed"
                  ? "bg-surface-subtle border-border-subtle"
                  : "bg-ok/10 border-ok/30"
              }`}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-ink-muted">
                    {dispute.status === "closed" ? "Withdrawn" : "Resolution"}
                  </span>
                  {dispute.resolved_at && (
                    <span className="text-xs text-ink-faint">{formatDate(dispute.resolved_at)}</span>
                  )}
                </div>
                <p className="text-sm text-ink">{dispute.resolution_notes}</p>
                {dispute.refund_amount && parseFloat(dispute.refund_amount) > 0 && (
                  <p className="text-xs text-ok mt-2">
                    Refund: £{Number(dispute.refund_amount).toFixed(2)}
                  </p>
                )}
              </div>
            )}

            {/* Withdraw option — only the raiser, only while unresolved */}
            {sessionUserId === dispute.raised_by && !isDisputeTerminal(dispute.status) && (
              <div className="mt-4">
                {showWithdrawConfirm ? (
                  <div className="bg-accent-wash border border-accent/30 rounded-lg p-3 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-accent">Withdraw this dispute? The trade will continue normally.</span>
                    <button
                      onClick={handleWithdraw}
                      disabled={withdrawing}
                      className="text-xs bg-ink hover:opacity-90 text-page font-semibold rounded px-3 py-1.5 disabled:opacity-50"
                    >
                      {withdrawing ? "..." : "Confirm withdraw"}
                    </button>
                    <button
                      onClick={() => setShowWithdrawConfirm(false)}
                      disabled={withdrawing}
                      className="text-xs text-ink-muted hover:text-ink px-2"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowWithdrawConfirm(true)}
                    className="text-xs text-ink-faint hover:text-ink underline"
                  >
                    Withdraw dispute
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Evidence */}
          {(evidence.length > 0 || !isDisputeTerminal(dispute.status)) && (
            <div className="bg-surface rounded-lg p-6">
              <h2 className="text-sm font-bold text-ink uppercase tracking-wide mb-4">
                Evidence <span className="text-ink-faint font-normal">({evidence.length})</span>
              </h2>
              {evidence.length === 0 && (
                <p className="text-sm text-ink-faint mb-4">
                  Upload photos of the card, packaging, tracking screenshots — anything relevant.
                </p>
              )}
              {evidence.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4">
                  {evidence.map((ev) => (
                    <a
                      key={ev.id}
                      href={ev.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={ev.url}
                        alt={ev.label || "Evidence"}
                        className="aspect-square w-full object-cover rounded-lg border border-border-subtle group-hover:border-accent/40 transition"
                      />
                      {ev.label && (
                        <p className="text-[11px] text-ink-muted mt-1 truncate">{ev.label}</p>
                      )}
                      <p className="text-[10px] text-ink-faint">{formatDate(ev.created_at)}</p>
                    </a>
                  ))}
                </div>
              )}

              {/* Upload — only while dispute is still open */}
              {!isDisputeTerminal(dispute.status) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    value={evidenceLabel}
                    onChange={(e) => setEvidenceLabel(e.target.value)}
                    placeholder="Label (optional, e.g. 'front of card')"
                    className="flex-1 min-w-[180px] px-3 py-2 bg-surface-subtle border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent/50"
                  />
                  <label className={`cursor-pointer px-4 py-2 rounded-lg font-bold text-sm transition ${
                    uploadingEvidence
                      ? "bg-surface-subtle text-ink-faint cursor-not-allowed"
                      : "bg-ink text-page hover:opacity-90"
                  }`}>
                    {uploadingEvidence ? "Uploading..." : "Upload photo"}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingEvidence}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleEvidenceUpload(file);
                        e.target.value = "";
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
              {evidenceError && (
                <p className="text-xs text-danger mt-2">{evidenceError}</p>
              )}
            </div>
          )}

          {/* Messages thread */}
          <div className="bg-surface rounded-lg p-6">
            <h2 className="text-sm font-bold text-ink uppercase tracking-wide mb-4">Messages</h2>

            {messages.length === 0 ? (
              <p className="text-ink-faint text-sm py-4 text-center">No messages yet.</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto mb-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-3 rounded-lg text-sm ${
                      msg.is_admin
                        ? "bg-accent-wash border border-accent/30"
                        : "bg-surface-subtle border border-border-subtle"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-ink font-medium text-xs">
                        {msg.sender_name || "User"}
                      </span>
                      {msg.is_admin && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-accent-wash text-accent border border-accent/30">
                          Admin
                        </span>
                      )}
                      <span className="text-ink-faint text-xs ml-auto">
                        {formatDate(msg.created_at)}
                      </span>
                    </div>
                    <p className="text-ink-muted">{msg.message}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Message input — only if dispute is not resolved/closed */}
            {!["resolved_buyer", "resolved_seller", "resolved_split", "closed"].includes(dispute.status) && (
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2.5 bg-surface-subtle border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent/50 transition"
                />
                <button
                  type="submit"
                  disabled={sendingMessage || !newMessage.trim()}
                  className="px-4 py-2.5 rounded-lg font-semibold text-sm bg-ink text-page hover:opacity-90 transition disabled:opacity-50"
                >
                  {sendingMessage ? "..." : "Send"}
                </button>
              </form>
            )}
          </div>
        </div>
      ) : (
        /* Raise dispute form */
        <div className="bg-surface rounded-lg p-6">
          <h2 className="text-sm font-bold text-ink uppercase tracking-wide mb-4">Raise Dispute</h2>
          <p className="text-ink-muted text-sm mb-4">
            If there is an issue with this trade, you can raise a dispute and our team will review it.
          </p>

          <form onSubmit={handleRaiseDispute} className="space-y-4">
            <div>
              <label className="block text-xs text-ink-faint mb-1">Reason *</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2.5 bg-surface-subtle border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent/50 transition"
              >
                {DISPUTE_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-ink-faint mb-1">Description *</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={4}
                className="w-full px-3 py-2.5 bg-surface-subtle border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent/50 transition resize-none"
                placeholder="Describe the issue in detail..."
              />
            </div>

            {disputeError && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg p-3">
                <p className="text-danger text-sm">{disputeError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submittingDispute || !description.trim()}
              className="w-full py-3 rounded-lg font-bold text-sm bg-danger text-page hover:bg-danger/85 transition disabled:opacity-50"
            >
              {submittingDispute ? "Submitting..." : "Raise Dispute"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
