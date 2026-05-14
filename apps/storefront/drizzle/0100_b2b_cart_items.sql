-- Migration 0100 — B2B cart for the wholesale shell.
--
-- Phase 2.2a of the wholesale consolidation. DB-backed cart for B2B
-- buyers shopping inside /account/b2b/*. Deliberately separate from
-- the retail cart (today retail is localStorage-only; if it becomes
-- DB-backed it'll be a different table). Two reasons for the
-- separation:
--
--   1. Substrate honesty — retail and wholesale priced lines must
--      never mingle. A wholesale buyer logging out and shopping retail
--      should see a fresh empty retail cart, not a mixed-pricing pile.
--   2. Stripe metadata flow — when checkout fires, the route reads
--      the b2b cart specifically and tags the Stripe session as a
--      wholesale order. Tagging-by-table is structurally safer than
--      tagging-by-column-on-shared-table.
--
-- Schema design:
--   - One row per (user_id, sku). Adding the same SKU twice increments
--     quantity via UPSERT in @/lib/b2b/cart.ts.
--   - No snapshot price column. Prices recompute at display + checkout
--     time from the Falcon's wholesale channel — substrate-honest about
--     live pricing. If a price changes between add-to-cart and
--     checkout, the buyer sees the new price.
--   - user_id is UUID per the storefront's users schema.
--   - quantity > 0 CHECK; removing means DELETE not quantity=0.
--
-- Companion to:
--   - docs/connections/the-four-auth-realms.md (S30)
--   - apps/storefront/src/lib/b2b/cart.ts — the writer
--   - apps/storefront/src/app/account/b2b/cart/ — the reader + actions

CREATE TABLE IF NOT EXISTS b2b_cart_items (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sku         TEXT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The hot path: UPSERT keyed on (user_id, sku).
CREATE UNIQUE INDEX IF NOT EXISTS b2b_cart_items_user_sku_idx
  ON b2b_cart_items (user_id, sku);

-- Cart-page listing: WHERE user_id = $1 ORDER BY added_at.
CREATE INDEX IF NOT EXISTS b2b_cart_items_user_idx
  ON b2b_cart_items (user_id, added_at);
