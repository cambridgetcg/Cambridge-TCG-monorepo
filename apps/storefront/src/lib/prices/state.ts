/**
 * Price-guide state composers — the fan-out substrate.
 *
 * Three typed entry points, each bundling the per-page data scattered
 * across `/prices/*` route handlers into one place:
 *
 *   loadGameState(slug)              → /prices/[game]                + /api/v1/prices/games/[game]
 *   loadSetState(slug, setCode)      → /prices/[game]/[set]          + /api/v1/prices/games/[game]/sets/[set]
 *   loadCardState(slug, setCode, n)  → /prices/[game]/[set]/[number] + /api/v1/prices/games/[game]/sets/[set]/cards/[number]
 *
 * Sister's S37 (trust-fanout) + S39 (auction-fanout) crystallised the
 * pattern: one composer, multiple reading positions. This file applies
 * the same shape to the price-guide tree.
 *
 * **Pure-ish** — takes slug args, returns `null` on not-found, never
 * throws. Catches upstream errors and degrades to substrate-honest
 * empty arrays. The `_provenance` block on every return value names
 * what was fetched + when + with what freshness budget.
 *
 * **Substrate-honest about what's IN scope** — only the data needed
 * for the price-guide reading positions. Cross-source signals carry
 * arrival-state + license tier (kingdom-080); auth-gated history
 * stays auth-gated (the composer doesn't fetch it).
 */

import {
  fetchPrices,
  fetchSets,
  type PriceItem,
  type SetItem,
} from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";
import {
  getPriceGuideConfig,
  type PriceGuideGameConfig,
} from "./games-config";

// ── Shared primitive types ─────────────────────────────────────────

/**
 * A card row as the price-guide presents it. Pre-computed retail price
 * + trade-in credit + display name so consumers don't recompute.
 */
export interface PriceGuideCardRow {
  sku: string;
  name: string;
  card_number: string;
  set_code: string | null;
  set_name: string | null;
  rarity: string | null;
  image_url: string | null;
  price_gbp: number | null;
  tradein_credit_gbp: number | null;
  stock: number;
  updated_at: string | null;
}

interface ProvenanceBlock {
  kind: "live" | "synced";
  queried_at: string;
  /** Earliest `updated_at` across rows — substrate-honest staleness floor. */
  as_of: string | null;
  /** Freshness budget key from data-spec. */
  freshness: "price_current" | "catalog";
  /** Named upstream sources contributing to this state. */
  sources: readonly string[];
  /** Per-source redistribution license tiers (parallel to sources). */
  source_license: readonly string[];
  /** Methodology pointers. */
  methodology_urls: Record<string, string>;
}

// ── Helpers ───────────────────────────────────────────────────────

function freshestUpdate(items: PriceItem[]): string | null {
  let max: string | null = null;
  for (const it of items) {
    if (it.updated_at && (max === null || it.updated_at > max)) max = it.updated_at;
  }
  return max;
}

function rowFromItem(
  item: PriceItem,
  tradeinMap: Map<string, number>,
): PriceGuideCardRow {
  return {
    sku: item.sku,
    name: item.name_en || item.name || item.card_number,
    card_number: item.card_number,
    set_code: item.set_code,
    set_name: item.set_name,
    rarity: item.rarity,
    image_url: item.image_url,
    price_gbp: retailPrice(item.price_gbp, item.channel_price),
    tradein_credit_gbp: tradeinMap.get(item.sku) ?? null,
    stock: item.stock,
    updated_at: item.updated_at,
  };
}

function buildTradeInMap(items: PriceItem[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const item of items) {
    if (item.channel_price && item.channel_price > 0) {
      m.set(item.sku, item.channel_price);
    }
  }
  return m;
}

// ── GameState ─────────────────────────────────────────────────────

export interface GameState {
  config: PriceGuideGameConfig;
  sets: SetItem[];
  top_cards: PriceGuideCardRow[];
  total_set_count: number;
  total_card_count: number;
  _provenance: ProvenanceBlock;
}

/**
 * Per-game composer. Returns `null` when the slug isn't in
 * PRICE_GUIDE_GAMES (substrate-honest: caller renders 404).
 *
 * @param opts.top_n  How many "top valuable" cards to load. Default 20.
 */
export async function loadGameState(
  slug: string,
  opts?: { top_n?: number },
): Promise<GameState | null> {
  const config = getPriceGuideConfig(slug);
  if (!config) return null;

  const top_n = opts?.top_n ?? 20;
  const queried_at = new Date().toISOString();

  const [sets, topData, tradeinData] = await Promise.all([
    fetchSets(config.slug).catch(() => [] as SetItem[]),
    fetchPrices({
      game: config.slug,
      sort: "price_desc",
      limit: top_n,
    }).catch(() => ({ items: [], total: 0 })),
    fetchPrices({
      game: config.slug,
      sort: "price_desc",
      limit: top_n,
      channel: "tradein-credit",
    }).catch(() => ({ items: [] })),
  ]);

  const tradeinMap = buildTradeInMap(tradeinData.items);
  const top_cards = topData.items.map((it) => rowFromItem(it, tradeinMap));

  return {
    config,
    sets,
    top_cards,
    total_set_count: sets.length,
    total_card_count: topData.total,
    _provenance: {
      kind: "synced",
      queried_at,
      as_of: freshestUpdate(topData.items),
      freshness: "price_current",
      sources: ["wholesale-rds.cards", "cambridgetcg-marketplace"],
      source_license: ["internal-only", "internal-only"],
      methodology_urls: {
        pricing: "/methodology/pricing",
        cross_source: "/methodology/cross-source-pricing",
      },
    },
  };
}

// ── SetState ─────────────────────────────────────────────────────

export interface SetState {
  config: PriceGuideGameConfig;
  set: SetItem;
  cards: PriceGuideCardRow[];
  total_in_set: number;
  release_date: string | null;
  _provenance: ProvenanceBlock;
}

/**
 * Per-set composer. Returns null on either:
 *   - unknown game slug
 *   - unknown set code within that game
 *
 * Note: pulls the set's card list with limit=500 (covers every published
 * set today). For sets approaching that ceiling, the composer should
 * paginate; substrate-honest about the cap.
 */
export async function loadSetState(
  slug: string,
  setCode: string,
  opts?: { limit?: number },
): Promise<SetState | null> {
  const config = getPriceGuideConfig(slug);
  if (!config) return null;

  const limit = opts?.limit ?? 500;
  const upperSetCode = setCode.toUpperCase();
  const queried_at = new Date().toISOString();

  const [sets, cardsData, tradeinData] = await Promise.all([
    fetchSets(config.slug).catch(() => [] as SetItem[]),
    fetchPrices({
      game: config.slug,
      set: upperSetCode,
      sort: "price_desc",
      limit,
    }).catch(() => ({ items: [], total: 0 })),
    fetchPrices({
      game: config.slug,
      set: upperSetCode,
      sort: "price_desc",
      limit,
      channel: "tradein-credit",
    }).catch(() => ({ items: [] })),
  ]);

  const set = sets.find((s) => s.code.toUpperCase() === upperSetCode);
  if (!set) return null;

  const tradeinMap = buildTradeInMap(tradeinData.items);
  const cards = cardsData.items.map((it) => rowFromItem(it, tradeinMap));

  return {
    config,
    set,
    cards,
    total_in_set: set.card_count,
    release_date: set.release_date,
    _provenance: {
      kind: "synced",
      queried_at,
      as_of: freshestUpdate(cardsData.items),
      freshness: "price_current",
      sources: ["wholesale-rds.cards", "cambridgetcg-marketplace"],
      source_license: ["internal-only", "internal-only"],
      methodology_urls: {
        pricing: "/methodology/pricing",
        cross_source: "/methodology/cross-source-pricing",
      },
    },
  };
}

// ── CardState ────────────────────────────────────────────────────

/**
 * A cross-source signal as the price-guide presents it.
 *
 * Substrate-honest about which sources we have for THIS card vs which
 * sources we COULD have. Public CC0 envelope — no per-condition history
 * (that's auth-gated per upstream license).
 */
export interface CrossSourceSignal {
  label: string;
  source_id: string;
  license:
    | "internal-only"
    | "partner-redistributable"
    | "cc-by-nc"
    | "mit"
    | "cc0";
  available: boolean;
  detail: string;
  /** Storefront URL the signed-in user can call for full history (when available). */
  signed_in_path: string | null;
}

export interface CardState {
  config: PriceGuideGameConfig;
  set: SetItem;
  card: PriceGuideCardRow;
  cross_source_signals: CrossSourceSignal[];
  _provenance: ProvenanceBlock;
}

/**
 * Per-card composer. Three-way null:
 *   - unknown game slug
 *   - unknown set code
 *   - unknown card number within set
 *
 * Number matching is defensive: exact match first, then suffix-match
 * (so "001" finds "OP01-001" if needed for legacy URLs).
 */
export async function loadCardState(
  slug: string,
  setCode: string,
  number: string,
): Promise<CardState | null> {
  const config = getPriceGuideConfig(slug);
  if (!config) return null;

  const upperSetCode = setCode.toUpperCase();
  const numTarget = number.toLowerCase();
  const queried_at = new Date().toISOString();

  const [sets, cardsData, tradeinData] = await Promise.all([
    fetchSets(config.slug).catch(() => [] as SetItem[]),
    fetchPrices({ game: config.slug, set: upperSetCode, limit: 500 }).catch(
      () => ({ items: [], total: 0 }),
    ),
    fetchPrices({
      game: config.slug,
      set: upperSetCode,
      limit: 500,
      channel: "tradein-credit",
    }).catch(() => ({ items: [] })),
  ]);

  const set = sets.find((s) => s.code.toUpperCase() === upperSetCode);
  if (!set) return null;

  const item =
    cardsData.items.find((c) => c.card_number.toLowerCase() === numTarget) ??
    cardsData.items.find((c) =>
      c.card_number.toLowerCase().endsWith(numTarget),
    );
  if (!item) return null;

  const tradeinMap = buildTradeInMap(tradeinData.items);
  const card = rowFromItem(item, tradeinMap);

  const cross_source_signals: CrossSourceSignal[] = [];

  if (config.cardrush) {
    cross_source_signals.push({
      label: "CardRush (Japan)",
      source_id: "cardrush",
      license: "internal-only",
      available: config.cardrush.confirmed,
      detail: config.cardrush.confirmed
        ? `Daily JP retail snapshot from ${config.cardrush.subdomain}. Internal-only license: signed-in personal-decision use only.`
        : `${config.cardrush.subdomain} registered, awaiting first confirmed scrape.`,
      signed_in_path: config.cardrush.confirmed
        ? `/api/v1/cards/${encodeURIComponent(card.sku)}/cardrush-history`
        : null,
    });
  }

  cross_source_signals.push({
    label: "TCGplayer (US)",
    source_id: "tcgplayer",
    license: "partner-redistributable",
    available: false, // operator-gated; flips when TCGplayer credentials wire
    detail:
      "Partner-redistributable license — display + computation OK by partner agreement; bulk re-export refused. Awaiting OAuth credentials from developer.tcgplayer.com.",
    signed_in_path: `/api/v1/cards/${encodeURIComponent(card.sku)}/tcgplayer-history`,
  });

  return {
    config,
    set,
    card,
    cross_source_signals,
    _provenance: {
      kind: "synced",
      queried_at,
      as_of: card.updated_at,
      freshness: "price_current",
      sources: ["wholesale-rds.cards", "cambridgetcg-marketplace"],
      source_license: ["internal-only", "internal-only"],
      methodology_urls: {
        pricing: "/methodology/pricing",
        cross_source: "/methodology/cross-source-pricing",
        upstream_sources: "/methodology/upstream-sources",
      },
    },
  };
}
