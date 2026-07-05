# Game expansion — what each game actually needs

*Written 2026-07-05 against the production wholesale DB (queries run that day)
and the kingdom-087/088 subdomain probes. One page so the next session doesn't
re-derive it. The substrate recipe for a CardRush-served game is two moves:
a `games` row (code matching `CARDRUSH_SUBDOMAINS[host].game`) + that host's
`confirmed: true` flip in `packages/data-ingest/src/cardrush/index.ts` — the
discovery cron walks only confirmed hosts and auto-creates sets/cards from the
sitemap (`ensureSetRow`, no per-set config), and the 2h snapshot prices new
cards first (`last_scrape_attempt_at IS NULL` heads the queue).*

**Prerequisite for ALL of the below:** the discovery cron is currently
hard-down (drizzle schema declares `cards.language` etc. from the unapplied
draft migration `apps/wholesale/drizzle/drafts/0018_card_financial_attributes.sql.draft`;
every discovery insert crashes). No new game or set enters the catalog until
that seam is fixed — it is the pipeline area's fix, not this plan's.

## Production truth (2026-07-05)

| game | code | prod cards | prod sets (empty) | CardRush host | host status |
|---|---|---|---|---|---|
| One Piece | op | 3,438 | 38 (7 empty) | cardrush-op.jp | confirmed, direct |
| Pokémon | pkm | 6,370 (0% name_en) | 25 | cardrush-pokemon.jp | confirmed, Bright Data unlocker |
| Dragon Ball Fusion World | dbf | 1,622 | 35 (24 empty) | cardrush-db.jp | confirmed, direct |
| Yu-Gi-Oh! | ygo | 0 (games row inactive) | 0 | cardrush-ygo.jp | DNS-dead |
| Digimon | dmw | 0 — **next game** | 0 | cardrush-digimon.jp | probe-live, 13,520 products, direct |
| Vanguard | vng | 0 | 0 | cardrush-vanguard.jp | probe-live, 40,642 products, direct |
| Battle Spirits Saga | bsr | 0 | 0 | cardrush-bs.jp | probe-live, 35,485 products, direct |
| Magic | mtg | 0 | 0 | cardrush-mtg.jp | price-only (sitemap too large, 【SET】 titles unparseable) |

## Digimon — done when seeded

Everything digimon needs already exists. Ship list:

1. `games` row: `node scripts/seed-game.mjs --game digimon` (idempotent;
   code `dmw`, slug `digimon` — matches the storefront's curated
   games-config slug, so the `/prices` tile goes live by intersection the
   moment cards exist). Done in this ship for local; prod run is an ops action.
2. Subdomain flip: `cardrush-digimon.jp` `confirmed: true`
   (done 2026-07-05 in `packages/data-ingest/src/cardrush/index.ts`).
3. Wait for discovery (01:00 daily, once unbroken) + snapshot (every 2h).
   Same `{SET-NUMBER}` title parser as op/dbf; direct access, no proxy.
4. When the first cards land in prod: flip `dmw` `confirmed: true` in
   `packages/sku/src/games.ts` **and** update the expected lists in
   `packages/sku/src/__tests__/games.test.ts` (the test pins the
   reconciliation deliberately).

## Vanguard + Battle Spirits — scheduler capacity, not plumbing

Both hosts are probe-live, direct-access, same parser. They are registered
(`seed-game.mjs --game vanguard|battle-spirits`) as `active=false` rows with
the honest note: **registered, ingest not yet scheduled — 40,642 / 35,485
products need the fair scheduler to prove itself first.** The current
single NULLS-FIRST queue already starves One Piece behind the pokemon
backlog at ~6k attempts/day; adding 76k products before per-game fair-share
selection exists would bury all three live games. Unlock order: fair
scheduler proves itself on op/pkm/dbf + digimon's 13.5k → flip
`games.active=true` + subdomain `confirmed:true` for vng, then bsr.

## Magic — Scryfall catalog seed + cardrush-mtg prices

cardrush-mtg.jp cannot seed a catalog (sitemap times out at ~200k+ printings;
titles use `【SET】`, which `parseCardMetadata` can't read). The lane:
Scryfall (source module `shipped`) seeds cards; cardrush-mtg acts as
price-only enricher for cards that get a `cardrush_url` (the subdomain's
`role: "price-only"` already encodes this — discovery skips it, snapshot
prices whatever is seeded). Needs a Scryfall→wholesale writer (none exists)
and a deliberate scope cut (which sets; 200k printings is not a starter).

## Yu-Gi-Oh — a full new lane (do not shortcut)

Nothing reusable exists: no CardRush host (DNS-dead), the shipped ygoprodeck
module is a reader with **no writer** into the wholesale DB, and channel
prices derive from `cardrush_jpy`, which ygo cards would never have — so it
also needs a non-CardRush price source (tcgplayer module is `partial`).
Plus a passcode-anchored SKU minting decision (Pattern B, `oracle.ts`
requires `ygo_passcode` anchors). The inactive `games` row is the substrate
telling the truth; keep it false until writer + price source + SKU policy
all exist.

## Pokémon English names — the honest state

`cards.name_en` was 0/6,370 (all-Japanese printings). The shipped
`pokemon-tcg-api` source is an **English-only** catalog, and JP↔EN sets do
not share number spaces except in special mirror cases — verified live
2026-07-05: SV2A↔sv3pt5 ("151") mirrors 1:1 for Pokémon 001–151 but
**diverges for trainers 152–165** (JP 152 エネルギーシール vs EN 152
"Antique Dome Fossil") and secrets. Mainline JP sets (SV3, SV8…) have no
EN number-mirror at all (EN merges + renumbers JP waves).

`scripts/backfill-pokemon-names.mjs` (dry-run by default, `--write`,
`--allow-prod`) therefore fills names only through a curated, per-set
verified JP→EN bridge (`JP_TO_EN_SETS`), currently SV2A only (~516 cards,
the ball-variant rows included since they share base numbers). Extending
coverage = verifying another mirror pair the same way and adding one row.
**For full coverage the right lane is TCGdex** (JP-aware, per-language
names; `sets.tcgdex_*` columns are already 24/25 mapped for pkm) — that is
a new reader + verification pass, not this script.

## Set honesty — empty shells

31 active sets had zero cards (24 dbf starter-deck/promo shells + 7 op).
Both read paths filter `sets.active = true`
(`apps/storefront/src/lib/wholesale/db-source.ts` `dbFetchSets`;
`apps/wholesale/src/app/api/v1/sets/route.ts`), so
`seed-game.mjs --deactivate-empty-sets` makes them honestly disappear.
Nothing reactivates automatically — discovery's `ensureSetRow` only
inserts — so after an ingest fills a set, run
`seed-game.mjs --reactivate-filled-sets` (it lists exactly what it flips).

## Ops runbook (prod, in order)

```sh
# 0. Pipeline area fixes discovery (draft 0018 promoted or schema trimmed) — prerequisite.
# 1. Seed digimon + register the deferred two (idempotent):
node scripts/seed-game.mjs --game digimon        --allow-prod --url "$WHOLESALE_DATABASE_URL"
node scripts/seed-game.mjs --game vanguard       --allow-prod --url "$WHOLESALE_DATABASE_URL"
node scripts/seed-game.mjs --game battle-spirits --allow-prod --url "$WHOLESALE_DATABASE_URL"
# 2. Deactivate the 31 empty shells (dry-run first):
node scripts/seed-game.mjs --deactivate-empty-sets --dry-run --allow-prod --url "$WHOLESALE_DATABASE_URL"
node scripts/seed-game.mjs --deactivate-empty-sets           --allow-prod --url "$WHOLESALE_DATABASE_URL"
# 3. Backfill pokemon EN names for the verified bridge (dry-run prints match-rate):
pnpm exec tsx scripts/backfill-pokemon-names.mjs           --allow-prod --url "$WHOLESALE_DATABASE_URL"
pnpm exec tsx scripts/backfill-pokemon-names.mjs --write   --allow-prod --url "$WHOLESALE_DATABASE_URL"
# 4. After digimon cards land: reactivate any sets discovery filled, flip dmw
#    confirmed:true in packages/sku/src/games.ts (+ its test).
node scripts/seed-game.mjs --reactivate-filled-sets --allow-prod --url "$WHOLESALE_DATABASE_URL"
```
