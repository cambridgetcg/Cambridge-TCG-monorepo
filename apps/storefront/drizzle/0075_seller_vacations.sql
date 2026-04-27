-- Seller vacation mode.
--
-- The fabric has matured to the point where every commerce primitive
-- imposes a response-window contract on the seller:
--   - market_offers:  48h to accept/decline/counter
--   - market_returns: 7d to accept/decline a buyer's return request
--   - trade_cancels:  12h to approve a counterparty's cancel
--   - market_trades:  24h payment window the buyer relies on
--   - dm_messages:    expectation, not a hard deadline
--
-- A seller who steps away breaks all of these silently. Vacation
-- mode is the bulk-pause primitive: schedule a period; on starts_at
-- the cron flips all active asks to 'paused' (excluded from matching)
-- and stretches the response windows on every in-flight offer/
-- return/cancel by the vacation duration so they don't time out
-- against the absent seller.
--
-- On ends_at the cron restores everything in reverse: 'paused' →
-- 'open' (or 'partially_filled' for those that had filled qty).

-- Add 'paused' to the order_status enum. Postgres enum extension is
-- forward-only — this is a new value at the end of the type.
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'paused';

CREATE TABLE IF NOT EXISTS seller_vacations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  -- Optional public-facing message ("Back Mon Dec 18, expedited
  -- shipping after that"). Surfaced on the seller's profile and on
  -- their listing pages while the vacation is active.
  message         TEXT,

  -- Lifecycle:
  --   scheduled — created but starts_at hasn't arrived yet
  --   active    — sweep flipped status; orders paused, windows
  --               extending automatically
  --   ended     — sweep restored everything (reached ends_at OR user
  --               ended early)
  --   cancelled — user cancelled BEFORE starts_at (no side effects)
  status          VARCHAR(20) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'active', 'ended', 'cancelled')),

  -- Idempotency markers. Each is set exactly once when the
  -- corresponding sweep runs, so a re-run can't double-pause or
  -- double-restore. Without these the sweep would have to scan
  -- every order on every tick.
  applied_at      TIMESTAMPTZ,
  unapplied_at    TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (ends_at > starts_at)
);

-- "My vacations" — newest first.
CREATE INDEX IF NOT EXISTS idx_seller_vacations_user
  ON seller_vacations (user_id, created_at DESC);

-- Sweep predicate (start side): scheduled rows whose starts_at has
-- arrived. Partial idx so the cron's first query is index-only.
CREATE INDEX IF NOT EXISTS idx_seller_vacations_starting
  ON seller_vacations (starts_at)
  WHERE status = 'scheduled';

-- Sweep predicate (end side): active rows whose ends_at has arrived.
CREATE INDEX IF NOT EXISTS idx_seller_vacations_ending
  ON seller_vacations (ends_at)
  WHERE status = 'active';

-- "Is this user currently on vacation?" — drives the profile banner
-- + the listing-page chip. Partial on status='active' for fast
-- lookup. Used by /api/u/[username] commerce endpoint.
CREATE INDEX IF NOT EXISTS idx_seller_vacations_active
  ON seller_vacations (user_id, ends_at)
  WHERE status = 'active';
