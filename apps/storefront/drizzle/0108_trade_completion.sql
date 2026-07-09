-- 0108_trade_completion.sql
--
-- Close the trade fulfilment loop. Until now the only writer of
-- escrow_status='completed' was an admin (the trades PATCH or dispute
-- resolution), so every healthy trade stranded at shipped_to_buyer and
-- the payout sweep (which requires completed + completed_at) never fired.
-- This migration adds the columns the two new completion paths need:
--
--   delivered_at  — when the buyer confirmed the card in hand. Stamped by
--                   the buyer confirm-receipt route only. NULL on
--                   auto-window completions: the platform sees
--                   confirmations, not deliveries (lib/shipping/carriers.ts
--                   preamble), so the sweep must not fabricate one.
--   completed_via — which of the three paths closed the trade:
--                   'buyer_confirm' (buyer pressed the button),
--                   'auto_window'  (dispute window lapsed, cron sweep),
--                   'admin'        (manual override, the pre-existing path).
--                   NULL = completed before this migration, or by the
--                   dispute-resolution path which stamps nothing here.
--   carrier       — the shipping carrier as its own column. The ship route
--                   previously concatenated the carrier into the tracking
--                   string ("Royal Mail AB123..."), which made tracking
--                   links underivable. Old rows keep the concatenated
--                   tracking text; new rows split cleanly.

BEGIN;

ALTER TABLE market_trades
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

ALTER TABLE market_trades
  ADD COLUMN IF NOT EXISTS completed_via TEXT
    CHECK (completed_via IN ('buyer_confirm', 'auto_window', 'admin'));

ALTER TABLE market_trades
  ADD COLUMN IF NOT EXISTS carrier TEXT;

COMMENT ON COLUMN market_trades.delivered_at IS
  'Buyer-confirmed receipt timestamp. Set only by the confirm-receipt route; NULL on auto-window completions (the platform records confirmations, not deliveries).';
COMMENT ON COLUMN market_trades.completed_via IS
  'Which path completed the trade: buyer_confirm | auto_window | admin. NULL = pre-0108 completion or dispute-resolution path.';
COMMENT ON COLUMN market_trades.carrier IS
  'Shipping carrier for the buyer-bound leg, split out from the tracking string. Rows shipped before 0108 carry "Carrier TRACKING" concatenated in tracking_to_buyer instead.';

-- The auto-complete sweep scans shipped trades whose dispute window has
-- elapsed. Partial index keeps that scan off the completed majority.
CREATE INDEX IF NOT EXISTS idx_market_trades_autocomplete
  ON market_trades (shipped_to_buyer_at)
  WHERE escrow_status IN ('shipped_to_buyer', 'verified');

COMMIT;
