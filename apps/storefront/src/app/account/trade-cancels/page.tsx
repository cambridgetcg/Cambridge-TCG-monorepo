"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatTimeUntil } from "@/lib/format";
import { Badge, Palettes, Money } from "@/lib/ui";
import { Audience } from "@/lib/ui";
import {
  CANCEL_STEPS,
  getCancelStep,
  getCancelClosedCopy,
  isCancelTerminal,
  CANCEL_REASONS,
  type CancelStatus,
} from "@/lib/market/cancel-timeline";

const STATUS_LABELS: Record<CancelStatus, string> = {
  requested: "Awaiting decision",
  approved:  "Approved",
  declined:  "Declined",
  expired:   "Expired",
  withdrawn: "Withdrawn",
};

interface CancelRow {
  id: string;
  trade_id: string;
  requester_id: string;
  requester_role: "buyer" | "seller";
  reason: string;
  message: string | null;
  decline_reason: string | null;
  status: CancelStatus;
  created_at: string;
  resolved_at: string | null;
  expires_at: string;
  card_name: string | null;
  sku: string;
  trade_price: string;
  trade_quantity: number;
  buyer_id: string;
  seller_id: string;
}

export default function TradeCancelsPage() {
  const [rows, setRows] = useState<CancelRow[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/market/trade-cancels")
      .then((r) => r.json())
      .then((d) => setRows(d.requests || []))
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => { if (d?.user?.id) setMeId(d.user.id); })
      .catch(() => {});
    load();
  }, []);

  async function act(cancelId: string, path: string, body?: object) {
    setBusy(cancelId);
    setError(null);
    try {
      const res = await fetch(`/api/market/trade-cancels/${cancelId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Action failed");
      else load();
    } finally {
      setBusy(null);
    }
  }

  // "Awaiting your decision" must count only requests still open and aimed
  // at this user — not resolved ones (walker: the count stayed at 1 after a
  // decision because the section counted every incoming row regardless of
  // status). Everything else — resolved incoming + all my own requests —
  // is history.
  const { awaiting, history } = useMemo(() => {
    if (!meId) return { awaiting: [] as CancelRow[], history: [] as CancelRow[] };
    return {
      awaiting: rows.filter((r) => r.requester_id !== meId && r.status === "requested"),
      history: rows.filter((r) => !(r.requester_id !== meId && r.status === "requested")),
    };
  }, [rows, meId]);

  return (
    <div>
      <Audience kind="consumer" />
      <h1 className="text-2xl font-display font-semibold text-ink mb-2">Trade Cancellations</h1>
      <p className="text-sm text-ink-muted mb-6">
        Pre-payment cancel handshake. Either side can request a cancellation; the other approves or
        declines. Faster than waiting for the 24h payment window to time out. Different from disputes —
        which exist for fault claims after payment.
      </p>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 mb-4 text-sm text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-surface rounded-lg p-8 text-center">
          <p className="text-ink-muted text-sm">
            No cancellation requests. Open one from /account/trades on a trade still
            awaiting payment or shipment.
          </p>
          <Link
            href="/account/trades"
            className="inline-block mt-3 text-accent text-xs font-semibold hover:text-accent-strong"
          >
            View trades →
          </Link>
        </div>
      ) : (
        <>
          {awaiting.length > 0 && (
            <section className="mb-6">
              <h2 className="text-sm font-bold text-accent mb-2 uppercase tracking-wide">
                Awaiting your decision ({awaiting.length})
              </h2>
              <div className="space-y-3">
                {awaiting.map((r) => (
                  <CancelCard
                    key={r.id}
                    row={r}
                    perspective="other"
                    busy={busy === r.id}
                    onAct={(p, body) => act(r.id, p, body)}
                  />
                ))}
              </div>
            </section>
          )}

          {history.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-ink-muted mb-2 uppercase tracking-wide">
                Requests &amp; history ({history.length})
              </h2>
              <div className="space-y-3">
                {history.map((r) => (
                  <CancelCard
                    key={r.id}
                    row={r}
                    perspective={r.requester_id === meId ? "self" : "other"}
                    busy={busy === r.id}
                    onAct={(p, body) => act(r.id, p, body)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function CancelCard({
  row,
  perspective,
  busy,
  onAct,
}: {
  row: CancelRow;
  perspective: "self" | "other";
  busy: boolean;
  onAct: (path: string, body?: object) => void;
}) {
  const closedCopy = getCancelClosedCopy(row.status);
  const stepKey = getCancelStep(row.status);
  const stepIdx = stepKey ? CANCEL_STEPS.indexOf(stepKey) : -1;
  const reasonLabel = CANCEL_REASONS.find((r) => r.value === row.reason)?.label || row.reason;
  const tradeTotal = parseFloat(row.trade_price) * row.trade_quantity;

  const [declineText, setDeclineText] = useState("");
  const [showDecline, setShowDecline] = useState(false);

  return (
    <div className="bg-surface rounded-lg p-4 border border-border-subtle">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-ink font-semibold text-sm truncate">
            {row.card_name || row.sku}
            {/* The API coalesces card_name→sku, so only show the SKU chip
                when there's a real name to sit beside (else it rendered the
                SKU twice: "OP-…-JPOP-…-JP"). */}
            {row.card_name && row.card_name !== row.sku && (
              <span className="text-ink-faint font-mono text-xs ml-2">{row.sku}</span>
            )}
          </p>
          <p className="text-xs text-ink-faint mt-0.5">
            {row.requester_role === "buyer" ? "Buyer" : "Seller"} requested ·{" "}
            Trade total <Money value={tradeTotal} />
            <span className="mx-1.5">·</span>
            Opened {new Date(row.created_at).toLocaleDateString("en-GB", {
              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
            })}
          </p>
        </div>
        <Badge status={row.status} palette={Palettes.CancelStatusPalette} labels={STATUS_LABELS} />
      </div>

      <div className="bg-surface-subtle rounded p-2 mb-2">
        <span className="text-[10px] uppercase tracking-wide text-ink-faint">Reason</span>
        <p className="text-xs text-ink-muted mt-0.5">{reasonLabel}</p>
        {row.message && (
          <p className="text-xs text-ink-muted italic mt-1">“{row.message}”</p>
        )}
      </div>

      {row.status === "declined" && row.decline_reason && (
        <div className="bg-danger/5 rounded p-2 mb-2 border border-danger/10">
          <span className="text-[10px] uppercase tracking-wide text-danger">Declined</span>
          <p className="text-xs text-danger italic mt-0.5">“{row.decline_reason}”</p>
        </div>
      )}

      {/* On-path 2-step timeline (requested → responded) */}
      {!closedCopy && stepIdx >= 0 && (
        <div className="flex items-center gap-2 mb-3 mt-1">
          {CANCEL_STEPS.map((step, i) => {
            const done = i <= stepIdx;
            const current = i === stepIdx;
            return (
              <div key={step} className="flex items-center gap-2 flex-1 min-w-0">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                    done
                      ? current ? "bg-ink text-page" : "bg-ok text-page"
                      : "bg-surface-subtle text-ink-faint"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </div>
                <span className={`text-[10px] capitalize ${done ? "text-ink" : "text-ink-faint"}`}>
                  {step}
                </span>
                {i < CANCEL_STEPS.length - 1 && (
                  <div className={`h-px flex-1 ${done ? "bg-ok/40" : "bg-surface-subtle"}`} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {closedCopy && (
        <p className="text-xs text-ink-faint italic mb-3">{closedCopy}</p>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        {row.status === "requested" ? (
          <span className="text-[10px] text-ink-faint font-mono">{formatTimeUntil(row.expires_at)} left</span>
        ) : (
          <span className="text-[10px] text-ink-faint">
            {row.resolved_at && `Resolved ${new Date(row.resolved_at).toLocaleDateString("en-GB", {
              day: "numeric", month: "short",
            })}`}
          </span>
        )}

        <div className="flex gap-2 flex-wrap">
          {/* Other-party actions on requested */}
          {perspective === "other" && row.status === "requested" && !showDecline && (
            <>
              <button
                disabled={busy}
                onClick={() => onAct("approve")}
                className="px-3 py-1.5 text-xs font-semibold bg-ink text-page rounded-md hover:opacity-90 transition disabled:opacity-50"
              >
                {busy ? "..." : "Approve cancel"}
              </button>
              <button
                disabled={busy}
                onClick={() => setShowDecline(true)}
                className="px-3 py-1.5 text-xs font-medium bg-surface-subtle text-ink-muted rounded-md hover:bg-surface-subtle transition disabled:opacity-50"
              >
                Decline
              </button>
            </>
          )}

          {/* Self-actions on requested */}
          {perspective === "self" && row.status === "requested" && (
            <button
              disabled={busy}
              onClick={() => onAct("withdraw")}
              className="px-3 py-1.5 text-xs font-medium bg-surface-subtle text-ink-muted rounded-md hover:bg-surface-subtle transition disabled:opacity-50"
            >
              Withdraw request
            </button>
          )}

          {isCancelTerminal(row.status) && (
            <Link
              href="/account/trades"
              className="px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink transition"
            >
              View trade →
            </Link>
          )}
        </div>
      </div>

      {/* Inline decline form */}
      {showDecline && perspective === "other" && row.status === "requested" && (
        <div className="mt-3 pt-3 border-t border-border-subtle">
          <textarea
            value={declineText}
            onChange={(e) => setDeclineText(e.target.value)}
            placeholder="Optional reason (visible to the requester)"
            rows={2}
            className="w-full px-2 py-1 bg-surface-subtle border border-border-subtle rounded text-ink text-xs resize-none mb-2"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowDecline(false); setDeclineText(""); }}
              className="px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink transition"
            >
              Cancel
            </button>
            <button
              disabled={busy}
              onClick={() => {
                onAct("decline", declineText.trim() ? { reason: declineText.trim() } : undefined);
                setShowDecline(false);
                setDeclineText("");
              }}
              className="px-3 py-1.5 text-xs font-bold bg-danger text-page rounded-md hover:bg-danger/85 transition disabled:opacity-50"
            >
              {busy ? "..." : "Decline cancel"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
