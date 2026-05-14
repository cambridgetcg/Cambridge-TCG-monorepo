/**
 * GET /api/v1/ingest-quarantine
 *
 * Surface the failed-normalization quarantine. Stage 4 of the pipeline
 * (see docs/connections/the-pipeline.md §6); rows here are upstream
 * payloads that the normalizer rejected with a reason. Substrate-
 * honest: failed rows are *evidence*, not silence.
 *
 * Auth: Bearer-gated. The data carries truncated raw HTML (max 100KB)
 * from cardrush scrapes that hit `error_reason` — operator-only.
 *
 * Query params:
 *   ?source=cardrush                 — filter to one source
 *   ?unresolved=true                 — only reviewed_at IS NULL (default true)
 *   ?reason_contains=text            — substring match on reason (case-insensitive)
 *   ?window=24h | 7d | 30d           — time window (default 30d)
 *   ?limit=N                         — max rows (default 100, max 500)
 *   ?cursor=<id>                     — pagination cursor
 *
 * Output:
 *   {
 *     quarantine: [
 *       {
 *         id, ingest_run_id, source_id, upstream_id,
 *         reason, as_of, retrieved_at, quarantined_at,
 *         reviewed_at, reviewed_by, resolution,
 *         raw_payload_keys, raw_payload_size_bytes
 *       },
 *       ...
 *     ],
 *     counts: {
 *       window_total, unresolved, by_reason: { reason: count, ... }
 *     },
 *     next_cursor: <id> | null,
 *     window: { start, end },
 *     queried_at: ISO
 *   }
 *
 * Note: `raw_payload` is NOT included in the list response (could be
 * large). Use `/api/v1/ingest-quarantine/[id]` (NEW; see route.ts at
 * apps/wholesale/src/app/api/v1/ingest-quarantine/[id]/route.ts) to
 * fetch one full row with raw_payload. The list-form returns just the
 * top-level keys + the byte size so a reviewer can decide whether to
 * fetch the full payload.
 *
 * Designed in `docs/connections/the-license-propagation.md` (kingdom-081
 * Phase 4.2). Recursion target from kingdom-079 + the-pipeline.md §6.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { authenticateApiKey } from "../auth";

const WINDOW_TO_HOURS: Record<string, number> = {
  "1h": 1,
  "24h": 24,
  "7d": 7 * 24,
  "30d": 30 * 24,
  "90d": 90 * 24,
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

// Type aliases with Record<string, unknown> for Drizzle db.execute<T> compat.
type QuarantineRow = {
  id: number;
  ingest_run_id: number;
  source_id: string;
  upstream_id: string | null;
  reason: string;
  as_of: string;
  retrieved_at: string;
  quarantined_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  resolution: string | null;
  raw_payload_keys: string[] | null;
  raw_payload_size_bytes: number;
} & Record<string, unknown>;

type ReasonCount = {
  reason: string;
  count: number;
} & Record<string, unknown>;

export async function GET(req: NextRequest) {
  try {
    const apiKey = await authenticateApiKey(req);
    if (apiKey instanceof NextResponse) return apiKey;

    const url = new URL(req.url);
    const sourceParam = url.searchParams.get("source");
    const windowParam = url.searchParams.get("window") ?? "30d";
    const reasonContains = url.searchParams.get("reason_contains");
    const unresolvedOnly = url.searchParams.get("unresolved") !== "false"; // default true
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

    const conditions: ReturnType<typeof sql>[] = [
      sql`quarantined_at >= ${windowStart.toISOString()}::timestamptz`,
    ];
    if (sourceParam) conditions.push(sql`source_id = ${sourceParam}`);
    if (unresolvedOnly) conditions.push(sql`reviewed_at IS NULL`);
    if (reasonContains) {
      conditions.push(sql`reason ILIKE ${`%${reasonContains}%`}`);
    }
    if (Number.isFinite(cursorParam) && cursorParam > 0) {
      conditions.push(sql`id < ${cursorParam}`);
    }

    const whereClause = conditions.reduce<ReturnType<typeof sql>>(
      (acc, cond, i) => (i === 0 ? cond : sql`${acc} AND ${cond}`),
      sql``,
    );

    // List query — return top-level keys + byte size, NOT the full raw_payload.
    // jsonb_object_keys(raw_payload) gives the top-level field names so a
    // reviewer can scan without fetching the body.
    const rows = await db.execute<QuarantineRow>(sql`
      SELECT
        id,
        ingest_run_id,
        source_id,
        upstream_id,
        reason,
        as_of::text             AS as_of,
        retrieved_at::text      AS retrieved_at,
        quarantined_at::text    AS quarantined_at,
        reviewed_at::text       AS reviewed_at,
        reviewed_by,
        resolution,
        (SELECT array_agg(k) FROM jsonb_object_keys(raw_payload) k) AS raw_payload_keys,
        octet_length(raw_payload::text)::int AS raw_payload_size_bytes
      FROM ingest_quarantine
      WHERE ${whereClause}
      ORDER BY id DESC
      LIMIT ${limit + 1}
    `);

    const has_more = rows.length > limit;
    const trimmed = has_more ? rows.slice(0, limit) : rows;
    const next_cursor = has_more ? trimmed[trimmed.length - 1]?.id ?? null : null;

    // Aggregate counts in the same window — for the reviewer's situational awareness.
    const aggConditions = conditions.filter(
      (_, i) => i !== conditions.length - 1 || !Number.isFinite(cursorParam),
    ); // Drop the cursor condition for aggregates
    const aggClause = aggConditions.reduce<ReturnType<typeof sql>>(
      (acc, cond, i) => (i === 0 ? cond : sql`${acc} AND ${cond}`),
      sql``,
    );

    const [totalRow] = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count FROM ingest_quarantine WHERE ${aggClause}
    `);
    const [unresolvedRow] = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count FROM ingest_quarantine
       WHERE ${aggClause} AND reviewed_at IS NULL
    `);
    const byReasonRows = await db.execute<ReasonCount>(sql`
      SELECT reason, COUNT(*)::int AS count
        FROM ingest_quarantine
       WHERE ${aggClause}
       GROUP BY reason
       ORDER BY count DESC
       LIMIT 20
    `);

    const by_reason: Record<string, number> = {};
    for (const r of byReasonRows) by_reason[r.reason] = r.count;

    return NextResponse.json({
      quarantine: trimmed.map((r) => ({
        id: r.id,
        ingest_run_id: r.ingest_run_id,
        source_id: r.source_id,
        upstream_id: r.upstream_id,
        reason: r.reason,
        as_of: r.as_of,
        retrieved_at: r.retrieved_at,
        quarantined_at: r.quarantined_at,
        reviewed_at: r.reviewed_at,
        reviewed_by: r.reviewed_by,
        resolution: r.resolution,
        raw_payload_keys: r.raw_payload_keys,
        raw_payload_size_bytes: r.raw_payload_size_bytes,
      })),
      counts: {
        window_total: totalRow?.count ?? 0,
        unresolved: unresolvedRow?.count ?? 0,
        by_reason,
      },
      next_cursor,
      window: {
        start: windowStart.toISOString(),
        end: windowEnd.toISOString(),
        hours: windowHours,
      },
      filter: {
        source: sourceParam,
        unresolved_only: unresolvedOnly,
        reason_contains: reasonContains,
      },
      queried_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/ingest-quarantine] Error:", message);
    return NextResponse.json(
      { error: "Internal error", detail: message },
      { status: 500 },
    );
  }
}
