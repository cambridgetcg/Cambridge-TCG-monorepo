-- Extend auctions table for customer-created listings

DO $$ BEGIN
  CREATE TYPE approval_status AS ENUM ('pending_review', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE auctions ADD COLUMN IF NOT EXISTS seller_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS is_consignment BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS approval_status approval_status;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS approval_notes TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS seller_commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.1200;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS seller_payout NUMERIC(10,2);
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS seller_paid_at TIMESTAMPTZ;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS escrow_status VARCHAR(30);
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS tracking_to_ctcg VARCHAR(100);
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS tracking_to_buyer VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_auctions_seller ON auctions(seller_user_id);
CREATE INDEX IF NOT EXISTS idx_auctions_approval ON auctions(approval_status);
