-- next-auth magic-link verification tokens.
--
-- The custom PgAdapter (src/lib/auth/adapter.ts) has always referenced
-- this table — INSERT in createVerificationToken, DELETE…RETURNING in
-- useVerificationToken — but no migration ever created it. Without the
-- table, every magic-link sign-in attempt errors at token creation,
-- which is why "test magic link email flow end-to-end" has sat on the
-- storefront's priorities list.
--
-- Schema matches the next-auth Adapter contract exactly:
--   - identifier: the email the link was sent to
--   - token:      hashed token from the email link
--   - expires:    24h after send (set by email provider config)
-- Composite primary key on (identifier, token) so the adapter's
-- `ON CONFLICT (identifier, token) DO NOTHING` resolves correctly when
-- a user requests two links in quick succession.

BEGIN;

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier  VARCHAR(200) NOT NULL,
  token       VARCHAR(200) NOT NULL,
  expires     TIMESTAMPTZ  NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- Sweep helper: expired tokens are dead weight and should be reapable
-- by a future cleanup job. Index on `expires` makes that a range scan
-- rather than a full table scan.
CREATE INDEX IF NOT EXISTS verification_tokens_expires_idx
  ON verification_tokens(expires);

COMMIT;
