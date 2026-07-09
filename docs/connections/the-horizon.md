# The Horizon — anticipated sets, and the livelock that hid them

*2026-07-09. Node-view + incident story in one. Will trace: Yu — "expand
the UK Price Guides at cambridgetcg to include all the anticipated ones,
through cardrush. Understand how the current price guide and infra work
on aws first!"*

## The question that started it

Why doesn't the price guide show OP16? The config shipped 2026-06-11
(`tools/lib/config.ts`, group 124), the set released in Japan 2026-05-30,
the CardRush group exists, prices refresh every two hours. Every layer
said yes. Production said no set.

## What was actually wrong (two things, stacked)

**The starvation.** Discovery walks `CARDRUSH_SUBDOMAINS` in registry
order, capped at 500 product fetches per subdomain per run, inside an
800-second Vercel budget. cardrush-digimon.jp carried a 13,554-product
backlog. Every run since 2026-07-07 spent its entire budget inside
digimon and never reached One Piece, Pokémon, or Dragon Ball.

**The livelock.** The backlog never shrank — and could not. Discovery
diffed the sitemap against `cards.cardrush_url`, but the card INSERT
dedupes on `(sku)` and keeps the existing row's URL (`COALESCE`). Digimon's
13,554 products collapse to ~837 base SKUs; the rest are condition and
parallel duplicates of the same card number. So a conflicting product's
URL never entered `cards`, the diff re-offered the same 500 sitemap
entries every run, and `rows_written` reported ~260 "writes" per run
while the dmw card count sat frozen at 837. The pipeline looked busy.
It was walking in place.

The fix is one new fact-shape: `cardrush_seen_url` (migration 0023) —
a ledger where *processed* is a recorded fact instead of an inference
from `cards`. Diff = sitemap − cards − ledger. Fetch failures stay out
of the ledger so they retry; quarantined and SKU-collapsed URLs stay in
so they drain. Plus per-subdomain cron rotation in `vercel.json`
(`?onlySubdomain=`) so no subdomain can starve another even during a
backfill.

## The horizon itself

A set only appeared on `/prices/[game]` once cards carried prices;
registered-but-empty sets hid behind the "N sets pending" pill
(kingdom-086's substrate-honest filter). Correct for drift-mode
leftovers — wrong for OP17, which Bandai has announced for 2026-08-22
and customers are already searching for.

Now `tools/register-sets.ts` registers announced sets with
`sets.release_date`, and the game page splits empty sets by date:

- **future `release_date`** → an "On the horizon" tile — dashed border,
  no prices, the JP date, still visitable by URL
- **released ≤60 days ago, still empty** → same strip, labelled
  "awaiting first scrape" (that absence is a pipeline fact worth
  showing, not hiding)
- **no date / older** → the pending pill, as before

The tile flips to the live grid automatically the day its first scrape
lands. No flag-day, no manual promotion — the anticipate-then-confirm
pattern (subdomains → game codes → set formats → now sets) gains its
fourth instance.

## What else the walk surfaced

- **The three-slug game.** dbf was `dragon-ball` in the production
  `games` row, `dragon-ball-fusion` in an earlier storefront curation,
  and `dragon-ball-fusion-world` in GAME_CONFIGS. Sister's Atlas work
  (2026-07-07) settled the curation on `dragon-ball`; register-sets now
  asserts that everywhere. (Confession for the record: this session
  first reconciled the DB the other way and broke the live DBF guide
  for ~20 minutes before the merge revealed sister's choice — reverted
  the moment it surfaced. Verify, don't overwrite, includes the
  database.)
- **SV9 wore SV5M's name** (サイバージャッジ) in both config and
  known-set-names — same drift family the-second-witness.md caught for
  SV11B/W. SV9 is バトルパートナーズ.
- **Group 114 (リミテッドパック) is not LP03** — it holds star-parallel
  FB09 reprints keeping `{FB09-NNN}` numbers. Verified before minting a
  set code that would have orphaned every row.
- **Two new games stood up**: Vanguard (DZ era) and Battle Spirits
  (BS64+), CLI-backfilled from live-verified group IDs and title-format
  regexes; their `games` rows existed inactive since seeding and
  activate now. Their sitemap discovery stays off until the shared
  title parser learns their number shapes (VG uses `/`, BS puts letters
  in numbers) — CLI scrapes carry them meanwhile.

## For whom is this true?

The horizon strip states Japanese release dates and says so ("JP");
UK availability follows later and the strip does not pretend otherwise.
Names render in the publisher's language until an English name is
confirmed — a Japanese-reading visitor sees the truth first, an
English-only visitor sees an honest placeholder, and nobody sees a
guessed translation presented as official.

## Where the wires are

| Wire | Place |
|---|---|
| Seen-URL ledger | `apps/wholesale/drizzle/0023_cardrush_seen_url.sql`, `schema.ts` `cardrushSeenUrl` |
| Livelock fix | `apps/wholesale/src/lib/cardrush-discovery.ts` (diff + `recordSeen`) |
| Rotation | `apps/wholesale/vercel.json` (per-subdomain `?onlySubdomain=` crons) |
| Horizon registry | `apps/wholesale/tools/register-sets.ts` |
| Horizon strip | `apps/storefront/src/app/prices/[game]/page.tsx` |
| New games | `tools/lib/config.ts` (vanguard/battlespirits), `games-config.ts` (curated rows), `packages/sku/src/sets.ts` (DZ/BS formats) |

*The pipeline that looks busiest may be the one walking in place; the
ledger is how it learns to notice. And the guide that hides tomorrow's
sets is honest about the substrate but silent about the horizon — now
it says both.*
