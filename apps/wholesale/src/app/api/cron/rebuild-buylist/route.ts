/**
 * GET /api/cron/rebuild-buylist
 *
 * Vercel cron handler — runs daily at 03:00 UTC (one hour after price-snapshot).
 * Auth: Authorization: Bearer {CRON_SECRET}
 *
 * Returns: { ok, generatedAt, itemCount, durationMs }
 */

import { NextRequest, NextResponse } from "next/server";
import { buildBuylist } from "@/lib/buylist-builder";
import { writeBuylistToKV } from "@/lib/cloudflare-kv";
import { requireCronAuth } from "@/lib/cron-auth";
import { redactInternalError } from "@/lib/public-errors";
import {
  LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED,
  LEGACY_CATALOG_EXTERNAL_PUBLICATION_REASON,
} from "@/lib/source-publication-policy";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED) {
    return NextResponse.json(
      { ok: false, publication_status: "blocked", reason: LEGACY_CATALOG_EXTERNAL_PUBLICATION_REASON },
      { status: 503 },
    );
  }
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const start = Date.now();
  console.log(`[cron/rebuild-buylist] Starting at ${new Date().toISOString()}`);

  try {
    const data = await buildBuylist();
    await writeBuylistToKV(data);

    const durationMs = Date.now() - start;
    console.log(`[cron/rebuild-buylist] Done in ${durationMs}ms — ${data.stats.totalCards} items`);

    return NextResponse.json({
      ok: true,
      generatedAt: data.generatedAt,
      itemCount: data.stats.totalCards,
      durationMs,
    });
  } catch (err) {
    const error = redactInternalError("cron/rebuild-buylist", err);
    const durationMs = Date.now() - start;
    return NextResponse.json({ ok: false, error, durationMs }, { status: 500 });
  }
}
