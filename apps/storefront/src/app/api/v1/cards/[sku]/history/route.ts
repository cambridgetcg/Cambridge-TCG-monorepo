/**
 * GET /api/v1/cards/[sku]/history — public reference-price history.
 *
 * Four windows (7d / 30d / 90d / 365d) of daily
 * { captured_on, spot_gbp, best_bid_gbp, best_ask_gbp } from
 * card_price_history, via the same `loadPriceHistory` composer that feeds
 * the /cards/[sku]/market reading page. One substrate, two doors.
 *
 * ── What spot_gbp IS (and is not) ───────────────────────────────────
 *
 * Per the collectors-first decision record
 * (docs/decisions/2026-07-06-collectors-first.md): *"`spot_price`
 * survives strictly as a **labelled reference price** (open data), never
 * as an offer."* The house holds no market position — it does not buy,
 * does not sell, does not quote. Every value in this payload is the
 * platform's observation discipline, published as open data for
 * collectors; none of it is a price at which anyone — least of all the
 * house — stands ready to trade. The `price_basis` block below and
 * `_meta.price_basis` carry that framing on the wire so no consumer has
 * to read this comment to learn it.
 *
 * best_bid_gbp / best_ask_gbp are historical snapshots of the COLLECTOR
 * order book (P2P), captured alongside the spot observation — records of
 * what collectors were quoting each day, not offers either.
 *
 * SKUs can contain "/" when the card number does (Vanguard DZ-BT14/018,
 * Pokémon 089/080) — the incoming segment is decoded before lookup.
 *
 * Public, no auth, CC0. Data-pantry envelope; registered in manifest.ts.
 */

import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import { loadPriceHistory } from "@/lib/market/card-market";
import { decodePathParam } from "@/lib/http/params";

const ENDPOINT = "/api/v1/cards/[sku]/history";

/** The provenance framing every price payload must carry
 *  (collectors-first, 2026-07-06). Echoed in data AND _meta so it
 *  survives consumers that strip either half. */
const PRICE_BASIS = {
  kind: "reference-price" as const,
  is_offer: false,
  statement:
    "spot_gbp is a labelled reference price — the platform's own daily " +
    "observation, published as open data. It is never an offer: the house " +
    "holds no market position, does not buy, does not sell, and does not " +
    "quote (collectors-first, 2026-07-06). best_bid_gbp / best_ask_gbp are " +
    "historical snapshots of the collector-to-collector order book.",
  decision_record: "docs/decisions/2026-07-06-collectors-first.md",
  methodology_url: "/methodology/pricing",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sku: string }> },
): Promise<Response> {
  const { sku: rawSku } = await params;
  const sku = decodePathParam(rawSku).trim();

  if (!sku || sku.length > 80) {
    return errorResponse({
      code: "INVALID_SKU",
      message:
        `'${sku || rawSku}' is not a plausible SKU. Expected the canonical form ` +
        `'<game>-<set>-<number>-<lang>[-<variant>]', e.g. 'op-op01-001-ja'.`,
      docs: "/methodology/sku-standard",
      endpoint: ENDPOINT,
    });
  }

  try {
    // Existence check against the catalog mirror so an unknown SKU answers
    // an honest 404 rather than four empty windows pretending the card
    // exists but never traded.
    const known = await query(
      `SELECT 1 FROM card_set_cards WHERE sku = $1
       UNION ALL
       SELECT 1 FROM card_price_history WHERE sku = $1
       LIMIT 1`,
      [sku],
    );
    if (known.rows.length === 0) {
      return errorResponse({
        code: "NOT_FOUND",
        message:
          `No card with SKU '${sku}' in the storefront catalog and no price ` +
          `observations recorded for it. Resolve card numbers to SKUs via ` +
          `/api/v1/search/cards, or browse /api/v1/universal/games.`,
        endpoint: ENDPOINT,
      });
    }

    const history = await loadPriceHistory(sku);

    // as_of: the newest observation across the widest window — the moment
    // the data was last known true, distinct from when we rendered it.
    const newest = history.window_365d[history.window_365d.length - 1];
    const asOf = newest?.captured_on;

    return jsonResponse({
      data: {
        sku,
        price_basis: PRICE_BASIS,
        windows: {
          window_7d: history.window_7d,
          window_30d: history.window_30d,
          window_90d: history.window_90d,
          window_365d: history.window_365d,
        },
        // Substrate-honest empty state: all-empty windows with this flag
        // false means "no observations recorded", not "price is zero".
        has_any_history: history.has_any_history,
        _links: {
          self: `/api/v1/cards/${encodeURIComponent(sku)}/history`,
          card: `/api/v1/universal/card/${encodeURIComponent(sku)}`,
          everything: `/api/v1/cards/${encodeURIComponent(sku)}/everything`,
          market_html: `/market/${encodeURIComponent(sku)}`,
          market_mirror_html: `/cards/${encodeURIComponent(sku)}/market`,
          methodology: "/methodology/pricing",
        },
      },
      endpoint: ENDPOINT,
      sources: ["storefront-rds.card_price_history"],
      source_license: ["cc0"],
      freshness: "price_current",
      as_of: asOf,
      license: "CC0-1.0",
      extra_meta: {
        // Reference-price-never-offer, declared where partners actually
        // look. Duplicated from data.price_basis on purpose.
        price_basis: PRICE_BASIS,
      },
      does_not_include: [
        "live order book — /api/v1/universal/auctions and the /market/[sku] page carry current collector quotes",
        "per-source upstream observations (CardRush/TCGplayer) — auth-gated at /api/v1/cards/[sku]/cardrush-history and /api/v1/cards/[sku]/tcgplayer-history per upstream license",
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/cards/[sku]/history] Error:", message);
    return errorResponse({
      code: "SOURCE_UNAVAILABLE",
      message:
        "The price-history substrate is temporarily unreachable — this is an " +
        `outage, not a claim that '${sku}' has no history. Retry shortly.`,
      endpoint: ENDPOINT,
    });
  }
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
