-- CardRush and TCGplayer join the native observation store under Yu's written
-- permission of 2026-10-28 (docs/decisions/2026-10-28-tcg-data-permissions-
-- and-paid-data-api.md). Their raw rows are member display only: the CHECK
-- below keeps them out of the member API and downloads whatever an operator
-- later sets. Derivation is its own switch with its own evidence; Scryfall can
-- never hold it. No collector or derivation job is scheduled or run here.
--
-- The Cardmarket row keeps its evidence_version and evidence_url: the feed
-- and the writer match on both, so changing either would hide stored rows.
-- The dropped CHECKs are the names PostgreSQL generated for 0137's column
-- constraints; each is re-added under the same name, widened.
ALTER TABLE member_price_source_releases
  DROP CONSTRAINT member_price_source_releases_source_check,
  ADD CONSTRAINT member_price_source_releases_source_check
    CHECK (source IN ('cardmarket','scryfall','cardrush','tcgplayer')),
  ADD COLUMN derivation boolean NOT NULL DEFAULT false,
  ADD COLUMN derivation_evidence_version text,
  ADD COLUMN derivation_evidence_url text,
  ADD CONSTRAINT member_price_source_releases_derivation_evidence_check
    CHECK (NOT derivation OR (derivation_evidence_version IS NOT NULL AND derivation_evidence_url IS NOT NULL)),
  ADD CONSTRAINT member_price_source_releases_scryfall_derivation_check
    CHECK (source <> 'scryfall' OR NOT derivation),
  ADD CONSTRAINT member_price_source_releases_page_sources_display_only_check
    CHECK (source NOT IN ('cardrush','tcgplayer') OR (NOT member_api AND NOT member_download));

-- Existing rows are revalidated; none can hold JPY or the cardrush market yet.
-- Collection from CardRush and TCGplayer pages is forward-only: a page read
-- before the permission of 2026-10-28 is never stored (PAGE_SOURCE_COLLECTION_START
-- in packages/data-spec/src/price-observation.ts). Before this migration no row
-- can name either source.
--
-- source_set_key is the source's own set key as it writes it (Cardmarket's
-- idExpansion, the set code a CardRush title prints, TCGplayer's setId), the
-- key price_source_set_crosswalks (0140) is joined on. It is evidence, not a
-- mapping, and not part of observation_key, so re-reading an artifact adds no
-- row. Rows stored before it stay NULL: adding a column rewrites no evidence.
ALTER TABLE member_price_observations
  ADD COLUMN source_set_key text,
  ADD CONSTRAINT member_price_observations_source_set_key_check
    CHECK (source_set_key IS NULL OR btrim(source_set_key) <> ''),
  DROP CONSTRAINT member_price_observations_currency_check,
  ADD CONSTRAINT member_price_observations_currency_check
    CHECK (currency IN ('EUR','USD','JPY')),
  DROP CONSTRAINT member_price_observations_underlying_market_check,
  ADD CONSTRAINT member_price_observations_underlying_market_check
    CHECK (underlying_market IN ('cardmarket','tcgplayer','cardrush')),
  ADD CONSTRAINT member_price_observations_page_sources_forward_only_check
    CHECK (source NOT IN ('cardrush','tcgplayer') OR retrieved_at >= timestamptz '2026-10-28T00:00:00Z');

-- The market derivation (0141, lib/market-derived/derive.ts) reads each
-- source's headline metrics over a week by source_updated_at, every day, in
-- one statement under its own time bound. Observations are append-only and
-- each Cardmarket file is a full new set of rows, so without this the read is
-- a scan of the whole table, growing by every day ever collected.
CREATE INDEX member_price_observations_derivation ON member_price_observations (source, metric, source_updated_at);

-- 0137's append-only guards are row triggers, and PostgreSQL never fires a row
-- trigger on TRUNCATE. The same exception now refuses a TRUNCATE of either
-- table, which would otherwise empty the evidence the derivation reads.
CREATE TRIGGER member_price_batches_truncate_immutable BEFORE TRUNCATE ON member_price_batches
  FOR EACH STATEMENT EXECUTE FUNCTION member_price_immutable();
CREATE TRIGGER member_price_observations_truncate_immutable BEFORE TRUNCATE ON member_price_observations
  FOR EACH STATEMENT EXECUTE FUNCTION member_price_immutable();

-- Displaying a source with no stored rows shows nothing. No collector runs from
-- this migration; collectors arrive separately, behind flags.
INSERT INTO member_price_source_releases
  (source, evidence_version, evidence_url, member_display, member_api, member_download, revoked_at,
   derivation, derivation_evidence_version, derivation_evidence_url)
VALUES
 ('cardrush','cardrush/2026-10-28.1','repo:docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md#cardrush',
  true,false,false,NULL,
  true,'cardrush/2026-10-28.1','repo:docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md#cardrush'),
 ('tcgplayer','tcgplayer/2026-10-28.1','repo:docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md#tcgplayer',
  true,false,false,NULL,
  true,'tcgplayer/2026-10-28.1','repo:docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md#tcgplayer');

UPDATE member_price_source_releases
   SET derivation = true,
       derivation_evidence_version = 'cardmarket-derivation/2026-10-28.1',
       derivation_evidence_url = 'repo:docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md#cardmarket'
 WHERE source = 'cardmarket';
