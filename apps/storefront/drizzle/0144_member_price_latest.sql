-- The member feed's current view, bounded (final review MIG-1). Observations
-- are append-only and each Cardmarket daily file is a full new set of rows (the
-- observation key includes the guide's createdAt), so ranking every eligible
-- observation per key on each read, as member-feed.ts did, grows with every
-- day ever collected: on local PostgreSQL 16, about 13 s a request at 30 daily
-- One Piece batches and 23 to 31 s at 60, against the pool's 30 s
-- statement_timeout (packages/db). This table holds, per key the feed has
-- always ranked by, the latest observation and the one it superseded, so the
-- current view reads one row a key however long the history.
--
-- It is a derived index, not evidence. Every row names an observation, and the
-- observations stay the record: 0137's append-only guards are unchanged, and
-- nothing here rewrites, hides or deletes one. A row may be updated because a
-- key's latest observation changes as observations arrive. It changes only in
-- the statement that inserts them (member_price_latest_advance, below), only
-- toward an observation of the inserting transaction's own uncommitted batch,
-- only forward in (source_updated_at, id), the order the feed has always
-- ranked by, and keeping the row it replaces as its previous. Rows are never
-- deleted: a key, once observed, stays observed, and revocation stays a
-- read-time check of the release rows. Because the insert itself maintains the
-- table, no path that adds observations, the writer or any other, can leave it
-- behind. No collector is scheduled or run by this migration.
--
-- Writers are held off until this commits: they take the same advisory lock
-- (0137) before allocating a batch, so the backfill below sees every batch
-- that will ever commit without the trigger, and every later batch fires it.

SELECT pg_advisory_xact_lock(137, 1);

-- One key's observations newest first, the order the feed ranks by. The
-- current view reads it only for a key that has moved twice since a cursor's
-- watermark (at most the rows written in the 24 hours a cursor lives); the
-- guard below reads it to confirm a new key has no earlier observation.
CREATE INDEX member_price_observations_key ON member_price_observations
  (source, source_product_id, metric, currency, (COALESCE(finish, '')), (COALESCE(language, '')), (COALESCE(condition, '')), source_updated_at DESC, id DESC);

-- The key is the feed's partition, NULL finish, language and condition read
-- as '' exactly as its COALESCE always merged them, plus the evidence
-- version: the feed ranks only observations under their release's evidence,
-- so a row stored under another review never hides the latest under this one.
-- previous_* is the latest observation of the key among batches before
-- batch_id (NULL when none), so a cursor whose watermark falls between them
-- reads it without the index above. Each daily Cardmarket file moves every
-- Cardmarket key, so half of each page is left free (fillfactor 50) for those
-- updates to stay on their page (HOT) instead of adding primary-key entries.
CREATE TABLE member_price_latest (
  source text NOT NULL,
  evidence_version text NOT NULL,
  source_product_id text NOT NULL,
  metric text NOT NULL,
  currency text NOT NULL,
  finish text NOT NULL,
  language text NOT NULL,
  condition text NOT NULL,
  observation_id bigint NOT NULL,
  batch_id bigint NOT NULL,
  source_updated_at timestamptz NOT NULL,
  previous_observation_id bigint,
  previous_batch_id bigint,
  PRIMARY KEY (source, evidence_version, source_product_id, metric, currency, finish, language, condition),
  CHECK ((previous_observation_id IS NULL) = (previous_batch_id IS NULL)),
  CHECK (previous_batch_id < batch_id)
) WITH (fillfactor = 50);

INSERT INTO member_price_latest (source, evidence_version, source_product_id, metric, currency, finish, language, condition,
  observation_id, batch_id, source_updated_at, previous_observation_id, previous_batch_id)
SELECT l.source, l.evidence_version, l.source_product_id, l.metric, l.currency, l.finish, l.language, l.condition,
  l.id, l.batch_id, l.source_updated_at, p.id, p.batch_id
FROM (
  SELECT DISTINCT ON (o.source, o.evidence_version, o.source_product_id, o.metric, o.currency, COALESCE(o.finish, ''), COALESCE(o.language, ''), COALESCE(o.condition, ''))
    o.source, o.evidence_version, o.source_product_id, o.metric, o.currency, COALESCE(o.finish, '') AS finish, COALESCE(o.language, '') AS language,
    COALESCE(o.condition, '') AS condition, o.id, o.batch_id, o.source_updated_at
  FROM member_price_observations o WHERE o.quality = 'accepted'
  ORDER BY o.source, o.evidence_version, o.source_product_id, o.metric, o.currency, COALESCE(o.finish, ''), COALESCE(o.language, ''), COALESCE(o.condition, ''),
    o.source_updated_at DESC, o.id DESC
) l
LEFT JOIN LATERAL (
  SELECT o.id, o.batch_id FROM member_price_observations o
  WHERE o.source = l.source AND o.source_product_id = l.source_product_id AND o.metric = l.metric AND o.currency = l.currency
    AND COALESCE(o.finish, '') = l.finish AND COALESCE(o.language, '') = l.language AND COALESCE(o.condition, '') = l.condition
    AND o.evidence_version = l.evidence_version AND o.quality = 'accepted' AND o.batch_id < l.batch_id
  ORDER BY o.source_updated_at DESC, o.id DESC LIMIT 1
) p ON true;
ANALYZE member_price_latest;

-- Each inserting statement advances its keys once, to the latest of its rows
-- (an observation the conflict clause skipped is already counted). A key whose
-- latest is already this batch's, from an earlier statement of the same batch,
-- keeps its previous: that is still the latest before the batch.
CREATE FUNCTION member_price_latest_advance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO member_price_latest AS l (source, evidence_version, source_product_id, metric, currency, finish, language, condition,
    observation_id, batch_id, source_updated_at)
  SELECT DISTINCT ON (a.source, a.evidence_version, a.source_product_id, a.metric, a.currency, COALESCE(a.finish, ''), COALESCE(a.language, ''), COALESCE(a.condition, ''))
    a.source, a.evidence_version, a.source_product_id, a.metric, a.currency, COALESCE(a.finish, ''), COALESCE(a.language, ''), COALESCE(a.condition, ''),
    a.id, a.batch_id, a.source_updated_at
  FROM added a WHERE a.quality = 'accepted'
  ORDER BY a.source, a.evidence_version, a.source_product_id, a.metric, a.currency, COALESCE(a.finish, ''), COALESCE(a.language, ''), COALESCE(a.condition, ''),
    a.source_updated_at DESC, a.id DESC
  ON CONFLICT (source, evidence_version, source_product_id, metric, currency, finish, language, condition) DO UPDATE SET
    observation_id = EXCLUDED.observation_id, batch_id = EXCLUDED.batch_id, source_updated_at = EXCLUDED.source_updated_at,
    previous_observation_id = CASE WHEN l.batch_id = EXCLUDED.batch_id THEN l.previous_observation_id ELSE l.observation_id END,
    previous_batch_id = CASE WHEN l.batch_id = EXCLUDED.batch_id THEN l.previous_batch_id ELSE l.batch_id END
  WHERE (EXCLUDED.source_updated_at, EXCLUDED.observation_id) > (l.source_updated_at, l.observation_id);
  RETURN NULL;
END $$;
CREATE TRIGGER member_price_latest_advance AFTER INSERT ON member_price_observations
  REFERENCING NEW TABLE AS added FOR EACH STATEMENT EXECUTE FUNCTION member_price_latest_advance();

-- The same rules, checked on every row written, whoever writes it. A row
-- names an accepted observation of its own key and source time, inserted by
-- this transaction's own batch (so under 0137's lock). A key enters with its
-- first observation: no previous, and no observation of the key in an earlier
-- batch. An update keeps its key, moves forward, and keeps as previous the row
-- it replaces, or that row's previous when both are this batch's. PostgreSQL
-- fires BEFORE INSERT for every row an upsert proposes, conflicting or not,
-- so an inserted row is checked AFTER INSERT, which fires only for rows
-- actually inserted, and an updated one BEFORE UPDATE.
CREATE FUNCTION member_price_latest_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM member_price_observations o JOIN member_price_batches b ON b.id = o.batch_id
      WHERE o.id = NEW.observation_id AND o.batch_id = NEW.batch_id AND b.writer_transaction = txid_current() AND o.quality = 'accepted'
        AND o.source = NEW.source AND o.evidence_version = NEW.evidence_version AND o.source_product_id = NEW.source_product_id
        AND o.metric = NEW.metric AND o.currency = NEW.currency AND COALESCE(o.finish, '') = NEW.finish
        AND COALESCE(o.language, '') = NEW.language AND COALESCE(o.condition, '') = NEW.condition
        AND o.source_updated_at = NEW.source_updated_at) THEN
    RAISE EXCEPTION 'the latest member price index advances only to an observation of its own key that this transaction''s batch inserted';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.previous_observation_id IS NOT NULL OR EXISTS (SELECT 1 FROM member_price_observations o
        WHERE o.source = NEW.source AND o.source_product_id = NEW.source_product_id AND o.metric = NEW.metric AND o.currency = NEW.currency
          AND COALESCE(o.finish, '') = NEW.finish AND COALESCE(o.language, '') = NEW.language AND COALESCE(o.condition, '') = NEW.condition
          AND o.evidence_version = NEW.evidence_version AND o.batch_id < NEW.batch_id) THEN
      RAISE EXCEPTION 'a key enters the latest member price index with its first observation';
    END IF;
    RETURN NULL;
  END IF;
  IF (NEW.source, NEW.evidence_version, NEW.source_product_id, NEW.metric, NEW.currency, NEW.finish, NEW.language, NEW.condition)
       IS DISTINCT FROM (OLD.source, OLD.evidence_version, OLD.source_product_id, OLD.metric, OLD.currency, OLD.finish, OLD.language, OLD.condition)
     OR (NEW.source_updated_at, NEW.observation_id) <= (OLD.source_updated_at, OLD.observation_id)
     OR (NEW.previous_observation_id, NEW.previous_batch_id) IS DISTINCT FROM
        (CASE WHEN OLD.batch_id = NEW.batch_id THEN OLD.previous_observation_id ELSE OLD.observation_id END,
         CASE WHEN OLD.batch_id = NEW.batch_id THEN OLD.previous_batch_id ELSE OLD.batch_id END) THEN
    RAISE EXCEPTION 'the latest member price index only moves forward, keeping the row it replaces as previous';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER member_price_latest_entered AFTER INSERT ON member_price_latest
  FOR EACH ROW EXECUTE FUNCTION member_price_latest_guard();
CREATE TRIGGER member_price_latest_moved BEFORE UPDATE ON member_price_latest
  FOR EACH ROW EXECUTE FUNCTION member_price_latest_guard();

-- A removed row would drop its key from the current view without a word, so
-- DELETE is refused, and TRUNCATE, which fires no row trigger, by its own.
CREATE FUNCTION member_price_latest_kept() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'the latest member price index keeps every observed key; it changes only as observations arrive'; END $$;
CREATE TRIGGER member_price_latest_kept BEFORE DELETE ON member_price_latest FOR EACH ROW EXECUTE FUNCTION member_price_latest_kept();
CREATE TRIGGER member_price_latest_truncate_kept BEFORE TRUNCATE ON member_price_latest FOR EACH STATEMENT EXECUTE FUNCTION member_price_latest_kept();

COMMENT ON TABLE member_price_latest IS
  'Derived index, not evidence: per feed key (source, evidence version, product, metric, currency, finish, language, condition), the latest accepted observation by (source_updated_at, id) and the latest before its batch. Maintained by the observation insert itself; read by the member feed''s current view.';
