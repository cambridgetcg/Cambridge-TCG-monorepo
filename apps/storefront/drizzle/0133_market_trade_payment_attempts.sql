-- 0133_market_trade_payment_attempts.sql
--
-- One immutable settlement-rail reservation per P2P market trade, plus a
-- generation-scoped Stripe Checkout attempt ledger. The reservation closes
-- the double-rail race before a provider call; the attempt freezes the exact
-- request and amount that a signed Stripe webhook must later prove.
--
-- Only Stripe is executable in this migration. A future CashLoom execution
-- path must deliberately expand the rail constraint and implement its own
-- observation, refund, commission, and payout rules. Preparing the existing
-- unsigned CashLoom handoff does not create a reservation.

CREATE TABLE IF NOT EXISTS market_trade_settlement_reservations (
  trade_id UUID PRIMARY KEY REFERENCES market_trades(id) ON DELETE CASCADE,
  rail TEXT NOT NULL
    CONSTRAINT market_trade_settlement_rail_supported
    CHECK (rail = 'stripe_checkout'),
  reserved_by UUID NOT NULL REFERENCES users(id),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE market_trade_settlement_reservations IS
  'One immutable executable settlement rail per market trade. CashLoom handoff preparation is non-executing and does not reserve this row.';
COMMENT ON COLUMN market_trade_settlement_reservations.rail IS
  'Executable rail family. Only stripe_checkout is enabled by this migration; adding another value requires a reviewed state-machine migration.';

CREATE TABLE IF NOT EXISTS market_trade_stripe_checkout_attempts (
  id UUID PRIMARY KEY,
  trade_id UUID NOT NULL
    REFERENCES market_trade_settlement_reservations(trade_id) ON DELETE CASCADE,
  generation INTEGER NOT NULL CHECK (generation > 0),
  status TEXT NOT NULL
    CHECK (status IN (
      'reserved',
      'checkout_open',
      'processing',
      'settled',
      'expired',
      'failed',
      'requires_review'
    )),
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (char_length(idempotency_key) BETWEEN 16 AND 255),
  request_snapshot JSONB NOT NULL
    CHECK (jsonb_typeof(request_snapshot) = 'object')
    CHECK (octet_length(request_snapshot::text) <= 16384),
  expected_amount_pence BIGINT NOT NULL CHECK (expected_amount_pence > 0),
  expected_currency TEXT NOT NULL CHECK (expected_currency = 'gbp'),
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent TEXT UNIQUE,
  provider_expires_at TIMESTAMPTZ NOT NULL,
  review_reason TEXT,
  last_reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ,
  UNIQUE (trade_id, generation),
  CHECK (review_reason IS NULL OR char_length(review_reason) <= 2000)
);

-- At most one attempt may still be chargeable, ambiguous, or waiting for a
-- signed terminal event. A new generation can only be inserted after the
-- preceding one is authoritatively expired or failed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_trade_stripe_one_blocking_attempt
  ON market_trade_stripe_checkout_attempts(trade_id)
  WHERE status IN ('reserved', 'checkout_open', 'processing', 'requires_review');

CREATE INDEX IF NOT EXISTS idx_market_trade_stripe_attempts_trade_created
  ON market_trade_stripe_checkout_attempts(trade_id, created_at DESC);

-- The frozen client reference is the safe resolver when Stripe delivers a
-- webhook between Session creation and our write-once Session-id attach.
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_trade_stripe_attempt_client_reference
  ON market_trade_stripe_checkout_attempts((request_snapshot->>'client_reference_id'))
  WHERE request_snapshot ? 'client_reference_id';

CREATE INDEX IF NOT EXISTS idx_market_trade_stripe_attempts_reconcile
  ON market_trade_stripe_checkout_attempts(last_reconciled_at ASC NULLS FIRST, updated_at ASC)
  WHERE status IN ('checkout_open', 'processing') AND stripe_session_id IS NOT NULL;

-- Pre-v2 Sessions have no attempt row, but their signed terminal evidence
-- still needs a durable idempotency key. Without this observation, clearing
-- market_trades.stripe_session_id makes every Stripe redelivery look unknown
-- and causes an endless 5xx retry loop.
CREATE TABLE IF NOT EXISTS market_trade_legacy_stripe_terminal_events (
  stripe_session_id TEXT PRIMARY KEY,
  trade_id UUID NOT NULL
    REFERENCES market_trade_settlement_reservations(trade_id) ON DELETE CASCADE,
  terminal_status TEXT NOT NULL CHECK (terminal_status IN ('expired', 'failed')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trade_id, stripe_session_id)
);

COMMENT ON TABLE market_trade_legacy_stripe_terminal_events IS
  'Immutable, idempotent signed terminal observations for exact pre-v2 Stripe Sessions.';

COMMENT ON TABLE market_trade_stripe_checkout_attempts IS
  'Generation-scoped Stripe Checkout attempts. Exact request, amount, currency, provider expiry, and provider identifiers are retained for webhook binding and reconciliation.';
COMMENT ON COLUMN market_trade_stripe_checkout_attempts.status IS
  'requires_review is deliberately blocking: ambiguous provider evidence must never rotate into another payable attempt automatically.';

-- Rail choice is monotonic. Recovery or migration to a different executable
-- rail must be an explicit, reviewed database operation, never an ordinary
-- application UPDATE.
CREATE OR REPLACE FUNCTION reject_market_trade_settlement_rail_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.trade_id IS DISTINCT FROM OLD.trade_id
     OR NEW.rail IS DISTINCT FROM OLD.rail
     OR NEW.reserved_by IS DISTINCT FROM OLD.reserved_by
     OR NEW.reserved_at IS DISTINCT FROM OLD.reserved_at THEN
    RAISE EXCEPTION 'market trade settlement reservations are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS market_trade_settlement_reservations_no_update
  ON market_trade_settlement_reservations;
CREATE TRIGGER market_trade_settlement_reservations_no_update
  BEFORE UPDATE ON market_trade_settlement_reservations
  FOR EACH ROW EXECUTE FUNCTION reject_market_trade_settlement_rail_change();

-- Direct deletion would erase the rail choice and cascade its evidence,
-- reopening the same trade to another executable rail. Permit deletion only
-- when the owning trade itself is being removed by its FK cascade.
CREATE OR REPLACE FUNCTION reject_live_market_trade_settlement_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM market_trades WHERE id = OLD.trade_id) THEN
    RAISE EXCEPTION 'live market trade settlement reservations cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS market_trade_settlement_reservations_no_direct_delete
  ON market_trade_settlement_reservations;
CREATE TRIGGER market_trade_settlement_reservations_no_direct_delete
  BEFORE DELETE ON market_trade_settlement_reservations
  FOR EACH ROW EXECUTE FUNCTION reject_live_market_trade_settlement_delete();

-- The economic/request binding and provider identifiers are write-once.
-- Status, review_reason, timestamps, and a previously-null provider id may
-- advance as signed provider evidence arrives.
CREATE OR REPLACE FUNCTION protect_market_trade_stripe_attempt_binding()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.trade_id IS DISTINCT FROM OLD.trade_id
     OR NEW.generation IS DISTINCT FROM OLD.generation
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.request_snapshot IS DISTINCT FROM OLD.request_snapshot
     OR NEW.expected_amount_pence IS DISTINCT FROM OLD.expected_amount_pence
     OR NEW.expected_currency IS DISTINCT FROM OLD.expected_currency
     OR NEW.provider_expires_at IS DISTINCT FROM OLD.provider_expires_at
     OR (OLD.stripe_session_id IS NOT NULL
         AND NEW.stripe_session_id IS DISTINCT FROM OLD.stripe_session_id)
     OR (OLD.stripe_payment_intent IS NOT NULL
         AND NEW.stripe_payment_intent IS DISTINCT FROM OLD.stripe_payment_intent) THEN
    RAISE EXCEPTION 'market trade Stripe attempt binding is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS market_trade_stripe_attempts_protect_binding
  ON market_trade_stripe_checkout_attempts;
CREATE TRIGGER market_trade_stripe_attempts_protect_binding
  BEFORE UPDATE ON market_trade_stripe_checkout_attempts
  FOR EACH ROW EXECUTE FUNCTION protect_market_trade_stripe_attempt_binding();

CREATE OR REPLACE FUNCTION reject_live_market_trade_stripe_attempt_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM market_trade_settlement_reservations
     WHERE trade_id = OLD.trade_id
  ) THEN
    RAISE EXCEPTION 'live market trade Stripe attempts cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS market_trade_stripe_attempts_no_direct_delete
  ON market_trade_stripe_checkout_attempts;
CREATE TRIGGER market_trade_stripe_attempts_no_direct_delete
  BEFORE DELETE ON market_trade_stripe_checkout_attempts
  FOR EACH ROW EXECUTE FUNCTION reject_live_market_trade_stripe_attempt_delete();

CREATE OR REPLACE FUNCTION reject_market_trade_legacy_terminal_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'legacy market trade Stripe terminal evidence is immutable';
END;
$$;

DROP TRIGGER IF EXISTS market_trade_legacy_terminal_no_update
  ON market_trade_legacy_stripe_terminal_events;
CREATE TRIGGER market_trade_legacy_terminal_no_update
  BEFORE UPDATE ON market_trade_legacy_stripe_terminal_events
  FOR EACH ROW EXECUTE FUNCTION reject_market_trade_legacy_terminal_change();

CREATE OR REPLACE FUNCTION reject_live_market_trade_legacy_terminal_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM market_trade_settlement_reservations
     WHERE trade_id = OLD.trade_id
  ) THEN
    RAISE EXCEPTION 'live legacy market trade Stripe terminal evidence cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS market_trade_legacy_terminal_no_direct_delete
  ON market_trade_legacy_stripe_terminal_events;
CREATE TRIGGER market_trade_legacy_terminal_no_direct_delete
  BEFORE DELETE ON market_trade_legacy_stripe_terminal_events
  FOR EACH ROW EXECUTE FUNCTION reject_live_market_trade_legacy_terminal_delete();
