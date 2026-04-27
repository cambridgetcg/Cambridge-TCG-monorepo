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

export const maxDuration = 60;

export async function POST(_req: NextRequest) {
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
    const msg = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - start;
    console.error("[admin/rebuild-buylist] Failed:", msg);
    return NextResponse.json({ ok: false, error: msg, durationMs }, { status: 500 });
  }
}
