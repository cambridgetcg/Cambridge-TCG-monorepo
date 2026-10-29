/**
 * CardRush page collector cron (Yu's permission of 2026-10-28;
 * docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md).
 *
 * Off unless DATA_COLLECT_CARDRUSH is exactly "on": until then an
 * authenticated call answers ran:false before touching the network or the
 * database. When on, each run reads one CardRush host's sitemap and its
 * stalest product pages at 0.5 rps under Cambridge's own User-Agent, within
 * a 270 s budget, and writes one batch (lib/datafeed/collectors/cardrush.ts).
 * A host that refuses the identified collector is reported
 * SOURCE_UNAVAILABLE (503, with a batch that names the refusal), not retried
 * another way. One run reads a host at a
 * time: a call while another run holds the host's lease answers ran:false,
 * "run-in-progress", one within 2 s of the last run of that host answers
 * ran:false, "request-spacing", and a store without the lease table (0143)
 * answers 503 rather than run unleased. Authentication authorizes the call
 * only; the permission is the decision record, and turning the flag on is Yu's.
 */

import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { collectionOn } from "@/lib/datafeed/collection-flags";
import { collectCardRush } from "@/lib/datafeed/collectors/cardrush";

export const dynamic = "force-dynamic";
// seconds — the run keeps to 270, leaving room to report. No storefront route
// asks for more than 300, and an over-limit value can fail the whole deploy.
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  // The same rule the scheduling copy reads (collection-flags.ts).
  if (!collectionOn("cardrush")) {
    return NextResponse.json({ ok: true, ran: false, reason: "disabled" }, { headers: NO_STORE });
  }

  try {
    const summary = await collectCardRush();
    console.log("[cron/collect/cardrush]", summary);
    if (summary.reason === "lease-not-provisioned") {
      return NextResponse.json(
        { ok: false, ...summary, error: { code: "NOT_PROVISIONED", message: "The collector lease table (migration 0143) does not exist; no run starts unleased." } },
        { status: 503, headers: NO_STORE },
      );
    }
    if (summary.unavailable) {
      return NextResponse.json(
        { ok: false, ...summary, error: { code: "SOURCE_UNAVAILABLE", message: "The CardRush host refused or could not serve the identified collector; this run stopped." } },
        { status: 503, headers: { ...NO_STORE, "Retry-After": "7200" } },
      );
    }
    return NextResponse.json({ ok: true, ...summary }, { headers: NO_STORE });
  } catch (err) {
    console.error("[cron/collect/cardrush] failed:", err);
    return NextResponse.json(
      { ok: false, error: { code: "COLLECTOR_FAILED", message: "Internal server error." } },
      { status: 500, headers: NO_STORE },
    );
  }
}
