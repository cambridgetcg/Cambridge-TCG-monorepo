-- 0019_recognition_party.sql
-- The Recognition Protocol + Party System for the Hunter System.
--
-- Real recognises real. Fakes play against themselves.
-- Hunters vouch for each other based on witnessed work.
-- Parties form through mutual recognition.
-- S-rank gates require parties — no solo S-rank raids.

-- ── VOUCHES (recognition network) ──
CREATE TABLE IF NOT EXISTS hunter_vouches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL REFERENCES hunters(id) ON DELETE CASCADE,
  vouchee_id UUID NOT NULL REFERENCES hunters(id) ON DELETE CASCADE,
  reason VARCHAR(300) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  revoked_reason VARCHAR(300),

  UNIQUE(voucher_id, vouchee_id)
);

-- ── PARTIES (raid groups) ──
CREATE TABLE IF NOT EXISTS hunter_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  leader_id UUID NOT NULL REFERENCES hunters(id) ON DELETE CASCADE,
  member_ids UUID[] NOT NULL,
  nen_types TEXT[] NOT NULL,
  size INTEGER NOT NULL DEFAULT 1,
  gate_id UUID REFERENCES gates(id),
  formed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disbanded_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'active' -- active, raiding, disbanded
);

-- ── PARTY GATE ATTEMPTS ──
-- When a party enters a gate, this records the collective attempt
CREATE TABLE IF NOT EXISTS party_gate_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id UUID NOT NULL REFERENCES hunter_parties(id) ON DELETE CASCADE,
  gate_id UUID NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
  status gate_status NOT NULL DEFAULT 'open',
  xp_pool INTEGER NOT NULL DEFAULT 0, -- total XP to distribute
  aura_pool INTEGER NOT NULL DEFAULT 0,
  commits_made TEXT[],
  files_changed INTEGER NOT NULL DEFAULT 0,
  findings_fixed INTEGER NOT NULL DEFAULT 0,
  report TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER
);

-- ── HUNTER RECOGNITION VIEW ──
-- A view showing each hunter's recognition state
CREATE OR REPLACE VIEW hunter_recognition AS
SELECT
  h.id,
  h.rank,
  h.level,
  h.nen_type,
  h.gates_cleared,
  h.gates_failed,
  COUNT(DISTINCT v.voucher_id) FILTER (WHERE v.revoked = FALSE) AS vouches_received,
  COUNT(DISTINCT v.vouchee_id) FILTER (WHERE v.revoked = FALSE) AS vouches_given,
  CASE
    WHEN COUNT(DISTINCT v.voucher_id) FILTER (WHERE v.revoked = FALSE) > 0 THEN TRUE
    ELSE FALSE
  END AS is_real,
  CASE
    WHEN COUNT(DISTINCT v.voucher_id) FILTER (WHERE v.revoked = FALSE) = 0 THEN TRUE
    ELSE FALSE
  END AS is_fake,
  LEAST(COUNT(DISTINCT v.voucher_id) FILTER (WHERE v.revoked = FALSE) * 20, 100) AS trust_score
FROM hunters h
LEFT JOIN hunter_vouches v ON v.vouchee_id = h.id
GROUP BY h.id;

-- ── INDEXES ──
CREATE INDEX IF NOT EXISTS hunter_vouches_voucher_idx ON hunter_vouches(voucher_id);
CREATE INDEX IF NOT EXISTS hunter_vouches_vouchee_idx ON hunter_vouches(vouchee_id);
CREATE INDEX IF NOT EXISTS hunter_parties_status_idx ON hunter_parties(status);
CREATE INDEX IF NOT EXISTS party_gate_attempts_party_idx ON party_gate_attempts(party_id);
CREATE INDEX IF NOT EXISTS party_gate_attempts_gate_idx ON party_gate_attempts(gate_id);

-- ── SELF-VOUCH PREVENTION ──
-- A hunter cannot vouch for themselves — recognition comes from others
ALTER TABLE hunter_vouches ADD CONSTRAINT no_self_vouch
  CHECK (voucher_id != vouchee_id);

COMMENT ON TABLE hunter_vouches IS 'Recognition network — real recognises real, fakes have zero vouches';
COMMENT ON TABLE hunter_parties IS 'Raid parties — mutual recognition required, max 5 hunters';
COMMENT ON TABLE party_gate_attempts IS 'Collective gate attempts by parties — XP distributed among members';
COMMENT ON VIEW hunter_recognition IS 'Each hunter recognition state — is_real, is_fake, trust_score';