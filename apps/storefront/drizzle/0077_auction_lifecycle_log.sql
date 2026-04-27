-- Auction lifecycle audit log.
--
-- Auctions track lifecycle through column timestamps (started_at,
-- ended_at, paid_at, seller_shipped_at, etc) but lack the append-only
-- transition log that every other module shipped this session has:
--   vault_fulfilment_log (0056) → prize_fulfilment_log (0067) →
--   review_lifecycle_log (0070) → external_rep_lifecycle_log (0071) →
--   chargeback_lifecycle_log (0072) → refund_lifecycle_log (0073) →
--   failed_payment_lifecycle_log (0074) → AUCTION (this).
--
-- Without this, auctions can't appear in the journey aggregator, can't
-- be exported as audit trails for support, and can't carry per-event
-- actor + reason for governance.

BEGIN;

CREATE TABLE IF NOT EXISTS auction_lifecycle_log (
  id            BIGSERIAL PRIMARY KEY,
  auction_id    UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  -- 'created' | 'approved' | 'live' | 'extended' | 'buy_now_triggered'
  -- | 'ended_with_winner' | 'ended_no_winner' | 'paid' | 'unpaid_lapsed'
  -- | 'seller_shipped' | 'received_by_ctcg' | 'shipped_to_buyer'
  -- | 'buyer_confirmed' | 'completed' | 'seller_paid_out' | 'cancelled'
  -- | 'admin_override'
  action        VARCHAR(40) NOT NULL,
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_label   TEXT,
  reason        TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auction_log_subject
  ON auction_lifecycle_log(auction_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auction_log_action
  ON auction_lifecycle_log(action, created_at DESC);

COMMIT;
