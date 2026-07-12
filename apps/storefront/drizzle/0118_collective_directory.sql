-- Public organisation-directory fields for collectives.
--
-- Only organisation-controlled facts belong here. Personal contacts,
-- attendance, member rosters and private meetup locations do not.

BEGIN;

ALTER TABLE collectives
  ADD COLUMN IF NOT EXISTS games TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS public_contact_url TEXT,
  ADD COLUMN IF NOT EXISTS accessibility_notes TEXT,
  ADD COLUMN IF NOT EXISTS directory_listed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS directory_listed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS directory_notice_version TEXT,
  ADD COLUMN IF NOT EXISTS directory_authority_attested_at TIMESTAMPTZ;

-- A web profile and a bulk/API listing are different publication purposes.
-- A directory row therefore needs its own current notice receipt and the
-- steward's attestation that they may represent the organisation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'collectives_directory_receipt'
  ) THEN
    ALTER TABLE collectives
      ADD CONSTRAINT collectives_directory_receipt CHECK (
        directory_listed = FALSE OR (
          is_public = TRUE
          AND directory_listed_at IS NOT NULL
          AND directory_notice_version IS NOT NULL
          AND directory_authority_attested_at IS NOT NULL
        )
      );
  END IF;
END $$;

-- Contain self-serve impersonation/spam even under concurrent requests. The
-- account-scoped advisory lock makes the count + insert boundary atomic; the
-- application shows the same ten-organisation limit before attempting it.
CREATE OR REPLACE FUNCTION enforce_collective_steward_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('collective-steward-limit'),
    hashtext(NEW.steward_user_id::text)
  );
  IF (
    SELECT count(*)
      FROM collectives
     WHERE steward_user_id = NEW.steward_user_id
  ) >= 10 THEN
    RAISE EXCEPTION 'One account may steward up to 10 organisations. Contact us if you manage a larger public network.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS collectives_steward_limit ON collectives;
CREATE TRIGGER collectives_steward_limit
BEFORE INSERT ON collectives
FOR EACH ROW EXECUTE FUNCTION enforce_collective_steward_limit();

CREATE TABLE IF NOT EXISTS collective_directory_publication_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collective_id UUID REFERENCES collectives(id) ON DELETE SET NULL,
  collective_slug TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '180 days'),
  actor_redacted_at TIMESTAMPTZ,
  action TEXT NOT NULL CHECK (action IN ('listed', 'unlisted')),
  notice_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  receipt_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 years')
);

COMMENT ON TABLE collective_directory_publication_log IS
  'Publication and withdrawal receipts. Actor id is cleared after 180 days or account deletion; the whole pseudonymised receipt is deleted after two years.';

CREATE INDEX IF NOT EXISTS idx_collective_directory_actor_expiry
  ON collective_directory_publication_log(actor_expires_at ASC)
  WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_collective_directory_receipt_expiry
  ON collective_directory_publication_log(receipt_expires_at ASC);

CREATE INDEX IF NOT EXISTS idx_collective_directory_publication_log_collective
  ON collective_directory_publication_log(collective_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collectives_public_kind
  ON collectives(kind, updated_at DESC)
  WHERE is_public = TRUE AND directory_listed = TRUE;

CREATE INDEX IF NOT EXISTS idx_collectives_public_games
  ON collectives USING GIN(games)
  WHERE is_public = TRUE AND directory_listed = TRUE;

COMMIT;
