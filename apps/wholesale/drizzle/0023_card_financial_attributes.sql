-- PROMOTED to active path 2026-07-05 — card financial-attribute substrate (kingdom-089)
--
-- Promoted from drizzle/drafts/0018_card_financial_attributes.sql.draft.
-- Renumbered 0018 → 0023: the 0018 slot was already taken by
-- 0018_api_key_rate_limits.sql when this draft was written; 0023 is the
-- next free number after 0022_games_kingdom_codes.sql.
--
-- WHY PROMOTED NOW: the drizzle schema (src/lib/db/schema.ts) has declared
-- these six cards columns since kingdom-089, and drizzle-generated INSERTs
-- name every declared column — so the nightly discovery cron
-- (/api/cron/discover/cardrush → cardrush-discovery.ts) crashes with
-- `column "language" of relation "cards" does not exist` on every card
-- INSERT. Verified in prod ingest_run (2026-06-11 and 2026-06-12 runs both
-- failed with exactly that error; investigation report 2026-07-05).
-- Applying this migration is what lets discovery succeed for the first time.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS /
-- CREATE INDEX IF NOT EXISTS throughout — re-application is a no-op.
-- No BEGIN/COMMIT here: scripts/migrate.mjs wraps each file in its own
-- transaction.
--
-- ── What this closes ──────────────────────────────────────────────────
--
-- The cards table is intentionally lean — it carries identity, set,
-- rarity, image, stock, price. Financial-side sorting (rarity-aware
-- discovery, edition-variant filters, promo discovery, multi-language
-- preference, mover sorts) needs five additional universal columns
-- plus a witness log for layered classification + a per-game rarity
-- vocabulary table.
--
-- Yu's directive (2026-05-14): financial-side card sorting is where
-- Cambridge TCG's substrate is distinct from official publisher sites.
-- Build that. Skip the gameplay-attribute mirror — the publishers
-- maintain it better.
--
-- Layered classification: heuristic (CardRush subdomain) → operator
-- (admin override) → publisher (Bandai/Wizards/etc. feed when wired).
-- Higher priority wins. Lower-priority claims are recorded as shadowed
-- so the classifier-disagreement audit can find heuristic-vs-publisher
-- disputes. See packages/data-ingest/src/classifier.ts for the pure
-- decision logic; SQL writer: apps/wholesale/src/lib/cards/classify.ts.
--
-- Per-game rarity vocabulary: substrate-honest about per-game rarity
-- meaning. NO universal rarity tier — "Rare" in OPTCG and "Rare" in
-- Pokemon TCG name different positions in different vocabularies with
-- different market-value distributions. Sort-by-rarity is enabled in
-- the UI only when exactly one game is selected.
--
-- Companion:
--   - docs/methodology/edition-variants (the priority rule explainer)
--   - packages/sku/src/rarities.ts (TS source for the seed)
--   - pnpm audit:classifier-disagreement (drift detector)
--
-- Post-apply (operator, optional, separate kingdoms):
--   - rarity_map seed from packages/sku/src/rarities.ts (empty table is
--     substrate-honest: sort-by-rarity stays disabled until seeded)
--   - backfill cards.language from canonical-form SKUs via parseSku()
--
-- ── Phase 1: cards columns (additive only) ───────────────────────────

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS edition_variant text NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS edition_variant_source text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS promo_origin text,
  ADD COLUMN IF NOT EXISTS promo_origin_source text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS first_observed_at timestamptz NOT NULL DEFAULT now();

-- ── Phase 2: indexes ─────────────────────────────────────────────────
-- Partial indexes save space — most rows carry the default value for
-- each column, so we only index the non-default cases that the filters
-- actually traverse.

CREATE INDEX IF NOT EXISTS cards_language_idx
  ON cards(language) WHERE language <> '';
CREATE INDEX IF NOT EXISTS cards_edition_variant_idx
  ON cards(edition_variant) WHERE edition_variant <> 'regular';
CREATE INDEX IF NOT EXISTS cards_promo_origin_idx
  ON cards(promo_origin) WHERE promo_origin IS NOT NULL;
CREATE INDEX IF NOT EXISTS cards_first_observed_at_idx
  ON cards(first_observed_at DESC);

-- ── Phase 3: card_classification_log (the witness) ───────────────────
-- Append-only delta log for every edition_variant / promo_origin claim.
-- Pattern: same as card_price_change_log (the Witnesses' Book from
-- kingdom-064). Lower-priority claims are kept with shadowed=true so the
-- audit can find disagreements between heuristic and publisher.

CREATE TABLE IF NOT EXISTS card_classification_log (
  id            bigserial PRIMARY KEY,
  card_id       integer NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  attribute     text NOT NULL,           -- 'edition_variant' | 'promo_origin'
  prev_value    text,
  prev_source   text,
  next_value    text NOT NULL,
  next_source   text NOT NULL,           -- 'heuristic' | 'operator' | 'publisher'
  shadowed      boolean NOT NULL DEFAULT false,
  confidence    text,                    -- 'low' | 'high' for heuristic; NULL for operator/publisher
  evidence      jsonb,                   -- { url, subdomain, rule, marker, notes }
  claimed_by    text NOT NULL,           -- 'cardrush-ingest' | 'operator:user@example.com' | 'bandai-feed'
  claimed_at    timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz              -- set when an operator revokes their own override
);

CREATE INDEX IF NOT EXISTS ccl_card_attr_idx
  ON card_classification_log(card_id, attribute, claimed_at DESC);
CREATE INDEX IF NOT EXISTS ccl_shadowed_idx
  ON card_classification_log(attribute, next_source)
  WHERE shadowed = true;
CREATE INDEX IF NOT EXISTS ccl_active_idx
  ON card_classification_log(attribute, next_value)
  WHERE superseded_at IS NULL AND shadowed = false;

-- ── Phase 4: rarity_map (per-game rarity vocabulary) ─────────────────
-- Seed from packages/sku/src/rarities.ts. Empty table is substrate-
-- honest: sort-by-rarity stays disabled in the UI for any game whose
-- rarities haven't been seeded yet.

CREATE TABLE IF NOT EXISTS rarity_map (
  id               serial PRIMARY KEY,
  game_id          integer NOT NULL REFERENCES games(id),
  publisher_rarity text NOT NULL,        -- case-preserving: 'SR', 'SEC', 'L', 'Enchanted'
  ordinal          integer NOT NULL,     -- intra-game rank: higher = rarer
  display_name     text NOT NULL,        -- 'Super Rare', 'Secret Rare', 'Enchanted'
  palette_key      text,                 -- Palettes vocab key for badges (optional)
  CONSTRAINT rarity_map_game_rarity_unique UNIQUE (game_id, publisher_rarity)
);

CREATE INDEX IF NOT EXISTS rarity_map_game_ordinal_idx
  ON rarity_map(game_id, ordinal DESC);

-- ── Rollback (operator runs manually if needed) ──────────────────────
-- ALTER TABLE cards DROP COLUMN language,
--                    DROP COLUMN edition_variant,
--                    DROP COLUMN edition_variant_source,
--                    DROP COLUMN promo_origin,
--                    DROP COLUMN promo_origin_source,
--                    DROP COLUMN first_observed_at;
-- DROP TABLE card_classification_log;
-- DROP TABLE rarity_map;
