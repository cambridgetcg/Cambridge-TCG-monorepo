-- Migration 0099 — wholesale role on users.
--
-- Phase 1 of the wholesale consolidation. Adds 'wholesale' alongside the
-- existing 'user' (consumer default) and 'admin' (operator) values of
-- the users.role column. B2B buyers will hold this role once their
-- accounts migrate from the wholesale RDS.
--
-- Why no schema change: users.role is VARCHAR(20) without a CHECK
-- constraint (see migration 0088_admin_roles.sql). Adding a new valid
-- value is purely a convention update — but the COMMENT below makes
-- the convention readable from the schema introspection (psql \d+
-- users, drizzle-kit introspect, etc.). The COMMENT is the audit-trail
-- breadcrumb for "when did 'wholesale' become a thing?".
--
-- Companion to:
--   - docs/connections/the-four-auth-realms.md (S30) — the topology
--     this role extends.
--   - The /account/b2b/* shell (apps/storefront/src/app/account/b2b/).
--   - proxy.ts middleware gate (apps/storefront/src/proxy.ts).
--
-- Roll-forward only: this migration is idempotent. Re-running rewrites
-- the same comment.

COMMENT ON COLUMN users.role IS
  'Role enum (text). Values: ''user'' (default consumer; magic-link login; retail prices), ''wholesale'' (B2B buyer; magic-link login; sees wholesale prices inside /account/b2b/* shell only), ''admin'' (operator; magic-link login; admin.cambridgetcg.com access + admin pages on storefront). Enforced by convention; no CHECK constraint so that future roles can be added without a destructive ALTER. See docs/connections/the-four-auth-realms.md (S30).';
