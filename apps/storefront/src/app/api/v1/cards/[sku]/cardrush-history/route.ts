/**
 * /api/v1/cards/[sku]/cardrush-history — rights-gapped CardRush history.
 *
 * CardRush's current registry record is `internal-only`: no affirmative
 * permission for public exact prices, URLs, compiled history or derived
 * aggregates has been found. A normal user session is not a source licence.
 * This route therefore returns a useful, machine-readable gap and never calls
 * the wholesale history reader.
 */

import { jsonResponse } from "@/lib/data-pantry";
import { publicSourceGap } from "@/lib/source-rights/publication";

const ENDPOINT = "/api/v1/cards/[sku]/cardrush-history";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sku: string }> },
): Promise<Response> {
  const { sku } = await params;
  const gap = publicSourceGap("cardrush");

  return jsonResponse({
    data: {
      sku,
      source: gap.source,
      status: gap.status,
      exact_values_included: gap.exact_values_included,
      aggregates_included: gap.aggregates_included,
      source_rights: gap,
      note:
        "No CardRush observations, prices, base values, source URLs, counts, ranges or summary statistics are returned. Obtain and record affirmative reuse permission before reopening this data path.",
    },
    endpoint: ENDPOINT,
    sources: [gap.source],
    source_license: [gap.source_license_tier],
    freshness: "methodology",
    no_cache: true,
    does_not_include: [
      "CardRush exact price observations",
      "CardRush source and product URLs",
      "counts, dates, ranges, medians or other aggregates derived from CardRush history",
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
