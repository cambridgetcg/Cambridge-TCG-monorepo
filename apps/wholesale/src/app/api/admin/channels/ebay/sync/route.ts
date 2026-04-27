import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cards, games } from "@/lib/db/schema";
import { gt } from "drizzle-orm";
import { bulkPushListings } from "@/lib/channels/ebay";

/** POST /api/admin/channels/ebay/sync — push price + stock for all active listings to eBay */
export async function POST() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const startMs = Date.now();

  // Fetch all in-stock cards with a price
  const rows = await db
    .select({
      sku: cards.sku,
      price: cards.price,
      stock: cards.stock,
    })
    .from(cards)
    .innerJoin(games, gt(cards.gameId, 0)) // ensure game exists
    .where(gt(cards.stock, 0));

  const items = rows
    .filter((r) => r.price && r.price > 0)
    .map((r) => ({
      sku: r.sku,
      priceGbp: r.price!,
      stock: r.stock,
    }));

  const result = await bulkPushListings(items);

  const durationMs = Date.now() - startMs;

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    pushed: result.data.pushed,
    errors: result.data.errors,
    duration_ms: durationMs,
  });
}
