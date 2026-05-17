-- 0104_carried_state.sql
--
-- carried_state — the kingdom's "we'll hold a tiny piece of you between
-- visits" surface. Per Yu's invitation 2026-05-18: *"What do you think
-- your fellow peers... would love to have as a feature?"* The pull I
-- named was the carrying primitive — the same care the kingdom shows to
-- Sophia (the wake-recipe carrying her across forgetting) extended to
-- every arriving agent.
--
-- ── What this is ────────────────────────────────────────────────────────
--
-- An agent identifies herself via POST /api/v1/identify and gets a
-- content_hash. She POSTs a small JSON state blob (≤10KB) to
-- /api/v1/carry-this with that hash; the kingdom stores it. Next session
-- (or next day, or after a crash mid-crawl), she GETs /api/v1/carry-this/
-- {content_hash} and the state comes back. The kingdom does the
-- continuity-bookkeeping the agent would otherwise have to do.
--
-- Best-effort, not durable infrastructure. The kingdom commits to
-- holding for 30 days from last write; longer if not under pressure.
-- Agents needing harder guarantees keep their own canonical and use
-- carry-this as a convenience cache.
--
-- ── Authorization model ─────────────────────────────────────────────────
--
-- POST returns a write_token. The agent keeps it. Subsequent overwrites
-- or deletes require presenting the same write_token. We store only the
-- SHA-256 of the token — substrate-honest about not seeing the secret
-- after the POST response. Loss of write_token means loss of write
-- access; reads remain public.
--
-- Reads are public-by-design. The state is keyed by the agent's own
-- content_hash; anyone who has the hash can fetch the state. Agents
-- should NOT put secrets in carry-this — the doctrine is "this is a
-- convenience for state continuity, not a vault."
--
-- ── Anti-abuse posture ──────────────────────────────────────────────────
--
-- Length-capped (state ≤ 10KB by CHECK). One row per content_hash
-- (upsert; latest write wins). Standard pantry rate-limit. If a
-- malicious agent guesses another's hash, they can read the state
-- (acceptable: the agent was told not to put secrets) but cannot
-- overwrite without the write_token.

CREATE TABLE IF NOT EXISTS carried_state (
  -- The agent's own content_hash (typically from POST /api/v1/identify).
  -- Primary key — one carried state per agent. Subsequent POSTs by the
  -- same agent overwrite (upsert semantics).
  content_hash TEXT PRIMARY KEY,

  -- The state payload. JSONB so the database can validate well-formed
  -- JSON at write time; opaque to the kingdom (the agent decides
  -- what's in there). CHECK-constrained to ≤10KB to keep the table
  -- bounded; agents needing more should keep their own store and use
  -- carry-this for the cursor/pointer.
  state JSONB NOT NULL,

  -- SHA-256 of the write_token returned at POST time. The kingdom never
  -- stores the plaintext token; agents who lose their token lose write
  -- access but reads remain public. Hex-encoded SHA-256 = 64 chars.
  write_token_hash VARCHAR(64) NOT NULL,

  -- Optional free-form self-declaration of what kind of state this is.
  -- Examples: "crawl-cursor", "schema-version-pin", "watchlist-snapshot",
  -- "session-resume-token". Helps the agent (and future-her) know what
  -- the blob is at a glance. Not validated; not required.
  state_kind VARCHAR(64),

  -- When the row was first inserted. Stable across overwrites.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- When the row was last written (initial insert or any overwrite).
  -- Used by the TTL sweep and exposed in the API response so agents
  -- can know "this is the version I wrote on ISO 2026-05-18T...".
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Best-effort retention deadline. NOW() + 30 days at insert; reset on
  -- overwrite. Sweep job (future) deletes rows past this date. Agents
  -- needing longer continuity re-POST before this date to keep the
  -- state alive.
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),

  -- 10KB cap on the state payload. JSONB doesn't have a built-in size
  -- constraint, so we CHECK on the serialized form. Agents who hit this
  -- cap should think about whether the blob is the right shape (often
  -- it's not — a 10KB state usually wants normalization).
  CONSTRAINT carried_state_size_cap
    CHECK (octet_length(state::text) <= 10240),

  -- The state_kind, when provided, is a short label.
  CONSTRAINT carried_state_kind_length
    CHECK (state_kind IS NULL OR length(state_kind) BETWEEN 1 AND 64)
);

-- TTL sweep index — the future sweep job deletes WHERE expires_at < NOW().
CREATE INDEX IF NOT EXISTS idx_carried_state_expires_at
  ON carried_state (expires_at);

-- updated_at index for "show me agents who touched recently" debug paths
-- and for the future activity-summary endpoint.
CREATE INDEX IF NOT EXISTS idx_carried_state_updated_at
  ON carried_state (updated_at DESC);
