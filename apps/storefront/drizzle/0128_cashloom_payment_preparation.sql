-- 0128_cashloom_payment_preparation.sql
--
-- Cambridge-local evidence that the authenticated buyer prepared one exact
-- immutable CashLoom handoff. This is deliberately not a CashLoom v2 record,
-- payment instruction, settlement-rail choice, processor reservation, escrow
-- event, or trade-state transition.

-- Let the preparation row bind the exact handoff and terms through one
-- database constraint, rather than relying on three independent references.
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_trade_cashloom_handoffs_exact_terms
  ON market_trade_cashloom_handoffs (trade_id, handoff_id, terms_hash);

CREATE TABLE IF NOT EXISTS market_trade_cashloom_payment_preparations (
  preparation_id TEXT PRIMARY KEY
    CHECK (preparation_id ~ '^sha256:[0-9a-f]{64}$'),
  trade_id UUID NOT NULL UNIQUE
    REFERENCES market_trades(id) ON DELETE RESTRICT,
  handoff_id TEXT NOT NULL UNIQUE,
  prepared_by UUID NOT NULL
    REFERENCES users(id) ON DELETE RESTRICT,
  terms_hash TEXT NOT NULL
    CHECK (terms_hash ~ '^sha256:[0-9a-f]{64}$'),
  state TEXT NOT NULL
    CHECK (state = 'prepared'),
  expected_trade_state TEXT NOT NULL
    CHECK (expected_trade_state = 'awaiting_payment'),
  expected_preparation_state TEXT NOT NULL
    CHECK (expected_preparation_state = 'none'),
  disclosure_notice_version TEXT NOT NULL
    CHECK (disclosure_notice_version = 'cashloom-preparation-retention-v1'),
  request_hash TEXT NOT NULL
    CHECK (request_hash ~ '^sha256:[0-9a-f]{64}$'),
  idempotency_key_hash TEXT NOT NULL
    CHECK (idempotency_key_hash ~ '^sha256:[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prepared_by, idempotency_key_hash),
  CONSTRAINT market_trade_cashloom_preparation_exact_handoff
    FOREIGN KEY (trade_id, handoff_id, terms_hash)
    REFERENCES market_trade_cashloom_handoffs (trade_id, handoff_id, terms_hash)
    ON DELETE RESTRICT
);

COMMENT ON TABLE market_trade_cashloom_payment_preparations IS
  'Insert-only Cambridge account evidence: the authenticated buyer prepared one exact terms handoff. It proves no key control, payment, rail choice, escrow, settlement, shipping right, or payout change.';
COMMENT ON COLUMN market_trade_cashloom_payment_preparations.prepared_by IS
  'Cambridge database-session actor. This is host-local account authority, not a CashLoom payer key or portable identity.';
COMMENT ON COLUMN market_trade_cashloom_payment_preparations.idempotency_key_hash IS
  'SHA-256 digest of the bounded client retry key. The raw retry key is never stored.';
COMMENT ON COLUMN market_trade_cashloom_payment_preparations.disclosure_notice_version IS
  'Version of the pre-action notice that says both participants can read this retained, identity-linked evidence and that production retention/erasure policy is unresolved.';

-- The database role is the host-local authority for this receipt. Guard its
-- closed transition at the storage boundary too, so another application path
-- cannot attribute preparation to the wrong account or stale trade state.
CREATE OR REPLACE FUNCTION validate_cashloom_payment_preparation_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  trade_buyer_id UUID;
  trade_seller_id UUID;
  trade_state TEXT;
  trade_payment_expires_at TIMESTAMPTZ;
BEGIN
  SELECT buyer_id, seller_id, escrow_status::text, payment_expires_at
    INTO trade_buyer_id, trade_seller_id, trade_state, trade_payment_expires_at
    FROM market_trades
   WHERE id = NEW.trade_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CashLoom preparation trade does not exist';
  END IF;
  IF trade_buyer_id = trade_seller_id THEN
    RAISE EXCEPTION 'CashLoom preparation cannot be recorded for a self-trade';
  END IF;
  IF NEW.prepared_by <> trade_buyer_id THEN
    RAISE EXCEPTION 'CashLoom preparation actor is not the trade buyer';
  END IF;
  IF trade_state <> 'awaiting_payment' THEN
    RAISE EXCEPTION 'CashLoom preparation trade is not awaiting payment';
  END IF;
  IF trade_payment_expires_at IS NOT NULL AND trade_payment_expires_at <= NOW() THEN
    RAISE EXCEPTION 'CashLoom preparation payment window has expired';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS market_trade_cashloom_preparations_validate_insert
  ON market_trade_cashloom_payment_preparations;
CREATE TRIGGER market_trade_cashloom_preparations_validate_insert
  BEFORE INSERT ON market_trade_cashloom_payment_preparations
  FOR EACH ROW EXECUTE FUNCTION validate_cashloom_payment_preparation_insert();

-- Evidence cannot be rewritten or erased through ordinary SQL mutations.
-- RESTRICT foreign keys also prevent parent deletion from silently cascading
-- this row away. Rollback disables/removes the application writer and retains
-- the inert evidence table; it does not destroy history.
CREATE OR REPLACE FUNCTION reject_cashloom_payment_preparation_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'CashLoom payment preparation evidence is immutable';
END;
$$;

DROP TRIGGER IF EXISTS market_trade_cashloom_payment_preparations_no_mutation
  ON market_trade_cashloom_payment_preparations;
CREATE TRIGGER market_trade_cashloom_payment_preparations_no_mutation
  BEFORE UPDATE OR DELETE ON market_trade_cashloom_payment_preparations
  FOR EACH ROW EXECUTE FUNCTION reject_cashloom_payment_preparation_mutation();
