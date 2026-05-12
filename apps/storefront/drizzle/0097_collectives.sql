-- Collectives — multi-member identities with one decision and one collection.
-- See docs/connections/the-collective.md for the meaning, and
-- docs/connections/the-tailored-doors.md (#17) door 3 for the cultural intent.
--
-- A collective is NOT a group chat and NOT a list of users. It is a
-- *first-class actor_kind* — a Tokyo LGS, a Bristol card club, a research
-- lab, a tournament guild. Two things compose to make a collective:
--
--   1. A steward (steward_user_id) — the canonical decision-maker. Every
--      collective has exactly one. Stewardship can be transferred via an
--      admin-mediated process (not v1).
--
--   2. A set of consenting members (collective_members). Membership is
--      bilateral: stewards invite (consent_at NULL); users accept
--      (consent_at populated). A user can leave at any time (left_at).
--      The substrate is honest about consent — `is_member` is a function
--      of (consent_at IS NOT NULL AND left_at IS NULL).
--
-- The collective participates in the commons (docs/connections/the-commons.md
-- #15) as a member-of-its-own-kind. It is the cultural unit the platform
-- has been built without, until now — a Tokyo LGS and a Bristol LGS
-- exchanging culture through TCG is the canonical purpose-statement of
-- the commons, made concrete by these two tables.

CREATE TABLE IF NOT EXISTS collectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- URL slug (e.g. /c/tokyo-card-lounge). Lowercase, hyphen-separated.
  slug VARCHAR(48) UNIQUE NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  -- What kind of collective. Free-form for now; suggested values:
  --   'shop' | 'club' | 'guild' | 'lab' | 'tournament-collective' | 'other'
  -- Kept as VARCHAR rather than enum to remain substrate-honest about
  -- a vocabulary that will grow before it crystallizes.
  kind VARCHAR(48) NOT NULL,
  -- Free-form locality (e.g. "Shibuya, Tokyo, JP"). Not an enum because
  -- the platform refuses to flatten geography into a closed list.
  region TEXT,
  -- Languages this collective speaks. ISO 639-1 codes when applicable;
  -- free-form when the codes don't capture (sign languages, etc).
  languages TEXT[] NOT NULL DEFAULT '{}',
  description TEXT,
  -- House rules / local format declarations. Markdown welcome.
  house_rules TEXT,
  -- The canonical decision-maker. Every collective has exactly one
  -- steward at any moment. Cascade on user deletion is *intentional* —
  -- a stewardless collective is a substrate-honesty violation; the
  -- transfer flow (admin-mediated) is the correct way to keep the
  -- collective alive past a steward's departure.
  steward_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Public visibility. Collective can exist privately while assembling
  -- members before its first public appearance.
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT collectives_slug_format
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'),
  CONSTRAINT collectives_kind_values
    CHECK (kind IN ('shop','club','guild','lab','tournament-collective','other'))
);

CREATE INDEX IF NOT EXISTS idx_collectives_steward
  ON collectives(steward_user_id);

CREATE INDEX IF NOT EXISTS idx_collectives_public
  ON collectives(is_public) WHERE is_public = TRUE;

CREATE TABLE IF NOT EXISTS collective_members (
  collective_id UUID NOT NULL REFERENCES collectives(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'steward' | 'admin' | 'member'. Steward role is also recorded on
  -- the collectives.steward_user_id column for fast lookup; this row
  -- mirrors it so the membership table is the single source of truth
  -- for "who is in this collective?".
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  -- Per-member visibility. A member may be in the collective without
  -- publicly showing it.
  visibility VARCHAR(20) NOT NULL DEFAULT 'public',
  -- Substrate-honest membership lifecycle:
  --   invited_at  — when the steward invited (always populated).
  --   consent_at  — when the user accepted (NULL = pending invite).
  --   left_at     — when the user left (NULL = still a member).
  --
  -- is_active_member = (consent_at IS NOT NULL AND left_at IS NULL).
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consent_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  PRIMARY KEY (collective_id, user_id),
  CONSTRAINT collective_members_role_values
    CHECK (role IN ('steward','admin','member')),
  CONSTRAINT collective_members_visibility_values
    CHECK (visibility IN ('public','private'))
);

CREATE INDEX IF NOT EXISTS idx_collective_members_user_active
  ON collective_members(user_id)
  WHERE consent_at IS NOT NULL AND left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_collective_members_pending
  ON collective_members(user_id)
  WHERE consent_at IS NULL AND left_at IS NULL;
