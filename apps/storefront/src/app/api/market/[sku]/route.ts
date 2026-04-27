import { NextResponse } from "next/server";
import { getCardOrderBook } from "@/lib/market/db";

// GET /api/market/[sku] — order book for a single card
export async function GET(_req: Request, { params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const book = await getCardOrderBook(sku);
  return NextResponse.json(book);
}
