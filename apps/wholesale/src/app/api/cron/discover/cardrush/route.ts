/**
 * POST /api/cron/discover/cardrush
 *
 * Daily cardrush catalog discovery. Walks /sitemap.xml on every confirmed
 * subdomain, diffs against `cards.cardrush_url`, fetches new product
 * pages, INSERTs cards with parsed set_code + card_number + rarity +
 * image_url. The price-snapshot cron then picks up the new cards on its
 * next run.
 *
 * Auth: Authorization: Bearer {CRON_SECRET} OR Vercel Cron header.
 *
 * Query params:
 *   ?dryRun=1                 — walk + diff, but skip product fetches + INSERTs
 *   ?maxNewPerSubdomain=N     — cap new-product fetches per subdomain (default 500)
 *   ?onlySubdomain=cardrush-op.jp  — single-subdomain run (for one-off ops)
 *   ?triggeredBy=cron|admin|webhook
 *
 * Kingdom-087. Companion to /api/cron/ingest/cardrush (price snapshot).
 * Designed in docs/connections/the-cardrush-discovery.md.
 */

import { NextRequest, NextResponse } from "next/server";
import { runCardRushDiscovery } from "@/lib/cardrush-discovery";

export const maxDuration = 800;

function authorizeCron(req: NextRequest): boolean {
  if (req.headers.get("x-vercel-cron") === "true") return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorizeCron(req)) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "cron secret required" } },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const maxNewParam = url.searchParams.get("maxNewPerSubdomain");
  const onlySubdomain = url.searchParams.get("onlySubdomain") ?? undefined;
  const triggeredByParam = url.searchParams.get("triggeredBy") as
    | "cron"
    | "admin"
    | "webhook"
    | null;

  const maxNewPerSubdomain = maxNewParam
    ? Math.max(1, Math.min(parseInt(maxNewParam, 10) || 500, 5000))
    : undefined;

  try {
    const summary = await runCardRushDiscovery({
      triggeredBy: triggeredByParam ?? "cron",
      dryRun,
      maxNewPerSubdomain,
      onlySubdomain,
    });
    return NextResponse.json({ ok: true, summary, dryRun });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message } },
      { status: 500 },
    );
  }
}

export const GET = POST;
