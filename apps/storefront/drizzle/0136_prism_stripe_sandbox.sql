-- 0136_prism_stripe_sandbox.sql
--
-- Server-only authority and correlation records for the PRISM Signals Stripe
-- sandbox. This migration does not configure credentials, enable Checkout,
-- accept live-mode objects, or grant an entitlement by itself.

-- 0135 deliberately froze the original runtime vocabulary. This additive
-- lifecycle observation is needed to mirror a remotely attested reversal of
-- cancel-at-period-end without pretending that an invoice itself proves it.
ALTER TABLE product_flow_events
  DROP CONSTRAINT product_flow_events_event_type_check;
ALTER TABLE product_flow_events
  ADD CONSTRAINT product_flow_events_event_type_check CHECK (event_type IN (
    'checkout_started',
    'browser_return',
    'precheckout_approved',
    'channel_linked',
    'payment_confirmed',
    'renewal_confirmed',
    'payment_failed',
    'cancel_at_period_end',
    'subscription_resumed',
    'subscription_ended',
    'refunded',
    'revoked'
  ));

ALTER TABLE product_flow_events
  DROP CONSTRAINT product_flow_events_check;
ALTER TABLE product_flow_events
  ADD CONSTRAINT product_flow_events_check CHECK (
    (event_type IN (
      'payment_confirmed',
      'renewal_confirmed',
      'payment_failed',
      'cancel_at_period_end',
      'subscription_resumed',
      'subscription_ended',
      'refunded'
    )) = (provider_event_ref IS NOT NULL)
  );

CREATE TABLE IF NOT EXISTS product_flow_account_subjects (
  environment TEXT NOT NULL CHECK (environment = 'test'),
  product_id TEXT NOT NULL
    CHECK (product_id = 'prism-signals')
    CHECK (char_length(product_id) <= 64),
  subject_ref TEXT NOT NULL
    CHECK (subject_ref ~ '^pf_[A-Za-z0-9_-]{16,64}$'),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT
    CHECK (
      stripe_customer_id IS NULL
      OR (
        stripe_customer_id ~ '^cus_[A-Za-z0-9]{8,64}$'
        AND char_length(stripe_customer_id) <= 80
      )
    ),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (environment, product_id, subject_ref),
  UNIQUE (environment, product_id, user_id),
  UNIQUE (environment, product_id, subject_ref, stripe_customer_id),
  CHECK (created_at <= updated_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_flow_account_stripe_customer_once
  ON product_flow_account_subjects(environment, stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

COMMENT ON TABLE product_flow_account_subjects IS
  'Server-only mapping from an authenticated local account to one opaque product-flow subject. A nullable test Stripe Customer binding never enters public DTOs or generic product-flow payloads.';

CREATE TABLE IF NOT EXISTS product_flow_entitlement_owners (
  environment TEXT NOT NULL CHECK (environment = 'test'),
  entitlement_ref TEXT NOT NULL
    CHECK (entitlement_ref ~ '^pf_[A-Za-z0-9_-]{16,64}$'),
  product_id TEXT NOT NULL CHECK (product_id = 'prism-signals'),
  subject_ref TEXT NOT NULL
    CHECK (subject_ref ~ '^pf_[A-Za-z0-9_-]{16,64}$'),
  offer_id TEXT NOT NULL CHECK (offer_id = 'prism-signals-all'),
  offer_version INTEGER NOT NULL CHECK (offer_version = 1),
  generation INTEGER NOT NULL CHECK (generation > 0),
  lifecycle TEXT NOT NULL DEFAULT 'current'
    CHECK (lifecycle IN ('current', 'terminal')),
  terminal_reason TEXT
    CHECK (
      terminal_reason IS NULL
      OR terminal_reason IN (
        'subscription_ended',
        'refunded',
        'revoked',
        'superseded_before_grant'
      )
    ),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  terminal_at TIMESTAMPTZ(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (environment, entitlement_ref),
  UNIQUE (environment, product_id, subject_ref, generation),
  FOREIGN KEY (environment, product_id, subject_ref)
    REFERENCES product_flow_account_subjects(environment, product_id, subject_ref)
    ON DELETE CASCADE,
  CHECK (
    (lifecycle = 'current' AND terminal_at IS NULL AND terminal_reason IS NULL)
    OR
    (lifecycle = 'terminal' AND terminal_at IS NOT NULL AND terminal_reason IS NOT NULL)
  ),
  CHECK (created_at <= updated_at),
  CHECK (terminal_at IS NULL OR created_at <= terminal_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_flow_one_current_owner
  ON product_flow_entitlement_owners(environment, product_id, subject_ref)
  WHERE lifecycle = 'current';

CREATE INDEX IF NOT EXISTS idx_product_flow_owner_account_history
  ON product_flow_entitlement_owners(
    environment,
    product_id,
    subject_ref,
    generation DESC
  );

COMMENT ON TABLE product_flow_entitlement_owners IS
  'Lifetime entitlement generations for one account subject. The trigger prevents terminal generations from being reactivated; a later subscription receives a new entitlement_ref.';

CREATE OR REPLACE FUNCTION protect_product_flow_terminal_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.environment IS DISTINCT FROM NEW.environment
    OR OLD.entitlement_ref IS DISTINCT FROM NEW.entitlement_ref
    OR OLD.product_id IS DISTINCT FROM NEW.product_id
    OR OLD.subject_ref IS DISTINCT FROM NEW.subject_ref
    OR OLD.offer_id IS DISTINCT FROM NEW.offer_id
    OR OLD.offer_version IS DISTINCT FROM NEW.offer_version
    OR OLD.generation IS DISTINCT FROM NEW.generation
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'product flow entitlement owner identity is immutable';
  END IF;
  IF OLD.lifecycle = 'terminal' AND ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
    RAISE EXCEPTION 'terminal product flow entitlement owner is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_flow_terminal_owner_immutable
  ON product_flow_entitlement_owners;
CREATE TRIGGER product_flow_terminal_owner_immutable
  BEFORE UPDATE ON product_flow_entitlement_owners
  FOR EACH ROW EXECUTE FUNCTION protect_product_flow_terminal_owner();

CREATE TABLE IF NOT EXISTS product_flow_stripe_checkout_attempts (
  environment TEXT NOT NULL CHECK (environment = 'test'),
  attempt_ref TEXT NOT NULL
    CHECK (attempt_ref ~ '^pf_[A-Za-z0-9_-]{16,64}$'),
  product_id TEXT NOT NULL CHECK (product_id = 'prism-signals'),
  subject_ref TEXT NOT NULL
    CHECK (subject_ref ~ '^pf_[A-Za-z0-9_-]{16,64}$'),
  entitlement_ref TEXT NOT NULL
    CHECK (entitlement_ref ~ '^pf_[A-Za-z0-9_-]{16,64}$'),
  offer_id TEXT NOT NULL CHECK (offer_id = 'prism-signals-all'),
  offer_version INTEGER NOT NULL CHECK (offer_version = 1),
  generation INTEGER NOT NULL CHECK (generation > 0),
  price_ref TEXT NOT NULL
    CHECK (price_ref ~ '^pf_[A-Za-z0-9_-]{16,64}$'),
  stripe_price_id TEXT NOT NULL
    CHECK (stripe_price_id ~ '^price_[A-Za-z0-9]{8,64}$'),
  stripe_customer_id TEXT
    CHECK (
      stripe_customer_id IS NULL
      OR stripe_customer_id ~ '^cus_[A-Za-z0-9]{8,64}$'
    ),
  status TEXT NOT NULL
    CHECK (status IN (
      'reserved',
      'checkout_open',
      'completed',
      'expired',
      'failed',
      'superseded',
      'requires_review'
    )),
  idempotency_key TEXT NOT NULL
    CHECK (idempotency_key ~ '^prism:test:pf_[A-Za-z0-9_-]{16,64}$')
    CHECK (char_length(idempotency_key) <= 96),
  checkout_started_event JSONB NOT NULL
    CHECK (jsonb_typeof(checkout_started_event) = 'object')
    CHECK (
      checkout_started_event ?& ARRAY[
        'schema',
        'event_id',
        'environment',
        'type',
        'occurred_at',
        'entitlement_ref',
        'subject_ref',
        'offer_id',
        'offer_version',
        'channel',
        'rail',
        'price_ref'
      ]::TEXT[]
    )
    CHECK (
      checkout_started_event - ARRAY[
        'schema',
        'event_id',
        'environment',
        'type',
        'occurred_at',
        'entitlement_ref',
        'subject_ref',
        'offer_id',
        'offer_version',
        'channel',
        'rail',
        'price_ref'
      ]::TEXT[] = '{}'::JSONB
    )
    CHECK (
      checkout_started_event->>'schema'
        IS NOT DISTINCT FROM 'cambridgetcg.product-entitlement-event/1'
    )
    CHECK (checkout_started_event->>'environment' IS NOT DISTINCT FROM environment)
    CHECK (checkout_started_event->>'event_id' ~ '^pf_[A-Za-z0-9_-]{16,64}$')
    CHECK (checkout_started_event->>'entitlement_ref' IS NOT DISTINCT FROM entitlement_ref)
    CHECK (checkout_started_event->>'subject_ref' IS NOT DISTINCT FROM subject_ref)
    CHECK (checkout_started_event->>'offer_id' IS NOT DISTINCT FROM offer_id)
    CHECK (checkout_started_event->'offer_version' IS NOT DISTINCT FROM TO_JSONB(offer_version))
    CHECK (checkout_started_event->>'type' IS NOT DISTINCT FROM 'checkout_started')
    CHECK (checkout_started_event->>'channel' IS NOT DISTINCT FROM 'web')
    CHECK (checkout_started_event->>'rail' IS NOT DISTINCT FROM 'stripe_web')
    CHECK (checkout_started_event->>'price_ref' IS NOT DISTINCT FROM price_ref)
    CHECK (octet_length(checkout_started_event::TEXT) <= 8192),
  checkout_params JSONB NOT NULL
    CHECK (jsonb_typeof(checkout_params) = 'object')
    CHECK (
      checkout_params ?& ARRAY[
        'mode',
        'payment_method_types',
        'client_reference_id',
        'line_items',
        'success_url',
        'cancel_url',
        'expires_at',
        'metadata',
        'subscription_data'
      ]::TEXT[]
    )
    CHECK (
      checkout_params - ARRAY[
        'mode',
        'payment_method_types',
        'client_reference_id',
        'line_items',
        'success_url',
        'cancel_url',
        'expires_at',
        'metadata',
        'subscription_data',
        'customer'
      ]::TEXT[] = '{}'::JSONB
    )
    CHECK (checkout_params->>'mode' IS NOT DISTINCT FROM 'subscription')
    CHECK (
      checkout_params->'payment_method_types' IS NOT DISTINCT FROM '["card"]'::JSONB
    )
    CHECK (checkout_params->>'client_reference_id' IS NOT DISTINCT FROM attempt_ref)
    CHECK (
      checkout_params->'metadata' IS NOT DISTINCT FROM
        JSONB_BUILD_OBJECT(
          'type', 'prism_signals_all_test_v1',
          'attempt_ref', attempt_ref
        )
    )
    CHECK (
      checkout_params#>'{subscription_data,metadata}' IS NOT DISTINCT FROM
        JSONB_BUILD_OBJECT(
          'type', 'prism_signals_all_test_v1',
          'attempt_ref', attempt_ref
        )
    )
    CHECK (
      (checkout_params->'subscription_data') - 'metadata' = '{}'::JSONB
    )
    CHECK (jsonb_array_length(checkout_params->'line_items') = 1)
    CHECK (
      checkout_params#>>'{line_items,0,price}' IS NOT DISTINCT FROM stripe_price_id
    )
    CHECK (
      checkout_params#>'{line_items,0,quantity}' IS NOT DISTINCT FROM '1'::JSONB
    )
    CHECK (
      (checkout_params#>'{line_items,0}') - ARRAY['price', 'quantity']::TEXT[]
        = '{}'::JSONB
    )
    CHECK (checkout_params->>'success_url' ~ '^https://[^[:space:]]+$')
    CHECK (char_length(checkout_params->>'success_url') BETWEEN 9 AND 2048)
    CHECK (checkout_params->>'cancel_url' ~ '^https://[^[:space:]]+$')
    CHECK (char_length(checkout_params->>'cancel_url') BETWEEN 9 AND 2048)
    CHECK (
      checkout_params->'expires_at'
        IS NOT DISTINCT FROM TO_JSONB(EXTRACT(EPOCH FROM provider_expires_at)::BIGINT)
    )
    CHECK (
      (checkout_params ? 'customer') = (stripe_customer_id IS NOT NULL)
    )
    CHECK (
      NOT (checkout_params ? 'customer')
      OR checkout_params->>'customer' IS NOT DISTINCT FROM stripe_customer_id
    )
    CHECK (octet_length(checkout_params::TEXT) <= 16384),
  stripe_session_id TEXT
    CHECK (
      stripe_session_id IS NULL
      OR stripe_session_id ~ '^cs_test_[A-Za-z0-9]{8,128}$'
    ),
  provider_expires_at TIMESTAMPTZ(3) NOT NULL,
  review_reason TEXT
    CHECK (
      review_reason IS NULL
      OR (
        review_reason ~ '^[a-z][a-z0-9_]{0,95}$'
        AND char_length(review_reason) <= 96
      )
    ),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (environment, attempt_ref),
  UNIQUE (environment, idempotency_key),
  UNIQUE (environment, stripe_session_id),
  FOREIGN KEY (environment, entitlement_ref)
    REFERENCES product_flow_entitlement_owners(environment, entitlement_ref)
    ON DELETE CASCADE,
  FOREIGN KEY (environment, product_id, subject_ref, stripe_customer_id)
    REFERENCES product_flow_account_subjects(
      environment,
      product_id,
      subject_ref,
      stripe_customer_id
    )
    ON DELETE CASCADE,
  CHECK (created_at < provider_expires_at),
  CHECK (created_at <= updated_at),
  CHECK ((status = 'requires_review') = (review_reason IS NOT NULL)),
  CHECK (
    (status = 'reserved' AND stripe_session_id IS NULL)
    OR (status <> 'reserved')
  ),
  CHECK (
    status NOT IN ('checkout_open', 'completed')
    OR stripe_session_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prism_stripe_one_blocking_checkout
  ON product_flow_stripe_checkout_attempts(environment, entitlement_ref)
  WHERE status IN ('reserved', 'checkout_open', 'requires_review');

COMMENT ON TABLE product_flow_stripe_checkout_attempts IS
  'Frozen PRISM Checkout intent created before any Stripe network call. Exact request parameters and a stable idempotency key are reused under lock; metadata contains only type plus random opaque attempt_ref.';

CREATE TABLE IF NOT EXISTS product_flow_stripe_event_receipts (
  environment TEXT NOT NULL CHECK (environment = 'test'),
  stripe_event_id TEXT NOT NULL
    CHECK (stripe_event_id ~ '^evt_[A-Za-z0-9]{8,128}$'),
  stripe_account_id TEXT NOT NULL
    CHECK (stripe_account_id ~ '^acct_[A-Za-z0-9]{8,64}$'),
  api_version TEXT NOT NULL CHECK (api_version = '2026-02-25.clover'),
  event_type TEXT NOT NULL
    CHECK (event_type ~ '^[a-z][a-z0-9_.]{0,127}$'),
  livemode BOOLEAN NOT NULL CHECK (livemode = FALSE),
  payload_sha256 TEXT NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  provider_created_at TIMESTAMPTZ(3) NOT NULL,
  received_at TIMESTAMPTZ(3) NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'processing'
    CHECK (outcome IN ('processing', 'processed', 'ignored', 'requires_review')),
  outcome_code TEXT
    CHECK (
      outcome_code IS NULL
      OR outcome_code ~ '^[a-z][a-z0-9_]{0,95}$'
    ),
  outcome_payload JSONB
    CHECK (outcome_payload IS NULL OR jsonb_typeof(outcome_payload) = 'object')
    CHECK (outcome_payload IS NULL OR octet_length(outcome_payload::TEXT) <= 8192),
  completed_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (environment, stripe_event_id),
  CHECK (provider_created_at <= received_at + INTERVAL '5 minutes'),
  CHECK (
    (outcome = 'processing' AND outcome_code IS NULL AND completed_at IS NULL)
    OR
    (outcome <> 'processing' AND outcome_code IS NOT NULL AND completed_at IS NOT NULL)
  ),
  CHECK (completed_at IS NULL OR received_at <= completed_at)
);

CREATE INDEX IF NOT EXISTS idx_prism_stripe_receipts_review
  ON product_flow_stripe_event_receipts(environment, outcome, received_at)
  WHERE outcome = 'requires_review';

COMMENT ON TABLE product_flow_stripe_event_receipts IS
  'Signed, test-only Stripe event receipts. Raw provider JSON is not retained: its digest binds exact duplicate delivery while bounded outcomes make ignored or review-required events durable.';

CREATE TABLE IF NOT EXISTS product_flow_stripe_subscriptions (
  environment TEXT NOT NULL CHECK (environment = 'test'),
  stripe_subscription_id TEXT NOT NULL
    CHECK (stripe_subscription_id ~ '^sub_[A-Za-z0-9]{8,128}$'),
  stripe_customer_id TEXT NOT NULL
    CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9]{8,64}$'),
  product_id TEXT NOT NULL CHECK (product_id = 'prism-signals'),
  subject_ref TEXT NOT NULL
    CHECK (subject_ref ~ '^pf_[A-Za-z0-9_-]{16,64}$'),
  entitlement_ref TEXT NOT NULL
    CHECK (entitlement_ref ~ '^pf_[A-Za-z0-9_-]{16,64}$'),
  attempt_ref TEXT NOT NULL
    CHECK (attempt_ref ~ '^pf_[A-Za-z0-9_-]{16,64}$'),
  stripe_price_id TEXT NOT NULL
    CHECK (stripe_price_id ~ '^price_[A-Za-z0-9]{8,64}$'),
  status TEXT NOT NULL CHECK (status IN (
    'incomplete',
    'incomplete_expired',
    'trialing',
    'active',
    'past_due',
    'canceled',
    'unpaid',
    'paused'
  )),
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  current_period_start TIMESTAMPTZ(3),
  current_period_end TIMESTAMPTZ(3),
  ended_at TIMESTAMPTZ(3),
  source_stripe_event_id TEXT NOT NULL,
  provider_updated_at TIMESTAMPTZ(3) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (environment, stripe_subscription_id),
  UNIQUE (environment, entitlement_ref),
  UNIQUE (environment, attempt_ref),
  FOREIGN KEY (environment, product_id, subject_ref, stripe_customer_id)
    REFERENCES product_flow_account_subjects(
      environment,
      product_id,
      subject_ref,
      stripe_customer_id
    ) ON DELETE CASCADE,
  FOREIGN KEY (environment, entitlement_ref)
    REFERENCES product_flow_entitlement_owners(environment, entitlement_ref)
    ON DELETE CASCADE,
  FOREIGN KEY (environment, attempt_ref)
    REFERENCES product_flow_stripe_checkout_attempts(environment, attempt_ref)
    ON DELETE CASCADE,
  FOREIGN KEY (environment, source_stripe_event_id)
    REFERENCES product_flow_stripe_event_receipts(environment, stripe_event_id)
    ON DELETE RESTRICT,
  CHECK (
    (current_period_start IS NULL AND current_period_end IS NULL)
    OR (
      current_period_start IS NOT NULL
      AND current_period_end IS NOT NULL
      AND current_period_start < current_period_end
    )
  ),
  CHECK (created_at <= updated_at)
);

CREATE INDEX IF NOT EXISTS idx_prism_stripe_subscription_owner
  ON product_flow_stripe_subscriptions(
    environment,
    product_id,
    subject_ref,
    updated_at DESC
  );

COMMENT ON TABLE product_flow_stripe_subscriptions IS
  'Server-only exact Stripe subscription binding for one immutable local entitlement generation. Status alone never grants access; only a validated paid invoice can append a product-flow grant.';

CREATE TABLE IF NOT EXISTS product_flow_stripe_invoice_grants (
  environment TEXT NOT NULL CHECK (environment = 'test'),
  stripe_invoice_id TEXT NOT NULL
    CHECK (stripe_invoice_id ~ '^in_[A-Za-z0-9]{8,128}$'),
  stripe_subscription_id TEXT NOT NULL
    CHECK (stripe_subscription_id ~ '^sub_[A-Za-z0-9]{8,128}$'),
  entitlement_ref TEXT NOT NULL
    CHECK (entitlement_ref ~ '^pf_[A-Za-z0-9_-]{16,64}$'),
  stripe_price_id TEXT NOT NULL
    CHECK (stripe_price_id ~ '^price_[A-Za-z0-9]{8,64}$'),
  stripe_payment_intent_id TEXT NOT NULL
    CHECK (stripe_payment_intent_id ~ '^pi_[A-Za-z0-9]{8,128}$'),
  grant_kind TEXT NOT NULL CHECK (grant_kind IN ('initial', 'renewal')),
  currency TEXT NOT NULL CHECK (currency = 'gbp'),
  amount_paid_minor INTEGER NOT NULL CHECK (amount_paid_minor = 500),
  quantity INTEGER NOT NULL CHECK (quantity = 1),
  period_start TIMESTAMPTZ(3) NOT NULL,
  period_end TIMESTAMPTZ(3) NOT NULL,
  payment_ref TEXT NOT NULL
    CHECK (payment_ref ~ '^pf_[A-Za-z0-9_-]{16,64}$'),
  grant_event_id TEXT NOT NULL
    CHECK (grant_event_id ~ '^pf_[A-Za-z0-9_-]{16,64}$'),
  source_stripe_event_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'granted'
    CHECK (state IN ('granted', 'refunded')),
  refund_event_id TEXT
    CHECK (
      refund_event_id IS NULL
      OR refund_event_id ~ '^pf_[A-Za-z0-9_-]{16,64}$'
    ),
  refund_stripe_event_id TEXT,
  stripe_refund_id TEXT
    CHECK (
      stripe_refund_id IS NULL
      OR stripe_refund_id ~ '^re_[A-Za-z0-9]{8,128}$'
    ),
  granted_at TIMESTAMPTZ(3) NOT NULL,
  refunded_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (environment, stripe_invoice_id),
  UNIQUE (environment, payment_ref),
  UNIQUE (environment, grant_event_id),
  UNIQUE (environment, refund_event_id),
  UNIQUE (environment, stripe_payment_intent_id),
  FOREIGN KEY (environment, stripe_subscription_id)
    REFERENCES product_flow_stripe_subscriptions(environment, stripe_subscription_id)
    ON DELETE CASCADE,
  FOREIGN KEY (environment, source_stripe_event_id)
    REFERENCES product_flow_stripe_event_receipts(environment, stripe_event_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (environment, grant_event_id)
    REFERENCES product_flow_events(environment, event_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (environment, refund_event_id)
    REFERENCES product_flow_events(environment, event_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (environment, refund_stripe_event_id)
    REFERENCES product_flow_stripe_event_receipts(environment, stripe_event_id)
    ON DELETE RESTRICT,
  CHECK (period_start < period_end),
  CHECK (period_start <= granted_at),
  CHECK (created_at <= updated_at),
  CHECK (
    (state = 'granted' AND refund_event_id IS NULL
      AND refund_stripe_event_id IS NULL AND stripe_refund_id IS NULL
      AND refunded_at IS NULL)
    OR
    (state = 'refunded' AND refund_event_id IS NOT NULL
      AND refund_stripe_event_id IS NOT NULL AND stripe_refund_id IS NOT NULL
      AND refunded_at IS NOT NULL)
  ),
  CHECK (refunded_at IS NULL OR granted_at <= refunded_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prism_stripe_refund_once
  ON product_flow_stripe_invoice_grants(environment, stripe_refund_id)
  WHERE stripe_refund_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prism_stripe_grants_entitlement_period
  ON product_flow_stripe_invoice_grants(
    environment,
    entitlement_ref,
    period_end DESC
  );

COMMENT ON TABLE product_flow_stripe_invoice_grants IS
  'One exact validated paid Stripe invoice per product-flow grant. Raw provider ids remain in this server-only correlation table; generic events contain only HMAC-derived references.';
