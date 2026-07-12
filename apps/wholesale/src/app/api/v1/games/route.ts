import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { games, cards } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { authenticateApiKey } from "../auth";
import { redactInternalError } from "@/lib/public-errors";

export async function GET(req: NextRequest) {
  try {
    const apiKey = await authenticateApiKey(req);
    if (apiKey instanceof NextResponse) return apiKey;

    const rows = await db
      .select({
        code: games.code,
        name: games.name,
        slug: games.slug,
        imageUrl: games.imageUrl,
        cardCount: sql<number>`cast(count(${cards.id}) as integer)`,
      })
      .from(games)
      .leftJoin(cards, eq(cards.gameId, games.id))
      .where(eq(games.active, true))
      .groupBy(games.id)
      .orderBy(games.sortOrder);

    return NextResponse.json({
      games: rows.map((r) => ({
        code: r.code,
        name: r.name,
        slug: r.slug,
        image_url: r.imageUrl,
        card_count: r.cardCount,
      })),
    });
  } catch (err) {
    const error = redactInternalError("api/v1/games", err);
    return NextResponse.json({ error }, { status: 500 });
  }
}
