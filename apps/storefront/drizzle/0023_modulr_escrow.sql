-- Modulr banking integration: virtual escrow accounts, payments, CoP

CREATE TABLE IF NOT EXISTS escrow_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID UNIQUE NOT NULL REFERENCES market_trades(id),
  -- Modulr virtual account details
  modulr_account_id VARCHAR(100),
  sort_code VARCHAR(10) NOT NULL,
  account_number VARCHAR(10) NOT NULL,
  account_name VARCHAR(200) NOT NULL,
  reference VARCHAR(30) NOT NULL,
  -- Payment status
  status VARCHAR(30) NOT NULL DEFAULT 'awaiting_payment',
  -- awaiting_payment, payment_received, payout_pending, payout_sent, completed, refunded, expired
  expected_amount NUMERIC(10,2) NOT NULL,
  received_amount NUMERIC(10,2),
  received_at TIMESTAMPTZ,
  sender_name VARCHAR(200),
  sender_sort_code VARCHAR(10),
  sender_account_number VARCHAR(10),
  -- CoP result on incoming payment
  cop_inbound_result VARCHAR(20),
  cop_inbound_name_match BOOLEAN,
  -- Payout details
  payout_amount NUMERIC(10,2),
  commission_amount NUMERIC(10,2),
  payout_sort_code VARCHAR(10),
  payout_account_number VARCHAR(10),
  payout_account_name VARCHAR(200),
  payout_reference VARCHAR(50),
  payout_sent_at TIMESTAMPTZ,
  payout_confirmed_at TIMESTAMPTZ,
  -- CoP result on outgoing payout
  cop_outbound_result VARCHAR(20),
  cop_outbound_name_match BOOLEAN,
  -- Refund (if disputed)
  refund_amount NUMERIC(10,2),
  refund_sent_at TIMESTAMPTZ,
  -- Expiry (buyer has 24h to pay)
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payment event log (every Modulr webhook recorded)
CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_account_id UUID REFERENCES escrow_accounts(id),
  trade_id UUID REFERENCES market_trades(id),
  event_type VARCHAR(50) NOT NULL,
  modulr_payment_id VARCHAR(100),
  amount NUMERIC(10,2),
  sender_name VARCHAR(200),
  sender_sort_code VARCHAR(10),
  sender_account_number VARCHAR(10),
  status VARCHAR(20),
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CoP verification log
CREATE TABLE IF NOT EXISTS cop_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  trade_id UUID REFERENCES market_trades(id),
  direction VARCHAR(10) NOT NULL, -- 'inbound' or 'outbound'
  sort_code VARCHAR(10) NOT NULL,
  account_number VARCHAR(10) NOT NULL,
  name_checked VARCHAR(200) NOT NULL,
  result VARCHAR(20) NOT NULL, -- 'MATCH', 'PARTIAL_MATCH', 'NO_MATCH', 'ERROR'
  response_name VARCHAR(200),
  reason_code VARCHAR(10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add bank verification status to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_cop_result VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mangopay_user_id VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS mangopay_wallet_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_escrow_accounts_trade ON escrow_accounts(trade_id);
CREATE INDEX IF NOT EXISTS idx_escrow_accounts_status ON escrow_accounts(status);
CREATE INDEX IF NOT EXISTS idx_escrow_accounts_reference ON escrow_accounts(reference);
CREATE INDEX IF NOT EXISTS idx_payment_events_escrow ON payment_events(escrow_account_id);
CREATE INDEX IF NOT EXISTS idx_cop_checks_user ON cop_checks(user_id);
