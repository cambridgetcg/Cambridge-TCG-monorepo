-- No-fault returns / buyer protection.
--
-- Disputes (migration 0019, 0057) handle fault-based mediation: the
-- card was misrepresented, didn't arrive, was damaged, etc. Returns
-- are different — the buyer simply changed their mind, and wants to
-- send the card back for a refund. Sellers opt in per listing; the
-- platform mediates the refund step so a seller can't accept the
-- return and then disappear with the card.
--
-- Lifecycle:
--   requested → accepted   (seller agreed, awaits buyer to ship)
--   requested → declined   (terminal — seller refused)
--   accepted  → shipping   (buyer dispatched with carrier+tracking)
--   shipping  → received   (seller confirms receipt — admin-watched)
--   received  → refunded   (admin issues refund — terminal)
--   any pre-refunded state → cancelled (buyer rescinds)
--   requested → expired    (sweep — seller didn't respond in 7d)

CREATE TABLE IF NOT EXISTS market_returns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id        UUID NOT NULL REFERENCES market_trades(id),
  buyer_id        UUID NOT NULL REFERENCES users(id),
  -- Denormalised so seller's "incoming returns" query stays index-only.
  seller_id       UUID NOT NULL REFERENCES users(id),

  -- Free-text reason chosen by the buyer. Kept loosely typed because
  -- "no-fault" returns aren't categorised the way disputes are. UI
  -- offers a few common chips ("Not as described, but minor",
  -- "Changed my mind", "Wrong card received but happy to return").
  reason          VARCHAR(50) NOT NULL,
  message         TEXT,
  decline_reason  TEXT,

  status          VARCHAR(20) NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','accepted','declined','shipping','received','refunded','cancelled','expired')),

  -- Refund amount. Defaults to full trade price on accept; admin can
  -- adjust at refund-time (e.g., minor restocking fee deduction).
  -- NULL until accepted so we don't lock in a number prematurely.
  refund_amount   NUMERIC(10, 2),

  -- Buyer's outbound shipment back to the seller. tracking_carrier
  -- mirrors the existing customer_orders.carrier shape so the shared
  -- @/lib/shipping/carriers helper can build a tracking URL.
  return_tracking_carrier VARCHAR(40),
  return_tracking_number  VARCHAR(60),

  -- Lifecycle timestamps. Each terminal state stamps resolved_at.
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at    TIMESTAMPTZ,
  shipped_at      TIMESTAMPTZ,
  received_at     TIMESTAMPTZ,
  refunded_at     TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  -- 7-day default for the seller to respond. After this the sweep
  -- expires the request and the buyer gets a notification.
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Admin who issued the final refund (by way of governance log entry
  -- on the action). NULL until refunded. Mirrors the dispute
  -- resolved_by_admin pattern.
  refunded_by_admin VARCHAR(100),

  -- Self-returns make no sense; guard at row level.
  CHECK (buyer_id <> seller_id)
);

-- "My outgoing returns" — buyer tab.
CREATE INDEX IF NOT EXISTS idx_market_returns_buyer
  ON market_returns (buyer_id, created_at DESC);

-- "Open returns I have to act on" — seller tab. Partial because the
-- only states needing a fast scan are pre-resolution.
CREATE INDEX IF NOT EXISTS idx_market_returns_seller_open
  ON market_returns (seller_id, created_at DESC)
  WHERE status IN ('requested', 'accepted', 'shipping', 'received');

-- Per-trade lookup: enforce one-active-return-per-trade in the lib,
-- and surface "is this trade returnable" on /account/trades.
CREATE INDEX IF NOT EXISTS idx_market_returns_trade
  ON market_returns (trade_id, status);

-- Sweep predicate: stale 'requested' rows past their TTL.
CREATE INDEX IF NOT EXISTS idx_market_returns_expiring
  ON market_returns (expires_at)
  WHERE status = 'requested';

-- Per-listing opt-in. Defaults to false — sellers must explicitly
-- accept-returns on their listing form, otherwise existing listings
-- silently start accepting returns the day this migration ships.
ALTER TABLE market_orders
  ADD COLUMN IF NOT EXISTS accepts_returns BOOLEAN NOT NULL DEFAULT false;

-- Trade-level snapshot. When a trade is created we copy the ask's
-- accepts_returns into the trade row so subsequent listing edits
-- can't retroactively change a trade's return eligibility.
ALTER TABLE market_trades
  ADD COLUMN IF NOT EXISTS accepts_returns BOOLEAN NOT NULL DEFAULT false;

-- Default 14-day return window from the trade's completed_at. Not
-- per-row enforced (the lib reads completed_at + INTERVAL); stored
-- here so future per-listing or per-tier overrides have a home.
ALTER TABLE market_trades
  ADD COLUMN IF NOT EXISTS return_window_days INT NOT NULL DEFAULT 14;
