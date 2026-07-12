/**
 * /api/v1/sold-comps — the kingdom's one CC0 sold-price dataset.
 *
 * Anonymised aggregate sold prices from the kingdom's OWN realised
 * transactions: completed P2P escrow trades + settled auctions. This is
 * the positive counterpart to the source-intake framework's honest blocks
 * (Vinted, eBay-sold): the framework proves what we may not take from
 * third parties; this endpoint is what we can freely give, because it is
 * our own transaction record.
 *
 * Safe by construction. Two rings of protection:
 *   1. The p2p_sold_comps view (drizzle/0116) selects only
 *      (sku, condition, price_gbp, sale_channel, sold_at) — no identity,
 *      money, or logistics field is even readable.
 *   2. lib/sold-comps/query.ts publishes only (sku, condition) buckets
 *      with >=5 realised sales (K-anonymity); thinner buckets are
 *      suppressed to a coarse "below coverage threshold" total.
 *
 * Honest about thin coverage: at today's low volume most buckets fall
 * below the bar. We say so plainly rather than fabricate rows or return a
 * bare error — the coverage note names the floor as the floor.
 *
 * See docs/methodology/source-intake.md + /methodology/data-intentions.
 */

import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { getSoldCompsSummary, K_ANON_THRESHOLD } from "@/lib/sold-comps/query";

// Reads live settlement state; never statically cached at build.
export const dynamic = "force-dynamic";

const DOES_NOT_INCLUDE: readonly string[] = [
  "buyer or seller identities (structurally stripped at the p2p_sold_comps view)",
  "payment, shipping, tracking, commission, or payout fields (never selected)",
  "individual sale rows — this endpoint is aggregate-only",
  `(sku, condition) buckets with fewer than ${K_ANON_THRESHOLD} completed sales (K-anonymity suppression)`,
  "third-party marketplace sold prices — eBay-sold and Vinted are honest blocks; see /methodology/data-intentions",
];

export async function GET(): Promise<Response> {
  const summary = await getSoldCompsSummary();
  const thin = summary.published_bucket_count === 0;

  return jsonResponse({
    endpoint: "/api/v1/sold-comps",
    sources: ["storefront-rds.market_trades", "storefront-rds.auctions"],
    source_license: ["cc0", "cc0"],
    license: "CC0-1.0",
    freshness: 3600, // sold comps change only when a trade/auction settles
    as_of: summary.as_of ?? undefined,
    does_not_include: DOES_NOT_INCLUDE,
    data: {
      "@kind": "sold-comps",
      dataset:
        "First-party realised sale prices — the kingdom's own completed P2P " +
        "trades and settled auctions. The one sold-price dataset we fully own " +
        "and dedicate to the public domain (CC0-1.0).",
      k_anonymity_threshold: K_ANON_THRESHOLD,
      coverage_note: thin
        ? `Coverage is early. Only (sku, condition) buckets with >=${K_ANON_THRESHOLD} ` +
          "completed first-party sales are published; today none clear that bar. " +
          "This is the honest floor of a young, safe-by-construction dataset — " +
          "not an error, and not something we paper over with substituted data."
        : `Anonymised aggregate sold prices. Only (sku, condition) buckets with ` +
          `>=${K_ANON_THRESHOLD} completed sales are published (K-anonymity); ` +
          "thinner buckets are suppressed entirely.",
      buckets: summary.buckets,
      published_bucket_count: summary.published_bucket_count,
      below_coverage_threshold: {
        ...summary.below_coverage_threshold,
        note:
          `Buckets with fewer than ${K_ANON_THRESHOLD} sales, suppressed entirely. ` +
          "Only these coarse totals are revealed — never their prices or SKUs.",
      },
      license_note:
        "CC0-1.0. First-party sold prices only. No identities, no payment or " +
        "shipping, no thin-volume rows — see /methodology/data-intentions.",
    },
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
