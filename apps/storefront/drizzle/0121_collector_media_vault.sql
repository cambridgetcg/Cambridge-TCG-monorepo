-- 0121_collector_media_vault.sql — private, owner-only collector photos
--
-- This table stores opaque S3 keys, never URLs. A pending row reserves quota
-- before the server writes the already-normalised WebP object. Existing public
-- upload tables and routes are intentionally unrelated.

BEGIN;

CREATE TABLE collector_media_vault (
  id                  UUID PRIMARY KEY,
  owner_user_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  purpose             TEXT NOT NULL DEFAULT 'collection_photo',
  status              TEXT NOT NULL DEFAULT 'pending',
  object_key          TEXT NOT NULL UNIQUE,
  source_mime_type    TEXT NOT NULL,
  source_bytes        INTEGER NOT NULL,
  source_width        INTEGER NOT NULL,
  source_height       INTEGER NOT NULL,
  stored_bytes        INTEGER NOT NULL,
  width               INTEGER NOT NULL,
  height              INTEGER NOT NULL,
  sha256_hex          CHAR(64) NOT NULL,
  pending_expires_at  TIMESTAMPTZ,
  cleanup_claimed_at  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ready_at            TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT collector_media_vault_purpose_check
    CHECK (purpose = 'collection_photo'),
  CONSTRAINT collector_media_vault_status_check
    CHECK (status IN ('pending', 'ready', 'deleting')),
  CONSTRAINT collector_media_vault_key_check
    CHECK (object_key ~ '^collector-media/v1/[0-9a-f]{2}/[0-9a-f]{64}[.]webp$'),
  CONSTRAINT collector_media_vault_source_type_check
    CHECK (source_mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT collector_media_vault_source_bytes_check
    CHECK (source_bytes BETWEEN 1 AND 3145728),
  CONSTRAINT collector_media_vault_stored_bytes_check
    CHECK (stored_bytes BETWEEN 1 AND 3145728),
  CONSTRAINT collector_media_vault_source_dimensions_check
    CHECK (
      source_width > 0 AND source_height > 0
      AND source_width::BIGINT * source_height::BIGINT <= 40000000
    ),
  CONSTRAINT collector_media_vault_dimensions_check
    CHECK (width BETWEEN 1 AND 4096 AND height BETWEEN 1 AND 4096),
  CONSTRAINT collector_media_vault_sha256_check
    CHECK (sha256_hex ~ '^[0-9a-f]{64}$'),
  CONSTRAINT collector_media_vault_state_dates_check
    CHECK (
      (status = 'pending' AND ready_at IS NULL AND pending_expires_at IS NOT NULL AND cleanup_claimed_at IS NULL)
      OR
      (status = 'ready' AND ready_at IS NOT NULL AND pending_expires_at IS NULL AND cleanup_claimed_at IS NULL)
      OR
      (status = 'deleting' AND ready_at IS NULL AND pending_expires_at IS NULL AND cleanup_claimed_at IS NOT NULL)
    )
);

CREATE INDEX collector_media_vault_owner_created_idx
  ON collector_media_vault(owner_user_id, created_at DESC);

CREATE INDEX collector_media_vault_pending_expiry_idx
  ON collector_media_vault(pending_expires_at ASC)
  WHERE status = 'pending';

CREATE INDEX collector_media_vault_cleanup_claim_idx
  ON collector_media_vault(cleanup_claimed_at ASC)
  WHERE status = 'deleting';

COMMENT ON TABLE collector_media_vault IS
  'Private owner-only collector photos. Contains opaque S3 keys but no public or signed URLs.';
COMMENT ON COLUMN collector_media_vault.pending_expires_at IS
  'Operator cleanup deadline for an incomplete S3 write; deletion must remove S3 first, then this row.';
COMMENT ON COLUMN collector_media_vault.cleanup_claimed_at IS
  'Atomic cleanup claim. A deleting row cannot concurrently become ready; stale claims are retryable.';
COMMENT ON CONSTRAINT collector_media_vault_state_dates_check ON collector_media_vault IS
  'Pending rows reserve quota before S3 write; deleting rows are cleanup-owned; ready rows are owner-accessible.';

-- One statement owns the account-scoped lock, usage read and pending insert.
-- This makes concurrent uploads unable to step around either quota.
CREATE OR REPLACE FUNCTION reserve_collector_media_vault_object(
  p_id UUID,
  p_owner_user_id UUID,
  p_object_key TEXT,
  p_source_mime_type TEXT,
  p_source_bytes INTEGER,
  p_source_width INTEGER,
  p_source_height INTEGER,
  p_stored_bytes INTEGER,
  p_width INTEGER,
  p_height INTEGER,
  p_sha256_hex CHAR(64)
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  current_objects INTEGER;
  current_bytes BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('collector-media-vault-quota-v1'),
    hashtext(p_owner_user_id::TEXT)
  );

  SELECT COUNT(*)::INTEGER, COALESCE(SUM(stored_bytes), 0)::BIGINT
    INTO current_objects, current_bytes
    FROM collector_media_vault
   WHERE owner_user_id = p_owner_user_id
     AND status IN ('pending', 'ready', 'deleting');

  IF current_objects >= 20 OR current_bytes + p_stored_bytes > 104857600 THEN
    RETURN FALSE;
  END IF;

  INSERT INTO collector_media_vault (
    id, owner_user_id, purpose, status, object_key,
    source_mime_type, source_bytes, source_width, source_height,
    stored_bytes, width, height, sha256_hex, pending_expires_at
  ) VALUES (
    p_id, p_owner_user_id, 'collection_photo', 'pending', p_object_key,
    p_source_mime_type, p_source_bytes, p_source_width, p_source_height,
    p_stored_bytes, p_width, p_height, p_sha256_hex,
    NOW() + INTERVAL '24 hours'
  );

  RETURN TRUE;
END;
$$;

-- Account erasure must call the vault deletion path before deleting users.
-- RESTRICT is deliberate: silently cascading the row would orphan private S3
-- data with no remaining owner pointer.

COMMIT;
