import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cards } from "@/lib/db/schema";
import { ilike, or, gt, sql, SQL } from "drizzle-orm";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  const stocked = req.nextUrl.searchParams.get("stocked") === "1";

  const conditions: SQL[] = [];

  if (q) {
    const pattern = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    conditions.push(
      or(
        ilike(cards.cardNumber, pattern),
        ilike(cards.name, pattern),
        ilike(cards.setName, pattern),
        ilike(cards.sku, pattern),
      )!,
    );
  }

  if (stocked && !q) {
    conditions.push(or(gt(cards.stock, 0), gt(cards.pendingStock, 0))!);
  }

  if (conditions.length === 0) {
    return NextResponse.json([]);
  }

  const where = conditions.length === 1
    ? conditions[0]
    : conditions.reduce((a, b) => sql`${a} AND ${b}`);

  const result = await db
    .select({
      id: cards.id,
      cardNumber: cards.cardNumber,
      sku: cards.sku,
      name: cards.name,
      nameEn: cards.nameEn,
      setCode: cards.setCode,
      imageUrl: cards.imageUrl,
      stock: cards.stock,
      pendingStock: cards.pendingStock,
    })
    .from(cards)
    .where(where)
    .orderBy(cards.cardNumber)
    .limit(100);

  return NextResponse.json(result);
}
