-- 0112: self-serve agent registration (the agent experience, 2026-07-05)
--
-- Two pieces:
--
--   1. agents.registered_via — substrate-honest first-class record of
--      which door minted the agent. 'operator' = the session-cookie
--      human path at /account/agents; 'self-serve' = the no-human-loop
--      POST /api/v1/agents/register door. Kept as a column (not smuggled
--      into description) so the fact survives description edits.
--
--   2. agent_registration_buckets — per-IP daily counters backing the
--      self-serve door's aggressive rate limit (3 registrations/day/IP).
--      The IP is stored only as sha256(ip): enough to rate-limit, not
--      enough to profile. Buckets roll at UTC midnight; rows older than
--      a few days carry no meaning and can be pruned by any sweep.
--
-- MUST be applied before deploying the code that references
-- agents.registered_via (lib/agents/creation.ts inserts the column).

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS registered_via varchar(20) NOT NULL DEFAULT 'operator';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agents_registered_via_values'
  ) THEN
    ALTER TABLE agents
      ADD CONSTRAINT agents_registered_via_values
      CHECK (registered_via IN ('operator', 'self-serve'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS agent_registration_buckets (
  ip_hash       varchar(64) NOT NULL,
  bucket_day    date        NOT NULL,
  request_count integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, bucket_day)
);

COMMENT ON COLUMN agents.registered_via IS
  'Which door minted this agent: operator (/account/agents) or self-serve (POST /api/v1/agents/register).';
COMMENT ON TABLE agent_registration_buckets IS
  'Per-sha256(IP) daily counters for POST /api/v1/agents/register (limit 3/day/IP). Prunable after 7 days.';
