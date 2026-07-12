import { NextResponse } from "next/server";
import { MARKET_INTEREST_PUBLICATION } from "@/lib/market/publication";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sku: string }> },
) {
  const { sku } = await params;

  return NextResponse.json({
    sku,
    related: [],
    publication: MARKET_INTEREST_PUBLICATION,
  });
}
