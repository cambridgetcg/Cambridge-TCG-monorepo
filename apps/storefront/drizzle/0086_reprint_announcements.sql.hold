-- Reprint / rotation risk announcements.
--
-- Admin-curated for now (no scrape pipeline yet). Each row scopes its
-- impact in one of three ways — exactly one of (sku, set_code,
-- card_match_query) is non-null.
--
--   sku                — exact-match a single SKU (most precise)
--   set_code           — every card in the set (e.g. Pokémon set rotation)
--   card_match_query   — ILIKE pattern against portfolio_cards.card_name
--                        (catches reprint-of-foil-version, alt-art, etc)
--
-- severity drives how loudly we shout in the risk dashboard:
--   low      = informational reprint announcement, distant date
--   medium   = confirmed reprint within 90 days
--   high     = imminent reprint (≤30d) or a rotation that immediately
--              affects tournament eligibility (and therefore demand)
--
-- status:
--   active   = announcement is current; risk dashboard surfaces it
--   realized = the reprint actually shipped; we leave the row but
--              demote it from active warnings
--   cancelled = announcement was wrong / rescinded

CREATE TABLE IF NOT EXISTS reprint_announcements (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- exactly one of the three:
  sku                VARCHAR(60),
  set_code           VARCHAR(20),
  card_match_query   TEXT,

  title              TEXT NOT NULL,
  source_url         TEXT,
  admin_notes        TEXT,

  severity           VARCHAR(10) NOT NULL DEFAULT 'medium'
                       CHECK (severity IN ('low', 'medium', 'high')),
  status             VARCHAR(15) NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'realized', 'cancelled')),
  expected_release_date DATE,

  created_by_admin   TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (
    (CASE WHEN sku IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN set_code IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN card_match_query IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_reprint_active_sku
  ON reprint_announcements(sku) WHERE status = 'active' AND sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reprint_active_set
  ON reprint_announcements(set_code) WHERE status = 'active' AND set_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reprint_active_query
  ON reprint_announcements(status, expected_release_date)
  WHERE status = 'active' AND card_match_query IS NOT NULL;

-- Per-user dedupe so a user only gets ONE notification for a given
-- announcement, even if we re-run the notify fan-out (admin edits an
-- announcement, sweep retries, etc).
CREATE TABLE IF NOT EXISTS reprint_notifications_sent (
  announcement_id  UUID NOT NULL REFERENCES reprint_announcements(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (announcement_id, user_id)
);
