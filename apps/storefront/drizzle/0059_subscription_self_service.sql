-- Subscription self-service columns.
--
-- The Platinum subscription flow (migration 0021) gave users a way to
-- start a subscription via Stripe Checkout but no way to manage it
-- afterwards: the /account/membership "Manage Subscription" button
-- linked to /account/billing which doesn't exist, and we never stored
-- the Stripe customer id (Checkout creates a fresh customer per
-- session via customer_email, so subsequent operations couldn't even
-- find the right customer).
--
-- Add the columns we need to:
--   1. Track the canonical Stripe customer id per user
--   2. Surface "scheduled to cancel at period end" to the UI
--   3. Display payment method (last 4 + brand) without re-fetching
--      from Stripe on every page load
--   4. Mark the next billing date so the customer sees what's
--      coming up

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id              VARCHAR(200),
  ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_payment_brand     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS subscription_payment_last4     VARCHAR(4),
  ADD COLUMN IF NOT EXISTS subscription_plan              VARCHAR(20);  -- 'monthly' | 'annual'

CREATE INDEX IF NOT EXISTS idx_users_stripe_customer
  ON users(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_subscription_stripe
  ON users(subscription_stripe_id)
  WHERE subscription_stripe_id IS NOT NULL;

COMMIT;
