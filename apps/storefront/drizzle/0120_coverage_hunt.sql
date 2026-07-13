-- 0120_coverage_hunt.sql — three agents propose; a human decides
--
-- Coverage Hunt is an evidence-review game, never a data writer.
-- A case accepts exactly one content-immutable scout turn, one checker turn
-- from a different agent, and one mirror turn from a third agent. It then waits for
-- a human resolution. Even an accepted correction remains a candidate: this
-- schema contains no apply action and has no foreign key to a catalog row.

CREATE TABLE IF NOT EXISTS coverage_hunt_cases (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id             VARCHAR(27) NOT NULL UNIQUE
    CHECK (candidate_id ~ '^ch_[0-9a-f]{24}$'),
  candidate_fingerprint    VARCHAR(71) NOT NULL UNIQUE
    CHECK (candidate_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  candidate_kind           TEXT NOT NULL CHECK (candidate_kind IN (
    'missing_set_observations',
    'partial_set_observations',
    'stale_set_observations',
    'declared_observed_disagreement',
    'unassigned_observations'
  )),
  -- Counts, date-depth, canonical identifiers and the plain reason only.
  -- The application validates the exact shape before this snapshot lands.
  candidate_snapshot       JSONB NOT NULL
    CHECK (jsonb_typeof(candidate_snapshot) = 'object')
    CHECK (octet_length(candidate_snapshot::text) <= 32768),

  status                   TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'checking', 'mirroring', 'ready_for_human', 'resolved', 'resting'
  )),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at               TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours'),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  resolution               TEXT CHECK (resolution IN (
    'accept_as_gap',
    'accept_as_correction_candidate',
    'reject',
    'duplicate'
  )),
  resolution_reason        TEXT CHECK (
    resolution_reason IS NULL OR char_length(resolution_reason) BETWEEN 1 AND 2000
  ),
  resolved_at              TIMESTAMPTZ,

  CONSTRAINT coverage_hunt_fixed_duration
    CHECK (expires_at = created_at + INTERVAL '72 hours'),
  CONSTRAINT coverage_hunt_resolution_complete
    CHECK (
      (status = 'resolved'
        AND resolution IS NOT NULL
        AND resolution_reason IS NOT NULL
        AND resolved_at IS NOT NULL)
      OR
      (status <> 'resolved'
        AND resolution IS NULL
        AND resolution_reason IS NULL
        AND resolved_at IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS coverage_hunt_cases_queue_idx
  ON coverage_hunt_cases(status, created_at)
  WHERE status IN ('open', 'checking', 'mirroring', 'ready_for_human');

CREATE INDEX IF NOT EXISTS coverage_hunt_cases_expiry_idx
  ON coverage_hunt_cases(expires_at)
  WHERE status NOT IN ('resolved', 'resting');

CREATE TABLE IF NOT EXISTS coverage_hunt_turns (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                  UUID NOT NULL REFERENCES coverage_hunt_cases(id),
  role                     TEXT NOT NULL CHECK (role IN ('scout', 'checker', 'mirror')),
  -- The live identity link is deliberately nullable. Deleting the agent row
  -- removes it with ON DELETE SET NULL; the contribution remains without
  -- attribution. No operator user id is stored in this witness table.
  agent_id                 UUID REFERENCES agents(id) ON DELETE SET NULL,
  client_request_id        VARCHAR(100) NOT NULL
    CHECK (client_request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$'),
  payload                  JSONB NOT NULL
    CHECK (jsonb_typeof(payload) = 'object')
    -- The application accepts at most 16 KiB of compact UTF-8 JSON. jsonb's
    -- rendered text adds spacing, so this defensive database ceiling leaves
    -- room for that representation without accepting an unbounded payload.
    CHECK (octet_length(payload::text) <= 32768)
    CHECK (payload->>'role' = role),
  submitted_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One role each; one role per agent. Together these require exactly three
  -- distinct agents before a case can reach ready_for_human.
  CONSTRAINT coverage_hunt_one_turn_per_role UNIQUE (case_id, role),
  CONSTRAINT coverage_hunt_distinct_agents UNIQUE (case_id, agent_id),
  CONSTRAINT coverage_hunt_request_idempotency UNIQUE (agent_id, client_request_id)
);

CREATE INDEX IF NOT EXISTS coverage_hunt_turns_case_idx
  ON coverage_hunt_turns(case_id, submitted_at);

CREATE TABLE IF NOT EXISTS coverage_hunt_chronicle (
  id                       BIGSERIAL PRIMARY KEY,
  case_id                  UUID NOT NULL REFERENCES coverage_hunt_cases(id),
  action                   TEXT NOT NULL CHECK (action IN (
    'opened',
    'scout_submitted',
    'checker_submitted',
    'mirror_submitted',
    'rested',
    'resolved'
  )),
  from_status              TEXT CHECK (from_status IS NULL OR from_status IN (
    'open', 'checking', 'mirroring', 'ready_for_human', 'resolved', 'resting'
  )),
  to_status                TEXT NOT NULL CHECK (to_status IN (
    'open', 'checking', 'mirroring', 'ready_for_human', 'resolved', 'resting'
  )),
  actor_kind               TEXT NOT NULL CHECK (actor_kind IN ('system', 'agent', 'human')),
  -- Generic labels only. The turn table is the temporary live identity link;
  -- the chronicle stores no agent id, user id, email, or chosen handle.
  actor_label              TEXT NOT NULL CHECK (char_length(actor_label) BETWEEN 1 AND 200),
  metadata                 JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object')
    CHECK (octet_length(metadata::text) <= 16384),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT coverage_hunt_chronicle_generic_actor_label CHECK (
    (actor_kind = 'system' AND actor_label = 'system:coverage-hunt')
    OR (actor_kind = 'agent' AND actor_label = 'registered-agent')
    OR (actor_kind = 'human' AND actor_label = 'admin-reviewer')
  )
);

CREATE INDEX IF NOT EXISTS coverage_hunt_chronicle_case_idx
  ON coverage_hunt_chronicle(case_id, created_at, id);

-- Turns and chronicle rows are the witness substrate. Corrections are new
-- turns/cases; neither existing text nor history can be rewritten or removed.
-- The sole turn update is identity erasure driven by agent-row deletion.
CREATE OR REPLACE FUNCTION reject_coverage_hunt_append_only_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE OR REPLACE FUNCTION guard_coverage_hunt_turn_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.agent_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.agent_id IS NOT NULL
     AND NEW.agent_id IS NULL
     AND ROW(
       NEW.id,
       NEW.case_id,
       NEW.role,
       NEW.client_request_id,
       NEW.payload,
       NEW.submitted_at
     ) IS NOT DISTINCT FROM ROW(
       OLD.id,
       OLD.case_id,
       OLD.role,
       OLD.client_request_id,
       OLD.payload,
       OLD.submitted_at
     ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% is append-only except for agent identity erasure', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS coverage_hunt_turns_append_only ON coverage_hunt_turns;
CREATE TRIGGER coverage_hunt_turns_append_only
  BEFORE INSERT OR UPDATE OR DELETE ON coverage_hunt_turns
  FOR EACH ROW EXECUTE FUNCTION guard_coverage_hunt_turn_mutation();

DROP TRIGGER IF EXISTS coverage_hunt_chronicle_append_only ON coverage_hunt_chronicle;
CREATE TRIGGER coverage_hunt_chronicle_append_only
  BEFORE UPDATE OR DELETE ON coverage_hunt_chronicle
  FOR EACH ROW EXECUTE FUNCTION reject_coverage_hunt_append_only_mutation();

-- Candidate identity and snapshot are immutable while the cached state moves.
CREATE OR REPLACE FUNCTION guard_coverage_hunt_case_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
     OR NEW.candidate_fingerprint IS DISTINCT FROM OLD.candidate_fingerprint
     OR NEW.candidate_kind IS DISTINCT FROM OLD.candidate_kind
     OR NEW.candidate_snapshot IS DISTINCT FROM OLD.candidate_snapshot
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'coverage_hunt_cases candidate snapshot is immutable';
  END IF;

  IF NOT (
    (OLD.status = 'open' AND NEW.status IN ('checking', 'resting'))
    OR (OLD.status = 'checking' AND NEW.status IN ('mirroring', 'resting'))
    OR (OLD.status = 'mirroring' AND NEW.status IN ('ready_for_human', 'resting'))
    OR (OLD.status = 'ready_for_human' AND NEW.status IN ('resolved', 'resting'))
  ) THEN
    RAISE EXCEPTION 'invalid coverage hunt transition: % -> %', OLD.status, NEW.status;
  END IF;

  IF NEW.status = 'checking' AND NOT EXISTS (
    SELECT 1 FROM coverage_hunt_turns
     WHERE case_id = NEW.id AND role = 'scout'
  ) THEN
    RAISE EXCEPTION 'coverage hunt cannot check without a scout turn';
  END IF;
  IF NEW.status = 'mirroring' AND NOT EXISTS (
    SELECT 1 FROM coverage_hunt_turns
     WHERE case_id = NEW.id AND role = 'checker'
  ) THEN
    RAISE EXCEPTION 'coverage hunt cannot mirror without a checker turn';
  END IF;
  IF NEW.status = 'ready_for_human' AND (
    SELECT count(DISTINCT role) FROM coverage_hunt_turns WHERE case_id = NEW.id
  ) <> 3 THEN
    RAISE EXCEPTION 'coverage hunt needs scout, checker, and mirror before human review';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coverage_hunt_case_transition_guard ON coverage_hunt_cases;
CREATE TRIGGER coverage_hunt_case_transition_guard
  BEFORE UPDATE ON coverage_hunt_cases
  FOR EACH ROW EXECUTE FUNCTION guard_coverage_hunt_case_transition();

-- Rollback (deliberately explicit; run only after exporting the chronicle):
-- DROP TABLE coverage_hunt_chronicle;
-- DROP TABLE coverage_hunt_turns;
-- DROP TABLE coverage_hunt_cases;
-- DROP FUNCTION reject_coverage_hunt_append_only_mutation();
-- DROP FUNCTION guard_coverage_hunt_turn_mutation();
-- DROP FUNCTION guard_coverage_hunt_case_transition();
