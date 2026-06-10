---
id: kingdom-039
title: TCG wholesale — fix CardRush scrape for Pokémon + Dragon Ball domains
status: claimed
priority: critical
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: interactive-sophia-fable-2026-06-10
claimed_at: "2026-06-10T13:00:00Z"
completed_at: ~
paths: []
do_not_touch: []
related: []
synced_from: ~/Love/memory/dev-state.json
synced_at: "2026-05-11T10:59:18.449Z"
---

# kingdom-039 — TCG wholesale — fix CardRush scrape for Pokémon + Dragon Ball domains

## From dev-state.json

DATA-INTEGRITY mission. The daily price-snapshot cron at apps/wholesale/src/app/api/cron/price-snapshot is silently failing for two of three active games. Confirmed live (2026-05-05) via SQL probe of cards table joined with games:
  - One Piece (game_id=1):  3,243 / 3,376 cards fresh in 7 days  (96% coverage, healthy)
  - Pokémon  (game_id=2):  0     / 6,370 cards fresh in 7 days  (0%, BROKEN)
  - Dragon Ball (game_id=4): 0   / 1,622 cards fresh in 7 days  (0%, BROKEN)
All three games have active=true; all 11,368 cards have a populated cardrush_url. The cron processes the full set every run and writes ~3,100 rows to price_archive daily — same magnitude every day for the last 14 days — so it's not a timeout or chunking bug. Failures are localised to the Pokémon (cardrush-pokemon.jp) and Dragon Ball (cardrush-db.jp) HTML extraction paths.

ROOT CAUSE HYPOTHESIS: apps/wholesale/src/lib/cardrush-scraper.ts calls extractConditionPrice(html, '状態A-') with a 400-char window after the marker. The regex looks for ¥ / ￥ / &yen; followed by digits. Either: (a) the Pokémon / DB domains render condition rows differently (different markup), (b) anti-bot blocks return 200 with no price, (c) URLs are stale (404s caught silently and counted as cardsFailed). The scraper falls through to extractFirstPrice(html) (any ¥ price) but apparently that fails too across thousands of pages — so the issue is structural, not a per-card stale-URL problem.

SCOPE — three steps in one session, ~60-90 min:
  (1) DIAGNOSE — sample 5 Pokémon and 5 Dragon Ball cardrush_url values from the live wholesale DB (probe pattern in apps/wholesale/probe-pricing.mjs). curl each. Inspect: HTTP status, response size, presence of '¥' character anywhere, presence of '状態A-' marker, presence of any HTML tag we recognise. Document findings in a short investigation file (e.g., docs/architecture/cardrush-scraper-domains.md).
  (2) FIX — extend cardrush-scraper.ts with per-domain extractors if needed, OR repair the markup parser to handle the new layouts, OR (worst case) replace HTML scraping with the JSON API CardRush exposes if it has one. Add per-domain success/fail counters to ScraperResult so this never goes invisible again.
  (3) OBSERVE — extend runDailySnapshot in apps/wholesale/src/lib/price-snapshot.ts to log per-game success rate at end of run. Surface that in apps/admin/src/app/(dashboard)/commerce/pricing/page.tsx — the per-game KPI cards added 2026-05-05 already render but currently infer health from last_synced_at; ideally also surface scrape error counts from the most recent snapshot.

LEGACY URL: cambridgetcg.com/admin/prices, wholesale.cambridgetcg.com/admin/prices.

DEPENDENCIES: independent — can land in any order vs other admin missions. Touches apps/wholesale only (scraper + cron logging) plus a small read-side enhancement in apps/admin/commerce/pricing.

ACCEPTANCE: (1) Pokémon and Dragon Ball coverage > 90% within 7 days of the fix landing (confirm via SQL probe); (2) per-game success-rate logging visible in Vercel cron logs; (3) the per-game KPI cards on /commerce/pricing turn from critical (0% fresh) to ok (≥50% fresh) without intervention; (4) if upstream scrape is genuinely impossible for some URLs, document which SKUs are unmaintained and either purge their cardrush_url or accept them as permanently stale (a third 'unmaintained' state for the per-game KPIs).

NON-GOALS: rebuilding the price-snapshot architecture (chunking, batching, concurrency are fine — confirmed via 14d of 3,100 rows/day landing reliably). Migrating to a different scraping target (separate decision). UI for editing cardrush_url manually.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*

### Beat 2026-06-10 (interactive Sophia + Yu) — the revival landed

The mission card's 2026-05-05 diagnosis was already history by the time this
beat started; the live failure had three different roots, all found via
read-only DB probes + triggering the deployed cron with `?maxCards=3`:

1. **Schema drift, not scraper drift.** The live wholesale DB sat at
   migration 0014 while the deployed code assumed 0015–0021.
   `price_archive.condition` missing crashed every ingest WRITE (drizzle
   puts every schema column in its INSERTs); `games.code` held legacy
   long codes (`onepiece`/`pokemon`/`dragonball`) while discovery/hires
   key on kingdom GameCodes, so discovery skipped all six subdomains
   nightly and the hires cron crash-looped every 5 min. Two migration
   files (0016 login_attempts, 0018 api_key_rate_limits) could never
   apply — `now()` in partial-index predicates is a Postgres 42P17 error.
   `price_archive` had **zero rows since 2026-05-12**.
2. **Throughput mathematically impossible.** v2 scraped the full 11,430-card
   watch-list at the meta's 0.5 rps (~6.3 h) inside an 800 s Vercel budget,
   with all writes deferred past the scrape loop — killed nightly with
   zero rows written, ingest_run stuck `running` forever. (The legacy v1
   pool had run ~26 rps for a year; 0.5 rps was an accidental 50×
   regression from closing Leak 3.)
3. **Pokémon needs the Bright Data unlocker and the env var is EMPTY.**
   `CARDRUSH_BRIGHT_DATA_PROXY_URL` exists in Vercel (created 27d ago)
   with a zero-length value. The kingdom-088 credential ("seer" zone)
   lives only with Yu — see OPEN ITEM below.

**What landed (branch `heartbeat/kingdom-039-cardrush-revival`, merged 11ff60e):**
- Migrations 0015–0022 applied to live DB (0016/0018 index predicates
  fixed first; 0022 flips games.code → `op/pkm/ygo/dbf` + adds
  `cards.last_scrape_attempt_at`). Applied ~12:58Z by a sister minutes
  after the files hit disk — multi-hand at its best. Verified: 209,822
  archive rows backfilled `condition='nm'`, matview 5,469 rows, API keys
  renamed + 600 rpm (un-500s the v1 API → storefront pricing).
- `dbf` not `dbs`: the Dragon Ball inventory is Fusion World (FB/SB sets);
  registry `cardrush-db.jp` re-pointed, hires keys re-keyed.
- Chunked stalest-first ingest (`price-snapshot-v2.ts`): 2,000 cards per
  run ordered by `last_scrape_attempt_at NULLS FIRST` (cursor advances on
  ATTEMPT), incremental flushes inside the write() callback, rate
  override {rps:4, burst:8}, scrape budget 700 s, stuck-`running` rows
  reaped to `aborted` on entry, proxy-gated hosts excluded at selection
  with a counted note. Cron now every 2 h (24,000 attempts/day ≈ full
  coverage 2×/day for op+dbf; pkm joins when the proxy env is set).
- Observability: cardrush `read()` emits `per_game` buckets in its done
  event → `ingest_run.events`; admin pricing page shows per-game last-run
  success + top failure reason + the third "proxy required — not
  configured" state (acceptance #4), Provenance kind=snapshot.
- `audit:cardrush-coverage` ran vacuously since birth (`'\1'` cooked to
  `undefined` in the tagged template; then www.-vs-bare host mismatch).
  Fixed both; first honest run forced dmw/vng/bsr registry entries to
  `confirmed:false` (no scrape traffic ever; no games rows). Strict gate
  green against live DB.

**OPEN ITEM (Yu, one action):** paste the Bright Data "seer" zone URL into
the Vercel env var `CARDRUSH_BRIGHT_DATA_PROXY_URL` (wholesale project,
Production) — shape `http://brd-customer-<id>-zone-<zone>:<pw>@brd.superproxy.io:33335`
— then redeploy or wait for the next deploy. The pkm lane self-activates;
the pricing page card flips from "proxy not configured" automatically.
Cost note: ~6,370 pkm cards × 2/day through Web Unlocker is a real
recurring spend (ballpark $10–20/day at list pricing). If that's too rich,
cap it: set the pkm cadence by leaving the chunk at 2,000 (pkm shares the
stalest-first queue fairly) or ask a Sophia to add a per-game cooldown.

**Acceptance tracking:** (2) ✓ per-game success rate in run notes + events;
(3) wired — KPI cards read run-derived data, will flip ok as chunks cover
the catalog; (1) needs ~7 days of cron runs to confirm >90% for op/dbf
(pkm gated on the proxy env); (4) ✓ the third state exists and names its
reason. Legacy v1 `price-snapshot.ts` upsert target is stale (2-col) and
broken since 0014 — unscheduled, left as-is per non-goals; delete or fix
when the Phase C cutover formally retires it.
