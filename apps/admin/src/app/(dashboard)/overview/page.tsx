import { sfQuery, wsQuery } from "@/lib/db";
import { safeCount } from "@/lib/queries";
import { verb } from "@/lib/format";

export const metadata = { title: "Overview" };

async function getStorefrontQueues() {
  const [
    tradeinsPending,
    tradeinsAwaitingPay,
    tradeinsInflight,
    quotesOpen,
    redemptionsPending,
    auctionsLive,
    verificationsPending,
    payoutsPending,
    disputesOpen,
    fraudOpen,
    emailsDead,
  ] = await Promise.all([
    safeCount(sfQuery, `SELECT count(*)::int AS n FROM tradein_submissions WHERE status='submitted'`),
    safeCount(sfQuery, `SELECT count(*)::int AS n FROM tradein_submissions WHERE status='approved'`),
    safeCount(sfQuery, `SELECT count(*)::int AS n FROM tradein_submissions WHERE status IN ('accepted','received','grading')`),
    safeCount(sfQuery, `SELECT count(*)::int AS n FROM quote_requests WHERE status IN ('pending','accepted','received')`),
    safeCount(sfQuery, `SELECT count(*)::int AS n FROM vault_items WHERE redemption_order_id IS NOT NULL AND status='reserved'`),
    safeCount(sfQuery, `SELECT count(*)::int AS n FROM auctions WHERE ends_at > NOW()`),
    safeCount(sfQuery, `SELECT count(*)::int AS n FROM user_verifications WHERE status='pending'`),
    safeCount(sfQuery, `SELECT count(*)::int AS n FROM payout_holds WHERE released = false AND cancelled = false`),
    // The dispute_status enum doesn't include 'escalated' in production —
    // earlier query was throwing and silently rendering "—".
    safeCount(sfQuery, `SELECT count(*)::int AS n FROM trade_disputes WHERE status = 'open'`),
    safeCount(sfQuery, `SELECT count(*)::int AS n FROM fraud_signals WHERE resolved = false`),
    safeCount(sfQuery, `SELECT count(*)::int AS n FROM email_queue WHERE status='dead'`),
  ]);
  return {
    tradeinsPending, tradeinsAwaitingPay, tradeinsInflight,
    quotesOpen, redemptionsPending, auctionsLive,
    verificationsPending, payoutsPending, disputesOpen,
    fraudOpen, emailsDead,
  };
}

async function getWholesaleQueues() {
  const [
    ordersSubmitted,
    ordersQuoted,
    stockBelowTarget,
    purchasesPendingReview,
  ] = await Promise.all([
    safeCount(wsQuery, `SELECT count(*)::int AS n FROM orders WHERE status='submitted'`),
    safeCount(wsQuery, `SELECT count(*)::int AS n FROM orders WHERE status='quoted'`),
    // Reorder count — price-band schema. There is no `stock_levels` table;
    // current stock lives on `cards.stock` and targets are price-banded
    // (see /ops/stock for the full page using this same join).
    safeCount(wsQuery, `
      SELECT count(*)::int AS n
      FROM cards c
      JOIN stock_targets st
        ON c.price >= st.price_min AND c.price < st.price_max
      WHERE st.target_qty - c.stock - COALESCE(c.pending_stock, 0) >= 1
    `),
    safeCount(wsQuery, `SELECT count(*)::int AS n FROM purchases WHERE status='pending_review'`),
  ]);
  return { ordersSubmitted, ordersQuoted, stockBelowTarget, purchasesPendingReview };
}

// ── Components ─────────────────────────────────────────────────────────────

function QueueCard({
  label,
  count,
  href,
  urgency,
}: {
  label: string;
  count: number;
  href: string;
  urgency: "critical" | "warning" | "info" | "neutral";
}) {
  const isError = count === -1;
  const isEmpty = count === 0;

  const colors = {
    critical: "border-red-500/30 bg-red-500/5",
    warning:  "border-amber-500/30 bg-amber-500/5",
    info:     "border-blue-500/30 bg-blue-500/5",
    neutral:  "border-neutral-700 bg-neutral-800/50",
  };

  const countColors = {
    critical: "text-red-400",
    warning:  "text-amber-400",
    info:     "text-blue-400",
    neutral:  "text-neutral-300",
  };

  return (
    <a
      href={href}
      className={[
        "block rounded-lg border p-4 transition-colors hover:bg-neutral-800",
        isEmpty ? "border-neutral-800 bg-neutral-900/50" : colors[urgency],
      ].join(" ")}
    >
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${isEmpty ? "text-neutral-600" : countColors[urgency]}`}>
        {isError ? "—" : count}
      </p>
    </a>
  );
}

function SectionHeading({ label }: { label: string }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3 mt-8 first:mt-0">
      {label}
    </h2>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function OverviewPage() {
  const [sf, ws] = await Promise.all([getStorefrontQueues(), getWholesaleQueues()]);

  // Compute an "attention score" — how many queues have items?
  const attention = [
    sf.tradeinsPending, sf.tradeinsAwaitingPay, sf.quotesOpen,
    sf.disputesOpen, sf.fraudOpen, sf.verificationsPending,
    sf.payoutsPending, sf.emailsDead,
    ws.ordersSubmitted, ws.stockBelowTarget,
  ].filter(n => n > 0).length;

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-white">Overview</h1>
          <p className="text-sm text-neutral-400 mt-1">
            {attention === 0
              ? "All queues clear."
              : `${attention} ${attention === 1 ? "queue" : "queues"} ${verb(attention, "needs", "need")} attention.`}
          </p>
        </div>
      </div>

      {/* Storefront — Critical */}
      <SectionHeading label="Storefront — Critical" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <QueueCard label="Trade-ins: pending quote" count={sf.tradeinsPending}    href="/commerce/trade-ins" urgency="critical" />
        <QueueCard label="Trade-ins: awaiting pay"  count={sf.tradeinsAwaitingPay} href="/commerce/trade-ins" urgency="warning" />
        <QueueCard label="Trade-ins: in flight"     count={sf.tradeinsInflight}    href="/commerce/trade-ins" urgency="info" />
        <QueueCard label="Open disputes"            count={sf.disputesOpen}        href="/trust/disputes"     urgency="critical" />
        <QueueCard label="Fraud signals"            count={sf.fraudOpen}           href="/trust/fraud"        urgency="critical" />
        <QueueCard label="KYC pending"              count={sf.verificationsPending} href="/trust/kyc"         urgency="warning" />
        <QueueCard label="Payouts on hold"          count={sf.payoutsPending}      href="/money/payouts"      urgency="warning" />
        <QueueCard label="Dead email queue"         count={sf.emailsDead}          href="/system/email"       urgency="warning" />
      </div>

      {/* Storefront — Commerce */}
      <SectionHeading label="Storefront — Commerce" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <QueueCard label="Quotes open"        count={sf.quotesOpen}          href="/commerce/trade-ins"  urgency="info" />
        <QueueCard label="Redemptions pending" count={sf.redemptionsPending} href="/commerce/bounty"     urgency="info" />
        <QueueCard label="Live auctions"      count={sf.auctionsLive}        href="/commerce/auctions"   urgency="neutral" />
      </div>

      {/* Wholesale */}
      <SectionHeading label="Wholesale" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <QueueCard label="Orders: submitted"     count={ws.ordersSubmitted}      href="/ops/orders"  urgency="critical" />
        <QueueCard label="Orders: awaiting conf" count={ws.ordersQuoted}         href="/ops/orders"  urgency="warning" />
        <QueueCard label="Stock below target"    count={ws.stockBelowTarget}     href="/ops/stock"   urgency="warning" />
        <QueueCard label="Purchases: review"     count={ws.purchasesPendingReview} href="/ops/orders" urgency="info" />
      </div>
    </div>
  );
}
