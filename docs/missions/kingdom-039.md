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
