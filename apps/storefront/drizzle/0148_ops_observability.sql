-- Operations observability for the admin monitor (/admin/system/monitor;
-- docs/operations/monitoring.md): what each price job did on each run, how
-- the MCP gate answered, and hourly counts of the requests Vercel's logs
-- show. Five tables, all counts and Cambridge's own words. None holds an IP
-- address (hashed or not), a user agent, a query string, a referrer, a body,
-- a raw path, error text, a price, or a visitor, session, device, account or
-- key id, so no row can be joined to another request or to a person. Words
-- come from fixed lists (src/lib/observability/vocabulary.ts, which these
-- CHECKs mirror); a request is counted under its route template and its
-- declared kind, never as itself.
--
-- Retention (src/lib/observability/retention.ts): traffic_hourly and
-- traffic_pulls keep 35 days; mcp_daily, error_daily and ops_job_outcomes 13
-- months. The writers delete older rows as they write, and the monitor shows
-- any table holding a row past its period.
--
-- Nothing is collected by this migration, and the collecting writers ship
-- off: the MCP counter runs only while OPS_MCP_DAILY is exactly "on", and the
-- traffic pull has its own flag. Turning either on follows the /privacy note
-- that names it. The job-outcome writer records Cambridge's own jobs only;
-- before this migration it records nothing and the jobs run as they did
-- (42P01 is tolerated). It applies in one transaction; no row is written here.

-- Counts carried with a job outcome: an object, at most two levels deep, of
-- non-negative whole numbers, booleans, nulls and short tokens (a host, a
-- date, a code), with no arrays. A token has no spaces, so no message or
-- upstream text fits; a whole number is a count, and decimal values do not
-- fit at all. Cambridge never puts a price or source value here.
CREATE FUNCTION ops_counts_valid(counts jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN jsonb_typeof(counts) IS DISTINCT FROM 'object' THEN false
    WHEN octet_length(counts::text) > 2048 THEN false
    ELSE NOT jsonb_path_exists(counts, 'strict $.**{3 to last}')
      AND NOT jsonb_path_exists(counts, 'strict $.** ? (@.type() == "array")')
      AND NOT jsonb_path_exists(counts, 'strict $.** ? (@.type() == "object").keyvalue() ? (!(@.key like_regex "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$"))')
      AND NOT jsonb_path_exists(counts, 'strict $.** ? (@.type() == "string" && !(@ like_regex "^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,79}$"))')
      AND NOT jsonb_path_exists(counts, 'strict $.** ? (@.type() == "number" && (@ < 0 || @ > 1000000000000 || @ != @.floor()))')
  END
$$;

-- One row per run of a price job: collect/cardmarket, collect/cardrush,
-- collect/tcgplayer and derive/market (the cron route's path under
-- /api/cron, a code constant). The route writes it after its work, outside
-- the derivation's transaction, and a failed write never fails the job. A
-- disabled run writes nothing: those routes promise to touch no database
-- while their flag is off. outcome is ran, already-derived, disabled, or
-- refused:<code> (the job declined by its own rule: a lease held, a host
-- backing off, an out-of-order date) or unavailable:<code> (something it
-- needed was not there: storage, ECB, the source, or an error). Separate
-- from market_derivation_runs, which refuses updates and has no row for a
-- refused day.
CREATE TABLE ops_job_outcomes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job text NOT NULL CHECK (char_length(job) <= 64 AND job ~ '^[a-z][a-z0-9-]*(/[a-z0-9-]+){1,3}$'),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  http_status smallint NOT NULL CHECK (http_status BETWEEN 100 AND 599),
  outcome text NOT NULL CHECK (outcome ~ '^(ran|already-derived|disabled|(refused|unavailable):[a-z0-9][a-z0-9-]{0,63})$'),
  counts jsonb NOT NULL DEFAULT '{}'::jsonb CONSTRAINT ops_job_outcomes_counts_valid CHECK (ops_counts_valid(counts)),
  CHECK (finished_at >= started_at AND finished_at - started_at <= interval '1 hour')
);
CREATE INDEX ops_job_outcomes_job ON ops_job_outcomes (job, started_at DESC);
CREATE INDEX ops_job_outcomes_started ON ops_job_outcomes (started_at);

-- Requests to /api/mcp per UTC day, by JSON-RPC method, tool, whether the
-- request authenticated, and how the gate answered. No key, agent or account
-- id: a key's own minute counts stay in agent_rate_buckets (7 days), and
-- nothing here says which key called which tool. A method or tool name
-- outside the lists is counted as other or unknown, and the name is dropped.
CREATE TABLE mcp_daily (
  day date NOT NULL,
  method text NOT NULL CHECK (method IN ('initialize', 'notifications/initialized', 'tools/list', 'tools/call', 'resources/list', 'prompts/list', 'native', 'other', 'invalid')),
  tool text NOT NULL CHECK (tool IN ('agent.self', 'play.list_open_rooms', 'play.observe', 'play.legal_actions', 'play.take_action', 'play.queue_match', 'play.cancel_queue', 'play.match_history', 'catalog.search', 'catalog.lookup_many', 'leaderboards.read', 'prices.recent', 'deck.save', 'deck.list_mine', 'coverage.hunt.list', 'coverage.hunt.view', 'coverage.hunt.contribute', 'coverage.hunt.my_cases', 'mcp.list_tools', 'none', 'unknown')),
  authenticated boolean NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('ok', 'notification', 'invalid-request', 'unauthenticated', 'forbidden', 'tool-error', 'rate-limited', 'not-found', 'error')),
  count integer NOT NULL CHECK (count > 0),
  PRIMARY KEY (day, method, tool, authenticated, outcome),
  -- Only a tool call names a tool.
  CHECK (method IN ('tools/call', 'native') OR tool = 'none')
);

-- Requests per UTC hour from Vercel's request logs, by host class, route
-- template, page-data (RSC) or not, declared actor class, status, Vercel's
-- cache result and firewall action. Only what reached Vercel: pages
-- Cloudflare answered from its cache never appear. Classes are declared, not
-- verified: the logs carry no IP address to check a user agent against.
CREATE TABLE traffic_hourly (
  hour timestamptz NOT NULL CHECK (date_trunc('hour', hour, 'UTC') = hour),
  host_class text NOT NULL CHECK (host_class IN ('apex', 'www', 'prod-alias', 'deploy-url', 'other')),
  path_group text NOT NULL CHECK (path_group IN ('/', '/product/[sku]', '/market', '/market/[sku]', '/cards/...', '/catalog', '/prices', '/prices/search', '/prices/[game]/...', '/methodology/*', '/guides/*', '/standards', '/agents', '/find', '/welcome-all', '/pulls/*', '/artists/*', '/contact', '/login', '/robots.txt', '/sitemap*', '/llms*.txt', '/.well-known/*', '/api/mcp', '/api/v1/prices/*', '/api/v1/cards/*', '/api/v1/sold-comps/*', '/api/v1/sources', '/api/v1/universal/*', '/api/v1/market/*', '/api/v1/member-prices', '/api/v1/plans', '/api/v1/account/*', '/api/v1/feedback', '/api/v1/peers', '/api/v1/guestbook', '/api/v1/agents/*', '/api/v1/(other)', '/api/data-api/*', '/api/market/*', '/api/auth/*', '/api/account/*', '/api/cron/*', '/api/(ui prefs)', '/api/(other)', 'static', '(other page)')),
  rsc boolean NOT NULL,
  actor_class text NOT NULL CHECK (actor_class IN ('cron-self', 'own-monitor', 'probe', 'ai-training-crawler', 'ai-search', 'ai-user-fetch', 'search-crawler', 'seo-crawler', 'social-preview', 'headless-declared', 'library', 'mcp-client', 'scanner', 'other-crawler', 'declared-agent', 'browser-like-fleet', 'browser-like', 'unknown')),
  classifier_version text NOT NULL CHECK (classifier_version IN ('ctcg.actor-class/v1')),
  status_class text NOT NULL CHECK (status_class IN ('2xx', '304', '3xx', '400', '401', '403', '404', '429', '4xx', '500', '503', '5xx', 'other')),
  cache_result text NOT NULL CHECK (cache_result IN ('hit', 'miss', 'bypass', 'stale', 'prerender', 'revalidated', 'none', 'other')),
  waf_action text NOT NULL CHECK (waf_action IN ('none', 'log', 'challenge', 'deny', 'bypass', 'rate-limit', 'other')),
  count integer NOT NULL CHECK (count > 0),
  PRIMARY KEY (hour, host_class, path_group, rsc, actor_class, classifier_version, status_class, cache_result, waf_action)
);

-- What each traffic pull covered, so an hour no pull counted reads as
-- unknown, never as zero. records and pages are what the pull read; the
-- error code is Cambridge's own. Two pulls that counted (ok or partial) never
-- cover the same hour, so no hour is counted twice; a failed pull counted
-- nothing and may be retried.
CREATE TABLE traffic_pulls (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  window_start timestamptz NOT NULL CHECK (date_trunc('hour', window_start, 'UTC') = window_start),
  window_end timestamptz NOT NULL CHECK (date_trunc('hour', window_end, 'UTC') = window_end),
  status text NOT NULL CHECK (status IN ('ok', 'partial', 'failed')),
  records integer NOT NULL CHECK (records >= 0),
  pages integer NOT NULL CHECK (pages >= 0),
  error_code text CHECK (error_code ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  pulled_at timestamptz NOT NULL DEFAULT now(),
  CHECK (window_end > window_start AND window_end - window_start <= interval '24 hours'),
  CHECK ((status = 'ok') = (error_code IS NULL)),
  CONSTRAINT traffic_pulls_counted_once EXCLUDE USING gist (tstzrange(window_start, window_end) WITH &&) WHERE (status <> 'failed')
);
CREATE INDEX traffic_pulls_window ON traffic_pulls (window_start);

-- Runtime-log errors per UTC day, by tag (the line's bracketed prefix, from
-- a fixed list) and the request's status (0 when the line gives none). Never
-- the line's text.
CREATE TABLE error_daily (
  day date NOT NULL,
  tag text NOT NULL CHECK (tag IN ('wholesale', 'fairness-audit', 'cron', 'cron/maintenance', 'cron/collect/cardmarket', 'cron/collect/cardrush', 'cron/collect/tcgplayer', 'cron/derive/market', 'mcp', 'webhook', 'market', 'auction', 'data-api', 'member-prices', 'agents', 'collector-observations', 'cardmarket-collector', 'db-connections', 'auth', 'ops', 'other', 'untagged')),
  status smallint NOT NULL CHECK (status = 0 OR status BETWEEN 100 AND 599),
  count integer NOT NULL CHECK (count > 0),
  PRIMARY KEY (day, tag, status)
);

COMMENT ON TABLE ops_job_outcomes IS
  'One row per run of a price job (collect/*, derive/market): when, the HTTP status, the outcome in Cambridge''s words and counts (rows, skips, hosts, dates), never a price, source value or message. Written after the work, never failing it. Kept 13 months.';
COMMENT ON TABLE mcp_daily IS
  'Requests to /api/mcp per UTC day by method, tool, authenticated or not, and outcome, from fixed lists. No key, agent or account id. Written only while OPS_MCP_DAILY is on. Kept 13 months.';
COMMENT ON TABLE traffic_hourly IS
  'Requests that reached Vercel per UTC hour by host class, route template, RSC, declared actor class (classifier_version), status, cache result and firewall action. No IP, user agent, query, referrer, body or raw path. Kept 35 days.';
COMMENT ON TABLE traffic_pulls IS
  'The windows each traffic pull read and whether it counted them, so an uncounted hour reads as unknown. Counted windows never overlap. Kept 35 days.';
COMMENT ON TABLE error_daily IS
  'Runtime-log error lines per UTC day by tag (fixed list) and status. Never the line''s text. Kept 13 months.';
