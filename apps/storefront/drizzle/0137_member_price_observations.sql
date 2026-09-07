-- Native member observations. No legacy migration/backfill, no zero sentinels.
-- No collector is scheduled or run by this migration. Runtime revocation is an
-- UPDATE of member_price_source_releases; deployments cannot undo that choice.
CREATE TABLE member_price_source_releases (
  source text PRIMARY KEY CHECK (source IN ('cardmarket','scryfall')),
  evidence_version text NOT NULL,
  evidence_url text NOT NULL,
  member_display boolean NOT NULL DEFAULT false,
  member_api boolean NOT NULL DEFAULT false,
  member_download boolean NOT NULL DEFAULT false,
  revoked_at timestamptz,
  CHECK (source <> 'scryfall' OR (NOT member_api AND NOT member_download))
);
INSERT INTO member_price_source_releases VALUES
 ('cardmarket','member-prices/2026-09-07.1','https://www.cardmarket.com/en/Insight/Articles/the-state-of-cardmarket-2024',true,true,true,NULL),
 ('scryfall','member-prices/2026-09-07.1','https://scryfall.com/docs/api#use-of-scryfall-data-and-images',true,false,false,NULL);

-- Allocate ID *after* serialization lock. A lower-ID batch cannot commit after
-- a higher-ID batch. Readers' committed MAX(id) is therefore a closed ceiling.
CREATE TABLE member_price_batches (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ingest_key text NOT NULL UNIQUE,
  source text NOT NULL REFERENCES member_price_source_releases(source),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  writer_transaction bigint NOT NULL DEFAULT txid_current(),
  source_rows integer NOT NULL CHECK (source_rows >= 0),
  missing_prices integer NOT NULL CHECK (missing_prices >= 0),
  quarantine jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE FUNCTION member_price_batch_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Writer takes this lock before issuing INSERT (before identity allocation).
  -- The trigger independently denies callers that omit the acquisition order.
  IF NOT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid()
    AND classid=137 AND objid=1 AND objsubid=2 AND mode='ExclusiveLock' AND granted) THEN
    RAISE EXCEPTION 'member price writer must acquire advisory xact lock (137,1) before allocating batch';
  END IF;
  IF NEW.writer_transaction <> txid_current() THEN RAISE EXCEPTION 'invalid writer transaction'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER member_price_batch_lock BEFORE INSERT ON member_price_batches FOR EACH ROW EXECUTE FUNCTION member_price_batch_lock();

CREATE TABLE member_price_observations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id bigint NOT NULL REFERENCES member_price_batches(id),
  observation_key text NOT NULL UNIQUE,
  source text NOT NULL REFERENCES member_price_source_releases(source),
  source_product_id text NOT NULL,
  sku text,
  mapping_status text NOT NULL CHECK (mapping_status IN ('exact','unmapped','ambiguous')),
  game text NOT NULL,
  set_code text,
  product_name text,
  granularity text NOT NULL CHECK (granularity IN ('source-product','printing')),
  finish text,
  language text,
  condition text,
  metric text NOT NULL,
  amount numeric(18,6) NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency IN ('EUR','USD')),
  underlying_market text NOT NULL CHECK (underlying_market IN ('cardmarket','tcgplayer')),
  source_updated_at timestamptz NOT NULL,
  retrieved_at timestamptz NOT NULL,
  source_url text NOT NULL,
  parser_version text NOT NULL,
  crosswalk_version text NOT NULL,
  evidence_version text NOT NULL,
  artifact_sha256 text NOT NULL CHECK (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  catalog_source_url text,
  catalog_updated_at timestamptz,
  catalog_artifact_sha256 text CHECK (catalog_artifact_sha256 ~ '^[a-f0-9]{64}$'),
  quality text NOT NULL CHECK (quality = 'accepted'),
  CHECK ((mapping_status='exact' AND sku IS NOT NULL AND set_code IS NOT NULL) OR (mapping_status<>'exact' AND sku IS NULL AND set_code IS NULL))
);
CREATE INDEX member_price_observations_batch ON member_price_observations(batch_id,id);
CREATE INDEX member_price_observations_lookup ON member_price_observations(source,game,sku,metric,source_updated_at DESC);
CREATE FUNCTION member_price_observation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM member_price_batches b WHERE b.id=NEW.batch_id AND b.source=NEW.source AND b.writer_transaction=txid_current()) THEN
    RAISE EXCEPTION 'observations may only enter their original uncommitted batch';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER member_price_observation_guard BEFORE INSERT ON member_price_observations FOR EACH ROW EXECUTE FUNCTION member_price_observation_guard();
CREATE FUNCTION member_price_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'member price evidence is append-only; use source release revocation'; END $$;
CREATE TRIGGER member_price_batches_immutable BEFORE UPDATE OR DELETE ON member_price_batches FOR EACH ROW EXECUTE FUNCTION member_price_immutable();
CREATE TRIGGER member_price_observations_immutable BEFORE UPDATE OR DELETE ON member_price_observations FOR EACH ROW EXECUTE FUNCTION member_price_immutable();
