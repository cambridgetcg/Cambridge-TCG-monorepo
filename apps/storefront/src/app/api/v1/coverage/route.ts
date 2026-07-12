import { NextResponse } from "next/server";

/** Observation counts/dates/source membership are derived from restricted
 * archive membership, so the public aggregator view is paused too. */
export async function GET(): Promise<Response> {
  return NextResponse.json(
    {
      error: { code: "COVERAGE_AGGREGATES_PAUSED", message: "Observed coverage aggregates are paused because they disclose restricted archive membership." },
      queried: false,
      observed_aggregates_included: false,
      summary: null,
      by_game_source: [],
      by_game: [],
      by_source: [],
      does_not_include: ["observation or distinct-card counts", "source/game membership", "date ranges or freshness derived from archive rows"],
    },
    { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300", "X-Content-License": "NOASSERTION" } },
  );
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "86400" } });
}
