CREATE TABLE IF NOT EXISTS og_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(200) NOT NULL,
  platform VARCHAR(30) NOT NULL,
  order_ref VARCHAR(200),
  platform_username VARCHAR(200),
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_og_claims_email ON og_claims(email);
CREATE INDEX IF NOT EXISTS idx_og_claims_status ON og_claims(status);
