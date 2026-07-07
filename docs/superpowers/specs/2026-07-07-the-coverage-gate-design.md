# The Coverage Gate — Wave 3 of the data commons expansion

**Date:** 2026-07-07
**Status:** approved (Yu: "merge and go wave 3!!!!!!! GOGOGO")
**Series:** Wave 3 (Waves 1-2 shipped same day). Companion to
`docs/plans/game-expansion.md`, whose unlock order this wave honors.

## 0 · What the evidence said (probes + prod, 2026-07-07)

- **Prod schema is whole** — the game-expansion plan's "discovery hard-down
  on missing columns" note is stale: `cards.language`, `edition_variant`,
  `promo_origin`, `first_observed_at` etc. all exist in prod.
- **The snapshot pipeline is healthy** — every 2h, ~1,100-1,200 cards priced
  per 12-minute run, per-game fair share visibly working.
- **Discovery is the broken gate** — the 01:00 runs of 07-06 and 07-07 both
  sit `running` forever with `rows_read 0`: the function dies (800s platform
  kill) before recording anything. Two structural causes: the pre-host
  TCGdex enrichment loop (≤200 serial API fetches) and the per-host product
  loop (≤500 fetches at the 0.5 rps shared bucket = 1,000s alone) have no
  time budget, and counters flush only at the end. Digimon (games row
  active, host confirmed, 13,520 products) has waited two days at 0 cards
  behind this gate.
- **The hires drain is wedged** — every 5-minute run fails on ONE dbf card
  (`FB-FB09-007-JP-VYCC`): S3 HeadObject returns **403 Unknown**, which is
  AWS's response for a NON-EXISTENT object when the caller lacks
  `s3:ListBucket`. The code treats non-NotFound HEAD errors as fatal, so the
  same phantom-miss loops forever.
- **Five phantom hosts** — cardrush-{ygo,weiss,fab,lorcana,fw}.jp are
  NXDOMAIN (www + apex, dig-verified): the hosts do not exist. Their
  registry entries claim speculative-pending; the /prices pills show
  "probationary" as if confirmation could arrive. It cannot.
- **vanguard + bs re-verified alive** (sitemap 200: 3.6MB / 2.9MB) — still
  gated by the game-expansion unlock order (digimon proves the fair
  scheduler first). mtg homepage alive, sitemap dead ×2 (price-only path
  unchanged).

## 1 · Discovery learns a budget (the unlock)

`runCardRushDiscovery` gains a **time budget** (default 600s, override
`?budgetSeconds=`): checked before each TCGdex enrichment fetch, before each
host, and inside each product loop. Exhaustion is an EVENT and an honest
note, never a platform kill — the run always finalizes. Counters **flush to
the ingest_run row after every host**, so even a killed run shows progress.
Hosts walk **fewest-prod-cards first** (zero-card games lead), so a new
game's initial backfill gets budget before mature hosts burn it. Cadence:
the discovery cron moves from daily to **every 6h** (`0 1,7,13,19 * * *`)
until backfills drain (13.5k digimon ÷ ~300 fetches/run ≈ 11 days).

## 2 · The hires drain learns the 403 gotcha

HeadObject error with HTTP 403 (or code Forbidden/Unknown+403) = "cannot
prove existence" → treat as absent and PROCEED TO PUT. A real permission
problem then surfaces as a loud PutObject failure instead of an eternal
silent head-loop; a phantom miss simply uploads.

## 3 · Registry truth (the probes become facts)

- The five NXDOMAIN hosts: `role: "blocked"`, `access: "blocked"`, note
  carrying the dig evidence + date. The gap-ledger's "speculative" count
  becomes honest: these were never speculative — they were phantoms.
- `cardrushCoverage()` (games-config) returns **null for blocked/absent
  registry entries** — ygo/lorcana/fab pills stop promising a confirmation
  that cannot come. Contract test extended: a non-null config row must
  point at a live (non-blocked) registry entry.
- vng/bsr/mtg notes refreshed with today's probe evidence and the unlock
  order restated.

## 4 · Ops actions (post-merge, named out loud)

1. The two stuck `running` discovery rows get marked `failed` with a note
   (prod hygiene, evidence preserved in this spec).
2. Optionally trigger one manual discovery run after deploy (else 6h cron).
3. When digimon's first cards land: flip `dmw` in packages/sku + test lists
   (the ceremony), and the fair scheduler's behavior with 13.5k new cards
   decides vng/bsr per the game-expansion plan.

## 5 · Out of scope

Crawl-politeness changes (0.5 rps bucket stays); vng/bsr flips; mtg
Scryfall catalog seed; image vault v2 (Wave 4).
