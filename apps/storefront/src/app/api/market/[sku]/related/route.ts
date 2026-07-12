import { NextResponse } from "next/server";

// Watchlists are private intent, not a publication choice. Even grouped
// co-watch results can reveal a small community's behaviour, so this public
// endpoint deliberately returns no watch-derived recommendations.
export async function GET() {
  const response = NextResponse.json({
    related: [],
    watchDerivedSignals: {
      status: "withheld",
      reason: "Private watchlist choices are not used for public recommendations.",
    },
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}
