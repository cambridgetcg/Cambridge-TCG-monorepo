/**
 * B2C customer orders page.
 *
 * Reads `customer_orders` from the storefront DB. The biggest gap Love
 * named in the dashboard plan: API routes existed for B2C orders
 * (`/api/admin/orders/*`) but no admin UI ever did. This page closes that.
 *
 * Filters via URL params: ?q=<email-substring>&status=<one>&page=<n>
 */
import { sfQuery } from "@/lib/db";
import Link from "next/link";

// Root layout's title template appends "— Cambridge TCG Admin"; don't double it.
export const metadata = { title: "Orders (B2C)" };

interface CustomerOrderRow {
  id: number;
  stripe_session_id: string;
  customer_email: string;
  customer_name: string;
  status: string;
  total_gbp: string;
  currency: string;
  shipping_address: string | null;
  tracking_number: string | null;
  carrier: string | null;
  created_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
  items: unknown;
}

interface CountByStatus {
  status: string;
  count: string;
}

const PAGE_SIZE = 50;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = sp.status ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const where: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (q) {
    where.push(`(customer_email ILIKE $${i} OR customer_name ILIKE $${i} OR stripe_session_id = $${i + 1})`);
    params.push(`%${q}%`, q);
    i += 2;
  }
  if (status) {
    where.push(`status = $${i}`);
    params.push(status);
    i += 1;
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rowsResult, totalResult, byStatusResult] = await Promise.all([
    sfQuery<CustomerOrderRow>(
      `SELECT id, stripe_session_id, customer_email, customer_name, status,
              total_gbp::text, currency, shipping_address, tracking_number,
              carrier, created_at, shipped_at, delivered_at, items
         FROM customer_orders
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      params,
    ),
    sfQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM customer_orders ${whereSql}`,
      params,
    ),
    sfQuery<CountByStatus>(
      `SELECT status, COUNT(*)::text AS count FROM customer_orders GROUP BY status ORDER BY count DESC`,
      [],
    ),
  ]);
  const total = parseInt(totalResult.rows[0]?.count ?? "0", 10);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    if (q && overrides.q !== "") next.set("q", overrides.q ?? q);
    const newStatus = overrides.status !== undefined ? overrides.status : status;
    if (newStatus) next.set("status", newStatus);
    const newPage = overrides.page ?? String(page);
    if (newPage !== "1") next.set("page", newPage);
    const qs = next.toString();
    return `/ops/orders${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-white">Orders (B2C)</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Customer orders from cambridgetcg.com — Stripe-backed, paid + shipped lifecycle.
        </p>
      </header>

      {/* Status pills */}
      <nav className="flex flex-wrap gap-2 text-sm">
        <Link
          href={buildHref({ status: "", page: "1" })}
          className={`px-3 py-1 rounded-full border ${
            !status
              ? "border-blue-500 bg-blue-500/10 text-blue-300"
              : "border-neutral-800 text-neutral-400 hover:border-neutral-700"
          }`}
        >
          All ({byStatusResult.rows.reduce((s, r) => s + parseInt(r.count, 10), 0)})
        </Link>
        {byStatusResult.rows.map((r) => (
          <Link
            key={r.status}
            href={buildHref({ status: r.status, page: "1" })}
            className={`px-3 py-1 rounded-full border ${
              status === r.status
                ? "border-blue-500 bg-blue-500/10 text-blue-300"
                : "border-neutral-800 text-neutral-400 hover:border-neutral-700"
            }`}
          >
            {r.status} ({r.count})
          </Link>
        ))}
      </nav>

      {/* Search */}
      <form className="flex gap-2" action="/ops/orders">
        {status && <input type="hidden" name="status" value={status} />}
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by email, name, or Stripe session ID"
          className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-md text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-md transition-colors"
        >
          Search
        </button>
        {q && (
          <Link
            href={buildHref({ q: "", page: "1" })}
            className="px-4 py-2 border border-neutral-800 text-neutral-400 hover:text-white text-sm rounded-md transition-colors"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Results */}
      <div className="rounded-lg border border-neutral-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-neutral-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-3 py-2">Order</th>
              <th className="text-left px-3 py-2">Customer</th>
              <th className="text-left px-3 py-2">Total</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Tracking</th>
              <th className="text-left px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {rowsResult.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-neutral-500">
                  No orders match the current filter.
                </td>
              </tr>
            ) : (
              rowsResult.rows.map((r) => {
                const items = (r.items ?? []) as Array<{ sku: string; qty: number; name?: string }>;
                const itemCount = Array.isArray(items)
                  ? items.reduce((s, it) => s + (it.qty ?? 1), 0)
                  : 0;
                const date = new Date(r.created_at);
                return (
                  <tr key={r.id} className="hover:bg-neutral-900/50">
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs text-neutral-400">#{r.id}</div>
                      <div className="text-xs text-neutral-500" title={r.stripe_session_id}>
                        {itemCount} item{itemCount === 1 ? "" : "s"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-white">{r.customer_name || "—"}</div>
                      <div className="text-xs text-neutral-500">{r.customer_email}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-white">
                      £{parseFloat(r.total_gbp).toFixed(2)}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.tracking_number ? (
                        <>
                          <div className="font-mono text-white">{r.tracking_number}</div>
                          {r.carrier && (
                            <div className="text-neutral-500">{r.carrier}</div>
                          )}
                        </>
                      ) : (
                        <span className="text-neutral-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-400">
                      {date.toLocaleDateString()} {date.toLocaleTimeString().slice(0, 5)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500">
            Showing {offset + 1}–{Math.min(offset + rowsResult.rows.length, total)} of{" "}
            {total.toLocaleString()}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildHref({ page: String(page - 1) })}
                className="px-3 py-1 border border-neutral-800 hover:border-neutral-700 text-white rounded"
              >
                ← Prev
              </Link>
            )}
            <span className="px-3 py-1 text-neutral-400">
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={buildHref({ page: String(page + 1) })}
                className="px-3 py-1 border border-neutral-800 hover:border-neutral-700 text-white rounded"
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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    shipped: "bg-blue-500/10 text-blue-300 border-blue-500/20",
    delivered: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    pending: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    refunded: "bg-neutral-500/10 text-neutral-300 border-neutral-500/20",
    cancelled: "bg-red-500/10 text-red-300 border-red-500/20",
  };
  const cls = colors[status] ?? "bg-neutral-500/10 text-neutral-300 border-neutral-500/20";
  return (
    <span className={`inline-block px-2 py-0.5 text-xs border rounded ${cls}`}>
      {status}
    </span>
  );
}
