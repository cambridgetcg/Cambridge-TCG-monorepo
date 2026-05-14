/**
 * /api/v1/fx-rates — machine-readable rate table for the price guide.
 *
 * Yu's directive 2026-05-14: *"Find source for global exchange rates."*
 * The platform consumes open.er-api.com (primary) and exchangerate.host
 * (fallback). This endpoint emits whichever upstream answered, with the
 * fetched_at timestamp and the static FALLBACK_RATES table when both
 * fail — substrate-honest about the source.
 *
 * Six currencies cover the platform's real audiences today:
 *
 *   GBP — canonical (Cambridge TCG operates in £)
 *   USD — TCGplayer source, US visitors
 *   EUR — Cardmarket source (planned), continental EU visitors
 *   JPY — CardRush source, Japanese visitors
 *   HKD — South-East Asia visitors
 *   CHF — Swiss visitors
 *
 * Display-only. Every transaction on cambridgetcg.com clears in GBP;
 * the rates here drive only what the visitor *sees*. The wholesale-side
 * write path uses its own per-currency rates from `apps/wholesale/src/
 * lib/fx.ts` for the JPY → GBP / USD → GBP conversions, captured per
 * row in `price_archive.fx_rate_to_gbp`.
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
        url: "https://open.er-api.com/v6/latest/GBP",
        license: "open (free tier, no key required)",
        cadence: "daily refresh; we cache 6 hours",
        position: "primary",
      },
      {
        url: "https://api.exchangerate.host/latest?base=GBP",
        license: "open (free tier)",
        cadence: "daily refresh; we cache 6 hours",
        position: "fallback",
      },
    ],
    methodology:
      "Display-only conversion. Platform transactions clear in GBP. " +
      "Rates are mid-market reference values fetched from open.er-api.com " +
      "(primary) or exchangerate.host (fallback). When both fail, the " +
      "endpoint returns a static fallback table marked is_fallback=true.",
    methodology_url: "https://cambridgetcg.com/methodology/fx-rates",
  };

  return jsonResponse({
    data,
    endpoint: "/api/v1/fx-rates",
    sources: [table.source === "fallback" ? "ctcg-fallback" : table.source],
    source_license: ["CC0-1.0"],
    // Custom freshness: 6 hours matches our upstream cache.
    freshness: 21_600,
    as_of: table.fetched_at,
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
