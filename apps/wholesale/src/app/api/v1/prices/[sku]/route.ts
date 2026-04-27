import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cards, games } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authenticateApiKey, unauthorized } from "../../auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  try {
    const apiKey = await authenticateApiKey(req);
    if (!apiKey) return unauthorized();

    const { sku } = await params;

    const rows = await db
      .select({
        sku: cards.sku,
        cardNumber: cards.cardNumber,
        name: cards.name,
        nameEn: cards.nameEn,
        priceGbp: cards.price,
        stock: cards.stock,
        pendingStock: cards.pendingStock,
        imageUrl: cards.imageUrl,
        setCode: cards.setCode,
        setName: cards.setName,
        rarity: cards.rarity,
        category: cards.category,
        gameCode: games.code,
        updatedAt: cards.lastSyncedAt,
      })
      .from(cards)
      .leftJoin(games, eq(games.id, cards.gameId))
      .where(eq(cards.sku, sku))
      .limit(1);

    if (!rows.length) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const r = rows[0];
    return NextResponse.json({
      sku: r.sku,
      card_number: r.cardNumber,
      name: r.nameEn || r.name,
      name_en: r.nameEn,
      price_gbp: r.priceGbp,
      stock: r.stock,
      pending_stock: r.pendingStock,
      image_url: r.imageUrl,
      set_code: r.setCode,
      set_name: r.setName,
      rarity: r.rarity,
      category: r.category,
      game_code: r.gameCode,
      updated_at: r.updatedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/prices/[sku]] Error:", message);
    return NextResponse.json({ error: "Internal error", detail: message }, { status: 500 });
  }
}
