import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sets, cards, games } from "@/lib/db/schema";
import { eq, and, sql, or } from "drizzle-orm";
import { authenticateApiKey } from "../auth";

export async function GET(req: NextRequest) {
  try {
    const apiKey = await authenticateApiKey(req);
    if (apiKey instanceof NextResponse) return apiKey;

    const gameCode = req.nextUrl.searchParams.get("game");

    const conditions = [eq(sets.active, true)];

    if (gameCode) {
      const game = await db
        .select({ id: games.id })
        .from(games)
        .where(or(eq(games.code, gameCode), eq(games.slug, gameCode)))
        .limit(1);
      if (!game.length) {
        return NextResponse.json({ error: `Game not found: ${gameCode}` }, { status: 404 });
      }
      conditions.push(eq(sets.gameId, game[0].id));
    }

    const rows = await db
      .select({
        code: sets.code,
        name: sets.name,
        gameCode: games.code,
        cardCount: sql<number>`cast(count(${cards.id}) as integer)`,
        releaseDate: sets.releaseDate,
      })
      .from(sets)
      .innerJoin(games, eq(games.id, sets.gameId))
      .leftJoin(cards, eq(cards.setId, sets.id))
      .where(and(...conditions))
      .groupBy(sets.id, games.code)
      .orderBy(games.code, sets.sortOrder);

    return NextResponse.json({
      sets: rows.map((r) => ({
        code: r.code,
        name: r.name,
        game_code: r.gameCode,
        card_count: r.cardCount,
        release_date: r.releaseDate,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/sets] Error:", message);
    return NextResponse.json({ error: "Internal error", detail: message }, { status: 500 });
  }
}
