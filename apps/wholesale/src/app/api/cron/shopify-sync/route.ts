/**
 * GET /api/cron/shopify-sync
 *
 * Vercel cron handler — runs daily at 04:00 UTC (see vercel.json).
 * Auth: Authorization: Bearer {CRON_SECRET}  OR  ?secret={CRON_SECRET}
 *
 * Runs mode='full' (prices + stock update only — does NOT create missing listings).
 * Listing creation is a manual operation via POST /api/admin/shopify-sync.
 */

import { NextRequest, NextResponse } from "next/server";
import { runShopifySync } from "@/lib/shopify-sync";
import { requireCronAuth } from "@/lib/cron-auth";
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
  console.log(`[cron/shopify-sync] Starting daily sync at ${startTs}`);

  try {
    const result = await runShopifySync({ mode: "full" });
    const endTs = new Date().toISOString();

    console.log(`[cron/shopify-sync] Completed at ${endTs}`, result);

    return NextResponse.json({ ok: true, startTs, endTs, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/shopify-sync] Failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
