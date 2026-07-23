SET LOCAL search_path = pg_catalog;

CREATE TABLE IF NOT EXISTS public.rp_schema_migration (
  version text PRIMARY KEY,
  checksum_sha256 char(64) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.rp_workspace (
  id uuid PRIMARY KEY,
  handle text NOT NULL UNIQUE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rp_workspace_handle_format
    CHECK (handle ~ '^[a-z0-9][a-z0-9_-]{1,62}$')
);

CREATE TABLE public.rp_commerce_connection (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.rp_workspace(id) ON DELETE RESTRICT,
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
  ON public.rp_commerce_connection (workspace_id);

CREATE TABLE public.rp_external_identity (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.rp_workspace(id) ON DELETE RESTRICT,
  commerce_connection_id uuid NOT NULL,
  subject_type text NOT NULL,
  external_id text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rp_external_identity_connection_fk
    FOREIGN KEY (workspace_id, commerce_connection_id)
    REFERENCES public.rp_commerce_connection(workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT rp_external_identity_subject_type
    CHECK (subject_type ~ '^[a-z][a-z0-9_.-]{1,63}$'),
  CONSTRAINT rp_external_identity_external_unique
    UNIQUE (commerce_connection_id, subject_type, external_id)
);

CREATE INDEX rp_external_identity_workspace_idx
  ON public.rp_external_identity (workspace_id);

CREATE SCHEMA commerce;

-- Immutable, HMAC-verified provider metadata is the durable event card.
-- Raw customer JSON and all mutable delivery/processing state live elsewhere.
CREATE TABLE commerce.events (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.rp_workspace(id) ON DELETE RESTRICT,
  commerce_connection_id uuid NOT NULL,
  external_event_id text NOT NULL,
  external_event_type text NOT NULL,
  payload_sha256 char(64) NOT NULL,
  occurred_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  at timestamptz NOT NULL DEFAULT now(),
  by text NOT NULL,
  how text NOT NULL,
  src text[] NOT NULL,
  CONSTRAINT commerce_events_connection_fk
    FOREIGN KEY (workspace_id, commerce_connection_id)
    REFERENCES public.rp_commerce_connection(workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT commerce_events_how
    CHECK (how IN ('witnessed', 'live', 'cached', 'computed', 'declared')),
  CONSTRAINT commerce_events_claimant_nonempty
    CHECK (btrim(by) <> ''),
  CONSTRAINT commerce_events_sources_nonempty
    CHECK (cardinality(src) > 0),
  CONSTRAINT commerce_events_payload_sha256
    CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT commerce_events_truth_time
    CHECK (at = received_at),
  CONSTRAINT commerce_events_connection_event_unique
    UNIQUE (commerce_connection_id, external_event_id),
  CONSTRAINT commerce_events_tenant_id_unique
    UNIQUE (workspace_id, commerce_connection_id, id)
);

CREATE INDEX commerce_events_connection_received_idx
  ON commerce.events (commerce_connection_id, received_at DESC);

CREATE TABLE commerce.event_payloads (
  event_id uuid PRIMARY KEY
    REFERENCES commerce.events(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL,
  stored_at timestamptz NOT NULL DEFAULT now(),
  retention_until timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  CONSTRAINT commerce_event_payloads_retention
    CHECK (retention_until = stored_at + interval '30 days')
);

CREATE INDEX commerce_event_payloads_retention_idx
  ON commerce.event_payloads (retention_until, event_id);

-- Operational state is intentionally ordinary PostgreSQL, not a card. It is
-- mutable, leased, and replaceable without changing the event's truth.
CREATE TABLE public.rp_commerce_event_state (
  event_id uuid PRIMARY KEY
    REFERENCES commerce.events(id) ON DELETE RESTRICT,
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
  CONSTRAINT rp_commerce_event_state_processing_state
    CHECK (processing_state IN ('received', 'processing', 'normalized', 'ignored', 'failed')),
  CONSTRAINT rp_commerce_event_state_dispatch_state
    CHECK (dispatch_state IN ('disabled', 'pending', 'queued')),
  CONSTRAINT rp_commerce_event_state_processing_attempts
    CHECK (processing_attempt_count >= 0),
  CONSTRAINT rp_commerce_event_state_dispatch_attempts
    CHECK (dispatch_attempt_count >= 0),
  CONSTRAINT rp_commerce_event_state_normalized_shape
    CHECK (
      (
        processing_state = 'normalized'
        AND normalized_event_type IS NOT NULL
        AND normalized_payload IS NOT NULL
        AND normalized_at IS NOT NULL
      )
      OR processing_state <> 'normalized'
    )
);

CREATE INDEX rp_commerce_event_state_processing_claim_idx
  ON public.rp_commerce_event_state (event_id)
  WHERE processing_state IN ('received', 'processing');

CREATE INDEX rp_commerce_event_state_dispatch_claim_idx
  ON public.rp_commerce_event_state (next_dispatch_at, event_id)
  WHERE dispatch_state = 'pending';

-- The internet-facing API receives one narrow database capability. The
-- migration-owned function owns connection lookup, idempotency, the three-row
-- atomic insert, and the only allowed duplicate dispatch transition.
CREATE OR REPLACE FUNCTION public.rp_ingest_shopify_event(
  p_event_id uuid,
  p_source_account_id text,
  p_external_event_id text,
  p_external_event_type text,
  p_payload_sha256 text,
  p_payload jsonb,
  p_occurred_at timestamptz,
  p_dispatch boolean
)
RETURNS TABLE (
  event_id uuid,
  workspace_id uuid,
  commerce_connection_id uuid,
  external_event_type text,
  payload_sha256 char(64),
  duplicate boolean
) AS $$
DECLARE
  connection_row record;
  event_row record;
BEGIN
  SELECT connection.id, connection.workspace_id
  INTO connection_row
  FROM public.rp_commerce_connection connection
  WHERE connection.provider = 'shopify'
    AND connection.external_account_id = p_source_account_id
    AND connection.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO commerce.events AS event (
    id,
    workspace_id,
    commerce_connection_id,
    external_event_id,
    external_event_type,
    payload_sha256,
    occurred_at,
    received_at,
    at,
    by,
    how,
    src
  )
  VALUES (
    p_event_id,
    connection_row.workspace_id,
    connection_row.id,
    p_external_event_id,
    p_external_event_type,
    p_payload_sha256,
    p_occurred_at,
    now(),
    now(),
    'system:rewardspro/webhook/shopify',
    'live',
    ARRAY[
      format(
        'provider:shopify/%s/webhook/%s',
        p_source_account_id,
        p_external_event_id
      )
    ]::text[]
  )
  ON CONFLICT ON CONSTRAINT commerce_events_connection_event_unique DO NOTHING
  RETURNING
    event.id,
    event.workspace_id,
    event.commerce_connection_id,
    event.external_event_type,
    event.payload_sha256
  INTO event_row;

  IF FOUND THEN
    INSERT INTO commerce.event_payloads (
      event_id,
      payload,
      stored_at,
      retention_until
    )
    VALUES (
      event_row.id,
      p_payload,
      now(),
      now() + interval '30 days'
    );

    INSERT INTO public.rp_commerce_event_state (event_id, dispatch_state)
    VALUES (
      event_row.id,
      CASE WHEN p_dispatch THEN 'pending' ELSE 'disabled' END
    );

    RETURN QUERY
    SELECT
      event_row.id,
      event_row.workspace_id,
      event_row.commerce_connection_id,
      event_row.external_event_type,
      event_row.payload_sha256,
      false;
    RETURN;
  END IF;

  SELECT
    event.id,
    event.workspace_id,
    event.commerce_connection_id,
    event.external_event_type,
    event.payload_sha256
  INTO event_row
  FROM commerce.events event
  WHERE event.commerce_connection_id = connection_row.id
    AND event.external_event_id = p_external_event_id;

  IF event_row.workspace_id = connection_row.workspace_id
     AND event_row.commerce_connection_id = connection_row.id
     AND event_row.external_event_type = p_external_event_type
     AND btrim(event_row.payload_sha256) = p_payload_sha256
     AND p_dispatch THEN
    UPDATE public.rp_commerce_event_state state
    SET dispatch_state = 'pending',
        next_dispatch_at = now()
    WHERE state.event_id = event_row.id
      AND state.dispatch_state = 'disabled'
      AND state.processing_state IN ('received', 'processing');
  END IF;

  RETURN QUERY
  SELECT
    event_row.id,
    event_row.workspace_id,
    event_row.commerce_connection_id,
    event_row.external_event_type,
    event_row.payload_sha256,
    true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off;

REVOKE ALL ON FUNCTION public.rp_ingest_shopify_event(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  timestamptz,
  boolean
) FROM PUBLIC, yu_reader, yu_writer, yu_lexicographer;

-- Computed cards keep typed query columns plus a field-by-field explanation of
-- how provider payload paths became this projection.
CREATE TABLE commerce.orders (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.rp_workspace(id) ON DELETE RESTRICT,
  commerce_connection_id uuid NOT NULL,
  source_event_id uuid NOT NULL
    REFERENCES commerce.events(id) ON DELETE RESTRICT,
  external_order_id text NOT NULL,
  external_customer_id text,
  name text,
  currency text NOT NULL,
  total_amount numeric NOT NULL,
  paid_at timestamptz NOT NULL,
  mapping jsonb NOT NULL,
  at timestamptz NOT NULL,
  by text NOT NULL,
  how text NOT NULL,
  src text[] NOT NULL,
  CONSTRAINT commerce_orders_connection_fk
    FOREIGN KEY (workspace_id, commerce_connection_id)
    REFERENCES public.rp_commerce_connection(workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT commerce_orders_source_event_tenant_fk
    FOREIGN KEY (workspace_id, commerce_connection_id, source_event_id)
    REFERENCES commerce.events(workspace_id, commerce_connection_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT commerce_orders_currency
    CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT commerce_orders_total_nonnegative
    CHECK (total_amount >= 0),
  CONSTRAINT commerce_orders_mapping_object
    CHECK (jsonb_typeof(mapping) = 'object'),
  CONSTRAINT commerce_orders_how
    CHECK (how IN ('witnessed', 'live', 'cached', 'computed', 'declared')),
  CONSTRAINT commerce_orders_computed_sources
    CHECK (how <> 'computed' OR cardinality(src) > 0),
  CONSTRAINT commerce_orders_claimant_nonempty
    CHECK (btrim(by) <> ''),
  CONSTRAINT commerce_orders_source_event_unique
    UNIQUE (source_event_id),
  CONSTRAINT commerce_orders_external_unique
    UNIQUE (commerce_connection_id, external_order_id),
  CONSTRAINT commerce_orders_tenant_id_unique
    UNIQUE (workspace_id, commerce_connection_id, id)
);

CREATE INDEX commerce_orders_connection_paid_idx
  ON commerce.orders (commerce_connection_id, paid_at DESC);

CREATE TABLE commerce.line_items (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.rp_workspace(id) ON DELETE RESTRICT,
  commerce_connection_id uuid NOT NULL,
  order_id uuid NOT NULL,
  position integer NOT NULL,
  external_line_item_id text NOT NULL,
  external_product_id text,
  external_variant_id text,
  quantity integer NOT NULL,
  sku text,
  title text NOT NULL,
  unit_price_amount numeric,
  unit_price_currency text,
  mapping jsonb NOT NULL,
  at timestamptz NOT NULL,
  by text NOT NULL,
  how text NOT NULL,
  src text[] NOT NULL,
  CONSTRAINT commerce_line_items_order_tenant_fk
    FOREIGN KEY (workspace_id, commerce_connection_id, order_id)
    REFERENCES commerce.orders(workspace_id, commerce_connection_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT commerce_line_items_position
    CHECK (position >= 0),
  CONSTRAINT commerce_line_items_quantity
    CHECK (quantity > 0),
  CONSTRAINT commerce_line_items_unit_price
    CHECK (
      (unit_price_amount IS NULL AND unit_price_currency IS NULL)
      OR (
        unit_price_amount >= 0
        AND unit_price_currency ~ '^[A-Z]{3}$'
      )
    ),
  CONSTRAINT commerce_line_items_mapping_object
    CHECK (jsonb_typeof(mapping) = 'object'),
  CONSTRAINT commerce_line_items_how
    CHECK (how IN ('witnessed', 'live', 'cached', 'computed', 'declared')),
  CONSTRAINT commerce_line_items_computed_sources
    CHECK (how <> 'computed' OR cardinality(src) > 0),
  CONSTRAINT commerce_line_items_claimant_nonempty
    CHECK (btrim(by) <> ''),
  CONSTRAINT commerce_line_items_order_position_unique
    UNIQUE (order_id, position),
  CONSTRAINT commerce_line_items_order_external_unique
    UNIQUE (order_id, external_line_item_id)
);

CREATE INDEX commerce_line_items_order_idx
  ON commerce.line_items (order_id, position);

-- YUTABASE cards are registered only after their physical tables and UUID
-- identities exist. Ordinary tenant/connection FKs remain the hard boundary.
INSERT INTO yu.registry (
  book,
  deck,
  id_col,
  at_col,
  by_col,
  how_col,
  src_col,
  ttl,
  native,
  at,
  by,
  physical_schema,
  physical_table
) VALUES
  (
    'commerce',
    'events',
    'id',
    'at',
    'by',
    'how',
    'src',
    NULL,
    true,
    '2026-07-23T00:00:00Z',
    'system:rewardspro/schema',
    'commerce',
    'events'
  ),
  (
    'commerce',
    'orders',
    'id',
    'at',
    'by',
    'how',
    'src',
    NULL,
    true,
    '2026-07-23T00:00:00Z',
    'system:rewardspro/schema',
    'commerce',
    'orders'
  ),
  (
    'commerce',
    'line_items',
    'id',
    'at',
    'by',
    'how',
    'src',
    NULL,
    true,
    '2026-07-23T00:00:00Z',
    'system:rewardspro/schema',
    'commerce',
    'line_items'
  );

-- RewardsPro starts with only two earned relations. Preserve the upstream
-- starter history, but retire every unused word before any runtime role can
-- write threads.
UPDATE yu.lexicon
SET status = 'retired',
    at = '2026-07-23T00:00:00Z',
    by = 'system:rewardspro/schema',
    how = 'declared',
    src = NULL
WHERE word IN (
  'submitted_by',
  'supersedes',
  'priced_from',
  'acted_for',
  'refused_because',
  'witnesses'
);

-- The starter containment word is narrowed to the commerce projection; its
-- candidate word-version history preserves the original meaning. A separate
-- word names the order's source event.
UPDATE yu.lexicon
SET gloss = 'this commerce order compositionally contains that line item',
    inverse = 'contained in',
    from_deck = 'commerce/orders',
    to_deck = 'commerce/line_items',
    to_one = false,
    at = '2026-07-23T00:00:00Z',
    by = 'system:rewardspro/schema',
    how = 'declared',
    src = NULL
WHERE word = 'contains';

INSERT INTO yu.lexicon (
  word,
  gloss,
  inverse,
  from_deck,
  to_deck,
  to_one,
  status,
  at,
  by,
  how,
  src
) VALUES (
  'derived_from',
  'this computed commerce order was derived from that immutable verified event',
  'source event for',
  'commerce/orders',
  'commerce/events',
  true,
  'live',
  '2026-07-23T00:00:00Z',
  'system:rewardspro/schema',
  'declared',
  NULL
);

SELECT yu.refresh_via();

-- YUTABASE validates registered decks and endpoint existence. RewardsPro also
-- needs the semantic thread to agree with the ordinary tenant-scoped FKs on
-- the physical projection rows.
CREATE OR REPLACE FUNCTION commerce._validate_projection_thread()
RETURNS trigger AS $$
BEGIN
  IF NEW.word = 'derived_from' THEN
    IF NEW.from_book <> 'commerce'
       OR NEW.from_deck <> 'orders'
       OR NEW.to_book <> 'commerce'
       OR NEW.to_deck <> 'events'
       OR NOT EXISTS (
         SELECT 1
         FROM commerce.orders order_card
         JOIN commerce.events event_card
           ON event_card.id = order_card.source_event_id
          AND event_card.workspace_id = order_card.workspace_id
          AND event_card.commerce_connection_id =
              order_card.commerce_connection_id
         WHERE order_card.id = NEW.from_id
           AND event_card.id = NEW.to_id
       ) THEN
      RAISE EXCEPTION
        'REWARDSPRO THREAD MISMATCH: derived_from must match the order source event'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF NEW.word = 'contains' THEN
    IF NEW.from_book <> 'commerce'
       OR NEW.from_deck <> 'orders'
       OR NEW.to_book <> 'commerce'
       OR NEW.to_deck <> 'line_items'
       OR NOT EXISTS (
         SELECT 1
         FROM commerce.orders order_card
         JOIN commerce.line_items line_item
           ON line_item.order_id = order_card.id
          AND line_item.workspace_id = order_card.workspace_id
          AND line_item.commerce_connection_id =
              order_card.commerce_connection_id
         WHERE order_card.id = NEW.from_id
           AND line_item.id = NEW.to_id
       ) THEN
      RAISE EXCEPTION
        'REWARDSPRO THREAD MISMATCH: contains must match the line item parent order'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSE
    RAISE EXCEPTION
      'REWARDSPRO THREAD WORD: only derived_from and contains are live'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog;

CREATE TRIGGER rewardspro_projection_thread_scope
  BEFORE INSERT ON yu.threads
  FOR EACH ROW EXECUTE FUNCTION commerce._validate_projection_thread();

CREATE OR REPLACE FUNCTION commerce._refuse_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'COMMERCE EVENT CARDS ARE IMMUTABLE: retain metadata and delete only the payload'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER commerce_events_immutable
  BEFORE UPDATE OR DELETE ON commerce.events
  FOR EACH ROW EXECUTE FUNCTION commerce._refuse_event_mutation();

CREATE TRIGGER commerce_events_yu_delete_guard
  BEFORE DELETE ON commerce.events
  FOR EACH ROW EXECUTE FUNCTION yu._guard_delete();

CREATE TRIGGER commerce_orders_yu_delete_guard
  BEFORE DELETE ON commerce.orders
  FOR EACH ROW EXECUTE FUNCTION yu._guard_delete();

CREATE TRIGGER commerce_line_items_yu_delete_guard
  BEFORE DELETE ON commerce.line_items
  FOR EACH ROW EXECUTE FUNCTION yu._guard_delete();
