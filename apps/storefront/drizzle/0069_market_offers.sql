-- Make-an-offer / counter-offer layer for market asks.
--
-- The order book is firm-price: a bid either matches an ask or it
-- doesn't. Auctions already support best-offers via migration 0010.
-- This migration adds the same negotiation primitive to market_orders
-- so a buyer can propose £18 against a £20 ask and let the seller
-- accept, decline, or counter.
--
-- Acceptance creates a market_trade at the agreed price (offer_price
-- if seller accepts the offer, counter_price if buyer accepts the
-- seller's counter). The existing trade lifecycle takes over from
-- there — payment window, escrow, payout. This module is purely the
-- pre-trade negotiation layer.

CREATE TABLE IF NOT EXISTS market_offers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ask_order_id    UUID NOT NULL REFERENCES market_orders(id),
  buyer_id        UUID NOT NULL REFERENCES users(id),
  -- Denormalised from the ask so the seller-incoming index stays
  -- index-only-scannable (avoids a join through market_orders for the
  -- common "my pending incoming offers" query).
  seller_id       UUID NOT NULL REFERENCES users(id),

  offer_price     NUMERIC(10, 2) NOT NULL CHECK (offer_price > 0),
  quantity        INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  message         TEXT,

  -- 'pending' → seller has not responded yet
  -- 'accepted' → seller said yes; trade_id is populated
  -- 'declined' → seller said no
  -- 'countered' → seller responded with counter_price; awaits buyer
  -- 'expired'  → TTL elapsed before any response (sweep-driven)
  -- 'withdrawn' → buyer rescinded before seller responded
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'countered', 'expired', 'withdrawn')),

  -- Counter-offer fields. Populated when seller transitions to
  -- 'countered'. The buyer can then accept the counter (creates trade
  -- at counter_price) or decline (closes offer).
  counter_price   NUMERIC(10, 2) CHECK (counter_price IS NULL OR counter_price > 0),
  counter_message TEXT,

  -- Lifecycle timestamps. responded_at fills on the first seller
  -- response (accept/decline/counter); resolved_at fills on the
  -- terminal transition (accepted, declined, expired, withdrawn).
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at    TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  -- 48h default TTL — long enough for a casual seller to see and
  -- respond, short enough that the buyer doesn't sit in limbo.
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),

  -- Resulting trade row when the offer is accepted (either side).
  trade_id        UUID REFERENCES market_trades(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Self-offers don't make sense — guard at the row level too.
  CHECK (buyer_id <> seller_id)
);

-- "My outgoing offers, newest first." Powers /account/offers buyer tab.
CREATE INDEX IF NOT EXISTS idx_market_offers_buyer
  ON market_offers (buyer_id, created_at DESC);

-- "Incoming offers I haven't responded to." Partial — the only state
-- that needs a fast scan is pending. Drives the seller's bell badge
-- and the inbox tab on /account/offers.
CREATE INDEX IF NOT EXISTS idx_market_offers_seller_pending
  ON market_offers (seller_id, created_at DESC)
  WHERE status IN ('pending', 'countered');

-- "All pending offers on this ask" — used to soft-cap how many
-- concurrent offers one ask can accumulate, and to clean up if the
-- seller cancels the underlying ask.
CREATE INDEX IF NOT EXISTS idx_market_offers_ask
  ON market_offers (ask_order_id) WHERE status = 'pending';

-- Sweep predicate index: rows past their TTL still in pending/countered.
CREATE INDEX IF NOT EXISTS idx_market_offers_expiring
  ON market_offers (expires_at)
  WHERE status IN ('pending', 'countered');

-- Per-listing opt-out. Defaults to true so existing rows accept offers
-- by default; sellers can disable via the listing form. Mirrors the
-- allow_best_offer field on auctions (migration 0010).
ALTER TABLE market_orders
  ADD COLUMN IF NOT EXISTS allow_offers BOOLEAN NOT NULL DEFAULT true;
