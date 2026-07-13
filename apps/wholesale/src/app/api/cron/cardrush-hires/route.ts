/**
 * POST /api/cron/cardrush-hires (alias: GET)
 *
 * Temporary cron that drains cardrush-hosted card images into per-game
 * S3 buckets (`hires/{SET}/{SKU}.jpg`). Multi-game since 2026-07-05:
 * each invocation checks the queue for every game in HIRES_GAMES
 * (pkm / op / dbf) and processes one batch per game that still has
 * unarchived cardrush-hosted images, direct from the same 5-minute
 * cadence.
 *
 * Cheap early exit: when no game has anything to archive, the route
 * answers from two count queries and writes NO ingest_run row — the
 * previous behaviour burned 288 no-op run rows/day while a dead LIKE
 * pattern reported 'remaining 0' as if the work were done (2026-07-05
 * investigation; pattern fixed in cardrush-hires-upload.ts). The
 * operator can remove the vercel.json cron entry once the queue shows
 * remaining 0 with matched > 0 for every game; until then the standing
 * cadence costs two SELECTs per tick.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}.
 *
 * Query params:
 *   ?dryRun=1              — count would-uploads, skip S3 PUTs
 *   ?maxBatch=N            — cap per-game batch (default 100, max 500)
 *   ?game=pkm|op|dbf       — restrict to one game (manual prods)
 *   ?triggeredBy=cron|admin
 *
 * Spec: docs/superpowers/specs/2026-05-14-jp-pk-photos-hires-scrape-design.md
 */

import { NextRequest, NextResponse } from "next/server";
import {
  runHiresUpload,
  hiresQueueStatus,
  HIRES_GAMES,
  type HiresGame,
  type HiresUploadResult,
} from "@/lib/cardrush-hires-upload";
import { requireCronAuth } from "@/lib/cron-auth";
import { redactInternalError } from "@/lib/public-errors";
import {
  CARDRUSH_ACQUISITION_ENABLED,
  CARDRUSH_BLOCK_REASON,
  CARDRUSH_DATA_POLICY_URL,
} from "@cambridge-tcg/data-ingest";

export const maxDuration = 800;

/**
 * Don't START another game's batch after this much elapsed time — leaves
 * headroom under maxDuration for the in-flight batch's S3 puts and the
 * ingest_run finalisation. Remaining games get picked up next tick.
 */
const NEXT_GAME_CUTOFF_MS = 500_000;

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
  const maxBatchParam = url.searchParams.get("maxBatch");
  const gameParam = url.searchParams.get("game");
  const triggeredByParam = url.searchParams.get("triggeredBy") as
    | "cron"
    | "admin"
    | null;

  const maxBatch = maxBatchParam
    ? Math.max(1, Math.min(parseInt(maxBatchParam, 10) || 100, 500))
    : undefined;

  if (gameParam && !HIRES_GAMES.includes(gameParam as HiresGame)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "BAD_REQUEST",
          message: `Invalid game '${gameParam}' — expected one of ${HIRES_GAMES.join(", ")}`,
        },
      },
      { status: 400 },
    );
  }

  try {
    // Cheap gate: two count queries, no ingest_run row when idle.
    const queue = await hiresQueueStatus();
    const candidateGames = (
      gameParam ? [gameParam as HiresGame] : HIRES_GAMES
    ).filter((g) => queue[g].remaining > 0);

    if (candidateGames.length === 0) {
      return NextResponse.json({ ok: true, noop: true, queueAtStart: queue, dryRun });
    }

    const startMs = Date.now();
    const summaries: HiresUploadResult[] = [];
    const deferredGames: HiresGame[] = [];
    for (const game of candidateGames) {
      if (Date.now() - startMs > NEXT_GAME_CUTOFF_MS) {
        deferredGames.push(game);
        continue;
      }
      summaries.push(
        await runHiresUpload({
          game,
          triggeredBy: triggeredByParam ?? "cron",
          dryRun,
          maxBatch,
        }),
      );
    }

    return NextResponse.json({
      ok: true,
      noop: false,
      // Counted BEFORE the batches ran — each summary carries the fresh
      // per-game matched/remaining after its batch.
      queueAtStart: queue,
      summaries,
      // Games with work left that this invocation had no time budget for —
      // the next 5-minute tick resumes them. Named, not silently dropped.
      deferredGames,
      dryRun,
    });
  } catch (err) {
    const message = redactInternalError("cron/cardrush-hires", err);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message } },
      { status: 500 },
    );
  }
}

export const GET = POST;
