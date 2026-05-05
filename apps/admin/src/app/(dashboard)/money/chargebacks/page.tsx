/**
 * Chargebacks — Manager page.
 *
 * Stripe disputes (charge.dispute.* webhooks) as first-class records.
 * Stripe-deadline-driven: needs_response / warning_needs_response statuses
 * carry an evidence_due_at and we surface overdue rows in red.
 *
 * Tables: chargebacks + chargeback_lifecycle_log (storefront,
 * drizzle/0072_chargebacks.sql). Joined to users, trust_profiles,
 * customer_orders for context.
 *
 * Status enum (Stripe):
 *   needs_response | warning_needs_response   — admin must respond now
 *   under_review   | warning_under_review     — Stripe processing
 *   won | charge_refunded                     — terminal, in our favour
 *   lost                                       — terminal, against us
 *   warning_closed                             — terminal, no action
 *   admin_resolved                             — our manual close
 */

import * as React from "react";
import Link from "next/link";
import { sfQuery } from "@/lib/db";
import { fmtDate, fmtDateTime, fmtGBP } from "@/lib/format";
import {
  PageHeader, FilterPills, SearchForm, DataTable, Pagination,
  KpiGrid, KpiCard, StatusBadge, SectionHeading, Provenance, Verifiability,
  type Column, type Tone,
} from "@/lib/ui";
import { ChargebackActions } from "./_components";

export const metadata = { title: "Chargebacks" };

const PAGE_SIZE = 50;

const TERMINAL = ["won", "lost", "warning_closed", "charge_refunded", "admin_resolved"] as const;

const STATUS_PALETTE: Record<string, Tone> = {
  needs_response:         "red",
  warning_needs_response: "red",
  under_review:           "amber",
  warning_under_review:   "amber",
  won:                    "emerald",
  charge_refunded:        "blue",
  lost:                   "red",
  warning_closed:         "neutral",
  admin_resolved:         "neutral",
};

const STATUS_LABELS: Record<string, string> = {
  needs_response:         "Needs Response",
  warning_needs_response: "Warning — Needs Response",
  under_review:           "Under Review",
  warning_under_review:   "Warning — Under Review",
  won:                    "Won",
  charge_refunded:        "Charge Refunded",
  lost:                   "Lost",
  warning_closed:         "Warning Closed",
  admin_resolved:         "Admin Resolved",
};

interface ChargebackRow {
  stripe_dispute_id: string;
  stripe_payment_intent: string;
  user_id: string | null;
  order_id: number | null;
  amount_gbp: string;
  currency: string;
  stripe_status: string;
  stripe_reason: string | null;
  evidence_due_at: string | null;
  fraud_emitted: boolean;
  created_at: string;
  user_email: string | null;
  user_name: string | null;
  trust_score: number | null;
  is_suspended: boolean | null;
  order_email: string | null;
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
  // ?userId= filters on the user FK directly (substrate-honest), distinct
  // from ?q= which text-matches against email substring (audit item A10).
  const userId = (sp.userId ?? "").trim();
  const userIdValid = userId && UUID_RE.test(userId);
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const where: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (q) {
    where.push(
      `(c.stripe_dispute_id ILIKE $${i} OR c.stripe_reason ILIKE $${i} OR u.email ILIKE $${i} OR co.customer_email ILIKE $${i})`,
    );
    params.push(`%${q}%`);
    i += 1;
  }
  if (userIdValid) {
    where.push(`c.user_id = $${i}::uuid`);
    params.push(userId);
    i += 1;
  }
  if (status === "open") {
    where.push(`c.stripe_status NOT IN ('won','lost','warning_closed','charge_refunded','admin_resolved')`);
  } else if (status) {
    where.push(`c.stripe_status = $${i}`);
    params.push(status);
    i += 1;
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // If filtered by userId, fetch the user's display label for the banner.
  const filterUser = userIdValid
    ? (await sfQuery<{ email: string; name: string | null }>(
        `SELECT email, name FROM users WHERE id = $1::uuid`,
        [userId],
      )).rows[0]
    : null;

  // Always pull a "from" snapshot for KPI tiles (independent of filters).
  const [rowsResult, totalResult, byStatusResult, kpiResult] = await Promise.all([
    sfQuery<ChargebackRow>(
      `SELECT c.stripe_dispute_id, c.stripe_payment_intent,
              c.user_id::text AS user_id, c.order_id,
              c.amount_gbp::text AS amount_gbp, c.currency,
              c.stripe_status, c.stripe_reason, c.evidence_due_at,
              c.fraud_emitted, c.created_at,
              u.email AS user_email, u.name AS user_name,
              tp.trust_score, tp.is_suspended,
              co.customer_email AS order_email
         FROM chargebacks c
         LEFT JOIN users u            ON u.id = c.user_id
         LEFT JOIN trust_profiles tp  ON tp.user_id = c.user_id
         LEFT JOIN customer_orders co ON co.id = c.order_id
         ${whereSql}
        ORDER BY
          CASE WHEN c.stripe_status IN ('needs_response','warning_needs_response') THEN 0 ELSE 1 END,
          c.evidence_due_at NULLS LAST,
          c.created_at DESC
        LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      params,
    ),
    sfQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM chargebacks c
         LEFT JOIN users u            ON u.id = c.user_id
         LEFT JOIN customer_orders co ON co.id = c.order_id
         ${whereSql}`,
      params,
    ),
    sfQuery<CountByStatus>(
      `SELECT stripe_status::text AS status, COUNT(*)::text AS count
         FROM chargebacks GROUP BY stripe_status ORDER BY count DESC`,
      [],
    ),
    sfQuery<{
      needs_response: string; under_review: string; open_value: string;
      won: string; lost: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE stripe_status IN ('needs_response','warning_needs_response'))::text AS needs_response,
         COUNT(*) FILTER (WHERE stripe_status IN ('under_review','warning_under_review'))::text     AS under_review,
         COALESCE(SUM(amount_gbp) FILTER (WHERE stripe_status NOT IN
           ('won','lost','warning_closed','charge_refunded','admin_resolved')), 0)::text            AS open_value,
         COUNT(*) FILTER (WHERE stripe_status IN ('won','charge_refunded'))::text                   AS won,
         COUNT(*) FILTER (WHERE stripe_status = 'lost')::text                                       AS lost
       FROM chargebacks`,
      [],
    ),
  ]);

  const total = parseInt(totalResult.rows[0]?.count ?? "0", 10);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const kpi = kpiResult.rows[0] ?? {
    needs_response: "0", under_review: "0", open_value: "0", won: "0", lost: "0",
  };

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
    return `/money/chargebacks${qs ? `?${qs}` : ""}`;
  };

  // "All" + virtual "Open" filter + per-status pills
  const allCount = byStatusResult.rows.reduce((s, r) => s + parseInt(r.count, 10), 0);
  const openCount = byStatusResult.rows
    .filter((r) => !TERMINAL.includes(r.status as (typeof TERMINAL)[number]))
    .reduce((s, r) => s + parseInt(r.count, 10), 0);

  const pills = [
    { value: "", label: "All", count: allCount, href: buildHref({ status: "", page: "1" }) },
    { value: "open", label: "Open", count: openCount, href: buildHref({ status: "open", page: "1" }) },
    ...byStatusResult.rows.map((r) => ({
      value: r.status,
      label: STATUS_LABELS[r.status] ?? r.status,
      count: r.count,
      href: buildHref({ status: r.status, page: "1" }),
    })),
  ];

  const columns: Column<ChargebackRow>[] = [
    {
      key: "id",
      header: "Dispute",
      cellClass: "font-mono text-xs",
      render: (r) => (
        <Verifiability
          source="Stripe"
          id={r.stripe_dispute_id}
          href={`https://dashboard.stripe.com/disputes/${r.stripe_dispute_id}`}
        />
      ),
    },
    {
      key: "user",
      header: "User",
      render: (r) => {
        const label = r.user_name ?? r.user_email ?? r.order_email ?? "(orphan)";
        const detail = r.trust_score != null
          ? `trust ${r.trust_score}${r.is_suspended ? " · suspended" : ""}`
          : null;
        return (
          <>
            <p className="text-white text-sm truncate max-w-[220px]">{label}</p>
            {detail && (
              <p className={`text-xs ${r.is_suspended ? "text-red-400 font-bold" : "text-neutral-500"}`}>
                {detail}
              </p>
            )}
          </>
        );
      },
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (r) => <span className="font-mono">{fmtGBP(r.amount_gbp)}</span>,
    },
    {
      key: "reason",
      header: "Reason",
      cellClass: "text-xs text-neutral-400",
      render: (r) => r.stripe_reason
        ? <span className="capitalize">{r.stripe_reason.replace(/_/g, " ")}</span>
        : <span className="text-neutral-600">—</span>,
      hideOnMobile: true,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <StatusBadge
          status={r.stripe_status}
          palette={STATUS_PALETTE}
          label={STATUS_LABELS[r.stripe_status] ?? r.stripe_status}
        />
      ),
    },
    {
      key: "due",
      header: "Evidence Due",
      align: "right",
      cellClass: "text-xs whitespace-nowrap",
      render: (r) => {
        if (!r.evidence_due_at) return <span className="text-neutral-600">—</span>;
        const dueMs = new Date(r.evidence_due_at).getTime() - Date.now();
        const dueDays = Math.floor(dueMs / 86_400_000);
        const overdue = dueDays < 0;
        const urgent = !overdue && dueDays <= 3;
        const cls = overdue ? "text-red-400 font-bold" : urgent ? "text-amber-400" : "text-neutral-400";
        const suffix = overdue ? ` (overdue ${Math.abs(dueDays)}d)` : ` (${dueDays}d)`;
        return <span className={cls}>{fmtDate(r.evidence_due_at)}{suffix}</span>;
      },
      hideOnMobile: true,
    },
    {
      key: "created",
      header: "Created",
      align: "right",
      cellClass: "text-xs text-neutral-400 whitespace-nowrap",
      render: (r) => fmtDateTime(r.created_at),
      hideOnMobile: true,
    },
    {
      key: "action",
      header: "",
      align: "right",
      render: (r) => (
        <ChargebackActions
          chargeback={{ id: r.stripe_dispute_id, status: r.stripe_status }}
        />
      ),
    },
  ];

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        title="Chargebacks"
        provenance={<Provenance kind="synced" source="Stripe" />}
        description="Stripe disputes. Critical-severity auto-suspends the user via the fraud pipeline. Webhook handler in storefront; this is the triage queue. Stripe is authoritative; this view is reconciled — admin actions update our row, not Stripe."
        action={
          <Link
            href="/trust/fraud"
            className="text-xs text-amber-400 hover:text-amber-300 underline whitespace-nowrap"
          >
            Fraud signals →
          </Link>
        }
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
        <KpiCard
          label="Needs Response"
          value={kpi.needs_response}
          urgency="critical"
          href={buildHref({ status: "needs_response", page: "1" })}
        />
        <KpiCard
          label="Under Review"
          value={kpi.under_review}
          urgency="warning"
          href={buildHref({ status: "under_review", page: "1" })}
        />
        <KpiCard label="Open Value" value={fmtGBP(kpi.open_value)} urgency="warning" />
        <KpiCard label="Won (lifetime)" value={kpi.won} urgency="ok" />
        <KpiCard label="Lost (lifetime)" value={kpi.lost} urgency="critical" />
      </KpiGrid>

      <SectionHeading count={total}>Chargebacks</SectionHeading>

      <FilterPills selected={status} pills={pills} />

      <SearchForm
        action="/money/chargebacks"
        value={q}
        placeholder="Search dispute id, reason, or user email"
        clearHref={buildHref({ q: "", page: "1" })}
        preserve={{ status, userId }}
      />

      <DataTable
        columns={columns}
        rows={rowsResult.rows}
        rowKey={(r) => r.stripe_dispute_id}
        emptyMessage={total === 0 ? "No chargebacks recorded." : "No chargebacks match the current filter."}
        minWidth={840}
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
