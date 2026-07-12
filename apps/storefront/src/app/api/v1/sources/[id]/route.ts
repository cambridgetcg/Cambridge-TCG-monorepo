/**
 * /api/v1/sources/[id] -- public source metadata and numeric ingest health.
 *
 * Wholesale run notes and quarantine reasons are operator data. They can
 * contain upstream titles, search terms, or exception text, so this public
 * projection never fetches quarantine and strips all free-text run fields.
 */

import type { NextRequest, NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { getSource, listSourceMeta } from "@cambridge-tcg/data-ingest";
import {
  fetchSourceLastRuns,
  fetchSourceRunHistory,
  type SourceRunHistoryRow,
  type SourceRunRow,
} from "@/lib/wholesale/client";

const VALID_WINDOWS = ["1h", "24h", "7d", "30d", "90d"] as const;
type Window = (typeof VALID_WINDOWS)[number];

const WINDOW_HOURS: Record<Window, number> = {
  "1h": 1,
  "24h": 24,
  "7d": 7 * 24,
  "30d": 30 * 24,
  "90d": 90 * 24,
};

const FRESHNESS_SECONDS: Record<string, number> = {
  catalog: 86400,
  price_current: 300,
  price_historical: Number.MAX_SAFE_INTEGER,
  market_signal: 60,
  status: 30,
  methodology: 86400,
  identity: 3600,
  adopters: 86400,
};

type Health =
  | "healthy"
  | "stale"
  | "very_stale"
  | "failing"
  | "never_run"
  | "unknown";

interface PublicRunRow {
  triggered_at: string;
  finished_at: string | null;
  status: string;
  spec_version: string;
  rows_read: number;
  rows_normalized: number;
  rows_written: number;
  rows_quarantined: number;
  errors: number;
}

function publicRun(row: SourceRunRow): PublicRunRow {
  return {
    triggered_at: row.triggered_at,
    finished_at: row.finished_at,
    status: row.status,
    spec_version: row.spec_version,
    rows_read: row.rows_read,
    rows_normalized: row.rows_normalized,
    rows_written: row.rows_written,
    rows_quarantined: row.rows_quarantined,
    errors: row.errors,
  };
}

function deriveHealth(opts: {
  last_run: SourceRunRow | null;
  freshness_seconds: number;
  ingest_runs_available: boolean;
}): { health: Health; reason: string } {
  if (!opts.ingest_runs_available) {
    return { health: "unknown", reason: "wholesale ingest status is unavailable" };
  }
  if (!opts.last_run) {
    return { health: "never_run", reason: "no ingest run was returned for this source" };
  }
  if (opts.last_run.status === "failed" || opts.last_run.errors > 0) {
    return {
      health: "failing",
      reason: `last run status=${opts.last_run.status}, errors=${opts.last_run.errors}`,
    };
  }
  const finished = opts.last_run.finished_at
    ? new Date(opts.last_run.finished_at).getTime()
    : null;
  if (finished === null) {
    return { health: "stale", reason: "last run has not finished" };
  }
  const ageSec = (Date.now() - finished) / 1000;
  if (ageSec > 2 * opts.freshness_seconds) {
    return {
      health: "very_stale",
      reason: `last finished ${(ageSec / 3600).toFixed(1)}h ago; freshness budget ${(opts.freshness_seconds / 3600).toFixed(1)}h (2x exceeded)`,
    };
  }
  if (ageSec > opts.freshness_seconds) {
    return {
      health: "stale",
      reason: `last finished ${(ageSec / 3600).toFixed(1)}h ago; freshness budget ${(opts.freshness_seconds / 3600).toFixed(1)}h`,
    };
  }
  return { health: "healthy", reason: "within freshness budget" };
}

interface SourceDetailBody {
  id: string;
  meta: ReturnType<typeof listSourceMeta>[number] | null;
  is_planned_only: boolean;
  license: string;
  redistributable: boolean;
  ingest_runs_available: boolean;
  run_history_available: boolean;
  health: { state: Health; reason: string };
  last_run: PublicRunRow | null;
  recent_runs: PublicRunRow[];
  run_summary: {
    window_hours: number;
    total_runs: number;
    successful_runs: number;
    failed_runs: number;
    rows_written_total: number;
    rows_quarantined_total: number;
    errors_total: number;
  };
  quarantine_publication: {
    available: false;
    reason: string;
  };
  links: {
    operator_runs_full_history: {
      url: string;
      auth: "wholesale-key";
    };
    methodology: string;
    catalog: string;
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const url = new URL(req.url);
  const windowParam = (url.searchParams.get("window") ?? "7d") as Window;
  const window = VALID_WINDOWS.includes(windowParam) ? windowParam : "7d";

  const mod = getSource(id as never);
  const allMeta = listSourceMeta();
  const meta = allMeta.find((candidate) => candidate.id === id) ?? null;
  const is_planned_only = mod === undefined;

  const [lastRuns, runHistory] = await Promise.all([
    fetchSourceLastRuns(),
    fetchSourceRunHistory({ source: id, window, limit: 50 }),
  ]);

  const ingest_runs_available = lastRuns !== null;
  const run_history_available = runHistory !== null;
  const last_run_internal = lastRuns?.find((row) => row.source_id === id) ?? null;
  const recent_runs_internal: SourceRunHistoryRow[] = runHistory?.runs ?? [];

  const run_summary = recent_runs_internal.reduce(
    (acc, row) => ({
      ...acc,
      total_runs: acc.total_runs + 1,
      successful_runs: acc.successful_runs + (row.status === "done" ? 1 : 0),
      failed_runs: acc.failed_runs + (row.status === "failed" ? 1 : 0),
      rows_written_total: acc.rows_written_total + row.rows_written,
      rows_quarantined_total: acc.rows_quarantined_total + row.rows_quarantined,
      errors_total: acc.errors_total + row.errors,
    }),
    {
      window_hours: WINDOW_HOURS[window],
      total_runs: 0,
      successful_runs: 0,
      failed_runs: 0,
      rows_written_total: 0,
      rows_quarantined_total: 0,
      errors_total: 0,
    },
  );

  const freshness_seconds = meta ? FRESHNESS_SECONDS[meta.freshness] ?? 0 : 0;
  const { health, reason } = deriveHealth({
    last_run: last_run_internal,
    freshness_seconds,
    ingest_runs_available,
  });

  const data: SourceDetailBody = {
    id,
    meta,
    is_planned_only,
    license: meta?.license ?? "unknown",
    redistributable: meta?.redistribute ?? false,
    ingest_runs_available,
    run_history_available,
    health: { state: health, reason },
    last_run: last_run_internal ? publicRun(last_run_internal) : null,
    recent_runs: recent_runs_internal.map(publicRun),
    run_summary,
    quarantine_publication: {
      available: false,
      reason:
        "Quarantine reasons and rows are operator-only because they may contain upstream or exception text.",
    },
    links: {
      operator_runs_full_history: {
        url: `https://wholesaletcgdirect.com/api/v1/ingest-runs?source=${encodeURIComponent(id)}&window=${window}`,
        auth: "wholesale-key",
      },
      methodology: meta?.catalog_section
        ? `https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/${meta.catalog_section}`
        : "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-tributaries.md",
      catalog:
        "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-tributaries.md",
    },
  };

  const operationalDataIncluded = ingest_runs_available || run_history_available;

  return jsonResponse({
    data,
    endpoint: "/api/v1/sources/[id]",
    sources: operationalDataIncluded
      ? ["ctcg-derived", "wholesale-rds.ingest_run"]
      : ["ctcg-derived"],
    source_license: operationalDataIncluded
      ? ["proprietary", "internal-only"]
      : ["proprietary"],
    license: "NOASSERTION",
    freshness: "status",
    does_not_include: [
      "Run notes, trigger labels, and internal row identifiers are not returned.",
      "Quarantine reasons, rows, payload keys, and payload bytes are not fetched or returned.",
    ],
  });
}
