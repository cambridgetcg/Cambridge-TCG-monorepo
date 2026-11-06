# The monitor: what it reads, what it cannot see

**Status:** written 2026-11-06 by agents (Claude Code). It describes the
code on the branch that adds migration 0148; nothing here has run against
production, and the Vercel endpoint below has not been called from this
code. Yu asked on 2026-11-05 for "an internal monitoring and analytics
page for understanding visitor actions", and chose hourly Vercel logs for
traffic, read with the existing `VERCEL_TOKEN`. The branch builds the data
layer, the page and the hourly traffic pull that fills `traffic_hourly`,
`traffic_pulls` and `error_daily`; until `TRAFFIC_PULL` is on, those panels
read "unknown".

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
- **Traffic and errors** (`src/lib/traffic/pull.ts`, route
  `/api/cron/traffic-pull`, hourly at :07 in `vercel.json`). Off unless
  `TRAFFIC_PULL` is exactly `on`; off, the route answers before touching
  Vercel or the database. On, each run:
  - picks the hours to read: the previous complete UTC hour, and any earlier
    hour within Vercel's log window (about 24 hours on the current plan, less
    a 15-minute margin) that no pull has counted, oldest first. It never
    reads an hour before the earliest `traffic_pulls` row, so the first run
    counts only the hour before it;
  - for each hour, reads the CDN request records, then the error-level
    runtime lines (the endpoint below), and classifies each record in memory
    (`src/lib/traffic/classify.ts`, next section);
  - writes a counted hour in one transaction that starts with its
    `traffic_pulls` row, so 0148's exclusion constraint refuses a second
    count of the same hour (a repeated or overlapping run gets
    `already-counted`); `traffic_hourly` is replaced for that hour and
    `error_daily` adds to its UTC day;
  - drops every record with the hour. No IP address is asked for. The user
    agent, path, route, host, country, request id and log text are read in
    memory only; a request id is held for the hour to count a record once
    (paging can repeat one at a page boundary) and to give an error line the
    status of the request it came from. No request is joined to another;
  - stops starting hours at 240 s (the route's `maxDuration` is 300 s), and
    sweeps every observability table past its retention.

  How an hour ends, in `traffic_pulls`:

  | Status | When | Counts kept |
  | --- | --- | --- |
  | `ok` | Requests and error lines read whole | All |
  | `partial` `stream-gap` | Vercel reported an interval it left out | What was read |
  | `partial` `errors-<code>` | Requests whole, error lines not, for a reason that would not pass (a 402, a rejected query), or on the hour's last chance | Traffic whole; errors as read |
  | `partial` `<code>` | The request read stopped short on the hour's last chance (the next run would find it outside Vercel's window) | What was read |
  | `partial` `no-records` | No request record at all, on the last chance | None |
  | `failed` `<code>` | Otherwise: the read stopped short, or found no record (`no-records`: Vercel's cron alone calls the site every minute, so none means the read went wrong) | None; the next run tries again |

  Codes: `budget-exhausted`, `rate-limited` (a 429 whose Retry-After is over
  20 s, or a third), `http-5xx` (after two retries), `timeout`, `network`,
  `token-refused` (401/403), `plan-required` (402), `outside-retention`,
  `query-rejected` (another 400), `invalid-response`, `page-cap` (200 pages),
  `record-too-large`. A refused token, a rate limit, Vercel failing or the
  budget stop the run; the hours left wait for the next run, unknown until
  then. To count a counted hour again (within Vercel's window), delete its
  `traffic_pulls` row: the next run replaces the hour's `traffic_hourly`
  rows, but adds its error lines to `error_daily` again.

## The traffic classifier (`ctcg.actor-class/v1`)

`src/lib/traffic/classify.ts`, ported from the classifier the 2026-11-05
traffic study used (`classify.py`, kept with the study, not in this
repository) onto 0148's words. Every class is what a request declared: the
logs carry no IP address, so no claim is checked, bot names are spoofed, and
no class says "human". First match wins:

1. **The path:** `/.env*`, `/.git`, other secret dotfiles, key and script
   files (`.pem`, `.key`, `.php`, `.sql`…), PHP admin pages and `/api/fs` are
   `probe`, whatever name the request gives.
2. **Cambridge's own clients:** `vercel-cron/` is `cron-self`;
   `kingdom-pulse` and `kingdom-door-check` are `own-monitor`.
3. **Declared names**, a fixed table: `search-crawler`, `ai-training-crawler`,
   `ai-search`, `ai-user-fetch`, `seo-crawler`, `social-preview`,
   `headless-declared`, `scanner`, `mcp-client`, `library`. Calls that are
   judgements: Amazonbot and Bytespider count as `ai-training-crawler`,
   `claude-code` as `ai-user-fetch`, OAI-AdsBot and TikTokSpider as
   `other-crawler`.
4. **`declared-agent`:** the form robots.txt asks for,
   `<project>/<version> (<contact>)` with an email address or URL. The
   contact is not kept.
5. **`other-crawler`:** any other name saying bot, crawler or spider (a
   browser-style string only when it names its bot as crawlers do, so a phone
   model with BOT in its name stays a browser).
6. **Browser-style strings** (`Mozilla/` with Chrome, Safari, Firefox or
   Edg): `browser-like-fleet` when the same string came from at least 5
   countries within the hour, otherwise `browser-like`. In the study's 24
   hours, 93% of browser-style requests came from strings seen in 5 or more
   countries in one hour; one person's browser is in one place.
7. **`unknown`**, including an empty user agent.

Paths become 0148's route groups (segment by segment, so `/agentsfoo` is not
`/agents`); RSC page-data fetches are those whose Vercel route ends `.rsc`.
Hosts: `cambridgetcg.com` is `apex`, `www.` is `www`,
`cambridgetcg-storefront.vercel.app` is `prod-alias`, a deployment's own
`cambridgetcg-storefront-….vercel.app` is `deploy-url`. Vercel's cache result
is lowercased; its firewall action `allow` counts as `none`. Runtime lines
count by their leading `[tag]` from 0148's list (`[cron/reconcile-stripe]`
counts as `cron`; `[auth][error]` as `auth`); a line about the database
running out of connections counts as `db-connections` whatever its tag. On
the study's 24 hours the port gave the same route-group totals as the study
and about 215 `traffic_hourly` rows per hour (about 185,000 at 35 days).

## The Vercel endpoint the pull reads (undocumented by Vercel)

Vercel's public REST reference does not document this endpoint. It is the
one the Vercel CLI calls for `vercel logs` and `vercel logs requests`, read
from the installed CLI's source (`vercel@64.5.0`, `dist/commands-bulk.js`
and `dist/chunks/chunk-MYHJNSCW.js`), not from a live call. Its shape can
change without notice; a change shows on the monitor as failed hours.

- `POST https://api.vercel.com/v1/observability/events?teamId=<team id>`,
  `Authorization: Bearer <VERCEL_TOKEN>`. The CLI also sends
  `x-vercel-observability-query-reason` (`cli/logs-requests`,
  `cli/logs-runtime`); the pull sends
  `cambridgetcg-storefront/traffic-pull/<requests|runtime>`. Whether Vercel
  requires a value it knows is unknown.
- Body: `event`, `scope` (`ownerId`: the team id; `projectIds`: the
  storefront's project id), `timeRange` (`start`, `end`, ISO 8601),
  `select` (field names), `order` (the CLI always sends `desc`), `limit`
  (at most 1,000 a page), optional `filter` (a KQL-like expression) and
  `cursor`.
- Request records: `event: "vercel.proxy_response"`, filter
  `(environment:"production") AND (NOT pathType:"background_func")` (the CLI
  always excludes background functions). The pull selects `requestId`,
  `requestHostname`, `requestPath`, `route`, `httpStatus`, `cacheResult`,
  `wafAction`, `clientUserAgent` and `clientIpCountry`; the CLI also selects
  `projectId`, `deploymentId`, `environment`, `requestMethod`, `pathType`,
  `edgeNetworkRegion` and `service`. The firewall view in the same CLI can
  group by `clientIp`, ASN and JA4; the pull never asks for them.
- Runtime lines: `event: "vercel.log"`, filter
  `(environment:"production") AND (level:(error OR fatal))`; the pull
  selects `requestId`, `level` and `message`.
- Each record carries `timestamp` without being selected. The pull counts a
  record only if its timestamp is inside the hour, so a record on the
  boundary is counted once whichever way Vercel treats `end`.
- Response: `{ events, pagination: { hasMore, nextCursor }, meta: {
  excludedIntervals? } }`. Paging: send `nextCursor` back as `cursor` while
  `hasMore` is true and the cursor changes. The CLI's help says paging is
  best-effort: records sharing a timestamp at a page boundary can repeat or
  be skipped (the study removed 13 repeats in 255,652 lines). The pull drops
  repeats by `requestId`; a skipped record cannot be seen.
- Errors as the CLI reads them: 413 with code `result_too_large` (halve the
  page size and try again), 402 (the plan does not serve the window: "CDN
  request logs require Observability Plus" beyond a day), 400 mentioning
  retention or the time range (outside what Vercel keeps), 403, 429.
- Retention measured on 2026-11-05: about 24 hours for both kinds on the Pro
  plan. Whether the token in `VERCEL_TOKEN` (made for the deploys page) may
  read logs is unknown until the first run; a refusal shows as
  `token-refused`.

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
| `TRAFFIC_PULL` | off | Runs the hourly traffic pull, which reads Vercel's logs with `VERCEL_TOKEN` and writes `traffic_hourly`, `traffic_pulls` and `error_daily`. Turn on only after /privacy names the counts, their purpose and their periods, and at least an hour after that note is live: the first run counts the hour before it. |
| `PUBLIC_FEEDBACK` | off | Opens POST `/api/v1/feedback` (and so the /contact form) to new messages; see Doors. Holders read and erase their messages with the key either way. |
| `PEER_HELLO_COUNT` | off | Counts each valid POST `/api/v1/peers` into `peer_hello_daily`; see Doors. |
| `VERCEL_TOKEN` | set for the deploys page | Read by the pull from the environment only; never logged or returned. |
| `DATA_COLLECT_*`, `DATA_DERIVE_MARKET`, `DATA_API_*` | as set | Read and shown, never changed, by the page. |

Turning a counting flag on is Yu's call, and waits for the /privacy update
that describes it to be live. That update is on the same branch: /privacy
(last updated 6 November 2026) names Cloudflare, the counts and their
periods (`#aggregate-counts`), the feedback door (`#feedback-door`) and
"understand how the site is used, from aggregate counts only" as a purpose,
and still says no visit or behaviour profile is made, which the counts keep
true. So a flag goes on only after that deploy is live, and `TRAFFIC_PULL`
at least an hour after.

## Doors (migration 0149)

Two places where something is kept because a sender chose to send it, and
one way back to what was kept.

- **The feedback door**, `/api/v1/feedback` (`src/lib/feedback/door.ts`),
  which the /contact form also posts to. While `PUBLIC_FEEDBACK` is on, a
  POST keeps a report in `public_feedback` field by named field: kind (from
  a fixed list that adds `question` and `data-error` to the five its
  signposts name), topic, message, named references (endpoint, subject,
  as_of, method_version, guide, step, request id, platform URLs, and the
  older report fields), and an optional reply address and name. A field it
  does not know is refused, never dropped, and the request as sent is never
  kept. The reply carries a random `feedback_id` and a holder key shown
  once; only the key's SHA-256 is stored. GET or DELETE with
  `Authorization: Bearer <key>` reads the status and answer or erases the
  row, open or closed. The one abuse control in the app is a global cap of
  30 accepted messages per UTC hour (`feedback_hourly_intake`, kept 48
  hours, no sender); a per-source rule needs an address, so it belongs at
  Cloudflare, and the production alias no longer serves API reads around
  it. Each message is deleted 180 days after it arrives. Admins read and
  answer at `/admin/feedback` (in the admin nav under ops): mark read,
  answer (which the holder reads with the key), close or delete. Each change
  goes through `adminAction`, whose log keeps the verb and the
  `feedback_id`, never the message or the answer, since that log outlives
  the row.
- **A counted hello**, POST `/api/v1/peers` (`src/lib/peers.ts`). While
  `PEER_HELLO_COUNT` is on, a valid hello adds one to today's
  `peer_hello_daily` row for its declared kind (or `undeclared`), capped at
  10,000 a day, and the reply says "counted in today's total; nothing about
  you stored". The content hash is echoed, never written. Kept 13 months.
- **What you record about me**, MCP `agent.self`
  (`src/lib/agents/self-record.ts`): the calling key's own minute buckets
  (summed per UTC day), `last_used_at`, tier limit and how long each is
  kept, the items `/.well-known/mcp.json` lists. It reads them in
  agent.self's one query and collects nothing new.

The maintenance cron sweeps all three 0149 tables at minute 23 of every hour
(`src/lib/feedback/retention.ts`), whether or not the doors are open, so a
period holds after a door closes; the writers also clear what they pass,
and no read returns an expired message.

## Checks

- `pnpm --filter cambridgetcg-storefront exec vitest run src/lib/observability src/lib/traffic src/app/admin/system/monitor src/app/api/mcp src/app/api/cron`
- The integration test applies 0148 and the migrations it reads beside on a
  disposable loopback database, and reads every panel through both pg and
  postgres.js (the page's driver):
  `OPS_TEST_DATABASE_URL=postgres://<user>@127.0.0.1:<port>/<a name containing test> pnpm --filter cambridgetcg-storefront exec vitest run src/lib/observability/observability.integration.test.ts src/lib/traffic/pull.integration.test.ts`.
  The traffic one runs the pull against a mocked Vercel and the real 0148
  schema, through pg and postgres.js: counts an hour once, refuses a second
  count through the exclusion constraint, back-fills, records a refused hour
  as failed, and sweeps past retention.
- `pnpm audit:cron-auth` checks that the route calls `requireCronAuth`.
- The doors: `pnpm --filter cambridgetcg-storefront exec vitest run src/lib/feedback src/app/api/v1/feedback src/app/api/v1/peers src/app/contact src/app/admin/feedback src/lib/agents src/proxy.test.ts`,
  and on a disposable loopback database
  `DOORS_TEST_DATABASE_URL=postgres://<user>@127.0.0.1:<port>/<a name containing test> pnpm --filter cambridgetcg-storefront exec vitest run src/lib/feedback/door.integration.test.ts`,
  which applies 0149 alone, checks its refusals, fills and caps the hour,
  reads and erases as a holder through pg and postgres.js, counts hellos to
  the cap and sweeps past each period.
