/**
 * Daily market derivation cron (docs/plans/tcg-data-platform/paid-data-api.md
 * §3), method ctcg.market-derived/v1.
 *
 * Inert unless DATA_DERIVE_MARKET is exactly "on" (Yu's hand, per the
 * 2026-10-28 decision record): after the cron secret, a disabled route
 * answers ran:false before touching the database or the network. Enabled,
 * it derives today's UTC date once; a repeat answers "already-derived". GBP
 * crosses come from ECB's own quotes, never a fallback table. An unprovisioned
 * store, unavailable FX or no usable input is a 503 that says which, not an
 * empty success. It writes derived rows only: nothing here publishes them.
 */

import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { fetchEcbEuroQuotes } from "@/lib/fx/rates";
import { runMarketDerivation } from "@/lib/market-derived/derive";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // sec — one transaction over a week of observations

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  if (process.env.DATA_DERIVE_MARKET !== "on") {
    return NextResponse.json({ ok: true, ran: false, reason: "disabled" }, { headers: NO_STORE });
  }

  const now = new Date();
  try {
    const result = await runMarketDerivation({ asOf: now.toISOString().slice(0, 10), now, fx: await fetchEcbEuroQuotes() });
    return NextResponse.json(result, { status: result.ok ? 200 : 503, headers: NO_STORE });
  } catch (error) {
    // No SQL, connection detail or input values in the response or the log.
    console.error("[cron/derive/market] unavailable", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json(
      { ok: false, ran: false, reason: "unavailable", detail: "Market derivation failed; nothing was written." },
      { status: 503, headers: NO_STORE },
    );
  }
}
