-- 0130_evm_wallet_links.sql
--
-- Verified, non-custodial EVM wallet links for Cambridge participants.
-- This migration does not create wallets, hold keys, move assets, or make a
-- wallet an identity/KYC credential.  It records a short-lived EIP-4361
-- proof that one authenticated Cambridge session controlled one address at
-- one moment on the Base Sepolia test network.
--
-- Challenges keep the exact message that was signed and a digest of its
-- nonce/session token. The raw nonce necessarily remains inside that exact
-- EIP-4361 message; nonce_digest exists for indexing and replay correlation,
-- not nonce secrecy. Raw Cambridge session tokens are never persisted.
-- A partial unique index is the database-level guard that one address can
-- have only one active Cambridge owner at a time.

CREATE TABLE IF NOT EXISTS evm_wallet_link_challenges (
  id                        UUID PRIMARY KEY,
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  chain_namespace           TEXT NOT NULL DEFAULT 'eip155',
  chain_id                  BIGINT NOT NULL DEFAULT 84532,
  chain_ref                 TEXT NOT NULL DEFAULT 'eip155:84532',
  address                   VARCHAR(42) NOT NULL,
  address_key               CHAR(42) NOT NULL,

  -- SHA-256 correlation digests. The nonce remains visible inside `message`,
  -- as EIP-4361 requires; nonce_digest is the indexed replay-correlation key.
  -- session_binding_digest binds verification to the exact authenticated
  -- browser session that requested the challenge without storing its token.
  nonce_digest              CHAR(64) NOT NULL,
  session_binding_digest    CHAR(64) NOT NULL,

  request_id                TEXT NOT NULL,
  domain                    TEXT NOT NULL,
  origin                    TEXT NOT NULL,
  statement                 TEXT NOT NULL,
  message                   TEXT NOT NULL,
  issued_at                 TIMESTAMPTZ NOT NULL,
  expires_at                TIMESTAMPTZ NOT NULL,
  verification_attempt_count INTEGER NOT NULL DEFAULT 0,
  verification_last_attempt_at TIMESTAMPTZ,
  consumed_at               TIMESTAMPTZ,
  invalidated_at            TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT evm_wallet_link_challenges_base_sepolia_only CHECK (
    chain_namespace = 'eip155'
    AND chain_id = 84532
    AND chain_ref = 'eip155:84532'
  ),
  CONSTRAINT evm_wallet_link_challenges_address_shape CHECK (
    address ~ '^0x[0-9A-Fa-f]{40}$'
    AND address_key ~ '^0x[0-9a-f]{40}$'
    AND LOWER(address) = address_key
  ),
  CONSTRAINT evm_wallet_link_challenges_nonce_digest_shape CHECK (
    nonce_digest ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT evm_wallet_link_challenges_session_digest_shape CHECK (
    session_binding_digest ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT evm_wallet_link_challenges_five_minutes CHECK (
    expires_at = issued_at + INTERVAL '5 minutes'
  ),
  CONSTRAINT evm_wallet_link_challenges_attempt_count_valid CHECK (
    verification_attempt_count BETWEEN 0 AND 5
  ),
  CONSTRAINT evm_wallet_link_challenges_attempt_time_valid CHECK (
    (
      verification_attempt_count = 0
      AND verification_last_attempt_at IS NULL
    )
    OR (
      verification_attempt_count > 0
      AND verification_last_attempt_at IS NOT NULL
      AND verification_last_attempt_at >= issued_at
    )
  ),
  CONSTRAINT evm_wallet_link_challenges_terminal_order CHECK (
    (consumed_at IS NULL OR consumed_at >= issued_at)
    AND (invalidated_at IS NULL OR invalidated_at >= issued_at)
    AND NOT (consumed_at IS NOT NULL AND invalidated_at IS NOT NULL)
  ),
  CONSTRAINT evm_wallet_link_challenges_nonce_unique UNIQUE (nonce_digest),
  -- Composite proof references use this key so a link cannot cite another
  -- user's challenge or a challenge for a different chain/address.
  CONSTRAINT evm_wallet_link_challenges_provenance_unique UNIQUE (
    id,
    user_id,
    chain_id,
    address_key
  )
);

CREATE INDEX IF NOT EXISTS evm_wallet_link_challenges_owner_pending_idx
  ON evm_wallet_link_challenges (
    user_id,
    session_binding_digest,
    expires_at DESC
  )
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;

-- Supports the conservative authenticated issuance cap and the atomic
-- per-user verification-attempt budget over the preceding hour.
CREATE INDEX IF NOT EXISTS evm_wallet_link_challenges_owner_issued_idx
  ON evm_wallet_link_challenges (user_id, issued_at DESC);

-- Append-only accounting for the rolling user/hour verification budget.
-- Each row records only when an attempt was reserved and the complete
-- challenge identity it was reserved against; signatures and proof contents
-- never enter this ledger.
CREATE TABLE IF NOT EXISTS evm_wallet_link_verification_attempts (
  id             BIGSERIAL PRIMARY KEY,
  challenge_id   UUID NOT NULL,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chain_id       BIGINT NOT NULL,
  address_key    CHAR(42) NOT NULL,
  attempted_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),

  CONSTRAINT evm_wallet_link_verification_attempts_challenge_provenance_fk
    FOREIGN KEY (
      challenge_id,
      user_id,
      chain_id,
      address_key
    ) REFERENCES evm_wallet_link_challenges (
      id,
      user_id,
      chain_id,
      address_key
    ) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS evm_wallet_link_verification_attempts_owner_time_idx
  ON evm_wallet_link_verification_attempts (user_id, attempted_at DESC);

CREATE TABLE IF NOT EXISTS evm_wallet_links (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  chain_namespace             TEXT NOT NULL DEFAULT 'eip155',
  chain_id                    BIGINT NOT NULL DEFAULT 84532,
  chain_ref                   TEXT NOT NULL DEFAULT 'eip155:84532',
  address                     VARCHAR(42) NOT NULL,
  address_key                 CHAR(42) NOT NULL,

  -- The signature itself is not retained.  The digest plus the immutable
  -- challenge message is enough to correlate an operator-side proof without
  -- turning Cambridge into a signature warehouse.
  proof_kind                  TEXT NOT NULL,
  verification_method         TEXT NOT NULL,
  last_signature_digest       CHAR(64) NOT NULL,
  proof_scope_version         TEXT NOT NULL DEFAULT 'wallet-control-v1',
  initial_challenge_id        UUID NOT NULL,
  last_verified_challenge_id  UUID NOT NULL,

  linked_at                   TIMESTAMPTZ NOT NULL,
  last_verified_at            TIMESTAMPTZ NOT NULL,
  revoked_at                  TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT evm_wallet_links_base_sepolia_only CHECK (
    chain_namespace = 'eip155'
    AND chain_id = 84532
    AND chain_ref = 'eip155:84532'
  ),
  CONSTRAINT evm_wallet_links_address_shape CHECK (
    address ~ '^0x[0-9A-Fa-f]{40}$'
    AND address_key ~ '^0x[0-9a-f]{40}$'
    AND LOWER(address) = address_key
  ),
  CONSTRAINT evm_wallet_links_proof_kind_valid CHECK (
    proof_kind IN ('eoa', 'erc1271', 'erc6492', 'smart_contract_unclassified')
  ),
  CONSTRAINT evm_wallet_links_verification_method_valid CHECK (
    verification_method IN (
      'viem_eoa_local',
      'viem_base_sepolia_public_client'
    )
  ),
  CONSTRAINT evm_wallet_links_proof_scope_version_valid CHECK (
    proof_scope_version = 'wallet-control-v1'
  ),
  CONSTRAINT evm_wallet_links_signature_digest_shape CHECK (
    last_signature_digest ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT evm_wallet_links_time_order CHECK (
    last_verified_at >= linked_at
    AND (revoked_at IS NULL OR revoked_at >= linked_at)
  ),
  -- Deferred NO ACTION preserves challenge history during ordinary writes,
  -- while allowing one user deletion to cascade through links and challenges.
  CONSTRAINT evm_wallet_links_initial_challenge_provenance_fk FOREIGN KEY (
    initial_challenge_id,
    user_id,
    chain_id,
    address_key
  ) REFERENCES evm_wallet_link_challenges (
    id,
    user_id,
    chain_id,
    address_key
  ) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT evm_wallet_links_latest_challenge_provenance_fk FOREIGN KEY (
    last_verified_challenge_id,
    user_id,
    chain_id,
    address_key
  ) REFERENCES evm_wallet_link_challenges (
    id,
    user_id,
    chain_id,
    address_key
  ) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED
);

-- The ownership invariant: a Base Sepolia address has at most one active
-- Cambridge account.  Revoked history remains auditable and can be relinked
-- only after a fresh five-minute proof.
CREATE UNIQUE INDEX IF NOT EXISTS evm_wallet_links_one_active_owner_idx
  ON evm_wallet_links (chain_id, address_key)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS evm_wallet_links_owner_active_idx
  ON evm_wallet_links (user_id, linked_at DESC, id DESC)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE evm_wallet_links IS
  'Participant-only, non-custodial proof-of-control links for Base Sepolia. '
  'A link is not identity, KYC, ownership of funds, or spending authority.';

COMMENT ON TABLE evm_wallet_link_challenges IS
  'Five-minute, one-use EIP-4361 challenges bound to an authenticated Cambridge '
  'session. Exact signed message retained; raw session token never retained.';

COMMENT ON TABLE evm_wallet_link_verification_attempts IS
  'Proof-free reservation ledger for exact rolling user verification budgets. '
  'Timestamps come from the database clock after the caller acquires its locks.';
