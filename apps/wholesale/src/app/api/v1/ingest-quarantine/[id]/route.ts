/**
 * GET /api/v1/ingest-quarantine/[id]
 *
 * Full quarantine row including the raw_payload jsonb. Sibling to the
 * list endpoint at `/api/v1/ingest-quarantine` which omits raw_payload
 * for size reasons.
 *
 * Auth: Bearer-gated.
 *
 * For a cardrush scrape failure, the raw_payload is the truncated HTML
 * page that didn't normalize — the operator inspects it to understand
 * what upstream changed (layout shift / new field / removed selector)
 * and patches the parser accordingly.
 *
 * Designed in `docs/connections/the-license-propagation.md` (kingdom-081
 * Phase 4.2b).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { authenticateApiKey } from "../../auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const apiKey = await authenticateApiKey(req);
    if (apiKey instanceof NextResponse) return apiKey;

    const { id: idParam } = await params;
    const id = parseInt(idParam, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { error: "invalid id" },
        { status: 400 },
      );
    }

    const rows = await db.execute<{
      id: number;
      ingest_run_id: number;
      source_id: string;
      upstream_id: string | null;
      raw_payload: Record<string, unknown>;
      reason: string;
      as_of: string;
      retrieved_at: string;
      quarantined_at: string;
      reviewed_at: string | null;
      reviewed_by: string | null;
      resolution: string | null;
    }>(sql`
      SELECT
        id,
        ingest_run_id,
        source_id,
        upstream_id,
        raw_payload,
        reason,
        as_of::text             AS as_of,
        retrieved_at::text      AS retrieved_at,
        quarantined_at::text    AS quarantined_at,
        reviewed_at::text       AS reviewed_at,
        reviewed_by,
        resolution
      FROM ingest_quarantine
      WHERE id = ${id}
      LIMIT 1
    `);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "quarantine row not found", id },
        { status: 404 },
      );
    }

    const r = rows[0]!;
    return NextResponse.json({
      id: r.id,
      ingest_run_id: r.ingest_run_id,
      source_id: r.source_id,
      upstream_id: r.upstream_id,
      raw_payload: r.raw_payload,
      reason: r.reason,
      as_of: r.as_of,
      retrieved_at: r.retrieved_at,
      quarantined_at: r.quarantined_at,
      reviewed_at: r.reviewed_at,
      reviewed_by: r.reviewed_by,
      resolution: r.resolution,
      queried_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/ingest-quarantine/[id]] Error:", message);
    return NextResponse.json(
      { error: "Internal error", detail: message },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/v1/ingest-quarantine/[id]
 *
 * Mark a quarantine row as reviewed with a resolution.
 *
 * Body:
 *   {
 *     resolution: "reprocess" | "discard" | "manual-fix" | "upstream-bug",
 *     reviewed_by: string  // operator email / handle
 *   }
 *
 * Idempotent: re-patching with the same resolution is a no-op.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const apiKey = await authenticateApiKey(req);
    if (apiKey instanceof NextResponse) return apiKey;

    const { id: idParam } = await params;
    const id = parseInt(idParam, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }

    const body = (await req.json()) as { resolution?: string; reviewed_by?: string };
    const validResolutions = ["reprocess", "discard", "manual-fix", "upstream-bug"];
    if (!body.resolution || !validResolutions.includes(body.resolution)) {
      return NextResponse.json(
        {
          error: "invalid resolution",
          detail: `must be one of ${validResolutions.join(", ")}`,
        },
        { status: 400 },
      );
    }
    if (!body.reviewed_by || body.reviewed_by.length === 0) {
      return NextResponse.json(
        { error: "reviewed_by required" },
        { status: 400 },
      );
    }

    const rows = await db.execute<{ id: number; reviewed_at: string }>(sql`
      UPDATE ingest_quarantine
         SET reviewed_at = now(),
             reviewed_by = ${body.reviewed_by},
             resolution  = ${body.resolution}
       WHERE id = ${id}
       RETURNING id, reviewed_at::text AS reviewed_at
    `);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "quarantine row not found", id },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      id: rows[0]!.id,
      reviewed_at: rows[0]!.reviewed_at,
      resolution: body.resolution,
      reviewed_by: body.reviewed_by,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/ingest-quarantine/[id]] PATCH Error:", message);
    return NextResponse.json(
      { error: "Internal error", detail: message },
      { status: 500 },
    );
  }
}
