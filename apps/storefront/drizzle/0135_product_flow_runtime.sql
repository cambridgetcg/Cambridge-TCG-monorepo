-- 0135_product_flow_runtime.sql
--
-- Durable, provider-neutral product lifecycle storage and the deliberately
-- separate PRISM Signals closed-beta interest record. This migration does not
-- enable a payment rail, create access, connect a provider webhook, or turn a
-- beta request into an entitlement.

CREATE TABLE IF NOT EXISTS product_flow_events (
  sequence BIGSERIAL UNIQUE NOT NULL,
  environment TEXT NOT NULL
    CHECK (environment IN ('test', 'production')),
  event_id TEXT NOT NULL
    CHECK (event_id ~ '^pf_[A-Za-z0-9_-]{16,64}$'),
  entitlement_ref TEXT NOT NULL
    CHECK (entitlement_ref ~ '^pf_[A-Za-z0-9_-]{16,64}$'),
  subject_ref TEXT NOT NULL
    CHECK (subject_ref ~ '^pf_[A-Za-z0-9_-]{16,64}$'),
  offer_id TEXT NOT NULL
    CHECK (offer_id ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'),
  offer_version INTEGER NOT NULL CHECK (offer_version > 0),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'checkout_started',
    'browser_return',
    'precheckout_approved',
    'channel_linked',
    'payment_confirmed',
    'renewal_confirmed',
    'payment_failed',
    'cancel_at_period_end',
    'subscription_ended',
    'refunded',
    'revoked'
  )),
  occurred_at TIMESTAMPTZ NOT NULL,
  provider_event_ref TEXT
    CHECK (
      provider_event_ref IS NULL
      OR provider_event_ref ~ '^pf_[A-Za-z0-9_-]{16,64}$'
    ),
  rail TEXT CHECK (
    rail IS NULL
    OR rail IN ('stripe_web', 'telegram_stars', 'paypal_web', 'crypto_web')
  ),
  payment_ref TEXT CHECK (
    payment_ref IS NULL
    OR payment_ref ~ '^pf_[A-Za-z0-9_-]{16,64}$'
  ),
  CHECK (
    (event_type IN (
      'payment_confirmed',
      'renewal_confirmed',
      'payment_failed',
      'cancel_at_period_end',
      'subscription_ended',
      'refunded'
    )) = (provider_event_ref IS NOT NULL)
  ),
  CHECK (
    (event_type IN ('payment_confirmed', 'renewal_confirmed'))
      = (rail IS NOT NULL)
  ),
  CHECK (
    (event_type IN ('payment_confirmed', 'renewal_confirmed'))
      = (payment_ref IS NOT NULL)
  ),
  event_payload JSONB NOT NULL
    CHECK (jsonb_typeof(event_payload) = 'object')
    CHECK (
      event_payload->>'schema'
        IS NOT DISTINCT FROM 'cambridgetcg.product-entitlement-event/1'
    )
    CHECK (event_payload->>'environment' IS NOT DISTINCT FROM environment)
    CHECK (event_payload->>'event_id' IS NOT DISTINCT FROM event_id)
    CHECK (
      event_payload->>'entitlement_ref' IS NOT DISTINCT FROM entitlement_ref
    )
    CHECK (event_payload->>'subject_ref' IS NOT DISTINCT FROM subject_ref)
    CHECK (event_payload->>'offer_id' IS NOT DISTINCT FROM offer_id)
    CHECK (
      event_payload->'offer_version' IS NOT DISTINCT FROM TO_JSONB(offer_version)
    )
    CHECK (event_payload->>'type' IS NOT DISTINCT FROM event_type)
    CHECK (
      (event_payload->>'occurred_at')::TIMESTAMPTZ
        IS NOT DISTINCT FROM occurred_at
    )
    CHECK (
      event_payload#>>'{evidence,provider_event_ref}'
        IS NOT DISTINCT FROM provider_event_ref
    )
    CHECK (
      event_type NOT IN ('payment_confirmed', 'renewal_confirmed')
      OR event_payload->>'rail' IS NOT DISTINCT FROM rail
    )
    CHECK (
      event_type NOT IN ('payment_confirmed', 'renewal_confirmed')
      OR event_payload#>>'{evidence,rail}' IS NOT DISTINCT FROM rail
    )
    CHECK (
      event_type NOT IN ('payment_confirmed', 'renewal_confirmed')
      OR event_payload#>>'{evidence,payment_ref}'
        IS NOT DISTINCT FROM payment_ref
    )
    CHECK (octet_length(event_payload::text) <= 65536),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (environment, event_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_flow_provider_event_once
  ON product_flow_events(environment, provider_event_ref)
  WHERE provider_event_ref IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_flow_payment_grant_once
  ON product_flow_events(environment, rail, payment_ref)
  WHERE event_type IN ('payment_confirmed', 'renewal_confirmed');

CREATE INDEX IF NOT EXISTS idx_product_flow_events_entitlement_order
  ON product_flow_events(environment, entitlement_ref, sequence);

COMMENT ON TABLE product_flow_events IS
  'Append-only accepted product-flow events. Rows are not payment-provider authentication; a host must verify provider evidence before applying an event.';
COMMENT ON COLUMN product_flow_events.provider_event_ref IS
  'Package-scoped opaque provider-event reference used for durable idempotency; never a raw provider object id.';
COMMENT ON COLUMN product_flow_events.payment_ref IS
  'Opaque semantic grant identity populated only for payment/renewal confirmations. Unique with environment and rail; never a raw provider object id.';

CREATE OR REPLACE FUNCTION reject_product_flow_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'product flow events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS product_flow_events_no_update
  ON product_flow_events;
CREATE TRIGGER product_flow_events_no_update
  BEFORE UPDATE ON product_flow_events
  FOR EACH ROW EXECUTE FUNCTION reject_product_flow_event_mutation();

DROP TRIGGER IF EXISTS product_flow_events_no_delete
  ON product_flow_events;
CREATE TRIGGER product_flow_events_no_delete
  BEFORE DELETE ON product_flow_events
  FOR EACH ROW EXECUTE FUNCTION reject_product_flow_event_mutation();

CREATE TABLE IF NOT EXISTS product_flow_entitlement_snapshots (
  environment TEXT NOT NULL
    CHECK (environment IN ('test', 'production')),
  entitlement_ref TEXT NOT NULL
    CHECK (entitlement_ref ~ '^pf_[A-Za-z0-9_-]{16,64}$'),
  subject_ref TEXT NOT NULL
    CHECK (subject_ref ~ '^pf_[A-Za-z0-9_-]{16,64}$'),
  offer_id TEXT NOT NULL
    CHECK (offer_id ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'),
  offer_version INTEGER NOT NULL CHECK (offer_version > 0),
  last_event_id TEXT
    CHECK (
      last_event_id IS NULL
      OR last_event_id ~ '^pf_[A-Za-z0-9_-]{16,64}$'
    ),
  applied_event_count INTEGER NOT NULL DEFAULT 0
    CHECK (applied_event_count >= 0),
  snapshot_payload JSONB NOT NULL
    CHECK (jsonb_typeof(snapshot_payload) = 'object')
    CHECK (
      snapshot_payload->>'schema'
        IS NOT DISTINCT FROM 'cambridgetcg.product-entitlement/1'
    )
    CHECK (snapshot_payload->>'environment' IS NOT DISTINCT FROM environment)
    CHECK (
      snapshot_payload->>'entitlement_ref'
        IS NOT DISTINCT FROM entitlement_ref
    )
    CHECK (snapshot_payload->>'subject_ref' IS NOT DISTINCT FROM subject_ref)
    CHECK (snapshot_payload->>'offer_id' IS NOT DISTINCT FROM offer_id)
    CHECK (
      snapshot_payload->'offer_version'
        IS NOT DISTINCT FROM TO_JSONB(offer_version)
    )
    CHECK (
      snapshot_payload->>'last_event_id' IS NOT DISTINCT FROM last_event_id
    )
    CHECK (octet_length(snapshot_payload::text) <= 65536),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (environment, entitlement_ref),
  UNIQUE (environment, last_event_id)
);

CREATE INDEX IF NOT EXISTS idx_product_flow_snapshots_subject_offer
  ON product_flow_entitlement_snapshots(
    environment,
    subject_ref,
    offer_id,
    offer_version
  );

COMMENT ON TABLE product_flow_entitlement_snapshots IS
  'Current projection for one product entitlement. The runtime updates it in the same transaction that appends the accepted event.';

CREATE TABLE IF NOT EXISTS product_beta_interests (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL
    CHECK (product_id ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$')
    CHECK (char_length(product_id) <= 96),
  channel_preferences TEXT[] NOT NULL CHECK (
    channel_preferences IN (
      ARRAY['web']::TEXT[],
      ARRAY['telegram']::TEXT[],
      ARRAY['web', 'telegram']::TEXT[]
    )
  ) CHECK (array_position(channel_preferences, NULL) IS NULL),
  consent_version TEXT NOT NULL
    CHECK (char_length(consent_version) BETWEEN 1 AND 96),
  requested_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at TIMESTAMPTZ(3) NOT NULL,
  CHECK (requested_at <= updated_at),
  CHECK (updated_at < expires_at),
  PRIMARY KEY (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_beta_interests_review
  ON product_beta_interests(expires_at, product_id);

COMMENT ON TABLE product_beta_interests IS
  'Revocable product-specific beta contact request. Presence is interest only: not access, payment, an invitation, queue position, or general marketing consent.';
COMMENT ON COLUMN product_beta_interests.channel_preferences IS
  'Preferred eventual product surfaces only. Telegram preference does not authorise Telegram outreach or create an account link.';
COMMENT ON COLUMN product_beta_interests.consent_version IS
  'Version of the specific Cambridge TCG PRISM beta invitation/status contact wording affirmatively accepted by the signed-in account.';
COMMENT ON COLUMN product_beta_interests.expires_at IS
  'Hard active-interest boundary, refreshed only by a new affirmative owner POST. A daily authenticated sweep deletes expired rows.';
