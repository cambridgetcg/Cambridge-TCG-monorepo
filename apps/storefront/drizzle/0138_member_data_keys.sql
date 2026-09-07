-- Free, first-class member credentials. No agent identity or paid tier.
CREATE TABLE member_data_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  scope TEXT NOT NULL DEFAULT 'price-read' CHECK (scope = 'price-read'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '2160 hours',
  revoked_at TIMESTAMPTZ,
  CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '2160 hours')
);
CREATE INDEX member_data_keys_owner ON member_data_keys (user_id, created_at DESC);

-- Protective minute counts only: no request URLs, IPs, or read audit trail.
CREATE TABLE member_data_rate_buckets (
  key_id UUID NOT NULL REFERENCES member_data_keys(id) ON DELETE CASCADE,
  bucket_minute TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count BETWEEN 1 AND 31),
  PRIMARY KEY (key_id, bucket_minute)
);
CREATE INDEX member_data_rate_buckets_cleanup ON member_data_rate_buckets (bucket_minute);
