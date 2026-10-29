/**
 * Daily Cardmarket official-file collection (plan §2,
 * docs/plans/tcg-data-platform/paid-data-api.md). See vercel.json for the
 * schedule.
 *
 * The cron secret is checked first. Then, unless DATA_COLLECT_CARDMARKET is
 * exactly "on", the route answers ran:false before loading the collector, so a
 * disabled run touches neither the network nor the database. Enabled, it
 * downloads Cardmarket's public price guide and product catalogue under
 * Cambridge's identifying User-Agent, writes one batch per game through the
 * member-price writer and the reviewed One Piece set crosswalks, all within a
 * 270 s budget. One run at a time: a call while another holds the lease
 * answers ran:false, "run-in-progress", and a store without the lease table
 * (0143) answers 503 rather than run unleased. Authentication authorizes the
 * request only; permission is the policy's evidence version and the release
 * row the writer re-checks.
 */

import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { collectionOn } from "@/lib/datafeed/collection-flags";
import { CARDMARKET_EVIDENCE_VERSION } from "@cambridge-tcg/data-ingest/member-prices";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// sec — the collector's 270 s budget, plus room to report. No storefront
// route asks for more than 300, and an over-limit value can fail the whole
// deploy rather than just this route.
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  if (!collectionOn("cardmarket")) {
    return NextResponse.json({ ok: true, ran: false, reason: "disabled" }, { headers: NO_STORE });
  }

  try {
    const { collectCardmarketMemberPrices } = await import("@/lib/datafeed/cardmarket-collector");
    const summary = await collectCardmarketMemberPrices(CARDMARKET_EVIDENCE_VERSION);
    if (!summary.ran) {
      console.log("[cron/collect/cardmarket]", JSON.stringify(summary));
      const held = summary.reason !== "lease-not-provisioned";
      return NextResponse.json(
        held ? { ok: true, ran: false, reason: summary.reason }
          : { ok: false, ran: false, reason: summary.reason, error: "The collector lease table (migration 0143) does not exist; no run starts unleased." },
        { status: held ? 200 : 503, headers: NO_STORE },
      );
    }
    console.log("[cron/collect/cardmarket]", JSON.stringify({ ok: summary.ok, elapsedMs: summary.elapsedMs, games: summary.games.map((run) => [run.gameId, run.status]) }));
    return NextResponse.json(summary, { status: summary.ok ? 200 : 503, headers: NO_STORE });
  } catch (error) {
    console.error("[cron/collect/cardmarket] failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json(
      { ok: false, ran: true, error: "Cardmarket collection could not start." },
      { status: 500, headers: NO_STORE },
    );
  }
}
