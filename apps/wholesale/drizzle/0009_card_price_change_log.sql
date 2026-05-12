-- Append-only audit log for cards.price / cards.base_gbp mutations.
-- Mirrors the shape of apps/storefront/drizzle/0082_pricing_rule_lifecycle_log.sql.
--
-- Phase 2 of kingdom-049 (pricing-backend consolidation). See:
--   docs/pricing-current-state.md
--   docs/connections/the-pricing-arrow.md  (S17, Act 4 — the Archive's missing log)
--   docs/connections/the-scribe.md         (S8 — the bookshelf this joins)
--
-- The action vocabulary today:
--   'admin_edit'  — manual edit via /api/cards/[id] PATCH (admin only)
--   'snapshot'    — daily CardRush snapshot (cron) when price/base_gbp differs from previous
--
-- Reserved for future phases:
--   'synced_to_shopify' — Phase 2.5 (different concern: external system push)
--   'csv_upload'        — kingdom-030 closure (bulk CSV path port)
--
-- before_value / after_value carry compact JSON: { price, baseGbp, cardrushJpy?, gbpJpyRate? }
-- actor_label is free-form ("admin:contact@cambridgetcg.com", "cron:price-snapshot", etc).
-- source names the system that produced the mutation ("admin", "cardrush-cron", "shopify-sync").

CREATE TABLE IF NOT EXISTS card_price_change_log (
  id            BIGSERIAL PRIMARY KEY,
  card_id       INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  action        VARCHAR(40) NOT NULL,
  source        VARCHAR(40),
  actor_label   TEXT,
  before_value  JSONB,
  after_value   JSONB,
  reason        TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_price_log_subject
  ON card_price_change_log(card_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_card_price_log_action
  ON card_price_change_log(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_card_price_log_recent
  ON card_price_change_log(created_at DESC);
