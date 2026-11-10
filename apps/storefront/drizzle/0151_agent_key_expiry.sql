-- 0151: optional agent key expiry (docs/plans/agent-auth/key-expiry.md).
--
-- Each agent key may carry its own end, chosen when it is minted:
-- lib/agents/key-expiry.ts parses the choice (7d, 30d, 90d, 365d, a date
-- from tomorrow UTC to 366 days ahead, or never) and computes the instant on
-- the database's clock at insert. Per-key choice, and NULL meaning never for
-- existing keys, are an agent's calls under the owner's standing delegation,
-- recorded in that plan; they are not the owner's decisions.
--
-- NULL means the key has no expiry. Existing keys keep NULL: nothing changes
-- for them, and no row is written here. Adding a nullable column with no
-- default does not rewrite the table; the CHECK scans it once, and every
-- existing row passes because every existing value is NULL.
--
-- The CHECK says only that an expiry comes after creation. The 366-day range
-- for a chosen date is enforced in the app, not here, so changing it needs no
-- migration, and "never" stays a stated choice (NULL), as RFC 7591's 0 is.
--
-- No index: the gate finds a key by its UNIQUE key_hash, and NOW() cannot
-- appear in a partial-index predicate. The plan's reminder-sweep index is
-- left out because no reminder is built: nothing is sent to anyone when a
-- key nears or reaches its expiry.
--
-- Rollout: apply 0151, then deploy. It is safe to apply before the code that
-- uses it: today's code neither reads nor writes the column, and its inserts
-- leave it NULL. It MUST be applied before deploying code that selects
-- agent_keys.expires_at: that code has no fallback for a missing column, so
-- the gate's lookup would fail and every authenticated agent call would
-- answer 503. Check first with
--   node scripts/migrate.mjs --plan --expect-only 0151_agent_key_expiry.sql
-- Rolling the code back is safe for this schema but not neutral: older code
-- ignores expires_at, so keys chosen to expire stop expiring until the code
-- returns. Do not drop the column; change it with a new migration.
--
-- The runner (scripts/migrate.mjs) wraps this file in its own transaction,
-- so it has no BEGIN or COMMIT. Constraint style follows 0131: drop if
-- exists, then add.

ALTER TABLE agent_keys
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE agent_keys
  DROP CONSTRAINT IF EXISTS agent_keys_expiry_after_creation;
ALTER TABLE agent_keys
  ADD CONSTRAINT agent_keys_expiry_after_creation
  CHECK (expires_at IS NULL OR expires_at > created_at);

COMMENT ON COLUMN agent_keys.expires_at IS
  'When this key stops authenticating, chosen at mint. NULL means never. Fixed at mint; never extended.';
