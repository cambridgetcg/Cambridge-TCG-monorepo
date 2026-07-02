/**
 * Audit Log — Manager page.
 *
 * Reads admin_actions_log from storefront. Append-only governance trail.
 * Every consequential admin action — suspension, trust override, dispute
 * resolution, fraud signal review — recorded here.
 *
 * Filters: text search (actor_label / action), target_kind pills, date range.
 * Read-only. No mutations — governance reader only.
 *
 * Schema (storefront migration 0069_admin_governance.sql):
 *   id, actor_label, target_user_id, target_kind, target_id,
 *   action, before_value (jsonb), after_value (jsonb), reason,
 *   metadata, created_at
 */

import * as React from "react";
import { sfQuery } from "@/lib/admin/db";
import { fmtDateTime } from "@/lib/format";
import {
  PageHeader, FilterPills, SearchForm, DataTable, Pagination,
  KpiGrid, KpiCard, SectionHeading, Provenance,
  type Column,
} from "@/lib/admin/ui";

export const metadata = { title: "Audit Log" };

const PAGE_SIZE = 100;

// ── Types ────────────────────────────────────────────────────────────────

interface AuditRow {
  id: string;
  actor_label: string | null;
  target_kind: string;
  target_id: string | null;
  action: string;
  /** Cast to ::text so postgres.js returns a string, not a parsed object. */
  before_value: string | null;
  after_value: string | null;
  reason: string | null;
  created_at: string;
}

interface KindCount {
  target_kind: string;
  count: string;
}

interface KpiRow {
  today: string;
  week: string;
  actors: string;
}

// ── Diff helper ──────────────────────────────────────────────────────────

interface DiffEntry {
  key: string;
  before: string;
  after: string;
}

function diffValues(before: string | null, after: string | null): DiffEntry[] {
  if (!before && !after) return [];
  let b: Record<string, unknown> = {};
  let a: Record<string, unknown> = {};
  try { if (before) b = JSON.parse(before) as Record<string, unknown>; } catch { /* ignore */ }
  try { if (after) a = JSON.parse(after) as Record<string, unknown>; } catch { /* ignore */ }
  const allKeys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const changed: DiffEntry[] = [];
  for (const key of allKeys) {
    const bv = JSON.stringify(b[key]);
    const av = JSON.stringify(a[key]);
    if (bv !== av) {
      changed.push({
        key,
        before: b[key] == null ? "—" : String(b[key]),
        after: a[key] == null ? "—" : String(a[key]),
      });
    }
  }
  return changed;
}

// ── Page ─────────────────────────────────────────────────────────────────

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; from?: string; to?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const kind = sp.kind ?? "";
  const from = sp.from ?? "";
  const to = sp.to ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // ── WHERE clause ──────────────────────────────────────────────────────
  const where: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (q) {
    where.push(`(actor_label ILIKE $${i} OR action ILIKE $${i})`);
    params.push(`%${q}%`);
    i++;
  }
  if (kind) {
    where.push(`target_kind = $${i}`);
    params.push(kind);
    i++;
  }
  if (from) {
    where.push(`created_at >= $${i}::date`);
    params.push(from);
    i++;
  }
  if (to) {
    // Inclusive: to date covers the full day
    where.push(`created_at < $${i}::date + INTERVAL '1 day'`);
    params.push(to);
    i++;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // ── Parallel queries ──────────────────────────────────────────────────
  const [rowsResult, totalResult, kindCountsResult, kpiResult] = await Promise.all([
    sfQuery<AuditRow>(
      `SELECT id::text, actor_label, target_kind, target_id, action,
              before_value::text, after_value::text, reason, created_at
         FROM admin_actions_log
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      params,
    ),
    sfQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM admin_actions_log ${whereSql}`,
      params,
    ),
    // Kind facets from the full table — not filtered by current selection —
    // so all pills remain visible regardless of active kind filter.
    sfQuery<KindCount>(
      `SELECT target_kind, COUNT(*)::text AS count
         FROM admin_actions_log
         GROUP BY target_kind
         ORDER BY COUNT(*) DESC`,
      [],
    ),
    sfQuery<KpiRow>(
      `SELECT
         COUNT(*) FILTER (WHERE created_at >= current_date)::text                     AS today,
         COUNT(*) FILTER (WHERE created_at >= current_date - INTERVAL '7 days')::text AS week,
         COUNT(DISTINCT actor_label) FILTER (WHERE created_at >= current_date)::text  AS actors
       FROM admin_actions_log`,
      [],
    ),
  ]);

  const total = parseInt(totalResult.rows[0]?.count ?? "0", 10);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const kpi = kpiResult.rows[0] ?? { today: "0", week: "0", actors: "0" };

  // ── Href factory ──────────────────────────────────────────────────────
  const buildHref = (overrides: Record<string, string | undefined>): string => {
    const next = new URLSearchParams();
    const nq = overrides.q !== undefined ? overrides.q : q;
    if (nq) next.set("q", nq);
    const nk = overrides.kind !== undefined ? overrides.kind : kind;
    if (nk) next.set("kind", nk);
    const nf = overrides.from !== undefined ? overrides.from : from;
    if (nf) next.set("from", nf);
    const nt = overrides.to !== undefined ? overrides.to : to;
    if (nt) next.set("to", nt);
    const np = overrides.page ?? String(page);
    if (np !== "1") next.set("page", np);
    const qs = next.toString();
    return `/admin/system/audit${qs ? `?${qs}` : ""}`;
  };

  // ── Columns ───────────────────────────────────────────────────────────
  const columns: Column<AuditRow>[] = [
    {
      key: "time",
      header: "Time",
      align: "right",
      cellClass: "text-xs text-ink-muted whitespace-nowrap",
      render: (r) => fmtDateTime(r.created_at),
    },
    {
      key: "actor",
      header: (
        <span title="actor_label is a free-form string the action wrapper sets at write time. It is NOT a verified user identity. See docs/principles/substrate-honesty-audit.md item A3.">
          Actor <span className="text-accent/70">⚠</span>
        </span>
      ),
      render: (r) =>
        r.actor_label ? (
          <span
            className="text-ink text-sm border-b border-dotted border-neutral-600 cursor-help"
            title="Free-form label set by the action wrapper. Not a verified user — see audit A3."
          >
            {r.actor_label}
          </span>
        ) : (
          <span className="text-ink-faint italic text-sm">system</span>
        ),
    },
    {
      key: "action",
      header: "Action",
      render: (r) => (
        <span className="font-mono text-xs text-blue-300 whitespace-nowrap">{r.action}</span>
      ),
    },
    {
      key: "target",
      header: "Target",
      render: (r) => (
        <div className="text-sm">
          <span className="text-ink-muted">{r.target_kind}</span>
          {r.target_id && (
            <span
              className="ml-1.5 font-mono text-xs text-ink-faint"
              title={r.target_id}
            >
              {r.target_id.length > 12 ? `${r.target_id.slice(0, 12)}…` : r.target_id}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      render: (r) =>
        r.reason ? (
          <span
            className="text-sm text-ink-muted line-clamp-2 max-w-[200px]"
            title={r.reason}
          >
            {r.reason}
          </span>
        ) : (
          <span className="text-neutral-600">—</span>
        ),
    },
    {
      key: "diff",
      header: "Changes",
      render: (r) => {
        const changes = diffValues(r.before_value, r.after_value);
        if (changes.length === 0) {
          return !r.before_value && !r.after_value ? (
            <span className="text-neutral-600">—</span>
          ) : (
            <span className="text-neutral-600 text-xs">no diff</span>
          );
        }
        const shown = changes.slice(0, 3);
        return (
          <div className="text-xs space-y-0.5 max-w-[260px]">
            {shown.map(({ key, before, after }) => (
              <div key={key} className="flex items-baseline gap-1 flex-wrap">
                <span className="text-ink-faint shrink-0">{key}:</span>
                <span
                  className="line-through text-red-400 truncate max-w-[70px]"
                  title={before}
                >
                  {before}
                </span>
                <span className="text-neutral-600">→</span>
                <span
                  className="text-secondary truncate max-w-[70px]"
                  title={after}
                >
                  {after}
                </span>
              </div>
            ))}
            {changes.length > 3 && (
              <span className="text-neutral-600">+{changes.length - 3} more</span>
            )}
          </div>
        );
      },
    },
  ];

  // ── Kind pills ────────────────────────────────────────────────────────
  const allCount = kindCountsResult.rows.reduce((s, r) => s + parseInt(r.count, 10), 0);
  const pills = [
    { value: "", label: "All", count: allCount, href: buildHref({ kind: "", page: "1" }) },
    ...kindCountsResult.rows.map((r) => ({
      value: r.target_kind,
      label: r.target_kind,
      count: parseInt(r.count, 10),
      href: buildHref({ kind: r.target_kind, page: "1" }),
    })),
  ];

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        title="Audit Log"
        provenance={<Provenance kind="live" />}
        description={
          <>
            Append-only governance trail. Every consequential admin action — suspension,
            trust override, dispute resolution, fraud signal review — is recorded here.
            The log is the substrate; status columns elsewhere are caches over this.
            {" "}
            <span className="text-accent-strong" title="Substrate-honesty audit item A3">
              ⚠ The Actor column is a free-form label, not a verified user identity (see audit A3).
            </span>
          </>
        }
      />

      <KpiGrid cols={3}>
        <KpiCard label="Actions Today" value={kpi.today} urgency="neutral" />
        <KpiCard label="Actions This Week" value={kpi.week} urgency="neutral" />
        <KpiCard label="Unique Actors Today" value={kpi.actors} urgency="neutral" />
      </KpiGrid>

      {/* Target kind filter */}
      <FilterPills selected={kind} pills={pills} />

      {/* Text search — actor_label or action string */}
      <SearchForm
        action="/admin/system/audit"
        value={q}
        placeholder="Search actor or action (e.g. dispute.force_resolve)"
        clearHref={buildHref({ q: "", page: "1" })}
        preserve={{ kind, from, to }}
      />

      {/* Date range — separate GET form; preserves q and kind as hidden inputs */}
      <form className="flex flex-wrap items-center gap-3 text-sm" action="/admin/system/audit">
        {q && <input type="hidden" name="q" value={q} />}
        {kind && <input type="hidden" name="kind" value={kind} />}
        <label className="text-ink-muted shrink-0">From</label>
        <input
          type="date"
          name="from"
          defaultValue={from}
          className="px-3 py-1.5 bg-surface border border-border-subtle rounded-md text-ink text-sm focus:outline-none focus:border-blue-500"
        />
        <label className="text-ink-muted shrink-0">To</label>
        <input
          type="date"
          name="to"
          defaultValue={to}
          className="px-3 py-1.5 bg-surface border border-border-subtle rounded-md text-ink text-sm focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          className="px-3 py-1.5 bg-surface-elevated hover:bg-neutral-700 text-ink-muted text-sm rounded-md transition-colors"
        >
          Apply
        </button>
        {(from || to) && (
          <a
            href={buildHref({ from: "", to: "", page: "1" })}
            className="text-ink-faint hover:text-ink text-sm transition-colors"
          >
            Clear dates
          </a>
        )}
      </form>

      <SectionHeading count={total}>Actions</SectionHeading>

      <DataTable
        columns={columns}
        rows={rowsResult.rows}
        rowKey={(r) => r.id}
        emptyMessage={
          total === 0
            ? "No audit actions recorded yet."
            : "No actions match the current filters."
        }
        minWidth={900}
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
