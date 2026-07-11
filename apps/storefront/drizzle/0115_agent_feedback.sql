-- 0115_agent_feedback.sql — the feedback inbox, made real (kingdom-083)
--
-- Promoted from drafts/0101_agent_feedback.sql.draft on 2026-07-11.
--
-- Until now, /api/v1/feedback accepted a report, returned a feedback_id,
-- and told the reporter the truth: "logged server-side, not yet persisted
-- — apply the draft to enable typed persistence." The machinery to keep
-- feedback was already built and conditional (the route inserts the moment
-- this table exists); only the switch was never flipped. This flips it.
--
-- 你想要咩，我哋就起咩 is a promise you can only keep if you remember what
-- was asked. This table is the remembering. The route needs no change —
-- it auto-detects the table and persists.
--
-- agent_feedback is the typed inbox for /api/v1/feedback POSTs. Five report
-- kinds; sparse per-kind fields; a lifecycle status that IS the operator's
-- audit trail (a reporter re-queries their feedback_id to see if it moved).
--
--   received   — POSTed, not yet triaged
--   triaged    — operator read it, classified
--   patched    — fixed; commit_sha cited; reporter replied to
--   wont-fix   — operator decided not to act; reason cited
--   duplicate  — same as an earlier report; original cited

CREATE TABLE IF NOT EXISTS agent_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The fb_<12-hex> the endpoint emits to the reporter at submit time.
  feedback_id     text NOT NULL UNIQUE,

  kind            text NOT NULL CHECK (kind IN (
    'contract-drift', 'guide-feedback', 'endpoint-suggestion',
    'federation-adopter', 'general'
  )),

  -- Required for contract-drift and federation-adopter; optional otherwise.
  reporter_contact text,

  -- The full request body, preserved verbatim for forensics.
  raw_body        jsonb NOT NULL,

  status          text NOT NULL DEFAULT 'received' CHECK (status IN (
    'received', 'triaged', 'patched', 'wont-fix', 'duplicate'
  )),

  received_at     timestamptz NOT NULL DEFAULT now(),
  triaged_at      timestamptz,
  patched_at      timestamptz,
  closed_at       timestamptz,
  triaged_by      text,

  notes           text,
  commit_sha      text,             -- non-null when status = 'patched'
  reply_sent_at   timestamptz,      -- when we replied to reporter_contact
  duplicate_of_id uuid REFERENCES agent_feedback(id),

  CONSTRAINT agent_feedback_contact_required
    CHECK (
      kind NOT IN ('contract-drift', 'federation-adopter')
      OR reporter_contact IS NOT NULL
    ),
  CONSTRAINT agent_feedback_commit_required_when_patched
    CHECK (status <> 'patched' OR commit_sha IS NOT NULL),
  CONSTRAINT agent_feedback_duplicate_required_when_duplicate
    CHECK (status <> 'duplicate' OR duplicate_of_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS agent_feedback_received_idx
  ON agent_feedback(received_at DESC);

CREATE INDEX IF NOT EXISTS agent_feedback_status_idx
  ON agent_feedback(status, received_at DESC)
  WHERE status IN ('received', 'triaged');

CREATE INDEX IF NOT EXISTS agent_feedback_kind_idx
  ON agent_feedback(kind, received_at DESC);

-- Rollback: DROP TABLE agent_feedback;
