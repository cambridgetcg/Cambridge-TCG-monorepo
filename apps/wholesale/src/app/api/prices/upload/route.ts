import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cards } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { calculatePriceByCategory } from "@/lib/pricing";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const text = await file.text();
  const lines = text.trim().split("\n");
  const header = lines[0].toLowerCase();

  if (!header.includes("sku") || !header.includes("jpy_price")) {
    return NextResponse.json(
      { error: "CSV must have columns: sku, jpy_price" },
      { status: 400 },
    );
  }

  const cols = header.split(",").map((c) => c.trim());
  const skuIdx = cols.indexOf("sku");
  const jpyIdx = cols.indexOf("jpy_price");
  const rateIdx = cols.indexOf("gbp_jpy_rate");

  const now = new Date();
  let updated = 0;
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",").map((v) => v.trim());
    const sku = vals[skuIdx];
    const jpyPrice = parseInt(vals[jpyIdx]);
    const rate = rateIdx >= 0 ? parseFloat(vals[rateIdx]) : undefined;

    if (!sku || isNaN(jpyPrice)) {
      errors.push(`Row ${i + 1}: invalid data`);
      continue;
    }

    const cardNumber = sku.split("-").slice(1, 3).join("-") || sku;

    if (rate) {
      const category = sku.startsWith("SEALED-") ? "sealed" : "singles";
      const price = calculatePriceByCategory(jpyPrice, rate, category);
      await db
        .insert(cards)
        .values({
          cardNumber,
          sku,
          cardrushJpy: jpyPrice,
          gbpJpyRate: rate,
          baseGbp: price.baseGbp,
          price: price.price,
          lastSyncedAt: now,
        })
        .onConflictDoUpdate({
          target: cards.sku,
          set: {
            cardrushJpy: jpyPrice,
            gbpJpyRate: rate,
            baseGbp: price.baseGbp,
            price: price.price,
            lastSyncedAt: now,
          },
        });
    } else {
      await db
        .insert(cards)
        .values({
          cardNumber,
          sku,
          cardrushJpy: jpyPrice,
          lastSyncedAt: now,
        })
        .onConflictDoUpdate({
          target: cards.sku,
          set: { cardrushJpy: jpyPrice, lastSyncedAt: now },
        });
    }
    updated++;
  }

  return NextResponse.json({ updated, errors, timestamp: now });
}
