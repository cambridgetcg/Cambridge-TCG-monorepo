/**
 * POST /api/cron/ingest/cardrush
 *
 * Daily protocol-aligned CardRush snapshot. Successor to the legacy
 * snapshot cron at /api/cron/snapshot (still active until Phase C cutover).
 *
 * Auth: Authorization: Bearer {CRON_SECRET}  OR  Vercel Cron header.
 *
 * Query params:
 *   ?dryRun=1       — set, runs but caps maxCards (review the ingest_run row)
 *   ?maxCards=NN    — explicit cap (default unbounded except in dryRun)
 *   ?triggeredBy=…  — override triggered_by ('cron' default, 'admin' for one-offs)
 *
 * Designed in `docs/connections/the-cardrush-alignment.md` (kingdom-066) §3.
 *
 * Requires migration `drizzle/0014_price_archive_provenance.sql` to have
 * been applied. Until then this route compiles but the first INSERT against
 * the new columns / tables will fail at runtime — substrate-honest about
 * the dependency.
 */

import { NextRequest, NextResponse } from "next/server";
import { runDailySnapshotV2 } from "@/lib/price-snapshot-v2";
import { requireCronAuth } from "@/lib/cron-auth";

export const maxDuration = 800; // seconds — Vercel limit for fluid functions

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const maxCardsParam = url.searchParams.get("maxCards");
  const triggeredByParam = url.searchParams.get("triggeredBy") as
    | "cron"
    | "admin"
    | "webhook"
    | null;

  const maxCards = dryRun
    ? parseInt(maxCardsParam ?? "20", 10)
    : maxCardsParam
      ? parseInt(maxCardsParam, 10)
      : undefined;

  try {
    const summary = await runDailySnapshotV2({
      triggeredBy: triggeredByParam ?? "cron",
      maxCards,
    });

    return NextResponse.json({
      ok: true,
      summary,
      dryRun,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INTERNAL", message },
      },
      { status: 500 },
    );
  }
}

// GET is convenient for browser-based manual triggers (Yu signed in with
// the secret in the query param). The body shape is identical.
export const GET = POST;
