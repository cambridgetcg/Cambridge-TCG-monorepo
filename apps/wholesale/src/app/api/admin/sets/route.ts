import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sets } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get("gameId");

  let query = db.select().from(sets).orderBy(asc(sets.sortOrder));
  if (gameId) {
    query = query.where(eq(sets.gameId, Number(gameId))) as typeof query;
  }

  const result = await query;
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { gameId, code, name, releaseDate } = body;

  if (!gameId || !code || !name) {
    return NextResponse.json({ error: "gameId, code, and name are required" }, { status: 400 });
  }

  await db.insert(sets).values({ gameId, code, name, releaseDate, sortOrder: 0 });
  return NextResponse.json({ success: true }, { status: 201 });
}
