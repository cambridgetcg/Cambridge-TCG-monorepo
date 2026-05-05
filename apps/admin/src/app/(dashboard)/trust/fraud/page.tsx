/**
 * Fraud signals — Manager page.
 *
 * Reads fraud_signals (storefront, drizzle/0019_escrow_trust.sql) joined
 * to users + trust_profiles for triage context. Severity drives ordering;
 * critical+suspend signals are what auto-suspended the user already.
 *
 * The 15-strong signal_type taxonomy is defined in
 * apps/storefront/src/lib/fraud/detection.ts (SIGNAL_DEFS). This page
 * stays read-only on the taxonomy and authoritative on triage state
 * (resolved / severity bumps / suspension escalation).
 *
 * Closes the loop the chargebacks page hands off — chargeback.severity=
 * critical signals land here for review.
 */

import * as React from "react";
import Link from "next/link";
import { sfQuery } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import {
  PageHeader, FilterPills, SearchForm, DataTable, Pagination,
  KpiGrid, KpiCard, StatusBadge, SectionHeading, Provenance,
  type Column, type Tone,
} from "@/lib/ui";
import { FraudActions } from "./_components";

export const metadata = { title: "Fraud Signals" };

const PAGE_SIZE = 50;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SEVERITY_PALETTE: Record<string, Tone> = {
  critical: "red",
  high:     "red",
  medium:   "amber",
  low:      "neutral",
};

const AUTO_ACTION_PALETTE: Record<string, Tone> = {
  suspend:     "red",
  block_trade: "red",
  hold_payout: "amber",
  flag:        "blue",
  none:        "neutral",
};

interface FraudRow {
  id: string;
  user_id: string;
  trade_id: string | null;
  signal_type: string;
  severity: string;
  description: string;
  auto_action: string | null;
  resolved: boolean;
  resolved_notes: string | null;
  notified_at: string | null;
  created_at: string;
  user_email: string | null;
  user_name: string | null;
  trust_score: number | null;
  is_suspended: boolean | null;
}

interface SeverityCount {
  severity: string;
  count: string;
}

interface SignalTypeCount {
  signal_type: string;
  count: string;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; severity?: string; type?: string; resolved?: string;
    userId?: string; page?: string;
  }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const severity = sp.severity ?? "";
  const type = sp.type ?? "";
  const showResolved = sp.resolved === "1";
  // ?userId= filters on fraud_signals.user_id directly (audit A10).
  const userId = (sp.userId ?? "").trim();
  const userIdValid = userId && UUID_RE.test(userId);
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const where: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (!showResolved) {
    where.push(`s.resolved = false`);
  }
  if (q) {
    where.push(
      `(u.email ILIKE $${i} OR u.name ILIKE $${i} OR s.description ILIKE $${i} OR s.id::text ILIKE $${i})`,
    );
    params.push(`%${q}%`);
    i += 1;
  }
  if (userIdValid) {
    where.push(`s.user_id = $${i}::uuid`);
    params.push(userId);
    i += 1;
  }
  if (severity) {
    where.push(`s.severity = $${i}`);
    params.push(severity);
    i += 1;
  }
  if (type) {
    where.push(`s.signal_type = $${i}`);
    params.push(type);
    i += 1;
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const filterUser = userIdValid
    ? (await sfQuery<{ email: string; name: string | null }>(
        `SELECT email, name FROM users WHERE id = $1::uuid`,
        [userId],
      )).rows[0]
    : null;

  const [rowsResult, totalResult, severityFacets, typeFacets, kpiResult] = await Promise.all([
    sfQuery<FraudRow>(
      `SELECT s.id::text, s.user_id::text, s.trade_id::text, s.signal_type,
              s.severity, s.description, s.auto_action, s.resolved,
              s.resolved_notes, s.notified_at, s.created_at,
              u.email AS user_email, u.name AS user_name,
              tp.trust_score, tp.is_suspended
         FROM fraud_signals s
         LEFT JOIN users u            ON u.id = s.user_id
         LEFT JOIN trust_profiles tp  ON tp.user_id = s.user_id
         ${whereSql}
        ORDER BY
          CASE s.severity
            WHEN 'critical' THEN 0
            WHEN 'high'     THEN 1
            WHEN 'medium'   THEN 2
            WHEN 'low'      THEN 3
          END,
          s.created_at DESC
        LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      params,
    ),
    sfQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM fraud_signals s
         LEFT JOIN users u ON u.id = s.user_id
         ${whereSql}`,
      params,
    ),
    sfQuery<SeverityCount>(
      `SELECT severity, COUNT(*)::text AS count
         FROM fraud_signals
         WHERE resolved = false
         GROUP BY severity`,
      [],
    ),
    sfQuery<SignalTypeCount>(
      `SELECT signal_type, COUNT(*)::text AS count
         FROM fraud_signals
         WHERE resolved = false
         GROUP BY signal_type
         ORDER BY count DESC
         LIMIT 12`,
      [],
    ),
    sfQuery<{
      unresolved: string; critical: string; suspend_action: string;
      suspended_users: string; resolved_today: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE resolved = false)::text                                AS unresolved,
         COUNT(*) FILTER (WHERE resolved = false AND severity = 'critical')::text      AS critical,
         COUNT(*) FILTER (WHERE resolved = false AND auto_action = 'suspend')::text    AS suspend_action,
         (SELECT COUNT(*)::text FROM trust_profiles WHERE is_suspended = true)         AS suspended_users,
         COUNT(*) FILTER (WHERE resolved = true AND created_at >= NOW() - INTERVAL '1 day')::text AS resolved_today
       FROM fraud_signals`,
      [],
    ),
  ]);

  const total = parseInt(totalResult.rows[0]?.count ?? "0", 10);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const kpi = kpiResult.rows[0] ?? {
    unresolved: "0", critical: "0", suspend_action: "0",
    suspended_users: "0", resolved_today: "0",
  };

  const buildHref = (overrides: Record<string, string | undefined>): string => {
    const next = new URLSearchParams();
    const newQ = overrides.q !== undefined ? overrides.q : q;
    if (newQ) next.set("q", newQ);
    const newSeverity = overrides.severity !== undefined ? overrides.severity : severity;
    if (newSeverity) next.set("severity", newSeverity);
    const newType = overrides.type !== undefined ? overrides.type : type;
    if (newType) next.set("type", newType);
    const newResolved = overrides.resolved !== undefined ? overrides.resolved : (showResolved ? "1" : "");
    if (newResolved) next.set("resolved", newResolved);
    const newUserId = overrides.userId !== undefined ? overrides.userId : userId;
    if (newUserId) next.set("userId", newUserId);
    const newPage = overrides.page ?? String(page);
    if (newPage !== "1") next.set("page", newPage);
    const qs = next.toString();
    return `/trust/fraud${qs ? `?${qs}` : ""}`;
  };

  const totalUnresolved = severityFacets.rows.reduce((s, r) => s + parseInt(r.count, 10), 0);

  const severityOrder = ["critical", "high", "medium", "low"];
  const severityPills = [
    {
      value: "",
      label: showResolved ? "All" : "All unresolved",
      count: showResolved ? total : totalUnresolved,
      href: buildHref({ severity: "", page: "1" }),
    },
    ...severityOrder
      .map((sev) => {
        const found = severityFacets.rows.find((r) => r.severity === sev);
        return {
          value: sev,
          label: sev.charAt(0).toUpperCase() + sev.slice(1),
          count: found?.count ?? "0",
          href: buildHref({ severity: sev, page: "1" }),
        };
      }),
  ];

  const typePills = [
    { value: "", label: "All types", count: totalUnresolved, href: buildHref({ type: "", page: "1" }) },
    ...typeFacets.rows.map((r) => ({
      value: r.signal_type,
      label: r.signal_type.replace(/_/g, " "),
      count: r.count,
      href: buildHref({ type: r.signal_type, page: "1" }),
    })),
  ];

  const columns: Column<FraudRow>[] = [
    {
      key: "severity",
      header: "Severity",
      render: (r) => (
        <StatusBadge
          status={r.severity}
          palette={SEVERITY_PALETTE}
          label={r.severity.toUpperCase()}
        />
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (r) => (
        <span className="text-sm text-white capitalize">
          {r.signal_type.replace(/_/g, " ")}
        </span>
      ),
    },
    {
      key: "user",
      header: "User",
      render: (r) => {
        const label = r.user_name ?? r.user_email ?? r.user_id.slice(0, 8);
        return (
          <>
            <p className="text-white text-sm truncate max-w-[220px]">{label}</p>
            <p className={`text-xs ${r.is_suspended ? "text-red-400 font-bold" : "text-neutral-500"}`}>
              {r.trust_score != null ? `trust ${r.trust_score}` : "—"}
              {r.is_suspended ? " · suspended" : ""}
            </p>
          </>
        );
      },
    },
    {
      key: "description",
      header: "Description",
      cellClass: "text-xs text-neutral-400",
      render: (r) => (
        <span className="line-clamp-2 max-w-[360px]">{r.description}</span>
      ),
      hideOnMobile: true,
    },
    {
      key: "auto_action",
      header: "Auto-action",
      render: (r) => r.auto_action
        ? <StatusBadge
            status={r.auto_action}
            palette={AUTO_ACTION_PALETTE}
            label={r.auto_action.replace(/_/g, " ")}
          />
        : <span className="text-neutral-600 text-xs">—</span>,
      hideOnMobile: true,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => r.resolved
        ? <span className="text-xs text-emerald-400">resolved</span>
        : r.notified_at
          ? <span className="text-xs text-amber-400">acted on</span>
          : <span className="text-xs text-neutral-400">pending</span>,
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
        <FraudActions
          signal={{
            id: r.id,
            user_id: r.user_id,
            severity: r.severity,
            resolved: r.resolved,
            is_suspended: !!r.is_suspended,
          }}
        />
      ),
    },
  ];

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        title="Fraud Signals"
        provenance={<Provenance kind="live" />}
        description="Triage queue from the fraud detection passes. Critical + auto_action=suspend signals already auto-suspended the user; resolve to clear, escalate to bump severity, or escalate to suspend if the auto-gate didn't fire. Trust score recomputes on the next sweep cron."
        action={
          <Link
            href="/money/chargebacks"
            className="text-xs text-amber-400 hover:text-amber-300 underline whitespace-nowrap"
          >
            Chargebacks →
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

      <SectionHeading trailing={<Provenance kind="live" />}>At a glance</SectionHeading>

      <KpiGrid cols={5}>
        <KpiCard
          label="Unresolved"
          value={kpi.unresolved}
          urgency="warning"
          href={buildHref({ severity: "", resolved: "", page: "1" })}
        />
        <KpiCard
          label="Critical Open"
          value={kpi.critical}
          urgency="critical"
          href={buildHref({ severity: "critical", resolved: "", page: "1" })}
        />
        <KpiCard
          label="Suspend-action Open"
          value={kpi.suspend_action}
          urgency="critical"
        />
        <KpiCard
          label="Users Suspended"
          value={kpi.suspended_users}
          urgency="warning"
        />
        <KpiCard label="Resolved 24h" value={kpi.resolved_today} urgency="ok" />
      </KpiGrid>

      <SectionHeading count={total}>Signals</SectionHeading>

      <div className="space-y-3">
        <FilterPills selected={severity} pills={severityPills} />
        {typeFacets.rows.length > 0 && (
          <FilterPills selected={type} pills={typePills} />
        )}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <SearchForm
            action="/trust/fraud"
            value={q}
            placeholder="Search user email, description, or signal id"
            clearHref={buildHref({ q: "", page: "1" })}
            preserve={{
              severity,
              type,
              resolved: showResolved ? "1" : "",
              userId,
            }}
          />
          <Link
            href={buildHref({ resolved: showResolved ? "" : "1", page: "1" })}
            className="text-xs text-neutral-400 hover:text-neutral-200 underline whitespace-nowrap"
          >
            {showResolved ? "Hide resolved" : "Show resolved too"}
          </Link>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rowsResult.rows}
        rowKey={(r) => r.id}
        emptyMessage={total === 0
          ? showResolved
            ? "No fraud signals recorded."
            : "No unresolved fraud signals — quiet on the front."
          : "No signals match the current filter."
        }
        minWidth={920}
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
