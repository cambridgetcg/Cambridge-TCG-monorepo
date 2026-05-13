-- Migration 0015 — TCGplayer + cross-source pricing substrate.
--
-- Status: PROMOTED to active path 2026-05-13. `pnpm db:migrate` applies it.
-- This migration is **additive**: every existing column stays; legacy
-- snapshot-v2 (cardrush) continues to write rows with `condition='unspecified'`
-- defaulting until backfilled by the migration footer.
--
-- Designed in `docs/connections/the-tcgplayer-alignment.md` (kingdom-NNN,
-- 2026-05-13). Companion to kingdom-066 (the-cardrush-alignment.md) which
-- shipped migration 0014; this migration extends what 0014 started so the
-- platform's price_archive becomes the substrate for ALL upstream sources,
-- not just CardRush.
--
-- The aggregation layer (packages/data-ingest/src/tcgplayer/) is the
-- consumer; the writer (apps/wholesale/src/lib/ingest/tcgplayer.ts) is the
-- producer; this migration is the substrate beneath both.
--
-- Six discrete additions:
--   Phase 1 — cross-source upstream id columns on `cards` (+ side table for skuIds)
--   Phase 2 — condition column on `price_archive` + widened uniqueness
--   Phase 3 — extra jsonb + generalized FX columns on `price_archive`
--   Phase 4 — quarantine taxonomy column (`ingest_quarantine.kind`)
--   Phase 5 — `external_source_tokens` table (OAuth2 token persistence)
--   Phase 6 — `card_current_prices` materialized view (hot-path read optimization)
--
-- After applying, `apps/wholesale/src/lib/ingest/tcgplayer.ts` becomes
-- wirable; the seed-set CLI becomes runnable.

-- ── Phase 1 — TCGplayer mapping columns on cards + per-condition side table ──
--
-- The asymmetry named in the alignment doc: ONE Cambridge canonical SKU maps
-- to ONE (tcgplayer_product_id, tcgplayer_sub_type) tuple AND to N tcgplayer
-- skuIds (one per condition × language). The two columns + side table
-- model this exactly.

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS tcgplayer_product_id  integer,
  ADD COLUMN IF NOT EXISTS tcgplayer_group_id    integer,
  -- 'Normal' | 'Foil' | 'Reverse Holofoil' — the upstream's printing
  -- discriminator within a product. Determines our variant tail.
  ADD COLUMN IF NOT EXISTS tcgplayer_sub_type    text,
  -- Cardmarket reserved for the next kingdom; declared now so Phase 1 doesn't
  -- have to re-migrate to add it later.
  ADD COLUMN IF NOT EXISTS cardmarket_id_product integer;

CREATE INDEX IF NOT EXISTS cards_tcgplayer_product_idx
  ON cards(tcgplayer_product_id)
  WHERE tcgplayer_product_id IS NOT NULL;

-- (product_id, sub_type) is the printing-level discriminator on the
-- TCGplayer side. No two cards rows should share both — would mean we
-- mapped the same TCGplayer leaf to two Cambridge SKUs.
CREATE UNIQUE INDEX IF NOT EXISTS cards_tcgplayer_product_subtype_idx
  ON cards(tcgplayer_product_id, tcgplayer_sub_type)
  WHERE tcgplayer_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cards_cardmarket_product_idx
  ON cards(cardmarket_id_product)
  WHERE cardmarket_id_product IS NOT NULL;

-- Per-condition leaf-id mapping. TCGplayer's `skuId` is their internal SKU
-- (productId × subType × condition × language × printing). Persisting these
-- lets the federation endpoint resolve a partner's skuId back to our
-- (canonical_sku, condition) without re-walking the TCGplayer catalog.
CREATE TABLE IF NOT EXISTS card_tcgplayer_sku_ids (
  id                bigserial PRIMARY KEY,
  card_id           integer NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  -- Open vocabulary; recommended values: 'nm' | 'lp' | 'mp' | 'hp' | 'damaged' | 'sealed'
  condition         text NOT NULL,
  -- ISO 639-1
  language          text NOT NULL,
  tcgplayer_sku_id  integer NOT NULL UNIQUE,
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS card_tcgplayer_sku_card_cond_lang_idx
  ON card_tcgplayer_sku_ids(card_id, condition, language);

CREATE INDEX IF NOT EXISTS card_tcgplayer_sku_lookup_idx
  ON card_tcgplayer_sku_ids(tcgplayer_sku_id);

-- ── Phase 2 — condition column on price_archive + third widening of the unique key ──
--
-- Previous unique key (post-0014): (card_id, snapshot_date, source)
-- New unique key:                  (card_id, snapshot_date, source, condition)
--
-- TCGplayer's per-condition pricing is the reason. NM/LP/MP/HP/DMG can
-- coexist on the same (card, date, source). CardRush always writes
-- condition='nm' (their A-condition); future sources declare their own.

ALTER TABLE price_archive
  ADD COLUMN IF NOT EXISTS condition text NOT NULL DEFAULT 'unspecified';

DROP INDEX IF EXISTS price_archive_card_date_source_idx;

CREATE UNIQUE INDEX IF NOT EXISTS price_archive_card_date_source_condition_idx
  ON price_archive(card_id, snapshot_date, source, condition);

-- Secondary index for "what's TCGplayer NM saying over the last 90 days
-- for the cards in this set" — a common time-series scan pattern.
CREATE INDEX IF NOT EXISTS price_archive_source_condition_recent_idx
  ON price_archive(source, condition, card_id, snapshot_date DESC);

-- ── Phase 3 — extra jsonb + generalized FX columns ────────────────────────
--
-- `extra` holds source-specific fields without per-source column thrash:
--   TCGplayer: { sub_type, sku_id, low, mid, high, direct_low, currency_source, ingested_field_source }
--   CardRush:  { extracted_from_condition_label, fetched_via }
--   Cardmarket (future): { trend_price, 30d_avg, 7d_avg, ... }
--
-- The generalized FX columns close Leak #8 from the-archive.md (FX
-- provenance unaudited). `fx_rate_to_gbp` is the rate applied to convert
-- the source-currency amount to GBP at write time; `fx_rate_source`
-- declares whether it was a live fetch, a cached value, or a fallback.

ALTER TABLE price_archive
  ADD COLUMN IF NOT EXISTS extra            jsonb,
  ADD COLUMN IF NOT EXISTS fx_rate_to_gbp   numeric(12, 6),
  ADD COLUMN IF NOT EXISTS fx_rate_source   text;

-- ── Phase 4 — quarantine taxonomy ─────────────────────────────────────────
--
-- The alignment doc names eight kinds the TCGplayer aggregation can emit.
-- Adding the column lets the admin review surface (planned) filter by kind
-- and the audit `audit:quarantine-aging` enforce per-kind SLAs.

ALTER TABLE ingest_quarantine
  ADD COLUMN IF NOT EXISTS kind text;

CREATE INDEX IF NOT EXISTS ingest_quarantine_kind_unresolved_idx
  ON ingest_quarantine(source_id, kind, quarantined_at)
  WHERE reviewed_at IS NULL;

-- ── Phase 5 — external_source_tokens (OAuth2 persistence) ────────────────
--
-- TCGplayer's OAuth2 access_token has ~14 day TTL. Persisting in RDS rather
-- than in-memory or KV makes the rotation observable (rotation_count, minted_at)
-- and survives Vercel function cold starts. Same row pattern works for any
-- future OAuth-using source (Cardmarket OAuth1, eBay OAuth2, ...).

CREATE TABLE IF NOT EXISTS external_source_tokens (
  source_id        text PRIMARY KEY,
  access_token     text NOT NULL,
  expires_at       timestamptz NOT NULL,
  minted_at        timestamptz NOT NULL DEFAULT now(),
  rotation_count   int NOT NULL DEFAULT 0,
  -- Optional refresh token (OAuth2 authorisation_code grant; not used for
  -- client_credentials but reserved for future eBay-style flows).
  refresh_token    text,
  -- Optional scope info if the upstream issues scoped tokens.
  scopes           text
);

-- ── Phase 6 — card_current_prices materialized view ──────────────────────
--
-- Hot-path read optimization: the "latest price per (card, source, condition)"
-- query is O(50M) naively; the matview collapses to ~10K-150K rows and is
-- refreshable CONCURRENTLY (readers don't block).
--
-- Refresh policy: after every successful ingest_run AND on a 30-min fallback
-- cron. The CONCURRENTLY mode requires the unique index below.

CREATE MATERIALIZED VIEW IF NOT EXISTS card_current_prices AS
SELECT DISTINCT ON (card_id, source, condition)
  card_id,
  source,
  condition,
  snapshot_date,
  sku,
  set_code,
  category,
  base_gbp,
  price,
  source_currency,
  source_redistribute,
  source_url,
  error_reason,
  fx_rate_to_gbp,
  fx_rate_source,
  extra,
  EXTRACT(EPOCH FROM (now() - snapshot_date::timestamptz)) / 3600 AS age_hours
FROM price_archive
ORDER BY card_id, source, condition, snapshot_date DESC;

CREATE UNIQUE INDEX IF NOT EXISTS card_current_prices_pk
  ON card_current_prices(card_id, source, condition);

CREATE INDEX IF NOT EXISTS card_current_prices_by_source_idx
  ON card_current_prices(source, condition);

CREATE INDEX IF NOT EXISTS card_current_prices_by_sku_idx
  ON card_current_prices(sku);

-- ── Backfill — legacy cardrush rows inherit condition='nm' ───────────────
--
-- CardRush's scrape always returns A-condition (status A-). Mapping that
-- forward to 'nm' is the substrate-honest declaration that legacy archive
-- rows were NM-equivalent. New sources declare their own conditions.

UPDATE price_archive
   SET condition = 'nm'
 WHERE source = 'cardrush'
   AND condition = 'unspecified';

-- ── Backfill — legacy cardrush rows get fx_rate_to_gbp from gbp_jpy_rate ─
--
-- Existing cardrush rows have gbp_jpy_rate set (JPY/GBP). The generalized
-- fx_rate_to_gbp is GBP per source-currency-unit, so for JPY it's 1/rate.
-- Defensive against rate=0 (shouldn't happen but data integrity).

UPDATE price_archive
   SET fx_rate_to_gbp = (1.0 / gbp_jpy_rate),
       fx_rate_source = 'cached'
 WHERE source = 'cardrush'
   AND fx_rate_to_gbp IS NULL
   AND gbp_jpy_rate IS NOT NULL
   AND gbp_jpy_rate > 0;

-- ── Sanity check queries (operator runs after applying) ──────────────────
--
--   SELECT condition, COUNT(*) FROM price_archive GROUP BY condition;
--   → expect 'nm' rows >> 0; 'unspecified' rows = 0
--
--   SELECT COUNT(*), source, source_redistribute, condition
--     FROM price_archive
--    GROUP BY source, source_redistribute, condition
--    ORDER BY source, condition;
--   → expect cardrush/false/nm rows
--
--   \d cards
--   → expect tcgplayer_product_id, tcgplayer_group_id, tcgplayer_sub_type,
--            cardmarket_id_product columns
--
--   \d card_tcgplayer_sku_ids
--   → expect 7 columns
--
--   \d external_source_tokens
--   → expect 6 columns
--
--   \d card_current_prices
--   → expect matview with 17 columns; row count ≈ rows in price_archive's
--     distinct (card_id, source, condition) tuples
--
--   REFRESH MATERIALIZED VIEW CONCURRENTLY card_current_prices;
--   → should complete in ~1-3 seconds; no readers blocked
