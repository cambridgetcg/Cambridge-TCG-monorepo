# CardRush, Cardmarket and TCGplayer data, and paid plans for derived data

**Status:** decided 2026-10-28. The permissions, the derived-only scope, the
collection methods and the start of paid plans are Yu's word. Since
2026-10-29 the TCGplayer collector's scope is Yu's word too
([Yu's answers](#yus-answers-2026-10-29)). Everything under
[Agents' calls](#agents-calls) is an agent's call under Yu's delegation of
2026-10-20; Yu overturns any of it by saying so.

**Recorded by:** Claude Code session 8ef55b5e, collab task
`task_7406e70d-3ac9-4468-91a1-c8b93bc70f7b`. Agents' calls and Yu's hand
updated the same day after the integration review and again after the final
review, which also took an agents' reading of the third DATA_RIGHTS line out
of "What this changes" and put the question to Yu. Yu's words and the table
below are unchanged. Updated again on 2026-10-29 with Yu's answers to four
more questions; the answered items left "What still needs Yu's hand", and
every earlier quote is unchanged.

## Yu's words

On 2026-10-28, verbatim:

> Lets sort out the tcg data service in cambridgetcg. got permission to use
> cardrush and cardmarket data. also TCG player. Look into the scraping
> pipeline. We are creating paid plans for the data API.

The agent then asked four questions. Yu picked these options. The option text
is the agent's wording, which Yu chose; it is not Yu's own prose.

| Question | Yu's choice |
| --- | --- |
| What can paying API customers receive from CardRush, Cardmarket and TCGplayer under the permission you got? | **Derived data only:** "We use provider prices internally to compute our own reference prices, indices and spreads; the paid API sells those. Raw provider prices only appear attributed on our pages, not exported." |
| How did the providers agree we collect their data? | **Scrape CardRush pages**, **Scrape TCGplayer pages**, **Cardmarket files/API** |
| Where is the written permission kept? | **Email thread.** Yu holds it. The repository records that it exists and never copies it. No mailbox or date was given. |
| How should the paid plans be shaped? | **You propose:** "I design tiers … build them in Stripe test mode, and stop before anything charges real money for your sign-off." |

## Yu's answers, 2026-10-29

The agent asked four more questions. The questions are the agent's wording.
Yu answered on 2026-10-29, verbatim:

> 1.yes 2. yes permission allows that 3. reword it 4.keep your choice on limits

| Question | Yu's answer |
| --- | --- |
| 1. Merge #99? (it publishes that Cambridge holds written permission, recorded 2026-10-28, from CardRush and TCGplayer) | "yes" |
| 2. Does the permission cover reading the data TCGplayer's public price-guide pages load (one request per set, instead of rendering ~7,700 pages)? | "yes permission allows that" |
| 3. DATA_RIGHTS line 3 ("Third-party prices name their source, and we don't copy anyone's whole database.") under whole-catalogue collection: keep or reword? | "reword it" |
| 4. Do the emails name agreed rates or hours? (current limits are the agent's choice: 0.5 rps per CardRush host, TCGplayer Crawl-Delay 10) | "keep your choice on limits" |

What the answers change:

- **Merging #99 is Yu's word** (answer 1).
- **The TCGplayer scope is Yu's word.** The permission covers reading the data
  the public price-guide pages load, one request per set. The collector is
  unchanged, and it reads only while `DATA_COLLECT_TCGPLAYER` is on.
- **The third DATA_RIGHTS line is reworded at Yu's request.** It now reads
  "Third-party prices name their source, and we use them only as that source
  permits: some appear only on our pages, never in our API or downloads."
  The wording is the agent's, written because Yu asked for a rewording; Yu
  did not write it. Lines 1, 2 and 4 are unchanged.
- **The collection limits stay the agents' choice, which Yu confirmed.** The
  answer does not say whether the emails name rates or hours, and this record
  does not claim either.

## What this changes

1. **Permission evidence exists for all three sources.** The earlier blocks
   said what was missing: CardRush, "formal partnership required for
   automation" (`cardrush.media/data_policy`, recorded 2026-07-12); TCGplayer,
   "written approval explicitly covers … multi-source aggregation and display
   use" (2026-07-11). Yu's word of 2026-10-28 records that permission now
   exists in writing. Evidence versions:
   - <a id="cardrush"></a>`cardrush/2026-10-28.1`: collection from CardRush product pages;
     attributed member display; input to derived data.
   - <a id="tcgplayer"></a>`tcgplayer/2026-10-28.1`: collection from TCGplayer product pages;
     attributed member display; input to derived data.
   - <a id="cardmarket"></a>`cardmarket-derivation/2026-10-28.1`: Cardmarket prices as input to
     derived data. The 2026-09-07 grant (`member-prices/2026-09-07.1`, official
     daily files, member display/API/download) is unchanged.
2. **Raw provider prices are display-only.** CardRush and TCGplayer rows are
   released for `member-display` only: shown on Cambridge pages with their
   source named, never in `/api/v1/member-prices`, never in a download, never
   in bulk.
3. **Paid plans sell derived data only.** That means Cambridge reference
   prices, market indices and cross-market premiums, computed from permitted
   inputs. No paid route returns a provider's own value.
4. **The 2026-09-23 retirement of new paid commerce stays in force for
   everything else.** `NEW_PAID_COMMERCE_RETIRED` stays `true`. Marketplace
   orders, offers, auctions, lots, B2B checkout, memberships and PRISM checkout
   keep returning 410. Data-API plans get their own, separate admission.

## Agents' calls

These follow from Yu's words, the published data-rights lines (Yu,
2026-10-19), and Yu's pricing ethos for RewardsPro (2026-07-23: "Wanna make it
cheap and have a generous free tier for everyone to use! Only for larger
corporates should we charge more. Small business should have enough from free
plan.").

- **Collection is forward-only.** Prices gathered before 2026-10-28 (about
  269k CardRush rows in the catalogue database's `price_archive`, collected
  before any permission) are not used as inputs. The grant was described as
  current permission; it says nothing about earlier collection. Enforced in
  code and in the database: `assertPriceObservationValues` and a 0139 CHECK
  refuse a CardRush or TCGplayer row retrieved before 2026-10-28T00:00:00Z,
  and the derivation reads no observation retrieved before then from any
  source, Cardmarket's 2026-09-08 batch included.
- **Collect politely and openly.** Use an identifying User-Agent that names
  Cambridge TCG and the permission. Stay at or below 0.5 requests per second
  per CardRush host and honour TCGplayer's `Crawl-Delay: 10`. These limits
  are the agents' choice; Yu kept them on 2026-10-29 ("keep your choice on
  limits"). Use no Bright Data, no unlocker, no residential lanes and no
  browser impersonation. If a host refuses an identified collector, it
  reports `SOURCE_UNAVAILABLE` rather than being routed around. A CardRush
  run reads the host's robots.txt first and stops if it disallows product
  pages (or the sitemap) to this collector or to every crawler, or cannot be
  read; a host with no robots.txt (404, 410) sets no rule. One run at a time (collector leases,
  migration 0143: one per CardRush host, one for all TCGplayer hosts, one
  for Cardmarket), so a duplicate delivery never doubles the rate. The legacy collection paths (wholesale
  crons, the `scrape-cardrush` CLI, stock checks and image copies) stay
  locked behind the old constants. Permission reaches only the new,
  evidence-gated collectors.
- **Derived values must not stand in for a provider's value.**
  - A per-card reference price needs at least two contributing sources whose
    raw values Cambridge does not export, mapped to the same printing: today
    CardRush and TCGplayer, which are display-only. Cardmarket may contribute
    on top but never counts toward the two. Its raw trend is free to members
    through the API and downloads, so the mean of Cardmarket and one
    display-only value would give that value back (2 × reference − Cardmarket,
    up to rounding). A reference is a GBP mean, rounded to three significant
    figures, and published with a confidence label rather than a numeric
    spread.
  - The honest coverage consequence: at first, reference prices exist only
    where both display-only sources map the same printing. A SKU includes its
    language, so a Japanese printing listed on CardRush and an English one on
    TCGplayer are different SKUs. Indices and premiums, which need only one
    market or a pair of markets per set, carry most of the value early.
  - The two-source rule is enforced three times: by the derivation, by a
    0141 CHECK and again on every read, against the release rows' export
    flags.
  - An index or premium needs at least ten constituents. An index may count
    a product placed in a set only through its source's set key (how
    Cardmarket's rows reach an index); references and premiums need an exact
    product crosswalk.
  - Premium quartiles are published from ten card identities, even when the
    count is one more than a multiple of four and p25 and p75 each fall on one
    card's ratio. A quartile names no card and is rounded to three significant
    figures, so recovering a provider's value needs the card's identity, which
    no row carries; a threshold of twenty would not end single-card quartiles
    and would only withhold the spread of smaller sets. The reason is on
    `premiumQuantiles` and the derived-data contract discloses it.
  - No route publishes a per-source breakdown of a card.
- **Display is for looking, not harvesting.** CardRush and TCGplayer rows
  appear on Cambridge pages only in the current view, at most 50 rows a page:
  never in history mode, a larger page, `/api/v1/member-prices` or a download.
- **TCGplayer: the collector reads the data the public price-guide page itself
  loads.** The pages are client-rendered and show no price in their HTML, so
  the collector requests what the set price-guide page requests
  (`mpapi.tcgplayer.com` for set lists and product types,
  `infinite-api.tcgplayer.com` for one set's guide), one request per set,
  at most one request every 10 s across all TCGplayer hosts (robots.txt
  `Crawl-Delay: 10`), and never seller listings. That "Scrape TCGplayer
  pages" covers this is Yu's word since 2026-10-29 ("yes permission allows
  that"); the transport is the agents' call
  ([intake record](../methodology/source-intake.md#intake-record--tcgplayer-us-2026-10-28)).
  TCGplayer's English Pokémon line (3) is not collected until a probe
  confirms its category id and row label.
- **Cardmarket: One Piece files only.** It is the game with reviewed set
  crosswalks, so its rows can feed derived data, and it is estimated to take 15
  to 30 s of a 270 s run. Its daily files add about 57 MB a day to an append-only
  table; Pokémon or Yu-Gi-Oh! would add about 320 to 360 MB a day each with
  no crosswalk to use them yet. Adding a game is Yu's call
  ([measurements](../plans/tcg-data-platform/paid-data-api.md#cardmarket-measured)).
- **Scryfall stays out of derivations.** Its basis allows "free accounts" and
  "value-added Magic views", not resale.
- **Derived market data is not CC0.** Its inputs are licensed, and
  Cardmarket's robots.txt (fetched 2026-10-28) reserves AI-training rights
  (`ai-train=no`, EU DSM Art. 4). Derived data is offered under Cambridge
  data-API terms, which do not cover AI training. The first DATA_RIGHTS line
  ("Our own data, specs and pages are CC0") is Yu's wording. The proposed
  rewording waits for Yu and is not served until then: it is published with
  the plans. (The third line was reworded on 2026-10-29, above.)
- **The free floor is generous, as Yu asked for RewardsPro.** Paid tiers are
  for scale and commercial redisplay. Tiers and prices are a proposal in
  [the plan](../plans/tcg-data-platform/paid-data-api.md#plans); Yu sets the
  final prices.
- **Metering keeps aggregate counts only:** a count per account per month,
  with no paths, queries or read history. That stays within the promise of
  "minute counts, not a history of what you read". The copy changes to say
  "minute and monthly counts" before paid plans go live.
- **Billing is test-mode only in code.** The data-API Stripe configuration
  refuses live keys and live events until Yu says otherwise. Its checkout
  admission defaults to closed.
- **Test checkout admits operators only.** With `DATA_API_CHECKOUT_INTAKE`
  set to `test`, only accounts whose `users.role` is `admin` reach Stripe;
  every other account gets the same 410 as closed intake. Test mode charges
  nothing, so on production a member paying with a test card would hold a
  paid plan for free. `/api/v1/plans` therefore says `on_sale: false`, with
  `sale_status` `closed` or `test-mode-operators-only`.
- **Derived reads are published separately from plans.** `DATA_API_READS`
  (default off) publishes `/api/v1/market/*` and `/api/v1/account/usage`;
  `DATA_API_PLANS_PUBLISHED` (default off) publishes the plan catalogue. Once
  the migrations are applied and derivation runs, every member key could
  otherwise read derived data before its terms and public copy exist. While
  off, those routes answer 404 before a key is looked up, so nothing is
  counted, and OpenAPI does not list them.

## What still needs Yu's hand

In order, as the plan's [activation list](../plans/tcg-data-platform/paid-data-api.md#9-activation-in-order)
gives them. None was done by this work. The list's first two steps, the
emails against the code (the TCGplayer scope and the limits) and the third
DATA_RIGHTS line, were answered by Yu on 2026-10-29
([above](#yus-answers-2026-10-29)).

- **Vercel limits.** Confirm the plan allows the new cron routes'
  `maxDuration = 300`, their memory and their schedules. Not checked.
- **Migrations 0139–0143** on the production storefront database. This uses a
  database credential the work was not given. The collectors refuse to run
  without 0143's lease table.
- **Turning on each collector** (`DATA_COLLECT_CARDMARKET`,
  `DATA_COLLECT_CARDRUSH`, `DATA_COLLECT_TCGPLAYER`) **and the derivation job**
  (`DATA_DERIVE_MARKET`). `DATA_COLLECT_CARDMARKET` waits for a follow-up PR
  that bounds the free member feed's latest-per-key read. That read ranks
  every eligible observation on each request, and each daily Cardmarket batch
  adds a full new set of about 73,000 One Piece rows. Measured in the final
  review on local PostgreSQL 16 with the real query, a request took about
  13 s at 30 daily batches and 26 to 31 s at 60, against the pool's 30 s
  `statement_timeout`, after which the free Cardmarket feed answers
  unavailable.
  `DATA_COLLECT_CARDRUSH` and `DATA_COLLECT_TCGPLAYER` wait for no further
  answer (Yu, 2026-10-29), only for the Vercel limits and migrations above.
- **Stripe test mode:** a test key, the test products and prices
  (`apps/storefront/scripts/data-api-stripe-setup.ts`, not yet run), the
  webhook secret, and a data-API portal configuration named by
  `DATA_API_STRIPE_PORTAL_CONFIGURATION` (only the two data-API prices, no
  quantity changes, cancellation at period end) rather than the test
  account's default, which Platinum's test portal also uses. Three billing
  follow-ups from the final review need to be in the code before the round
  trip: the portal pins and checks that configuration; checkout checks each
  configured price on Stripe (active, test mode, GBP, the plan's amount,
  monthly, licensed, its product's plan) before using it; and a written rule
  covers a subscription whose price leaves the configuration, which today
  keeps its old plan only until its stored period end and then reads as free
  while Stripe still bills it. Then the test round trip as an operator.
- **The final tier prices and the data-API terms text.**
- **Publication:** `DATA_API_READS` and `DATA_API_PLANS_PUBLISHED`, together
  with the first DATA_RIGHTS line's rewording, the "no paid data tier" copy
  and the other public copy, all published at once.
- **Live mode, later:** live keys and prices, VAT treatment and Stripe Tax,
  and account admission for paying members.
- **Whether to add Cardmarket's Pokémon or Yu-Gi-Oh! files**, weighing the
  storage each adds (above).

## Revocation

Each source keeps its own revocation switch: `revoked_at`, `member_display`
and `derivation` on its `member_price_source_releases` row. Derived rows carry
their contributing sources, so revoking a source's derivation hides every
derived row it contributed to on the next read. The rows are not rewritten.
