-- 0122_card_texts_attributes.sql — structured official game attributes.
--
-- The Bandai EN parser already captures every gameplay stat (cost, power,
-- colour, counter, attribute, category, type/feature); card_texts only had
-- effect_text + card_type, so the stats were parsed and discarded. This adds a
-- JSONB home so the ingest (scripts/ingest-bandai-en.mjs, run per set release)
-- can persist them, and the API can serve them.
--
-- Rights: the structured stats are FACTS (cost 5, power 6000, colour Red) —
-- facts are not copyrightable; served with source citation. effect_text is
-- verbatim publisher rules text, served WITH the copyright line (card_texts.
-- attribution, NOT NULL), same basis as the official images.

ALTER TABLE card_texts ADD COLUMN IF NOT EXISTS attributes JSONB;

COMMENT ON COLUMN card_texts.attributes IS
  'Official structured game facts from the publisher card database (bandai-en): keys category, cost, cost_kind, power, counter, color, attribute, type_feature, block_icon, has_trigger. Factual stats, served with source citation.';
