-- Phase 4 of kingdom-049: rename `card_price_history` →
-- `retail_price_observation` to make the substrate-honest distinction
-- visible at the schema level.
--
-- The storefront's `card_price_history` is what the storefront RECORDED
-- showing customers — retail spot + best bid + best ask, sampled daily.
-- Wholesale's `price_archive` is what the kingdom COMPUTED for the day —
-- canonical, with the full JPY-to-GBP breakdown. Two facts, same general
-- shape, different intent. The old name conflated them.
--
-- See docs/connections/the-pricing-arrow.md (S17) for the framing:
-- *observation* (what we showed) vs *archive* (what we computed).
--
-- The rename is also schema-honest: a future reader scanning the
-- storefront migrations will see "retail_price_observation" and not
-- assume it's a sibling of wholesale's authoritative archive.
--
-- ⚠️  Operator review required before applying. Confirm no in-flight
-- application reads from `card_price_history` after the rename without
-- the code update at apps/storefront/src/lib/portfolio/price-history.ts
-- (and related sites). Deploy code update + migration together.

ALTER TABLE IF EXISTS card_price_history
  RENAME TO retail_price_observation;

-- Rename the primary index (PostgreSQL doesn't auto-rename PK indexes).
-- If the constraint name differs, this is best-effort; manual cleanup
-- via psql is fine since it's purely cosmetic.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'card_price_history_pkey'
  ) THEN
    ALTER TABLE retail_price_observation
      RENAME CONSTRAINT card_price_history_pkey TO retail_price_observation_pkey;
  END IF;
END $$;
