-- 0116_en_card_data.sql — English card text + image provenance storage
--
-- This migration was applied before the source-rights review. It records
-- storage provenance and takedown state; it does not grant permission to
-- collect, display, hotlink, mirror, or redistribute any stored field.
--
-- Current runtime policy lives in docs/EN-CARD-DATA.md and
-- /legal/card-images. The Bandai ingest and public reader are paused.
--
--   * card_texts has no flavor-text column. That narrower schema is a
--     minimisation safeguard, not a publication-rights conclusion.
--   * card_images records source, kind, attribution, and removal state.
--     Attribution may be required by permission; it is not permission.
--   * 'removed' rows retain provenance so an applied restriction is not
--     forgotten by a later ingest.
--
-- The planned ctcg-card-images bucket does not exist. Production image rows
-- created through this schema currently contain publisher source URLs only;
-- public readers must never use those URLs as hotlink fallbacks.

CREATE TABLE IF NOT EXISTS card_texts (
  sku          TEXT NOT NULL,
  lang         TEXT NOT NULL DEFAULT 'en',
  effect_text  TEXT,
  card_type    TEXT,
  source       TEXT NOT NULL,
  source_url   TEXT,
  attribution  TEXT NOT NULL,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (sku, lang)
);

CREATE TABLE IF NOT EXISTS card_images (
  sku             TEXT NOT NULL,
  lang            TEXT NOT NULL DEFAULT 'en',
  kind            TEXT NOT NULL CHECK (kind IN ('official_sample', 'community_api', 'shop_scan', 'seller_photo')),
  source          TEXT NOT NULL,
  source_url      TEXT,
  s3_key          TEXT,
  width           INTEGER,
  height          INTEGER,
  sha256          TEXT,
  license_note    TEXT,
  attribution     TEXT NOT NULL,
  takedown_status TEXT NOT NULL DEFAULT 'clear' CHECK (takedown_status IN ('clear', 'disputed', 'removed')),
  retrieved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (sku, lang, kind, source)
);

CREATE INDEX IF NOT EXISTS card_images_sku_idx ON card_images (sku);
CREATE INDEX IF NOT EXISTS card_images_takedown_idx ON card_images (takedown_status) WHERE takedown_status <> 'clear';
