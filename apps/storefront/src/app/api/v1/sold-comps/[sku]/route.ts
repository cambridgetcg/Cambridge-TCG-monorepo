/**
 * /api/v1/sold-comps/[sku] — CC0 sold-price comps for one canonical SKU.
 *
 * Per-SKU face of /api/v1/sold-comps. Same two safety rings (PII-stripped
 * view + K-anonymity aggregation), narrowed to a single card. Returns the
 * published (sku, condition) buckets for that SKU; buckets below the
 * K-anonymity bar are suppressed to a coarse "below coverage threshold"
 * total, never per-price.
 *
 * Honest about absence: a SKU with no completed first-party sales, or only
 * thin ones, returns an empty `buckets` array with a plain coverage note —
 * never a fabricated price, never a bare error over a card we simply
 * haven't sold >=K times yet.
 *
 * See docs/methodology/source-intake.md + /methodology/data-intentions.
 */

import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { getSoldCompsForSku, K_ANON_THRESHOLD } from "@/lib/sold-comps/query";

// Reads live settlement state; never statically cached at build.
export const dynamic = "force-dynamic";

const DOES_NOT_INCLUDE: readonly string[] = [
  "buyer or seller identities (structurally stripped at the p2p_sold_comps view)",
  "payment, shipping, tracking, commission, or payout fields (never selected)",
  "individual sale rows — this endpoint is aggregate-only",
  `(sku, condition) buckets with fewer than ${K_ANON_THRESHOLD} completed sales (K-anonymity suppression)`,
  "third-party marketplace sold prices — eBay-sold and Vinted are honest blocks; see /methodology/data-intentions",
];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sku: string }> },
): Promise<Response> {
  const { sku } = await params;
  const result = await getSoldCompsForSku(sku);
  const thin = result.published_bucket_count === 0;

  return jsonResponse({
    endpoint: "/api/v1/sold-comps/[sku]",
    sources: ["storefront-rds.market_trades", "storefront-rds.auctions"],
    source_license: ["cc0", "cc0"],
    license: "CC0-1.0",
    freshness: 3600, // sold comps change only when a trade/auction settles
    as_of: result.as_of ?? undefined,
    does_not_include: DOES_NOT_INCLUDE,
    data: {
      "@kind": "sold-comps-sku",
      sku: result.sku,
      k_anonymity_threshold: K_ANON_THRESHOLD,
      coverage_note: thin
        ? `No published comps for ${result.sku} yet: no (sku, condition) bucket ` +
          `has reached >=${K_ANON_THRESHOLD} completed first-party sales. ` +
          "Honest absence, not a substituted estimate."
        : `Anonymised aggregate sold prices for ${result.sku}. Only buckets with ` +
          `>=${K_ANON_THRESHOLD} completed sales are published (K-anonymity).`,
      buckets: result.buckets,
      published_bucket_count: result.published_bucket_count,
      below_coverage_threshold: {
        ...result.below_coverage_threshold,
        note:
          `Buckets with fewer than ${K_ANON_THRESHOLD} sales, suppressed entirely. ` +
          "Only these coarse totals are revealed — never their prices.",
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
