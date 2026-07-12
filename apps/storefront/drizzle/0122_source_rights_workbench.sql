-- Source-rights review workbench.
--
-- These rows are review proposals, never runtime permission. The deployed
-- @cambridge-tcg/data-ingest registry remains the only effective authority for
-- fetch, storage, display and redistribution decisions.

BEGIN;

CREATE TABLE IF NOT EXISTS source_rights_review_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id TEXT NOT NULL CHECK (source_id ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  parent_review_id UUID REFERENCES source_rights_review_versions(id) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK (state IN ('draft', 'proposed', 'rejected', 'landed')),
  base_registry_hash CHAR(64) NOT NULL CHECK (base_registry_hash ~ '^[0-9a-f]{64}$'),
  revision_hash CHAR(64) NOT NULL UNIQUE CHECK (revision_hash ~ '^[0-9a-f]{64}$'),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 1000),
  public_evidence JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(public_evidence) = 'array'),
  agreement_reference TEXT CHECK (
    agreement_reference IS NULL OR char_length(agreement_reference) BETWEEN 1 AND 200
  ),
  valid_until DATE,
  review_trigger TEXT NOT NULL CHECK (char_length(review_trigger) BETWEEN 1 AND 1000),
  decision_note TEXT,
  landed_commit CHAR(40) CHECK (
    landed_commit IS NULL OR landed_commit ~ '^[0-9a-f]{40}$'
  ),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '180 days'),
  actor_redacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (state = 'landed' AND landed_commit IS NOT NULL)
    OR (state <> 'landed' AND landed_commit IS NULL)
  ),
  CHECK (
    (state = 'rejected' AND decision_note IS NOT NULL AND char_length(decision_note) BETWEEN 1 AND 1000)
    OR (state <> 'rejected' AND decision_note IS NULL)
  )
);

COMMENT ON TABLE source_rights_review_versions IS
  'Append-only, non-effective source-rights review proposals. Deployed registry code remains authoritative; no row in this table grants permission.';

CREATE TABLE IF NOT EXISTS source_rights_review_cells (
  review_id UUID NOT NULL REFERENCES source_rights_review_versions(id) ON DELETE RESTRICT,
  proposed_field_path TEXT NOT NULL CHECK (
    char_length(proposed_field_path) BETWEEN 3 AND 160
    AND proposed_field_path ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
  ),
  purpose TEXT NOT NULL CHECK (purpose IN (
    'fetch',
    'store',
    'internal-decision',
    'signed-in-display',
    'public-display',
    'derived-aggregate',
    'bulk-redistribution',
    'model-training'
  )),
  verdict TEXT NOT NULL CHECK (verdict IN (
    'permitted',
    'conditional',
    'contract-required',
    'prohibited',
    'unknown'
  )),
  conditions TEXT CHECK (conditions IS NULL OR char_length(conditions) <= 2000),
  attribution TEXT CHECK (attribution IS NULL OR char_length(attribution) <= 1000),
  retention_days INTEGER CHECK (
    retention_days IS NULL OR retention_days BETWEEN 0 AND 36500
  ),
  PRIMARY KEY (review_id, proposed_field_path, purpose)
);

COMMENT ON TABLE source_rights_review_cells IS
  'Exact field-and-purpose conclusions belonging to a non-effective review proposal. Wildcards are forbidden and missing cells mean unknown.';

CREATE INDEX IF NOT EXISTS idx_source_rights_review_source_created
  ON source_rights_review_versions(source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_source_rights_review_actor_expiry
  ON source_rights_review_versions(actor_expires_at)
  WHERE created_by IS NOT NULL;

-- One root and one successor make each source history a single line. These
-- constraints protect the ledger even if a future writer bypasses the app.
CREATE UNIQUE INDEX IF NOT EXISTS uq_source_rights_review_root
  ON source_rights_review_versions(source_id)
  WHERE parent_review_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_source_rights_review_successor
  ON source_rights_review_versions(parent_review_id)
  WHERE parent_review_id IS NOT NULL;

CREATE OR REPLACE FUNCTION enforce_source_rights_revision_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_source TEXT;
  parent_state TEXT;
BEGIN
  IF NEW.parent_review_id IS NULL THEN
    IF NEW.state <> 'draft' THEN
      RAISE EXCEPTION 'A source-rights root must be a draft.';
    END IF;
    RETURN NEW;
  END IF;

  SELECT source_id, state INTO parent_source, parent_state
    FROM source_rights_review_versions
   WHERE id = NEW.parent_review_id;
  IF NOT FOUND OR parent_source <> NEW.source_id THEN
    RAISE EXCEPTION 'A source-rights successor must keep its parent source.';
  END IF;
  IF NOT (
    (parent_state = 'draft' AND NEW.state IN ('proposed', 'rejected'))
    OR (parent_state = 'proposed' AND NEW.state IN ('rejected', 'landed'))
    OR (parent_state IN ('rejected', 'landed') AND NEW.state = 'draft')
  ) THEN
    RAISE EXCEPTION 'Invalid source-rights successor state.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER source_rights_revision_insert_guard
BEFORE INSERT ON source_rights_review_versions
FOR EACH ROW EXECUTE FUNCTION enforce_source_rights_revision_insert();

CREATE OR REPLACE FUNCTION protect_source_rights_revision_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Source-rights revisions are append-only.';
  END IF;
  -- The sole allowed update is the bounded privacy-redaction transition.
  IF ROW(
    NEW.id, NEW.source_id, NEW.parent_review_id, NEW.state,
    NEW.base_registry_hash, NEW.revision_hash, NEW.summary,
    NEW.public_evidence, NEW.agreement_reference, NEW.valid_until,
    NEW.review_trigger, NEW.decision_note, NEW.landed_commit, NEW.actor_expires_at, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id, OLD.source_id, OLD.parent_review_id, OLD.state,
    OLD.base_registry_hash, OLD.revision_hash, OLD.summary,
    OLD.public_evidence, OLD.agreement_reference, OLD.valid_until,
    OLD.review_trigger, OLD.decision_note, OLD.landed_commit, OLD.actor_expires_at, OLD.created_at
  ) OR OLD.created_by IS NULL OR NEW.created_by IS NOT NULL
    OR OLD.actor_redacted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Source-rights revisions are append-only except for actor redaction.';
  END IF;
  NEW.actor_redacted_at := COALESCE(NEW.actor_redacted_at, NOW());
  RETURN NEW;
END;
$$;

CREATE TRIGGER source_rights_revision_history_guard
BEFORE UPDATE OR DELETE ON source_rights_review_versions
FOR EACH ROW EXECUTE FUNCTION protect_source_rights_revision_history();

CREATE OR REPLACE FUNCTION protect_source_rights_review_cells()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Source-rights review cells are append-only.';
END;
$$;

CREATE TRIGGER source_rights_review_cells_history_guard
BEFORE UPDATE OR DELETE ON source_rights_review_cells
FOR EACH ROW EXECUTE FUNCTION protect_source_rights_review_cells();

COMMIT;
