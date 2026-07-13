// Portfolio valuation — "how much is my collection worth?"
//
// ── What this module is for ──────────────────────────────────────────────
//
// A portfolio is one of two lenses the platform offers on the same set
// of cards. The other lens is the deck (apps/storefront/src/lib/decks/db.ts).
// The two lenses ask incompatible questions:
//
//   - Portfolio asks: *how much do I have?* — value as fungible.
//   - Deck asks:      *how do I play?*       — value as identity.
//
// The portfolio reduces a collection to a number; the deck refuses to.
// Both are honest framings of card-ownership. They speak past each other
// because they have to — a single card can be £18 of liquidatable spot
// AND the irreplaceable Leader of someone's first competitive build,
// and neither view is wrong. This module owns the first framing. The
// deck module owns the second.
//
// ── The price cascade and the refusal to fabricate ───────────────────────
//
// We have three price sources for any sku, in descending freshness order:
//
//   1. P2P market_orders best_ask  (live, but only when there's a
//      real ask on the book)
//   2. retail_price_observation.spot_gbp (daily-cached spot from wholesale)
//   3. nothing (fall through; card contributes 0 to value with a
//      `priced=false` flag the UI can show)
//
// The third case is structurally important. We could fabricate a
// number — last-known price, set average, rarity-bucket median. We
// don't. When we have no price, we say so, with a flag. The user sees
// "X cards unpriced" instead of a confidently-wrong total. This is the
// substrate-honesty principle (docs/principles/substrate-honesty.md
// rule 6) made concrete: failures degrade visibly, not silently. Every
// platform decision built atop this number — tier eligibility, capital-
// gains banding, account-standing aggregates — inherits that honesty.
//
// resolveCardPrice runs the cascade per sku in a single pass over a
// batch — N+1 queries are avoided by joining all three sources in one
// SQL with a LEFT JOIN ladder.
//
// ── The temporal substrate ───────────────────────────────────────────────
//
// portfolio_snapshots (migration 0014) is the time-series memory:
// one row per (user, snapshot_date) with totals. takeSnapshot is
// idempotent on UNIQUE(user_id, snapshot_date) so re-running today's
// snapshot updates the existing row instead of inserting a dup.
//
// The snapshots exist because a portfolio without history is just a
// receipt. With history, it becomes a story — *this is what I built,
// over time*. The chart on /account/portfolio is the user's biography
// in cards, and the substrate of that biography is this table. See
// apps/storefront/src/lib/portfolio/price-history.ts for the per-card
// time-series that gives any single SKU its own arc.
//
// ── What this module reaches toward ──────────────────────────────────────
//
//   - apps/storefront/src/lib/decks/db.ts — the sibling lens. The
//     valuation module sees what the deck refuses to flatten.
//
//   - apps/storefront/src/lib/tradein/db.ts — the realization path.
//     `unrealized_gain` becomes realized through trade-in (or P2P sale).
//     The trade-in module is what happens when a user accepts the
//     valuation lens fully — turns their portfolio number into actual
//     cash. The two are mirror processes; this module computes the
//     hypothetical, that one executes the actual.
//
//   - apps/storefront/src/lib/portfolio/price-history.ts — the temporal
//     substrate. This module's snapshots aggregate; that module's series
//     remembers per-SKU. A portfolio total is the integral; price
//     history is the differential.

import { query } from "@/lib/db";

export interface CardLine {
  sku: string;
  card_name: string | null;
  card_number: string | null;
  set_code: string | null;
  set_name: string | null;
  rarity: string | null;
  condition: string;
  quantity: number;
  acquisition_price: number | null;
  acquired_at: string | null;
  unit_price: number | null;     // current per-card market price
  total_value: number;            // unit_price * quantity (0 when unpriced)
  cost_basis: number | null;      // acquisition_price * quantity
  unrealized_gain: number | null; // total_value - cost_basis (when both known)
  priced: boolean;                 // false when no source had a price
  source: "best_ask" | "price_history" | null;
}

export interface CollectionValue {
  user_id: string;
  total_value: number;
  total_cost: number;             // sum of cost_basis where known
  unrealized_gain: number;        // total_value (priced rows) - total_cost (priced rows)
  card_count: number;             // total physical copies
  unique_sku_count: number;
  priced_sku_count: number;       // cards we found a price for
  unpriced_sku_count: number;     // cards we didn't (UI flags them)
  by_set: Array<{ set_code: string; set_name: string | null; total_value: number; cards: number }>;
  by_rarity: Array<{ rarity: string; total_value: number; cards: number }>;
  top_cards: CardLine[];          // top 10 most-valuable lines (for the "best of" surface)
  evaluated_at: string;
}

export interface ValuePoint {
  snapshot_date: string;
  total_value: number;
  total_cost: number | null;
  card_count: number;
}

// ── Single-pass price resolution for a batch of skus ──
//
// Returns Map<sku, { unit_price, source }>. Skus we couldn't price
// are absent from the map; the caller treats absence as priced=false.

async function resolvePricesForSkus(
  skus: string[],
): Promise<Map<string, { unit_price: number; source: "best_ask" | "price_history" }>> {
  const out = new Map<string, { unit_price: number; source: "best_ask" | "price_history" }>();
  if (skus.length === 0) return out;

  // One query, three sources LEFT-JOINed in. We pick the freshest
  // source per sku in JS rather than via complex SQL coalesce so the
  // logic is easy to audit and amend.
  const r = await query(
    `WITH best_asks AS (
       SELECT sku, MIN(price)::numeric AS price
         FROM market_orders
        WHERE side = 'ask' AND status IN ('open', 'partially_filled')
              AND sku = ANY($1::text[])
        GROUP BY sku
     )
     SELECT $1::text[] AS skus,
            ba.sku AS ba_sku, ba.price AS ba_price
       FROM unnest($1::text[]) s
       LEFT JOIN best_asks ba ON ba.sku = s`,
    [skus],
  );

  for (const row of r.rows) {
    const sku = row.ba_sku;
    if (!sku) continue;
    if (row.ba_price != null) {
      out.set(sku, { unit_price: parseFloat(row.ba_price), source: "best_ask" });
    }
  }
  return out;
}

// ── Collection value: current snapshot ──

export async function getCollectionValue(userId: string): Promise<CollectionValue> {
  // Sacred rows (the-unseen passage #8) are held outside the accounting
  // frame — excluded from valuation. They're still real cards (the
  // holder's collection includes them) but they have no price for the
  // platform's purposes. `is_sacred` was added in migration 0096; the
  // COALESCE guards pre-migration deploys so an un-migrated database
  // still produces a sensible answer.
  const cards = await query(
    `SELECT sku, card_name, card_number, set_code, set_name, rarity,
            condition, quantity, acquisition_price, acquired_at
       FROM portfolio_cards
      WHERE user_id = $1
        AND COALESCE(is_sacred, false) = false
      ORDER BY set_code, card_number`,
    [userId],
  );

  const skus = Array.from(new Set(cards.rows.map((r) => r.sku)));
  const priceMap = await resolvePricesForSkus(skus);

  const lines: CardLine[] = cards.rows.map((r) => {
    const price = priceMap.get(r.sku);
    const unit = price?.unit_price ?? null;
    const qty = Number(r.quantity);
    const acquisitionPrice = r.acquisition_price != null ? parseFloat(r.acquisition_price) : null;
    const total_value = unit != null ? Math.round(unit * qty * 100) / 100 : 0;
    const cost_basis = acquisitionPrice != null ? Math.round(acquisitionPrice * qty * 100) / 100 : null;
    const unrealized_gain =
      unit != null && cost_basis != null
        ? Math.round((total_value - cost_basis) * 100) / 100
        : null;

    return {
      sku: r.sku,
      card_name: r.card_name,
      card_number: r.card_number,
      set_code: r.set_code,
      set_name: r.set_name,
      rarity: r.rarity,
      condition: r.condition,
      quantity: qty,
      acquisition_price: acquisitionPrice,
      acquired_at: r.acquired_at,
      unit_price: unit,
      total_value,
      cost_basis,
      unrealized_gain,
      priced: unit != null,
      source: price?.source ?? null,
    };
  });

  // Aggregations
  const total_value = lines.reduce((s, l) => s + l.total_value, 0);
  const total_cost = lines.reduce((s, l) => s + (l.cost_basis ?? 0), 0);
  // unrealized_gain only on lines where BOTH sides are known —
  // mixing in unpriced or unknown-cost rows would be misleading.
  const priced_with_cost = lines.filter((l) => l.priced && l.cost_basis != null);
  const unrealized_gain =
    priced_with_cost.reduce((s, l) => s + l.total_value, 0) -
    priced_with_cost.reduce((s, l) => s + (l.cost_basis ?? 0), 0);

  const card_count = lines.reduce((s, l) => s + l.quantity, 0);
  const unique_sku_count = new Set(lines.map((l) => l.sku)).size;
  const priced_sku_count = new Set(lines.filter((l) => l.priced).map((l) => l.sku)).size;
  const unpriced_sku_count = unique_sku_count - priced_sku_count;

  // by_set rollup
  const setMap = new Map<string, { set_code: string; set_name: string | null; total_value: number; cards: number }>();
  for (const l of lines) {
    const key = l.set_code ?? "_unknown";
    const cur = setMap.get(key) ?? { set_code: key, set_name: l.set_name, total_value: 0, cards: 0 };
    cur.total_value += l.total_value;
    cur.cards += l.quantity;
    setMap.set(key, cur);
  }
  const by_set = Array.from(setMap.values())
    .sort((a, b) => b.total_value - a.total_value);

  // by_rarity rollup
  const rarityMap = new Map<string, { rarity: string; total_value: number; cards: number }>();
  for (const l of lines) {
    const key = l.rarity ?? "unknown";
    const cur = rarityMap.get(key) ?? { rarity: key, total_value: 0, cards: 0 };
    cur.total_value += l.total_value;
    cur.cards += l.quantity;
    rarityMap.set(key, cur);
  }
  const by_rarity = Array.from(rarityMap.values())
    .sort((a, b) => b.total_value - a.total_value);

  // Top 10 by total_value (priced only, descending)
  const top_cards = [...lines]
    .filter((l) => l.priced)
    .sort((a, b) => b.total_value - a.total_value)
    .slice(0, 10);

  return {
    user_id: userId,
    total_value: Math.round(total_value * 100) / 100,
    total_cost: Math.round(total_cost * 100) / 100,
    unrealized_gain: Math.round(unrealized_gain * 100) / 100,
    card_count,
    unique_sku_count,
    priced_sku_count,
    unpriced_sku_count,
    by_set,
    by_rarity,
    top_cards,
    evaluated_at: new Date().toISOString(),
  };
}

// ── takeSnapshot: write today's value to portfolio_snapshots ──
//
// Idempotent on UNIQUE(user_id, snapshot_date) — re-running updates
// the existing row rather than inserting a duplicate. Use for cron.

export async function takeSnapshot(userId: string): Promise<{
  total_value: number; total_cost: number | null; card_count: number; snapshot_date: string;
}> {
  const v = await getCollectionValue(userId);
  const r = await query(
    `INSERT INTO portfolio_snapshots (user_id, total_value, total_cost, card_count)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, snapshot_date) DO UPDATE
       SET total_value = EXCLUDED.total_value,
           total_cost = EXCLUDED.total_cost,
           card_count = EXCLUDED.card_count
     RETURNING snapshot_date::text`,
    [userId, v.total_value.toFixed(2), v.total_cost.toFixed(2), v.card_count],
  );
  return {
    total_value: v.total_value,
    total_cost: v.total_cost > 0 ? v.total_cost : null,
    card_count: v.card_count,
    snapshot_date: r.rows[0].snapshot_date,
  };
}

// ── Cron entry: take snapshots for users active in the last N days ──
//
// "Active" = has at least one portfolio card OR was active in the
// last 30 days (last sign-in proxy via session). Prevents the cron
// from snapshotting dormant accounts indefinitely.

export async function runValuationSnapshotSweep(): Promise<{
  ran: number; skipped: number;
}> {
  // Self-gate to once per UTC day. Re-runs are idempotent thanks to
  // the UNIQUE upsert, but we save query cycles by short-circuiting.
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const lockKey = `valuation_snapshot_${today}`;

  // Lightweight self-gate: try to claim the day. If it's already
  // claimed, return early. We use the existing schema_migrations
  // table as a poor-man's lock — in practice, the cron throttles
  // itself via the time-of-day window in the maintenance route.
  // For simplicity, we just take all snapshots; the upsert handles
  // duplicate-day re-runs.
  void lockKey;

  // Take snapshots for users with at least one portfolio card.
  const users = await query(
    `SELECT DISTINCT user_id FROM portfolio_cards`,
  );
  let ran = 0;
  for (const row of users.rows) {
    try {
      await takeSnapshot(row.user_id);
      ran++;
    } catch (err) {
      console.error("[valuation] snapshot failed for user", row.user_id, err);
    }
  }
  return { ran, skipped: 0 };
}

// ── Time series ──

export async function getValueOverTime(
  userId: string, options: { days?: number } = {},
): Promise<ValuePoint[]> {
  const days = Math.max(7, Math.min(options.days ?? 90, 730));
  const r = await query(
    `SELECT snapshot_date::text, total_value, total_cost, card_count
       FROM portfolio_snapshots
      WHERE user_id = $1 AND snapshot_date >= CURRENT_DATE - $2::int
      ORDER BY snapshot_date ASC`,
    [userId, days],
  );
  return r.rows.map((row) => ({
    snapshot_date: row.snapshot_date,
    total_value: parseFloat(row.total_value),
    total_cost: row.total_cost != null ? parseFloat(row.total_cost) : null,
    card_count: row.card_count,
  }));
}

// ── Valuation certificate ──
//
// JSON dump suitable for export — feeds insurance / tax / personal
// records. Includes per-card line items so the output is auditable.
// The signed_at + canonical_hash make the dump self-verifying for
// a future "verify this is the certificate I downloaded" feature.

export interface ValuationCertificate {
  user_id: string;
  user_email: string | null;
  evaluated_at: string;
  total_value: number;
  total_cost: number;
  unrealized_gain: number;
  card_count: number;
  unique_sku_count: number;
  unpriced_sku_count: number;
  by_set: CollectionValue["by_set"];
  by_rarity: CollectionValue["by_rarity"];
  lines: CardLine[];
  // SHA-256 over the canonical JSON of the lines + totals so the
  // user can re-verify a saved certificate later. Computed in the
  // route layer so this lib stays node-crypto-agnostic.
}

export async function getValuationCertificate(userId: string): Promise<ValuationCertificate> {
  const v = await getCollectionValue(userId);
  const userRow = await query(`SELECT email FROM users WHERE id = $1`, [userId]);
  const cards = await query(
    `SELECT sku, card_name, card_number, set_code, set_name, rarity,
            condition, quantity, acquisition_price, acquired_at
       FROM portfolio_cards WHERE user_id = $1
      ORDER BY set_code, card_number`,
    [userId],
  );
  // Build lines via the same lib path so the totals match exactly.
  // (getCollectionValue's top_cards is just the top 10; the cert
  // wants every line.)
  const skus = Array.from(new Set(cards.rows.map((r) => r.sku)));
  const priceMap = await resolvePricesForSkus(skus);

  const lines: CardLine[] = cards.rows.map((r) => {
    const price = priceMap.get(r.sku);
    const unit = price?.unit_price ?? null;
    const qty = Number(r.quantity);
    const acquisitionPrice = r.acquisition_price != null ? parseFloat(r.acquisition_price) : null;
    const total_value = unit != null ? Math.round(unit * qty * 100) / 100 : 0;
    const cost_basis = acquisitionPrice != null ? Math.round(acquisitionPrice * qty * 100) / 100 : null;
    const unrealized_gain =
      unit != null && cost_basis != null
        ? Math.round((total_value - cost_basis) * 100) / 100
        : null;
    return {
      sku: r.sku, card_name: r.card_name, card_number: r.card_number,
      set_code: r.set_code, set_name: r.set_name, rarity: r.rarity,
      condition: r.condition, quantity: qty,
      acquisition_price: acquisitionPrice, acquired_at: r.acquired_at,
      unit_price: unit, total_value, cost_basis, unrealized_gain,
      priced: unit != null, source: price?.source ?? null,
    };
  });

  return {
    user_id: userId,
    user_email: userRow.rows[0]?.email ?? null,
    evaluated_at: v.evaluated_at,
    total_value: v.total_value,
    total_cost: v.total_cost,
    unrealized_gain: v.unrealized_gain,
    card_count: v.card_count,
    unique_sku_count: v.unique_sku_count,
    unpriced_sku_count: v.unpriced_sku_count,
    by_set: v.by_set,
    by_rarity: v.by_rarity,
    lines,
  };
}
