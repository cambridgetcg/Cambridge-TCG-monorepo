-- Card-set master + per-set card list — so collectors can see set
-- completion progress.
--
-- Today the codebase tracks what cards a user OWNS (portfolio_cards)
-- and what they WANT (wishlist), but nothing tracks the TARGET — the
-- master list of cards in each set. Without it the canonical
-- collector workflow ("I'm 87/120 on OP01, I need #003, #044, …")
-- isn't expressible.
--
-- The wholesale API knows every card in every set, but it's
-- network-dependent and 401s in dev. Mirroring the master locally:
--   1. Lets us compute completion server-side without hitting the
--      external API per request.
--   2. Survives wholesale outages.
--   3. Lets us decorate cards with our own metadata (notes,
--      flavour tags) over time.
--
-- Population is lazy-on-first-view (the lib triggers an import the
-- first time a user opens a set page) + admin-driven for cold
-- start. Re-imports are idempotent via the (set_code, card_number)
-- PK on the join table.

CREATE TABLE IF NOT EXISTS card_sets (
  set_code        VARCHAR(20) PRIMARY KEY,
  game            VARCHAR(40) NOT NULL,
  set_name        VARCHAR(120) NOT NULL,
  -- Cached count of cards in the set. Maintained by the lib's
  -- importSetMaster + verified by COUNT(*) on card_set_cards. Used
  -- for the overview list so we don't aggregate per-set on every
  -- render.
  total_cards     INT NOT NULL DEFAULT 0,
  -- Optional release date — drives the "new sets" surface.
  released_at     DATE,
  -- Cover art for the overview grid.
  cover_image_url TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_sets_game
  ON card_sets (game, released_at DESC NULLS LAST);

-- Per-card master. PK on (set_code, card_number) so import is
-- naturally idempotent — re-importing the same wholesale dump is
-- a no-op.
CREATE TABLE IF NOT EXISTS card_set_cards (
  set_code     VARCHAR(20) NOT NULL REFERENCES card_sets(set_code) ON DELETE CASCADE,
  card_number  VARCHAR(30) NOT NULL,
  -- sku is the wholesale catalogue's canonical identifier, also
  -- what portfolio_cards / market_orders use for join. Often
  -- equals "<set_code>-<card_number>" but not guaranteed (foil
  -- variants, alt arts, etc carry suffix codes).
  sku          VARCHAR(60) NOT NULL,
  card_name    VARCHAR(200) NOT NULL,
  rarity       VARCHAR(20),
  image_url    TEXT,
  -- Variant metadata so an alt-art "OP01-001-AA" is distinguished
  -- from the base "OP01-001". UI groups base + variants under the
  -- same number. Defaulted to '' so the PK can include it directly
  -- (Postgres doesn't allow expressions like COALESCE in a PK).
  variant      VARCHAR(40) NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (set_code, card_number, variant)
);

-- Lookup-by-sku for the join against portfolio_cards. UNIQUE so
-- importSetMaster can't seed two rows with the same sku.
CREATE UNIQUE INDEX IF NOT EXISTS idx_card_set_cards_sku
  ON card_set_cards (sku);

-- Per-set fast iteration for the checklist + completion math.
CREATE INDEX IF NOT EXISTS idx_card_set_cards_set
  ON card_set_cards (set_code, card_number);
