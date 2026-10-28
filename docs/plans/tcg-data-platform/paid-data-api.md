# Paid data API: collection, derived market data and plans

Part of the [TCG data platform roadmap](README.md). Drafted 2026-10-28 from Yu's
[decision of that day](../../decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md),
and rewritten the same day to describe what was built, from the integration
branch based on `87a29989`. The survey behind the draft read the code at
`462c2076`. Production data, freshness and service health were not queried,
and whether any of this is deployed or applied in production was not checked.

## Where things stood before this work (2026-10-28)

- **One live price path.** Cardmarket's official daily files feed
  `member_price_observations` (migration 0137) through
  `apps/storefront/src/lib/datafeed/member-price-ingest.ts`. It had run once,
  by hand: a One Piece batch on 2026-09-08 with no SKU mappings. Nothing
  scheduled it. Members read it free through `/api/v1/member-prices`, the
  `/prices` browser and the session export.
- **CardRush and TCGplayer were locked in code** after 2026-07-11/12, pending
  permission. CardRush had a working HTML scraper and sitemap discovery, but
  it relied on Bright Data, a Chrome User-Agent and residential lanes.
  TCGplayer had an OAuth API reader with its token mint removed. The
  standalone `cambridgetcg/tcg-wholesale` scrape workflow is
  `disabled_manually`; its last runs, on 2026-07-24, failed.
- **Legacy pipelines outside the storefront** are left alone, and none of
  them is the target:
  - the frozen wholesale app, writing to the catalogue database
    `price_archive`;
  - `tcg-pricing-backend` on AWS, out of reach under D6;
  - `tradeinpro` prototypes;
  - the `cambridge-tcg-github/pricing` Lambdas.

  Worth porting: the IQR/confidence ideas from
  `tcg-pricing-backend/services/scrapers/cardmarket/pricing.py`. Not worth
  porting: evasion code.
- **No paid machinery fitted as-is.** Member keys are free, scoped
  `price-read`, limited to a constant 30 requests a minute, and unmetered.
  PRISM's Stripe stack is test-only by construction and was the template to
  copy. `NEW_PAID_COMMERCE_RETIRED = true` closes all new paid commerce.

## Shape

```
CardRush pages ─┐  identified collectors (crons; DATA_COLLECT_* on)
TCGplayer data  ┼─► member_price_observations ──► /prices (member-display, attributed)
Cardmarket files┘        │  (raw, immutable)        /api/v1/member-prices (Cardmarket only, as before)
                         ▼
             price_source_crosswalks (product → SKU, evidence)
             price_source_set_crosswalks (source set → set code)
                         ▼
             market derivation job (daily cron; DATA_DERIVE_MARKET on)
                         ▼
   market_reference_prices · market_indices · market_premiums   (derived, immutable)
                         ▼
   /api/v1/market/* (DATA_API_READS on) ◄── member key ──► entitlement (free | pro | business)
                                                              ▲
                                  data_api_subscriptions ◄── Stripe (test mode) webhooks
```

Everything new is additive and off by default. Applying or skipping a
migration never changes what the free member feed serves today. With every
switch off, a collector or the derivation job answers
`200 {ok: true, ran: false, reason: "disabled"}` after the cron secret,
before touching the network or the database; the data-API reads and the plan
catalogue answer 404 `NOT_PUBLISHED`; checkout answers 410. Switched on too
early, none reports an empty success: a collector without the lease table
(0143) answers 503 and reads nothing, a page collector without its 0139
release row reports `release-revoked-or-unreviewed` and reads nothing, and the
derivation job and the reads answer 503 not-provisioned.

## Switches and defaults

Each switch is read from the environment on every request
(`apps/storefront/src/lib/datafeed/collection-flags.ts`,
`apps/storefront/src/lib/data-api/posture.ts`), and every one is Yu's to set
in production.

| Switch | Default | When set |
| --- | --- | --- |
| `DATA_COLLECT_CARDMARKET` | off: anything but exactly `on` | `/api/cron/collect/cardmarket` reads Cardmarket's One Piece files daily (§2) |
| `DATA_COLLECT_CARDRUSH` | off | `/api/cron/collect/cardrush` reads one CardRush host per run (§2) |
| `DATA_COLLECT_TCGPLAYER` | off | `/api/cron/collect/tcgplayer` reads TCGplayer price guides, stalest set first (§2). Waits for the scope question in the decision record. |
| `DATA_DERIVE_MARKET` | off | `/api/cron/derive/market` derives today's UTC date once (§3) |
| `DATA_API_READS` | off | `/api/v1/market/*` and `/api/v1/account/usage` serve, and OpenAPI lists them and the derived-row schemas (§5) |
| `DATA_API_PLANS_PUBLISHED` | off | `/api/v1/plans` serves, and OpenAPI lists it (§5) |
| `DATA_API_CHECKOUT_INTAKE` | `closed` | `test`: checkout admits accounts whose `users.role` is `admin`, in Stripe test mode (§6) |
| `DATA_API_STRIPE_SECRET_KEY`, `DATA_API_STRIPE_WEBHOOK_SECRET`, `DATA_API_STRIPE_PRICE_PRO`, `DATA_API_STRIPE_PRICE_BUSINESS` | unset: billing unavailable | test-mode billing. A key that does not start `rk_test_` or `sk_test_` is refused (§6). |

`/api/v1/sources` reports each collector's flag and whether it is scheduled
(`member_pricing.collection`), from the same flags, so copy about collection
follows the switch.

Some limits are constants, changed only by a reviewed code change:
`NEW_PAID_COMMERCE_RETIRED = true`; the legacy acquisition locks
(`CARDRUSH_ACQUISITION_ENABLED`, `TCGPLAYER_ACQUISITION_ENABLED`,
`CARDMARKET_LEGACY_OAUTH_ENABLED`, all `false`); the Cardmarket games
(`CARDMARKET_COLLECT_GAMES = [18]` in `collection-flags.ts`); TCGplayer's
collected lines (`collect` in `TCGPLAYER_PRODUCT_LINES`); the six CardRush
hosts (`CARDRUSH_COLLECTOR_HOSTS`); and every rate and budget in §2.

## Migrations 0139–0143

Apply them in number order. This work assumed 0001–0138 are already applied
in production; that was not checked. The Postgres integration tests do not
replay 0001–0138: on an empty database `scripts/migrate.mjs` stops at legacy
0106 (`invalid input value for enum dispute_status: "escalated"`, found in the
final review). Each suite instead applies, by name and one transaction per
file as `migrate.mjs` does, the migrations it needs from 0137–0143, over a
stub `users` table where 0138 or 0142 references one. How 0139–0143 meet
production's full schema is therefore not tested.

| Migration | Adds | Needed by |
| --- | --- | --- |
| 0139 `widen_price_sources` | CardRush, TCGplayer and JPY in the source, currency and market CHECKs; derivation switch and evidence on each release row; `source_set_key` on observations; index `member_price_observations_derivation`; CardRush and TCGplayer release rows (display and derivation on); derivation on Cardmarket's row (§1) | every collector (CardRush and TCGplayer have no release row without it, and every collector writes `source_set_key`), the derivation job, the reads |
| 0140 `price_source_crosswalks` | append-only product and set crosswalks (§1) | every collector (each writes crosswalks; Cardmarket writes its reviewed set seed), the derivation job |
| 0141 `market_derived` | derivation runs, reference prices, indices and premiums, with their CHECKs, write guards and immutability triggers (§3) | the derivation job, the reads |
| 0142 `data_api_plans` | test-only customers, subscriptions, Stripe events, monthly usage and per-key minute buckets (§4); references `member_data_keys` (0138) | the reads (every authenticated read is metered there), checkout, portal, webhook |
| 0143 `price_collector_leases` | one lease row per running collector (§2) | every collector: without it a run answers 503 and reads nothing |

Applying them uses a production database credential this work was not given.

## 1. Sources and contract (migrations 0139, 0140)

**Contract** (`packages/data-spec`):

- `MemberPriceSource` adds `cardrush` and `tcgplayer`.
- Currency adds `JPY`.
- `underlyingMarket` adds `cardrush`.
- Assertions per source:
  - `cardrush`: JPY, market `cardrush`, granularity `printing`.
  - `tcgplayer`: USD, market `tcgplayer`, granularity `printing`.
  - Cardmarket and Scryfall keep their current rules.
- For live retail pages, source time is the instant the page is read. A
  CardRush or TCGplayer observation's `sourceUpdatedAt` equals its
  `retrievedAt`, and the contract text says so.
- Collection is forward-only: a CardRush or TCGplayer observation's
  `retrievedAt` is at or after `PAGE_SOURCE_COLLECTION_START`
  (`2026-10-28T00:00:00Z`), checked by `assertPriceObservationValues`.

**Policies** (`packages/data-ingest/src/member-prices.ts`):

- Each source has its own evidence version constant. Cardmarket and Scryfall
  keep `member-prices/2026-09-07.1`, so stored rows stay visible.
- New entries:
  - `cardrush`: `cardrush/2026-10-28.1`, uses `['member-display']`.
  - `tcgplayer`: `tcgplayer/2026-10-28.1`, uses `['member-display']`.
- Every policy has `derivation: { evidenceVersion, evidenceUrl } | null`:
  - Cardmarket: `cardmarket-derivation/2026-10-28.1`.
  - CardRush and TCGplayer: their own version.
  - Scryfall: `null`.
- Evidence URLs for the email grants point at the decision record:
  `repo:docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md#<source>`.
- `cardrush` and `tcgplayer` left `WITHHELD_PRICE_SOURCES`.
- Display is for looking, not harvesting. The member reader
  (`apps/storefront/src/lib/prices/member-feed.ts`) offers a source that feeds
  derived data but has no member-api release (CardRush, TCGplayer) only to
  the current view, at most 50 rows a page: never history mode, never a
  larger page. `/prices` says when they are left out and links the view that
  shows them. Cardmarket and Scryfall reads are unchanged.

**0139 `widen_price_sources`:**

- Widens the CHECKs on `member_price_source_releases.source`,
  `member_price_observations.currency` and `underlying_market`.
- Adds `derivation boolean NOT NULL DEFAULT false`,
  `derivation_evidence_version text` and `derivation_evidence_url text` to the
  release rows, with CHECK `NOT derivation OR (derivation_evidence_version IS
  NOT NULL AND derivation_evidence_url IS NOT NULL)`.
- CHECK `source <> 'scryfall' OR NOT derivation`.
- CHECK `source NOT IN ('cardrush','tcgplayer') OR (NOT member_api AND NOT member_download)`.
  Raw rows from these sources are never exportable, whatever an operator
  later sets.
- CHECK on `member_price_observations`: `source NOT IN ('cardrush','tcgplayer')
  OR retrieved_at >= '2026-10-28T00:00:00Z'`. A page read before the
  permission is never stored.
- Adds `source_set_key` to observations (non-blank when present): the
  source's own set key (Cardmarket's `idExpansion`, the set code a CardRush
  title prints, TCGplayer's set ID). It is evidence, not a mapping, and not
  part of the observation key, so re-reading an artifact adds no row. Rows
  stored before it stay NULL.
- Adds index `member_price_observations_derivation` on (source, metric,
  source_updated_at), so the derivation's daily read of a week of headline
  metrics is a range read rather than a scan of an append-only table.
- Inserts release rows for `cardrush` and `tcgplayer`, with member display and
  derivation on.
- Sets `derivation` on the Cardmarket row without touching its
  `evidence_version` or `evidence_url`.

**0140 `price_source_crosswalks`:**

- `price_source_crosswalks`: source, source_product_id, finish, language, sku,
  game, set_code, mapping_status (`exact` or `ambiguous`), evidence (the
  source's own identifiers, such as `title:OP01-001 [P]`), crosswalk_version,
  created_at, superseded_at. Unique on the live row per (source,
  source_product_id, finish, language).
- `price_source_set_crosswalks`: source, source_set_key, game, set_code,
  evidence, crosswalk_version, created_at, superseded_at. Unique on the live
  row per (source, game, source_set_key).
- Exact mapping needs the source's own collector identifiers, not a name
  match.
- History is append-only: a row enters live, stamped by its transaction, and
  the one permitted change closes a live row at the time of closing.
- Derivation resolves SKUs and sets through these tables when it runs.
  Observations stay immutable; re-mapping a product never rewrites history.

## 2. Collectors

Each collector runs as a storefront cron route. `requireCronAuth` comes first,
then a check that `DATA_COLLECT_<SOURCE>` is exactly `on`. Its acquisition
function refuses to run unless the caller passes the policy's evidence
version, and each run checks the release row before its first request.
Batches are written through `member-price-writer.ts`, which re-checks the
release row inside the transaction. Each route sets `maxDuration = 300`, the
most any storefront route asks for (a value over the plan's limit can fail the
whole deploy, not just the route), and each run keeps to a 270 s budget so it
has room to write and report.

| Collector | Route / schedule | Transport | Output |
| --- | --- | --- | --- |
| Cardmarket daily | `/api/cron/collect/cardmarket`, `30 5 * * *` | Existing public-file transport and ingest seam, Cambridge's identifying User-Agent. One Piece (18) only ([why](#cardmarket-measured)). Each run also writes the reviewed One Piece set crosswalk seed; an unchanged live row is left as it is. | Existing observations, unmapped to SKUs, with `source_set_key`, plus the set crosswalks |
| CardRush | `/api/cron/collect/cardrush`, `15 */2 * * *` | `createFetcher` with the identifying User-Agent, one bucket per host at 0.5 rps (burst 1), no retries, no proxy options. Hosts in turn by run time, so each of the six is read every 12 hours. Each run reads the host's robots.txt once, first, through the same bucket: if it disallows product pages (or the sitemap) to this collector or to every crawler, or cannot be read, the run stops as `SOURCE_UNAVAILABLE`, and a listed page it disallows is never requested; a host with no robots.txt (404, 410) sets no rule. Product URLs come from the host sitemap, never-read pages first and then the oldest reading; a quarantined reading counts as read, so sealed products and supplies do not starve the singles. 60 s of the budget is kept for writes, so a run reads about 103 pages ([rhythm](#cardrush-rhythm)). | `sell`, JPY, `printing`. Language comes from the title (default `ja`), finish from parallel markers. Condition is recorded only when the page states a grade. No structured price means quarantine: there is no first-yen fallback. Product and set crosswalks under `cardrush-title/1`, exact only for One Piece plain base rarities; the other five hosts' rows are unmapped. |
| TCGplayer | `/api/cron/collect/tcgplayer`, `45 * * * *` | One bucket for every TCGplayer host at 0.1 rps (burst 1): `www.tcgplayer.com`'s robots.txt asks `Crawl-Delay: 10`, and neither API host serves a robots.txt (404, 2026-10-28). The fetcher ignores any caller rate, refuses a proxy and never retries. The pages are client-rendered, so the collector reads the data the public set price-guide page itself loads, one request per set ([intake record](../../methodology/source-intake.md#intake-record--tcgplayer-us-2026-10-28)); it never reads seller listings, which robots.txt disallows. It does not re-read robots.txt at run time: the rate is fixed in code. Lines collected: One Piece (68) and Pokemon Japan (85), whose ids and row labels were read; Pokemon (3) is off until a probe confirms its id and row label, and Magic and Yu-Gi-Oh are off. A set is not begun with under 30 s left, so a run reads about 20 sets. A set whose read or write fails is recorded as read, by an empty batch whose quarantine names the failure, so stalest-first moves on. | `market` (Market Price) per condition × printing, USD. The data has no Listed Median, so none is collected; `lowPrice` and `sales` are not collected. Crosswalks under `tcgplayer-number/1`. |

A host that refuses the identified collector or cannot serve it ends the run
as `SOURCE_UNAVAILABLE`, with no further request in that run; each collector
names the statuses and challenge signs it treats so (`refusal` in the CardRush
module, `REFUSAL_STATUSES` and the redirect and non-JSON checks in the
TCGplayer one, the public-file transport's errors for Cardmarket). Nothing is
retried or routed around; the next scheduled run is the retry.

<a id="cardrush-rhythm"></a>**CardRush's rhythm at these budgets.** A run has 210 s to read (the 270 s
budget less the 60 s write reserve) at one request every 2 s, and robots.txt
and the sitemap come out of the same bucket, so it reads about 103 product
pages. Twelve runs a day over six hosts give each host two, so about 206
pages per host a day. A full pass of a host takes about 24 days on Dragon
Ball (4,889 products in the 2026-05 probe), about two months on One Piece
(12,549 in that probe and 14,887 product URLs in its 2026-10-28 sitemap: 61
to 72 days) and Digimon (13,520), about six months on Battle Spirits and
Vanguard (35,485 and 40,642) and nearly a year on Pokémon (70,507). A
derivation takes inputs at most 7 days old, so on a given day at most about
1,450 products per host can be CardRush inputs: roughly one One Piece product
in ten. Reading singles first, or giving the One Piece host more of the
twelve slots, would raise that at the same 0.5 rps per host; either is Yu's
call.

**One run at a time (migration 0143).** Two overlapping runs, from a duplicate
cron delivery or a manual authenticated call during a scheduled run, would
double the rate the collector keeps to (0.5 rps per CardRush host, an agent's
call; TCGplayer's robots.txt `Crawl-Delay: 10`). No rate is recorded as agreed
with either source. Each run takes a lease in
`price_collector_leases` before any request or write and deletes its own row at
the end: `cardrush:<host>` per CardRush host, one `tcgplayer` lease for all its
hosts (they share one bucket), one `cardmarket`. A held lease answers
`200 {ran: false, reason: "run-in-progress"}`. A lease expires 330 s after it
is taken, past the 300 s a function may run, so a run the platform stops
cannot block the next for longer than that, and an expired lease never belongs
to a live run. A store without the table answers 503: no run starts unleased
(`apps/storefront/src/lib/datafeed/collector-lease.ts`).

Legacy constants (`CARDRUSH_ACQUISITION_ENABLED`,
`TCGPLAYER_ACQUISITION_ENABLED`, `CARDMARKET_LEGACY_OAUTH_ENABLED`) stay
`false`. `audit:redistribution` keeps pinning the legacy paths and knows the
new collectors as the only permitted acquisition paths.

**Health.** Every source with a collector (`batchCollected` in
`collection-flags.ts`) is judged by its newest `member_price_batches` row, not
by the legacy `ingest_run`: `/api/v1/sources/[id]` reports it, and
`audit:tributaries` check 9 fails past twice the budget. The page collectors
declare `page_collector` (6 h) and Cardmarket `daily_file` (26 h).

<a id="cardmarket-measured"></a>

### Cardmarket daily, measured 2026-10-28

**Files.** HEAD requests to `downloads.s3.cardmarket.com` at 14:54 UTC with the
transport's own User-Agent, then one GET of each One Piece file the brief
named (price guide and singles). Bytes from `Content-Length`:

| Game (id) | `price_guide` | `products_singles` | `products_nonsingles` | Together |
| --- | ---: | ---: | ---: | ---: |
| Magic (1) | 26,364,654 | 20,636,248 | 966,291 | 47,967,193 |
| Yu-Gi-Oh! (3) | 17,544,476 | 14,762,241 | 447,281 | 32,753,998 |
| Pokémon (6) | 15,747,310 | 13,758,750 | 955,044 | 30,461,104 |
| One Piece (18) | 2,771,604 | 2,252,368 | 155,589 | 5,179,561 |

Every price guide was last modified between 01:45:22 and 01:45:38 UTC that
day, every catalogue between 12:49:46 and 12:49:52 UTC. The One Piece guide
says `createdAt 2026-10-28T02:45:29+0100` and holds 13,450 rows; its singles
catalogue says `createdAt 2026-10-28T13:49:48+0100`, sha256 `0e93ecbe…e9276`,
and holds 12,651 products in 150 expansions. A 05:30 UTC run reads that
morning's guide.

**Parse**, the real parser on Node 22, locally. One Piece (guide and singles):
73,343 observations in 0.1 s, about 42 MB of heap at peak. A Magic-sized input
(the One Piece rows repeated to 28 MB and 23 MB): 733,430 observations in
1.3 s, about 300 MB of heap at peak and 370 MB once the writer's keys exist,
830 MB peak RSS; it also completed under a 512 MB old-space limit. Real Magic
files may hold more foil prices per row than One Piece, so more observations.

**Write**, the real writer on local PostgreSQL 16. The One Piece batch (73,343
rows) took 4.0 s in 147 chunks of 500, 27 ms a chunk with no network, and
stored 817 bytes a row with its indexes: about 57 MB a day.

**Assumption.** The storefront's functions run with Vercel's standard 2 GB of
memory. The route asks for `maxDuration = 300`, as no other storefront route
asks for more and a value over the plan's limit can fail the whole deploy, so
the run's budget is 270 s. The plan, region and production database latency
were not checked.

**Decision.**

- *Memory:* every game fits a 2 GB function, so streaming is not needed. It
  would not shorten the write either, and the write is the long part.
- *Time:* in production each 500-row chunk adds a round trip and about 0.5 MB
  of upload. At 100 to 200 ms a chunk, One Piece takes 15 to 30 s, Pokémon and
  Yu-Gi-Oh! (about 5.7 and 6.3 times One Piece's guide) about 1.5 to 3 minutes
  each, and Magic (about 9.5 times, more with foil prices) 3 to 5 minutes or
  more. In a 270 s run, 18 fits, and 18 with one of 6 or 3 should; 18, 6 and 3
  together fit only at the low estimate, and Magic does not fit.
- *Rows:* the observation key includes the guide's `createdAt`, so each daily
  file is a full new set of rows, append-only by design, in the storefront's
  production database. Estimated growth a day: One Piece 57 MB (about 21 GB
  a year), Pokémon 320 MB, Yu-Gi-Oh! 360 MB, Magic 540 MB or more.
- *Scheduled:* One Piece only (`CARDMARKET_COLLECT_GAMES` in
  `apps/storefront/src/lib/datafeed/collection-flags.ts`, which the collector
  imports). It is the game Cambridge has set crosswalks for, so its rows can
  feed derived data. Pokémon and Yu-Gi-Oh! would each add about six times its
  rows a day with no crosswalk to use them yet, and Magic does not fit beside
  them. Adding a game is a one-line change and Yu's call, best made with a
  reviewed set seed for that game.

**The run.** `requireCronAuth`, then `DATA_COLLECT_CARDMARKET` must be exactly
`on`, or the route answers `200 {ok: true, ran: false, reason: "disabled"}`
before loading the collector. `collectCardmarketMemberPrices` refuses unless
passed `CARDMARKET_EVIDENCE_VERSION`, then takes the `cardmarket` lease. Each
game is one call of `ingestMemberPriceSource`: release check, the three files,
parse, the writer. Every query in a write checks the 270 s budget first, so a
run that runs out rolls its batch back whole. A host that refuses or fails to
deliver ends the run as `SOURCE_UNAVAILABLE`, with no request for the next
game. Nothing writes the release row. The summary returns 200 when every game
and the set seed completed and 503 otherwise.

**Set crosswalks.** A catalogue row holds `idProduct`, `name`, `idCategory`,
`categoryName`, `idExpansion`, `idMetacard` and `dateAdded`: no expansion name
or code, no language and no number field. The collector number appears only
inside the name, as Cardmarket prints it (`Roronoa Zoro (OP01-001)`), and a
Cambridge set code is that prefix. 55 of the 150 One Piece expansions have
every numbered single on one prefix, DON!! cards aside, and map to that set
(`cardmarket-expansions/2026-10-28.1`, seeded from
`apps/storefront/src/lib/datafeed/cardmarket-expansions.ts`; each row's evidence
gives the counts and the file's `createdAt` and sha256). 91 mix prefixes
(reprints, promos, decks) and 4 hold a single with no number, so they stay
unmapped. One set's cards span several expansions: OP09's are in two of about
160 products, added three months apart, and one of 75. The file does not say
which edition each is, and only the 75 maps, because the other two also hold
reprints from earlier sets. `scripts/review-cardmarket-expansions.ts` repeats
the review from a local copy of the file.

**Products are not mapped to SKUs.** The same name and metacard recur within
one expansion (in expansion 5887, 24 of 128 names have two or more products)
and across expansions, with no variant or language marker, so the files
cannot tell printings apart. Observations stay `unmapped`, and
`scripts/ingest-member-prices.ts` keeps `crosswalk:none`.

**For §3.** An observation stores its source's own set key (`source_set_key`,
added in 0139): Cardmarket's `idExpansion` from the catalogue row it already
joins, the set code a CardRush title prints, TCGplayer's set ID. That is the
key `price_source_set_crosswalks` is written under, so a Cardmarket row reaches
its reviewed set and can be an index constituent. The key is evidence, not a
mapping, and not part of the observation key, so re-reading an artifact adds
no row. Rows stored before it stay NULL.

## 3. Derived market data (migration 0141, method `ctcg.market-derived/v1`)

The writer is `apps/storefront/src/lib/market-derived/`: `method.ts` holds the
selection and arithmetic as pure functions, `derive.ts` reads and writes, and
`provisioning.ts` tells a missing migration from a fault for the job and the
readers. `/api/cron/derive/market` (`0 7 * * *`, after the Cardmarket run)
runs it only while `DATA_DERIVE_MARKET` is exactly `on`, for today's UTC date.

**Inputs** come only from sources whose release row is unrevoked, has
`derivation` set, and whose `derivation_evidence_version` and
`derivation_evidence_url` both match the code. Only accepted observations are
used, each with its source time on the derivation date or in the 7 days
before it, and each retrieved on or after 2026-10-28T00:00:00Z
(`DERIVATION_PERMITTED_FROM`). That last rule holds for every source,
Cardmarket included: its 2026-09-07 grant covered member display, API and
download, not derivation, so the 2026-09-08 batch is never an input.

Every input is converted to GBP with ECB reference rates published on the
derivation date or up to 7 days before it (ECB publishes on business days
only). ECB publishes those rates against the euro, so each GBP cross is
computed from ECB's EUR-based quotes, read as decimal text, with exact
decimal arithmetic (`crossRate` in `packages/data-spec/src/market-derived.ts`,
half-up to 12 decimal places). `apps/storefront/src/lib/fx/rates.ts` fetches
the quotes, but its float crosses are for display and never enter a
derivation. Each cross is recorded with its source and date, and never taken
from fallback: quotes from anywhere but ECB refuse the run.

**Headline metric per source:** Cardmarket `trend` (or `trend-foil` for a foil
finish), CardRush `sell` for the listing that states no grade, TCGplayer
`market` for Near Mint as its collector records it (`near-mint`,
`TCGPLAYER_HEADLINE_CONDITION` in
`packages/data-ingest/src/tcgplayer/member-prices.ts`, which the method
imports so the two cannot drift). A value at any other condition is counted in
the run's report and never averaged in. The method notes state that asks,
aggregates and recent-sale values differ in meaning.

**Placement.** A product's SKU comes only from its exact live product
crosswalk. Its set is that crosswalk's set code or, without one, the set its
`source_set_key` maps to in the live `price_source_set_crosswalks` row on
(source, game, source_set_key). A product whose two mappings name different
sets is left out of the run (`setConflict`), never guessed. A product placed
through its set key alone (`setKeyOnly`) is an index constituent and nothing
else: references and premiums still need the exact product crosswalk.

| Output | Rule | Guard |
| --- | --- | --- |
| `market_reference_prices` (sku, as_of, method_version) | Mean of each source's GBP value for the SKU, rounded to 3 significant figures. At least two sources must be ones whose raw values Cambridge does not export (today CardRush and TCGplayer); Cardmarket may contribute on top. Carries a `confidence` label of `high` (≥3 sources, max/min ≤ 1.25), `medium` (≥2, ≤ 1.5) or `low` (otherwise). Lists `sources` by name only. | DB CHECKs `source_count >= 2` and `cardinality(array_remove(sources, 'cardmarket')) >= 2`. No numeric dispersion and no per-source values. |
| `market_indices` (index_key, as_of, method_version) | Chain-linked per game × set × market and per game × market: I_t = I_{t-1} × Σp_t / Σp_{t-1} over source products placed in a set and valued on both days, base 100 on the first day; the earlier day is valued again at its own run's batch ceiling and FX record. A series (index key and method version) never restarts at 100: after a gap it chains from its latest published level. | CHECK `constituents >= 10`; unique index `market_indices_one_base`, one base row per series |
| `market_premiums` (game, set, market pair, as_of) | Median, p25 and p75 of the ratio of one market's GBP value to the other's, over card identities exactly mapped in both: the SKU without its language segment (variant kept) where the game's oracle policy shares numbering across languages, otherwise the whole SKU. One row per market pair, base the pair's first source in source order. Each side records its language basis (`market_languages`, `base_languages`; `*` for a product-level value with no language). | CHECK `sku_count >= 10`; language bases canonical |

**Why Cardmarket never counts toward a reference's two sources.** Cardmarket's
raw trend is exported free (member API and downloads). If a reference were the
mean of Cardmarket and one CardRush or TCGplayer value, anyone could recover
that display-only value as 2 × reference − Cardmarket, up to rounding. So a
reference needs at least two sources whose raw values Cambridge does not
export. Exportability lives in the release rows (`member_api`,
`member_download`); `referenceSourcesAllowed` in
`packages/data-spec/src/market-derived.ts` takes the exportable set the job
reads from them, and 0141's CHECK pins today's set, since 0139 keeps CardRush
and TCGplayer unexportable. The readers apply the same rule again on every
read (§5).

**Quartiles from ten identities** (an agent's call, 2026-10-28, open to Yu).
With n ≡ 1 (mod 4) identities, p25 and p75 are each exactly one card's ratio,
as the median is for every odd n. All three are still published from 10
identities: a quartile names no card and is rounded to 3 significant figures,
so turning it back into a provider's value needs the card's identity, which
no row carries. Publishing p25 and p75 only from 20 would not end
single-card quartiles (21, 25, … are 1 mod 4 too, and the median stays); it
would only withhold the spread of smaller sets. The reason is on
`premiumQuantiles`, and `DERIVED_MARKET_CONTRACT.premium` discloses it.

**Coverage, stated plainly.** References exist only where CardRush and
TCGplayer both map the same printing exactly, and a SKU includes its language.
With today's crosswalks that is rare: CardRush maps Japanese One Piece base
printings (English only where a title says 英語版), TCGplayer maps English One
Piece, and TCGplayer's Pokemon Japan rows stay unmapped (slash numbers name no
set). Premiums can compare CardRush's Japanese and TCGplayer's English One
Piece printings, since One Piece shares numbering across languages. Indices
carry most of the value early, Cardmarket's included, through set keys.

Trends (7, 30 and 90 day change) are computed on read from reference and
index history (`apps/storefront/src/lib/data-api/trends.ts`).

**The run.** One transaction per derivation date, idempotent per (date,
method version): a repeat answers `200 {ran: false, reason:
"already-derived"}`, and a date before the latest run is refused
(`out-of-order`) so series only chain forward. The job takes a transaction
advisory lock before it reads, so runs, chaining and the idempotency check see
each other's committed state and runs commit in id order. It reads every input
in one statement (one snapshot, under the committed batch ceiling) and writes
every row in the same transaction, so a refusal writes nothing and an error
rolls the whole run back. The pool's per-connection bounds (packages/db:
`statement_timeout` 30 s, `idle_in_transaction_session_timeout` 15 s) are
sized for requests, so the job raises them with `SET LOCAL` to 240 s and 60 s
for its own transaction only, inside the route's 300 s.

The result names each source left out and why: before any read, from its
release row, `no-release-row`, `revoked`, `derivation-off` or
`evidence-mismatch`; and for an eligible source that contributed nothing,
`no-fresh-observations`, `no-headline-condition`, `no-mapped-headline` or
`no-valued-headline`. It counts what was skipped without naming a product or
value (`notHeadline`, `unmapped`, `ambiguousMapping`, `setConflict`,
`setKeyOnly`, `noRate`, `referenceExportedSources`, `indexTooFewConstituents`,
`premiumTooFewSkus` and the rest of `DerivationSkips` in `method.ts`). It
answers 503 with `not-provisioned` (0137, 0139–0141 missing), `fx-unavailable`,
`no-inputs` or `out-of-order`, never an empty success.

Derived tables are append-only and carry `run_id`; runs are recorded in
`market_derivation_runs` with their batch ceiling, input evidence and FX
record. A read serves a row only while every source in it still has
`derivation` set and holds the code's evidence, so revoking a source takes
effect on the next read. Nothing in the job publishes: the reads are behind
`DATA_API_READS` (§5).

<a id="plans"></a>

## 4. Plans, keys and metering (migration 0142)

Plans are defined in code (`apps/storefront/src/lib/data-api/plans.ts`,
catalogue `data-api-plans/2026-10-28.1`) and versioned. **The prices below are
proposals; Yu sets the final ones.**

| | Free | Pro | Business |
| --- | --- | --- | --- |
| Proposed price (GBP/month, ex VAT) | £0 | £12 | £60 |
| Requests / minute per key | 30 | 120 | 600 |
| Requests / month per account | 100,000 | 1,000,000 | 10,000,000 |
| Reference and index history | 365 days | full | full |
| Daily derived export (NDJSON) | yes | yes | yes |
| Cross-market premiums | yes | yes | yes |
| Active keys | 5 | 10 | 25 |
| Use | own use, including pricing your own stock | internal business use, apps | commercial redisplay with attribution |

The free floor is meant to be enough for a collector or a small shop
(Yu, 2026-07-23, for RewardsPro). The paid line is scale and redisplay. An
account's entitlement is the plan of its test-mode subscription in good
standing (Stripe status `active` or `trialing`; the higher plan if it holds
two), otherwise `free`. A `past_due` subscription is free until Stripe reports
it paid.

**0142 tables:**

- `data_api_customers`: user_id primary key, stripe_customer_id unique,
  `environment` CHECK `= 'test'`, created_at. One Stripe customer per
  account, reused for every subscription it holds.
- `data_api_subscriptions`:
  - user_id, plan_id (`pro` or `business`), status;
  - stripe_customer_id, which with user_id must be that account's
    `data_api_customers` row; stripe subscription ID, unique;
  - current_period_end, cancel_at_period_end;
  - `environment` CHECK `= 'test'`;
  - timestamps.

  An account holds many subscriptions over time, all under its one
  customer. Account erasure cascades through the customer to its
  subscriptions and waits until Stripe reports each one ended.
- `data_api_stripe_events`: event id primary key, for idempotency, with what
  the webhook did (`applied`, or `ignored` and a short code saying why). No
  payloads.
- `data_api_usage_months`: user_id, month, request_count. Aggregate only.
- `data_api_rate_buckets`: key_id (cascading from `member_data_keys`),
  bucket_minute, request_count CHECK 1 to 100,001, with a cleanup index on
  the minute. Paid counts live apart from `member_data_rate_buckets`, which
  0142 leaves unchanged: the free member-prices route saturates its rows at
  `LEAST(count + 1, 31)`, so a shared row would let one free read lower a
  paid key's count.

**Keys:** Members keep the same `ctcg_member_` keys and the `price-read`
scope. `resolveDataApiBearer` (`lib/data-api/bearer.ts`) returns
`{ userId, entitlement }`, consumes the plan's per-minute bucket in
`data_api_rate_buckets`, increments the month's count, and answers 429 with
the limit and reset time when either limit is reached. While `DATA_API_READS`
is off it is never called, so no key is looked up and nothing is counted.

## 5. Data API routes

| Route | Returns |
| --- | --- |
| `GET /api/v1/market/reference?sku=…` or `?game=&set=` | Latest reference prices, paginated with signed cursors |
| `GET /api/v1/market/reference/history?sku=&from=&to=` | Reference history, clipped to the plan's history window |
| `GET /api/v1/market/indices?game=&set=&market=&from=&to=` | Index levels plus computed 7/30/90-day changes |
| `GET /api/v1/market/premiums?game=&set=` | Cross-market premium aggregates |
| `GET /api/v1/market/export?date=` | That day's derived rows as NDJSON |
| `GET /api/v1/account/usage` | Plan, limits and this month's count |
| `GET /api/v1/plans` (no key) | The plan catalogue, with `on_sale: false` while no member can buy and `sale_status` `closed` or `test-mode-operators-only` |

**Discovery waits for publication.** The [agent layer](agent-layer.md)
registers an operation only when its implementation, authorization, tests and
documentation are ready together, and the terms, public copy and provisioned
tables arrive with publication (§7, §9). So there are two switches, read on
every request:

- `DATA_API_READS` (exactly `on`; default off) publishes `/api/v1/market/*`
  and `/api/v1/account/usage`. While it is off they answer 404
  `NOT_PUBLISHED` before authentication, so no key is looked up and nothing
  is counted, and `apps/storefront/src/lib/data-api/openapi.ts` registers
  neither those operations nor the derived-row schemas.
- `DATA_API_PLANS_PUBLISHED` (exactly `on`; default off) publishes
  `/api/v1/plans`, which answers 404 `NOT_PUBLISHED` until then and is
  registered in OpenAPI only under it.

Deploy-verify probes what the manifest lists. The manifest entries (auth
`member-key`, expecting 401; `/api/v1/plans` public) are added when the reads
and plans are published.

As built (2026-10-28), once `DATA_API_READS` is on:

- Every read takes `Authorization: Bearer ctcg_member_…` and returns the
  existing envelope; an unauthenticated call answers 401. Cookies never
  substitute for a key.
- Before the tables a read needs exist (0139's derivation columns, 0141, or
  0142 for the key's meter), it answers 503 `NOT_PROVISIONED`, never an empty
  result. Only a missing table or a missing 0139 derivation column counts as
  not provisioned; any other undefined column is a defect and answers 503
  `SOURCE_UNAVAILABLE` (`isNotProvisioned` in `lib/market-derived/provisioning.ts`).
- The plan's history window bounds every read, a latest value and the export
  included. A single `date` before it answers 403 `INSUFFICIENT_TIER`.
- `indices` without `set` is the per-game index. A change compares with the
  latest level on or before 7, 30 or 90 days earlier, at most 7 days before
  that, inside the window; otherwise it is null.
- Every statement re-reads the release rows: a row is served only while every
  source it names is unrevoked, has derivation set and holds the code's
  derivation evidence (version and URL), and the row's own run recorded that
  same evidence. A reference is served only while at least two of its sources
  have no `member_api` or `member_download` release; a revoked row's export
  flags still count, since those values went out.
- Cursors hold the highest run id read on the first page and expire after 24
  hours. That is a closed snapshot because runs commit in id order under the
  derivation job's advisory lock (§3).
- `_meta` carries `data_rights` (`DATA_API_RIGHTS` in `lib/data-api/http.ts`:
  "Cambridge-derived market data (ctcg.market-derived/v1). Not CC0 and not
  licensed for AI training. Offered under Cambridge data-API terms, which are
  pending."), the method version (`derived_market_contract`) and the plan. No
  route returns a provider's own value, a per-source value or breakdown, or a
  numeric spread.

## 6. Billing, test mode only

PRISM is the template. The data-API stack is a separate sibling:

- `apps/storefront/src/lib/data-api/billing/config.server.ts` reads:
  - `DATA_API_STRIPE_SECRET_KEY`, which must start `rk_test_` or `sk_test_`
    (live keys are refused, and billing is then unavailable, never live);
  - `DATA_API_STRIPE_WEBHOOK_SECRET`;
  - `DATA_API_STRIPE_PRICE_PRO` and `DATA_API_STRIPE_PRICE_BUSINESS`.

  `DATA_API_CHECKOUT_INTAKE` (`closed` by default, or `test`) is read by
  `lib/data-api/posture.ts`.
- `apps/storefront/src/lib/release/commercial-retirement.ts` keeps
  `NEW_PAID_COMMERCE_RETIRED = true` and holds a separate
  `DATA_API_PAID_PLANS` record (Yu, 2026-10-28, test-only).
  `lib/release/data-api-admission.test.ts` shows that with it present, and
  every data-API and PRISM switch on, marketplace, lot, auction, membership,
  retail and PRISM checkout still answer 410 and B2B checkout still stops at
  `purchases_paused`.
- `POST /api/data-api/checkout` requires a session and same-origin. It
  returns 410 while intake is closed, after validating the request and the
  session (reading the session reads its database row) and before any billing
  configuration, billing table or Stripe call. With intake `test` it admits
  operators only, accounts whose `users.role` is `admin` testing the round
  trip, and gives every other account the same 410 at the same point. Test mode charges nothing, so
  on production a member who paid with a Stripe test card would otherwise
  hold a paid plan's entitlement for free. For an operator it opens a
  subscription Checkout with `metadata.type = 'data_api_subscription'`.
- `/api/v1/plans` therefore says `on_sale: false` in both states: no member
  can buy while intake is closed or test-mode and operators only, and there is
  no live intake. `sale_status` says which: `closed` or
  `test-mode-operators-only` (`dataApiSaleStatus` in `posture.ts`).
- One subscription at a time is a check, not a lock. Checkout refuses an
  account that already holds a subscription Stripe may still bill, but
  there is no attempts table yet (PRISM has one), so two Checkouts opened
  for different plans before either completes can both be paid. The account
  then holds two subscriptions. `lib/data-api/entitlements.ts` serves the
  stronger plan, logs the anomaly without naming the account, and
  `DUPLICATE_ENTITLING_SUBSCRIPTIONS_SQL` finds it for an operator to cancel
  one. A repeat of the same plan inside one ten-minute window reuses its session
  through Stripe's idempotency.
- `POST /api/data-api/portal` opens the billing portal for an account that has
  a data-API customer, whatever the intake, so cancelling never depends on it.
  It passes no `configuration`, so it uses the Stripe test account's default
  portal configuration. That configuration must offer only the two data-API
  prices (`DATA_API_STRIPE_PRICE_PRO` and `DATA_API_STRIPE_PRICE_BUSINESS`) and
  no quantity changes. A switch to any other price is a price no plan answers:
  the webhook then keeps the row's old plan while Stripe bills the new one.
- `POST /api/webhooks/stripe/data-api`:
  - verifies signatures and refuses `livemode` and connected-account events;
  - handles checkout completion, subscription created, updated and deleted,
    and failed invoices;
  - writes `data_api_subscriptions` idempotently;
  - lets a subscription whose price no plan answers (a retired one, say)
    move its row to a status that does not entitle, keeping the row's plan,
    so a cancellation is never lost. From such a price it never creates a
    row, grants a plan or changes one, and it logs every such event for a
    person to look at.
- `checkout-session-kind.ts` knows `data_api_subscription`, so the retail
  reconcile cron and retail fulfilment ignore those sessions.
- `apps/storefront/scripts/data-api-stripe-setup.ts` creates the test products
  and prices by lookup key, idempotently, and refuses live keys. It never
  reuses an archived product or price: it creates a new one (the next product
  id in the plan's line, or a price that takes over the lookup key) and names
  what it did not reuse. It has not been run.

[`apps/storefront/docs/commercial-retirement.md`](../../../apps/storefront/docs/commercial-retirement.md)
records the same admission from the retirement's side.

## 7. Public copy

The "no paid data tier" copy, the four DATA_RIGHTS lines, the member-pricing
methodology and `/account/data` stay true while nothing is on sale, and they
change only when plans go on sale with Yu's word. The draft wording for that
day lives in this section:

> Our own catalogue data, specs and pages are CC0: use them freely, including
> for AI training. Card art and card text belong to their publishers; we host
> official images with credit and take them down on request. Third-party
> prices name their source, and we don't copy anyone's whole database: paid
> plans sell market data we derive, never a source's own prices. We don't
> scrape sites that forbid it, and we don't collect personal data about people
> on other platforms.

## 8. Readiness

Ready to merge when each of these holds. Storefront typecheck and tests
pass. The data-ingest and data-spec tests, `audit:redistribution` and
`audit:tributaries` pass. The Postgres integration tests pass against a
throwaway database with the migrations each applies (see
[Migrations 0139–0143](#migrations-01390143); the earlier chain is not
replayed). With every switch off, the free feed returns exactly what it
returned before, and every new route either answers `ran: false`, 404
`NOT_PUBLISHED` or 410.

**CI gates for Yu to choose, not added.** CI runs none of those package tests,
audits or new integration suites today: the storefront job runs typecheck,
the storefront unit tests, three earlier Postgres test files and the build,
and sets none of the `*_TEST_DATABASE_URL` variables the new suites need, so
they skip there. The final review ran them locally. Running them in CI would
add blocking gates, so under AGENTS.md principle 8 they are left to a
separate PR for Yu's choice.

Ready to activate when Yu has done §9 in order. The decision record keeps the
same list as [what still needs Yu's hand](../../decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md#what-still-needs-yus-hand).

**A guard for Yu to choose, not added.** `apps/storefront/src/lib/heartbeat.ts`
mirrors the `crons` block of `apps/storefront/vercel.json` by hand, and the
mirror had drifted (`prism-signals-beta-retention` was missing until the
integration review). A test pinning the mirror to `vercel.json` would stop
that. It would be a new blocking guard, so under AGENTS.md principle 8 the
choice is Yu's.

## 9. Activation, in order

Each step is Yu's; none was taken by this work.

1. **Read the emails against the code.** Answer the TCGplayer scope question
   (whether "Scrape TCGplayer pages" covers reading the data the public
   price-guide page loads; [intake record](../../methodology/source-intake.md#intake-record--tcgplayer-us-2026-10-28)).
   If an email names agreed rates, hours or fields, change the collector's
   constants to match before turning it on.
2. **Confirm the third DATA_RIGHTS line under whole-catalogue collection**,
   before `DATA_COLLECT_CARDRUSH` or `DATA_COLLECT_TCGPLAYER` is on. The
   CardRush collector reads every product in each host's sitemap, never-read
   pages first, and the TCGplayer collector every set of each collected line.
   Confirm that "Third-party prices name their source, and we don't copy
   anyone's whole database." still holds under that, or approve a rewording.
   The §7 draft keeps that clause as it stands, so it does not answer this on
   its own. Display-only release limits what Cambridge passes on, not what it
   copies, and these records do not settle what the line means.
3. **Confirm the Vercel plan's limits**: `maxDuration = 300` on the four new
   cron routes, function memory, and the cron schedules. Not checked here.
4. **Apply migrations 0139–0143** to the production storefront database, in
   order.
5. **Turn on the collectors one at a time**: `DATA_COLLECT_CARDMARKET`, then
   `DATA_COLLECT_CARDRUSH`, then `DATA_COLLECT_TCGPLAYER`. Each waits for
   something first:
   - `DATA_COLLECT_CARDMARKET` waits for a follow-up PR that bounds the free
     member feed's latest-per-key read
     (`apps/storefront/src/lib/prices/member-feed.ts`). Every free member-feed
     page, each cursor page included, ranks every eligible observation per key
     and counts the result, and each daily One Piece batch adds a full new set
     of about 73,000 rows, since the observation key includes the guide's
     `createdAt` (§2). Measured in the final review on local PostgreSQL 16 with
     the real query and 0139's index: about 13 s a request at 30 daily batches
     and 26 to 31 s at 60, sorting more than a gigabyte on disk each time,
     against the pool's 30 s `statement_timeout`. Past that, the free
     Cardmarket feed answers that member pricing storage is unavailable.
   - `DATA_COLLECT_CARDRUSH` waits for step 2.
   - `DATA_COLLECT_TCGPLAYER` waits for steps 1 and 2.

   After each, read its first run's summary and `/api/v1/sources/[id]`
   health. Watch storage: Cardmarket's One Piece files add about 57 MB a day.
6. **Turn on `DATA_DERIVE_MARKET`** after the collectors' first batches. A
   series starts at 100 on its first day with 10 constituents and chains from
   then on, and a date before the latest run can never be derived, so there is
   nothing to backfill. Read each run's `excludedSources` and `skipped`.
7. **Stripe test mode.** Set `DATA_API_STRIPE_SECRET_KEY` (a test key), run
   `scripts/data-api-stripe-setup.ts`, set `DATA_API_STRIPE_PRICE_PRO`,
   `DATA_API_STRIPE_PRICE_BUSINESS` and `DATA_API_STRIPE_WEBHOOK_SECRET` for
   `/api/webhooks/stripe/data-api`. Create a data-API portal configuration in
   the test account (only the two prices, no quantity changes, cancellation at
   period end) and set `DATA_API_STRIPE_PORTAL_CONFIGURATION` to its id
   (`bpc_…`), rather than narrowing the account's default configuration,
   which Platinum's test portal also uses. Three billing follow-ups from the
   final review need to be in the code before step 8:
   - the portal pins `DATA_API_STRIPE_PORTAL_CONFIGURATION` and checks it
     before opening a session, as PRISM's portal does, instead of passing no
     `configuration` (§6);
   - checkout checks each configured price on Stripe before using it: active,
     test mode, GBP, the plan's amount, monthly, licensed, and its product's
     plan (the configuration checks only the ids' format);
   - a written rule for a subscription whose price leaves the configuration.
     Today the webhook keeps the row's old plan but stops moving its period
     end, so the account reads as free once that stored date passes while
     Stripe still bills it, and step 9's price changes make that the normal
     path for step 8's subscriptions.
8. **Run the test round trip as an operator** with
   `DATA_API_CHECKOUT_INTAKE=test`: subscribe, see the entitlement, cancel,
   revoke a source's derivation and see its rows disappear. Seeing the
   entitlement through `/api/v1/account/usage` needs `DATA_API_READS`, which
   opens the reads to every member key, so either run the round trip where
   that is acceptable or read `data_api_subscriptions` directly.
9. **Publish together**: the final tier prices (`plans.ts`, a new catalogue
   version), the data-API terms text, the DATA_RIGHTS rewording (§7), the "no
   paid data tier" copy and "minute and monthly counts", then
   `DATA_API_READS` and `DATA_API_PLANS_PUBLISHED`, and the deploy-verify
   manifest entries.
10. **Live mode, later**: live keys, VAT treatment and Stripe Tax, and account
    admission for paying members. Each needs a code change as well as Yu's
    word: the configuration refuses live keys and events, and checkout admits
    operators only.
11. **Optional, Yu's call**: more Cardmarket games (each with a reviewed set
    seed, and Pokémon or Yu-Gi-Oh! add about 320 to 360 MB a day each), and a
    probe of TCGplayer's Pokemon line (3) before it is collected.
