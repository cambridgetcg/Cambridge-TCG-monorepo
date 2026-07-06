"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { Badge, Palettes, Money, MessageButton } from "@/lib/ui";
import ConfirmModal from "@/components/ui/ConfirmModal";
import type { MarketOrder, MarketTrade, EscrowStatus } from "@/lib/market/types";
import { DISPUTE_REASONS } from "@/lib/trust/types";

import { Audience } from "@/lib/ui";
type TradeWithRole = MarketTrade & {
  current_user_role: "buyer" | "seller";
  payment_expires_at?: string | null;
  // Counterparty identity — usernames + ids only; emails left the trades
  // payload with the global-free-trade release.
  buyer_username?: string | null;
};

interface TradePhoto {
  id: string;
  trade_id: string;
  url: string;
  approved: boolean | null;
  created_at: string;
}

function EscrowBadge({ status }: { status: EscrowStatus }) {
  return (
    <Badge
      status={status}
      palette={Palettes.EscrowStatusPalette}
      labels={Palettes.EscrowStatusLabels}
    />
  );
}

const formatDate = formatDateTime;

// Payment-window countdown for awaiting_payment trades. Rendered as a
// small pill the user can't miss — goes amber < 6h, red < 1h, neutral
// grey once the window has already expired (sweep hasn't yet run).
function PaymentCountdown({ expiresAt, sellerView = false }: { expiresAt: string; sellerView?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const msLeft = new Date(expiresAt).getTime() - now;
  if (msLeft <= 0) {
    return (
      <span className="text-[10px] text-ink-faint font-mono">Window elapsed — will cancel shortly.</span>
    );
  }
  const hours = Math.floor(msLeft / 3_600_000);
  const mins = Math.floor((msLeft % 3_600_000) / 60_000);
  const label = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  const tone = msLeft < 3_600_000 ? "text-danger"
    : msLeft < 6 * 3_600_000 ? "text-accent"
    : "text-ink-muted";
  // Seller-side: the deadline is the buyer's, not the seller's. Phrasing it
  // as "Pay within…" made a seller think THEY owed the money (walker).
  return (
    <span className={`text-[10px] font-mono ${tone}`}>
      {sellerView ? `Buyer has ${label} to pay` : `Pay within ${label}`}
    </span>
  );
}

// Photos must be uploaded before the seller ships for verified / full_escrow
// tiers. We render one card per trade that qualifies; admin reviews server-side.
function TradePhotoUploader({ trade }: { trade: TradeWithRole }) {
  const [photos, setPhotos] = useState<TradePhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/market/trades/${trade.id}/photos`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setPhotos(d.photos || []); })
      .catch(() => {});
  }, [trade.id]);

  async function handleFiles(files: FileList) {
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const presign = await fetch(`/api/market/trades/${trade.id}/photos/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentType: file.type }),
        });
        if (!presign.ok) throw new Error((await presign.json()).error || "Upload URL failed");
        const { uploadUrl, imageUrl, s3Key } = await presign.json();

        const put = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!put.ok) throw new Error("S3 upload failed");

        const reg = await fetch(`/api/market/trades/${trade.id}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: imageUrl, s3Key }),
        });
        if (!reg.ok) throw new Error("Photo register failed");
        const { photo } = await reg.json();
        setPhotos((prev) => [...prev, photo]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-surface border border-accent/30 rounded-lg p-4 mb-3">
      <div className="flex items-center gap-3 mb-3">
        {trade.image_url && (
          <img src={trade.image_url} alt="" className="w-10 h-14 rounded object-cover" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-ink truncate">{trade.card_name || trade.sku}</p>
          <p className="text-xs text-ink-muted mt-0.5">
            {trade.escrow_tier === "full_escrow"
              ? "Upload card photos before shipping to Cambridge TCG"
              : "Upload card photos for CTCG review before shipping to the buyer"}
          </p>
        </div>
      </div>

      {photos.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-3">
          {photos.map((p) => (
            <div key={p.id} className="relative">
              <img src={p.url} alt="" className="w-16 h-16 rounded object-cover border border-border-subtle" />
              <span
                className={`absolute bottom-0 right-0 text-[9px] px-1 rounded-tl ${
                  p.approved === true
                    ? "bg-ok text-page"
                    : p.approved === false
                    ? "bg-danger text-page"
                    : "bg-warning text-page"
                }`}
              >
                {p.approved === true ? "OK" : p.approved === false ? "X" : "?"}
              </span>
            </div>
          ))}
        </div>
      )}

      <label className="inline-block">
        <span className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition ${uploading ? "bg-surface-subtle text-ink-muted" : "bg-ink text-page hover:opacity-90"}`}>
          {uploading ? "Uploading..." : "Upload Photos"}
        </span>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={uploading}
          onChange={(e) => { if (e.target.files?.length) { handleFiles(e.target.files); e.target.value = ""; } }}
          className="hidden"
        />
      </label>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}

// Minimal shape of a pending cancel request as returned by
// GET /api/market/trade-cancels — enough to surface the decision on the
// action banner and route the user to where it lives.
interface PendingCancel {
  id: string;
  trade_id: string;
  requester_id: string;
  status: string;
  card_name: string | null;
  sku: string;
}

export default function TradesPage() {
  const [tab, setTab] = useState<"orders" | "history">("orders");
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [trades, setTrades] = useState<TradeWithRole[]>([]);
  const [cancels, setCancels] = useState<PendingCancel[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [disputeFor, setDisputeFor] = useState<TradeWithRole | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeDescription, setDisputeDescription] = useState("");
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingTrades, setLoadingTrades] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  useEffect(() => {
    fetch("/api/market/orders?status=open")
      .then((r) => r.json())
      .then((data) => setOrders(data.orders || []))
      .catch(() => {})
      .finally(() => setLoadingOrders(false));

    fetch("/api/market/trades")
      .then((r) => r.json())
      .then((data) => setTrades(data.trades || []))
      .catch(() => {})
      .finally(() => setLoadingTrades(false));

    // Pending cancel handshakes touching this user's trades — surfaced in
    // the action banner so the 12h decision isn't buried behind More tools.
    fetch("/api/market/trade-cancels")
      .then((r) => r.json())
      .then((data) => setCancels((data.requests || []).filter((c: PendingCancel) => c.status === "requested")))
      .catch(() => {});

    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => { if (d?.user?.id) setMeId(d.user.id); })
      .catch(() => {});
  }, []);

  function handleCancel(orderId: string) {
    setPendingAction(() => async () => {
      setCancelling(orderId);
      try {
        const res = await fetch("/api/market/orders", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        });
        if (!res.ok) throw new Error("Failed to cancel");
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
      } catch {
        // Silently fail — user can retry
      } finally {
        setCancelling(null);
      }
    });
    setConfirmOpen(true);
  }

  // Trades that need seller-side photo upload before shipping. These block
  // progression for verified / full_escrow tiers.
  const photosNeeded = trades.filter(
    (t) =>
      t.current_user_role === "seller" &&
      t.requires_photos &&
      (t.escrow_status === "paid" || t.escrow_status === "awaiting_shipment")
  );

  // Buyer legs still owing payment — the moment the walkers missed because
  // it lived under the "Trade History" tab, not the default one.
  const paymentNeeded = trades.filter(
    (t) =>
      t.current_user_role === "buyer" &&
      t.escrow_status === "awaiting_payment" &&
      (!t.payment_expires_at || new Date(t.payment_expires_at) > new Date())
  );

  // Seller legs ready to ship where NO photos are required (photo trades
  // are handled by the uploader block above — don't double-list them).
  const shipNeeded = trades.filter(
    (t) =>
      t.current_user_role === "seller" &&
      !t.requires_photos &&
      (t.escrow_status === "paid" || t.escrow_status === "awaiting_shipment")
  );

  // Cancel handshakes awaiting THIS user's decision (they're the other
  // party) vs. their own outstanding requests.
  const cancelDecisions = meId ? cancels.filter((c) => c.requester_id !== meId) : [];

  const hasActions =
    photosNeeded.length > 0 ||
    paymentNeeded.length > 0 ||
    shipNeeded.length > 0 ||
    cancelDecisions.length > 0;

  return (
    <div>
      <Audience kind="consumer" />
      <h1 className="text-2xl font-display font-semibold text-ink mb-6">Trades</h1>

      {/* Action needed — hoisted above the tabs for BOTH roles so nothing
          time-boxed (payment window, ship reminder, cancel decision) hides
          behind a tab a user never opens. */}
      {hasActions && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-accent mb-2 uppercase tracking-wide">
            Action needed
          </h2>

          {paymentNeeded.map((t) => (
            <div
              key={`pay-${t.id}`}
              className="bg-surface border border-accent/30 rounded-lg p-4 mb-3 flex items-center justify-between gap-3 flex-wrap"
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink truncate">
                  Pay for {t.card_name || t.sku}
                </p>
                {t.payment_expires_at && (
                  <PaymentCountdown expiresAt={t.payment_expires_at} />
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={async () => {
                    setPaying(t.id);
                    try {
                      const res = await fetch(`/api/market/trades/${t.id}/pay`, { method: "POST" });
                      const data = await res.json().catch(() => null);
                      if (res.ok && data?.url) window.location.href = data.url;
                    } finally {
                      setPaying(null);
                    }
                  }}
                  disabled={paying === t.id}
                  className="px-3 py-1.5 text-xs font-semibold bg-ink text-page rounded-md hover:opacity-90 transition disabled:opacity-50"
                >
                  {paying === t.id ? "..." : "Pay now"}
                </button>
                <Link
                  href={`/account/trades/${t.id}`}
                  className="text-xs font-medium text-accent hover:text-accent-strong"
                >
                  Details →
                </Link>
              </div>
            </div>
          ))}

          {shipNeeded.map((t) => (
            <div
              key={`ship-${t.id}`}
              className="bg-surface border border-accent/30 rounded-lg p-4 mb-3 flex items-center justify-between gap-3 flex-wrap"
            >
              <p className="text-sm font-bold text-ink truncate min-w-0">
                Ship {t.card_name || t.sku} to the buyer
              </p>
              <Link
                href={`/account/trades/${t.id}`}
                className="shrink-0 px-3 py-1.5 text-xs font-semibold bg-ink text-page rounded-md hover:opacity-90 transition"
              >
                Add tracking →
              </Link>
            </div>
          ))}

          {cancelDecisions.map((c) => (
            <div
              key={`cancel-${c.id}`}
              className="bg-surface border border-accent/30 rounded-lg p-4 mb-3 flex items-center justify-between gap-3 flex-wrap"
            >
              <p className="text-sm font-bold text-ink truncate min-w-0">
                A cancellation needs your decision on {c.card_name || c.sku}
              </p>
              <Link
                href="/account/trade-cancels"
                className="shrink-0 px-3 py-1.5 text-xs font-semibold bg-ink text-page rounded-md hover:opacity-90 transition"
              >
                Review request →
              </Link>
            </div>
          ))}

          {photosNeeded.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-ink-muted mb-2 mt-1 uppercase tracking-wide">
                Upload photos before shipping
              </h3>
              {photosNeeded.map((t) => (
                <TradePhotoUploader key={t.id} trade={t} />
              ))}
            </>
          )}
        </div>
      )}

      {/* Tabs — renamed to what they actually hold. "Open Orders" reads as
          your resting listings & bids; "Trades" is every matched trade,
          in-flight or done (an awaiting-payment trade is not "history"). */}
      <div className="flex gap-1 bg-surface rounded-lg p-1 mb-6 w-fit">
        <button
          onClick={() => setTab("orders")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            tab === "orders"
              ? "bg-ink text-page"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          My listings &amp; bids
        </button>
        <button
          onClick={() => setTab("history")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            tab === "history"
              ? "bg-ink text-page"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          Trades
        </button>
      </div>

      {/* Open Orders */}
      {tab === "orders" && (
        <div className="bg-surface rounded-lg">
          {loadingOrders ? (
            <div className="p-6 space-y-3 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 bg-surface-subtle rounded-lg" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center text-ink-faint text-sm">
              No open listings or bids. Post an ask or bid from any card page to see it here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-ink-faint text-xs uppercase tracking-wide border-b border-border-subtle">
                    <th className="text-left p-4 font-medium">Card</th>
                    <th className="text-left p-4 font-medium">Side</th>
                    <th className="text-left p-4 font-medium">Price</th>
                    <th className="text-left p-4 font-medium">Qty</th>
                    <th className="text-left p-4 font-medium">Filled</th>
                    <th className="text-left p-4 font-medium">Condition</th>
                    <th className="text-left p-4 font-medium">Date</th>
                    <th className="p-4" />
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b border-border-subtle hover:bg-surface-subtle transition">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {order.image_url ? (
                            <img src={order.image_url} alt="" className="w-8 h-11 rounded object-cover" />
                          ) : (
                            <div className="w-8 h-11 bg-surface-subtle rounded" />
                          )}
                          <div>
                            <p className="text-ink font-medium text-sm truncate max-w-[160px]">
                              {order.card_name || order.sku}
                            </p>
                            <p className="text-ink-faint text-xs font-mono">{order.sku}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span
                          className={`text-xs font-bold uppercase ${
                            order.side === "bid" ? "text-ok" : "text-danger"
                          }`}
                        >
                          {order.side === "bid" ? "Buy" : "Sell"}
                        </span>
                      </td>
                      <td className="p-4 text-ink font-mono"><Money value={Number(order.price)} /></td>
                      <td className="p-4 text-ink-muted">{order.quantity}</td>
                      <td className="p-4 text-ink-faint">{order.filled_quantity}</td>
                      <td className="p-4 text-ink-muted text-xs">{order.condition}</td>
                      <td className="p-4 text-ink-faint text-xs">{formatDate(order.created_at)}</td>
                      <td className="p-4">
                        <button
                          onClick={() => handleCancel(order.id)}
                          disabled={cancelling === order.id}
                          className="px-3 py-1.5 text-xs font-medium bg-danger/15 text-danger border border-danger/30 rounded-lg hover:bg-danger/15 transition disabled:opacity-50"
                        >
                          {cancelling === order.id ? "..." : "Cancel"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Trade History */}
      {tab === "history" && (
        <div className="bg-surface rounded-lg">
          {loadingTrades ? (
            <div className="p-6 space-y-3 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 bg-surface-subtle rounded-lg" />
              ))}
            </div>
          ) : trades.length === 0 ? (
            <div className="p-8 text-center text-ink-faint text-sm">
              No trades yet. When one of your bids or asks matches, the trade appears here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-ink-faint text-xs uppercase tracking-wide border-b border-border-subtle">
                    <th className="text-left p-4 font-medium">Card</th>
                    <th className="text-left p-4 font-medium">Side</th>
                    <th className="text-left p-4 font-medium">Counterparty</th>
                    <th className="text-left p-4 font-medium">Price</th>
                    <th className="text-left p-4 font-medium">Qty</th>
                    <th className="text-left p-4 font-medium">Escrow</th>
                    <th className="text-left p-4 font-medium">Date</th>
                    <th className="p-4" />
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade) => {
                    const isBuyer = trade.current_user_role === "buyer";
                    const counterpartyId = isBuyer ? trade.seller_id : trade.buyer_id;
                    const counterpartyName = isBuyer ? trade.seller_username : trade.buyer_username;
                    const canPay =
                      isBuyer &&
                      trade.escrow_status === "awaiting_payment" &&
                      (!trade.payment_expires_at || new Date(trade.payment_expires_at) > new Date());
                    return (
                      <tr key={trade.id} className="border-b border-border-subtle hover:bg-surface-subtle transition">
                        <td className="p-4">
                          {/* The detail page (/account/trades/[id]) is the only
                              path to delivery confirmation, returns, and the
                              dispute timeline — every row must reach it. */}
                          <Link
                            href={`/account/trades/${trade.id}`}
                            className="flex items-center gap-3 group"
                          >
                            {trade.image_url ? (
                              <img src={trade.image_url} alt="" className="w-8 h-11 rounded object-cover" />
                            ) : (
                              <div className="w-8 h-11 bg-surface-subtle rounded" />
                            )}
                            <p className="text-ink font-medium text-sm truncate max-w-[160px] group-hover:text-accent transition">
                              {trade.card_name || trade.sku}
                            </p>
                          </Link>
                        </td>
                        <td className="p-4">
                          <span
                            className={`text-xs font-bold uppercase ${
                              isBuyer ? "text-ok" : "text-danger"
                            }`}
                          >
                            {isBuyer ? "Bought" : "Sold"}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-ink-muted text-xs">{counterpartyName || "—"}</span>
                            {/* Direct line to the other party — the logistics channel for
                                arranging shipping, timing, and customs between traders. */}
                            <MessageButton
                              otherUserId={counterpartyId}
                              referenceType="market_trade"
                              referenceId={trade.id}
                              label={isBuyer ? "Message seller" : "Message buyer"}
                              size="sm"
                            />
                          </div>
                        </td>
                        <td className="p-4 text-ink font-mono"><Money value={Number(trade.price)} /></td>
                        <td className="p-4 text-ink-muted">{trade.quantity}</td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1">
                            <EscrowBadge status={trade.escrow_status} />
                            {canPay && trade.payment_expires_at && (
                              <>
                                <button
                                  onClick={async () => {
                                    setPaying(trade.id);
                                    try {
                                      const res = await fetch(`/api/market/trades/${trade.id}/pay`, { method: "POST" });
                                      const data = await res.json();
                                      if (res.ok && data.url) window.location.href = data.url;
                                    } finally {
                                      setPaying(null);
                                    }
                                  }}
                                  disabled={paying === trade.id}
                                  className="px-3 py-1 text-xs font-semibold bg-ink text-page rounded-md hover:opacity-90 transition disabled:opacity-50"
                                >
                                  {paying === trade.id ? "..." : "Pay Now"}
                                </button>
                                <PaymentCountdown expiresAt={trade.payment_expires_at} />
                              </>
                            )}
                            {trade.escrow_status === "awaiting_payment" && !isBuyer && trade.payment_expires_at && (
                              <>
                                <span className="text-[10px] text-ink-faint">Awaiting buyer payment</span>
                                <PaymentCountdown expiresAt={trade.payment_expires_at} sellerView />
                              </>
                            )}
                            {/* Dispute is meaningful when money has changed hands but the trade
                                isn't yet closed. Both parties can raise. */}
                            {(["paid","awaiting_shipment","shipped_to_ctcg","received_by_ctcg","verified","shipped_to_buyer"] as const)
                              .includes(trade.escrow_status as never) && (
                              <button
                                onClick={() => {
                                  setDisputeFor(trade);
                                  setDisputeReason("");
                                  setDisputeDescription("");
                                  setDisputeError(null);
                                }}
                                className="px-2 py-0.5 text-[10px] font-medium text-danger border border-danger/30 rounded-md hover:bg-danger/15 transition"
                              >
                                Open dispute
                              </button>
                            )}
                            {/* Review loop: terminal trades (completed | refunded) are
                                reviewable. Linked unconditionally — the review form's
                                own gates reject duplicates. */}
                            {(trade.escrow_status === "completed" || trade.escrow_status === "refunded") && (
                              <Link
                                href={`/account/trades/${trade.id}/review`}
                                className="px-2 py-0.5 text-[10px] font-medium text-accent border border-accent/30 rounded-md hover:bg-accent-wash transition text-center"
                              >
                                Leave a review
                              </Link>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-ink-faint text-xs">{formatDate(trade.created_at)}</td>
                        <td className="p-4">
                          <Link
                            href={`/account/trades/${trade.id}`}
                            className="text-xs font-medium text-accent hover:text-accent whitespace-nowrap"
                          >
                            Details →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {disputeFor && (
        <div className="fixed inset-0 z-50 bg-ink/60 flex items-center justify-center p-4" onClick={() => !disputeSubmitting && setDisputeFor(null)}>
          <div className="bg-surface rounded-xl border border-border-subtle p-6 w-full max-w-md shadow-mat" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-ink mb-1">Open a dispute</h2>
            <p className="text-xs text-ink-muted mb-4">
              {disputeFor.card_name || disputeFor.sku} &middot; <Money value={parseFloat(disputeFor.price)} />
            </p>

            <label className="block text-xs text-ink-faint mb-1">Reason</label>
            <select
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              className="w-full px-3 py-2 mb-3 bg-surface-subtle border border-border-subtle rounded-lg text-ink text-sm"
            >
              <option value="">Select reason</option>
              {DISPUTE_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>

            <label className="block text-xs text-ink-faint mb-1">What happened?</label>
            <textarea
              value={disputeDescription}
              onChange={(e) => setDisputeDescription(e.target.value)}
              placeholder="Describe the issue (20+ characters). Include any tracking refs, photos already shared, or dates."
              rows={4}
              className="w-full px-3 py-2 mb-3 bg-surface-subtle border border-border-subtle rounded-lg text-ink text-sm resize-none"
            />

            {disputeError && <p className="text-xs text-danger mb-2">{disputeError}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDisputeFor(null)}
                disabled={disputeSubmitting}
                className="px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink transition"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!disputeReason || disputeDescription.trim().length < 20) {
                    setDisputeError("Pick a reason and describe the issue (20+ chars).");
                    return;
                  }
                  setDisputeSubmitting(true);
                  setDisputeError(null);
                  try {
                    // Reuses the existing trust/disputes endpoint built in
                    // src/app/api/trust/disputes; that route verifies trade
                    // membership server-side.
                    const res = await fetch(`/api/trust/disputes`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        tradeId: disputeFor.id,
                        reason: disputeReason,
                        description: disputeDescription.trim(),
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      setDisputeError(data.error || "Failed to open dispute");
                      return;
                    }
                    // Reflect the disputed state locally so the UI updates without a refetch
                    setTrades((prev) => prev.map((t) => t.id === disputeFor.id ? { ...t, escrow_status: "disputed" } : t));
                    setDisputeFor(null);
                  } finally {
                    setDisputeSubmitting(false);
                  }
                }}
                disabled={disputeSubmitting}
                className="px-3 py-1.5 text-xs font-bold bg-danger text-page rounded-md hover:bg-danger/85 transition disabled:opacity-50"
              >
                {disputeSubmitting ? "Submitting..." : "Open dispute"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Cancel this listing?"
        message="This removes the listing from the order book. It can't be undone — but relisting is free."
        confirmLabel="Cancel listing"
        cancelLabel="Keep listing"
        variant="danger"
        onConfirm={() => { pendingAction?.(); setConfirmOpen(false); setPendingAction(null); }}
        onCancel={() => { setConfirmOpen(false); setPendingAction(null); }}
      />
    </div>
  );
}
