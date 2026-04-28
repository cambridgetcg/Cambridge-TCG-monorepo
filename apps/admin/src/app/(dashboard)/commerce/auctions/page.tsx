/**
 * Auctions — dashboard view
 *
 * Server component. Queries storefront DB directly.
 * Auction lifecycle management (create, approve, payout) stays in storefront admin.
 *
 * Tables used (storefront):
 *   auctions  — one row per auction
 */

import { sfQuery } from "@/lib/db";

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

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Data ───────────────────────────────────────────────────────────────────

interface AuctionRow {
  id: string;
  title: string;
  auction_type: string;
  status: string;
  current_price: string;
  starting_price: string;
  buy_now_price: string | null;
  bid_count: number;
  starts_at: string;
  ends_at: string;
  image_url: string | null;
  approval_status: string | null;
  seller_user_id: string | null;
  seller_name: string | null;
  seller_paid_at: string | null;
}

interface AuctionData {
  total: number;
  live: AuctionRow[];
  pendingReview: AuctionRow[];
  ended: AuctionRow[];
  unpaidSellers: AuctionRow[];
  scheduled: AuctionRow[];
  statusCounts: Record<string, number>;
}

async function getAuctionData(): Promise<AuctionData> {
  const rows = await safe(
    () =>
      sfQuery<AuctionRow>(`
        SELECT
          a.id,
          a.title,
          a.auction_type,
          a.status,
          a.current_price,
          a.starting_price,
          a.buy_now_price,
          a.bid_count,
          a.starts_at,
          a.ends_at,
          a.image_url,
          a.approval_status,
          a.seller_user_id,
          u.name AS seller_name,
          a.seller_paid_at
        FROM auctions a
        LEFT JOIN users u ON u.id = a.seller_user_id
        ORDER BY a.ends_at DESC
        LIMIT 200
      `),
    { rows: [] },
  );

  const all = rows.rows;

  const statusCounts: Record<string, number> = {};
  for (const a of all) {
    statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1;
  }

  return {
    total: all.length,
    live: all.filter((a) => a.status === "live"),
    pendingReview: all.filter((a) => a.approval_status === "pending_review"),
    ended: all.filter((a) => a.status === "ended"),
    unpaidSellers: all.filter(
      (a) => a.seller_user_id !== null && a.status === "paid" && !a.seller_paid_at,
    ),
    scheduled: all.filter((a) => a.status === "scheduled"),
    statusCounts,
  };
}

// ── Components ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-neutral-500/20 text-neutral-400",
  scheduled: "bg-blue-500/20 text-blue-400",
  live: "bg-emerald-500/20 text-emerald-400",
  ended: "bg-amber-500/20 text-amber-400",
  paid: "bg-green-500/20 text-green-400",
  cancelled: "bg-red-500/20 text-red-400",
};

const TYPE_LABELS: Record<string, string> = {
  english: "English",
  dutch: "Dutch",
  buy_now: "Buy Now",
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

function AuctionTable({
  auctions,
  title,
  emptyMessage,
}: {
  auctions: AuctionRow[];
  title: string;
  emptyMessage: string;
}) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">
        {title}
        <span className="ml-2 text-neutral-600 font-normal normal-case tracking-normal">
          ({auctions.length})
        </span>
      </h2>

      {auctions.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6 text-center">
          <p className="text-neutral-500 text-sm">{emptyMessage}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-900/80">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Auction
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Type / Status
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Current
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Bids
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Ends
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {auctions.map((a, i) => (
                  <tr
                    key={a.id}
                    className={`border-b border-neutral-800/60 hover:bg-neutral-800/30 transition ${
                      i === auctions.length - 1 ? "border-b-0" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {a.image_url ? (
                          <img
                            src={a.image_url}
                            alt=""
                            className="w-9 h-9 rounded object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 bg-neutral-800 rounded shrink-0" />
                        )}
                        <div>
                          <p className="text-white font-medium line-clamp-1">{a.title}</p>
                          {a.seller_name && (
                            <p className="text-xs text-neutral-500">
                              Seller: {a.seller_name}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            STATUS_COLORS[a.status] ?? "bg-neutral-700 text-neutral-300"
                          }`}
                        >
                          {a.status}
                        </span>
                        {a.approval_status === "pending_review" && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                            needs review
                          </span>
                        )}
                        <span className="text-xs text-neutral-500">
                          {TYPE_LABELS[a.auction_type] ?? a.auction_type}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-white whitespace-nowrap">
                      {fmtGBP(a.current_price)}
                      {a.buy_now_price && (
                        <p className="text-xs text-neutral-500">
                          BIN {fmtGBP(a.buy_now_price)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-neutral-300">{a.bid_count}</td>
                    <td className="px-4 py-3 text-right text-neutral-400 whitespace-nowrap text-xs">
                      {fmtDateTime(a.ends_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`${STOREFRONT_ADMIN}/admin/auctions`}
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

export const metadata = { title: "Auctions" };

export default async function AuctionsPage() {
  const d = await getAuctionData();

  return (
    <div className="max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Auctions</h1>
          <p className="text-sm text-neutral-400 mt-1">
            {d.live.length > 0
              ? `${d.live.length} live auction${d.live.length !== 1 ? "s" : ""} running.`
              : "No live auctions."}
            {d.pendingReview.length > 0
              ? ` ${d.pendingReview.length} consignment${d.pendingReview.length !== 1 ? "s" : ""} pending review.`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`${STOREFRONT_ADMIN}/admin/auctions/new`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-sm bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition"
          >
            + New ↗
          </a>
          <a
            href={`${STOREFRONT_ADMIN}/admin/auctions`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-sm bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition"
          >
            Open Admin ↗
          </a>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Live"
          value={d.live.length}
          urgency={d.live.length > 0 ? "ok" : "neutral"}
        />
        <KpiCard
          label="Scheduled"
          value={d.scheduled.length}
          urgency="neutral"
        />
        <KpiCard
          label="Ended"
          value={d.ended.length}
          sub="awaiting payment"
          urgency={d.ended.length > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          label="Pending Review"
          value={d.pendingReview.length}
          sub="consignments"
          urgency={d.pendingReview.length > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          label="Seller Payouts Due"
          value={d.unpaidSellers.length}
          sub="awaiting disbursement"
          urgency={d.unpaidSellers.length > 0 ? "critical" : "neutral"}
        />
      </div>

      {/* Status summary pills */}
      {Object.keys(d.statusCounts).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(d.statusCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([status, count]) => (
              <span
                key={status}
                className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${
                  STATUS_COLORS[status] ?? "bg-neutral-800 text-neutral-300"
                }`}
              >
                <span>{status}</span>
                <span className="font-bold">{count}</span>
              </span>
            ))}
        </div>
      )}

      {/* Live auctions */}
      {d.live.length > 0 && (
        <AuctionTable
          auctions={d.live}
          title="Live Now"
          emptyMessage="No live auctions."
        />
      )}

      {/* Pending review */}
      {d.pendingReview.length > 0 && (
        <>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-sm font-bold text-amber-400 mb-1">
              Consignments Pending Review
            </p>
            <p className="text-sm text-neutral-300">
              {d.pendingReview.length} customer-submitted auction
              {d.pendingReview.length !== 1 ? "s" : ""} need approval before going live.
            </p>
          </div>
          <AuctionTable
            auctions={d.pendingReview}
            title="Needs Approval"
            emptyMessage="No pending reviews."
          />
        </>
      )}

      {/* Ended auctions */}
      {d.ended.length > 0 && (
        <AuctionTable
          auctions={d.ended}
          title="Ended — Awaiting Payment"
          emptyMessage="No ended auctions awaiting payment."
        />
      )}

      {/* Unpaid sellers */}
      {d.unpaidSellers.length > 0 && (
        <AuctionTable
          auctions={d.unpaidSellers}
          title="Seller Payouts Outstanding"
          emptyMessage="All seller payouts recorded."
        />
      )}

      {/* Scheduled */}
      {d.scheduled.length > 0 && (
        <AuctionTable
          auctions={d.scheduled}
          title="Scheduled"
          emptyMessage="No scheduled auctions."
        />
      )}
    </div>
  );
}
