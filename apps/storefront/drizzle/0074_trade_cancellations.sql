-- Pre-payment mutual trade cancellation handshake.
--
-- Once placeOrder/acceptOffer creates a market_trades row, the
-- escrow_status is 'awaiting_payment' for 24h. Today, neither party
-- can pull the trade — the only way out is to let the buyer's
-- payment window expire (sweepExpired). That's bad UX in two real
-- cases:
--   1. Buyer realises they can't pay (lost wallet, family emergency,
--      mistyped quantity) — currently they ghost; seller waits 24h.
--   2. Seller listed at the wrong price (typo, stale data, condition
--      regrade) — currently they have no clean exit.
--
-- This migration adds a request/approve handshake. The state machine:
--   requested → approved   (other party agreed → trade cancelled,
--                           order qty restored)
--   requested → declined   (other party refused → trade continues)
--   requested → withdrawn  (initiator rescinded → trade continues)
--   requested → expired    (sweep — 12h no response → trade continues)
--
-- Approval restores filled_quantity on both the bid and ask order
-- atomically with the trade transition (lib transaction). Same
-- restoration logic as sweepExpired's payment-timeout path.

CREATE TABLE IF NOT EXISTS market_trade_cancellations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id        UUID NOT NULL REFERENCES market_trades(id),

  -- Who initiated. requester_role lets the lib enforce the OTHER
  -- side as approver without an extra join.
  requester_id    UUID NOT NULL REFERENCES users(id),
  requester_role  VARCHAR(10) NOT NULL CHECK (requester_role IN ('buyer','seller')),

  -- Why. Loose-typed taxonomy (UI offers chips):
  --   wrong_price, wrong_card, wrong_qty, listing_error, can_not_pay,
  --   no_longer_needed, other (requires message)
  reason          VARCHAR(50) NOT NULL,
  message         TEXT,
  decline_reason  TEXT,

  status          VARCHAR(20) NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','approved','declined','expired','withdrawn')),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  -- 12h response window. Shorter than the 24h payment window so the
  -- handshake either resolves OR times out before the trade does.
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '12 hours'),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- "Pending request on this trade" — drives the inline action
-- surface on /account/trades. Partial since the only state needing
-- a fast scan is the in-flight one.
CREATE INDEX IF NOT EXISTS idx_trade_cancellations_pending
  ON market_trade_cancellations (trade_id)
  WHERE status = 'requested';

-- Sweep predicate: stale 'requested' rows past their 12h TTL.
CREATE INDEX IF NOT EXISTS idx_trade_cancellations_expiring
  ON market_trade_cancellations (expires_at)
  WHERE status = 'requested';

-- Per-user lookups: "my outgoing requests" and "incoming requests
-- I have to act on." The (requester_id, status) pair covers both
-- when the lib filters appropriately.
CREATE INDEX IF NOT EXISTS idx_trade_cancellations_requester
  ON market_trade_cancellations (requester_id, created_at DESC);

-- One-active-request-per-trade: enforced at the unique-partial-index
-- level so concurrent double-clicks can't create two pending rows
-- and race the lib's check.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_trade_cancellations_one_pending
  ON market_trade_cancellations (trade_id)
  WHERE status = 'requested';
