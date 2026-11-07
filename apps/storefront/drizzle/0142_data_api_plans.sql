-- Data-API plans, Stripe test mode only. This migration configures no
-- credential, opens no checkout and grants no entitlement by itself; the plan
-- catalogue lives in code (src/lib/data-api/plans.ts). An account is on the
-- free plan unless it holds a subscription row Stripe reports active or
-- trialing whose paid period has not ended (the rule in
-- src/lib/data-api/entitlements.ts).
-- Metering is aggregate only: a count per key per minute and per account per
-- month. No table here holds a request path, query, IP address or read history.

-- Idempotency: a Stripe event is handled at most once. Raw payloads are not kept.
CREATE TABLE data_api_stripe_events (
  stripe_event_id text PRIMARY KEY CHECK (stripe_event_id ~ '^evt_[A-Za-z0-9]{8,128}$'),
  environment text NOT NULL CHECK (environment = 'test'),
  event_type text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.]{0,127}$'),
  livemode boolean NOT NULL CHECK (livemode = false),
  provider_created_at timestamptz NOT NULL,
  -- What the webhook did with the event: applied it to a subscription row, or
  -- ignored it for the reason the code names (another product's object, an
  -- older state than the row holds, a customer no account holds). The code is
  -- a short slug, never provider text.
  outcome text NOT NULL CHECK (outcome IN ('applied', 'ignored')),
  outcome_code text NOT NULL CHECK (outcome_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  received_at timestamptz NOT NULL DEFAULT now()
);

-- One Stripe customer per account, created at the account's first checkout
-- and reused for every later subscription. A customer belongs to one account.
CREATE TABLE data_api_customers (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL UNIQUE CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9]{8,64}$'),
  environment text NOT NULL CHECK (environment = 'test'),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- The pair the subscriptions' foreign key names.
  UNIQUE (user_id, stripe_customer_id)
);

-- One row per Stripe subscription, written only from verified events. An
-- account holds many over time, all under its one customer: the foreign key
-- on (user_id, stripe_customer_id) is that account's customer row, so a
-- subscription can never sit under another account's customer.
CREATE TABLE data_api_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL CHECK (environment = 'test'),
  user_id uuid NOT NULL,
  plan_id text NOT NULL CHECK (plan_id IN ('pro','business')),
  status text NOT NULL CHECK (status IN (
    'incomplete', 'incomplete_expired', 'trialing', 'active',
    'past_due', 'canceled', 'unpaid', 'paused'
  )),
  stripe_customer_id text NOT NULL,
  stripe_subscription_id text NOT NULL UNIQUE CHECK (stripe_subscription_id ~ '^sub_[A-Za-z0-9]{8,128}$'),
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  -- The event that last wrote this row, and Stripe's time for it: an older
  -- event arriving late must not overwrite newer state.
  last_stripe_event_id text NOT NULL REFERENCES data_api_stripe_events(stripe_event_id),
  provider_updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, stripe_customer_id) REFERENCES data_api_customers (user_id, stripe_customer_id) ON DELETE CASCADE,
  CHECK (created_at <= updated_at)
);
CREATE INDEX data_api_subscriptions_owner ON data_api_subscriptions (user_id, updated_at DESC);

-- Account deletion cascades users -> data_api_customers -> data_api_subscriptions,
-- and waits until Stripe reports each subscription ended, so a recurring test
-- subscription is never orphaned. Deleting a customer row directly meets the
-- same guard.
CREATE FUNCTION data_api_subscription_erasure_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status NOT IN ('canceled', 'incomplete_expired') THEN
    RAISE EXCEPTION 'cannot erase a data-API subscription before Stripe reports it ended' USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER data_api_subscription_erasure_guard BEFORE DELETE ON data_api_subscriptions
  FOR EACH ROW EXECUTE FUNCTION data_api_subscription_erasure_guard();

-- Requests per account per calendar month (UTC month start). Nothing else.
CREATE TABLE data_api_usage_months (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month date NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  request_count integer NOT NULL CHECK (request_count >= 0),
  PRIMARY KEY (user_id, month)
);

-- Data-API minute counts per key. The free member-prices route saturates its
-- own member_data_rate_buckets rows at LEAST(count + 1, 31); sharing them would
-- let one free read lower a paid key's count, so data-API counts live here and
-- member_data_rate_buckets is unchanged. Counts saturate one above the key's
-- plan limit (LEAST(count + 1, limit + 1)). The bound is a sanity ceiling, not
-- a plan limit: plans live in src/lib/data-api/plans.ts.
CREATE TABLE data_api_rate_buckets (
  key_id uuid NOT NULL REFERENCES member_data_keys(id) ON DELETE CASCADE,
  bucket_minute timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count BETWEEN 1 AND 100001),
  PRIMARY KEY (key_id, bucket_minute)
);
CREATE INDEX data_api_rate_buckets_cleanup ON data_api_rate_buckets (bucket_minute);

COMMENT ON TABLE data_api_stripe_events IS
  'Test-mode Stripe event ids the data-API webhook has handled, each with what it did: applied to data_api_subscriptions, or ignored and why. Raw provider payloads are not retained.';
COMMENT ON TABLE data_api_customers IS
  'Server-only binding of an account to its one test-mode Stripe customer, reused for every data-API subscription it holds.';
COMMENT ON TABLE data_api_subscriptions IS
  'Server-only binding of an account to one test-mode Stripe subscription. Status is mirrored from Stripe on verified events; the entitlement is the plan of a subscription in good standing (active or trialing, its paid period not yet ended), otherwise free.';
COMMENT ON TABLE data_api_usage_months IS
  'Aggregate request count per account per month. No paths, queries, IP addresses or read history.';
COMMENT ON TABLE data_api_rate_buckets IS
  'Data-API request count per key per minute, apart from the free member-prices buckets. No paths, queries, IP addresses or read history.';
