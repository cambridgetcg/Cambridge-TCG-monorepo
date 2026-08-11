-- 0127_cashloom_settlement.sql
--
-- Optional, non-custodial CashLoom v2 settlement handoffs for P2P trades.
-- Cambridge TCG stores a user's declared merchant key pin and, at the
-- seller's request, freezes one participant-only packet containing the
-- trade's existing GBP and fulfilment terms. Neither table stores signing
-- keys, payment credentials, payment state, payout state, or chain state.
-- Preparing a handoff does not move money and does not change market_trades.

CREATE TABLE IF NOT EXISTS cashloom_settlement_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  merchant_key_id TEXT NOT NULL
    CHECK (merchant_key_id ~ '^sha256:[0-9a-f]{64}$'),
  enabled BOOLEAN NOT NULL,
  handoff_mode TEXT NOT NULL
    CHECK (handoff_mode = 'offline_bundle'),
  disclosure_notice_version TEXT NOT NULL
    CHECK (disclosure_notice_version = 'cashloom-key-linkability-v1'),
  disclosure_acknowledged_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cashloom_settlement_profiles IS
  'User-declared CashLoom v2 merchant key pins. Declarations are not proof of key ownership. No private keys or payment credentials are stored.';
COMMENT ON COLUMN cashloom_settlement_profiles.merchant_key_id IS
  'Self-certifying public key identifier declared by the user. It is linkable wherever reused and is not ownership-verified by Cambridge TCG.';
COMMENT ON COLUMN cashloom_settlement_profiles.enabled IS
  'Whether a new trade handoff may snapshot this declaration. Existing handoffs are unaffected by profile rotation, disablement, or deletion.';

CREATE TABLE IF NOT EXISTS market_trade_cashloom_handoffs (
  trade_id UUID PRIMARY KEY REFERENCES market_trades(id) ON DELETE CASCADE,
  handoff_id TEXT NOT NULL UNIQUE
    CHECK (handoff_id ~ '^sha256:[0-9a-f]{64}$'),
  merchant_key_id TEXT NOT NULL
    CHECK (merchant_key_id ~ '^sha256:[0-9a-f]{64}$'),
  terms_hash TEXT NOT NULL
    CHECK (terms_hash ~ '^sha256:[0-9a-f]{64}$'),
  expected_purpose_note TEXT NOT NULL
    CHECK (expected_purpose_note ~ '^ctcg:v1:[0-9a-f]{64}$')
    CHECK (octet_length(expected_purpose_note) <= 160),
  canonical_json TEXT NOT NULL
    CHECK (octet_length(canonical_json) <= 16384),
  created_at TIMESTAMPTZ NOT NULL
);

COMMENT ON TABLE market_trade_cashloom_handoffs IS
  'One immutable, unsigned, non-executing CashLoom handoff packet per P2P trade. The packet is participant-only and cannot mark payment, escrow, payout, or fulfilment state.';
COMMENT ON COLUMN market_trade_cashloom_handoffs.canonical_json IS
  'Exact canonical packet bytes used to derive handoff_id. This is not a .cashloom-pay bundle, signature, payment instruction, or receipt.';

-- A handoff snapshots the terms and merchant pin that existed at creation.
-- Application code has no UPDATE path; this trigger also closes accidental
-- direct UPDATEs while preserving ON DELETE CASCADE with the parent trade.
CREATE OR REPLACE FUNCTION reject_cashloom_handoff_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'CashLoom trade handoffs are immutable';
END;
$$;

DROP TRIGGER IF EXISTS market_trade_cashloom_handoffs_no_update
  ON market_trade_cashloom_handoffs;
CREATE TRIGGER market_trade_cashloom_handoffs_no_update
  BEFORE UPDATE ON market_trade_cashloom_handoffs
  FOR EACH ROW EXECUTE FUNCTION reject_cashloom_handoff_update();
