-- Auction post-win fulfilment lifecycle.
--
-- Migration 0013 already added tracking_to_ctcg + tracking_to_buyer +
-- escrow_status on auctions, but nothing writes to them — the columns
-- are dead. This migration adds the per-step timestamps the UI needs to
-- render a customer-visible timeline, mirroring the trade-in / quote /
-- customer-order pattern.
--
-- Lifecycle (auction.status stays the high-level badge; escrow_status
-- now carries the sub-state during the physical handoff):
--
--   status=ended, escrow_status=awaiting_payment  → winner owes money
--   status=paid,  escrow_status=awaiting_shipment → seller ships
--     (consigned: seller_shipped_to_ctcg_at stamps, tracking_to_ctcg)
--     (direct:    seller_shipped_at stamps, tracking_to_buyer)
--   status=paid,  escrow_status=received_by_ctcg  → CTCG inspects
--   status=paid,  escrow_status=shipped_to_buyer  → tracking_to_buyer
--   status=paid,  escrow_status=completed         → buyer confirmed or
--                                                   auto-confirm window passed
--
-- Seller payout (seller_paid_at) fires off status=paid + completed; that
-- part was already working, just disconnected from any user-visible chain.

BEGIN;

ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS seller_shipped_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_by_ctcg_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shipped_to_buyer_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS buyer_received_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS carrier_to_ctcg            VARCHAR(50),
  ADD COLUMN IF NOT EXISTS carrier_to_buyer           VARCHAR(50);

-- Backfill: where seller_paid_at is set, the buyer must have received
-- the card already — use seller_paid_at as a safe floor for
-- buyer_received_at so the timeline isn't blank for legacy paid rows.
UPDATE auctions
   SET buyer_received_at = seller_paid_at
 WHERE buyer_received_at IS NULL AND seller_paid_at IS NOT NULL;

-- Set escrow_status for existing paid auctions that have no value — the
-- historical assumption was "paid means we're done", which matches the
-- 'completed' terminal state.
UPDATE auctions SET escrow_status = 'completed'
 WHERE status = 'paid' AND escrow_status IS NULL AND seller_paid_at IS NOT NULL;

UPDATE auctions SET escrow_status = 'awaiting_shipment'
 WHERE status = 'paid' AND escrow_status IS NULL AND seller_paid_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_auctions_winner_unshipped
  ON auctions(winner_user_id, status, escrow_status)
  WHERE winner_user_id IS NOT NULL AND status = 'paid';

COMMIT;
