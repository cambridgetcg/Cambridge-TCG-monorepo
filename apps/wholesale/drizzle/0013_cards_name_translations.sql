-- Phase 6 of kingdom-051: cards.name_translations for culturally-different
-- consumers — non-English-or-Japanese readers who would prefer to see a
-- card name in their own script.
--
-- Today cards have `name` (Japanese, the original) and `name_en` (English
-- translation). A user reading Chinese, Korean, Spanish, or another
-- language sees English fallback. The column adds a sparse JSONB map
-- keyed by ISO 639-1 (or similar) language code:
--
--   { "zh": "魔人布欧", "ko": "마인 부우", "es": "Buu", "jp_romaji": "Mahjin Buu" }
--
-- Sparse — populated per-card as translators (human or machine) supply
-- entries. Resolver logic (Phase 6.5): user preference at
-- /account/preferences picks the display script; pages render
-- name_translations[lang] || name_en || name || card_number.
--
-- See docs/connections/the-table-extends.md (S20) — the Culturally
-- Different archetype. Safe migration: pure column add, no backfill.

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS name_translations JSONB;

COMMENT ON COLUMN cards.name_translations IS
  'Sparse JSONB map of language code (ISO 639-1 or similar) to translated card name. NULL when no translations are known. Populated per-card as translators supply entries; pages fall back to name_en, then name, then card_number.';

-- An index on jsonb is useful for "find me all cards translated to Korean" queries.
-- Skipping for now (no consumer yet); add when Phase 6.5 ships the resolver.
