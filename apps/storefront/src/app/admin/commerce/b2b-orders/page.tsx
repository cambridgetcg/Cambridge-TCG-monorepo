/**
 * /admin/commerce/b2b-orders — operator console for B2B orders.
 *
 * Phase 5 of the wholesale consolidation. Lists every b2b_orders row
 * with the buyer's email, status, item count, total, age. Operators
 * advance status via the per-row buttons (paid → allocated → shipped
 * → delivered) or cancel/refund.
 *
 * Filter pills by status. Default view is "open" (paid / allocated /
 * shipped) — the queue the operator is actually working.
 *
 * Auth: /admin/layout.tsx already calls requireAdminPage(). This page
 * reads sfQuery (the page lives in the storefront app; b2b_orders is
 * a storefront RDS table).
 *
 * Companion to:
 *   - apps/storefront/drizzle/0101_b2b_orders.sql — schema
 *   - apps/storefront/src/lib/b2b/orders.ts — buyer-facing reads
 *   - apps/storefront/src/app/admin/commerce/b2b-orders/_actions.ts
 */

import type { Metadata } from "next";
import Link from "next/link";
import { sfQuery } from "@/lib/admin/db";
import { PageHeader, FilterPills, DataTable, Provenance } from "@/lib/admin/ui";
import { fmtGBP, fmtDateTime, fmtRelative } from "@/lib/format";

export const metadata = { title: "B2B orders" };

const PAGE_SIZE = 50;

interface OrderRow {
  id: number;
  user_id: string;
  customer_email: string | null;
  buyer_email: string | null;
  total_pence: number;
  currency: string;
  status: string;
  item_count: number;
  sku_count: number;
  created_at: string;
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "paid", label: "Paid" },
  { value: "allocated", label: "Allocated" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
  { value: "", label: "All" },
];

export default async function B2BOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "open";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // status='open' is a derived filter, not a column value. Translate.
  let statusClause = "";
  const params: unknown[] = [];
  if (status === "open") {
    statusClause = `WHERE status IN ('paid', 'allocated', 'shipped')`;
  } else if (status && status !== "" && STATUS_FILTERS.some((f) => f.value === status)) {
    statusClause = `WHERE status = $1`;
    params.push(status);
  }

  const orders = await sfQuery<OrderRow>(
    `SELECT
       b.id,
       b.user_id,
       b.customer_email,
       u.email AS buyer_email,
       b.total_pence,
       b.currency,
       b.status,
       (SELECT COALESCE(SUM((i->>'qty')::int), 0)
          FROM jsonb_array_elements(b.items) i)::int AS item_count,
       jsonb_array_length(b.items)::int AS sku_count,
       b.created_at::text AS created_at
     FROM b2b_orders b
     LEFT JOIN users u ON u.id = b.user_id
     ${statusClause}
     ORDER BY b.created_at DESC
     LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    params,
  );

  const countRow = await sfQuery<{ n: number }>(
    `SELECT count(*)::int AS n FROM b2b_orders ${statusClause}`,
    params,
  );
  const total = countRow.rows[0]?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Facet counts for the pills (always-on, ignoring current filter).
  const facets = await sfQuery<{ status: string; n: number }>(
    `SELECT status, count(*)::int AS n FROM b2b_orders GROUP BY status`,
  );
  const facetMap = new Map(facets.rows.map((r) => [r.status, r.n]));
  const openTotal =
    (facetMap.get("paid") ?? 0) +
    (facetMap.get("allocated") ?? 0) +
    (facetMap.get("shipped") ?? 0);
  const allTotal = Array.from(facetMap.values()).reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="B2B orders"
        description="Wholesale-channel orders. Status transitions are operator-driven."
        action={<Provenance kind="live" source="b2b_orders" />}
      />

      <FilterPills
        selected={status}
        pills={STATUS_FILTERS.map((f) => ({
          value: f.value,
          label: f.label,
          count:
            f.value === "open"
              ? openTotal
              : f.value === ""
                ? allTotal
                : facetMap.get(f.value) ?? 0,
          href:
            f.value === "open"
              ? `/admin/commerce/b2b-orders`
              : `/admin/commerce/b2b-orders?status=${encodeURIComponent(f.value)}`,
        }))}
      />

      <DataTable
        columns={[
          {
            key: "id",
            header: "Order",
            render: (r: OrderRow) => (
              <Link href={`/admin/commerce/b2b-orders/${r.id}`} className="text-accent-strong hover:underline font-mono text-xs">
                #{r.id}
              </Link>
            ),
          },
          {
            key: "buyer",
            header: "Buyer",
            render: (r: OrderRow) => (
              <span className="text-xs">{r.buyer_email ?? r.customer_email ?? "—"}</span>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (r: OrderRow) => (
              <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-surface-elevated text-ink">
                {r.status}
              </span>
            ),
          },
          {
            key: "items",
            header: "Items",
            render: (r: OrderRow) => (
              <span className="font-mono text-xs">{r.item_count}/{r.sku_count}</span>
            ),
          },
          {
            key: "total",
            header: "Total",
            align: "right",
            render: (r: OrderRow) => (
              <span className="font-mono">{fmtGBP(r.total_pence / 100)}</span>
            ),
          },
          {
            key: "created",
            header: "Created",
            render: (r: OrderRow) => (
              <span className="text-xs text-ink-muted" title={fmtDateTime(r.created_at)}>
                {fmtRelative(r.created_at)}
              </span>
            ),
          },
        ]}
        rows={orders.rows}
        rowKey={(r) => String(r.id)}
        empty={total === 0 ? "No B2B orders match this filter." : undefined}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-ink-faint">
            Page {page} of {totalPages} · {total} order{total === 1 ? "" : "s"}
          </div>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/commerce/b2b-orders?${new URLSearchParams({ ...(status !== "open" ? { status } : {}), page: String(page - 1) }).toString()}`}
                className="rounded border border-border-strong px-3 py-1 hover:border-accent"
              >
                ← Prev
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/commerce/b2b-orders?${new URLSearchParams({ ...(status !== "open" ? { status } : {}), page: String(page + 1) }).toString()}`}
                className="rounded border border-border-strong px-3 py-1 hover:border-accent"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
