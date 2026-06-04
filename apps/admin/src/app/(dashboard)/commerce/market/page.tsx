/**
 * P2P Market — dashboard view
 *
 * Server component. Queries the storefront DB directly for market trade data.
 * The market is the largest user-facing domain (40+ routes) with minimal prior
 * admin tooling. This page surfaces operational visibility:
 *   - Escrow status breakdown
 *   - Trades needing physical CTCG intervention (at CTCG, shipping, disputes)
 *   - Seller payouts outstanding
 *   - Disputed trades requiring resolution
 *
 * Full escrow workflow management remains in storefront at /admin/market.
 *
 * Tables used (storefront):
 *   market_trades  — one row per trade
 *   users          — joined for buyer/seller names
 */

import { sfQuery } from "@/lib/db";
import { Provenance, WhyLink } from "@/lib/ui";

const STOREFRONT_ADMIN = process.env.STOREFRONT_URL ?? "https://cambridgetcg.com";

// ── Helpers ────────────────────────────────────────────────────────────────

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

function fmtGBP(v: string | number | null | undefined): string {
  const n = parseFloat(String(v ?? 0));
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── Data ───────────────────────────────────────────────────────────────────

type EscrowStatus =
  | "awaiting_payment"
  | "paid"
  | "awaiting_shipment"
  | "shipped_to_ctcg"
  | "received_by_ctcg"
  | "verified"
  | "shipped_to_buyer"
  | "completed"
  | "disputed"
  | "refunded"
  | "cancelled";

type EscrowTier = "direct" | "verified" | "full_escrow";

interface TradeRow {
  id: string;
  card_name: string | null;
  sku: string;
  escrow_status: EscrowStatus;
  escrow_tier: EscrowTier | null;
  price: string;
  commission_amount: string;
  seller_payout: string;
  seller_paid_at: string | null;
  seller_name: string | null;
  seller_email: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  tracking_to_ctcg: string | null;
  tracking_to_buyer: string | null;
  dispute_reason: string | null;
  requires_inspection: boolean | null;
  requires_photos: boolean | null;
  created_at: string;
  buyer_paid_at: string | null;
}

interface MarketData {
  available: boolean;
  total: number;
  statusCounts: Record<string, number>;
  tierCounts: Record<string, number>;
  atCtcg: TradeRow[];
  disputed: TradeRow[];
  unpaidSellers: TradeRow[];
  awaitingShipment: TradeRow[];
  recent: TradeRow[];
  totalVolume: number;
  totalCommission: number;
}

async function getMarketData(): Promise<MarketData> {
  // First check if table exists
  const tableCheck = await safe(
    () =>
      sfQuery<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'market_trades'
        ) AS exists
      `),
    { rows: [{ exists: false }] },
  );

  if (!tableCheck.rows[0]?.exists) {
    return {
      available: false,
      total: 0,
      statusCounts: {},
      tierCounts: {},
      atCtcg: [],
      disputed: [],
      unpaidSellers: [],
      awaitingShipment: [],
      recent: [],
      totalVolume: 0,
      totalCommission: 0,
    };
  }

  const rows = await safe(
    () =>
      sfQuery<TradeRow>(`
        SELECT
          t.id,
          t.card_name,
          t.sku,
          t.escrow_status,
          t.escrow_tier,
          t.price,
          t.commission_amount,
          t.seller_payout,
          t.seller_paid_at,
          seller.name AS seller_name,
          seller.email AS seller_email,
          buyer.name AS buyer_name,
          buyer.email AS buyer_email,
          t.tracking_to_ctcg,
          t.tracking_to_buyer,
          t.dispute_reason,
          t.requires_inspection,
          t.requires_photos,
          t.created_at,
          t.buyer_paid_at
        FROM market_trades t
        LEFT JOIN users seller ON seller.id = t.seller_id
        LEFT JOIN users buyer  ON buyer.id  = t.buyer_id
        ORDER BY t.created_at DESC
        LIMIT 500
      `),
    { rows: [] },
  );

  const all = rows.rows;

  const statusCounts: Record<string, number> = {};
  const tierCounts: Record<string, number> = {};
  let totalVolume = 0;
  let totalCommission = 0;

  for (const t of all) {
    statusCounts[t.escrow_status] = (statusCounts[t.escrow_status] ?? 0) + 1;
    if (t.escrow_tier) {
      tierCounts[t.escrow_tier] = (tierCounts[t.escrow_tier] ?? 0) + 1;
    }
    totalVolume += parseFloat(t.price) || 0;
    totalCommission += parseFloat(t.commission_amount) || 0;
  }

  return {
    available: true,
    total: all.length,
    statusCounts,
    tierCounts,
    atCtcg: all.filter(
      (t) => t.escrow_status === "received_by_ctcg" || t.escrow_status === "verified",
    ),
    disputed: all.filter((t) => t.escrow_status === "disputed"),
    unpaidSellers: all.filter(
      (t) =>
        t.escrow_status === "completed" &&
        t.seller_paid_at === null &&
        parseFloat(t.seller_payout) > 0,
    ),
    awaitingShipment: all.filter(
      (t) =>
        t.escrow_tier !== "direct" &&
        (t.escrow_status === "awaiting_shipment" || t.escrow_status === "shipped_to_ctcg"),
    ),
    recent: all.slice(0, 30),
    totalVolume,
    totalCommission,
  };
}

// ── Components ─────────────────────────────────────────────────────────────

const ESCROW_COLORS: Partial<Record<EscrowStatus, string>> = {
  awaiting_payment: "bg-amber-500/20 text-amber-400",
  paid: "bg-blue-500/20 text-blue-400",
  awaiting_shipment: "bg-amber-500/20 text-amber-400",
  shipped_to_ctcg: "bg-blue-500/20 text-blue-400",
  received_by_ctcg: "bg-purple-500/20 text-purple-400",
  verified: "bg-emerald-500/20 text-emerald-400",
  shipped_to_buyer: "bg-emerald-500/20 text-emerald-400",
  completed: "bg-green-500/20 text-green-400",
  disputed: "bg-red-500/20 text-red-400",
  refunded: "bg-red-500/20 text-red-400",
  cancelled: "bg-neutral-500/20 text-neutral-400",
};

const ESCROW_LABELS: Partial<Record<EscrowStatus, string>> = {
  awaiting_payment: "Awaiting Payment",
  paid: "Paid",
  awaiting_shipment: "Awaiting Shipment",
  shipped_to_ctcg: "Shipped to CTCG",
  received_by_ctcg: "At CTCG",
  verified: "Verified",
  shipped_to_buyer: "Shipped to Buyer",
  completed: "Completed",
  disputed: "Disputed",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

const TIER_LABELS: Record<string, string> = {
  direct: "Direct",
  verified: "Verified",
  full_escrow: "Full Escrow",
};

const TIER_COLORS: Record<string, string> = {
  direct: "bg-emerald-500/20 text-emerald-400",
  verified: "bg-blue-500/20 text-blue-400",
  full_escrow: "bg-amber-500/20 text-amber-400",
};

function KpiCard({
  label,
  value,
  sub,
  urgency,
}: {
  label: string;
  value: string | number;
  sub?: string;
  urgency?: "critical" | "warning" | "ok" | "neutral";
}) {
  const valueColor =
    urgency === "critical"
      ? "text-red-400"
      : urgency === "warning"
        ? "text-amber-400"
        : urgency === "ok"
          ? "text-emerald-400"
          : "text-white";

  return (
    <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
      <p className="text-xs text-neutral-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-neutral-500 mt-1">{sub}</p>}
    </div>
  );
}

function TradeTable({
  trades,
  title,
  description,
  emptyMessage,
  showTier = true,
}: {
  trades: TradeRow[];
  title: string;
  description?: string;
  emptyMessage: string;
  showTier?: boolean;
}) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          {title}
          <span className="ml-2 text-neutral-600 font-normal normal-case tracking-normal">
            ({trades.length})
          </span>
        </h2>
        {description && (
          <p className="text-xs text-neutral-600 mt-0.5">{description}</p>
        )}
      </div>

      {trades.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6 text-center">
          <p className="text-neutral-500 text-sm">{emptyMessage}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-900/80">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Card / SKU
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Status
                  </th>
                  {showTier && (
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Tier
                    </th>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Seller → Buyer
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Price
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Date
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {trades.map((t, i) => (
                  <tr
                    key={t.id}
                    className={`border-b border-neutral-800/60 hover:bg-neutral-800/30 transition ${
                      i === trades.length - 1 ? "border-b-0" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="text-white font-medium line-clamp-1">
                        {t.card_name ?? t.sku}
                      </p>
                      {t.card_name && (
                        <p className="text-xs text-neutral-500 font-mono">{t.sku}</p>
                      )}
                      {t.dispute_reason && (
                        <p className="text-xs text-red-400 mt-0.5 line-clamp-1">
                          ⚠ {t.dispute_reason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          ESCROW_COLORS[t.escrow_status] ??
                          "bg-neutral-700 text-neutral-300"
                        }`}
                      >
                        {ESCROW_LABELS[t.escrow_status] ?? t.escrow_status}
                      </span>
                      {t.tracking_to_ctcg && (
                        <p className="text-xs text-neutral-500 mt-0.5 font-mono">
                          Tracking: {t.tracking_to_ctcg}
                        </p>
                      )}
                    </td>
                    {showTier && (
                      <td className="px-4 py-3">
                        {t.escrow_tier ? (
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              TIER_COLORS[t.escrow_tier] ??
                              "bg-neutral-700 text-neutral-300"
                            }`}
                          >
                            {TIER_LABELS[t.escrow_tier] ?? t.escrow_tier}
                          </span>
                        ) : (
                          <span className="text-neutral-500">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <p className="text-neutral-300 text-xs">
                        {t.seller_name ?? "Unknown"}
                      </p>
                      <p className="text-neutral-500 text-xs">→ {t.buyer_name ?? "Unknown"}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-white font-medium">{fmtGBP(t.price)}</p>
                      <p className="text-xs text-neutral-500">
                        fee {fmtGBP(t.commission_amount)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-500 text-xs whitespace-nowrap">
                      {fmtDate(t.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`${STOREFRONT_ADMIN}/admin/market`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 transition whitespace-nowrap"
                      >
                        Manage ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export const metadata = { title: "P2P Market" };

export default async function MarketPage() {
  const d = await getMarketData();

  if (!d.available) {
    return (
      <div className="max-w-lg">
        <div className="flex items-start gap-3 mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white">P2P Market</h1>
            <p className="text-sm text-neutral-400 mt-1">Peer-to-peer trading with escrow.</p>
          </div>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
          <p className="text-sm font-bold text-amber-400 mb-2">Market not yet active</p>
          <p className="text-sm text-neutral-300">
            The <code className="bg-amber-100/10 px-1 rounded text-xs">market_trades</code> table
            does not yet exist in the storefront database. The P2P market feature has not been
            deployed to production.
          </p>
          <a
            href={`${STOREFRONT_ADMIN}/admin/market`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-4 text-sm text-blue-400 hover:text-blue-300 transition"
          >
            Open storefront market admin ↗
          </a>
        </div>
      </div>
    );
  }

  const hasUrgent = d.disputed.length > 0 || d.unpaidSellers.length > 0 || d.atCtcg.length > 0;

  return (
    <div className="max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-white">P2P Market</h1>
            <Provenance kind="live" />
          </div>
          <p className="text-sm text-neutral-400 mt-1">
            {d.total} total trades · {fmtGBP(d.totalVolume)} volume ·{" "}
            {fmtGBP(d.totalCommission)} commission earned
            <WhyLink href="https://cambridgetcg.com/methodology/commission-rate" />
            <WhyLink href="https://cambridgetcg.com/methodology/fees" />
            {hasUrgent ? " — action required." : "."}
          </p>
        </div>
        <a
          href={`${STOREFRONT_ADMIN}/admin/market`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 text-sm bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition"
        >
          Open Admin ↗
        </a>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Total Trades" value={d.total} urgency="neutral" />
        <KpiCard
          label="At CTCG"
          value={d.atCtcg.length}
          sub="needs action"
          urgency={d.atCtcg.length > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          label="Awaiting Shipment"
          value={d.awaitingShipment.length}
          sub="escrow / verified tiers"
          urgency={d.awaitingShipment.length > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          label="Disputed"
          value={d.disputed.length}
          urgency={d.disputed.length > 0 ? "critical" : "neutral"}
        />
        <KpiCard
          label="Seller Payouts Due"
          value={d.unpaidSellers.length}
          urgency={d.unpaidSellers.length > 0 ? "critical" : "neutral"}
        />
      </div>

      {/* Escrow status breakdown */}
      {Object.keys(d.statusCounts).length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">
            By Escrow Status
          </h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(d.statusCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => (
                <span
                  key={status}
                  className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${
                    ESCROW_COLORS[status as EscrowStatus] ??
                    "bg-neutral-800 text-neutral-300"
                  }`}
                >
                  <span>{ESCROW_LABELS[status as EscrowStatus] ?? status}</span>
                  <span className="font-bold">{count}</span>
                </span>
              ))}
          </div>
        </section>
      )}

      {/* Tier breakdown */}
      {Object.keys(d.tierCounts).length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">
            By Escrow Tier
          </h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(d.tierCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([tier, count]) => (
                <span
                  key={tier}
                  className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${
                    TIER_COLORS[tier] ?? "bg-neutral-800 text-neutral-300"
                  }`}
                >
                  <span>{TIER_LABELS[tier] ?? tier}</span>
                  <span className="font-bold">{count}</span>
                </span>
              ))}
          </div>
        </section>
      )}

      {/* Disputed — highest urgency */}
      {d.disputed.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 mb-2">
          <p className="text-sm font-bold text-red-400 mb-1">
            Disputed Trades Require Intervention
          </p>
          <p className="text-sm text-neutral-300">
            {d.disputed.length} trade{d.disputed.length !== 1 ? "s" : ""} in dispute. Each
            requires admin review — either refund or resolve.
          </p>
        </div>
      )}

      {d.disputed.length > 0 && (
        <TradeTable
          trades={d.disputed}
          title="Disputed Trades"
          emptyMessage="No disputed trades."
        />
      )}

      {/* At CTCG */}
      {d.atCtcg.length > 0 && (
        <TradeTable
          trades={d.atCtcg}
          title="At CTCG — Needs Inspection / Verification"
          description="Full-escrow trades with cards physically at CTCG for grading before forwarding to buyer."
          emptyMessage="No cards at CTCG."
        />
      )}

      {/* Awaiting shipment — escrow/verified only */}
      {d.awaitingShipment.length > 0 && (
        <TradeTable
          trades={d.awaitingShipment}
          title="Awaiting Shipment"
          description="Escrow and verified-tier trades waiting for seller to ship."
          emptyMessage="No trades awaiting shipment."
        />
      )}

      {/* Unpaid sellers */}
      {d.unpaidSellers.length > 0 && (
        <TradeTable
          trades={d.unpaidSellers}
          title="Seller Payouts Outstanding"
          description="Completed trades where seller has not yet been paid out."
          emptyMessage="All seller payouts recorded."
        />
      )}

      {/* Recent trades */}
      <TradeTable
        trades={d.recent}
        title="Recent Trades (last 30)"
        emptyMessage="No recent trades."
      />
    </div>
  );
}
