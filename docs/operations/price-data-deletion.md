# Deleting a source's price data

**Status:** procedure, written 2026-10-29 by an agent (Claude Code). Nothing
here has been run against a real database. The deletion path it needs does
not exist yet: today every table that holds a source's prices refuses
`DELETE`, and this document designs, but does not build, the smallest guarded
way through. Running a deletion is Yu's call each time: it cannot be undone,
and it answers a provider.

The sketch and the deletion script below were checked once, on 2026-10-29, on
a throwaway PostgreSQL 17 schema holding migrations 0137–0146 and a few
synthetic rows, with the three guard changes the sketch describes in words
written out: without a receipt every guarded `DELETE` was still refused; a
receipt that was not completed could not commit; the script removed only the
named source's rows and recorded their counts; `TRUNCATE` stayed refused with
a receipt open; and a completed receipt could not be changed or deleted. That
check is not the migration's test suite, which is listed below.

## Revocation or deletion

Cambridge's store of provider prices is append-only by design, so that what
any page, feed or derived value showed can be re-read later. The normal way to
stop using a source is **revocation**: an `UPDATE` of its row in
`member_price_source_releases` (`revoked_at`, `member_display`, `derivation`),
which every reader checks on every read. Revocation hides the source's rows
and every derived row it contributed to from the next request on, and keeps
them. It is immediate and reversible.

**Deletion** is the tool only when the rows themselves must go:

- the source asks Cambridge to delete the data it collected from it; or
- the source withdraws its permission and asks, with the withdrawal, that
  collected data be deleted.

A withdrawal without a deletion request is answered by revocation and by
turning the collector off. A deletion request is answered by revocation at
once (it is the fastest way to stop showing the data) and by this procedure
once Yu agrees.

## What holds a source's data

All in the storefront database:

| Table | What it holds for the source | Guard today |
| --- | --- | --- |
| `member_price_observations` (0137) | every observation | `member_price_immutable()` refuses `UPDATE`, `DELETE`, `TRUNCATE` |
| `member_price_batches` (0137) | every run's batch, including quarantine entries, which can hold source text | same |
| `member_price_latest` (0144) | the feed's latest-observation index | `member_price_latest_kept()` refuses `DELETE`, `TRUNCATE` |
| `price_source_crosswalks`, `price_source_set_crosswalks` (0140) | Cambridge's mappings, keyed by the source's own product and set ids, with evidence read from its pages | `price_source_crosswalk_guard()` refuses `DELETE`, `TRUNCATE` |
| `price_source_listing_images` (0145, CardRush only) | links to CardRush's own image URLs | none on `DELETE` |
| `market_reference_prices`, `market_premiums`, `market_indices` (0141) | derived rows computed from the source (`sources` contains it; an index's `market` is it) | `market_derived_immutable()` refuses `UPDATE`, `DELETE`, `TRUNCATE` |

Kept, because they hold Cambridge's own records rather than the source's
data: the source's `member_price_source_releases` row (it records the
revocation, and every table above references it), `market_derivation_runs`
(each names which sources' evidence versions a day's derivation read, and
holds other sources' rows), `price_collector_leases` and
`price_collector_hosts` (0146; when Cambridge read which host and how it
answered).

Not reached by this procedure, and not checked for this document: the
database's automated backups and snapshots, which keep deleted rows until they
expire; server logs; files a member already downloaded (the Cardmarket member
CSV and NDJSON); and the catalogue database's legacy `price_archive` (about
269k CardRush rows gathered before the permission of 2026-10-28), which has
its own owner and needs its own procedure. Tell the source which of these
remain and for how long, once that is known.

## Why it cannot be done today, and the path to build first

The guards above raise on every `DELETE`. The only ways round them are
`ALTER TABLE ... DISABLE TRIGGER` or `SET session_replication_role = replica`.
Both switch the guards off silently, for every row and every writer, for as
long as they are left that way, and neither leaves a record. This procedure
never uses them.

The smallest guarded path is a **deletion receipt written in the same
transaction as the deletes**, the pattern the store already uses for writes
(a batch's `writer_transaction` in 0137, a derivation run's in 0141): a guard
lets a row of source *S* go only while the current transaction holds an open
receipt for *S*. There is no flag to leave on and nothing outlives the
transaction; a transaction that deletes without a receipt is refused as
today; and the receipt is the permanent record. A session flag
(`SET LOCAL cambridge.deleting = 'cardrush'`) would leave no record and could
be set by any session; a `SECURITY DEFINER` function would need its own owner
role and would still need the guards changed. The receipt does both jobs.

A sketch of that migration, to be reviewed and built as its own change
(the number is whatever is next when it is built):

```sql
-- price_data_deletions: one row per deletion, written by the deleting
-- transaction itself. Append-only, except that same transaction completes it.
CREATE TABLE price_data_deletions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source text NOT NULL REFERENCES member_price_source_releases(source),
  reason text NOT NULL CHECK (reason IN ('source-requested-deletion', 'permission-withdrawn-with-deletion')),
  -- The source's own reference for its request, or the date and subject of
  -- its email. The repository never copies the email itself.
  request_reference text NOT NULL CHECK (btrim(request_reference) <> ''),
  -- An organisation and role, not a person's private details.
  requested_by text NOT NULL CHECK (btrim(requested_by) <> ''),
  approved_by text NOT NULL CHECK (btrim(approved_by) <> ''),
  performed_by text NOT NULL CHECK (btrim(performed_by) <> ''),
  writer_transaction bigint NOT NULL DEFAULT txid_current(),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  row_counts jsonb,
  CHECK ((completed_at IS NULL) = (row_counts IS NULL))
);

-- Open: recorded by this transaction and not yet completed.
CREATE FUNCTION price_data_deletion_open(name text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM price_data_deletions d
    WHERE d.source = name AND d.writer_transaction = txid_current() AND d.completed_at IS NULL)
$$;

-- Each guard gains one way through, for DELETE only; UPDATE and TRUNCATE
-- stay refused. member_price_immutable() serves both 0137 tables:
CREATE OR REPLACE FUNCTION member_price_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF price_data_deletion_open(OLD.source) THEN RETURN OLD; END IF;
  END IF;
  RAISE EXCEPTION 'member price evidence is append-only; use source release revocation';
END $$;
-- The same first lines go into member_price_latest_kept() (0144) and at the
-- top of price_source_crosswalk_guard() (0140), each keeping its own message
-- and its other rules. market_derived_immutable() (0141) lets a derived row
-- go when one of its sources is open, and never a derivation run:
--   IF TG_OP = 'DELETE' AND TG_TABLE_NAME <> 'market_derivation_runs' THEN
--     IF EXISTS (SELECT 1 FROM unnest(OLD.sources) s WHERE price_data_deletion_open(s)) THEN RETURN OLD; END IF;
--   END IF;

-- Receipts: entered by their own transaction, open; completed once, by it; never removed.
CREATE FUNCTION price_data_deletion_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.writer_transaction <> txid_current() OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a price data deletion receipt enters open, from its own transaction';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL
     AND OLD.writer_transaction = txid_current()
     AND to_jsonb(NEW) - 'completed_at' - 'row_counts' = to_jsonb(OLD) - 'completed_at' - 'row_counts' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'price data deletion receipts are append-only';
END $$;
CREATE TRIGGER price_data_deletion_guard BEFORE INSERT OR UPDATE OR DELETE ON price_data_deletions
  FOR EACH ROW EXECUTE FUNCTION price_data_deletion_guard();
CREATE TRIGGER price_data_deletion_truncate_guard BEFORE TRUNCATE ON price_data_deletions
  FOR EACH STATEMENT EXECUTE FUNCTION price_data_deletion_guard();
-- A deletion cannot commit without its counts: checked at COMMIT.
CREATE FUNCTION price_data_deletion_completed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT completed_at FROM price_data_deletions WHERE id = NEW.id) IS NULL THEN
    RAISE EXCEPTION 'a price data deletion commits only once its row counts are recorded';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER price_data_deletion_completed AFTER INSERT ON price_data_deletions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION price_data_deletion_completed();
```

Whether to also restrict `INSERT` on `price_data_deletions` to an operator
role is a production-roles question this document does not answer; the
database roles in production were not read.

Its tests, when it is built: a `DELETE` without a receipt is refused on every
guarded table, as today; a receipt for one source lets only that source's rows
go; `UPDATE` and `TRUNCATE` stay refused with a receipt open; a receipt from
another (committed) transaction opens nothing; a transaction whose receipt is
not completed cannot commit; a completed receipt cannot be changed or deleted.

## The deletion, once that path exists

**Before.** Get Yu's word for this deletion. Revoke the source:

```sql
UPDATE member_price_source_releases
   SET revoked_at = COALESCE(revoked_at, now()), member_display = false, member_api = false, member_download = false, derivation = false
 WHERE source = 'cardrush';
```

Turn its collector off (`DATA_COLLECT_CARDRUSH`, `DATA_COLLECT_TCGPLAYER` or
`DATA_COLLECT_CARDMARKET` anything but `on`, then redeploy), and wait until
`price_collector_leases` holds no live row for it, so no run is mid-write.
Count what will go, with the verification queries below, and keep the counts.

**The transaction.** Run in `psql` as one script against the production
storefront database, with `ON_ERROR_STOP` so any refusal rolls the whole
deletion back. Set the variables first.

```sql
\set ON_ERROR_STOP on
\set source 'cardrush'
\set reason 'source-requested-deletion'
\set request_reference '<the source''s reference, or: email of YYYY-MM-DD, subject "...">'
\set requested_by '<organisation, role>'
\set approved_by 'Yu'
\set performed_by '<who runs this>'

BEGIN;
-- Holds off every member-price writer (they take this lock before a batch).
SELECT pg_advisory_xact_lock(137, 1);
INSERT INTO price_data_deletions (source, reason, request_reference, requested_by, approved_by, performed_by)
VALUES (:'source', :'reason', :'request_reference', :'requested_by', :'approved_by', :'performed_by')
RETURNING id AS deletion_id \gset

-- Derived rows computed from the source. An index series is the source's
-- market, deleted whole, so its chain of previous days goes with it.
WITH gone AS (DELETE FROM market_premiums WHERE :'source' = ANY (sources) RETURNING 1) SELECT count(*) AS market_premiums FROM gone \gset
WITH gone AS (DELETE FROM market_reference_prices WHERE :'source' = ANY (sources) RETURNING 1) SELECT count(*) AS market_reference_prices FROM gone \gset
WITH gone AS (DELETE FROM market_indices WHERE market = :'source' RETURNING 1) SELECT count(*) AS market_indices FROM gone \gset
-- The feed's index over the observations, the observations, then their
-- batches (observations reference batches).
WITH gone AS (DELETE FROM member_price_latest WHERE source = :'source' RETURNING 1) SELECT count(*) AS member_price_latest FROM gone \gset
WITH gone AS (DELETE FROM member_price_observations WHERE source = :'source' RETURNING 1) SELECT count(*) AS member_price_observations FROM gone \gset
WITH gone AS (DELETE FROM member_price_batches WHERE source = :'source' RETURNING 1) SELECT count(*) AS member_price_batches FROM gone \gset
-- Cambridge's mappings keyed by the source's own ids, and its image links.
WITH gone AS (DELETE FROM price_source_crosswalks WHERE source = :'source' RETURNING 1) SELECT count(*) AS price_source_crosswalks FROM gone \gset
WITH gone AS (DELETE FROM price_source_set_crosswalks WHERE source = :'source' RETURNING 1) SELECT count(*) AS price_source_set_crosswalks FROM gone \gset
WITH gone AS (DELETE FROM price_source_listing_images WHERE source = :'source' RETURNING 1) SELECT count(*) AS price_source_listing_images FROM gone \gset

UPDATE price_data_deletions
   SET completed_at = clock_timestamp(),
       row_counts = jsonb_build_object(
         'market_premiums', :market_premiums, 'market_reference_prices', :market_reference_prices, 'market_indices', :market_indices,
         'member_price_latest', :member_price_latest, 'member_price_observations', :member_price_observations, 'member_price_batches', :member_price_batches,
         'price_source_crosswalks', :price_source_crosswalks, 'price_source_set_crosswalks', :price_source_set_crosswalks,
         'price_source_listing_images', :price_source_listing_images)
 WHERE id = :deletion_id;
COMMIT;
```

A large source is one long transaction: Cardmarket's One Piece files add
about 73,000 observations a day. Run it with the collectors off and expect it
to hold the writers' lock until it commits.

## The receipt

Two records, both kept for good:

1. **The database row** in `price_data_deletions`: who asked (organisation and
   role), the source's request reference, why (`reason`), who approved (Yu)
   and who ran it, when it started and completed, and the row count per table.
2. **A dated decision record** in `docs/decisions/`, named for the date and
   source, that cites the receipt's `id`, repeats its counts, quotes Yu's
   approval in Yu's words, and lists what this procedure did not reach (the
   backups, logs, downloads and stores above) with what is known of each. It
   holds no copy of the source's email and no one's private details.

The counts taken before the transaction should match the receipt's; a
difference means rows arrived or left while it waited, and is written down
too.

## Verifying afterwards

Every count below is zero:

```sql
SELECT 'member_price_observations' AS rows_of, count(*) FROM member_price_observations WHERE source = :'source'
UNION ALL SELECT 'member_price_batches', count(*) FROM member_price_batches WHERE source = :'source'
UNION ALL SELECT 'member_price_latest', count(*) FROM member_price_latest WHERE source = :'source'
UNION ALL SELECT 'price_source_crosswalks', count(*) FROM price_source_crosswalks WHERE source = :'source'
UNION ALL SELECT 'price_source_set_crosswalks', count(*) FROM price_source_set_crosswalks WHERE source = :'source'
UNION ALL SELECT 'price_source_listing_images', count(*) FROM price_source_listing_images WHERE source = :'source'
UNION ALL SELECT 'market_reference_prices', count(*) FROM market_reference_prices WHERE :'source' = ANY (sources)
UNION ALL SELECT 'market_premiums', count(*) FROM market_premiums WHERE :'source' = ANY (sources)
UNION ALL SELECT 'market_indices', count(*) FROM market_indices WHERE market = :'source';
```

Then:

- the receipt reads back complete:
  `SELECT id, source, completed_at, row_counts FROM price_data_deletions WHERE id = :deletion_id;`
- the guards hold again outside a deletion: in a new transaction,
  `DELETE FROM member_price_batches WHERE id = (SELECT min(id) FROM member_price_batches)`
  is refused (a row guard fires only on a row that exists, so the statement
  must name one), and the transaction is rolled back either way;
- `/api/v1/sources/<source>` reads `never_run` (no batch is left), and
  `/prices` shows none of the source's rows;
- the release row is still revoked, and the collector flag still off.

Turning the source back on later, if it ever grants permission again, starts
from an empty store under a new evidence version.
