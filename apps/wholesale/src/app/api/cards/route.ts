import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cards } from "@/lib/db/schema";
import { like, or } from "drizzle-orm";
import { auth } from "@/lib/auth";
import {
  LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED,
  LEGACY_CATALOG_EXTERNAL_PUBLICATION_REASON,
} from "@/lib/source-publication-policy";

export async function GET(req: NextRequest) {
  if (!LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED) {
    return NextResponse.json(
      { publication_status: "blocked", reason: LEGACY_CATALOG_EXTERNAL_PUBLICATION_REASON, count: 0, items: [] },
      { status: 503 },
    );
  }
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
