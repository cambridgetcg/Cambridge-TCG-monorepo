import { NextResponse } from "next/server";

// Watchlists and price alerts express private buying intent. Publishing even
// aggregate counts would expose small cohorts before a defensible anonymity
// threshold and consent model exist. Keep the API shape stable while failing
// closed: completed-trade and public-order signals remain available elsewhere.
export async function GET() {
  const response = NextResponse.json({
    rows: [],
    watchDerivedSignals: {
      status: "withheld",
      reason: "Private watchlists and alerts are not published as demand signals.",
      alternatives: ["/api/market/pulse", "/api/leaderboards"],
    },
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}
