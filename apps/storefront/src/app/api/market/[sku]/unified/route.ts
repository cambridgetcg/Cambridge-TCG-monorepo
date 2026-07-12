import { NextResponse } from "next/server";
import { getUnifiedMarketView } from "@/lib/market/unified";

// GET /api/market/[sku]/unified — full market view with CTCG spot price
export async function GET(_req: Request, { params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;

  try {
    const view = await getUnifiedMarketView(sku);
    return NextResponse.json(view, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, noarchive",
      },
    });
  } catch (err) {
    console.error("[market] Unified view error:", err);
    return NextResponse.json({ error: "Failed to load market data." }, { status: 500 });
  }
}
