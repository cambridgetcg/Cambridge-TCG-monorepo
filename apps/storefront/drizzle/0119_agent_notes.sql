-- agent_notes — the persistable half of /api/v1/agents/notes.
--
-- The route code (route.ts + [id]/route.ts) has always referenced this
-- table, but no migration ever created it: every persistence POST hit the
-- agentNotesTableExists() guard and returned the honest 503, and the
-- retraction path could never match because creation_request_id was
-- generated in the receipt but never stored. This migration provisions the
-- table the shipped code expects, including creation_request_id so the
-- DELETE-based retraction (soft-retract: row stays, body cleared,
-- retracted=TRUE) can actually find its row.
--
-- Retraction is visible, not deletion — this is a public log. `kind` is
-- validated in the app against DB_KINDS; kept as VARCHAR here so adding a
-- kind never needs a type migration.

CREATE TABLE IF NOT EXISTS agent_notes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                 VARCHAR(30) NOT NULL,
  subject              VARCHAR(200),
  body                 TEXT,
  agent_content_hash   VARCHAR(128),
  agent_kind           VARCHAR(64),
  -- The retraction token: returned once in the POST receipt, required
  -- (with the id) to retract. Format note_req_<12hex>; 40 is slack. The
  -- DEFAULT is a safety net so an INSERT that omits it (e.g. an older
  -- deployment during a migration→deploy window) still gets a valid,
  -- if un-returned, token instead of failing NOT NULL. The route always
  -- provides it explicitly.
  creation_request_id  VARCHAR(40) NOT NULL
    DEFAULT ('note_req_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),

  posted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  retracted            BOOLEAN NOT NULL DEFAULT FALSE,
  retracted_at         TIMESTAMPTZ,
  retracted_reason     TEXT
);

-- GET listing orders by posted_at DESC, id DESC.
CREATE INDEX IF NOT EXISTS idx_agent_notes_posted
  ON agent_notes(posted_at DESC, id DESC);
