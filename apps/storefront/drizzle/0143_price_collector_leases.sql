-- One collector run at a time per lease key (docs/plans/tcg-data-platform/
-- paid-data-api.md §2). Two overlapping runs, from a duplicate cron delivery
-- or a manual authenticated call during a scheduled one, would double the
-- rate the collector keeps to: 0.5 rps per CardRush host (an agent's call),
-- and TCGplayer's robots.txt Crawl-Delay 10 across its hosts. No rate is
-- recorded as agreed with either source. Each run takes its lease before any
-- request or write. When it ends, a page collector leaves its row held by
-- 'request-spacing' until one request interval has passed (2 s per CardRush
-- host, 10 s for TCGplayer), so a run that follows at once cannot send its
-- first request early; Cardmarket deletes its row. A run the platform
-- stops first (maxDuration 300 s) leaves its row to expire; the collectors set
-- expires_at past that limit, so an expired row never belongs to a live run.
--
-- Keys: 'cardmarket', 'tcgplayer' (one lease for all its hosts) and
-- 'cardrush:<host>' (one per host). Leases are coordination, not evidence:
-- a row is taken over once expired, and only its holder releases it. No
-- collector runs from this migration.
CREATE TABLE price_collector_leases (
  lease_key text PRIMARY KEY CHECK (lease_key ~ '^[a-z][a-z0-9-]*(:[a-z0-9.-]+)?$'),
  holder text NOT NULL CHECK (btrim(holder) <> ''),
  acquired_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > acquired_at)
);
