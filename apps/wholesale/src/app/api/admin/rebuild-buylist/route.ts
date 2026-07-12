/**
 * POST /api/admin/rebuild-buylist
 *
 * Manual trigger for admin users — rebuilds and pushes the buylist immediately.
 *
 * Returns the full build result including stats.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildBuylist } from "@/lib/buylist-builder";
import { writeBuylistToKV } from "@/lib/cloudflare-kv";
import { redactInternalError } from "@/lib/public-errors";
import {
  LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED,
  LEGACY_CATALOG_EXTERNAL_PUBLICATION_REASON,
} from "@/lib/source-publication-policy";

export const maxDuration = 60;

export async function POST(_req: NextRequest) {
  if (!LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED) {
    return NextResponse.json(
      { ok: false, publication_status: "blocked", reason: LEGACY_CATALOG_EXTERNAL_PUBLICATION_REASON },
      { status: 503 },
    );
  }
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const start = Date.now();
  console.log(
    `[admin/rebuild-buylist] Manual trigger by ${session.user.email} at ${new Date().toISOString()}`
  );

  try {
    const data = await buildBuylist();
    await writeBuylistToKV(data);

    const durationMs = Date.now() - start;
    console.log(`[admin/rebuild-buylist] Done in ${durationMs}ms — ${data.stats.totalCards} items`);

    return NextResponse.json({
      ok: true,
      generatedAt: data.generatedAt,
      itemCount: data.stats.totalCards,
      durationMs,
      stats: data.stats,
      fxRate: data.fxRate,
      setsIncluded: Object.keys(data.sets).length,
    });
  } catch (err) {
    const error = redactInternalError("admin/rebuild-buylist", err);
    const durationMs = Date.now() - start;
    return NextResponse.json({ ok: false, error, durationMs }, { status: 500 });
  }
}
