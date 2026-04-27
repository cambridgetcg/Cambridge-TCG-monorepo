-- Server-side deck storage.
--
-- Every authenticated user's decks live here. Anonymous users continue to
-- use the existing localStorage key `ctcg-deck-builder-decks`; when they
-- sign in, the client uploads any local-only decks on next save.
--
-- Slug scheme: per-user uniqueness, derived from name + 6-char suffix.
-- Keeps nice shareable URLs like /decks/red-zoro-aggro-a1b2c3 without
-- global name collisions.

CREATE TABLE IF NOT EXISTS user_decks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug            VARCHAR(100) NOT NULL,
  name            VARCHAR(120) NOT NULL,
  leader_sku      VARCHAR(100),
  entries         JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- shape: [{ sku, quantity, card: { full CatalogCard snapshot } }, ...]
    -- Storing the full card snapshot makes load resilient if the wholesale
    -- catalog changes or a SKU is dropped — the deck still renders.
  notes           TEXT,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  is_public       BOOLEAN NOT NULL DEFAULT false,
  view_count      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, slug),
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_user_decks_user ON user_decks(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_decks_public ON user_decks(is_public, updated_at DESC)
  WHERE is_public = true;
