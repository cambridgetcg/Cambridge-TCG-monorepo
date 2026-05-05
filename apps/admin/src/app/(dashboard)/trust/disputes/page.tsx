/**
 * Trade disputes — Manager page.
 *
 * First pilot using the @/lib/ui primitives + adminAction wrapper.
 * Mirrors the legacy storefront page at /admin/disputes but stays scoped
 * to list / filter / status-transition. Rich messaging + evidence remain
 * in storefront for now.
 *
 * Tables: trade_disputes (storefront).
 * Status enum: open, under_review, awaiting_evidence,
 *              resolved_buyer, resolved_seller, resolved_split, closed.
 */

import Link from "next/link";
import { sfQuery } from "@/lib/db";
import { fmtDate, fmtGBP } from "@/lib/format";
import {
  PageHeader, FilterPills, SearchForm, DataTable, Pagination,
  KpiGrid, KpiCard, StatusBadge, SectionHeading, Provenance,
  type Column, type Tone,
} from "@/lib/ui";
import { TransitionButton } from "./_components";

export const metadata = { title: "Disputes" };

const PAGE_SIZE = 50;

const STATUS_PALETTE: Record<string, Tone> = {
  open:               "amber",
  under_review:       "blue",
  awaiting_evidence:  "amber",
  resolved_buyer:     "emerald",
  resolved_seller:    "emerald",
  resolved_split:     "blue",
  closed:             "neutral",
};

const STATUS_LABELS: Record<string, string> = {
  open:               "Open",
  under_review:       "Under Review",
  awaiting_evidence:  "Awaiting Evidence",
  resolved_buyer:     "Resolved (Buyer)",
  resolved_seller:    "Resolved (Seller)",
  resolved_split:     "Resolved (Split)",
  closed:             "Closed",
};

interface DisputeRow {
  id: string;
  trade_id: string;
  raised_by: string;
  raised_by_email: string | null;
  raised_by_name: string | null;
  reason: string;
  description: string | null;
  status: string;
  resolution_type: string | null;
  refund_amount: string | null;
  resolved_by_admin: boolean;
  resolved_at: string | null;
  created_at: string;
}

interface CountByStatus {
  status: string;
  count: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; userId?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = sp.status ?? "";
  // ?userId= filters on raised_by directly (audit A10).
  const userId = (sp.userId ?? "").trim();
  const userIdValid = userId && UUID_RE.test(userId);
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // WHERE columns are qualified with `d.` so the JOIN-bearing rows query
  // and the alias-less COUNT(*) query share the same fragment.
  const where: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (q) {
    // Search reason text, dispute UUID, or raised_by user (email/name)
    where.push(
      `(d.reason ILIKE $${i} OR d.description ILIKE $${i} OR d.id::text ILIKE $${i}` +
      ` OR u.email ILIKE $${i} OR u.name ILIKE $${i})`,
    );
    params.push(`%${q}%`);
    i += 1;
  }
  if (userIdValid) {
    where.push(`d.raised_by = $${i}::uuid`);
    params.push(userId);
    i += 1;
  }
  if (status) {
    where.push(`d.status = $${i}`);
    params.push(status);
    i += 1;
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const filterUser = userIdValid
    ? (await sfQuery<{ email: string; name: string | null }>(
        `SELECT email, name FROM users WHERE id = $1::uuid`,
        [userId],
      )).rows[0]
    : null;

  const [rowsResult, totalResult, byStatusResult, kpiResult] = await Promise.all([
    sfQuery<DisputeRow>(
      `SELECT d.id::text, d.trade_id::text, d.raised_by::text,
              u.email AS raised_by_email, u.name AS raised_by_name,
              d.reason, d.description, d.status::text,
              d.resolution_type, d.refund_amount::text, d.resolved_by_admin,
              d.resolved_at, d.created_at
         FROM trade_disputes d
         LEFT JOIN users u ON u.id = d.raised_by
         ${whereSql}
         ORDER BY d.created_at DESC
         LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      params,
    ),
    sfQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM trade_disputes d
         LEFT JOIN users u ON u.id = d.raised_by
         ${whereSql}`,
      params,
    ),
    sfQuery<CountByStatus>(
      `SELECT status::text AS status, COUNT(*)::text AS count
         FROM trade_disputes GROUP BY status ORDER BY count DESC`,
      [],
    ),
    sfQuery<{ open: string; under_review: string; awaiting_evidence: string; resolved: string; closed: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'open')::text                                       AS open,
         COUNT(*) FILTER (WHERE status = 'under_review')::text                               AS under_review,
         COUNT(*) FILTER (WHERE status = 'awaiting_evidence')::text                          AS awaiting_evidence,
         COUNT(*) FILTER (WHERE status IN ('resolved_buyer','resolved_seller','resolved_split'))::text AS resolved,
         COUNT(*) FILTER (WHERE status = 'closed')::text                                     AS closed
       FROM trade_disputes`,
      [],
    ),
  ]);

  const total = parseInt(totalResult.rows[0]?.count ?? "0", 10);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const kpi = kpiResult.rows[0] ?? { open: "0", under_review: "0", awaiting_evidence: "0", resolved: "0", closed: "0" };

  const buildHref = (overrides: Record<string, string | undefined>): string => {
    const next = new URLSearchParams();
    const newQ = overrides.q !== undefined ? overrides.q : q;
    if (newQ) next.set("q", newQ);
    const newStatus = overrides.status !== undefined ? overrides.status : status;
    if (newStatus) next.set("status", newStatus);
    const newUserId = overrides.userId !== undefined ? overrides.userId : userId;
    if (newUserId) next.set("userId", newUserId);
    const newPage = overrides.page ?? String(page);
    if (newPage !== "1") next.set("page", newPage);
    const qs = next.toString();
    return `/trust/disputes${qs ? `?${qs}` : ""}`;
  };

  const allCount = byStatusResult.rows.reduce((s, r) => s + parseInt(r.count, 10), 0);

  const columns: Column<DisputeRow>[] = [
    {
      key: "id",
      header: "ID",
      cellClass: "font-mono text-xs",
      render: (r) => (
        <span className="text-amber-400 truncate inline-block max-w-[120px]" title={r.id}>
          {r.id.slice(0, 8)}
        </span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      render: (r) => (
        <>
          <p className="text-white text-sm capitalize">{r.reason.replace(/_/g, " ")}</p>
          {r.description && (
            <p className="text-xs text-neutral-500 line-clamp-1 max-w-[360px]">{r.description}</p>
          )}
        </>
      ),
    },
    {
      key: "raised_by",
      header: "Raised by",
      render: (r) => {
        const label = r.raised_by_name ?? r.raised_by_email ?? null;
        return label ? (
          <Link
            href={`/catalog/users/${r.raised_by}`}
            className="text-xs text-amber-400 hover:text-amber-300 hover:underline truncate inline-block max-w-[180px]"
            title={label}
          >
            {label}
          </Link>
        ) : (
          <span className="text-xs text-neutral-600">—</span>
        );
      },
      hideOnMobile: true,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <StatusBadge
          status={r.status}
          palette={STATUS_PALETTE}
          label={STATUS_LABELS[r.status] ?? r.status}
        />
      ),
    },
    {
      key: "refund",
      header: "Refund",
      align: "right",
      render: (r) => (
        <span className="font-mono">
          {r.refund_amount ? fmtGBP(r.refund_amount) : <span className="text-neutral-600">—</span>}
        </span>
      ),
    },
    {
      key: "created",
      header: "Created",
      align: "right",
      cellClass: "text-xs text-neutral-400 whitespace-nowrap",
      render: (r) => fmtDate(r.created_at),
      hideOnMobile: true,
    },
    {
      key: "action",
      header: "",
      align: "right",
      render: (r) => <TransitionButton dispute={{ id: r.id, status: r.status }} />,
    },
  ];

  const pills = [
    { value: "", label: "All", count: allCount, href: buildHref({ status: "", page: "1" }) },
    ...byStatusResult.rows.map((r) => ({
      value: r.status,
      label: STATUS_LABELS[r.status] ?? r.status,
      count: r.count,
      href: buildHref({ status: r.status, page: "1" }),
    })),
  ];

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        title="Disputes"
        provenance={<Provenance kind="live" />}
        description="Trade disputes raised by buyers or sellers. Transition status to drive resolution. Messaging and evidence remain in the storefront admin."
      />

      {filterUser && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-2 text-sm flex items-center justify-between gap-3 flex-wrap">
          <span className="text-blue-300">
            Filtered to user{" "}
            <Link href={`/catalog/users/${userId}`} className="font-medium underline">
              {filterUser.name ?? filterUser.email}
            </Link>
            <span className="text-neutral-500"> ({filterUser.email})</span>
          </span>
          <Link
            href={buildHref({ userId: "", page: "1" })}
            className="text-xs text-neutral-400 hover:text-white"
          >
            Clear filter ✕
          </Link>
        </div>
      )}

      <KpiGrid cols={5}>
        <KpiCard label="Open" value={kpi.open} urgency="critical"
                 href={buildHref({ status: "open", page: "1" })} />
        <KpiCard label="Under Review" value={kpi.under_review} urgency="warning"
                 href={buildHref({ status: "under_review", page: "1" })} />
        <KpiCard label="Awaiting Evidence" value={kpi.awaiting_evidence} urgency="warning"
                 href={buildHref({ status: "awaiting_evidence", page: "1" })} />
        <KpiCard label="Resolved" value={kpi.resolved} urgency="ok" />
        <KpiCard label="Closed" value={kpi.closed} urgency="neutral" />
      </KpiGrid>

      <SectionHeading count={total}>Disputes</SectionHeading>

      <FilterPills selected={status} pills={pills} />

      <SearchForm
        action="/trust/disputes"
        value={q}
        placeholder="Search reason, description, dispute id, or user email/name"
        clearHref={buildHref({ q: "", page: "1" })}
        preserve={{ status, userId }}
      />

      <DataTable
        columns={columns}
        rows={rowsResult.rows}
        rowKey={(r) => r.id}
        emptyMessage={total === 0 ? "No disputes raised yet." : "No disputes match the current filter."}
        minWidth={760}
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        totalRows={total}
        pageSize={PAGE_SIZE}
        href={(p) => buildHref({ page: String(p) })}
      />
    </div>
  );
}
