# The monitor: what it reads, what it cannot see

**Status:** written 2026-11-06 by an agent (Claude Code). It describes the
code on the branch that adds migration 0148; nothing here has run against
production. Yu asked on 2026-11-05 for "an internal monitoring and analytics
page for understanding visitor actions", and chose hourly Vercel logs for
traffic. This change builds the data layer and the page. The hourly traffic
pull that fills `traffic_hourly`, `traffic_pulls` and `error_daily` is a
separate change; until it lands, those panels read "unknown".

`/admin/system/monitor` (source: `apps/storefront/src/app/admin/system/monitor/`)
is behind the admin gate: `proxy.ts` sends a visitor without a session
cookie to sign in, the admin layout's `requireAdminPage()`
(`src/lib/auth/realms.ts`) sends anyone whose `users.role` is not `admin`
away, and the page calls it again before it reads anything. It is
server-rendered and sends nothing back: no client script, cookie, beacon or
analytics library. The readers are `src/lib/observability/monitor.ts`.

## What it will never hold

Every table it reads holds counts and Cambridge's own words. None holds an IP
address (hashed or not), a user agent, a query string, a referrer, a request
or response body, a raw path, log text, a price or source value, or a
visitor, session, device, account or key id. No two requests can be joined,
and no count says which key called which tool. Words come from fixed lists in
`src/lib/observability/vocabulary.ts`; migration 0148's CHECKs hold the same
lists (`vocabulary.test.ts` compares them), so a word outside them is refused
by the database. Changing a list is a privacy change: the traffic lists are
versioned (`ctcg.actor-class/v1`) and a new version comes with a migration
and its /privacy note.

## The panels

Each panel states its source and what it covers. When a source cannot be
read (a table not provisioned, a failed query) the panel says "unknown" and
why. It never shows that as zero.

| Panel | Reads | Cannot see |
| --- | --- | --- |
| 1. Collectors | `member_price_batches` (0137) for 7 days, per source and, for CardRush, per host (its ingest key names the host); each source's newest batch; `price_collector_hosts` (0146) judged as `/api/v1/sources` judges it; `price_collector_leases` (0143); `ops_job_outcomes` for the three collect jobs; the `DATA_COLLECT_*` flags in this deployment | Observations per batch (not counted: a Cardmarket file is about 74,600 rows); quarantine entries' text (counted only, it holds source text); a run that failed before writing a batch; any run before 0148 |
| 2. Derivation | The last 14 UTC dates: each date's `market_derivation_runs` row (0141) with the reference, index and premium rows it wrote, its sources and ECB quote dates; the outcomes recorded for that date (refusal, excluded sources, non-zero skips); the latest run's rows by game, market and scope or confidence; `DATA_DERIVE_MARKET` | Any value: no amount, level, ratio or FX rate is read. A date before 0148 with no run row is unknown, since a refused day left no trace then |
| 3. Data API | `DATA_API_READS`, `DATA_API_PLANS_PUBLISHED`, `DATA_API_CHECKOUT_INTAKE`; `data_api_usage_months` (0142) summed per month with the number of accounts that made any request; `traffic_hourly` for `/api/v1/market/*`, `/api/v1/member-prices`, `/api/v1/plans`, `/api/v1/account/*` and `/api/data-api/*` | Which account made a request (never read); requests Vercel did not see; hours no pull counted |
| 4. Agents | `mcp_daily` for 30 days by method, tool, authenticated or not, and outcome; `agent_keys` counted, and active keys by when they were last used (under an hour, a day, a week, a month, older, never); `agent_rate_buckets` per day (its own 7 days): requests, keys, busiest key-minute | Which key or agent did anything; MCP requests while `OPS_MCP_DAILY` is off (read as not counting, not zero); the other agent doors, which appear in traffic by route group |
| 5. Traffic | `traffic_pulls` for which of the last 35 days' hours were counted (ok, partly, failed, unknown); `traffic_hourly` for 7 days: requests per day, RSC page-data share, share reaching Vercel directly (the `*.vercel.app` hosts), status mix, declared class by day, class by route group, 404 hot spots | Anything Cloudflare answered from its own cache (cookie-less HTML is cached there, so page views are undercounted); IP addresses, so no user agent's claim is verified and no class is "human"; query strings, referrers and bodies; requests older than Vercel keeps logs (about 24 h on the current plan), if a pull is missed |
| 6. Errors | `error_daily` for 30 days by tag (a fixed list) and status | The line's text; invocations that printed nothing (runtime logs hold only those that did); hours no pull counted |
| Retention | Each 0148 table's rows, oldest row and rows past its period | |

## The tables (migration 0148)

- `ops_job_outcomes`: one row per run of `collect/cardmarket`,
  `collect/cardrush`, `collect/tcgplayer` and `derive/market`: start, finish,
  HTTP status, outcome and counts. Outcomes: `ran`, `already-derived`,
  `refused:<code>` (the job declined by its own rule: a lease held, request
  spacing, a host backing off or suspended, a revoked release, an
  out-of-order date, no permitted input) or `unavailable:<code>` (something
  it needed was missing or failed: storage, ECB, the source, an error).
  `disabled` is in the vocabulary, but these four routes record no disabled
  run: their tests hold them to touching no database while the flag is off,
  so the panels read the flags instead. Counts are whole numbers, booleans and
  short tokens (a host, a date, a code), at most two levels deep, checked by
  `ops_counts_valid`; text with spaces, decimals and arrays do not fit.
- `mcp_daily`: per UTC day, method, tool, authenticated or not, outcome →
  count. No key, agent or account id.
- `traffic_hourly`: per UTC hour, host class, route group, RSC or not,
  declared actor class, classifier version, status class, cache result,
  firewall action → count.
- `traffic_pulls`: each pull's window, status, records and pages read and
  error code. Two pulls that counted (ok or partial) cannot cover the same
  hour (an exclusion constraint), so no hour is counted twice.
- `error_daily`: per UTC day, tag, status (0 when the line gives none) →
  count.

## Writers

- **Job outcomes** (`src/lib/observability/job-outcomes.ts`). Each of the four
  cron routes runs its work through `recordedRun`, which writes the row after
  the work (outside the derivation's transaction) and before the response
  returns. A write that fails never changes the job's answer: before 0148
  (`42P01`) it records nothing, quietly; any other failure logs the error's
  name only. A report the mapper cannot read is left unrecorded rather than
  recorded as something it was not. On by default: these are Cambridge's own
  jobs, not visitors.
- **MCP counts** (`src/lib/observability/mcp-daily.ts`). Off unless
  `OPS_MCP_DAILY` is exactly `on`. On, `/api/mcp` adds one to one row per
  request in a single statement, after the response is sent (`after()` from
  `next/server`), so counting never changes how a request is answered and a
  failed write is dropped, not retried or logged. A method or tool name the
  gate does not have is counted as `other` or `unknown` and the name is not
  kept. While it is on, the gate's published operational-metadata lists
  (`GET /api/mcp`, `/.well-known/mcp.json`, `/.well-known/mcp-config.json`)
  name the counter; while it is off they do not.
- **Traffic and errors**: the hourly pull, in its own change.

## Retention

Hourly rows (`traffic_hourly`, `traffic_pulls`) are kept 35 days. Daily rows
(`mcp_daily`, `error_daily`) and job outcomes are kept 13 months. The periods
live in `src/lib/observability/retention.ts`. `pruneObservability` deletes
everything past its period in one statement; it runs after every recorded job
outcome, and the MCP upsert deletes its own expired rows in the same
statement. The monitor's Retention panel shows any row past its period, which
means the sweep has not run (for instance, every job off and the counter off).
Nothing keeps a copy of deleted rows, and no raw log is ever stored.

## Flags

| Flag | Default | Effect |
| --- | --- | --- |
| `OPS_MCP_DAILY` | off | Counts `/api/mcp` requests into `mcp_daily`. Turn on only after /privacy names the count, its purpose and its period. |
| traffic pull flag | off | In the pull's own change. |
| `DATA_COLLECT_*`, `DATA_DERIVE_MARKET`, `DATA_API_*` | as set | Read and shown, never changed, by the page. |

Turning a counting flag on is Yu's call, and waits for the /privacy update
that describes it: until then the notice says no application-level visit or
behaviour profile is made, which aggregate counts keep true, but the notice
does not yet name these counts or "understanding visitor actions" as a
purpose.

## Checks

- `pnpm --filter cambridgetcg-storefront exec vitest run src/lib/observability src/app/admin/system/monitor src/app/api/mcp src/app/api/cron`
- The integration test applies 0148 and the migrations it reads beside on a
  disposable loopback database, and reads every panel through both pg and
  postgres.js (the page's driver):
  `OPS_TEST_DATABASE_URL=postgres://<user>@127.0.0.1:<port>/<a name containing test> pnpm --filter cambridgetcg-storefront exec vitest run src/lib/observability/observability.integration.test.ts`
