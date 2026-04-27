import { NextResponse } from "next/server";
import { getMarketSummaries } from "@/lib/market/db";

// GET /api/market — browse cards with active order books
export async function GET(request: Request) {
  const url = new URL(request.url);
  const search = url.searchParams.get("q") || undefined;
  const limit = parseInt(url.searchParams.get("limit") || "24", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  const { cards, total } = await getMarketSummaries({ search, limit, offset });
  return NextResponse.json({ cards, total });
}
