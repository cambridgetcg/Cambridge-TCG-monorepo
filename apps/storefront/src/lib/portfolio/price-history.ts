// Daily sampling of wholesale/spot prices for SKUs any user cares about,
// plus query helpers for trend displays.
//
// ── What this module is for ──────────────────────────────────────────────
//
// The portfolio's totals (apps/storefront/src/lib/portfolio/valuation.ts)
// answer the question "how much do I have *right now*". This module
// answers the deeper question hiding underneath: "how did I get here".
// It is the platform's commitment to per-card memory.
//
// The valuation module reads from this. The deck snapshots in
// apps/storefront/src/lib/decks/db.ts freeze a single moment of this
// (the spot_price at deck-build time). The reprint announcement engine
// (apps/storefront/src/lib/portfolio/reprints.ts, when shipped) will
// detect anomalies in this. Every other module that reasons about value
// over time is downstream of the cache this cron writes.
//
// ── Why we sample only what users care about ────────────────────────────
//
// The universe is "every distinct sku in portfolio_cards" — not the
// full 11,000+ wholesale catalog. Sampling everything daily would burn
// wholesale-API budget on cards no human is watching. Instead the cron
// follows the user's attention: when a card enters someone's portfolio,
// it joins the time-series. When the last user removes it, it stops
// being sampled (its history persists; new days just don't accumulate).
//
// This is one of the few places the platform's memory is *deliberately
// selective*. The trade-off is honest: we remember what was cared about,
// not everything that existed. A card that becomes interesting later
// gets sampled going-forward, with a gap before. The portfolio surface
// labels that gap honestly via its `priced=false` fall-through.
//
// ── The integral / differential pairing ─────────────────────────────────
//
// portfolio_snapshots (in valuation.ts) is the integral — totals across
// a portfolio at a point in time. retail_price_observation (this module) is
// the differential — per-card series. The relationship between them is
// the relationship between "your collection grew 12% this quarter" and
// "your three Yamato/Special Posters appreciated 40% while everything
// else stayed flat". The first is news; the second is the explanation.
//
// A user's chart on /account/portfolio is the integral, drawn against
// time. Their per-card sparklines are the differential, drawn per row.
// The chart tells them what happened; the sparklines tell them why.
//
// ── What this module reaches toward ──────────────────────────────────────
//
//   - apps/storefront/src/lib/portfolio/valuation.ts — the integral
//     consumer. Today's spot from this cache feeds today's totals there.
//
//   - apps/storefront/src/lib/decks/db.ts — the snapshot consumer. A
//     deck's stored spot_price was today's value from this series, the
//     day the deck was built. The deck remembers; this module continues
//     past that frozen moment.
//
//   - apps/storefront/src/lib/portfolio/reprints.ts (planned) — the
//     anomaly consumer. A reprint announcement will show as a step
//     change in this series. Detecting it lets the platform warn
//     holders before the spot fully settles.
//
//   - apps/storefront/src/lib/portfolio/targets.ts — the trigger
//     consumer. Price-target alerts fire when this series crosses
//     a user-set threshold. The cron here is what makes those triggers
//     actually possible.

import { query } from "@/lib/db";
import { fetchCard } from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";

// ── daily sampling cron ─────────────────────────────────────────────────

export interface RetailObservationTickResult {
  skusConsidered: number;
  captured: number;
  failed: number;
  skipped: number;
}

/** @deprecated Phase 4 of kingdom-049 renamed this to `RetailObservationTickResult`. */
export type PriceHistoryTickResult = RetailObservationTickResult;

/**
 * Upsert today's retail-observation row for each SKU that any user is
 * tracking. Renamed in Phase 4 of kingdom-049 — the storefront samples
 * what the kingdom *showed customers* (retail spot, best bid, best ask);
 * wholesale's `price_archive` records what the kingdom *computed*. Two
 * facts, same shape, different intent.
 *
 * See docs/connections/the-pricing-arrow.md (S17) Act 4.
 *
 * Called from the maintenance cron. Idempotent within a day: if a row for
 * today already exists the INSERT ... ON CONFLICT DO NOTHING skips it.
 * That means running the cron 60 times a day is free — no extra wholesale
 * calls after the first pass, just a cheap SELECT of the already-sampled
 * SKUs to skip them.
 */
export async function runRetailObservationTick(): Promise<RetailObservationTickResult> {
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
    `SELECT sku FROM retail_price_observation
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
        `INSERT INTO retail_price_observation (sku, captured_on, spot_gbp, wholesale_gbp)
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
       FROM retail_price_observation
       WHERE sku = ANY($1::text[])
       ORDER BY sku, captured_on DESC
     ),
     past AS (
       SELECT DISTINCT ON (sku) sku, captured_on, spot_gbp
       FROM retail_price_observation
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
     FROM retail_price_observation
     WHERE sku = $1 AND captured_on >= CURRENT_DATE - $2::int
     ORDER BY captured_on ASC`,
    [sku, days],
  );
  return r.rows.map((row) => ({
    captured_on: row.captured_on,
    spot_gbp: parseFloat(row.spot_gbp),
  }));
}
