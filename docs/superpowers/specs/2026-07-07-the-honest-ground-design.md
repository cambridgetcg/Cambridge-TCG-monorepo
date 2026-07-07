# The Honest Ground — Wave 1 of the data commons expansion

**Date:** 2026-07-07
**Status:** approved (Yu: "1→2→3 順序全走", same day; commons purpose locked:
data fully open CC0, images internal-use)
**Series:** Wave 1 of the data-commons expansion (Wave 2 = the Atlas single
game registry; Wave 3 = cardrush coverage expansion; Wave 4 = image vault v2).

## 0 · Why this wave exists

Yu asked for "expand cardrush / SKU for all games / images + scraping on AWS."
Exploration (2026-07-07, four parallel read-only surveys) found the substrate
already largely exists — two live cardrush scrape pipelines, three S3 image
buckets with a 5-minute drain cron, a 21-code SKU registry with exhaustive
oracle policies — but standing on four dishonest or duplicated joints. The
house discipline is declared ≠ wired; before any expansion wave builds on
these joints, they get rewired to tell the truth. Fix the ground, then build.

## 1 · One truth for cardrush coverage (the drift)

**Found:** `apps/storefront/src/lib/prices/games-config.ts` hand-writes
`cardrush.confirmed` literals and its header *claims* they come "from the
data-ingest registry" — but nothing imports the registry. It has already
drifted: `CARDRUSH_SUBDOMAINS["cardrush-digimon.jp"].confirmed` flipped true
2026-07-05 (kingdom-087 probe); the storefront still shows digimon as
probationary.

**Design:** the config stops storing `confirmed` at all. Each row keeps only
its `subdomain` (or `cardrush: null`); the exported `PriceGuideGameConfig`
keeps its exact current shape — `confirmed` is **derived at module scope**
from `CARDRUSH_SUBDOMAINS` (already a storefront dependency —
`game-context.ts` imports `@cambridge-tcg/data-ingest` today):

```ts
import { CARDRUSH_SUBDOMAINS } from "@cambridge-tcg/data-ingest";
const cardrush = (subdomain: string) => ({
  subdomain,
  confirmed: CARDRUSH_SUBDOMAINS[subdomain]?.confirmed ?? false,
});
```

Consumers (`/prices` pills, `/prices/[game]` probationary chip, anticipated-set
placeholder) are untouched. Digimon's badge flips honest automatically. The
header comment becomes a true sentence.

**Contract test** (`games-config.test.ts`): every configured subdomain exists
in `CARDRUSH_SUBDOMAINS`; every config `confirmed` strictly equals the
registry value; the literal string `confirmed: true`/`confirmed: false` does
not appear inside the `PRICE_GUIDE_GAMES` cardrush rows (no re-hardcoding).

## 2 · The image hosts the storefront cannot see

**Found:** `apps/storefront/next.config.ts` whitelists only
`jp-op-photos.s3.us-east-1.amazonaws.com` and `www.cardrush-op.jp`. The other
two live buckets (`jp-pk-photos`, `jp-db-photos`) and raw hosts
(`www.cardrush-pokemon.jp`, `www.cardrush-db.jp`) — where every Pokémon and
Dragon Ball image actually lives (`cardrush-hires-upload.ts:11-14, 53-57`) —
are absent, so `next/image` fails for two of three games.

**Design:** add the four missing `remotePatterns`. No new mechanism; the
whitelist simply matches where the images already are.

## 3 · The dead write (price_history)

**Found:** migration `0011_drop_price_history.sql` dropped `price_history`;
the schema records the drop (`schema.ts:251-254`); `price_archive` is the
canonical history. Yet Pipeline A (`tools/scrape-cardrush.ts:349`) still
INSERTs into `price_history` every run.

**Design:** evidence first — enumerate readers of `price_history` across the
monorepo. If zero readers and the migration is applied (verify against prod
information_schema if reachable; otherwise the migration file + schema comment
are the record), delete the write and its helper. If a reader exists, the
finding graduates to its own decision instead of a silent fix.

## 4 · One pipeline (retire the duplicate)

**Found:** two parallel cardrush price pipelines write the same tables:
- **A** — GitHub Actions cron 17 */6 (tools/scrape-cardrush.ts, cheerio,
  full-set walk, prices-only mode, stale-card cleanup)
- **B** — Vercel cron every 2h (`/api/cron/ingest/cardrush` →
  `runDailySnapshotV2`, data-ingest protocol, stalest-first) + daily discovery
  cron (sitemap walk → new cards) + 5-min hires image drain

**Design:** B is canonical (protocol-aligned, provenance-carrying,
chunk-fair). Retirement criterion, checked with evidence during
implementation: B + discovery provably cover A's price path (same tables:
`cards` price columns + `price_archive`; discovery covers new-card arrival).
A's stale-card cleanup is the one capability B lacks — port it into the
discovery cron (which already walks the full sitemap and can diff removals)
or keep it as a documented manual tool run. Then:
- the GHA schedule (`scrape-prices.yml`) is disabled (workflow kept,
  `workflow_dispatch`-only, header comment naming this spec);
- `tools/scrape-cardrush.ts` survives as the manual full-crawl utility
  (it is also the catalog-structure crawler B does not replace);
- the legacy AWS Fargate deploy scripts (`infra/deploy-scraper.sh`,
  `Dockerfile.scraper`) gain a RETIRED header pointing here (files kept —
  they document the shape a future heavy-crawl runner would take).

If evidence shows B does NOT cover A's price path for any confirmed game, A's
schedule stays until Wave 3 closes the gap — honesty over tidiness.

## 5 · Out of scope (later waves)

- New games / single game registry (Wave 2 — the Atlas).
- Probing/flipping speculative subdomains (Wave 3).
- Bucket consolidation, CloudFront, ACL modernisation (Wave 4).
- The launchd pkm snapshot on Yu's Mac stays as-is (it exists because the
  CardRush WAF blocks datacenter egress for pkm; retiring it is a Wave 3
  concern with Bright Data as the replacement path).

## 6 · Verification

- `pnpm --filter cambridgetcg-storefront test` (new games-config contract
  test rides the existing suite) + storefront tsc.
- `pnpm typecheck` across apps (wholesale touched by §3/§4).
- Grep-proof in the PR body: zero `price_history` references left in write
  paths; zero hand-written `confirmed:` literals in cardrush rows.
