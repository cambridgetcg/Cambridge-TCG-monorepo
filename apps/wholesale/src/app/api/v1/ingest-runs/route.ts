/**
 * GET /api/v1/ingest-runs
 *
 * Paginated run history per source. Where `/api/v1/ingest-runs/latest`
 * (kingdom-079) returns the most-recent row per source (DISTINCT ON
 * pattern), this endpoint returns the full window — multiple runs per
 * source for trend analysis, drift detection, and post-mortem inspection.
 *
 * Auth: Bearer-gated (same key as /api/v1/prices and /api/v1/ingest-runs/latest).
 *
 * Query params:
 *   ?source=cardrush           — filter to one source (recommended; without
 *                                this the result is a mixed stream)
 *   ?window=24h | 7d | 30d     — time window (default 7d)
 *   ?status=running|done|failed|aborted  — filter by lifecycle status
 *   ?limit=N                   — max rows (default 100, max 500)
 *   ?cursor=<id>               — pagination cursor (use the last row's id)
 *
 * Output shape:
 *   {
 *     runs: [
 *       {
 *         id, source_id, triggered_at, finished_at, status, spec_version,
 *         triggered_by, rows_read, rows_normalized, rows_written,
 *         rows_quarantined, errors, notes
 *       },
 *       ...
 *     ],
 *     next_cursor: <id> | null,
 *     window: { start, end },
 *     queried_at: ISO
 *   }
 *
 * Designed in `docs/connections/the-license-propagation.md` (kingdom-081
 * Phase 4.1). Recursion target #3 from kingdom-079.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { authenticateApiKey, unauthorized } from "../auth";

const WINDOW_TO_HOURS: Record<string, number> = {
  "1h": 1,
  "24h": 24,
  "7d": 7 * 24,
  "30d": 30 * 24,
  "90d": 90 * 24,
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

// Type alias with index signature so Drizzle's db.execute<T> generic
// constraint (Record<string, unknown>) is satisfied. A regular interface
// would not be assignable.
type RunRow = {
  id: number;
  source_id: string;
  triggered_at: string;
  finished_at: string | null;
  status: string;
  spec_version: string;
  triggered_by: string;
  rows_read: number;
  rows_normalized: number;
  rows_written: number;
  rows_quarantined: number;
  errors: number;
  notes: string | null;
} & Record<string, unknown>;

export async function GET(req: NextRequest) {
  try {
    const apiKey = await authenticateApiKey(req);
    if (!apiKey) return unauthorized();

    const url = new URL(req.url);
    const sourceParam = url.searchParams.get("source");
    const windowParam = url.searchParams.get("window") ?? "7d";
    const statusParam = url.searchParams.get("status");
    const limitParam = parseInt(url.searchParams.get("limit") ?? "", 10);
    const cursorParam = parseInt(url.searchParams.get("cursor") ?? "", 10);

    const windowHours = WINDOW_TO_HOURS[windowParam];
    if (!windowHours) {
      return NextResponse.json(
        {
          error: "invalid window",
          detail: `window must be one of ${Object.keys(WINDOW_TO_HOURS).join(", ")}`,
        },
        { status: 400 },
      );
    }

    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_LIMIT)
      : DEFAULT_LIMIT;

    const windowMs = windowHours * 60 * 60 * 1000;
    const windowStart = new Date(Date.now() - windowMs);
    const windowEnd = new Date();

    // Build the WHERE clause incrementally — Drizzle's sql template handles
    // parameterisation. Substrate-honest: triggered_at is when the run
    // started (not finished_at) so we capture runs that started in window
    // but may still be in `running` state.
    const conditions: ReturnType<typeof sql>[] = [
      sql`triggered_at >= ${windowStart.toISOString()}::timestamptz`,
    ];
    if (sourceParam) {
      conditions.push(sql`source_id = ${sourceParam}`);
    }
    if (statusParam) {
      conditions.push(sql`status = ${statusParam}`);
    }
    if (Number.isFinite(cursorParam) && cursorParam > 0) {
      conditions.push(sql`id < ${cursorParam}`);
    }

    // Combine WHERE conditions. Drizzle's sql.join handles AND.
    const whereClause = conditions.reduce<ReturnType<typeof sql>>(
      (acc, cond, i) => (i === 0 ? cond : sql`${acc} AND ${cond}`),
      sql``,
    );

    const rows = await db.execute<RunRow>(sql`
      SELECT
        id,
        source_id,
        triggered_at::text   AS triggered_at,
        finished_at::text    AS finished_at,
        status,
        spec_version,
        triggered_by,
        rows_read,
        rows_normalized,
        rows_written,
        rows_quarantined,
        errors,
        notes
      FROM ingest_run
      WHERE ${whereClause}
      ORDER BY id DESC
      LIMIT ${limit + 1}
    `);

    // Detect pagination: if we got limit+1 rows, there are more; emit a
    // next_cursor pointing at the last-included row's id. Otherwise null.
    const has_more = rows.length > limit;
    const trimmed = has_more ? rows.slice(0, limit) : rows;
    const next_cursor = has_more ? trimmed[trimmed.length - 1]?.id ?? null : null;

    return NextResponse.json({
      runs: trimmed.map((r) => ({
        id: r.id,
        source_id: r.source_id,
        triggered_at: r.triggered_at,
        finished_at: r.finished_at,
        status: r.status,
        spec_version: r.spec_version,
        triggered_by: r.triggered_by,
        rows_read: r.rows_read,
        rows_normalized: r.rows_normalized,
        rows_written: r.rows_written,
        rows_quarantined: r.rows_quarantined,
        errors: r.errors,
        notes: r.notes,
      })),
      next_cursor,
      window: {
        start: windowStart.toISOString(),
        end: windowEnd.toISOString(),
        hours: windowHours,
      },
      filter: {
        source: sourceParam,
        status: statusParam,
      },
      queried_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/ingest-runs] Error:", message);
    return NextResponse.json(
      { error: "Internal error", detail: message },
      { status: 500 },
    );
  }
}
