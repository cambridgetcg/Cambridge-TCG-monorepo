import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cards } from "@/lib/db/schema";
import { like, or } from "drizzle-orm";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();

  let result;
  if (q) {
    const pattern = `%${q}%`;
    result = await db
      .select()
      .from(cards)
      .where(or(like(cards.cardNumber, pattern), like(cards.name, pattern), like(cards.setName, pattern)))
      .orderBy(cards.cardNumber);
  } else {
    result = await db.select().from(cards).orderBy(cards.cardNumber);
  }

  return NextResponse.json(result);
}
