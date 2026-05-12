"use client";

import { useEffect, useState } from "react";
import { formatPrice, formatDateTime } from "@/lib/format";
import { Badge, Palettes } from "@/lib/ui";
import ConfirmModal from "@/components/ui/ConfirmModal";
import type { MarketOrder, MarketTrade, EscrowStatus } from "@/lib/market/types";
import { DISPUTE_REASONS } from "@/lib/trust/types";

import { Audience } from "@/lib/ui";
type TradeWithRole = MarketTrade & {
  current_user_role: "buyer" | "seller";
  payment_expires_at?: string | null;
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
function PaymentCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const msLeft = new Date(expiresAt).getTime() - now;
  if (msLeft <= 0) {
    return (
      <span className="text-[10px] text-neutral-500 font-mono">Window elapsed — will cancel shortly.</span>
    );
  }
  const hours = Math.floor(msLeft / 3_600_000);
  const mins = Math.floor((msLeft % 3_600_000) / 60_000);
  const label = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  const tone = msLeft < 3_600_000 ? "text-red-400"
    : msLeft < 6 * 3_600_000 ? "text-amber-400"
    : "text-neutral-400";
  return (
    <span className={`text-[10px] font-mono ${tone}`}>
      Pay within {label}
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
    <div className="bg-neutral-900 border border-amber-500/20 rounded-xl p-4 mb-3">
      <div className="flex items-center gap-3 mb-3">
        {trade.image_url && (
          <img src={trade.image_url} alt="" className="w-10 h-14 rounded object-cover" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{trade.card_name || trade.sku}</p>
          <p className="text-xs text-neutral-400 mt-0.5">
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
              <img src={p.url} alt="" className="w-16 h-16 rounded object-cover border border-neutral-700" />
              <span
                className={`absolute bottom-0 right-0 text-[9px] px-1 rounded-tl ${
                  p.approved === true
                    ? "bg-emerald-500 text-black"
                    : p.approved === false
                    ? "bg-red-500 text-white"
                    : "bg-amber-500 text-black"
                }`}
              >
                {p.approved === true ? "OK" : p.approved === false ? "X" : "?"}
              </span>
            </div>
          ))}
        </div>
      )}

      <label className="inline-block">
        <span className={`px-3 py-1.5 text-xs font-bold rounded-md cursor-pointer transition ${uploading ? "bg-neutral-700 text-neutral-400" : "bg-amber-500 text-black hover:bg-amber-400"}`}>
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
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}

export default function TradesPage() {
  const [tab, setTab] = useState<"orders" | "history">("orders");
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [trades, setTrades] = useState<TradeWithRole[]>([]);
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

  return (
    <div>
      <Audience kind="consumer" />
      <h1 className="text-2xl font-black text-white mb-6">Trades</h1>

      {photosNeeded.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-amber-400 mb-2 uppercase tracking-wide">
            Action needed: photos
          </h2>
          {photosNeeded.map((t) => (
            <TradePhotoUploader key={t.id} trade={t} />
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-neutral-900 rounded-lg p-1 mb-6 w-fit">
        <button
          onClick={() => setTab("orders")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            tab === "orders"
              ? "bg-amber-500 text-black"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          Open Orders
        </button>
        <button
          onClick={() => setTab("history")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            tab === "history"
              ? "bg-amber-500 text-black"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          Trade History
        </button>
      </div>

      {/* Open Orders */}
      {tab === "orders" && (
        <div className="bg-neutral-900 rounded-xl">
          {loadingOrders ? (
            <div className="p-6 space-y-3 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 bg-neutral-800 rounded-lg" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-sm">
              No open orders.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-neutral-500 text-xs uppercase tracking-wide border-b border-neutral-800">
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
                    <tr key={order.id} className="border-b border-neutral-800/50 hover:bg-neutral-800/30 transition">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {order.image_url ? (
                            <img src={order.image_url} alt="" className="w-8 h-11 rounded object-cover" />
                          ) : (
                            <div className="w-8 h-11 bg-neutral-800 rounded" />
                          )}
                          <div>
                            <p className="text-white font-medium text-sm truncate max-w-[160px]">
                              {order.card_name || order.sku}
                            </p>
                            <p className="text-neutral-500 text-xs font-mono">{order.sku}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span
                          className={`text-xs font-bold uppercase ${
                            order.side === "bid" ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {order.side === "bid" ? "Buy" : "Sell"}
                        </span>
                      </td>
                      <td className="p-4 text-white font-mono">{formatPrice(Number(order.price))}</td>
                      <td className="p-4 text-neutral-300">{order.quantity}</td>
                      <td className="p-4 text-neutral-500">{order.filled_quantity}</td>
                      <td className="p-4 text-neutral-400 text-xs">{order.condition}</td>
                      <td className="p-4 text-neutral-500 text-xs">{formatDate(order.created_at)}</td>
                      <td className="p-4">
                        <button
                          onClick={() => handleCancel(order.id)}
                          disabled={cancelling === order.id}
                          className="px-3 py-1.5 text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/25 transition disabled:opacity-50"
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
        <div className="bg-neutral-900 rounded-xl">
          {loadingTrades ? (
            <div className="p-6 space-y-3 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 bg-neutral-800 rounded-lg" />
              ))}
            </div>
          ) : trades.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-sm">
              No trade history yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-neutral-500 text-xs uppercase tracking-wide border-b border-neutral-800">
                    <th className="text-left p-4 font-medium">Card</th>
                    <th className="text-left p-4 font-medium">Side</th>
                    <th className="text-left p-4 font-medium">Price</th>
                    <th className="text-left p-4 font-medium">Qty</th>
                    <th className="text-left p-4 font-medium">Escrow</th>
                    <th className="text-left p-4 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade) => {
                    const isBuyer = trade.current_user_role === "buyer";
                    const canPay =
                      isBuyer &&
                      trade.escrow_status === "awaiting_payment" &&
                      (!trade.payment_expires_at || new Date(trade.payment_expires_at) > new Date());
                    return (
                      <tr key={trade.id} className="border-b border-neutral-800/50 hover:bg-neutral-800/30 transition">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            {trade.image_url ? (
                              <img src={trade.image_url} alt="" className="w-8 h-11 rounded object-cover" />
                            ) : (
                              <div className="w-8 h-11 bg-neutral-800 rounded" />
                            )}
                            <p className="text-white font-medium text-sm truncate max-w-[160px]">
                              {trade.card_name || trade.sku}
                            </p>
                          </div>
                        </td>
                        <td className="p-4">
                          <span
                            className={`text-xs font-bold uppercase ${
                              isBuyer ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            {isBuyer ? "Bought" : "Sold"}
                          </span>
                        </td>
                        <td className="p-4 text-white font-mono">{formatPrice(Number(trade.price))}</td>
                        <td className="p-4 text-neutral-300">{trade.quantity}</td>
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
                                  className="px-3 py-1 text-xs font-bold bg-amber-500 text-black rounded-md hover:bg-amber-400 transition disabled:opacity-50"
                                >
                                  {paying === trade.id ? "..." : "Pay Now"}
                                </button>
                                <PaymentCountdown expiresAt={trade.payment_expires_at} />
                              </>
                            )}
                            {trade.escrow_status === "awaiting_payment" && !isBuyer && trade.payment_expires_at && (
                              <>
                                <span className="text-[10px] text-neutral-500">Awaiting buyer payment</span>
                                <PaymentCountdown expiresAt={trade.payment_expires_at} />
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
                                className="px-2 py-0.5 text-[10px] font-medium text-red-400 border border-red-500/30 rounded-md hover:bg-red-500/10 transition"
                              >
                                Open dispute
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-neutral-500 text-xs">{formatDate(trade.created_at)}</td>
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
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !disputeSubmitting && setDisputeFor(null)}>
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-1">Open a dispute</h2>
            <p className="text-xs text-neutral-400 mb-4">
              {disputeFor.card_name || disputeFor.sku} &middot; {formatPrice(parseFloat(disputeFor.price))}
            </p>

            <label className="block text-xs text-neutral-500 mb-1">Reason</label>
            <select
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              className="w-full px-3 py-2 mb-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm"
            >
              <option value="">Select reason</option>
              {DISPUTE_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>

            <label className="block text-xs text-neutral-500 mb-1">What happened?</label>
            <textarea
              value={disputeDescription}
              onChange={(e) => setDisputeDescription(e.target.value)}
              placeholder="Describe the issue (20+ characters). Include any tracking refs, photos already shared, or dates."
              rows={4}
              className="w-full px-3 py-2 mb-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm resize-none"
            />

            {disputeError && <p className="text-xs text-red-400 mb-2">{disputeError}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDisputeFor(null)}
                disabled={disputeSubmitting}
                className="px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white transition"
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
                    // src/app/api/trust/disputes; that route handles trade
                    // membership + UK-verification checks.
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
                className="px-3 py-1.5 text-xs font-bold bg-red-500 text-white rounded-md hover:bg-red-400 transition disabled:opacity-50"
              >
                {disputeSubmitting ? "Submitting..." : "Open dispute"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Cancel Order"
        message="Cancel this market order? This cannot be undone."
        confirmLabel="Cancel Order"
        variant="warning"
        onConfirm={() => { pendingAction?.(); setConfirmOpen(false); setPendingAction(null); }}
        onCancel={() => { setConfirmOpen(false); setPendingAction(null); }}
      />
    </div>
  );
}
