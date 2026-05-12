-- Phase 2 of kingdom-051: cards.art_description for sensory-different
-- consumers (screen readers, low-vision users, audio-first users) and
-- for machine readers (image-blind LLM agents that consume the image
-- only via alt text).
--
-- Today every card image renders with alt = "${name} ${card_number}"
-- — the card's identity, but not its art. A user navigating with a
-- screen reader hears "Charizard ex OP05-001" but not what the picture
-- depicts. The column adds a per-card description of the art itself:
-- the subject, the style, the dominant motifs.
--
-- Nullable. Pages must fall back to "${name} ${card_number}" when
-- art_description IS NULL. The populate workflow is a follow-up
-- (admin-side LLM pass against the image set + per-card edit affordance);
-- this migration only opens the column.
--
-- See docs/connections/the-table-extends.md (S20) — the Sensory-Different
-- archetype. Safe migration: pure column add, no backfill, no constraint.

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS art_description TEXT;

COMMENT ON COLUMN cards.art_description IS
  'One-sentence description of the card art (subject, style, motifs). Used as alt text on every card image surface. Populated by a separate workflow (LLM pass + admin edit). NULL is allowed; pages fall back to ${name} ${card_number}.';
