-- Saved searches / criteria-based stock alerts.
--
-- Watchlist (existing) is per-SKU: "tell me when SKU X drops below
-- £20." Wishlist is per-card, with a max-price + condition floor.
-- Saved searches are the query-based extension: "any Charizard in
-- NM/MT under £100 from any set, from any seller."
--
-- A cron sweep scans new asks since each search's last_scanned_at.
-- New matches insert rows into saved_search_matches and fire
-- search.match notifications. The matches table is also the dedup
-- guard — the (search_id, order_id) UNIQUE prevents the cron from
-- re-notifying when an order is still on the book on subsequent
-- scans.

CREATE TABLE IF NOT EXISTS saved_searches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- User-supplied label so the inbox / notification body can name it
  -- ("New match on 'Cheap Charizards'") instead of dumping the JSON.
  name          VARCHAR(80) NOT NULL,

  -- The query. JSONB so future criteria (foil, language, region)
  -- don't require a migration. Fields the lib understands today:
  --   text         — substring match on card_name OR sku
  --   set_codes    — array of codes (OR'd)
  --   conditions   — array of NM/M/LP/MP/HP/DMG (OR'd)
  --   max_price    — numeric upper bound
  --   min_price    — numeric lower bound (rare, but supports "premium" alerts)
  --   rarity       — array of rarity codes (OR'd)
  query         JSONB NOT NULL,

  -- 'active'   — scanning new asks
  -- 'paused'   — user temporarily disabled (still in list, no scans)
  -- 'expired'  — TTL elapsed (sweep-driven)
  -- 'archived' — user closed (terminal)
  status        VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'expired', 'archived')),

  -- Sweep state. last_scanned_at advances atomically with each
  -- scan so a crash mid-batch can't drop matches; the sweep is
  -- idempotent on re-run.
  last_scanned_at TIMESTAMPTZ,
  last_match_at   TIMESTAMPTZ,
  match_count     INT NOT NULL DEFAULT 0,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 90-day default. Searches that don't fire for 90 days expire so
  -- we don't run a stale corpus of dead queries forever. User can
  -- "extend" to bump expires_at by another 90.
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days')
);

-- "My searches" (page render): user-scoped, newest first.
CREATE INDEX IF NOT EXISTS idx_saved_searches_user
  ON saved_searches (user_id, created_at DESC);

-- Sweep predicate: only active searches inside their TTL get scanned.
-- Partial index keeps the cron's fan-in scan fast as the table grows.
CREATE INDEX IF NOT EXISTS idx_saved_searches_active
  ON saved_searches (last_scanned_at NULLS FIRST)
  WHERE status = 'active';

-- TTL expiry sweep predicate.
CREATE INDEX IF NOT EXISTS idx_saved_searches_expiring
  ON saved_searches (expires_at)
  WHERE status = 'active';

-- Audit / dedup table. UNIQUE(search_id, order_id) is the dedup
-- gate — when the cron runs again and the same ask is still on
-- the book, the INSERT … ON CONFLICT DO NOTHING is a no-op. The
-- table also powers the "recent matches" gallery on /account/searches.
CREATE TABLE IF NOT EXISTS saved_search_matches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id   UUID NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  order_id    UUID NOT NULL REFERENCES market_orders(id),
  matched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Snapshot the price at match time so the UI can show "was £45 at
  -- match" even if the seller has since edited.
  matched_price NUMERIC(10, 2) NOT NULL,
  UNIQUE (search_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_search_matches_search
  ON saved_search_matches (search_id, matched_at DESC);
