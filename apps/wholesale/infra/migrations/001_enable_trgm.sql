-- Enable pg_trgm extension for trigram-based ILIKE acceleration
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes on search columns (accelerates %term% ILIKE patterns)
CREATE INDEX CONCURRENTLY IF NOT EXISTS cards_name_trgm_idx ON cards USING gin (name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS cards_card_number_trgm_idx ON cards USING gin (card_number gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS cards_sku_trgm_idx ON cards USING gin (sku gin_trgm_ops);
