-- 0116_en_card_data.sql — English card text + images, provenance-first
--
-- The catalogue speaks Japanese because the scans came from Japanese
-- shops. This migration gives every card room to speak English too —
-- and, more importantly, makes every image and every line of rules text
-- carry its receipts: where it came from, when, under what terms, and
-- what happens if the rightsholder objects.
--
-- Design decisions that ARE the policy (docs/EN-CARD-DATA.md has the
-- full legal briefing; /legal/card-images is the public promise):
--
--   * card_texts has NO flavor-text column. Effect/rules text is
--     functional and low-risk (merger doctrine, Feist facts); flavor
--     text is protectable prose that adds no marketplace value. We
--     don't store what we shouldn't ship.
--   * card_images is a PROVENANCE table, not a URL cache. kind says
--     what the image is (official publisher sample vs community API vs
--     shop scan vs seller photo); attribution is NOT NULL — an image
--     without a credit line cannot enter the catalogue, by schema.
--   * takedown_status makes rightsholder requests a first-class state,
--     not a deletion. 'removed' rows keep their provenance so the
--     takedown log stays auditable — fairness is remembering what was
--     asked and showing we did it.
--
-- Images land in s3://ctcg-card-images/{lang}/{game}/{set}/... — a NEW
-- bucket, never the jp-*-photos hires prefixes (HIRES IMAGE PROTECTION
-- rule in tools/lib/s3-images.ts stays untouched).

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
