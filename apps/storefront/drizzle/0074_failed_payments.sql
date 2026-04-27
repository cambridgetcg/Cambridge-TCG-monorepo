-- Failed payments: third (and final) leg of the payment-integrity
-- cluster. Schema parallel to chargebacks (0072) + refunds (0073).
--
-- Stripe payment_intent.payment_failed events are unhandled today —
-- the SIGNAL_DEFS in @/lib/fraud/detection didn't even declare a
-- failed-payment type. This module adds the data layer + a new
-- FAILED_PAYMENT_BURST signal that fires when a user's failure rate
-- spikes (suggests testing stolen cards, or worse).

BEGIN;

CREATE TABLE IF NOT EXISTS failed_payments (
  -- Stripe payment_intent id (pi_…) — webhook re-delivery is no-op.
  -- One row per intent; subsequent failures on the same intent
  -- update attempt_count + last_attempt_at.
  stripe_payment_intent  VARCHAR(200) PRIMARY KEY,

  user_id                UUID REFERENCES users(id) ON DELETE SET NULL,
  -- The customer_orders row this attempt was for (NULL when no match).
  order_id               INT REFERENCES customer_orders(id),

  amount_gbp             NUMERIC(10,2) NOT NULL,
  currency               VARCHAR(5)   NOT NULL DEFAULT 'gbp',

  -- Stripe error code (card_declined, insufficient_funds, etc).
  failure_code           VARCHAR(60),
  failure_message        TEXT,

  -- Number of failure events seen on this PI; bumps on each retry.
  attempt_count          INT NOT NULL DEFAULT 1,
  first_attempt_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Did we fan out to the burst-pattern fraud check yet? Same
  -- de-dup gate as chargebacks.fraud_emitted + refunds.abuse_checked.
  burst_checked          BOOLEAN NOT NULL DEFAULT false,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_failed_payments_user
  ON failed_payments(user_id, last_attempt_at DESC);
CREATE INDEX IF NOT EXISTS idx_failed_payments_recent_unchecked
  ON failed_payments(last_attempt_at DESC)
  WHERE burst_checked = false;

CREATE TABLE IF NOT EXISTS failed_payment_lifecycle_log (
  id                     BIGSERIAL PRIMARY KEY,
  stripe_payment_intent  VARCHAR(200) NOT NULL REFERENCES failed_payments(stripe_payment_intent) ON DELETE CASCADE,
  -- 'received' | 'retried' | 'burst_checked' | 'admin_override'
  action                 VARCHAR(40) NOT NULL,
  actor_label            TEXT,
  reason                 TEXT,
  metadata               JSONB,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_failed_payment_log_subject
  ON failed_payment_lifecycle_log(stripe_payment_intent, created_at DESC);

COMMIT;
