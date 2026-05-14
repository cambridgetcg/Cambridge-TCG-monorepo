/**
 * GET /api/v1/ingest-runs/latest
 *
 * Returns the most recent ingest_run row per source_id. The storefront's
 * Falcon courier reads this to surface live last-run state on
 * `/api/v1/sources` — the recursion target named in that route's docstring
 * (kingdom-066 §9; closed kingdom-079).
 *
 * Auth: Bearer-gated (same key as /api/v1/prices). The data is operational
 * (run timestamps, row counts, error counts, status); no JPY prices. But
 * the surface is consistent with the rest of the wholesale API.
 *
 * Output shape:
 *   {
 *     runs: [
 *       {
 *         source_id: "cardrush",
 *         triggered_at: "2026-05-12T02:00:00.000Z",
 *         finished_at: "2026-05-12T02:18:42.011Z",
 *         status: "done",
 *         spec_version: "1",
 *         triggered_by: "cron",
 *         rows_read: 4317,
 *         rows_normalized: 4291,
 *         rows_written: 4288,
 *         rows_quarantined: 3,
 *         errors: 0,
 *         notes: null
 *       },
 *       ...
 *     ],
 *     queried_at: "2026-05-12T..."
 *   }
 *
 * Substrate-honesty:
 *   - A source registered in `@cambridge-tcg/data-ingest` that has NEVER
 *     emitted an ingest_run row will be absent from this list. The caller
 *     surfaces that absence as "never run", not as zero. *Absence is data.*
 *   - `status` carries the lifecycle: 'running' / 'done' / 'failed' / 'aborted'.
 *     'failed' rows are returned (not filtered) — the caller can render them
 *     with a state pill rather than pretending they don't exist.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { authenticateApiKey } from "../../auth";

export async function GET(req: NextRequest) {
  try {
    const apiKey = await authenticateApiKey(req);
    if (apiKey instanceof NextResponse) return apiKey;

    // DISTINCT ON (source_id) ORDER BY source_id, triggered_at DESC
    // — Postgres pattern for "most recent row per group".
    const rows = await db.execute<{
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
    }>(sql`
      SELECT DISTINCT ON (source_id)
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
      ORDER BY source_id, triggered_at DESC
    `);

    return NextResponse.json({
      runs: rows.map((r) => ({
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
      queried_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/ingest-runs/latest] Error:", message);
    return NextResponse.json(
      { error: "Internal error", detail: message },
      { status: 500 },
    );
  }
}
