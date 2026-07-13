import { NextResponse } from "next/server";
import { MARKET_INTEREST_PUBLICATION } from "@/lib/market/publication";

export async function GET() {
  return NextResponse.json({
    rows: [],
    publication: MARKET_INTEREST_PUBLICATION,
  });
}
