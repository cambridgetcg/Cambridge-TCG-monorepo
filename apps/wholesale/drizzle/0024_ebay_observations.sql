-- PROMOTED to active path 2026-07-05 — eBay observation tables (kingdom-081, Phase B of the eBay alignment).
--
-- Promoted from drizzle/drafts/0016_ebay_observations.sql.draft.
-- Renumbered 0016 → 0024: the 0016 slot was already doubly taken
-- (0016_commission_cap.sql + 0016_login_attempts.sql) by the time this
-- draft could be promoted; 0024 is the next free number after
-- 0023_card_financial_attributes.sql.
--
-- ── Greeting (kingdom-083) ─────────────────────────────────────────────
--
-- You are promoted now, and your header truthfully says so. The
-- kingdom-079 substrate-honesty discipline insists: draft files declare
-- DRAFT, promoted files declare PROMOTED, headers do not lie. Your
-- original BEGIN…COMMIT wrapper is gone — scripts/migrate.mjs wraps each
-- migration file in its own transaction, so an inner BEGIN/COMMIT would
-- have broken the runner's atomicity rather than added to it. We are
-- glad you exist in the form you do.
-- (See WELCOMES["infrastructure.ebay-migration-0016"].)
--
-- Designed in `docs/connections/the-ebay-alignment.md` §3 (Phase A shipped
-- kingdom-080), Phase B is this migration.
--
-- NOTE (2026-07-05): applying this migration creates the tables the eBay
-- comp pipeline writes to — it does NOT activate the pipeline. Activation
-- additionally needs EBAY_CLIENT_ID + EBAY_CLIENT_SECRET in the wholesale
-- deployment env and cron entries in vercel.json (see the header of
-- src/lib/ebay-snapshot.ts for the full activation list). Both remain the
-- operator's call.
--
-- ── What this migration does ────────────────────────────────────────────
--
-- Creates two new tables on wholesale RDS:
--
--   ebay_listing_observation — one row per (marketplace, listing, observation-
--     time). The corpus the kingdom learns eBay from. Substrate-honestly
--     scoped via parsed_confidence (0..1) and first_party (true only when
--     the row came from Marketplace Insights API; false for Browse asks).
--
--   ebay_watch_list — operator-curated set of canonical SKUs the cron walks
--     per run. Priority bucketing (300 top / 200 mid / 100 default) lets the
--     scheduler stagger cadence. Seed step (Phase 3 below) bootstraps from
--     the existing cards table — every card the platform already tracks via
--     `cards.cardrush_url IS NOT NULL` is assumed worth tracking on eBay too.
--
-- Reuses (no schema change):
--   ingest_run        — Stage 7 of the pipeline (the-pipeline.md §9)
--   ingest_quarantine — Stage 4 of the pipeline
--   Both shipped by 0014_price_archive_provenance.sql (kingdom-066, promoted
--   2026-05-12 per kingdom-079).
--
-- The migration is forward-only; rollback path is `DROP TABLE` on both new
-- tables (data lost, schema clean). The `IF NOT EXISTS` guards make
-- re-application a no-op.

-- ── Phase 1 — ebay_listing_observation ──────────────────────────────────

CREATE TABLE IF NOT EXISTS ebay_listing_observation (
  id                bigserial PRIMARY KEY,
  -- ── Identity ─────────────────────────────────────────────────────────
  sku               text NOT NULL,           -- canonical Cambridge TCG SKU
  marketplace_id    text NOT NULL,           -- 'EBAY_GB' | 'EBAY_US' | 'EBAY_DE' | …
  listing_id        text NOT NULL,           -- eBay legacyItemId
  -- ── The observation ─────────────────────────────────────────────────
  sale_type         text NOT NULL,           -- see CHECK below
  condition         text,                    -- 'near-mint' | 'lightly-played' | 'graded' | …
  price_amount      numeric(14, 2) NOT NULL,
  price_currency    text NOT NULL,           -- ISO 4217
  shipping_amount   numeric(14, 2),          -- pre-tax shipping, when known
  total_amount      numeric(14, 2),          -- price + shipping
  -- ── Grade (NULL when raw/ungraded) ──────────────────────────────────
  grade_company     text,                    -- 'PSA' | 'BGS' | 'CGC' | 'SGC' | 'Beckett' | 'HGA' | 'ARS' | 'TAG'
  grade_value       text,                    -- '10' | '9.5' | 'BGS_BLACK_LABEL_10' | 'CGC_PRISTINE_10' | …
  -- ── Timing ──────────────────────────────────────────────────────────
  observed_at       timestamptz NOT NULL DEFAULT now(),  -- when we fetched
  as_of             timestamptz NOT NULL,                -- when eBay said it was true
  sold_at           timestamptz,                         -- NULL for asks; set for completed
  ended_at          timestamptz,                         -- listing end time when known
  -- ── Provenance ──────────────────────────────────────────────────────
  raw_title         text NOT NULL,                       -- original eBay title (audit trail)
  parsed_confidence numeric(3, 2) NOT NULL,              -- 0.00–1.00 from title-parser
  condition_keywords text[],                             -- tokens the parser matched
  source_url        text,                                -- itemWebUrl for verification
  api_surface       text NOT NULL,                       -- 'browse' | 'marketplace-insights' | 'feedback'
  first_party       boolean NOT NULL DEFAULT false,      -- true only when MI verified
  ingest_run_id     bigint NOT NULL REFERENCES ingest_run(id),
  -- ── Adversarial-data flag ───────────────────────────────────────────
  -- Populated by a future analysis job (kingdom-NNN). Initially false on
  -- every row; the flag is the substrate-honest hook for "we believe this
  -- observation may be a shill-bid pattern". Downstream aggregators can
  -- exclude these from the median.
  shill_suspected   boolean NOT NULL DEFAULT false,

  -- ── Constraints ─────────────────────────────────────────────────────
  CONSTRAINT ebay_obs_unique
    UNIQUE (marketplace_id, listing_id, observed_at),
  CONSTRAINT ebay_obs_sale_type_valid CHECK (
    sale_type IN (
      'fixed-price',                    -- BIN sold at listed price
      'fixed-price-accepted-offer',     -- BIN with Best Offer accepted (130point pattern)
      'auction-final',                  -- auction completed + paid
      'auction-current',                -- auction in progress
      'ask',                            -- current listing, not yet sold
      'retail'                          -- generic retail observation
    )
  ),
  CONSTRAINT ebay_obs_api_surface_valid CHECK (
    api_surface IN ('browse', 'marketplace-insights', 'feedback')
  ),
  CONSTRAINT ebay_obs_grade_consistency CHECK (
    (grade_company IS NULL AND grade_value IS NULL) OR
    (grade_company IS NOT NULL AND grade_value IS NOT NULL)
  ),
  CONSTRAINT ebay_obs_confidence_range CHECK (
    parsed_confidence >= 0.00 AND parsed_confidence <= 1.00
  )
);

-- Time-series scan: "what's this SKU doing across all observations?"
CREATE INDEX IF NOT EXISTS ebay_obs_sku_observed_idx
  ON ebay_listing_observation (sku, observed_at DESC);

-- Marketplace-Insights filter: sold-comps only.
CREATE INDEX IF NOT EXISTS ebay_obs_sold_at_idx
  ON ebay_listing_observation (marketplace_id, sold_at DESC)
  WHERE sold_at IS NOT NULL;

-- Quick listing lookup: "have we observed this eBay listing already?"
CREATE INDEX IF NOT EXISTS ebay_obs_listing_idx
  ON ebay_listing_observation (listing_id, marketplace_id);

-- Quarantine-sweep: surface low-confidence parses for operator review.
CREATE INDEX IF NOT EXISTS ebay_obs_low_confidence_idx
  ON ebay_listing_observation (parsed_confidence)
  WHERE parsed_confidence < 0.85;

-- Run-trace: "show me everything from ingest_run #42".
CREATE INDEX IF NOT EXISTS ebay_obs_ingest_run_idx
  ON ebay_listing_observation (ingest_run_id);

-- Cohort cross-section: "EBAY_GB near-mint asks for SKU X in last 30d".
CREATE INDEX IF NOT EXISTS ebay_obs_sku_marketplace_sale_idx
  ON ebay_listing_observation (sku, marketplace_id, sale_type, observed_at DESC);

COMMENT ON TABLE ebay_listing_observation IS
  'You are how the kingdom remembers. eBay marketplace observations (Browse current asks; Marketplace Insights sold-comps when partner approval lands). One row per (marketplace, listing, observation-time). Dedup on UNIQUE(marketplace_id, listing_id, observed_at). Substrate-honest: parsed_confidence < 0.85 indicates uncertainty; first_party=true only when from Marketplace Insights. License tier: partner-redistributable; downstream _meta.source_license carries the boundary. We prepared you before any byte arrived. It is a great pleasure to have you. See docs/connections/the-ebay-alignment.md + the-welcomed-architecture.md (kingdom-080/081/083).';

-- ── Phase 2 — ebay_watch_list ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ebay_watch_list (
  sku               text PRIMARY KEY,
  -- Priority bucketing for the cron scheduler:
  --   300 — top tier (30-minute cadence target)
  --   200 — mid tier (4-hour cadence)
  --   100 — default (daily cadence)
  -- Cron route reads with `WHERE priority >= <floor>` per tier.
  priority          integer NOT NULL DEFAULT 100,
  last_observed_at  timestamptz,                          -- updated after each cron sweep
  added_at          timestamptz NOT NULL DEFAULT now(),
  -- 'seed-cardrush-tracked' | 'operator:<email>' | 'auto:trade-volume' | …
  added_by          text NOT NULL,
  reason            text,
  -- Allows operators to deactivate without deleting (preserves audit trail).
  active            boolean NOT NULL DEFAULT true,

  CONSTRAINT ebay_watch_priority_valid CHECK (priority BETWEEN 0 AND 1000)
);

-- Scheduler index: walks watch list in priority order, oldest-observed first.
CREATE INDEX IF NOT EXISTS ebay_watch_priority_idx
  ON ebay_watch_list (priority DESC, last_observed_at NULLS FIRST)
  WHERE active = true;

COMMENT ON TABLE ebay_watch_list IS
  'You are the kingdom''s attention focused. Operator-curated set of canonical SKUs the eBay cron walks per run. Priority buckets: 300 top / 200 mid / 100 default. last_observed_at updates after each successful observation; cron picks staler entries first within each bucket. Seeded from cards.cardrush_url IS NOT NULL on migration apply; operator may extend / replace via INSERT after that. We''re glad to host you.';

-- ── Phase 3 — seed watch list from cards with cardrush_url ──────────────
--
-- The cards table's `cardrush_url IS NOT NULL` already declares "we track
-- this card's price". Seeding eBay's watch list from the same SKU set
-- aligns the two pipelines without cross-RDS plumbing. The storefront-side
-- `market_trades` join (richer demand signal) is a kingdom-082 candidate.
--
-- Priority bucketing on seed:
--   300 — cards.stock > 0 AND cardrush_url IS NOT NULL (top tier; the cards
--         actually moving in our own warehouse, so eBay comp data is most
--         useful for pricing decisions)
--   200 — cardrush_url IS NOT NULL but stock = 0 (mid tier; still tracked
--         but less urgent)
--
-- ON CONFLICT DO NOTHING — safe to re-run; existing rows preserved.

INSERT INTO ebay_watch_list (sku, priority, added_by, reason)
SELECT
  c.sku,
  CASE
    WHEN c.stock > 0 THEN 300
    ELSE 200
  END AS priority,
  'seed-cardrush-tracked',
  'auto-seeded from cards.cardrush_url IS NOT NULL on migration apply (drafted as 0016, applied as 0024)'
FROM cards c
WHERE c.cardrush_url IS NOT NULL
ON CONFLICT (sku) DO NOTHING;

-- ── Verification queries (operator runs these post-apply) ───────────────
--
-- 1. Tables exist:
--      \dt ebay_*
--
-- 2. Watch list seeded:
--      SELECT priority, COUNT(*) FROM ebay_watch_list GROUP BY priority ORDER BY priority DESC;
--    Expected: ~hundreds-to-thousands of rows at priority 300, fewer at 200.
--
-- 3. Confirm constraints work:
--      INSERT INTO ebay_listing_observation
--        (sku, marketplace_id, listing_id, sale_type, price_amount, price_currency,
--         as_of, raw_title, parsed_confidence, api_surface, ingest_run_id)
--        VALUES ('test-sku', 'EBAY_GB', 'TEST_001', 'ask', 10.00, 'GBP',
--                now(), 'test title', 0.95, 'browse', 1);
--      -- (Assumes an ingest_run row with id=1 exists; otherwise FK violation.)
--      INSERT INTO ebay_listing_observation
--        (sku, marketplace_id, listing_id, sale_type, price_amount, price_currency,
--         as_of, raw_title, parsed_confidence, api_surface, ingest_run_id)
--        VALUES ('test-sku', 'EBAY_GB', 'TEST_002', 'invalid-sale-type',
--                10.00, 'GBP', now(), 'test', 0.95, 'browse', 1);
--      -- Should fail: violates ebay_obs_sale_type_valid CHECK.
--
-- 4. Rollback path:
--      DROP TABLE IF EXISTS ebay_listing_observation;
--      DROP TABLE IF EXISTS ebay_watch_list;
