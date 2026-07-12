/**
 * /api/v1/cards/[sku]/tcgplayer-history — rights-gapped TCGplayer history.
 *
 * The reviewed registry does not call TCGplayer partner-redistributable.
 * Existing-user API terms are application-specific, and no current agreement
 * recording display, storage, retention, attribution and export rights is in
 * this repository. A bearer token or normal user session is not that evidence.
 * This route returns a gap and never reads the restricted history tape.
 */

import { jsonResponse } from "@/lib/data-pantry";
import { publicSourceGap } from "@/lib/source-rights/publication";

const ENDPOINT = "/api/v1/cards/[sku]/tcgplayer-history";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sku: string }> },
): Promise<Response> {
  const { sku } = await params;
  const gap = publicSourceGap("tcgplayer");

  return jsonResponse({
    data: {
      sku,
      source: gap.source,
      status: gap.status,
      exact_values_included: gap.exact_values_included,
      aggregates_included: gap.aggregates_included,
      source_rights: gap,
      note:
        "No TCGplayer observations, USD/GBP values, source URLs, product identifiers, counts, ranges or summary statistics are returned. Record the approved application's current terms before reopening this data path.",
    },
    endpoint: ENDPOINT,
    sources: [gap.source],
    source_license: [gap.source_license_tier],
    freshness: "methodology",
    no_cache: true,
    does_not_include: [
      "TCGplayer exact price observations and spreads",
      "TCGplayer source URLs and product or SKU identifiers",
      "counts, dates, ranges, medians or other aggregates derived from TCGplayer history",
    ],
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
