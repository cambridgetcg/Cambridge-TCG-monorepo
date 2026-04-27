-- Chargebacks: Stripe dispute events as first-class records.
--
-- The fraud signal taxonomy (@/lib/fraud/detection) defines a CHARGEBACK
-- signal type with severity='critical' + autoAction='suspend' but had
-- no producer — Stripe webhooks for charge.dispute.* events were not
-- handled. This anchors the payment-integrity cluster (parallel to
-- trust / fulfilment / transparency).
--
-- The PK is the Stripe event id so a webhook delivery retry (Stripe
-- guarantees at-least-once) cannot create duplicates. Reconciliation
-- cron uses the same PK shape.

BEGIN;

CREATE TABLE IF NOT EXISTS chargebacks (
  -- Stripe dispute id (du_…) is the canonical key. Webhook re-delivery
  -- is no-op via ON CONFLICT.
  stripe_dispute_id    VARCHAR(100) PRIMARY KEY,
  -- The payment_intent the dispute is filed against (pi_…). Joins to
  -- customer_orders for owner lookup.
  stripe_payment_intent VARCHAR(200) NOT NULL,
  -- Owning user — derived at insert time from customer_orders. NULL
  -- when we can't map (admin investigates manually).
  user_id              UUID REFERENCES users(id) ON DELETE SET NULL,
  -- The customer_orders row this dispute attacks. NULL same as above.
  order_id             INT REFERENCES customer_orders(id),

  amount_gbp           NUMERIC(10,2) NOT NULL,
  currency             VARCHAR(5)   NOT NULL DEFAULT 'gbp',

  -- Stripe dispute status:  warning_needs_response | warning_under_review
  -- | warning_closed | needs_response | under_review | won | lost
  -- | charge_refunded
  stripe_status        VARCHAR(40) NOT NULL,
  stripe_reason        VARCHAR(60),
  -- Stripe-provided evidence-due timestamp.
  evidence_due_at      TIMESTAMPTZ,

  -- Whether we've already wired the chargeback into the fraud +
  -- governance modules (Phase C). De-dup gate so the
  -- emit-on-create only fires once even on webhook re-delivery.
  fraud_emitted        BOOLEAN NOT NULL DEFAULT false,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chargebacks_user
  ON chargebacks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chargebacks_open
  ON chargebacks(created_at DESC)
  WHERE stripe_status NOT IN ('won', 'lost', 'warning_closed', 'charge_refunded');

-- Lifecycle log mirrors every other module.
CREATE TABLE IF NOT EXISTS chargeback_lifecycle_log (
  id                  BIGSERIAL PRIMARY KEY,
  stripe_dispute_id   VARCHAR(100) NOT NULL REFERENCES chargebacks(stripe_dispute_id) ON DELETE CASCADE,
  -- 'received' | 'status_changed' | 'fraud_emitted' | 'evidence_uploaded'
  -- | 'won' | 'lost' | 'admin_override'
  action              VARCHAR(40) NOT NULL,
  actor_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_label         TEXT,
  reason              TEXT,
  metadata            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chargeback_log_dispute
  ON chargeback_lifecycle_log(stripe_dispute_id, created_at DESC);

COMMIT;
