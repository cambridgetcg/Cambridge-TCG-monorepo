import { NextResponse } from "next/server";
import { COMPLETED_TRADE_PUBLICATION } from "@/lib/market/publication";

// Keep the former candle shape stable while no completed-trade derivatives
// cross the public boundary.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sku: string }> }
) {
  const { sku } = await params;

  return NextResponse.json({
    sku,
    interval: null,
    candles: [],
    latestAggregatePrice: null,
    sparkline: [],
    publication: COMPLETED_TRADE_PUBLICATION,
  });
}
