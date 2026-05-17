/**
 * POST /api/cron/discover/tcgcollector
 *
 * Sitemap+JSON-LD discovery for TCGCollector — the first vendor in the
 * sitemap-discovery strategy chosen on 2026-05-17. Walks the public
 * sitemap-index, fetches each product page (capped), parses Schema.org
 * JSON-LD Product/Offer blocks, and records:
 *   - one `ingest_run` row per run (counters + events jsonb)
 *   - one `ingest_quarantine` row per row that failed (substrate-honest
 *     reasons: http_<status>, fetch_error, no_jsonld_product_found,
 *     no_offer_or_unparseable_price)
 *
 * **V1**: discovery + parse only — no price_archive INSERTs yet. The
 * cron response carries a sample of the first 10 parsed products so the
 * operator can verify the pipeline ships substrate-honest results before
 * connecting to the canonical-SKU layer.
 *
 * Auth: Authorization: Bearer {CRON_SECRET} OR Vercel Cron header.
 *
 * Query params:
 *   ?dryRun=1                 — walk + parse, but skip quarantine INSERTs
 *   ?maxUrls=N                — cap URLs fetched (default 100; max 5000)
 *   ?triggeredBy=cron|admin|webhook
 *
 * Companion: `apps/wholesale/src/lib/tcgcollector-discovery.ts` (runner).
 * Doctrine: `docs/connections/the-sitemap-discovery.md`.
 */

import { NextRequest, NextResponse } from "next/server";
import { runTcgcollectorDiscovery } from "@/lib/tcgcollector-discovery";
import { requireCronAuth } from "@/lib/cron-auth";

export const maxDuration = 800;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const maxUrlsParam = url.searchParams.get("maxUrls");
  const triggeredByParam = url.searchParams.get("triggeredBy") as
    | "cron"
    | "admin"
    | "webhook"
    | null;

  const maxUrls = maxUrlsParam
    ? Math.max(1, Math.min(parseInt(maxUrlsParam, 10) || 100, 5000))
    : undefined;

  try {
    const summary = await runTcgcollectorDiscovery({
      triggeredBy: triggeredByParam ?? "cron",
      dryRun,
      maxUrls,
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
