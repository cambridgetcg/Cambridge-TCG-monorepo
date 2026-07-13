/**
 * POST /api/cron/ingest/cardrush
 *
 * Chunked protocol-aligned CardRush snapshot (kingdom-039; per-game fair
 * scheduling 2026-07-05). Runs every 2h (vercel.json); each invocation
 * splits its ~2,000-card chunk evenly across active games, selects each
 * game's share stalest-first by `last_scrape_attempt_at`, runs direct-host
 * games before the proxied lane, and flushes writes incrementally so a
 * killed invocation keeps its progress. Full policy in the header of
 * `@/lib/price-snapshot-v2`.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}.
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
import { redactInternalError } from "@/lib/public-errors";
import {
  CARDRUSH_ACQUISITION_ENABLED,
  CARDRUSH_BLOCK_REASON,
  CARDRUSH_DATA_POLICY_URL,
} from "@cambridge-tcg/data-ingest";

export const maxDuration = 800; // seconds — Vercel limit for fluid functions

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  if (!CARDRUSH_ACQUISITION_ENABLED) {
    return NextResponse.json(
      { ok: false, status: "blocked_pending_formal_partnership", reason: CARDRUSH_BLOCK_REASON, policy: CARDRUSH_DATA_POLICY_URL },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

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
    const message = redactInternalError("cron/ingest/cardrush", err);
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
