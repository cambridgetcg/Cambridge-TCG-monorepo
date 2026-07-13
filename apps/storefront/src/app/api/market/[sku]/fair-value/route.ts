import { NextResponse } from "next/server";
import { COMPLETED_TRADE_PUBLICATION } from "@/lib/market/publication";

// The stable null shape lets clients fall back to non-person catalogue
// reference prices without exposing completed-trade observations.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sku: string }> },
) {
  const { sku } = await params;

  return NextResponse.json({
    sku,
    windowDays: null,
    status: COMPLETED_TRADE_PUBLICATION.status,
    publication: COMPLETED_TRADE_PUBLICATION,
    fairValue: {
      vwap: null,
      median: null,
      tradeCount: 0,
      totalVolume: 0,
      priceRange: {
        min: null,
        max: null,
      },
    },
    bidAnalysis: null,
    bidAnalysisStatus: "paused",
  });
}
