import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { wantedCards } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redactInternalError } from "@/lib/public-errors";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = parseInt(session.user.id);
  const rows = await db
    .select({ cardId: wantedCards.cardId })
    .from(wantedCards)
    .where(eq(wantedCards.clientId, clientId));

  return NextResponse.json(rows.map((r) => r.cardId));
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const clientId = parseInt(session.user.id);
    const body = await req.json();
    const cardId = body?.cardId;
    if (!cardId || typeof cardId !== "number") {
      return NextResponse.json({ error: "cardId required" }, { status: 400 });
    }

    // Toggle: delete if exists, insert if not
    const existing = await db
      .select({ id: wantedCards.id })
      .from(wantedCards)
      .where(and(eq(wantedCards.clientId, clientId), eq(wantedCards.cardId, cardId)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .delete(wantedCards)
        .where(and(eq(wantedCards.clientId, clientId), eq(wantedCards.cardId, cardId)));
      return NextResponse.json({ wanted: false });
    } else {
      await db.insert(wantedCards).values({ clientId, cardId });
      return NextResponse.json({ wanted: true });
    }
  } catch (err) {
    const error = redactInternalError("api/wanted", err);
    return NextResponse.json(
      { error },
      { status: 500 },
    );
  }
}
