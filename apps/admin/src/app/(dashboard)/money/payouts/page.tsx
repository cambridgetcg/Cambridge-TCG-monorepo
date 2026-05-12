/**
 * Payouts — Dashboard page (kingdom-023, money trinity).
 *
 * Two queues that share a shape: P2P trades and auctions whose buyer has
 * paid and whose escrow has completed but whose seller has not yet been
 * paid out. The legacy chapel at storefront/admin/payouts is the data-shape
 * authority — this page reads the same SQL on the server (Server Component)
 * rather than via four client-side fetches.
 *
 * Substrate honesty:
 *   - The DB rows are live (Storefront RDS, this page-render).
 *   - Stripe balance is NOT yet rendered here — that integration lives in
 *     the legacy admin and would require porting the Stripe SDK + Connect
 *     helpers. The header banner names that gap and links out.
 *   - The "Pay via Connect" affordance is similarly *announced* but routed
 *     to the legacy admin — recording a manual payout is fully migrated.
 *
 * Methodology:
 *   - Hold-day formula at /methodology/payout-holds (Trust × Tier table).
 *
 * Connections:
 *   - Sister to /money/chargebacks (kingdom-022) — same Manager/Dashboard
 *     pattern, same adminAction wrapper.
 *   - Deep-links sellers to /catalog/users/[id] (the keystone hub).
 */

import * as React from "react";
import Link from "next/link";
import { sfQuery } from "@/lib/db";
import { fmtDate, fmtDateTime, fmtGBP } from "@/lib/format";
import {
  PageHeader,
  DataTable,
  KpiGrid,
  KpiCard,
  SectionHeading,
  Provenance,
  Verifiability,
  WhyLink,
  ExternalLink,
  StatusBadge,
  type Column,
  type Tone,
} from "@/lib/ui";
import { PayoutActions } from "./_components";

export const metadata = { title: "Payouts" };

const HISTORY_LIMIT = 50;
const STATS_WINDOW_DAYS = 7;

interface OutstandingRow {
  kind: "trade" | "auction";
  id: string;
  amount: string;
  payout_hold_days: number;
  label: string;
  seller_id: string;
  seller_email: string;
  seller_name: string | null;
  has_connect: boolean;
  connect_ready: boolean;
  connect_status: string | null;
  available_at: string | null;
}

interface HistoryRow {
  kind: "trade" | "auction";
  id: string;
  seller_paid_at: string;
  payout_method: string | null;
  payout_reference: string | null;
  stripe_transfer_id: string | null;
  amount: string;
  label: string;
  seller_id: string;
  seller_email: string;
}

interface StatsRow {
  paid_count: string;
  paid_total: string;
  commission_total: string;
  avg_secs: string;
  outstanding_count: string;
  outstanding_total: string;
}

const METHOD_PALETTE: Record<string, Tone> = {
  stripe_connect: "emerald",
  bank_transfer: "blue",
  paypal: "blue",
  crypto: "amber",
  store_credit: "neutral",
  other: "neutral",
};

const METHOD_LABELS: Record<string, string> = {
  stripe_connect: "Stripe Connect",
  bank_transfer: "Bank Transfer",
  paypal: "PayPal",
  crypto: "Crypto",
  store_credit: "Store Credit",
  other: "Other",
};

export default async function Page() {
  const [outstandingRes, historyRes, statsRes] = await Promise.all([
    sfQuery<OutstandingRow>(
      `SELECT 'trade' AS kind, t.id::text AS id,
              t.seller_payout::text AS amount,
              COALESCE(t.payout_hold_days, 0) AS payout_hold_days,
              COALESCE(o.card_name, t.sku) AS label,
              t.seller_id::text AS seller_id,
              su.email AS seller_email, su.name AS seller_name,
              (su.stripe_connect_account_id IS NOT NULL) AS has_connect,
              COALESCE(su.stripe_connect_payouts_enabled, false) AS connect_ready,
              su.stripe_connect_status AS connect_status,
              (t.completed_at + make_interval(days => COALESCE(t.payout_hold_days, 0)))::text AS available_at
         FROM market_trades t
         JOIN users su ON su.id = t.seller_id
         LEFT JOIN market_orders o ON o.id = t.bid_order_id
        WHERE t.escrow_status = 'completed'
          AND t.seller_paid_at IS NULL
          AND t.completed_at IS NOT NULL
       UNION ALL
       SELECT 'auction' AS kind, a.id::text AS id,
              a.seller_payout::text AS amount,
              3 AS payout_hold_days,
              a.title AS label,
              a.seller_user_id::text AS seller_id,
              su.email AS seller_email, su.name AS seller_name,
              (su.stripe_connect_account_id IS NOT NULL) AS has_connect,
              COALESCE(su.stripe_connect_payouts_enabled, false) AS connect_ready,
              su.stripe_connect_status AS connect_status,
              (a.paid_at + make_interval(days => 3))::text AS available_at
         FROM auctions a
         JOIN users su ON su.id = a.seller_user_id
        WHERE a.status = 'paid'
          AND a.seller_paid_at IS NULL
          AND a.seller_payout IS NOT NULL
          AND a.paid_at IS NOT NULL
       ORDER BY available_at NULLS LAST`,
    ),
    sfQuery<HistoryRow>(
      `SELECT * FROM (
         SELECT 'trade' AS kind, t.id::text AS id,
                t.seller_paid_at::text AS seller_paid_at,
                t.payout_method, t.payout_reference, t.stripe_transfer_id,
                t.seller_payout::text AS amount,
                COALESCE(o.card_name, t.sku) AS label,
                t.seller_id::text AS seller_id, su.email AS seller_email
           FROM market_trades t
           JOIN users su ON su.id = t.seller_id
           LEFT JOIN market_orders o ON o.id = t.bid_order_id
          WHERE t.seller_paid_at IS NOT NULL
         UNION ALL
         SELECT 'auction' AS kind, a.id::text AS id,
                a.seller_paid_at::text AS seller_paid_at,
                a.payout_method, a.payout_reference, a.stripe_transfer_id,
                a.seller_payout::text AS amount,
                a.title AS label,
                a.seller_user_id::text AS seller_id, su.email AS seller_email
           FROM auctions a
           JOIN users su ON su.id = a.seller_user_id
          WHERE a.seller_paid_at IS NOT NULL
            AND a.seller_user_id IS NOT NULL
       ) AS u
       ORDER BY seller_paid_at DESC
       LIMIT ${HISTORY_LIMIT}`,
    ),
    sfQuery<StatsRow>(
      `WITH paid_trades AS (
         SELECT seller_payout::numeric AS payout,
                COALESCE(commission_amount, 0)::numeric AS commission,
                EXTRACT(EPOCH FROM (seller_paid_at - completed_at)) AS secs
           FROM market_trades
          WHERE seller_paid_at IS NOT NULL
            AND seller_paid_at > NOW() - make_interval(days => $1)
       ),
       paid_auctions AS (
         SELECT seller_payout::numeric AS payout,
                (current_price::numeric - seller_payout::numeric) AS commission,
                EXTRACT(EPOCH FROM (seller_paid_at - paid_at)) AS secs
           FROM auctions
          WHERE seller_paid_at IS NOT NULL
            AND seller_paid_at > NOW() - make_interval(days => $1)
            AND seller_user_id IS NOT NULL
       ),
       outstanding AS (
         SELECT seller_payout::numeric AS payout FROM market_trades
          WHERE escrow_status = 'completed'
            AND seller_paid_at IS NULL
            AND completed_at IS NOT NULL
         UNION ALL
         SELECT seller_payout::numeric FROM auctions
          WHERE status = 'paid'
            AND seller_paid_at IS NULL
            AND seller_payout IS NOT NULL
            AND paid_at IS NOT NULL
            AND seller_user_id IS NOT NULL
       ),
       combined AS (SELECT * FROM paid_trades UNION ALL SELECT * FROM paid_auctions)
       SELECT
         (SELECT COUNT(*) FROM combined)::text AS paid_count,
         (SELECT COALESCE(SUM(payout), 0) FROM combined)::text AS paid_total,
         (SELECT COALESCE(SUM(commission), 0) FROM combined)::text AS commission_total,
         (SELECT COALESCE(AVG(secs), 0) FROM combined)::text AS avg_secs,
         (SELECT COUNT(*) FROM outstanding)::text AS outstanding_count,
         (SELECT COALESCE(SUM(payout), 0) FROM outstanding)::text AS outstanding_total`,
      [STATS_WINDOW_DAYS],
    ),
  ]);

  const stats = statsRes.rows[0] ?? {
    paid_count: "0", paid_total: "0", commission_total: "0",
    avg_secs: "0", outstanding_count: "0", outstanding_total: "0",
  };

  const now = Date.now();
  const outstanding = [...outstandingRes.rows]
    .map((r) => ({
      ...r,
      dueNow: r.available_at ? new Date(r.available_at).getTime() <= now : true,
    }))
    .sort((a, b) => {
      if (a.dueNow !== b.dueNow) return a.dueNow ? -1 : 1;
      const ax = a.available_at ? new Date(a.available_at).getTime() : 0;
      const bx = b.available_at ? new Date(b.available_at).getTime() : 0;
      return ax - bx;
    });

  const overdueCount = outstanding.filter((r) => r.dueNow).length;
  const avgHours = parseFloat(stats.avg_secs) / 3600;

  const outstandingColumns: Column<typeof outstanding[number]>[] = [
    {
      key: "kind",
      header: "Kind",
      cellClass: "text-xs uppercase text-neutral-400",
      render: (r) => r.kind,
    },
    {
      key: "label",
      header: "Item",
      render: (r) => (
        <Link
          href={r.kind === "trade" ? `/commerce/market?tradeId=${r.id}` : `/commerce/auctions?id=${r.id}`}
          className="text-white hover:text-amber-300 truncate max-w-[260px] inline-block"
        >
          {r.label}
        </Link>
      ),
    },
    {
      key: "seller",
      header: "Seller",
      render: (r) => (
        <Link
          href={`/catalog/users/${r.seller_id}`}
          className="text-neutral-200 hover:text-white truncate max-w-[180px] inline-block"
        >
          {r.seller_name ?? r.seller_email}
        </Link>
      ),
    },
    {
      key: "connect",
      header: "Connect",
      render: (r) =>
        r.connect_ready ? (
          <span className="text-xs text-emerald-400">Ready</span>
        ) : r.has_connect ? (
          <span className="text-xs text-amber-400">{r.connect_status ?? "incomplete"}</span>
        ) : (
          <span className="text-xs text-neutral-500">Not connected</span>
        ),
      hideOnMobile: true,
    },
    {
      key: "available",
      header: "Available",
      cellClass: "text-xs whitespace-nowrap",
      render: (r) => {
        if (!r.available_at) return <span className="text-amber-400">now</span>;
        if (r.dueNow) return <span className="text-amber-400 font-medium">now</span>;
        return <span className="text-neutral-400">{fmtDate(r.available_at)}</span>;
      },
      hideOnMobile: true,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (r) => <span className="font-mono">{fmtGBP(r.amount)}</span>,
    },
    {
      key: "action",
      header: "",
      align: "right",
      render: (r) => (
        <PayoutActions
          payout={{
            kind: r.kind,
            id: r.id,
            label: r.label,
            connectReady: r.connect_ready,
            dueNow: r.dueNow,
          }}
        />
      ),
    },
  ];

  const historyColumns: Column<HistoryRow>[] = [
    {
      key: "when",
      header: "When",
      cellClass: "text-xs text-neutral-400 whitespace-nowrap",
      render: (r) => fmtDateTime(r.seller_paid_at),
    },
    {
      key: "kind",
      header: "Kind",
      cellClass: "text-xs uppercase text-neutral-400",
      render: (r) => r.kind,
      hideOnMobile: true,
    },
    {
      key: "label",
      header: "Item",
      render: (r) => (
        <span className="text-white truncate max-w-[220px] inline-block">{r.label}</span>
      ),
    },
    {
      key: "seller",
      header: "Seller",
      render: (r) => (
        <Link
          href={`/catalog/users/${r.seller_id}`}
          className="text-neutral-200 hover:text-white truncate max-w-[160px] inline-block"
        >
          {r.seller_email}
        </Link>
      ),
      hideOnMobile: true,
    },
    {
      key: "method",
      header: "Method",
      render: (r) =>
        r.payout_method ? (
          <StatusBadge
            status={r.payout_method}
            palette={METHOD_PALETTE}
            label={METHOD_LABELS[r.payout_method] ?? r.payout_method}
          />
        ) : (
          <span className="text-neutral-600">—</span>
        ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (r) => <span className="font-mono">{fmtGBP(r.amount)}</span>,
    },
    {
      key: "ref",
      header: "Reference",
      cellClass: "text-xs",
      render: (r) => {
        if (r.stripe_transfer_id) {
          return (
            <Verifiability
              source="Stripe"
              id={r.stripe_transfer_id}
              href={`https://dashboard.stripe.com/connect/transfers/${r.stripe_transfer_id}`}
            />
          );
        }
        if (r.payout_reference) {
          return <span className="font-mono text-neutral-400 truncate max-w-[200px] inline-block">{r.payout_reference}</span>;
        }
        return <span className="text-neutral-600">—</span>;
      },
      hideOnMobile: true,
    },
  ];

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        title="Payouts"
        provenance={<Provenance kind="live" source="Storefront RDS" />}
        description="Sellers awaiting payout (P2P trades + auctions) and recent payout history. Hold days are derived from the seller's trust tier; auction holds are a flat 3 days."
        action={
          <ExternalLink href="https://cambridgetcg.com/admin/payouts" variant="primary">
            Stripe balance + Connect
          </ExternalLink>
        }
      />

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-xs text-amber-200/80 flex items-center justify-between gap-3 flex-wrap">
        <span>
          Stripe balance and Connect transfers still happen in the legacy admin.
          Recording manual payouts (bank, PayPal, crypto, store credit, other)
          is fully migrated here.
        </span>
        <WhyLink
          href="https://cambridgetcg.com/methodology/payout-holds"
          label="How are hold days set?"
        />
      </div>

      <KpiGrid cols={5}>
        <KpiCard
          label="Outstanding"
          value={stats.outstanding_count}
          urgency={overdueCount > 0 ? "critical" : parseInt(stats.outstanding_count, 10) > 0 ? "warning" : "ok"}
          sub={overdueCount > 0 ? `${overdueCount} due now` : undefined}
        />
        <KpiCard
          label="Outstanding Owed"
          value={fmtGBP(stats.outstanding_total)}
          urgency={parseFloat(stats.outstanding_total) > 0 ? "warning" : "ok"}
        />
        <KpiCard
          label={`Paid (${STATS_WINDOW_DAYS}d)`}
          value={fmtGBP(stats.paid_total)}
          sub={`${stats.paid_count} payouts`}
          urgency="ok"
        />
        <KpiCard
          label={`Commission (${STATS_WINDOW_DAYS}d)`}
          value={fmtGBP(stats.commission_total)}
          urgency="ok"
        />
        <KpiCard
          label="Avg turnaround"
          value={avgHours > 0 ? `${avgHours.toFixed(1)}h` : "—"}
          sub="completed → paid"
          urgency="ok"
        />
      </KpiGrid>

      <section>
        <SectionHeading count={outstanding.length}>Outstanding</SectionHeading>
        <DataTable
          columns={outstandingColumns}
          rows={outstanding}
          rowKey={(r) => `${r.kind}:${r.id}`}
          emptyMessage="No outstanding payouts."
          minWidth={840}
        />
      </section>

      <section>
        <SectionHeading count={historyRes.rows.length}>
          Recent payouts
        </SectionHeading>
        <DataTable
          columns={historyColumns}
          rows={historyRes.rows}
          rowKey={(r) => `${r.kind}:${r.id}`}
          emptyMessage="No payouts recorded yet."
          minWidth={760}
        />
        {historyRes.rows.length === HISTORY_LIMIT && (
          <p className="mt-2 text-xs text-neutral-500">
            Showing latest {HISTORY_LIMIT}. CSV export still lives in the legacy admin.
          </p>
        )}
      </section>
    </div>
  );
}
