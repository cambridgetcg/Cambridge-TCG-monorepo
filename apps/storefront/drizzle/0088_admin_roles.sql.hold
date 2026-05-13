-- Admin role system.
--
-- Replaces the shared-password HMAC cookie admin auth with proper
-- per-user roles tied to NextAuth sessions. Admin users are now
-- individual accounts with magic-link login, identified by their
-- user_id, with every action logged to admin_actions_log.
--
-- The old admin_token cookie and ADMIN_PASSWORD env var can be retired
-- once this migration is applied and the code is deployed.

BEGIN;

-- Add role column — 'user' is the default, 'admin' for staff.
-- Keeping it simple: no RBAC, just user/admin like wholesale.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

-- Index for quick admin lookup (tiny result set, used by admin list page).
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role) WHERE role != 'user';

-- Upgrade admin_actions_log to reference actual user IDs now that
-- admin identity is tied to the users table.
ALTER TABLE admin_actions_log
  ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_admin_actions_log_actor
  ON admin_actions_log(actor_id, created_at DESC);

COMMIT;
