-- 0023: cardrush_seen_url — the discovery seen-URL ledger.
--
-- Why: the discovery diff excluded only URLs already living on
-- `cards.cardrush_url`, but the card INSERT dedupes on (sku) and keeps
-- the existing row's URL (COALESCE). On subdomains where many listings
-- collapse into one SKU (cardrush-digimon.jp: 13,554 sitemap products →
-- ~837 base SKUs, the rest condition/parallel duplicates) the conflicting
-- product's URL never entered `cards`, so every run re-fetched the same
-- first-500 sitemap slice and every other subdomain starved behind it.
-- Observed live 2026-07-07 → 2026-07-09: every discovery run walked only
-- cardrush-digimon.jp, dmw card count frozen at 837, OP16/ST30 never
-- discovered despite configs shipped 2026-06-11.
--
-- The ledger makes "processed" a recorded fact instead of an inference
-- from `cards`. Companion code: apps/wholesale/src/lib/cardrush-discovery.ts.
-- Substrate honesty: `outcome` names HOW the URL was consumed.

CREATE TABLE IF NOT EXISTS cardrush_seen_url (
  url text PRIMARY KEY,                 -- normalized: https:// (www. stripped), no trailing slash
  host text NOT NULL,                   -- e.g. cardrush-digimon.jp (no www.)
  sku text,                             -- resolved SKU when title parse succeeded
  outcome text NOT NULL,                -- 'inserted' | 'conflict_existing' | 'quarantined'
  ingest_run_id bigint REFERENCES ingest_run(id),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cardrush_seen_url_host_idx ON cardrush_seen_url (host);

-- Seed 1: every product URL already living on a card. Redundant with the
-- cards-side diff but makes the ledger the complete record from day one.
INSERT INTO cardrush_seen_url (url, host, sku, outcome)
SELECT DISTINCT ON (regexp_replace(regexp_replace(cardrush_url, '/+$', ''), '^https?://www\.', 'https://'))
  regexp_replace(regexp_replace(cardrush_url, '/+$', ''), '^https?://www\.', 'https://'),
  split_part(regexp_replace(cardrush_url, '^https?://(www\.)?', ''), '/', 1),
  sku,
  'inserted'
FROM cards
WHERE cardrush_url IS NOT NULL
  AND cardrush_url LIKE '%cardrush%/product/%'
ON CONFLICT (url) DO NOTHING;

-- Seed 2: every discovery quarantine. These are title-parse failures the
-- runner re-fetched and re-quarantined every run; the operator reviews
-- them in ingest_quarantine — refetching does not change the verdict.
INSERT INTO cardrush_seen_url (url, host, outcome, ingest_run_id, first_seen_at)
SELECT DISTINCT ON (regexp_replace(regexp_replace(upstream_id, '/+$', ''), '^https?://www\.', 'https://'))
  regexp_replace(regexp_replace(upstream_id, '/+$', ''), '^https?://www\.', 'https://'),
  split_part(regexp_replace(upstream_id, '^https?://(www\.)?', ''), '/', 1),
  'quarantined',
  ingest_run_id,
  quarantined_at
FROM ingest_quarantine
WHERE source_id = 'cardrush-discover'
  AND upstream_id LIKE 'http%cardrush%/product/%'
ORDER BY regexp_replace(regexp_replace(upstream_id, '/+$', ''), '^https?://www\.', 'https://'), quarantined_at ASC
ON CONFLICT (url) DO NOTHING;
