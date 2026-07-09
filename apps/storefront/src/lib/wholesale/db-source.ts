/**
 * The Falcon's ground route — direct reads from the wholesale Postgres.
 *
 * The wholesale HTTP API is retired: wholesaletcgdirect.com 301s to
 * cambridgetcg.com and its API times out. This module serves the same
 * shapes fetchPrices / fetchSets / fetchGames return, by querying the
 * wholesale database directly over WHOLESALE_DATABASE_URL — the env var
 * production Vercel already carries for admin reads (src/lib/admin/db.ts)
 * and stock reservations (src/lib/stock/reservations.ts).
 *
 * Pricing semantics are replicated from the HTTP API, not reinvented:
 *   - price_gbp        = cards.price (verbatim; NULL when never priced)
 *   - channel_price    = computePrice(cardrush_jpy, gbp_jpy_rate,
 *                        <channel_pricing row>, category) for non-wholesale
 *                        channels, falling back to price_gbp when the card
 *                        has no JPY observation — exactly what
 *                        apps/wholesale/src/app/api/v1/prices/route.ts does.
 *   - channel configs come from the wholesale channel_pricing table
 *     (runtime authoritative), degrading to @cambridge-tcg/pricing DEFAULTS
 *     only when that table itself is unreadable — mirroring
 *     apps/wholesale/src/lib/channel-pricing.ts.
 *
 * Every exported fetch function THROWS on database failure. Degrading to
 * an empty result is the caller's decision (client.ts), because "the
 * source is down" and "the source has no cards" are different facts and
 * the catalog route must be able to tell them apart.
 *
 * The pool never leaves this module.
 */

import { Pool } from "pg";
import { computePrice, DEFAULTS, type ChannelConfig } from "@cambridge-tcg/pricing";
import type { GameItem, PriceItem, PricesResponse, SetItem } from "./client";

// ── Connection ──────────────────────────────────────────────────────────

/**
 * Strip sslmode from a connection string. Same treatment as
 * scripts/migrate.mjs: the URL-level sslmode fights the driver-level ssl
 * option, so the option wins and the URL param is removed.
 */
export function stripSslMode(url: string): string {
  return url.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
}

/**
 * Local Postgres runs with ssl=off and the pg driver hard-fails when ssl
 * options are passed to a non-SSL server, so SSL is keyed off the host.
 * Unparseable URLs count as remote — production-safe default.
 */
export function isLocalDbHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

let _pool: Pool | null = null;

function getPool(): Pool {
  if (_pool) return _pool;
  const raw = (process.env.WHOLESALE_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  if (!raw) {
    throw new Error(
      "wholesale db-source: neither WHOLESALE_DATABASE_URL nor DATABASE_URL is set",
    );
  }
  const url = stripSslMode(raw);
  _pool = new Pool({
    connectionString: url,
    // RDS presents a cert the default CA bundle can't verify — same
    // rejectUnauthorized:false the rest of the platform uses.
    ssl: isLocalDbHost(url) ? undefined : { rejectUnauthorized: false },
    // Serverless: one instance serves one request at a time; the catalog
    // path issues at most a handful of sequential queries.
    max: 3,
    connectionTimeoutMillis: 5_000,
  });
  // An idle client losing its connection (RDS closing it, network blip)
  // emits 'error' on the pool; unhandled, that crashes the process.
  _pool.on("error", (err) => {
    console.error("[wholesale db-source] idle client error", err);
  });
  return _pool;
}

async function q<T>(sql: string, args: unknown[] = []): Promise<{ rows: T[] }> {
  const result = await getPool().query(sql, args);
  return { rows: result.rows as T[] };
}

// ── Channel pricing configs ─────────────────────────────────────────────
//
// Mirror of apps/wholesale/src/lib/channel-pricing.ts: channel_pricing
// table is authoritative; a partial row throws (operators must see and
// fix); only a table-level read failure degrades to package DEFAULTS.

// Mirrors CACHE_TTL_MS in apps/wholesale/src/lib/channel-pricing.ts.
const CHANNEL_CACHE_TTL_MS = 5 * 60 * 1000;

let channelCache: { configs: Map<string, ChannelConfig>; at: number } | null = null;

interface ChannelPricingRow {
  channel: string;
  margin_multiplier: string | null;
  flat_fee_singles: string | null;
  flat_fee_sealed: string | null;
  vat_multiplier: string | null;
  retail_multiplier: string | null;
  round_to: string | null;
}

function rowToConfig(row: ChannelPricingRow): ChannelConfig {
  const missing = (
    [
      ["margin_multiplier", row.margin_multiplier],
      ["flat_fee_singles", row.flat_fee_singles],
      ["flat_fee_sealed", row.flat_fee_sealed],
      ["vat_multiplier", row.vat_multiplier],
      ["retail_multiplier", row.retail_multiplier],
      ["round_to", row.round_to],
    ] as const
  )
    .filter(([, v]) => v === null)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(
      `channel_pricing row for "${row.channel}" has NULL columns: ${missing.join(", ")}. ` +
      `Re-run apps/wholesale/drizzle/0010_seed_channel_pricing.sql.`,
    );
  }
  return {
    channel: row.channel,
    marginMultiplier: Number(row.margin_multiplier),
    flatFeeSingles: Number(row.flat_fee_singles),
    flatFeeSealed: Number(row.flat_fee_sealed),
    vatMultiplier: Number(row.vat_multiplier),
    retailMultiplier: Number(row.retail_multiplier),
    roundTo: Number(row.round_to),
  };
}

async function getChannelConfigs(): Promise<Map<string, ChannelConfig>> {
  const now = Date.now();
  if (channelCache && now - channelCache.at < CHANNEL_CACHE_TTL_MS) {
    return channelCache.configs;
  }
  try {
    const { rows } = await q<ChannelPricingRow>(
      `SELECT channel, margin_multiplier, flat_fee_singles, flat_fee_sealed,
              vat_multiplier, retail_multiplier, round_to
         FROM channel_pricing`,
    );
    const configs = new Map(rows.map((r) => [r.channel, rowToConfig(r)]));
    channelCache = { configs, at: now };
    return configs;
  } catch (err) {
    console.error(
      "[wholesale db-source] failed to load channel_pricing — using SEED constants from @cambridge-tcg/pricing.",
      err,
    );
    return new Map(Object.entries(DEFAULTS));
  }
}

async function channelConfigFor(channel: string): Promise<ChannelConfig> {
  const configs = await getChannelConfigs();
  const config = configs.get(channel);
  if (!config) {
    // Unknown channels throw, same as wholesale's priceForChannel —
    // a missing channel row is an operator-visible error, not a silent
    // default.
    throw new Error(
      `channel_pricing has no row for channel "${channel}". ` +
      `Known channels: ${Array.from(configs.keys()).join(", ")}.`,
    );
  }
  return config;
}

// ── Per-row channel price (pure) ────────────────────────────────────────

export interface PriceableRow {
  cardrush_jpy: number | null;
  gbp_jpy_rate: number | null;
  category: string | null;
  /** cards.price as a number, or null when never priced. */
  price_gbp: number | null;
}

/**
 * The HTTP API's `channel_price: channelPrice ?? r.priceGbp` semantics:
 * compute from the JPY observation when one exists, otherwise fall back
 * to the card's stored price (which may itself be null).
 */
export function channelPriceForRow(row: PriceableRow, config: ChannelConfig): number | null {
  if (row.cardrush_jpy && row.gbp_jpy_rate) {
    return computePrice(row.cardrush_jpy, row.gbp_jpy_rate, config, row.category).price;
  }
  return row.price_gbp;
}

// ── Card filter builder ─────────────────────────────────────────────────

interface CardFilterParams {
  game?: string;
  set?: string;
  q?: string;
  in_stock?: boolean;
  category?: string;
}

/**
 * Build the WHERE clause the HTTP /api/v1/prices route builds, including
 * the kingdom-086 set resolution (canonical set_id FK with set_code text
 * fallback). Returns null when the game doesn't exist — the HTTP API 404s
 * there and the Falcon renders that as an empty page, so "no such game →
 * no rows" is the truthful equivalent.
 *
 * One deliberate divergence: the q predicate also matches sku, which the
 * retired wholesale HTTP route (its API is dark) never did — the
 * storefront's full-SKU deep links depend on it.
 */
async function buildCardFilter(
  params: CardFilterParams,
): Promise<{ where: string; args: unknown[] } | null> {
  const clauses: string[] = [];
  const args: unknown[] = [];
  const push = (value: unknown): number => args.push(value);

  let gameId: number | null = null;
  if (params.game) {
    const { rows } = await q<{ id: number }>(
      `SELECT id FROM games WHERE code = $1 OR slug = $1 LIMIT 1`,
      [params.game],
    );
    if (rows.length === 0) return null;
    gameId = rows[0].id;
    clauses.push(`game_id = $${push(gameId)}`);
  }

  if (params.q) {
    const n = push(`%${params.q}%`);
    // sku is included so full-SKU deep links (e.g. /market/list?sku=OP-OP01-024-JP,
    // the "list yours" affordance) can resolve: a full SKU is not a
    // substring of card_number, so without this the lookup returns nothing.
    clauses.push(`(card_number ILIKE $${n} OR name ILIKE $${n} OR name_en ILIKE $${n} OR sku ILIKE $${n})`);
  }

  if (params.in_stock) {
    clauses.push(`stock > 0`);
  }

  if (params.set) {
    const setWhere = gameId !== null ? `code = $1 AND game_id = $2` : `code = $1`;
    const setArgs = gameId !== null ? [params.set, gameId] : [params.set];
    const { rows } = await q<{ id: number }>(
      `SELECT id FROM sets WHERE ${setWhere} LIMIT 1`,
      setArgs,
    );
    if (rows.length > 0) {
      clauses.push(`(set_id = $${push(rows[0].id)} OR set_code = $${push(params.set)})`);
    } else {
      clauses.push(`set_code = $${push(params.set)}`);
    }
  }

  if (params.category === "singles" || params.category === "sealed") {
    clauses.push(`category = $${push(params.category)}`);
  }

  return { where: clauses.length ? clauses.join(" AND ") : "TRUE", args };
}

// ── fetchPrices shape ───────────────────────────────────────────────────

interface CardRow {
  sku: string;
  card_number: string;
  price: string | null;
  cardrush_jpy: number | null;
  gbp_jpy_rate: number | null;
  stock: number;
  pending_stock: number;
  image_url: string | null;
  name: string | null;
  name_en: string | null;
  set_code: string | null;
  set_name: string | null;
  rarity: string | null;
  category: string | null;
  last_synced_at: Date | null;
}

export async function dbFetchPrices(params?: {
  game?: string;
  set?: string;
  q?: string;
  sort?: string;
  in_stock?: boolean;
  limit?: number;
  offset?: number;
  category?: string;
  channel?: string;
}): Promise<PricesResponse> {
  const channel = params?.channel ?? "cambridgetcg";
  const limit = Math.min(Math.max(params?.limit ?? 48, 1), 500);
  const offset = Math.max(params?.offset ?? 0, 0);

  const filter = await buildCardFilter(params ?? {});
  if (filter === null) {
    return { count: 0, total: 0, channel, items: [], source: "wholesale-db" };
  }

  // Same sort vocabulary as the HTTP route; unknown sorts fall to
  // card_number, matching its default branch.
  const orderBy =
    params?.sort === "price_asc" ? "price ASC" :
    params?.sort === "price_desc" ? "price DESC" :
    params?.sort === "name_asc" ? "name_en ASC" :
    "card_number ASC";

  const countArgs = [...filter.args];
  const [{ rows: countRows }, { rows }] = await Promise.all([
    q<{ total: number }>(
      `SELECT count(*)::int AS total FROM cards WHERE ${filter.where}`,
      countArgs,
    ),
    q<CardRow>(
      `SELECT sku, card_number, price, cardrush_jpy, gbp_jpy_rate, stock,
              pending_stock, image_url, name, name_en, set_code, set_name,
              rarity, category, last_synced_at
         FROM cards
        WHERE ${filter.where}
        ORDER BY ${orderBy}
        LIMIT $${filter.args.length + 1} OFFSET $${filter.args.length + 2}`,
      [...filter.args, limit, offset],
    ),
  ]);

  const needsChannelPrice = channel !== "wholesale";
  const config = needsChannelPrice ? await channelConfigFor(channel) : null;

  const items = rows.map((r) => {
    const priceGbp = r.price === null ? null : Number(r.price);
    const item: PriceItem = {
      sku: r.sku,
      card_number: r.card_number,
      // NULL when the card has never been priced — the HTTP API returns
      // null here too (drizzle passes NULL through the money type).
      price_gbp: priceGbp as unknown as number,
      stock: r.stock,
      pending_stock: r.pending_stock,
      image_url: r.image_url,
      name: r.name_en || r.name,
      name_en: r.name_en,
      set_code: r.set_code,
      set_name: r.set_name,
      rarity: r.rarity,
      category: r.category,
      updated_at: r.last_synced_at ? new Date(r.last_synced_at).toISOString() : null,
    };
    if (config) {
      const cp = channelPriceForRow(
        {
          cardrush_jpy: r.cardrush_jpy,
          gbp_jpy_rate: r.gbp_jpy_rate,
          category: r.category,
          price_gbp: priceGbp,
        },
        config,
      );
      item.channel_price = cp as unknown as number;
    }
    return item;
  });

  return {
    total: countRows[0]?.total ?? 0,
    count: items.length,
    channel,
    items,
    source: "wholesale-db",
  };
}

/**
 * Single-card ground-route read — the per-SKU sibling of dbFetchPrices.
 *
 * fetchCard's HTTP path 401s locally and times out in production (the
 * wholesale API is retired), leaving the card page with a nameless SKU
 * and no reference price while the /market table — which reads through
 * dbFetchPrices — shows both. This read closes that gap: the card page's
 * reference price now resolves from the same substrate the table uses, so
 * the two surfaces stop disagreeing. Returns null when the SKU is unknown
 * (a genuine miss); THROWS on database failure so callers can tell a
 * missing card from a downed source.
 */
export async function dbFetchCard(
  sku: string,
  channel = "cambridgetcg",
): Promise<PriceItem | null> {
  const { rows } = await q<CardRow>(
    `SELECT sku, card_number, price, cardrush_jpy, gbp_jpy_rate, stock,
            pending_stock, image_url, name, name_en, set_code, set_name,
            rarity, category, last_synced_at
       FROM cards
      WHERE sku = $1
      LIMIT 1`,
    [sku],
  );
  const r = rows[0];
  if (!r) return null;

  const priceGbp = r.price === null ? null : Number(r.price);
  const item: PriceItem = {
    sku: r.sku,
    card_number: r.card_number,
    price_gbp: priceGbp as unknown as number,
    stock: r.stock,
    pending_stock: r.pending_stock,
    image_url: r.image_url,
    name: r.name_en || r.name,
    name_en: r.name_en,
    set_code: r.set_code,
    set_name: r.set_name,
    rarity: r.rarity,
    category: r.category,
    updated_at: r.last_synced_at ? new Date(r.last_synced_at).toISOString() : null,
  };

  if (channel !== "wholesale") {
    const config = await channelConfigFor(channel);
    item.channel_price = channelPriceForRow(
      {
        cardrush_jpy: r.cardrush_jpy,
        gbp_jpy_rate: r.gbp_jpy_rate,
        category: r.category,
        price_gbp: priceGbp,
      },
      config,
    ) as unknown as number;
  }

  return item;
}

// dbFetchChannelPriceMap — the one-query trade-in-credit price map that
// fed the catalog route's we-buy enrichment — was removed on 2026-07-06
// with the rest of the house desk (docs/decisions/2026-07-06-collectors-
// first.md). The house computes no price channel of its own for the
// market anymore; channelPriceForRow stays for the per-item paths above.

// ── fetchGames / fetchSets shapes ───────────────────────────────────────

export async function dbFetchGames(): Promise<GameItem[]> {
  const { rows } = await q<GameItem>(
    `SELECT g.code, g.name, g.slug, g.image_url, count(c.id)::int AS card_count
       FROM games g
       LEFT JOIN cards c ON c.game_id = g.id
      WHERE g.active = true
      GROUP BY g.id
      ORDER BY g.sort_order`,
  );
  return rows;
}

export async function dbFetchSets(game?: string): Promise<SetItem[]> {
  const args: unknown[] = [];
  let gameClause = "";
  if (game) {
    args.push(game);
    gameClause = `AND (g.code = $1 OR g.slug = $1)`;
  }
  const { rows } = await q<SetItem>(
    `SELECT s.code, s.name, g.code AS game_code,
            count(c.id)::int AS card_count, s.release_date
       FROM sets s
       JOIN games g ON g.id = s.game_id
       LEFT JOIN cards c ON c.set_id = s.id
      WHERE s.active = true ${gameClause}
      GROUP BY s.id, g.code
      ORDER BY g.code, s.sort_order`,
    args,
  );
  return rows;
}
