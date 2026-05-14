import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cards, games } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authenticateApiKey } from "../../auth";
import { priceForChannel } from "@/lib/channel-pricing";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  try {
    const apiKey = await authenticateApiKey(req);
    if (apiKey instanceof NextResponse) return apiKey;

    const { sku } = await params;
    // Channel is determined by the authenticating API key; the `?channel`
    // query param is no longer honoured. A key issued for channel X can
    // only read channel X's pricing. Mismatch is a warn-and-proceed.
    const queryChannel = req.nextUrl.searchParams.get("channel");
    if (queryChannel && queryChannel !== apiKey.channel) {
      console.warn(
        `[/api/v1/prices/[sku]] Ignoring ?channel=${queryChannel} for key with channel=${apiKey.channel}. ` +
        `Channel is now sourced from the API key; rotate the key if a different channel is needed.`,
      );
    }
    const channel = apiKey.channel;

    const rows = await db
      .select({
        sku: cards.sku,
        cardNumber: cards.cardNumber,
        name: cards.name,
        nameEn: cards.nameEn,
        priceGbp: cards.price,
        cardrushJpy: cards.cardrushJpy,
        gbpJpyRate: cards.gbpJpyRate,
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

    // Mirror the list endpoint's channel-aware path so a single-SKU read
    // and a list read agree on `channel_price` for the same card + channel.
    // Without this, the storefront product page (which always sends
    // ?channel=cambridgetcg) silently falls back to its local Appraiser —
    // a different formula than the server's, with measurable drift.
    // See docs/connections/the-pricing-arrow.md (S17) Act 5.
    const needsChannelPrice = channel !== "wholesale";
    let channelPrice: number | null = null;
    if (needsChannelPrice && r.cardrushJpy && r.gbpJpyRate) {
      const breakdown = await priceForChannel(
        r.cardrushJpy,
        r.gbpJpyRate,
        channel,
        r.category,
      );
      channelPrice = breakdown.price;
    }

    return NextResponse.json({
      sku: r.sku,
      card_number: r.cardNumber,
      name: r.nameEn || r.name,
      name_en: r.nameEn,
      price_gbp: r.priceGbp,
      ...(needsChannelPrice && { channel_price: channelPrice ?? r.priceGbp }),
      ...(needsChannelPrice && { channel }),
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
