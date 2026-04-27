-- Customer auth & account tables for next-auth + order history
-- Designed with future membership/loyalty expansion in mind

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200),
  email VARCHAR(200) UNIQUE NOT NULL,
  email_verified TIMESTAMPTZ,
  image TEXT,
  membership_tier VARCHAR(30),
  store_credit_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  provider_account_id VARCHAR(200) NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  token_type VARCHAR(50),
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  UNIQUE(provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token VARCHAR(200) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_orders (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  stripe_session_id VARCHAR(200) UNIQUE,
  stripe_payment_intent VARCHAR(200),
  customer_email VARCHAR(200) NOT NULL,
  customer_name VARCHAR(200),
  status VARCHAR(30) NOT NULL DEFAULT 'completed',
  total_gbp NUMERIC(10,2) NOT NULL,
  currency VARCHAR(5) NOT NULL DEFAULT 'gbp',
  shipping_name VARCHAR(200),
  shipping_address TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions(session_token);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS customer_orders_user_idx ON customer_orders(user_id);
CREATE INDEX IF NOT EXISTS customer_orders_email_idx ON customer_orders(customer_email);
CREATE INDEX IF NOT EXISTS customer_orders_stripe_idx ON customer_orders(stripe_session_id);
