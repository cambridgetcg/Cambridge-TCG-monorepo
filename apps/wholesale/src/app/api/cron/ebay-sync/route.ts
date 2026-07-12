/**
 * GET /api/cron/ebay-sync
 *
 * Cron-shaped handler, but route-live and UNSCHEDULED: there is no
 * `/api/cron/ebay-sync` entry in apps/wholesale/vercel.json, so nothing
 * invokes this on a cadence today. It runs only when called manually (with
 * cron auth) or the day an operator adds a schedule to vercel.json.
 * Auth: Authorization: Bearer {CRON_SECRET}.
 *
 * Pulls recent eBay orders, then pushes price + stock for all active
 * listings to eBay.
 *
 * Ported from the legacy tcg-wholesale repo (4013a78, 2026-06-10) as the
 * last functional divergence before the monorepo became the production
 * source of truth; inline secret check swapped for the house helper.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cards, games } from "@/lib/db/schema";
import { gt } from "drizzle-orm";
import { pullOrders, bulkPushListings } from "@/lib/channels/ebay";
import { requireCronAuth } from "@/lib/cron-auth";
import { redactInternalError } from "@/lib/public-errors";
import {
  LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED,
  LEGACY_CATALOG_EXTERNAL_PUBLICATION_REASON,
} from "@/lib/source-publication-policy";

export const maxDuration = 300; // 5-minute Vercel function timeout

export async function GET(req: NextRequest) {
  if (!LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED) {
    return NextResponse.json(
      { ok: false, publication_status: "blocked", reason: LEGACY_CATALOG_EXTERNAL_PUBLICATION_REASON },
      { status: 503 },
    );
  }
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const startTs = new Date().toISOString();
  console.log(`[cron/ebay-sync] Starting sync at ${startTs}`);

  try {
    // 1. Pull orders from the last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const ordersResult = await pullOrders(since);

    if (!ordersResult.ok) {
      const error = redactInternalError(
        "cron/ebay-sync pull orders",
        ordersResult.error,
      );
      return NextResponse.json(
        { ok: false, error },
        { status: 502 },
      );
    }

    console.log(
      `[cron/ebay-sync] Pulled ${ordersResult.data.length} orders since ${since.toISOString()}`,
    );

    // 2. Push all in-stock priced cards to eBay
    const rows = await db
      .select({
        sku: cards.sku,
        price: cards.price,
        stock: cards.stock,
      })
      .from(cards)
      .innerJoin(games, gt(cards.gameId, 0))
      .where(gt(cards.stock, 0));

    const items = rows
      .filter((r) => r.price && r.price > 0)
      .map((r) => ({
        sku: r.sku,
        priceGbp: r.price!,
        stock: r.stock,
      }));

    const pushResult = await bulkPushListings(items);

    const endTs = new Date().toISOString();

    if (!pushResult.ok) {
      const error = redactInternalError(
        "cron/ebay-sync push listings",
        pushResult.error,
      );
      return NextResponse.json(
        { ok: false, error },
        { status: 502 },
      );
    }

    console.log(
      `[cron/ebay-sync] Completed at ${endTs} -- pushed ${pushResult.data.pushed}, errors ${pushResult.data.errors.length}`,
    );

    return NextResponse.json({
      ok: true,
      startTs,
      endTs,
      ordersPulled: ordersResult.data.length,
      listingsPushed: pushResult.data.pushed,
      pushErrors: pushResult.data.errors.map(({ sku, error }) => ({
        sku,
        error: redactInternalError("cron/ebay-sync listing", error),
      })),
    });
  } catch (err) {
    const error = redactInternalError("cron/ebay-sync", err);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
