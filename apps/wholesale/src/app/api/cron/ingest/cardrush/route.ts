/**
 * POST /api/cron/ingest/cardrush
 *
 * Chunked protocol-aligned CardRush snapshot (kingdom-039). Runs every 2h
 * (vercel.json); each invocation scrapes the ~2,000 stalest cards by
 * `last_scrape_attempt_at` and flushes writes incrementally, so the full
 * ~11k watch-list is covered roughly twice a day and a killed invocation
 * keeps its progress.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}  OR  Vercel Cron header.
 *
 * Query params:
 *   ?dryRun=1       — set, runs but caps maxCards (review the ingest_run row)
 *   ?maxCards=NN    — explicit cap (default unbounded except in dryRun)
 *   ?chunk=NN       — override the per-invocation chunk size (default 2000)
 *   ?triggeredBy=…  — override triggered_by ('cron' default, 'admin' for one-offs)
 *
 * Designed in `docs/connections/the-cardrush-alignment.md` (kingdom-066) §3;
 * chunked revival in the kingdom-039 mission addendum.
 *
 * Requires migrations through `drizzle/0022_games_kingdom_codes.sql`.
 * Until then this route compiles but fails at runtime — substrate-honest
 * about the dependency.
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
  const chunkParam = url.searchParams.get("chunk");
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
  const chunk = chunkParam ? parseInt(chunkParam, 10) : undefined;

  try {
    const summary = await runDailySnapshotV2({
      triggeredBy: triggeredByParam ?? "cron",
      maxCards,
      chunk,
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
