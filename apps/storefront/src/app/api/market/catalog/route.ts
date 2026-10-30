import { NextResponse } from "next/server";
import {
  fetchPrices,
  fetchGamesDetailed,
  fetchSetsDetailed,
  type WholesaleSource,
} from "@/lib/wholesale/client";
import { getFirstPartyReferences, type FirstPartyRef } from "@/lib/prices/first-party";
import { query } from "@/lib/db";
import { getOfficialCardImages, type OfficialImageChoice } from "@/lib/cards/en-card-data";
import { catalogImageUrl } from "@/lib/cards/image-publication";

// GET /api/market/catalog — all cards with spot + P2P data for Cardmarket-style browse
//
// Source provenance: every response carries a `source` field and an
// `x-catalog-source` header — 'wholesale-api' (live HTTP), 'wholesale-db'
// (direct read of the wholesale Postgres; the API is retired), or a 503
// when both substrates failed. The UI keys its <Provenance> label off
// this; a database read must never pass itself off as a live API, and an
// outage must never render as an empty catalog.

/** The Japanese image lane, off for a request that did not ask for it. */
const JAPANESE_LANE_OFF = Object.freeze({ OFFICIAL_IMAGES_JA: "off" });

function sourceHeaders(source: WholesaleSource) {
  return { "x-catalog-source": source };
}

function catalogUnavailable() {
  return NextResponse.json(
    {
      error: {
        code: "catalog_unavailable",
        message:
          "The card catalog can't be loaded right now: the wholesale API is unreachable and the direct database read also failed. This is a source outage, not an empty catalog — please try again shortly.",
      },
      source: "unavailable" as const,
    },
    { status: 503, headers: sourceHeaders("unavailable") },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const game = url.searchParams.get("game") || "one-piece";
  const set = url.searchParams.get("set") || undefined;
  const search = url.searchParams.get("q") || undefined;
  const sort = url.searchParams.get("sort") || "name_asc";
  const limit = parseInt(url.searchParams.get("limit") || "48", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  const view = url.searchParams.get("view"); // "sets" = list sets, "games" = list games

  // List games
  if (view === "games") {
    const { games, source } = await fetchGamesDetailed();
    if (source === "unavailable") return catalogUnavailable();
    return NextResponse.json({ games, source }, { headers: sourceHeaders(source) });
  }

  // List sets for a game
  if (view === "sets") {
    const { sets, source } = await fetchSetsDetailed(game);
    if (source === "unavailable") return catalogUnavailable();
    return NextResponse.json({ sets, game, source }, { headers: sourceHeaders(source) });
  }

  // Fetch cards from wholesale catalog
  const sortMap: Record<string, string> = {
    name_asc: "name_asc",
    name_desc: "name_desc",
    number_asc: "number_asc",
  };

  const data = await fetchPrices({
    game,
    set,
    q: search,
    sort: sortMap[sort] || "name_asc",
    limit,
    offset,
  });

  // fetchPrices always stamps a source; if the invariant ever breaks we
  // fail loud (503) rather than fabricate a "live" label.
  const source: WholesaleSource = data.source ?? "unavailable";
  if (source === "unavailable") return catalogUnavailable();

  // Enrich with P2P market data (best bid/ask for each SKU)
  const skus = data.items.map(i => i.sku);
  let p2pData = new Map<string, { best_bid: string | null; best_ask: string | null; bid_count: number; ask_count: number }>();

  if (skus.length > 0) {
    try {
      const p2pResult = await query(
        `SELECT sku,
           MAX(CASE WHEN side='bid' AND status IN ('open','partially_filled') THEN price END) as best_bid,
           MIN(CASE WHEN side='ask' AND status IN ('open','partially_filled') THEN price END) as best_ask,
           SUM(CASE WHEN side='bid' AND status IN ('open','partially_filled') THEN quantity - filled_quantity ELSE 0 END) as bid_count,
           SUM(CASE WHEN side='ask' AND status IN ('open','partially_filled') THEN quantity - filled_quantity ELSE 0 END) as ask_count
         FROM market_orders o
        WHERE sku = ANY($1)
          AND NOT EXISTS (
            SELECT 1 FROM trust_profiles suspended
             WHERE suspended.user_id = o.user_id
               AND suspended.is_suspended = TRUE
          )
         GROUP BY sku`,
        [skus]
      );
      for (const row of p2pResult.rows) {
        p2pData.set(row.sku, {
          best_bid: row.best_bid,
          best_ask: row.best_ask,
          bid_count: parseInt(row.bid_count || "0", 10),
          ask_count: parseInt(row.ask_count || "0", 10),
        });
      }
    } catch {
      // P2P data enrichment is optional
    }
  }

  // Official self-hosted card images (one batch query per lane, per the
  // grid contract): with images=same-language, a Japanese card's own-language
  // image when there is one (Yu, 2026-10-30), else the English base
  // reference. The publication rule lives entirely in en-card-data.ts: only
  // publisher 'official_sample' art, self-hosted via s3_key (the stored
  // source_url is NEVER served — no hotlink), takedown-clear, and always
  // carrying its copyright line. The returned `url` is already the
  // Cambridge-hosted URL; cards with no published official image simply
  // aren't in the map, so their image_url stays whatever db-source gave
  // (today: null).
  //
  // Yu's option was "with credit": only /market's grid and table, which
  // print the label and the Japanese credit beside the image, ask for the
  // Japanese lane. Every other caller (the deck builder, the listing,
  // auction and swap pickers) shows a bare thumbnail with no label or
  // credit, so for them the lane is off, through the same switch as
  // OFFICIAL_IMAGES_JA=off, and they keep the English image as before.
  const sameLanguageImages = url.searchParams.get("images") === "same-language";
  let officialImages = new Map<string, OfficialImageChoice>();
  if (skus.length > 0) {
    try {
      officialImages = await getOfficialCardImages(skus, sameLanguageImages ? process.env : JAPANESE_LANE_OFF);
    } catch {
      // Official image enrichment is optional; the catalog renders without it.
    }
  }

  // Retain the existing catalogue-photo fallback when official reference art
  // is absent. Storage alone does not verify its source, printing or rights;
  // it must not inherit the official candidate's attribution or reference.
  let catalogImages = new Map<string, string>();
  if (skus.length > 0) {
    try {
      const r = await query(
        `SELECT sku, image_url FROM card_set_cards WHERE sku = ANY($1) AND image_url IS NOT NULL`,
        [skus],
      );
      for (const row of r.rows) {
        const imageUrl = catalogImageUrl(row.image_url);
        if (imageUrl) catalogImages.set(row.sku, imageUrl);
      }
    } catch {
      // Fallback image enrichment is optional.
    }
  }

  // Collectors-first (2026-07-06): the tradein-credit channel enrichment
  // (the house's standing we-buy bids) is gone — one less price channel
  // to compute. Every bid/ask below is a collector's; spot_price survives
  // as a labelled, policy-bound reference, never as an offer or reuse grant.
  // First-party reference — last traded price on OUR market (publishable, no
  // upstream license). Replaces the CardRush-derived spot, which is
  // internal-only / publication-blocked and reaches us null. A card shows a
  // reference once it has actually traded here, and honestly none until then.
  let firstPartyRefs = new Map<string, FirstPartyRef>();
  if (skus.length > 0) {
    try {
      firstPartyRefs = await getFirstPartyReferences(skus);
    } catch {
      // Reference is enrichment; the catalog renders without it.
    }
  }

  const cards = data.items.map(item => {
    const fp = firstPartyRefs.get(item.sku);
    const spot = fp?.price ?? null;
    const p2p = p2pData.get(item.sku);
    const bestAsk = p2p?.best_ask ? parseFloat(p2p.best_ask) : null;
    const marketPrice = bestAsk !== null && (spot === null || bestAsk < spot) ? bestAsk : spot;
    // Official reference metadata travels as a complete unit. The independent
    // catalogue fallback stays available, explicitly without verified metadata.
    const candidate = officialImages.get(item.sku);
    const img = candidate?.url && candidate.attribution && candidate.reference ? candidate : null;

    return {
      sku: item.sku,
      card_number: item.card_number,
      name: item.name_en || item.name || item.card_number,
      set_code: item.set_code,
      set_name: item.set_name,
      rarity: item.rarity,
      image_url: img?.url ?? catalogImages.get(item.sku) ?? catalogImageUrl(item.image_url),
      image_attribution: img?.attribution ?? null,
      // The English base reference, or the Japanese one, each in its own
      // field; image_language says which (null for the catalogue fallback).
      image_reference: img?.language === "en" ? img.reference : null,
      image_language: img?.language ?? null,
      image_same_language_reference: img?.language === "ja" ? img.reference : null,
      // Prices — spot_price is now a FIRST-PARTY reference: the last price this
      // card traded for on Cambridge (ref_trades backs it). Null until it has
      // traded here. Never a republished external price.
      spot_price: spot,
      ref_trades: fp?.trades ?? 0,
      market_price: marketPrice,
      stock: item.stock,
      // Pure collector book
      best_bid: p2p?.best_bid ? parseFloat(p2p.best_bid) : null,
      best_ask: bestAsk,
      p2p_sellers: p2p?.ask_count || 0,
      p2p_buyers: p2p?.bid_count || 0,
      has_p2p: (p2p?.bid_count || 0) > 0 || (p2p?.ask_count || 0) > 0,
    };
  });

  return NextResponse.json(
    {
      cards,
      total: data.total,
      game,
      set: set || null,
      source,
    },
    { headers: sourceHeaders(source) },
  );
}
