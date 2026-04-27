-- Verification document storage + audit columns.
--
-- Migration 0015 introduced user_verifications with name + address +
-- bank details + status, but identity verification has been text-only:
-- admins were supposedly confirming identity by reading back what the
-- user typed. The dispute / auction / trade-in pattern used throughout
-- the rest of the site captures file evidence via S3 — bring the
-- verification flow up to that standard.
--
-- New columns on user_verifications:
--   rejected_at               — explicit timestamp for the rejected→submitted
--                               round-trip (vs inferring from updated_at)
--   resubmitted_count         — how many times the user has re-submitted
--                               after rejection; helpful admin signal
-- New table verification_documents:
--   Multiple files per verification (ID front, ID back, proof of address)
--   Soft-typed via `doc_type` so we can grow types without a schema change

BEGIN;

ALTER TABLE user_verifications
  ADD COLUMN IF NOT EXISTS rejected_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resubmitted_count INT NOT NULL DEFAULT 0;

-- Backfill rejected_at for existing rejected rows
UPDATE user_verifications
   SET rejected_at = updated_at
 WHERE rejected_at IS NULL AND status = 'rejected';

CREATE TABLE IF NOT EXISTS verification_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Which doc type the user labelled this as. Common: id_front,
  -- id_back, passport, proof_of_address, other. Free-form string so
  -- we can add without a migration.
  doc_type    VARCHAR(40) NOT NULL,
  url         TEXT NOT NULL,
  s3_key      TEXT NOT NULL,
  mime_type   VARCHAR(80),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_documents_user
  ON verification_documents(user_id, uploaded_at DESC);

COMMIT;
