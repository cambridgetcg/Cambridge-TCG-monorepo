-- Refunds: Stripe refund events as first-class records.
--
-- Mirrors chargebacks (0072) but for the refund pathway. The fraud
-- taxonomy declared REFUND_ABUSE with severity='high' + autoAction=
-- 'hold_payout' but the detection pass in @/lib/fraud/passes was a
-- placeholder that counted disputes only — actual refund signal had
-- no producer. This data layer feeds the real generator.

BEGIN;

CREATE TABLE IF NOT EXISTS refunds (
  -- Stripe refund id (re_…) — webhook re-delivery is no-op via PK.
  stripe_refund_id      VARCHAR(100) PRIMARY KEY,
  stripe_payment_intent VARCHAR(200) NOT NULL,
  stripe_charge         VARCHAR(200),

  -- Owner derived from customer_orders join, NULL when no match.
  user_id               UUID REFERENCES users(id) ON DELETE SET NULL,
  order_id              INT REFERENCES customer_orders(id),

  amount_gbp            NUMERIC(10,2) NOT NULL,
  currency              VARCHAR(5)   NOT NULL DEFAULT 'gbp',

  -- Stripe refund status: pending | succeeded | failed | canceled
  stripe_status         VARCHAR(40) NOT NULL,
  -- Reason: duplicate | fraudulent | requested_by_customer | (custom)
  stripe_reason         VARCHAR(60),

  -- 'admin' | 'system' | 'stripe' depending on origin.
  initiated_by          VARCHAR(20) NOT NULL DEFAULT 'admin',

  -- Did we already fan out to the abuse-detection pass for this
  -- refund? Same de-dup pattern as chargebacks.fraud_emitted.
  abuse_checked         BOOLEAN NOT NULL DEFAULT false,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_user
  ON refunds(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refunds_recent_unchecked
  ON refunds(created_at DESC)
  WHERE abuse_checked = false AND stripe_status = 'succeeded';

CREATE TABLE IF NOT EXISTS refund_lifecycle_log (
  id                BIGSERIAL PRIMARY KEY,
  stripe_refund_id  VARCHAR(100) NOT NULL REFERENCES refunds(stripe_refund_id) ON DELETE CASCADE,
  -- 'received' | 'status_changed' | 'abuse_checked' | 'admin_override'
  action            VARCHAR(40) NOT NULL,
  actor_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_label       TEXT,
  reason            TEXT,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refund_log_subject
  ON refund_lifecycle_log(stripe_refund_id, created_at DESC);

COMMIT;
