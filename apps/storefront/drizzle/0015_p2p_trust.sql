-- P2P Trust Layer: verification, disputes, escrow payments

DO $$ BEGIN
  CREATE TYPE verification_status AS ENUM ('pending', 'verified', 'rejected', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE dispute_status AS ENUM ('open', 'under_review', 'awaiting_evidence', 'resolved_buyer', 'resolved_seller', 'resolved_split', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- User verification (UK-only, 18+ identity check)
CREATE TABLE IF NOT EXISTS user_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status verification_status NOT NULL DEFAULT 'pending',
  -- Identity
  full_legal_name VARCHAR(200) NOT NULL,
  date_of_birth DATE NOT NULL,
  -- UK address
  address_line1 VARCHAR(200) NOT NULL,
  address_line2 VARCHAR(200),
  city VARCHAR(100) NOT NULL,
  county VARCHAR(100),
  postcode VARCHAR(10) NOT NULL,
  country VARCHAR(5) NOT NULL DEFAULT 'GB',
  -- Contact
  phone VARCHAR(20),
  phone_verified BOOLEAN NOT NULL DEFAULT false,
  -- Payment (for receiving seller payouts)
  bank_sort_code VARCHAR(10),
  bank_account_number VARCHAR(10),
  bank_account_name VARCHAR(200),
  -- Admin
  admin_notes TEXT,
  verified_at TIMESTAMPTZ,
  rejected_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trade disputes
CREATE TABLE IF NOT EXISTS trade_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES market_trades(id),
  raised_by UUID NOT NULL REFERENCES users(id),
  reason VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  status dispute_status NOT NULL DEFAULT 'open',
  -- Resolution
  resolution_type VARCHAR(30),
  resolution_notes TEXT,
  refund_amount NUMERIC(10,2),
  resolved_by_admin BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dispute evidence (photos, screenshots)
CREATE TABLE IF NOT EXISTS dispute_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES trade_disputes(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  url TEXT NOT NULL,
  s3_key TEXT NOT NULL,
  label VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dispute messages (communication between parties + admin)
CREATE TABLE IF NOT EXISTS dispute_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES trade_disputes(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  is_admin BOOLEAN NOT NULL DEFAULT false,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Escrow payment records
CREATE TABLE IF NOT EXISTS escrow_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES market_trades(id),
  type VARCHAR(20) NOT NULL,
  stripe_payment_intent VARCHAR(200),
  stripe_checkout_session VARCHAR(200),
  amount NUMERIC(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  -- Payout to seller
  payout_amount NUMERIC(10,2),
  payout_reference VARCHAR(200),
  payout_at TIMESTAMPTZ,
  -- Refund
  refund_amount NUMERIC(10,2),
  refund_reason TEXT,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add verified flag to users table for quick checks
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(5);

CREATE INDEX IF NOT EXISTS idx_user_verifications_user ON user_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_verifications_status ON user_verifications(status);
CREATE INDEX IF NOT EXISTS idx_trade_disputes_trade ON trade_disputes(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_disputes_status ON trade_disputes(status);
CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute ON dispute_evidence(dispute_id);
CREATE INDEX IF NOT EXISTS idx_dispute_messages_dispute ON dispute_messages(dispute_id);
CREATE INDEX IF NOT EXISTS idx_escrow_payments_trade ON escrow_payments(trade_id);
