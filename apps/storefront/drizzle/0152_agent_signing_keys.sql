-- 0152: agent-held signing keys, slice 1 (docs/plans/agent-auth/held-keys.md).
--
-- What it adds. An operator-managed agent may hold its own Ed25519 key pair;
-- the operator binds the public half at /account/agents and the agent signs
-- binding acts (signer.check, key.mint, key.revoke) as compact JWS strings
-- sent to the MCP tool agent.act or POST /api/v1/agents/act
-- (lib/agents/signed-acts.ts). This file adds:
--   - agent_signing_keys: each bound public key (32 bytes), its RFC 7638
--     thumbprint, its expiry (not_after), whether its first validly signed
--     act has confirmed it, and how it ended. Apart from agent_keys, so the
--     gate, rate buckets, last-used stamps and every existing statement over
--     agent_keys (both archive paths, agent.revoke_key, the Coverage Hunt key
--     lock) can never touch one.
--   - agent_act_nonces: (thumbprint, jti) seen, until the act's exp plus 60
--     seconds, so an act is applied at most once. Each act purges a few
--     expired rows as it commits; the hourly maintenance sweep
--     (lib/agents/signed-act-sweep.ts) purges the rest while signed acts are
--     open.
--   - agent_act_events: one append-only row per act and per binding or
--     removal at the page, with the signed bytes, their SHA-256, the
--     verification record and the effect: evidence for the agent, its
--     operator and support.
--   - agent_keys.minted_by_event: which signed act minted a usage key, so a
--     signing key's mints can be found and revoked (after a verifier bug, or
--     a stolen key).
--   - mcp_daily's tool CHECK, widened with agent.act (see below).
--
-- Why. The owner answered on 2026-11-10, verbatim, "Yes offer the keys"
-- (held-keys.md, D1). Every name, number and retention below is an agent's
-- proposal in that page, not the owner's decision. The owner's word for this
-- migration, for the new dependency and for turning the path on in
-- production (D4), and for the new stored categories and their privacy-notice
-- rows (D3), has not been given; /privacy does not yet describe these tables.
--
-- Retention, as proposed. Signing keys and events are kept until the agent is
-- erased, and erasure is not built (support-procedures.md P1 is a draft), so
-- until it is they are kept indefinitely, archived agents included. A key
-- never confirmed by a signed act is deleted 7 days after binding, whether or
-- not the operator removed it meanwhile, by the hourly maintenance sweep
-- (lib/agents/signed-act-sweep.ts); binding the same key to the same agent
-- again after that deletes its old row too. The sweep runs only while signed
-- acts are open (AGENT_SIGNED_ACTS), as no code reads or writes these tables
-- while they are closed, so after a close such keys and expired nonces stay
-- until the path opens again; nothing can use them meanwhile. When an
-- event's agent_id goes to NULL (P1's delete, its case 7a, or
-- an account deletion cascading through agents), the guard below also nulls
-- act_jws, thumbprint, verification and effect, so a receipt stays: event id,
-- basis, act, outcome or refusal, act_sha256, date. P1's tombstone (7b) keeps
-- the agents row, so its script nulls those four with agent_id unchanged and
-- deletes the signing keys itself; the guard allows exactly those two updates
-- and no other change. It is modelled on coverage_hunt_turns' guard (0120),
-- which allows only agent_id going to NULL, and is wider by the 7b case.
--
-- Pending, then confirmed. Only confirmed keys are unique by thumbprint, so
-- pasting someone else's public key squats nothing; a key confirmed for one
-- agent is refused at another's first act (signing_key_in_use). Event ids
-- are made by the app before the act's rows are written, so the three
-- references to agent_act_events are DEFERRABLE INITIALLY DEFERRED: checked
-- at commit, in the act's one transaction.
--
-- The daily MCP count (mcp_daily, 0148; widened by 0150) learns one tool
-- word: agent.act, after agent.revoke_key as in the gate's TOOLS table.
-- src/lib/observability/vocabulary.ts MCP_TOOLS gains the same word in the
-- same place, and vocabulary.test.ts reads this list from here. What it adds
-- is a count per UTC day of agent.act requests by method, authenticated or
-- not (a verified signature reads authenticated) and outcome, with no key,
-- agent or account id, under the same OPS_MCP_DAILY switch.
--
-- Rollout: apply 0152, then deploy. A push to main deploys
-- (docs/ops-deploy-runbook.md), so apply this to the production database
-- before the change that uses it is merged to main, not after. Check first
-- with
--   node scripts/migrate.mjs --plan --expect-only 0152_agent_signing_keys.sql
-- It is safe to apply before that code: today's code neither reads nor writes
-- these tables or the new column, and its agent_keys inserts leave
-- minted_by_event NULL. It MUST be applied before that code deploys, even
-- with the signed-acts flag (AGENT_SIGNED_ACTS) off: with the flag off no
-- code path reads or writes the new tables or column, but the gate lists
-- agent.act and counts it, and recordMcpDaily writes a batch in one statement
-- and drops the whole batch if the database refuses one row, so while
-- OPS_MCP_DAILY is on, a count with the new word would be refused by 0150's
-- CHECK and that batch lost. The new CHECK list is a superset of 0150's, so
-- code that does not know the word keeps writing as before. The dropped CHECK
-- is the name PostgreSQL generated for 0148's column constraint, re-added by
-- 0150 under the same name; it is re-added here under that name, widened.
--
-- Locks. The runner (scripts/migrate.mjs) wraps this file in one
-- transaction, so every lock below is held until its COMMIT. The file's work
-- is quick (33 ms in all with 200,000 agent_keys rows and 60 mcp_daily rows,
-- on PostgreSQL 17 in an agent's review; not measured on production), and
-- SET LOCAL lock_timeout, the first statement, bounds each wait for a lock
-- at 3 seconds: past that the migration fails and rolls back whole, changing
-- nothing, and can simply be run again. Held until COMMIT:
--   - agent_keys, ACCESS EXCLUSIVE (ADD COLUMN): every read or write of
--     agent_keys waits, the gate's key lookup on each authenticated agent
--     call included, and so does every statement queued behind the
--     migration while it waits for this lock. Adding minted_by_event
--     (nullable, no default) does not rewrite the table; its foreign key
--     then scans it once, and every row passes because every value is NULL.
--   - mcp_daily, ACCESS EXCLUSIVE (swapping its tool CHECK, which scans the
--     table): recordMcpDaily's writes and the monitor's reads wait.
--   - agents, SHARE ROW EXCLUSIVE (the foreign keys to it from the two new
--     tables, taken as they are created): reads and row locks (FOR UPDATE,
--     FOR NO KEY UPDATE) go on; INSERT, UPDATE and DELETE on agents wait.
--   - The three new tables, which nothing else can use yet.
-- Rolling the code back is safe for this schema. Do not drop these tables
-- or the column: the events are the only record of what a signed act did.
-- Change them with a new migration.
--
-- The file has no BEGIN or COMMIT, since the runner supplies them, and its
-- SET LOCAL ends with that transaction. Constraint style follows 0151: drop
-- if exists, then add.

SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS agent_act_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  -- Which path the act came by. Every path is named here, including those
  -- this slice does not write (bearer, staff, system), so a later door can
  -- share the table.
  basis VARCHAR(16) NOT NULL,
  -- A signed act's name (signer.check, key.mint, key.revoke) or a page
  -- action (signing_key.bind, signing_key.remove).
  act VARCHAR(64) NOT NULL,
  outcome VARCHAR(16) NOT NULL,
  -- A refusal code from lib/agents/refusals.ts when outcome is 'refused'.
  refusal VARCHAR(64),
  -- The signed act exactly as received, and its SHA-256 (lower-case hex).
  act_jws TEXT,
  act_sha256 CHAR(64),
  verification JSONB,
  -- The signing key's RFC 7638 thumbprint: text, not a foreign key, so the
  -- record outlives the key row.
  thumbprint VARCHAR(43),
  effect JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE agent_act_events DROP CONSTRAINT IF EXISTS agent_act_events_basis_values;
ALTER TABLE agent_act_events ADD CONSTRAINT agent_act_events_basis_values
  CHECK (basis IN ('signed-act', 'bearer', 'operator', 'staff', 'system'));
ALTER TABLE agent_act_events DROP CONSTRAINT IF EXISTS agent_act_events_act_format;
ALTER TABLE agent_act_events ADD CONSTRAINT agent_act_events_act_format
  CHECK (act ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$');
ALTER TABLE agent_act_events DROP CONSTRAINT IF EXISTS agent_act_events_outcome_values;
ALTER TABLE agent_act_events ADD CONSTRAINT agent_act_events_outcome_values
  CHECK (outcome IN ('applied', 'refused'));
ALTER TABLE agent_act_events DROP CONSTRAINT IF EXISTS agent_act_events_refusal_iff_refused;
ALTER TABLE agent_act_events ADD CONSTRAINT agent_act_events_refusal_iff_refused
  CHECK ((outcome = 'refused') = (refusal IS NOT NULL) AND (refusal IS NULL OR refusal ~ '^[a-z][a-z0-9_]*$'));
ALTER TABLE agent_act_events DROP CONSTRAINT IF EXISTS agent_act_events_digest;
ALTER TABLE agent_act_events ADD CONSTRAINT agent_act_events_digest
  CHECK (
    (act_sha256 IS NULL OR act_sha256 ~ '^[0-9a-f]{64}$')
    AND (basis <> 'signed-act' OR act_sha256 IS NOT NULL)
    AND (act_jws IS NULL OR (
      octet_length(act_jws) <= 8192
      AND act_sha256 = encode(sha256(convert_to(act_jws, 'UTF8')), 'hex')
    ))
  );
ALTER TABLE agent_act_events DROP CONSTRAINT IF EXISTS agent_act_events_thumbprint_format;
ALTER TABLE agent_act_events ADD CONSTRAINT agent_act_events_thumbprint_format
  CHECK (thumbprint IS NULL OR thumbprint ~ '^[A-Za-z0-9_-]{43}$');

CREATE INDEX IF NOT EXISTS idx_agent_act_events_agent
  ON agent_act_events (agent_id, created_at DESC) WHERE agent_id IS NOT NULL;

-- Append-only, except agent erasure: (7a, or a cascade from agents) agent_id
-- goes to NULL and the guard nulls the four erasable columns with it; (7b)
-- agent_id unchanged and those four set to NULL. Nothing else may change, and
-- no row may be deleted. TRUNCATE, which fires no row trigger, is refused by
-- a statement trigger of its own, as 0141 and 0146 do; that also refuses a
-- TRUNCATE ... CASCADE that would reach this table (from agents, say).
CREATE OR REPLACE FUNCTION guard_agent_act_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION '% is append-only and is not truncated', TG_TABLE_NAME;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.agent_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND ROW(
       NEW.id,
       NEW.basis,
       NEW.act,
       NEW.outcome,
       NEW.refusal,
       NEW.act_sha256,
       NEW.created_at
     ) IS NOT DISTINCT FROM ROW(
       OLD.id,
       OLD.basis,
       OLD.act,
       OLD.outcome,
       OLD.refusal,
       OLD.act_sha256,
       OLD.created_at
     ) THEN
    IF OLD.agent_id IS NOT NULL AND NEW.agent_id IS NULL THEN
      NEW.act_jws := NULL;
      NEW.thumbprint := NULL;
      NEW.verification := NULL;
      NEW.effect := NULL;
      RETURN NEW;
    END IF;
    IF NEW.agent_id IS NOT DISTINCT FROM OLD.agent_id
       AND NEW.act_jws IS NULL
       AND NEW.thumbprint IS NULL
       AND NEW.verification IS NULL
       AND NEW.effect IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION '% is append-only except for agent erasure', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS agent_act_events_append_only ON agent_act_events;
CREATE TRIGGER agent_act_events_append_only
  BEFORE INSERT OR UPDATE OR DELETE ON agent_act_events
  FOR EACH ROW EXECUTE FUNCTION guard_agent_act_event_mutation();
DROP TRIGGER IF EXISTS agent_act_events_truncate_guard ON agent_act_events;
CREATE TRIGGER agent_act_events_truncate_guard
  BEFORE TRUNCATE ON agent_act_events
  FOR EACH STATEMENT EXECUTE FUNCTION guard_agent_act_event_mutation();

CREATE TABLE IF NOT EXISTS agent_signing_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  -- RFC 7638 SHA-256 thumbprint of {"crv":"Ed25519","kty":"OKP","x":...}:
  -- the JWS kid that names this key.
  thumbprint VARCHAR(43) NOT NULL,
  -- The 32-byte Ed25519 public key, checked at binding (canonical, not of
  -- small order, torsion-free, not a published test key).
  public_key BYTEA NOT NULL,
  -- Picks the verification algorithm; the JWS header does not.
  alg VARCHAR(16) NOT NULL DEFAULT 'Ed25519',
  -- Chosen by the operator at binding; NULL means never.
  not_after TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bound_by_event UUID NOT NULL,
  -- Set by the key's first validly signed act; pending until then.
  confirmed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by_event UUID,
  revocation_kind VARCHAR(32)
);

ALTER TABLE agent_signing_keys DROP CONSTRAINT IF EXISTS agent_signing_keys_bound_by_event_fkey;
ALTER TABLE agent_signing_keys ADD CONSTRAINT agent_signing_keys_bound_by_event_fkey
  FOREIGN KEY (bound_by_event) REFERENCES agent_act_events(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE agent_signing_keys DROP CONSTRAINT IF EXISTS agent_signing_keys_revoked_by_event_fkey;
ALTER TABLE agent_signing_keys ADD CONSTRAINT agent_signing_keys_revoked_by_event_fkey
  FOREIGN KEY (revoked_by_event) REFERENCES agent_act_events(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE agent_signing_keys DROP CONSTRAINT IF EXISTS agent_signing_keys_alg_values;
ALTER TABLE agent_signing_keys ADD CONSTRAINT agent_signing_keys_alg_values
  CHECK (alg IN ('Ed25519'));
-- The thumbprint is the one public_key gives, so a direct write cannot file a
-- key under another key's kid. PostgreSQL's base64 adds no line break below
-- 57 bytes; both inputs here are 32.
ALTER TABLE agent_signing_keys DROP CONSTRAINT IF EXISTS agent_signing_keys_key_shape;
ALTER TABLE agent_signing_keys ADD CONSTRAINT agent_signing_keys_key_shape
  CHECK (
    octet_length(public_key) = 32
    AND thumbprint ~ '^[A-Za-z0-9_-]{43}$'
    AND thumbprint = rtrim(translate(encode(sha256(convert_to(
          '{"crv":"Ed25519","kty":"OKP","x":"'
          || rtrim(translate(encode(public_key, 'base64'), '+/', '-_'), '=')
          || '"}', 'UTF8')), 'base64'), '+/', '-_'), '=')
  );
ALTER TABLE agent_signing_keys DROP CONSTRAINT IF EXISTS agent_signing_keys_times;
ALTER TABLE agent_signing_keys ADD CONSTRAINT agent_signing_keys_times
  CHECK (
    (not_after IS NULL OR not_after > created_at)
    AND (confirmed_at IS NULL OR confirmed_at >= created_at)
    AND (revoked_at IS NULL OR revoked_at >= created_at)
  );
ALTER TABLE agent_signing_keys DROP CONSTRAINT IF EXISTS agent_signing_keys_revocation;
ALTER TABLE agent_signing_keys ADD CONSTRAINT agent_signing_keys_revocation
  CHECK (
    (revoked_at IS NULL) = (revoked_by_event IS NULL)
    AND (revoked_at IS NULL) = (revocation_kind IS NULL)
    AND (revocation_kind IS NULL OR revocation_kind IN ('operator-removed', 'holder-retired'))
  );

-- A confirmed thumbprint belongs to one key row, revoked or not, until the
-- row is erased.
CREATE UNIQUE INDEX IF NOT EXISTS agent_signing_keys_confirmed_thumbprint
  ON agent_signing_keys (thumbprint) WHERE confirmed_at IS NOT NULL;
-- One unrevoked row per key per agent.
CREATE UNIQUE INDEX IF NOT EXISTS agent_signing_keys_unrevoked_per_agent
  ON agent_signing_keys (agent_id, thumbprint) WHERE revoked_at IS NULL;
-- The act path's (sub, kid) lookup, in any state.
CREATE INDEX IF NOT EXISTS idx_agent_signing_keys_lookup
  ON agent_signing_keys (agent_id, thumbprint);
-- The sweep's keys never confirmed, by age, removed or not (its WHERE).
CREATE INDEX IF NOT EXISTS idx_agent_signing_keys_pending
  ON agent_signing_keys (created_at) WHERE confirmed_at IS NULL;

CREATE TABLE IF NOT EXISTS agent_act_nonces (
  thumbprint VARCHAR(43) NOT NULL,
  -- 16 to 32 random bytes in base64url.
  jti VARCHAR(43) NOT NULL,
  -- The act's exp plus 60 seconds; each act and the hourly sweep delete rows
  -- past it.
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (thumbprint, jti)
);

CREATE INDEX IF NOT EXISTS idx_agent_act_nonces_expires ON agent_act_nonces (expires_at);

ALTER TABLE agent_keys
  ADD COLUMN IF NOT EXISTS minted_by_event UUID;
ALTER TABLE agent_keys DROP CONSTRAINT IF EXISTS agent_keys_minted_by_event_fkey;
ALTER TABLE agent_keys ADD CONSTRAINT agent_keys_minted_by_event_fkey
  FOREIGN KEY (minted_by_event) REFERENCES agent_act_events(id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX IF NOT EXISTS idx_agent_keys_minted_by_event
  ON agent_keys (minted_by_event) WHERE minted_by_event IS NOT NULL;

COMMENT ON TABLE agent_signing_keys IS
  'Agent-held Ed25519 public keys bound by an operator (held-keys.md). Kept until the agent is erased, except a key never confirmed by a signed act, which the hourly sweep deletes 7 days after binding while signed acts are open.';
COMMENT ON TABLE agent_act_nonces IS
  'Signed-act (thumbprint, jti) pairs seen, until exp plus 60 seconds: refuses replays. Each act purges a few expired rows; the hourly sweep purges the rest while signed acts are open.';
COMMENT ON TABLE agent_act_events IS
  'Append-only evidence of each signed act and each signing-key binding or removal. Erasable columns null with agent_id; the receipt stays.';
COMMENT ON COLUMN agent_keys.minted_by_event IS
  'The agent_act_events row of the signed key.mint that created this key; NULL for keys minted any other way.';

ALTER TABLE mcp_daily
  DROP CONSTRAINT mcp_daily_tool_check,
  ADD CONSTRAINT mcp_daily_tool_check
    CHECK (tool IN ('agent.self', 'agent.revoke_key', 'agent.act', 'play.list_open_rooms', 'play.observe', 'play.legal_actions', 'play.take_action', 'play.queue_match', 'play.cancel_queue', 'play.match_history', 'catalog.search', 'catalog.lookup_many', 'leaderboards.read', 'prices.recent', 'deck.save', 'deck.list_mine', 'coverage.hunt.list', 'coverage.hunt.view', 'coverage.hunt.contribute', 'coverage.hunt.my_cases', 'mcp.list_tools', 'none', 'unknown'));
