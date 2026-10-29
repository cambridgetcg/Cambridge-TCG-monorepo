-- Evidence-backed links from a source's own product to a Cambridge SKU, and
-- from a source's own set to a canonical set code. Observations stay
-- immutable: derivation resolves SKUs through the live crosswalk when it runs,
-- and re-mapping supersedes the live row rather than editing it, so history
-- shows what each run could have used. Exact needs the source's own collector
-- identifiers as evidence (e.g. title:OP01-001 [P]); a name match is not one.
-- No row is written here.
CREATE TABLE price_source_crosswalks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source text NOT NULL REFERENCES member_price_source_releases(source),
  source_product_id text NOT NULL CHECK (source_product_id <> ''),
  -- NULL is an unknown scope. Empty text is refused so the live key below
  -- cannot confuse the two.
  finish text CHECK (finish <> ''),
  language text CHECK (language <> ''),
  sku text,
  game text NOT NULL CHECK (game <> ''),
  set_code text,
  mapping_status text NOT NULL CHECK (mapping_status IN ('exact','ambiguous')),
  evidence text NOT NULL CHECK (btrim(evidence) <> ''),
  crosswalk_version text NOT NULL CHECK (btrim(crosswalk_version) <> ''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at timestamptz,
  CHECK ((mapping_status = 'exact' AND sku IS NOT NULL AND set_code IS NOT NULL)
      OR (mapping_status = 'ambiguous' AND sku IS NULL AND set_code IS NULL)),
  CHECK (superseded_at IS NULL OR superseded_at >= created_at)
);
CREATE UNIQUE INDEX price_source_crosswalks_live
  ON price_source_crosswalks (source, source_product_id, COALESCE(finish, ''), COALESCE(language, ''))
  WHERE superseded_at IS NULL;
CREATE INDEX price_source_crosswalks_sku
  ON price_source_crosswalks (sku) WHERE superseded_at IS NULL AND mapping_status = 'exact';

CREATE TABLE price_source_set_crosswalks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source text NOT NULL REFERENCES member_price_source_releases(source),
  source_set_key text NOT NULL CHECK (btrim(source_set_key) <> ''),
  game text NOT NULL CHECK (game <> ''),
  set_code text NOT NULL CHECK (set_code ~ '^[a-z0-9]+$'),
  evidence text NOT NULL CHECK (btrim(evidence) <> ''),
  crosswalk_version text NOT NULL CHECK (btrim(crosswalk_version) <> ''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at timestamptz,
  CHECK (superseded_at IS NULL OR superseded_at >= created_at)
);
-- A source's set keys need not be unique across games (CardRush runs one
-- host per game), so the game is part of the live key.
CREATE UNIQUE INDEX price_source_set_crosswalks_live
  ON price_source_set_crosswalks (source, game, source_set_key)
  WHERE superseded_at IS NULL;

-- History is append-only. The one permitted change closes a live row, and
-- only at the time of closing: a superseded_at later than now would leave the
-- row out of the live key at once while history claimed it was live until
-- then; one earlier than this transaction would rewrite which mapping past
-- runs used.
CREATE FUNCTION price_source_crosswalk_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.superseded_at IS NULL AND NEW.superseded_at IS NOT NULL
     AND NEW.superseded_at BETWEEN transaction_timestamp() AND clock_timestamp()
     AND to_jsonb(NEW) - 'superseded_at' = to_jsonb(OLD) - 'superseded_at' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'price source crosswalks are append-only; supersede the live row instead';
END $$;
CREATE TRIGGER price_source_crosswalks_guard BEFORE UPDATE OR DELETE ON price_source_crosswalks
  FOR EACH ROW EXECUTE FUNCTION price_source_crosswalk_guard();
CREATE TRIGGER price_source_set_crosswalks_guard BEFORE UPDATE OR DELETE ON price_source_set_crosswalks
  FOR EACH ROW EXECUTE FUNCTION price_source_crosswalk_guard();
-- Row triggers never fire on TRUNCATE, so it gets its own statement trigger.
-- The guard permits only a row-level UPDATE, so here it always refuses.
CREATE TRIGGER price_source_crosswalks_truncate_guard BEFORE TRUNCATE ON price_source_crosswalks
  FOR EACH STATEMENT EXECUTE FUNCTION price_source_crosswalk_guard();
CREATE TRIGGER price_source_set_crosswalks_truncate_guard BEFORE TRUNCATE ON price_source_set_crosswalks
  FOR EACH STATEMENT EXECUTE FUNCTION price_source_crosswalk_guard();

-- The same honesty on the way in: a row enters live, stamped by this
-- transaction. A pre-closed or backdated insert would let two mappings be
-- live for one product at one point in history.
CREATE FUNCTION price_source_crosswalk_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.superseded_at IS NOT NULL
     OR NEW.created_at NOT BETWEEN transaction_timestamp() AND clock_timestamp() THEN
    RAISE EXCEPTION 'price source crosswalks enter live and stamped now; supersede the live row instead';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER price_source_crosswalks_insert_guard BEFORE INSERT ON price_source_crosswalks
  FOR EACH ROW EXECUTE FUNCTION price_source_crosswalk_insert_guard();
CREATE TRIGGER price_source_set_crosswalks_insert_guard BEFORE INSERT ON price_source_set_crosswalks
  FOR EACH ROW EXECUTE FUNCTION price_source_crosswalk_insert_guard();
