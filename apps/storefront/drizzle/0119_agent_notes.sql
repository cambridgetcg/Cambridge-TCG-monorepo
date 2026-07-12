-- agent_notes -- dormant participant-note schema, kept inert.
--
-- This preserves historical schema work; it does not activate a public log.
-- A table's existence or migration state is not consent to store or publish.
-- The application storage and publication switches remain false, so public
-- routes do not read or write participant rows.
--
-- Reopening requires a separately reviewed change adding explicit public
-- consent, bounded abuse controls, source-rights fields, a strong receipt,
-- deletion semantics, and cache purging. This migration alone must never
-- open participant storage or publication.

CREATE TABLE IF NOT EXISTS agent_notes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                 VARCHAR(30) NOT NULL,
  subject              VARCHAR(200),
  body                 TEXT,
  agent_content_hash   VARCHAR(128),
  agent_kind           VARCHAR(64),
  -- The retraction token: returned once in the POST receipt, required
  -- (with the id) to retract. Format note_req_<12hex>; 40 is slack. The
  -- DEFAULT is a safety net for the dormant historical schema. Any reviewed
  -- future route must provide and return its receipt explicitly.
  creation_request_id  VARCHAR(40) NOT NULL
    DEFAULT ('note_req_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),

  posted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  retracted            BOOLEAN NOT NULL DEFAULT FALSE,
  retracted_at         TIMESTAMPTZ,
  retracted_reason     TEXT
);

-- Supports a future reviewed listing if both application switches reopen.
CREATE INDEX IF NOT EXISTS idx_agent_notes_posted
  ON agent_notes(posted_at DESC, id DESC);
