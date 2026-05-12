import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cards, games, sets, priceArchive } from "@/lib/db/schema";
import { fetchPriceFeed, parseSkuGame } from "@/lib/s3";
import { calculatePrice } from "@/lib/pricing";
import { eq, and, count } from "drizzle-orm";

export async function POST() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const rows = await fetchPriceFeed();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    let synced = 0;

    // Get-or-create the game record
    const gameCode = "onepiece"; // all current data is One Piece
    let [game] = await db.select().from(games).where(eq(games.code, gameCode)).limit(1);
    if (!game) {
      await db.insert(games).values({
        code: "onepiece", name: "One Piece", slug: "one-piece", active: true, sortOrder: 0,
      });
      [game] = await db.select().from(games).where(eq(games.code, gameCode)).limit(1);
    }

    const setCache = new Map<string, number>();

    for (const row of rows) {
      const price = calculatePrice(row.cardrushJpy, row.gbpToJpy);

      // Get-or-create the set record
      if (!setCache.has(row.setCode)) {
        let [set] = await db.select().from(sets).where(eq(sets.code, row.setCode)).limit(1);
        if (!set) {
          await db.insert(sets).values({
            gameId: game!.id, code: row.setCode, name: row.setName, sortOrder: 0,
          });
          [set] = await db.select().from(sets).where(eq(sets.code, row.setCode)).limit(1);
        }
        setCache.set(row.setCode, set!.id);
      }

      await db.insert(cards)
        .values({
          cardNumber: row.cardNumber,
          sku: row.sku,
          name: row.cardNumber,
          setCode: row.setCode,
          setName: row.setName,
          cardrushJpy: row.cardrushJpy,
          gbpJpyRate: row.gbpToJpy,
          baseGbp: price.baseGbp,
          price: price.price,
          ebayItemNumber: row.ebayItemNumber,
          lastSyncedAt: now,
          gameId: game!.id,
          setId: setCache.get(row.setCode)!,
          category: "singles" as const,
        })
        .onConflictDoUpdate({
          target: cards.sku,
          set: {
            cardrushJpy: row.cardrushJpy,
            gbpJpyRate: row.gbpToJpy,
            baseGbp: price.baseGbp,
            price: price.price,
            ebayItemNumber: row.ebayItemNumber,
            lastSyncedAt: now,
            gameId: game!.id,
            setId: setCache.get(row.setCode)!,
            category: "singles" as const,
          },
        });

      // Phase 4 of kingdom-049: per-row priceHistory inserts removed.
      // The post-sync `runDailySnapshot` call below populates `priceArchive`
      // (the canonical history) for every card in the synced game. The
      // dropped `priceHistory` table carried only JPY + rate; the archive
      // carries those plus baseGbp + price, so nothing is lost.

      synced++;
    }

    // ── Post-sync: ensure price_archive is up-to-date for One Piece ──────
    // Only run if today's snapshot hasn't already been written for this game.
    let snapshotResult = null;
    try {
      const [existing] = await db
        .select({ cnt: count() })
        .from(priceArchive)
        .where(
          and(
            eq(priceArchive.snapshotDate, today),
          ),
        );

      if (!existing || Number(existing.cnt) === 0) {
        const { runDailySnapshot } = await import("@/lib/price-snapshot");
        snapshotResult = await runDailySnapshot({ gameIds: [game!.id] });
      } else {
        snapshotResult = { skipped: true, reason: "already run today" };
      }
    } catch (snapErr) {
      // Non-fatal: sync succeeded, snapshot can be retried by cron
      console.error("[sync] price-snapshot post-sync failed:", snapErr);
      snapshotResult = { error: String(snapErr) };
    }

    return NextResponse.json({ synced, timestamp: now, snapshot: snapshotResult });
  } catch (error) {
    return NextResponse.json(
      { error: "Sync failed", details: String(error) },
      { status: 500 },
    );
  }
}
