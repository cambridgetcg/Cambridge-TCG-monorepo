/**
 * Trade-Ins — dashboard view
 *
 * Read-only server component. Queries the storefront DB directly to surface
 * queue counts and recent submissions. Action workflows (quoting, grading,
 * paying out) remain in the storefront admin at /admin/trade-ins.
 *
 * Tables used (storefront):
 *   tradein_submissions  — one row per submission
 *   tradein_submission_items — items per submission
 *   quote_requests        — custom photo-quote requests
 */

import { sfQuery } from "@/lib/db";
import Link from "next/link";
import { Provenance } from "@/lib/ui";

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

// ── Data fetching ──────────────────────────────────────────────────────────

interface StatusCount {
  status: string;
  n: number;
}

interface RecentSubmission {
  reference: string;
  status: string;
  customer_name: string;
  customer_email: string;
  payment_method: string;
  delivery_method: string;
  quoted_cash_total: string | null;
  quoted_credit_total: string | null;
  final_total: string | null;
  item_count: number;
  created_at: string;
}

interface QueueSummary {
  needsQuote: number;
  awaitingResponse: number;
  inFlight: number;
  readyToPay: number;
  payoutOwed: number;
  quotesOpen: number;
  statusBreakdown: StatusCount[];
  recent: RecentSubmission[];
  totalAllTime: number;
}

async function getQueueSummary(): Promise<QueueSummary> {
  const [statusRows, recent, payoutOwed, quotesOpen] = await Promise.all([
    safe(
      () =>
        sfQuery<StatusCount>(`
          SELECT status, count(*)::int AS n
          FROM tradein_submissions
          GROUP BY status
          ORDER BY n DESC
        `),
      { rows: [] },
    ),
    safe(
      () =>
        sfQuery<RecentSubmission>(`
          SELECT
            s.reference,
            s.status,
            s.customer_name,
            s.customer_email,
            s.payment_method,
            s.delivery_method,
            s.quoted_cash_total,
            s.quoted_credit_total,
            s.final_total,
            count(i.id)::int AS item_count,
            s.created_at
          FROM tradein_submissions s
          LEFT JOIN tradein_submission_items i ON i.submission_id = s.id
          WHERE s.created_at > now() - interval '30 days'
          GROUP BY s.id
          ORDER BY s.created_at DESC
          LIMIT 50
        `),
      { rows: [] },
    ),
    safe(
      () =>
        sfQuery<{ total: string }>(`
          SELECT coalesce(sum(
            CASE
              WHEN final_total IS NOT NULL THEN final_total::numeric
              WHEN payment_method = 'cash' THEN coalesce(quoted_cash_total::numeric, 0)
              ELSE coalesce(quoted_credit_total::numeric, 0)
            END
          ), 0)::text AS total
          FROM tradein_submissions
          WHERE status = 'approved'
        `),
      { rows: [{ total: "0" }] },
    ),
    safe(
      () =>
        sfQuery<{ n: number }>(`
          SELECT count(*)::int AS n
          FROM quote_requests
          WHERE status IN ('pending', 'quoted', 'accepted', 'received')
        `),
      { rows: [{ n: 0 }] },
    ),
  ]);

  const counts: Record<string, number> = {};
  for (const row of statusRows.rows) counts[row.status] = row.n;

  const needsQuote = counts["submitted"] ?? 0;
  const awaitingResponse = counts["quoted"] ?? 0;
  const inFlight =
    (counts["accepted"] ?? 0) + (counts["received"] ?? 0) + (counts["grading"] ?? 0);
  const readyToPay = counts["approved"] ?? 0;
  const totalAllTime = Object.values(counts).reduce((a, b) => a + b, 0);

  return {
    needsQuote,
    awaitingResponse,
    inFlight,
    readyToPay,
    payoutOwed: parseFloat(payoutOwed.rows[0]?.total ?? "0") || 0,
    quotesOpen: quotesOpen.rows[0]?.n ?? 0,
    statusBreakdown: statusRows.rows,
    recent: recent.rows,
    totalAllTime,
  };
}

// ── Components ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-amber-500/20 text-amber-400",
  quoted: "bg-blue-500/20 text-blue-400",
  accepted: "bg-emerald-500/20 text-emerald-400",
  declined: "bg-red-500/20 text-red-400",
  expired: "bg-neutral-500/20 text-neutral-400",
  received: "bg-blue-500/20 text-blue-400",
  grading: "bg-purple-500/20 text-purple-400",
  approved: "bg-emerald-500/20 text-emerald-400",
  paid: "bg-green-500/20 text-green-400",
  rejected: "bg-red-500/20 text-red-400",
  cancelled: "bg-neutral-500/20 text-neutral-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
        STATUS_COLORS[status] ?? "bg-neutral-700 text-neutral-300"
      }`}
    >
      {status}
    </span>
  );
}

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

// ── Page ───────────────────────────────────────────────────────────────────

export const metadata = { title: "Trade-Ins" };

export default async function TradeInsPage() {
  const q = await getQueueSummary();

  const hasAttention = q.needsQuote > 0 || q.readyToPay > 0 || q.quotesOpen > 0;

  return (
    <div className="max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-white">Trade-Ins</h1>
            <Provenance kind="live" />
          </div>
          <p className="text-sm text-neutral-400 mt-1">
            {hasAttention
              ? "Action required in one or more queues."
              : "All queues clear."}
          </p>
        </div>
        <a
          href={`${STOREFRONT_ADMIN}/admin/trade-ins`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 text-sm bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition"
        >
          Open Admin ↗
        </a>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Needs Quote"
          value={q.needsQuote}
          urgency={q.needsQuote > 0 ? "critical" : "neutral"}
        />
        <KpiCard
          label="Awaiting Response"
          value={q.awaitingResponse}
          urgency="neutral"
        />
        <KpiCard
          label="In Flight"
          value={q.inFlight}
          urgency="neutral"
        />
        <KpiCard
          label="Ready to Pay"
          value={q.readyToPay}
          urgency={q.readyToPay > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          label="Payout Owed"
          value={fmtGBP(q.payoutOwed)}
          urgency={q.payoutOwed > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          label="Photo Quotes Open"
          value={q.quotesOpen}
          urgency={q.quotesOpen > 0 ? "warning" : "neutral"}
          sub="custom-quote flow"
        />
      </div>

      {/* Status breakdown */}
      {q.statusBreakdown.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">
            All-Time by Status
          </h2>
          <div className="flex flex-wrap gap-2">
            {q.statusBreakdown.map((row) => (
              <span
                key={row.status}
                className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${
                  row.status in STATUS_COLORS
                    ? STATUS_COLORS[row.status].replace("bg-", "border-").replace("/20", "/30") +
                      " " +
                      STATUS_COLORS[row.status]
                    : "border-neutral-700 bg-neutral-800 text-neutral-300"
                }`}
              >
                <span>{row.status}</span>
                <span className="font-bold">{row.n}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Recent submissions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
            Recent Submissions (last 30 days)
          </h2>
          <a
            href={`${STOREFRONT_ADMIN}/admin/trade-ins`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 transition"
          >
            Manage in storefront ↗
          </a>
        </div>

        {q.recent.length === 0 ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-8 text-center">
            <p className="text-neutral-500 text-sm">No submissions in the last 30 days.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-neutral-800 bg-neutral-900/80">
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Ref
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Customer
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Status
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Items
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Value
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Submitted
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {q.recent.map((s, i) => {
                    const value =
                      s.final_total ??
                      (s.payment_method === "cash"
                        ? s.quoted_cash_total
                        : s.quoted_credit_total);
                    return (
                      <tr
                        key={s.reference}
                        className={`border-b border-neutral-800/60 hover:bg-neutral-800/30 transition ${
                          i === q.recent.length - 1 ? "border-b-0" : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-amber-400 whitespace-nowrap">
                          {s.reference}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-white font-medium">{s.customer_name}</p>
                          <p className="text-neutral-500 text-xs">{s.customer_email}</p>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={s.status} />
                        </td>
                        <td className="px-4 py-3 text-center text-neutral-300">
                          {s.item_count}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-white whitespace-nowrap">
                          {value ? fmtGBP(value) : <span className="text-neutral-500">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-neutral-500 whitespace-nowrap text-xs">
                          {fmtDate(s.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <a
                            href={`${STOREFRONT_ADMIN}/admin/trade-ins`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:text-blue-300 transition whitespace-nowrap"
                          >
                            Open ↗
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Quote requests */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
              Custom Quote Requests
            </h2>
            <p className="text-xs text-neutral-600 mt-0.5">
              Photo-based quotes submitted via /trade-in/custom-quote
            </p>
          </div>
          <a
            href={`${STOREFRONT_ADMIN}/admin/quotes`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 transition"
          >
            Manage quotes ↗
          </a>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-2xl font-bold text-amber-400">{q.quotesOpen}</p>
              <p className="text-xs text-neutral-500 mt-0.5">open requests</p>
            </div>
            <div className="h-10 w-px bg-neutral-800" />
            <p className="text-sm text-neutral-400">
              Custom quote requests require photo review. Each request may have multiple
              card photos. Manage the full workflow in the storefront admin.
            </p>
          </div>
        </div>
      </section>

      {/* Action guidance */}
      {(q.needsQuote > 0 || q.readyToPay > 0) && (
        <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
          <h2 className="text-sm font-bold text-amber-400 mb-3">Action Required</h2>
          <ul className="space-y-2 text-sm text-neutral-300">
            {q.needsQuote > 0 && (
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                <span>
                  <strong className="text-amber-400">{q.needsQuote}</strong>{" "}
                  submission{q.needsQuote !== 1 ? "s" : ""} waiting for a quote.{" "}
                  <a
                    href={`${STOREFRONT_ADMIN}/admin/trade-ins`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Quote now ↗
                  </a>
                </span>
              </li>
            )}
            {q.readyToPay > 0 && (
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span>
                  <strong className="text-emerald-400">{q.readyToPay}</strong>{" "}
                  submission{q.readyToPay !== 1 ? "s" : ""} approved and ready for payout (
                  {fmtGBP(q.payoutOwed)} total).{" "}
                  <a
                    href={`${STOREFRONT_ADMIN}/admin/trade-ins`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Pay out ↗
                  </a>
                </span>
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
