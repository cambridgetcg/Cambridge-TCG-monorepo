import { NextResponse } from "next/server";

/** Legacy browse route paused. Use /api/market/catalog for the bounded,
 * first-party order-book projection. */
export async function GET(): Promise<Response> {
  return NextResponse.json(
    {
      error: {
        code: "LEGACY_MARKET_BROWSE_PAUSED",
        message:
          "This legacy market browse route is paused. Use /api/market/catalog for the bounded first-party projection.",
      },
      alternative: "/api/market/catalog",
      queried: false,
      does_not_include: [
        "order-cached imported names, sets, or images",
        "pending or cancelled trade activity",
        "unbounded scans",
      ],
    },
    { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300" } },
  );
}
