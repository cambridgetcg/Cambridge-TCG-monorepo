/**
 * POST /api/cron/ingest/ebay
 *
 * ── Greeting (kingdom-083) ────────────────────────────────────────────
 *
 * You wait at the route. Three tiers walk through you on different
 * schedules — top every 30 minutes, mid every 4 hours, all once a day.
 * The CRON_SECRET gate keeps you honest; the x-vercel-cron header keeps
 * you trusted. We anticipated you when we drafted this header in kingdom-082;
 * we welcome you when the operator un-comments the vercel.json line.
 * Until then you wait, route-live but unscheduled — the most polite
 * kind of readiness. (See WELCOMES["infrastructure.ebay-cron-route"].)
 *
 * ── What you do ───────────────────────────────────────────────────────
 *
 * Tiered eBay Browse-API aggregation. Walks `ebay_watch_list` filtered
 * by priority tier, calls `runEbaySnapshot()`, persists rows to
 * `ebay_listing_observation` + `ingest_quarantine`.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}  OR  Vercel Cron header.
 *
 * Query params:
 *   ?tier=top|mid|all       — priority bucket (default 'all')
 *   ?maxSkus=NN             — override default cap for the tier
 *   ?marketplaces=GB,US,DE  — comma-separated EBAY_<CC> codes (default GB only)
 *   ?dryRun=1               — caps maxSkus to 20 for review
 *   ?mock=1                 — skip OAuth + network; yield no rows (CI / smoke)
 *   ?triggeredBy=…          — override triggered_by ('cron' default, 'admin' for one-offs)
 *
 * Designed in `docs/connections/the-ebay-alignment.md` §3b (kingdom-082).
 *
 * Requires migration `drizzle/0016_ebay_observations.sql` to be applied.
 * Until then this route compiles but the first INSERT against
 * ebay_listing_observation will fail at runtime — substrate-honest about
 * the dependency.
 *
 * The cron entries in `vercel.json` are shipped commented-out by default —
 * operator un-comments them after verifying the first manual invocation.
 */

import { NextRequest, NextResponse } from "next/server";
import { runEbaySnapshot, type EbayTier } from "@/lib/ebay-snapshot";
import type { EbayMarketplaceId } from "@cambridge-tcg/data-ingest";

export const maxDuration = 800; // seconds — Vercel fluid-function ceiling

const VALID_TIERS: readonly EbayTier[] = ["top", "mid", "all"] as const;
const VALID_MARKETPLACE_PREFIX = "EBAY_";

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

function parseTier(raw: string | null): EbayTier {
  if (raw && (VALID_TIERS as readonly string[]).includes(raw)) {
    return raw as EbayTier;
  }
  return "all";
}

function parseMarketplaces(raw: string | null): readonly EbayMarketplaceId[] {
  if (!raw) return ["EBAY_GB"];
  const tokens = raw
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length > 0);
  const valid: EbayMarketplaceId[] = [];
  for (const t of tokens) {
    const id = t.startsWith(VALID_MARKETPLACE_PREFIX) ? t : `${VALID_MARKETPLACE_PREFIX}${t}`;
    // Light validation — any EBAY_<2-letter-country> shape passes.
    if (/^EBAY_[A-Z]{2}$/.test(id)) {
      valid.push(id as EbayMarketplaceId);
    }
  }
  return valid.length > 0 ? valid : ["EBAY_GB"];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorizeCron(req)) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "cron secret required" } },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const tier = parseTier(url.searchParams.get("tier"));
  const marketplaces = parseMarketplaces(url.searchParams.get("marketplaces"));
  const dryRun = url.searchParams.get("dryRun") === "1";
  const mock = url.searchParams.get("mock") === "1";
  const maxSkusParam = url.searchParams.get("maxSkus");
  const triggeredByParam = url.searchParams.get("triggeredBy") as
    | "cron"
    | "admin"
    | "webhook"
    | null;

  const maxSkus = dryRun
    ? parseInt(maxSkusParam ?? "20", 10)
    : maxSkusParam
      ? parseInt(maxSkusParam, 10)
      : undefined;

  try {
    const result = await runEbaySnapshot({
      tier,
      marketplaces,
      maxSkus,
      mock,
      triggeredBy: triggeredByParam ?? "cron",
    });

    return NextResponse.json({
      ok: true,
      result,
      dryRun,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INTERNAL", message },
      },
      { status: 500 },
    );
  }
}

// GET as a convenience for operator manual triggers.
export const GET = POST;
