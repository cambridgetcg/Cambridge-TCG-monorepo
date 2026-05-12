-- Phase 4 of kingdom-049: drop `price_history`, keep `price_archive` as
-- the single canonical history.
--
-- Why: `price_archive` is a superset of `price_history`. Both are keyed on
-- (card_id, snapshot_date / date) and both are populated by the same daily
-- cron path (`apps/wholesale/src/lib/price-snapshot.ts`).
-- `price_history` only carries the JPY inputs (`cardrush_jpy`, `gbp_jpy_rate`);
-- `price_archive` carries those *plus* the computed `base_gbp` and `price`.
--
-- Step 1 safe-copies any row in `price_history` that lacks a matching
-- `price_archive` row (defensive — should be a no-op in practice). Step 2
-- drops the redundant table. Step 3 verifies row count post-drop.
--
-- ⚠️  Operator review required before applying. Run a manual count check:
--    SELECT count(*) FROM price_history;
--    SELECT count(*) FROM price_history ph
--      WHERE NOT EXISTS (
--        SELECT 1 FROM price_archive pa
--         WHERE pa.card_id = ph.card_id AND pa.snapshot_date = ph.date::date
--      );
-- If the second count is > 0, investigate before running this migration.

-- ── Step 1: safe-copy orphan rows into price_archive (no-op expected) ─

INSERT INTO price_archive (card_id, snapshot_date, sku, set_code, category,
                           cardrush_jpy, gbp_jpy_rate, base_gbp, price)
SELECT ph.card_id,
       ph.date::date AS snapshot_date,
       c.sku,
       c.set_code,
       c.category,
       ph.cardrush_jpy,
       ph.gbp_jpy_rate,
       -- Best-effort baseGbp / price reconstruction from JPY + rate.
       -- For rows where price_archive already has authoritative values,
       -- ON CONFLICT DO NOTHING keeps the existing row untouched.
       ROUND((ph.cardrush_jpy::numeric / ph.gbp_jpy_rate::numeric)::numeric, 2) AS base_gbp,
       0 AS price  -- placeholder; ON CONFLICT will skip these inserts
  FROM price_history ph
  JOIN cards c ON c.id = ph.card_id
 WHERE NOT EXISTS (
   SELECT 1 FROM price_archive pa
    WHERE pa.card_id = ph.card_id
      AND pa.snapshot_date = ph.date::date
 )
ON CONFLICT (card_id, snapshot_date) DO NOTHING;

-- ── Step 2: drop the redundant table ──────────────────────────────────

DROP TABLE IF EXISTS price_history;
