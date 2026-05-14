/**
 * /api/v1/sources/[id] — single-source detail with run history, freshness
 * status, and quarantine counts.
 *
 * Where `/api/v1/sources` lists every source's meta + last-run row (kingdom-079),
 * this endpoint zooms into one source: full meta + the last 7 runs (or
 * configurable window via ?window=) + quarantine counts in the same window +
 * health-status derived from staleness vs the source's freshness budget.
 *
 * Public, no-auth — but the run + quarantine data is operational metadata
 * (timestamps, counts, status), not upstream-derived prices. The CC0 license
 * applies to the data the storefront owns (operational state, the registry
 * meta). For source-attributed historical prices, see the wholesale B2B
 * endpoint /api/v1/universal/card/[sku]/at/[date].
 *
 * Designed in `docs/connections/the-license-propagation.md` (kingdom-081
 * Phase 4.3).
 */

import { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { getSource, listSourceMeta } from "@cambridge-tcg/data-ingest";
import {
  fetchSourceLastRuns,
  fetchSourceRunHistory,
  fetchQuarantine,
  type SourceRunHistoryRow,
  type QuarantineRow,
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

// FreshnessKey → seconds (mirrors packages/data-spec/src/freshness.ts).
// Used to derive health-status pills without depending on data-spec at runtime.
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

type Health = "healthy" | "stale" | "very_stale" | "failing" | "never_run" | "unknown";

function deriveHealth(opts: {
  last_run: SourceRunHistoryRow | null;
  freshness_seconds: number;
  ingest_runs_available: boolean;
}): { health: Health; reason: string } {
  if (!opts.ingest_runs_available) {
    return { health: "unknown", reason: "wholesale ingest-runs endpoint unreachable" };
  }
  if (!opts.last_run) {
    return { health: "never_run", reason: "no ingest_run rows for this source" };
  }
  if (opts.last_run.status === "failed" || opts.last_run.errors > 0) {
    return { health: "failing", reason: `last run status=${opts.last_run.status}, errors=${opts.last_run.errors}` };
  }
  const finished = opts.last_run.finished_at
    ? new Date(opts.last_run.finished_at).getTime()
    : null;
  if (finished === null) {
    return { health: "stale", reason: "last run never finished (status remains 'running')" };
  }
  const ageSec = (Date.now() - finished) / 1000;
  if (ageSec > 2 * opts.freshness_seconds) {
    return {
      health: "very_stale",
      reason: `last finished ${(ageSec / 3600).toFixed(1)}h ago; freshness budget ${(opts.freshness_seconds / 3600).toFixed(1)}h (2× exceeded)`,
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
  /** Registered but not yet implemented? (no module = planned slot). */
  is_planned_only: boolean;
  /** Source-license tier from registry. */
  license: string;
  /** Whether the registry says this is redistributable. */
  redistributable: boolean;
  /** Substrate-honest about the wholesale Falcon's reachability. */
  ingest_runs_available: boolean;
  health: { state: Health; reason: string };
  last_run: SourceRunHistoryRow | null;
  recent_runs: SourceRunHistoryRow[];
  run_summary: {
    window_hours: number;
    total_runs: number;
    successful_runs: number;
    failed_runs: number;
    rows_written_total: number;
    rows_quarantined_total: number;
    errors_total: number;
  };
  quarantine: {
    window_total: number;
    unresolved: number;
    by_reason: Record<string, number>;
    recent: Pick<
      QuarantineRow,
      "id" | "ingest_run_id" | "reason" | "quarantined_at"
    >[];
  };
  links: {
    runs_full_history: string;
    quarantine_window: string;
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

  // Resolve meta from the registry. Even planned slots can be queried —
  // the response shape stays consistent; absent module means is_planned_only.
  const mod = getSource(id as never);
  const allMeta = listSourceMeta();
  const meta = allMeta.find((m) => m.id === id) ?? null;
  const is_planned_only = mod === undefined;

  // Fetch live data in parallel.
  const [lastRuns, runHistory, quarantine] = await Promise.all([
    fetchSourceLastRuns(),
    fetchSourceRunHistory({ source: id, window, limit: 50 }),
    fetchQuarantine({ source: id, window, unresolved: false, limit: 20 }),
  ]);

  const ingest_runs_available = lastRuns !== null;
  const last_run_short = lastRuns?.find((r) => r.source_id === id) ?? null;
  // Materialize last_run as a SourceRunHistoryRow-shaped (fill id=0 when absent)
  const last_run: SourceRunHistoryRow | null = last_run_short
    ? { id: 0, ...last_run_short }
    : null;

  const recent_runs: SourceRunHistoryRow[] = runHistory?.runs ?? [];

  const run_summary = recent_runs.reduce(
    (acc, r) => ({
      ...acc,
      total_runs: acc.total_runs + 1,
      successful_runs: acc.successful_runs + (r.status === "done" ? 1 : 0),
      failed_runs: acc.failed_runs + (r.status === "failed" ? 1 : 0),
      rows_written_total: acc.rows_written_total + r.rows_written,
      rows_quarantined_total: acc.rows_quarantined_total + r.rows_quarantined,
      errors_total: acc.errors_total + r.errors,
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
    last_run,
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
    health: { state: health, reason },
    last_run,
    recent_runs,
    run_summary,
    quarantine: {
      window_total: quarantine?.counts.window_total ?? 0,
      unresolved: quarantine?.counts.unresolved ?? 0,
      by_reason: quarantine?.counts.by_reason ?? {},
      recent: (quarantine?.quarantine ?? []).slice(0, 10).map((q) => ({
        id: q.id,
        ingest_run_id: q.ingest_run_id,
        reason: q.reason,
        quarantined_at: q.quarantined_at,
      })),
    },
    links: {
      runs_full_history: `https://wholesaletcgdirect.com/api/v1/ingest-runs?source=${encodeURIComponent(id)}&window=${window}`,
      quarantine_window: `https://wholesaletcgdirect.com/api/v1/ingest-quarantine?source=${encodeURIComponent(id)}&window=${window}`,
      methodology: meta?.catalog_section
        ? `https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/${meta.catalog_section}`
        : "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-tributaries.md",
      catalog: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-tributaries.md",
    },
  };

  return jsonResponse({
    data,
    endpoint: "/api/v1/sources/[id]",
    sources: ["ctcg-derived", "wholesale-rds.ingest_run", "wholesale-rds.ingest_quarantine"],
    source_license: ["cc0", "cc0", "cc0"],
    freshness: "status",
  });
}
