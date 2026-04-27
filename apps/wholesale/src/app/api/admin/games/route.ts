import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { games, sets } from "@/lib/db/schema";
import { asc, count } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const allGames = await db
    .select({
      id: games.id,
      code: games.code,
      name: games.name,
      slug: games.slug,
      imageUrl: games.imageUrl,
      sortOrder: games.sortOrder,
      active: games.active,
    })
    .from(games)
    .orderBy(asc(games.sortOrder));

  // Get set counts per game
  const setCounts = await db
    .select({ gameId: sets.gameId, count: count() })
    .from(sets)
    .groupBy(sets.gameId);
  const setCountMap = Object.fromEntries(setCounts.map(r => [r.gameId, r.count]));

  const result = allGames.map(g => ({
    ...g,
    setCount: setCountMap[g.id] || 0,
  }));

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { code, name, slug, active } = body;

  if (!code || !name || !slug) {
    return NextResponse.json({ error: "code, name, and slug are required" }, { status: 400 });
  }

  await db.insert(games).values({ code, name, slug, active: active ?? true, sortOrder: 0 });
  return NextResponse.json({ success: true }, { status: 201 });
}
