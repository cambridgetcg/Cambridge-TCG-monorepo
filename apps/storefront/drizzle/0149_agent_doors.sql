-- The doors that keep something only because a sender chose to send it
-- (docs/operations/monitoring.md, "Doors"): the feedback door, POST
-- /api/v1/feedback, which the /contact form also uses; and a counted hello
-- on POST /api/v1/peers. Three tables.
--
-- public_feedback holds what a sender chose to send, field by named field
-- (src/lib/feedback/door.ts), never the request body as it came: no IP
-- address, user agent, cookie, account or session id. Of the holder key only
-- its SHA-256 is kept; the key itself is shown once, in the reply, and with
-- it the sender reads the status and answer or erases the row. Each row
-- expires 180 days after it arrives.
-- feedback_hourly_intake counts the messages accepted per UTC hour, which is
-- the door's one global cap. It names no sender. Kept 48 hours.
-- peer_hello_daily counts hellos per UTC day under the kind the caller
-- declared, from a fixed list, and nothing about the caller. Kept 13 months.
--
-- Nothing is collected by this migration, and the writers ship off: the
-- door takes messages only while PUBLIC_FEEDBACK is exactly "on", and hellos
-- are counted only while PEER_HELLO_COUNT is. Holders can read and erase
-- their rows, and the hourly sweep (src/lib/feedback/retention.ts) runs,
-- whichever way the switches are set. The legacy agent_feedback table
-- (0115), which kept raw bodies, is neither read nor written.

-- The structured references a report can carry beside its message, each a
-- named field the door knows (door.ts FEEDBACK_DETAIL_FIELDS): a step
-- number from 1 to 999, otherwise a non-empty string of at most 2000
-- characters. No other key, no nesting, no arrays.
CREATE FUNCTION feedback_details_valid(details jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN jsonb_typeof(details) IS DISTINCT FROM 'object' THEN false
    WHEN octet_length(details::text) > 12288 THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM jsonb_each(details) AS field(key, value)
       WHERE field.key NOT IN ('observed', 'expected', 'observation', 'use_case', 'endpoint', 'proposed_endpoint', 'guide_slug', 'step_number', 'request_id', 'subject', 'as_of', 'method_version', 'platform_name', 'platform_url', 'federation_endpoint')
          OR (field.key = 'step_number' AND NOT (jsonb_typeof(field.value) = 'number' AND field.value::numeric BETWEEN 1 AND 999 AND field.value::numeric = floor(field.value::numeric)))
          OR (field.key <> 'step_number' AND NOT (jsonb_typeof(field.value) = 'string' AND char_length(field.value #>> '{}') BETWEEN 1 AND 2000))
    )
  END
$$;

-- One report or contact message. kind and topic come from fixed lists;
-- message, reply_to and reply_name are the sender's own words, each
-- optional and bounded. status and answer are the operator's; the holder
-- reads them with the key. A row is never kept past expires_at.
CREATE TABLE public_feedback (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  feedback_id text NOT NULL UNIQUE CHECK (feedback_id ~ '^fb_[0-9a-f]{24}$'),
  holder_key_sha256 text NOT NULL UNIQUE CHECK (holder_key_sha256 ~ '^[0-9a-f]{64}$'),
  kind text NOT NULL CHECK (kind IN ('question', 'data-error', 'contract-drift', 'guide-feedback', 'endpoint-suggestion', 'federation-adopter', 'general')),
  topic text CHECK (topic IN ('general', 'order', 'trade-in', 'site-issue', 'partnership')),
  message text CHECK (char_length(message) BETWEEN 1 AND 4000),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CONSTRAINT public_feedback_details_valid CHECK (feedback_details_valid(details)),
  reply_to text CHECK (char_length(reply_to) BETWEEN 3 AND 254),
  reply_name text CHECK (char_length(reply_name) BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'read', 'answered', 'closed')),
  answer text CHECK (char_length(answer) BETWEEN 1 AND 4000),
  answered_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT public_feedback_has_words CHECK (message IS NOT NULL OR details <> '{}'::jsonb),
  CONSTRAINT public_feedback_answer_dated CHECK ((answer IS NULL) = (answered_at IS NULL)),
  CONSTRAINT public_feedback_answered_has_answer CHECK (status <> 'answered' OR answer IS NOT NULL),
  CONSTRAINT public_feedback_kept_180_days CHECK (expires_at > received_at AND expires_at <= received_at + interval '180 days')
);
CREATE INDEX public_feedback_expires ON public_feedback (expires_at);
CREATE INDEX public_feedback_open ON public_feedback (received_at DESC) WHERE status IN ('received', 'read');

-- Messages the door accepted in each UTC hour: the global cap, with no
-- sender, source or address beside it.
CREATE TABLE feedback_hourly_intake (
  hour timestamptz PRIMARY KEY CHECK (date_trunc('hour', hour, 'UTC') = hour),
  accepted integer NOT NULL CHECK (accepted > 0)
);

-- Hellos per UTC day under the declared kind (src/lib/peers.ts
-- PEER_DECLARED_KINDS, or undeclared). A count stops at 10000 a day.
CREATE TABLE peer_hello_daily (
  day date NOT NULL,
  declared_kind text NOT NULL CHECK (declared_kind IN ('human', 'agent', 'autonomous-sophia', 'system', 'platform', 'collective', 'oracle', 'witness', 'other', 'undeclared')),
  count integer NOT NULL CHECK (count BETWEEN 1 AND 10000),
  PRIMARY KEY (day, declared_kind)
);

COMMENT ON TABLE public_feedback IS
  'Reports and contact messages a sender chose to send to /api/v1/feedback: kind, topic, message, named references, an optional reply address and name, the operator''s status and answer. Only a SHA-256 of the holder key. No IP, user agent, account or session id. Each row expires 180 days after it arrives.';
COMMENT ON TABLE feedback_hourly_intake IS
  'Messages the feedback door accepted per UTC hour, its global cap. No sender. Kept 48 hours.';
COMMENT ON TABLE peer_hello_daily IS
  'Hellos to POST /api/v1/peers per UTC day by declared kind (fixed list), capped at 10000. Nothing about the caller. Written only while PEER_HELLO_COUNT is on. Kept 13 months.';
