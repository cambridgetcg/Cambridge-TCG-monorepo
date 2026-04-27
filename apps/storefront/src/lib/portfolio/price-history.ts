// Daily sampling of wholesale/spot prices for SKUs any user cares about,
// plus query helpers for trend displays.

import { query } from "@/lib/db";
import { fetchCard } from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";

// ── daily sampling cron ─────────────────────────────────────────────────

export interface PriceHistoryTickResult {
  skusConsidered: number;
  captured: number;
  failed: number;
  skipped: number;
}

/**
 * Upsert today's price row for each SKU that any user is tracking.
 *
 * Called from the maintenance cron. Idempotent within a day: if a row for
 * today already exists the INSERT ... ON CONFLICT DO NOTHING skips it.
 * That means running the cron 60 times a day is free — no extra wholesale
 * calls after the first pass, just a cheap SELECT of the already-sampled
 * SKUs to skip them.
 */
export async function runPriceHistoryTick(): Promise<PriceHistoryTickResult> {
  // 1. Universe of SKUs: every distinct sku in portfolio_cards. (Future:
  //    union with portfolio_price_alerts once that exists.)
  const skusRes = await query(
    `SELECT DISTINCT sku FROM portfolio_cards`,
  );
  const universe: string[] = skusRes.rows.map((r) => r.sku);
  if (universe.length === 0) {
    return { skusConsidered: 0, captured: 0, failed: 0, skipped: 0 };
  }

  // 2. Which of those already have a row for today? Skip those.
  const already = await query(
    `SELECT sku FROM card_price_history
     WHERE captured_on = CURRENT_DATE AND sku = ANY($1::text[])`,
    [universe],
  );
  const done = new Set(already.rows.map((r) => r.sku as string));
  const todo = universe.filter((s) => !done.has(s));

  let captured = 0;
  let failed = 0;

  // 3. For each remaining SKU, fetch + upsert. Done serially to avoid
  //    hammering the wholesale endpoint — the set is small for now. If
  //    we ever have thousands of tracked SKUs, batch this with Promise.all
  //    in chunks of 10.
  for (const sku of todo) {
    try {
      const card = await fetchCard(sku);
      if (!card) { failed++; continue; }
      const spot = retailPrice(card.price_gbp, card.channel_price);
      await query(
        `INSERT INTO card_price_history (sku, captured_on, spot_gbp, wholesale_gbp)
         VALUES ($1, CURRENT_DATE, $2, $3)
         ON CONFLICT (sku, captured_on) DO NOTHING`,
        [sku, spot.toFixed(2), card.price_gbp],
      );
      captured++;
    } catch (err) {
      failed++;
      console.error(`[price-history] failed for ${sku}:`, err);
    }
  }

  return {
    skusConsidered: universe.length,
    captured,
    failed,
    skipped: done.size,
  };
}

// ── query helpers ───────────────────────────────────────────────────────

export interface PriceChange {
  sku: string;
  latest: number;
  previous: number;
  delta: number;
  deltaPct: number;
}

/**
 * For each supplied SKU, find the most recent captured row and the row from
 * exactly N days ago (or the nearest earlier). Returns only SKUs with both
 * observations present.
 */
export async function getPriceChanges(
  skus: string[],
  daysAgo: number,
): Promise<Map<string, PriceChange>> {
  if (skus.length === 0) return new Map();

  const rows = await query(
    `WITH latest AS (
       SELECT DISTINCT ON (sku) sku, captured_on, spot_gbp
       FROM card_price_history
       WHERE sku = ANY($1::text[])
       ORDER BY sku, captured_on DESC
     ),
     past AS (
       SELECT DISTINCT ON (sku) sku, captured_on, spot_gbp
       FROM card_price_history
       WHERE sku = ANY($1::text[])
         AND captured_on <= CURRENT_DATE - $2::int
       ORDER BY sku, captured_on DESC
     )
     SELECT
       l.sku,
       l.spot_gbp::numeric AS latest,
       p.spot_gbp::numeric AS previous
     FROM latest l
     JOIN past p USING (sku)`,
    [skus, daysAgo],
  );

  const out = new Map<string, PriceChange>();
  for (const r of rows.rows) {
    const latest = parseFloat(r.latest);
    const previous = parseFloat(r.previous);
    if (previous === 0) continue;
    out.set(r.sku, {
      sku: r.sku,
      latest,
      previous,
      delta: latest - previous,
      deltaPct: ((latest - previous) / previous) * 100,
    });
  }
  return out;
}

/**
 * Per-SKU time series in chronological order. Used for per-card mini charts.
 */
export async function getPriceSeries(sku: string, days: number = 30): Promise<Array<{ captured_on: string; spot_gbp: number }>> {
  const r = await query(
    `SELECT captured_on, spot_gbp
     FROM card_price_history
     WHERE sku = $1 AND captured_on >= CURRENT_DATE - $2::int
     ORDER BY captured_on ASC`,
    [sku, days],
  );
  return r.rows.map((row) => ({
    captured_on: row.captured_on,
    spot_gbp: parseFloat(row.spot_gbp),
  }));
}
