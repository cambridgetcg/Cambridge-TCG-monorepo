-- Each collector's standing with each host it reads (docs/plans/tcg-data-
-- platform/paid-data-api.md §2): when a host last served it, when and why it
-- last refused it, the time before which the collector will not ask it again,
-- and whether it has suspended itself there. Two gaps the Transparent Data
-- Playbook named for Cambridge on 2026-10-29 close here: a page collector did
-- not wait out a Retry-After longer than its schedule or stop itself when
-- refusals repeated, and health was judged per source, so a host refused on
-- every run could read healthy while another host of the same source collected.
--
-- A refusal is a 403 or a 429, a 503 with Retry-After, a challenge, or
-- robots.txt disallowing the collector (http.ts hostRefusal in data-ingest).
-- The collector (lib/datafeed/collector-hosts.ts) sets not_before from the
-- host's Retry-After, seconds or an HTTP date, capped at 7 days, or 6 hours
-- when it gives none, and skips the host until then whatever its schedule.
-- After 3 refused runs in a row it sets suspended_at and suspended_reason, the
-- code of the refusal that tripped it, and then never asks that host again:
-- no run reads, writes or clears a suspended row. A run the host serves resets
-- the count; a run that fails another way (a network error, a 5xx without
-- Retry-After, the budget) leaves the row as it was.
--
-- Its own table, not price_collector_leases (0143): a lease is coordination,
-- taken over once expired and deleted or left to expire at each run's end, and
-- its keys are runs (one 'tcgplayer' lease covers three hosts, 'cardmarket'
-- one), while this state is per (source, host) and must outlive every run. The
-- collectors tolerate the table's absence (42P01): before this migration they
-- run as they did, with no backoff or suspension, and record nothing.
--
-- A person, and only a person, clears a suspension, by name, in one statement:
--   UPDATE price_collector_hosts
--      SET suspended_at = NULL, suspended_reason = NULL, consecutive_refusals = 0, not_before = NULL,
--          cleared_at = now(), cleared_by = '<who>: <why it may be asked again>', updated_at = now()
--    WHERE source = '<source>' AND host = '<host>';
-- The guard below refuses any other way out of a suspension. No collector
-- runs from this migration, and no row is written here.
CREATE TABLE price_collector_hosts (
  source text NOT NULL REFERENCES member_price_source_releases(source) CHECK (source IN ('cardmarket','cardrush','tcgplayer')),
  host text NOT NULL CHECK (char_length(host) <= 253 AND host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  consecutive_refusals integer NOT NULL DEFAULT 0 CHECK (consecutive_refusals >= 0),
  last_success_at timestamptz,
  last_refusal_at timestamptz,
  -- Cambridge's own codes (http-429, robots-disallows-collector, ...), never upstream text.
  last_refusal_reason text CHECK (last_refusal_reason ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  not_before timestamptz,
  suspended_at timestamptz,
  suspended_reason text CHECK (suspended_reason ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  cleared_at timestamptz,
  cleared_by text CHECK (char_length(cleared_by) <= 500 AND btrim(cleared_by) <> ''),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (source, host),
  CHECK ((last_refusal_at IS NULL) = (last_refusal_reason IS NULL)),
  CHECK (consecutive_refusals = 0 OR last_refusal_at IS NOT NULL),
  CHECK ((suspended_at IS NULL) = (suspended_reason IS NULL)),
  CHECK (suspended_at IS NULL OR consecutive_refusals >= 1),
  CHECK ((cleared_at IS NULL) = (cleared_by IS NULL))
);

-- A row keeps its source and host. A suspension stands until a person clears
-- it: it is not moved, a suspended row is not deleted, and clearing it names
-- who did and is stamped by the clearing transaction. TRUNCATE, which fires no
-- row trigger, is refused by its own.
CREATE FUNCTION price_collector_host_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'price collector host state is not truncated; clear a suspension by name';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.suspended_at IS NOT NULL THEN
      RAISE EXCEPTION 'a suspended collector host is cleared by name, not deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.source <> OLD.source OR NEW.host <> OLD.host THEN
    RAISE EXCEPTION 'a collector host row keeps its source and host';
  END IF;
  IF OLD.suspended_at IS NOT NULL AND NEW.suspended_at IS NOT NULL AND NEW.suspended_at <> OLD.suspended_at THEN
    RAISE EXCEPTION 'a collector host suspension is not moved';
  END IF;
  IF OLD.suspended_at IS NOT NULL AND NEW.suspended_at IS NULL
     AND (NEW.cleared_by IS NULL OR NEW.cleared_at IS NULL OR NEW.cleared_at NOT BETWEEN transaction_timestamp() AND clock_timestamp()) THEN
    RAISE EXCEPTION 'a suspended collector host is cleared by a person: set cleared_by and cleared_at = now()';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER price_collector_host_guard BEFORE UPDATE OR DELETE ON price_collector_hosts
  FOR EACH ROW EXECUTE FUNCTION price_collector_host_guard();
CREATE TRIGGER price_collector_host_truncate_guard BEFORE TRUNCATE ON price_collector_hosts
  FOR EACH STATEMENT EXECUTE FUNCTION price_collector_host_guard();

COMMENT ON TABLE price_collector_hosts IS
  'Per collector source and host: last served, last refused (Cambridge''s code), not_before from Retry-After (capped at 7 days, 6 hours by default), and suspended_at after 3 refused runs in a row. Collectors skip a host until not_before and never touch a suspended row; only a person clears one, by name (cleared_by, cleared_at). Read by /api/v1/sources health.';
