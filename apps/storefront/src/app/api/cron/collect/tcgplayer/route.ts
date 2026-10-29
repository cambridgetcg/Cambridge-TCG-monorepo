/**
 * Hourly TCGplayer price-guide collector (Yu's permission, 2026-10-28:
 * docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md).
 *
 * The cron secret authorises the request; DATA_COLLECT_TCGPLAYER=on is the
 * operator's switch. Until it is on, the route answers before touching the
 * network or the database. A run reads every TCGplayer host's robots.txt
 * first, then sets one request per 10 s (or the longer Crawl-delay robots.txt
 * asks) for at most 270 s (collectors/tcgplayer.ts); maxDuration leaves room
 * for its last writes and its report. A refusal by TCGplayer is reported as
 * SOURCE_UNAVAILABLE, never worked around, and a run that wrote no set answers
 * 503 NO_SET_WRITTEN, not success. One run at a time: a call while
 * another holds the lease answers ran:false, "run-in-progress", one within
 * 10 s of the last run's end answers ran:false, "request-spacing", and a store
 * without the lease table (0143) answers 503 rather than run unleased. A host
 * that refused an earlier run is left alone until its Retry-After (or 6 h)
 * has passed: ran:false, "host-backing-off". One suspended after three refused
 * runs in a row answers 503 HOST_SUSPENDED until a person clears it
 * (migration 0146).
 */

import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { collectionOn } from "@/lib/datafeed/collection-flags";
import { collectTcgplayer } from "@/lib/datafeed/collectors/tcgplayer";

export const dynamic = "force-dynamic";
// seconds — the run stops at 270. No storefront route asks for more than 300,
// and an over-limit value can fail the whole deploy rather than this route.
export const maxDuration = 300;

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  // The same rule the scheduling copy reads (collection-flags.ts).
  if (!collectionOn("tcgplayer")) {
    return NextResponse.json({ ok: true, ran: false, reason: "disabled" }, { headers });
  }

  try {
    const run = await collectTcgplayer();
    if (!run.ran) {
      console.log("[cron/collect/tcgplayer]", JSON.stringify(run));
      if (run.reason === "host-suspended" || run.reason === "host-backing-off") {
        const { reason, host, notBefore, suspendedAt, suspendedReason } = run;
        return run.reason === "host-suspended"
          ? NextResponse.json({ ok: false, ran: false, reason, host, suspendedAt, suspendedReason, error: { code: "HOST_SUSPENDED", message: "A TCGplayer host refused three runs in a row; the collector stays off TCGplayer until a person clears it (price_collector_hosts, migration 0146)." } }, { status: 503, headers })
          : NextResponse.json({ ok: true, ran: false, reason, host, notBefore }, { headers });
      }
      const held = run.reason !== "lease-not-provisioned";
      return NextResponse.json(
        held ? { ok: true, ran: false, reason: run.reason }
          : { ok: false, ran: false, reason: run.reason, error: { code: "NOT_PROVISIONED", message: "The collector lease table (migration 0143) does not exist; no run starts unleased." } },
        { status: held ? 200 : 503, headers },
      );
    }
    console.log("[cron/collect/tcgplayer]", JSON.stringify({ ...run, sets: run.sets.length }));
    if (run.status === "source-unavailable") {
      return NextResponse.json(
        { ok: false, ran: true, error: { code: "SOURCE_UNAVAILABLE", message: "TCGplayer refused or could not serve the identified collector; this run stopped." }, run },
        { status: 503, headers: { ...headers, "Retry-After": "3600" } },
      );
    }
    if (run.status === "no-set-written") {
      return NextResponse.json(
        { ok: false, ran: true, error: { code: "NO_SET_WRITTEN", message: "The run wrote no set's price guide; its errors and stoppedBy say why." }, run },
        { status: 503, headers },
      );
    }
    return NextResponse.json({ ok: run.status === "ok", ran: true, run }, { headers });
  } catch (err) {
    console.error("[cron/collect/tcgplayer] failed:", err);
    return NextResponse.json({ ok: false, ran: true, error: { code: "INTERNAL" } }, { status: 500, headers });
  }
}
