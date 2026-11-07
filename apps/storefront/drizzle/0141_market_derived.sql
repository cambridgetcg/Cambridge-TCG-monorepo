-- Cambridge-derived market data, method ctcg.market-derived/v1 (contract:
-- packages/data-spec/src/market-derived.ts). Append-only. This migration
-- schedules and runs nothing. The derivation job (/api/cron/derive/market)
-- writes these tables only while DATA_DERIVE_MARKET is on, and the data-API
-- routes (/api/v1/market/*) read them only while DATA_API_READS is on.
-- A run and its rows commit in one transaction: rows may enter only their own
-- uncommitted run, so a committed run is complete and never gains rows.
-- Revocation is a read-time check of every listed source's release row; rows
-- are never rewritten. A changed method is a new method_version.

-- Each source is its own market. Scryfall is never a derivation source.
-- Canonical form: distinct, ascending (C collation), one-dimensional.
CREATE FUNCTION market_sources_valid(sources text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE(
    cardinality(sources) >= 1 AND array_ndims(sources) = 1 AND array_lower(sources, 1) = 1
    AND array_position(sources, NULL) IS NULL
    AND sources <@ ARRAY['cardmarket','cardrush','tcgplayer']::text[]
    AND NOT EXISTS (SELECT 1 FROM generate_subscripts(sources, 1) AS i
                    WHERE i > 1 AND sources[i - 1] COLLATE "C" >= sources[i] COLLATE "C"),
    false)
$$;

-- A premium side's language basis: the ISO 639-1 languages of the values it
-- compared, '*' for a value recorded with no language (a source's
-- product-level aggregate, as Cardmarket's, spans every language the product
-- is listed in). Canonical form: distinct, ascending (C collation, so '*'
-- first), one-dimensional.
CREATE FUNCTION market_language_basis_valid(languages text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE(
    cardinality(languages) >= 1 AND array_ndims(languages) = 1 AND array_lower(languages, 1) = 1
    AND array_position(languages, NULL) IS NULL
    AND NOT EXISTS (SELECT 1 FROM unnest(languages) AS l(language) WHERE l.language !~ '^(?:[a-z]{2}|[*])$')
    AND NOT EXISTS (SELECT 1 FROM generate_subscripts(languages, 1) AS i
                    WHERE i > 1 AND languages[i - 1] COLLATE "C" >= languages[i] COLLATE "C"),
    false)
$$;

-- Derivation evidence version per contributing source, e.g.
-- {"cardmarket":"cardmarket-derivation/2026-10-28.1"}.
CREATE FUNCTION market_input_evidence_valid(evidence jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN jsonb_typeof(evidence) IS DISTINCT FROM 'object' OR evidence = '{}'::jsonb THEN false
    WHEN evidence - ARRAY['cardmarket','cardrush','tcgplayer'] <> '{}'::jsonb THEN false
    ELSE NOT EXISTS (SELECT 1 FROM jsonb_each(evidence) AS e(source, version)
                     WHERE jsonb_typeof(version) <> 'string' OR char_length(version #>> '{}') NOT BETWEEN 1 AND 200)
  END
$$;

-- GBP crosses as used: {"EUR":{"rate":"1.1534","source":"ecb.europa.eu",
-- "as_of":"2026-10-27"}}, rate = currency units per 1 GBP, as decimal text.
-- ECB publishes rates against the euro only, so each rate is a cross: the
-- currency's EUR quote / ECB's GBP quote, exact decimal division, half-up to
-- 12 places (crossRate in packages/data-spec).
-- Never fallback, never after the derivation date, and at most 7 days before
-- it (ECB publishes on business days only). CASE fixes evaluation order so
-- malformed text is refused rather than cast; make_date keeps this immutable
-- (an impossible calendar date such as 2026-02-30 raises, which also refuses).
CREATE FUNCTION market_fx_record_valid(fx jsonb, run_as_of date) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN jsonb_typeof(fx) IS DISTINCT FROM 'object' THEN false
    WHEN fx - ARRAY['EUR','JPY','USD'] <> '{}'::jsonb THEN false
    ELSE NOT EXISTS (SELECT 1 FROM jsonb_each(fx) AS q(currency, quote) WHERE CASE
      WHEN jsonb_typeof(quote) <> 'object' THEN true
      WHEN quote - ARRAY['rate','source','as_of'] <> '{}'::jsonb OR NOT quote ?& ARRAY['rate','source','as_of'] THEN true
      WHEN quote->>'source' IS DISTINCT FROM 'ecb.europa.eu' THEN true
      WHEN jsonb_typeof(quote->'rate') <> 'string' OR jsonb_typeof(quote->'as_of') <> 'string' THEN true
      WHEN quote->>'rate' !~ '^[0-9]{1,6}([.][0-9]{1,12})?$' THEN true
      WHEN (quote->>'rate')::numeric <= 0 THEN true
      WHEN quote->>'as_of' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN true
      ELSE make_date(substr(quote->>'as_of', 1, 4)::int, substr(quote->>'as_of', 6, 2)::int, substr(quote->>'as_of', 9, 2)::int)
           NOT BETWEEN run_as_of - 7 AND run_as_of
    END)
  END
$$;

CREATE TABLE market_derivation_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  method_version text NOT NULL CHECK (method_version ~ '^ctcg[.]market-derived/v[1-9][0-9]*$'),
  as_of date NOT NULL,
  -- Highest committed member_price_batches id read: with append-only
  -- observations and timestamped crosswalks, the inputs can be re-read.
  input_batch_ceiling bigint NOT NULL CHECK (input_batch_ceiling >= 0),
  input_evidence jsonb NOT NULL CHECK (market_input_evidence_valid(input_evidence)),
  fx jsonb NOT NULL CONSTRAINT market_derivation_runs_fx_record CHECK (market_fx_record_valid(fx, as_of)),
  writer_transaction bigint NOT NULL DEFAULT txid_current(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (method_version, as_of),
  UNIQUE (id, method_version, as_of),
  -- Each source's native currency has its recorded rate.
  CONSTRAINT market_derivation_runs_fx_covers_inputs CHECK (
    (NOT input_evidence ? 'cardmarket' OR fx ? 'EUR')
    AND (NOT input_evidence ? 'cardrush' OR fx ? 'JPY')
    AND (NOT input_evidence ? 'tcgplayer' OR fx ? 'USD'))
);

CREATE TABLE market_reference_prices (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id bigint NOT NULL,
  method_version text NOT NULL,
  as_of date NOT NULL,
  sku text NOT NULL CHECK (char_length(sku) BETWEEN 1 AND 128),
  game text NOT NULL CHECK (game ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  set_code text NOT NULL CHECK (set_code ~ '^[a-z0-9]+$'),
  amount numeric NOT NULL CONSTRAINT market_reference_prices_amount_positive CHECK (amount > 0),
  currency text NOT NULL CONSTRAINT market_reference_prices_gbp CHECK (currency = 'GBP'),
  confidence text NOT NULL CHECK (confidence IN ('high','medium','low')),
  sources text[] NOT NULL CONSTRAINT market_reference_prices_sources_valid CHECK (market_sources_valid(sources)),
  source_count integer NOT NULL CONSTRAINT market_reference_prices_min_sources CHECK (source_count >= 2),
  FOREIGN KEY (run_id, method_version, as_of) REFERENCES market_derivation_runs (id, method_version, as_of),
  UNIQUE (sku, method_version, as_of),
  CONSTRAINT market_reference_prices_source_count CHECK (cardinality(sources) = source_count),
  CONSTRAINT market_reference_prices_high_needs_three CHECK (confidence <> 'high' OR source_count >= 3),
  -- At least two sources whose raw values Cambridge does not export
  -- (MIN_REFERENCE_UNEXPORTED_SOURCES): the mean of one display-only value and
  -- an exported one gives the display-only value back (2 x reference - the
  -- exported value, up to rounding). Exportability lives in
  -- member_price_source_releases (member_api, member_download), which a CHECK
  -- cannot read. 0139 keeps cardrush and tcgplayer unexportable, so Cardmarket
  -- is the one derivation source a release row can export, and it never counts
  -- here. Making another source exportable needs a migration that adds it below.
  CONSTRAINT market_reference_prices_unexported_sources CHECK (cardinality(array_remove(sources, 'cardmarket')) >= 2),
  -- At most 3 significant figures, canonical text: no per-source precision survives.
  CONSTRAINT market_reference_prices_three_figures CHECK (amount::text ~ '^(?:[1-9][0-9]{0,2}0{0,9}|[1-9][.][0-9]?[1-9]|[1-9][0-9][.][1-9]|0[.]0*[1-9](?:[0-9]?[1-9])?)$')
);

CREATE TABLE market_indices (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id bigint NOT NULL,
  method_version text NOT NULL,
  as_of date NOT NULL,
  game text NOT NULL CHECK (game ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- NULL is the per-game index.
  set_code text CHECK (set_code ~ '^[a-z0-9]+$'),
  market text NOT NULL CHECK (market IN ('cardmarket','cardrush','tcgplayer')),
  index_key text GENERATED ALWAYS AS (game || ':' || COALESCE(set_code, '*') || ':' || market) STORED,
  level numeric NOT NULL CONSTRAINT market_indices_level_positive CHECK (level > 0),
  constituents integer NOT NULL CONSTRAINT market_indices_min_constituents CHECK (constituents >= 10),
  -- The published level this step chained from; NULL on the base day.
  previous_as_of date,
  sources text[] NOT NULL CONSTRAINT market_indices_sources_market CHECK (sources = ARRAY[market]),
  FOREIGN KEY (run_id, method_version, as_of) REFERENCES market_derivation_runs (id, method_version, as_of),
  FOREIGN KEY (index_key, method_version, previous_as_of) REFERENCES market_indices (index_key, method_version, as_of),
  UNIQUE (index_key, method_version, as_of),
  CHECK (previous_as_of < as_of),
  CONSTRAINT market_indices_base_level CHECK (previous_as_of IS NOT NULL OR level = 100),
  CONSTRAINT market_indices_level_scale CHECK (level::text ~ '^(?:[1-9][0-9]{0,11}(?:[.][0-9]{0,5}[1-9])?|0[.][0-9]{0,5}[1-9])$')
);
-- A series (index key and method version) starts at 100 once and never
-- restarts. Every later row chains to an earlier one (the foreign key above,
-- with previous_as_of < as_of) and rows are never deleted, so a series has
-- rows exactly when it has its base row: one base row per series refuses a
-- second start, whatever its date, including from a concurrent run. A new
-- method version is a new series with its own base.
CREATE UNIQUE INDEX market_indices_one_base ON market_indices (index_key, method_version) WHERE previous_as_of IS NULL;

CREATE TABLE market_premiums (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id bigint NOT NULL,
  method_version text NOT NULL,
  as_of date NOT NULL,
  game text NOT NULL CHECK (game ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  set_code text NOT NULL CHECK (set_code ~ '^[a-z0-9]+$'),
  -- Ratios are market ÷ base_market, of GBP values.
  market text NOT NULL CHECK (market IN ('cardmarket','cardrush','tcgplayer')),
  base_market text NOT NULL CHECK (base_market IN ('cardmarket','cardrush','tcgplayer')),
  ratio_p25 numeric NOT NULL,
  ratio_median numeric NOT NULL,
  ratio_p75 numeric NOT NULL,
  -- Matched card identities: the SKU without its language segment (variant
  -- kept) where the game's oracle policy shares numbering across languages,
  -- otherwise the whole SKU.
  sku_count integer NOT NULL CONSTRAINT market_premiums_min_skus CHECK (sku_count >= 10),
  sources text[] NOT NULL,
  -- So a pair can compare printings in different languages, and each side
  -- states the languages its values were for.
  market_languages text[] NOT NULL CONSTRAINT market_premiums_market_languages_valid CHECK (market_language_basis_valid(market_languages)),
  base_languages text[] NOT NULL CONSTRAINT market_premiums_base_languages_valid CHECK (market_language_basis_valid(base_languages)),
  FOREIGN KEY (run_id, method_version, as_of) REFERENCES market_derivation_runs (id, method_version, as_of),
  UNIQUE (game, set_code, method_version, as_of, market, base_market),
  CONSTRAINT market_premiums_distinct_markets CHECK (market <> base_market),
  CONSTRAINT market_premiums_sources_markets CHECK (
    market_sources_valid(sources) AND cardinality(sources) = 2 AND sources @> ARRAY[market, base_market]),
  CONSTRAINT market_premiums_ratios_positive CHECK (ratio_p25 > 0 AND ratio_median > 0 AND ratio_p75 > 0),
  CONSTRAINT market_premiums_ratios_ordered CHECK (ratio_p25 <= ratio_median AND ratio_median <= ratio_p75),
  CONSTRAINT market_premiums_three_figures CHECK (
    ratio_p25::text ~ '^(?:[1-9][0-9]{0,2}0{0,9}|[1-9][.][0-9]?[1-9]|[1-9][0-9][.][1-9]|0[.]0*[1-9](?:[0-9]?[1-9])?)$'
    AND ratio_median::text ~ '^(?:[1-9][0-9]{0,2}0{0,9}|[1-9][.][0-9]?[1-9]|[1-9][0-9][.][1-9]|0[.]0*[1-9](?:[0-9]?[1-9])?)$'
    AND ratio_p75::text ~ '^(?:[1-9][0-9]{0,2}0{0,9}|[1-9][.][0-9]?[1-9]|[1-9][0-9][.][1-9]|0[.]0*[1-9](?:[0-9]?[1-9])?)$')
);

-- Reads (plan §5). The unique keys serve latest-by-SKU (backward scan),
-- reference history by SKU and date, indices by key and date, and premiums by
-- game, set and date. A set's references on a date page by SKU; the daily
-- export pages a run's rows by id.
CREATE INDEX market_reference_prices_set ON market_reference_prices (game, set_code, method_version, as_of, sku);
CREATE INDEX market_reference_prices_run ON market_reference_prices (run_id, id);
CREATE INDEX market_indices_run ON market_indices (run_id, id);
CREATE INDEX market_premiums_run ON market_premiums (run_id, id);

CREATE FUNCTION market_derivation_run_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.writer_transaction <> txid_current() THEN RAISE EXCEPTION 'invalid writer transaction'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER market_derivation_run_guard BEFORE INSERT ON market_derivation_runs FOR EACH ROW EXECUTE FUNCTION market_derivation_run_guard();

CREATE FUNCTION market_derived_row_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM market_derivation_runs r WHERE r.id = NEW.run_id
      AND r.writer_transaction = txid_current() AND r.input_evidence ?& NEW.sources) THEN
    RAISE EXCEPTION 'derived market rows may only enter their own uncommitted run, from sources it recorded';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER market_reference_prices_guard BEFORE INSERT ON market_reference_prices FOR EACH ROW EXECUTE FUNCTION market_derived_row_guard();
CREATE TRIGGER market_indices_guard BEFORE INSERT ON market_indices FOR EACH ROW EXECUTE FUNCTION market_derived_row_guard();
CREATE TRIGGER market_premiums_guard BEFORE INSERT ON market_premiums FOR EACH ROW EXECUTE FUNCTION market_derived_row_guard();

CREATE FUNCTION market_derived_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'derived market data is append-only; revoke a source''s derivation instead'; END $$;
CREATE TRIGGER market_derivation_runs_immutable BEFORE UPDATE OR DELETE ON market_derivation_runs FOR EACH ROW EXECUTE FUNCTION market_derived_immutable();
CREATE TRIGGER market_reference_prices_immutable BEFORE UPDATE OR DELETE ON market_reference_prices FOR EACH ROW EXECUTE FUNCTION market_derived_immutable();
CREATE TRIGGER market_indices_immutable BEFORE UPDATE OR DELETE ON market_indices FOR EACH ROW EXECUTE FUNCTION market_derived_immutable();
CREATE TRIGGER market_premiums_immutable BEFORE UPDATE OR DELETE ON market_premiums FOR EACH ROW EXECUTE FUNCTION market_derived_immutable();
-- Row triggers never fire on TRUNCATE; market_indices_one_base relies on no
-- row ever leaving, so TRUNCATE is refused with the same exception.
CREATE TRIGGER market_derivation_runs_truncate_immutable BEFORE TRUNCATE ON market_derivation_runs FOR EACH STATEMENT EXECUTE FUNCTION market_derived_immutable();
CREATE TRIGGER market_reference_prices_truncate_immutable BEFORE TRUNCATE ON market_reference_prices FOR EACH STATEMENT EXECUTE FUNCTION market_derived_immutable();
CREATE TRIGGER market_indices_truncate_immutable BEFORE TRUNCATE ON market_indices FOR EACH STATEMENT EXECUTE FUNCTION market_derived_immutable();
CREATE TRIGGER market_premiums_truncate_immutable BEFORE TRUNCATE ON market_premiums FOR EACH STATEMENT EXECUTE FUNCTION market_derived_immutable();

COMMENT ON TABLE market_derivation_runs IS
  'One derivation date per method version: the inputs (evidence per source, FX record, observation batch ceiling) its rows were computed from. Append-only.';
COMMENT ON TABLE market_reference_prices IS
  'GBP mean of named sources per SKU, at least two of them sources whose raw values are not exported (Cardmarket may contribute on top), 3 significant figures, with a confidence label instead of a numeric spread. No per-source value is stored. Not CC0; not licensed for AI training.';
COMMENT ON TABLE market_indices IS
  'Chain-linked GBP index levels per game x set x market (set_code NULL: per game x market), base 100, at least ten constituents. Not CC0; not licensed for AI training.';
COMMENT ON TABLE market_premiums IS
  'Quartiles of market / base_market GBP value ratios over at least ten card identities exactly mapped in both, with each side''s language basis. Not CC0; not licensed for AI training.';
