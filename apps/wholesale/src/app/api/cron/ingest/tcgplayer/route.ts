/**
 * POST /api/cron/ingest/tcgplayer
 *
 * TCGplayer ingestion endpoint — three modes via ?mode= query param:
 *
 *   ?mode=catalog       Catalog walk (seed-set / weekly bulk). Writes
 *                       cards.tcgplayer_product_id + card_tcgplayer_sku_ids.
 *                       Optional ?categories=68,3 narrowing.
 *
 *   ?mode=live-pricing  5-min hot-watch refresh during US trading hours.
 *                       Scopes to active inventory + pending stock.
 *                       Default condition: nm. Writes price_archive rows.
 *
 *   ?mode=bulk-pricing  Nightly full snapshot (all mapped cards × all
 *                       configured conditions). Same writer as live-pricing,
 *                       wider scope.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}  OR  Vercel Cron header.
 *
 * Query params (shared):
 *   ?triggeredBy=cron|admin|webhook    (defaults to 'cron')
 *   ?dryRun=1                          (caps the scope; useful for first prod run)
 *   ?maxProducts=NN                    (catalog mode only)
 *   ?maxSkus=NN                        (pricing modes only)
 *   ?conditions=nm,lp                  (pricing modes only; defaults to 'nm' on v1)
 *   ?categories=68,3                   (catalog mode only)
 *   ?groups=23745                      (catalog mode only)
 *
 * Designed in `docs/connections/the-tcgplayer-alignment.md` (kingdom-NNN) §4.
 *
 * Requires migration `drizzle/0015_tcgplayer_cross_source.sql` to be applied
 * AND TCGPLAYER_CLIENT_ID + TCGPLAYER_CLIENT_SECRET env vars set. Until those
 * preconditions land, the route compiles but returns 500 with an actionable
 * error message.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  runTcgplayerCatalog,
  runTcgplayerPricing,
} from "@/lib/ingest/tcgplayer";

export const maxDuration = 800; // seconds — Vercel fluid-function limit

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

function parseIntList(value: string | null): number[] | undefined {
  if (!value) return undefined;
  const list = value
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
  return list.length > 0 ? list : undefined;
}

function parseStringList(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const list = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return list.length > 0 ? list : undefined;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorizeCron(req)) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "cron secret required" } },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "live-pricing";
  const dryRun = url.searchParams.get("dryRun") === "1";
  const triggeredByParam = url.searchParams.get("triggeredBy") as
    | "cron"
    | "admin"
    | "webhook"
    | null;
  const triggeredBy = triggeredByParam ?? "cron";

  try {
    switch (mode) {
      case "catalog": {
        const categories = parseIntList(url.searchParams.get("categories"));
        const groups = parseIntList(url.searchParams.get("groups"));
        const maxProducts = dryRun
          ? parseInt(url.searchParams.get("maxProducts") ?? "20", 10)
          : url.searchParams.get("maxProducts")
            ? parseInt(url.searchParams.get("maxProducts")!, 10)
            : undefined;
        const result = await runTcgplayerCatalog({
          categories,
          groups,
          triggeredBy,
          maxProducts,
        });
        return NextResponse.json({ ok: true, mode, dryRun, summary: result });
      }

      case "live-pricing": {
        const maxSkus = dryRun
          ? parseInt(url.searchParams.get("maxSkus") ?? "50", 10)
          : url.searchParams.get("maxSkus")
            ? parseInt(url.searchParams.get("maxSkus")!, 10)
            : undefined;
        const conditions = parseStringList(url.searchParams.get("conditions"));
        const result = await runTcgplayerPricing({
          scope: "hot-watch",
          triggeredBy,
          maxSkus,
          conditions,
        });
        return NextResponse.json({ ok: true, mode, dryRun, summary: result });
      }

      case "bulk-pricing": {
        const maxSkus = dryRun
          ? parseInt(url.searchParams.get("maxSkus") ?? "200", 10)
          : url.searchParams.get("maxSkus")
            ? parseInt(url.searchParams.get("maxSkus")!, 10)
            : undefined;
        const conditions = parseStringList(url.searchParams.get("conditions"));
        const result = await runTcgplayerPricing({
          scope: "all-mapped",
          triggeredBy,
          maxSkus,
          conditions,
        });
        return NextResponse.json({ ok: true, mode, dryRun, summary: result });
      }

      default:
        return NextResponse.json(
          {
            error: {
              code: "INVALID_INPUT",
              message: `unknown mode '${mode}'; expected catalog | live-pricing | bulk-pricing`,
            },
          },
          { status: 400 },
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        mode,
        error: { code: "INTERNAL", message },
      },
      { status: 500 },
    );
  }
}

// Convenience: GET wraps POST so an operator can fire from a browser with
// the secret in the query string (matches the cardrush v2 route's pattern).
export const GET = POST;
