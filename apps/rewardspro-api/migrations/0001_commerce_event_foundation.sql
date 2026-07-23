CREATE TABLE IF NOT EXISTS rp_schema_migration (
  version text PRIMARY KEY,
  checksum_sha256 char(64) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rp_workspace (
  id uuid PRIMARY KEY,
  handle text NOT NULL UNIQUE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rp_workspace_handle_format
    CHECK (handle ~ '^[a-z0-9][a-z0-9_-]{1,62}$')
);

CREATE TABLE rp_commerce_connection (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES rp_workspace(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  external_account_id text NOT NULL,
  display_name text,
  status text NOT NULL DEFAULT 'active',
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  sync_cursor jsonb,
  credential_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rp_commerce_connection_provider
    CHECK (provider ~ '^[a-z][a-z0-9_-]{1,31}$'),
  CONSTRAINT rp_commerce_connection_shopify_account_canonical
    CHECK (
      provider <> 'shopify'
      OR (
        external_account_id = lower(external_account_id)
        AND external_account_id ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'
      )
    ),
  CONSTRAINT rp_commerce_connection_status
    CHECK (status IN ('active', 'disabled')),
  CONSTRAINT rp_commerce_connection_capabilities_array
    CHECK (jsonb_typeof(capabilities) = 'array'),
  CONSTRAINT rp_commerce_connection_provider_account_unique
    UNIQUE (provider, external_account_id),
  CONSTRAINT rp_commerce_connection_workspace_id_id_unique
    UNIQUE (workspace_id, id)
);

CREATE INDEX rp_commerce_connection_workspace_idx
  ON rp_commerce_connection (workspace_id);

CREATE TABLE rp_external_identity (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES rp_workspace(id) ON DELETE RESTRICT,
  commerce_connection_id uuid NOT NULL,
  subject_type text NOT NULL,
  external_id text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rp_external_identity_connection_fk
    FOREIGN KEY (workspace_id, commerce_connection_id)
    REFERENCES rp_commerce_connection(workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT rp_external_identity_subject_type
    CHECK (subject_type ~ '^[a-z][a-z0-9_.-]{1,63}$'),
  CONSTRAINT rp_external_identity_external_unique
    UNIQUE (commerce_connection_id, subject_type, external_id)
);

CREATE INDEX rp_external_identity_workspace_idx
  ON rp_external_identity (workspace_id);

CREATE TABLE rp_commerce_event (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES rp_workspace(id) ON DELETE RESTRICT,
  commerce_connection_id uuid NOT NULL,
  external_event_id text NOT NULL,
  external_event_type text NOT NULL,
  payload jsonb NOT NULL,
  payload_sha256 char(64) NOT NULL,
  occurred_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload_retention_until timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  processing_state text NOT NULL DEFAULT 'received',
  processing_attempt_count integer NOT NULL DEFAULT 0,
  processing_lease_token uuid,
  processing_lease_until timestamptz,
  normalized_event_type text,
  normalized_payload jsonb,
  normalized_at timestamptz,
  last_processing_error_code text,
  dispatch_state text NOT NULL DEFAULT 'disabled',
  dispatch_attempt_count integer NOT NULL DEFAULT 0,
  dispatch_lease_token uuid,
  dispatch_lease_until timestamptz,
  next_dispatch_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  last_dispatch_error_code text,
  CONSTRAINT rp_commerce_event_connection_fk
    FOREIGN KEY (workspace_id, commerce_connection_id)
    REFERENCES rp_commerce_connection(workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT rp_commerce_event_processing_state
    CHECK (processing_state IN ('received', 'processing', 'normalized', 'ignored', 'failed')),
  CONSTRAINT rp_commerce_event_dispatch_state
    CHECK (dispatch_state IN ('disabled', 'pending', 'queued')),
  CONSTRAINT rp_commerce_event_payload_sha256
    CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT rp_commerce_event_connection_event_unique
    UNIQUE (commerce_connection_id, external_event_id),
  CONSTRAINT rp_commerce_event_payload_retention
    CHECK (payload_retention_until > received_at),
  CONSTRAINT rp_commerce_event_normalized_shape
    CHECK (
      (processing_state = 'normalized'
        AND normalized_event_type IS NOT NULL
        AND normalized_payload IS NOT NULL
        AND normalized_at IS NOT NULL)
      OR processing_state <> 'normalized'
    )
);

CREATE INDEX rp_commerce_event_connection_received_idx
  ON rp_commerce_event (commerce_connection_id, received_at DESC);

CREATE INDEX rp_commerce_event_processing_claim_idx
  ON rp_commerce_event (received_at)
  WHERE processing_state IN ('received', 'processing');

CREATE INDEX rp_commerce_event_dispatch_claim_idx
  ON rp_commerce_event (next_dispatch_at)
  WHERE dispatch_state = 'pending';
