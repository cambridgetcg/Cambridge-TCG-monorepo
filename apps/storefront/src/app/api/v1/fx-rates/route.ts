/**
 * /api/v1/fx-rates — machine-readable rate table for the price guide.
 *
 * Yu's directive 2026-05-14: *"Find source for global exchange rates."*
 * The platform consumes the ECB's daily EUR-reference-rate XML and converts
 * it to a GBP base. The ECB permits free commercial and non-commercial reuse
 * of its public statistics with source attribution. This endpoint carries the
 * attribution, source observation date, retrieval time, and transformation.
 *
 * Six currencies cover the platform's real audiences today:
 *
 *   GBP — canonical (Cambridge TCG operates in £)
 *   USD — US visitor display; no TCGplayer ingestion implied
 *   EUR — continental EU visitor display; no Cardmarket ingestion implied
 *   JPY — CardRush source, Japanese visitors
 *   HKD — South-East Asia visitors
 *   CHF — Swiss visitors
 *
 * Display-only. Every transaction on cambridgetcg.com clears in GBP;
 * the rates here drive only what the visitor *sees*. The wholesale-side
 * write path uses its own per-currency rates from `apps/wholesale/src/
 * lib/fx.ts` for reviewed source conversions, captured per row in
 * `price_archive.fx_rate_to_gbp`.
 */

import { jsonResponse } from "@/lib/data-pantry";
import {
  fetchRates,
  SUPPORTED_CURRENCIES,
  CURRENCY_META,
} from "@/lib/fx/rates";

export async function GET(): Promise<Response> {
  const table = await fetchRates();

  const data = {
    "@kind": "fx_rate_table",
    base: table.base,
    source: table.source,
    is_fallback: table.is_fallback,
    as_of: table.as_of,
    fetched_at: table.fetched_at,
    currencies: SUPPORTED_CURRENCIES.map((code) => {
      const meta = CURRENCY_META[code];
      const rate = table.rates[code];
      return {
        code,
        name: meta.name,
        symbol: meta.symbol,
        locale: meta.locale,
        decimals: meta.decimals,
        rate_per_base: rate,
        base_per_unit: code === table.base ? 1 : rate > 0 ? 1 / rate : null,
      };
    }),
    upstream_sources: [
      {
        url: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
        license: "ESCB statistics reuse policy; free reuse with source attribution",
        policy_url:
          "https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html",
        cadence: "daily refresh; we cache 6 hours",
        position: "source",
      },
    ],
    attribution: {
      text: "Source: ECB statistics.",
      url: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
    },
    transformation:
      "ECB publishes units per EUR. Cambridge computes each GBP-base rate as target_per_EUR / GBP_per_EUR; source observations are not relabelled as Cambridge data.",
    methodology:
      "Display-only conversion. Platform transactions clear in GBP. " +
      "Rates are ECB daily reference statistics transformed from EUR base to " +
      "GBP base. When ECB is unavailable, the endpoint returns a static, dated " +
      "fallback table marked is_fallback=true.",
    methodology_url: "https://cambridgetcg.com/methodology/fx-rates",
  };

  return jsonResponse({
    data,
    endpoint: "/api/v1/fx-rates",
    sources: [table.source === "fallback" ? "ctcg-fallback" : "ecb-statistics"],
    source_license: ["proprietary"],
    license: "NOASSERTION",
    // Custom freshness: 6 hours matches our upstream cache.
    freshness: 21_600,
    as_of: table.as_of,
    contains_self: true,
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
