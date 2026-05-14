/**
 * /admin/ops/ingest-quarantine — Manager-archetype quarantine review.
 *
 * Stage 4 of the pipeline (docs/connections/the-pipeline.md §6). Failed
 * normalizations land in `ingest_quarantine` with the raw upstream
 * payload preserved. This page lets the operator triage them:
 * inspect → resolve (reprocess / discard / manual-fix / upstream-bug).
 *
 * Reads wholesale RDS via `wsQuery()` — direct DB access (admin pattern).
 * Substrate-honest provenance: `<Provenance kind="live" />` because the
 * read is at request time, not cached.
 *
 * Designed in `docs/connections/the-license-propagation.md` (kingdom-081
 * Phase 4.4). Recursion target from kingdom-079 + the-pipeline.md §6.
 */

import {
  PageHeader,
  FilterPills,
  SearchForm,
  DataTable,
  Pagination,
  Provenance,
  StatusBadge,
  EmptyState,
  KpiGrid,
  KpiCard,
  WhyLink,
} from "@/lib/admin/ui";
import { wsQuery } from "@/lib/admin/db";
import { safe, safeCount, isUnavailable } from "@/lib/admin/queries";
import { fmtDateTime } from "@/lib/format";
import Link from "next/link";

export const metadata = { title: "Ingest quarantine" };

interface QuarantineListRow {
  id: number;
  ingest_run_id: number;
  source_id: string;
  upstream_id: string | null;
  reason: string;
  quarantined_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  resolution: string | null;
  raw_payload_size: number;
}

interface CountByReason {
  reason: string;
  count: number;
}

interface CountBySource {
  source_id: string;
  count: number;
}

const PAGE_SIZE = 50;
const VALID_RESOLUTIONS = ["", "unresolved", "reprocess", "discard", "manual-fix", "upstream-bug"];

// StatusBadge palette: maps status keys to Tone values.
const RESOLUTION_PALETTE: Record<string, "amber" | "blue" | "neutral" | "purple" | "red"> = {
  unresolved: "amber",
  reprocess: "blue",
  discard: "neutral",
  "manual-fix": "purple",
  "upstream-bug": "red",
};
const RESOLUTION_LABELS: Record<string, string> = {
  unresolved: "unresolved",
  reprocess: "reprocess",
  discard: "discarded",
  "manual-fix": "manual fix",
  "upstream-bug": "upstream bug",
};

function fmtDate(s: string): string {
  return fmtDateTime(s);
}

function bytesFmt(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    source?: string;
    resolution?: string;
    reason?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const sourceFilter = sp.source ?? "";
  const resolutionFilter = VALID_RESOLUTIONS.includes(sp.resolution ?? "")
    ? sp.resolution ?? ""
    : "";
  const reasonContains = (sp.reason ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // Build WHERE incrementally. The page reads wholesale RDS via wsQuery —
  // the quarantine table lives there (kingdom-066 migration 0014).
  const where: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (sourceFilter) {
    where.push(`source_id = $${i++}`);
    params.push(sourceFilter);
  }
  if (resolutionFilter === "unresolved") {
    where.push(`reviewed_at IS NULL`);
  } else if (resolutionFilter && resolutionFilter !== "") {
    where.push(`resolution = $${i++}`);
    params.push(resolutionFilter);
  }
  if (reasonContains) {
    where.push(`reason ILIKE $${i++}`);
    params.push(`%${reasonContains}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // Tolerant reads — the wholesale schema may not have the table if the
  // Phase A migration hasn't been applied on the local dev DB.
  const [rowsResult, totalResult, byReasonResult, bySourceResult, unresolvedCount] = await Promise.all([
    safe(
      () =>
        wsQuery<QuarantineListRow>(
          `SELECT
             id, ingest_run_id, source_id, upstream_id, reason,
             quarantined_at::text  AS quarantined_at,
             reviewed_at::text     AS reviewed_at,
             reviewed_by, resolution,
             octet_length(raw_payload::text)::int AS raw_payload_size
           FROM ingest_quarantine
           ${whereSql}
           ORDER BY id DESC
           LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
          params,
        ),
      { rows: [] },
    ),
    safeCount(wsQuery, `SELECT count(*)::int AS n FROM ingest_quarantine ${whereSql}`, params),
    safe(
      () =>
        wsQuery<CountByReason>(
          `SELECT reason, count(*)::int AS count
             FROM ingest_quarantine
             GROUP BY reason
             ORDER BY count DESC
             LIMIT 10`,
        ),
      { rows: [] },
    ),
    safe(
      () =>
        wsQuery<CountBySource>(
          `SELECT source_id, count(*)::int AS count
             FROM ingest_quarantine
             GROUP BY source_id
             ORDER BY count DESC`,
        ),
      { rows: [] },
    ),
    safeCount(
      wsQuery,
      `SELECT count(*)::int AS n FROM ingest_quarantine WHERE reviewed_at IS NULL`,
    ),
  ]);

  const total = isUnavailable(totalResult) ? 0 : totalResult;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const unresolvedTotal = isUnavailable(unresolvedCount) ? 0 : unresolvedCount;

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const finalSource = overrides.source ?? sourceFilter;
    const finalResolution = overrides.resolution ?? resolutionFilter;
    const finalReason = overrides.reason ?? reasonContains;
    if (finalSource) next.set("source", finalSource);
    if (finalResolution) next.set("resolution", finalResolution);
    if (finalReason) next.set("reason", finalReason);
    const newPage = overrides.page ?? String(page);
    if (newPage !== "1") next.set("page", newPage);
    const qs = next.toString();
    return `/admin/ops/ingest-quarantine${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ingest quarantine"
        description="Failed-normalization rows from the data-ingest pipeline. The raw upstream payload is preserved for replay or upstream-bug forensics. Mark each row with a resolution: reprocess / discard / manual-fix / upstream-bug."
      />

      <div className="flex items-center gap-3">
        <Provenance
          kind="live"
          source="wholesale-rds.ingest_quarantine"
        />
        <WhyLink href="/methodology/ingest-quarantine" />
      </div>

      <KpiGrid cols={4}>
        <KpiCard
          label="Total in DB"
          value={total}
          urgency={total > 100 ? "warning" : "neutral"}
          unavailable={isUnavailable(totalResult)}
        />
        <KpiCard
          label="Unresolved"
          value={unresolvedTotal}
          urgency={unresolvedTotal > 0 ? "critical" : "neutral"}
        />
        <KpiCard
          label="Distinct reasons"
          value={byReasonResult.rows.length}
        />
        <KpiCard
          label="Distinct sources"
          value={bySourceResult.rows.length}
        />
      </KpiGrid>

      {/* Source filter */}
      {bySourceResult.rows.length > 0 && (
        <FilterPills
          selected={sourceFilter}
          pills={[
            { value: "", label: "All sources", count: total, href: buildHref({ source: "", page: "1" }) },
            ...bySourceResult.rows.map((r) => ({
              value: r.source_id,
              label: r.source_id,
              count: r.count,
              href: buildHref({ source: r.source_id, page: "1" }),
            })),
          ]}
        />
      )}

      {/* Resolution filter */}
      <FilterPills
        selected={resolutionFilter}
        pills={[
          { value: "", label: "All", count: total, href: buildHref({ resolution: "", page: "1" }) },
          { value: "unresolved", label: "Unresolved", count: unresolvedTotal, href: buildHref({ resolution: "unresolved", page: "1" }) },
          { value: "reprocess", label: "Reprocess", href: buildHref({ resolution: "reprocess", page: "1" }) },
          { value: "discard", label: "Discarded", href: buildHref({ resolution: "discard", page: "1" }) },
          { value: "manual-fix", label: "Manual fix", href: buildHref({ resolution: "manual-fix", page: "1" }) },
          { value: "upstream-bug", label: "Upstream bug", href: buildHref({ resolution: "upstream-bug", page: "1" }) },
        ]}
      />

      <SearchForm
        action="/admin/ops/ingest-quarantine"
        value={reasonContains}
        clearHref={buildHref({ reason: "", page: "1" })}
        preserve={{ source: sourceFilter, resolution: resolutionFilter }}
        placeholder="filter reason text (ILIKE)"
      />

      {rowsResult.rows.length === 0 ? (
        <EmptyState
          title={
            total === 0
              ? "No quarantine rows yet."
              : "No rows match the current filter."
          }
          description={
            total === 0
              ? "The ingest pipeline either hasn't run yet, or every normalization succeeded. Substrate-honest about absence: zero is a real fact when the table exists."
              : "Clear filters to see the full set."
          }
        />
      ) : (
        <>
          <DataTable
            columns={[
              {
                key: "id",
                header: "id",
                render: (r) => (
                  <Link
                    href={`/admin/ops/ingest-quarantine/${r.id}`}
                    className="font-mono text-amber-400 hover:underline"
                  >
                    #{r.id}
                  </Link>
                ),
              },
              { key: "source_id", header: "source",
                render: (r) => <span className="font-mono text-xs">{r.source_id}</span> },
              { key: "reason", header: "reason",
                render: (r) => <span className="text-sm">{r.reason}</span> },
              { key: "upstream_id", header: "upstream id",
                render: (r) => (
                  <span className="font-mono text-xs text-neutral-400">
                    {r.upstream_id ? r.upstream_id.slice(0, 60) + (r.upstream_id.length > 60 ? "…" : "") : "—"}
                  </span>
                ),
              },
              {
                key: "resolution",
                header: "status",
                render: (r) => {
                  const tier = r.reviewed_at === null
                    ? "unresolved"
                    : (r.resolution ?? "discard");
                  return (
                    <StatusBadge
                      status={tier}
                      palette={RESOLUTION_PALETTE}
                      label={RESOLUTION_LABELS[tier]}
                    />
                  );
                },
              },
              { key: "raw_payload_size", header: "payload",
                render: (r) => <span className="text-xs text-neutral-500">{bytesFmt(r.raw_payload_size)}</span> },
              { key: "quarantined_at", header: "quarantined",
                render: (r) => <span className="text-xs text-neutral-400">{fmtDate(r.quarantined_at)}</span> },
              { key: "ingest_run_id", header: "run",
                render: (r) => <span className="text-xs font-mono text-neutral-500">#{r.ingest_run_id}</span> },
            ]}
            rows={rowsResult.rows}
            rowKey={(r) => String(r.id)}
          />

          <Pagination
            page={page}
            totalPages={totalPages}
            totalRows={total}
            pageSize={PAGE_SIZE}
            href={(p) => buildHref({ page: String(p) })}
          />
        </>
      )}

      {byReasonResult.rows.length > 0 && (
        <section className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-3 text-white">Top reasons (full table)</h2>
          <div className="text-xs text-neutral-400 space-y-1">
            {byReasonResult.rows.map((r) => (
              <div key={r.reason} className="flex justify-between font-mono">
                <Link
                  href={buildHref({ reason: r.reason, page: "1" })}
                  className="hover:text-amber-400"
                >
                  {r.reason}
                </Link>
                <span className="text-neutral-300">{r.count}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-neutral-500 mt-3 leading-relaxed">
            Top 10 reasons across the entire table (unfiltered). A wave of one
            reason often indicates an upstream schema change.
          </p>
        </section>
      )}
    </div>
  );
}
