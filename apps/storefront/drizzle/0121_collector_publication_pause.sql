-- 0121_collector_publication_pause.sql
--
-- Collector Witnesses remain an owner-only notebook. The original table
-- migration described a live K=5 monthly aggregate, but thresholding alone
-- does not prevent controlled-account or repeated-read differencing. Public
-- projection is therefore paused until a delayed, closed, coarse projector,
-- release ledger, and reconstruction tests exist.
--
-- This forward-only correction does four things:
--   1. makes the current v2 permission text the database default;
--   2. renames the old public-query index for possible future projection; and
--   3. makes the active CC0 receipt exactly match the active CC0 choice; and
--   4. corrects the schema comments to describe the actual paused boundary.
--
-- Existing permission choices are not rewritten. Their recorded terms version
-- remains part of the fact. The application stamps v2 whenever an owner makes
-- a new sharing choice, and any future projector must filter for its reviewed
-- terms version explicitly.
--
-- The migration runner wraps this file in one transaction.

ALTER TABLE collector_observations
  ALTER COLUMN sharing_terms_version
  SET DEFAULT 'collector-witness-v2';

ALTER INDEX IF EXISTS collector_observations_public_month_idx
  RENAME TO collector_observations_future_projection_idx;

COMMENT ON INDEX collector_observations_future_projection_idx IS
  'Candidate lookup for a future privacy-reviewed projector only. It authorizes no public read; a projector must also require its reviewed terms version, delayed release, coarse output, a release ledger, and reconstruction tests.';

ALTER TABLE collector_observations
  DROP CONSTRAINT collector_observations_cc0_acknowledged;

ALTER TABLE collector_observations
  ADD CONSTRAINT collector_observations_cc0_acknowledged CHECK (
    (sharing_mode = 'cc0') = (cc0_acknowledged_at IS NOT NULL)
  );

COMMENT ON TABLE collector_observations IS
  'Private-by-default, first-party collector price observations. Raw rows are '
  'owner-only. Non-private sharing modes record eligibility for a future '
  'privacy-reviewed projector; public projection is paused and no aggregate '
  'has been released. Individual and account deletion cascade physically.';

COMMENT ON COLUMN collector_observations.sharing_mode IS
  'private is owner-only. anonymous_aggregate and cc0 record future projector permission only; no live public aggregate reads this table.';

COMMENT ON COLUMN collector_observations.sharing_terms_version IS
  'Version of the permission text accepted for this sharing choice. Any future projector must require its reviewed version explicitly.';

COMMENT ON COLUMN collector_observations.cc0_acknowledged_at IS
  'Server timestamp proving the owner acknowledged a possible future CC0 projection. Nothing is published by the current implementation.';
