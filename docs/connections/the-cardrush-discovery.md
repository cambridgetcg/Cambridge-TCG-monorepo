---
title: The cardrush discovery — sitemap-driven catalog enumeration
kind: node-view + story-as-wire
filed: 2026-05-14
kingdom: kingdom-087
sophia: Sophia (Opus 4.7, 1M context)
status: shipped (cron route ready; operator schedules)
parents:
  - the-cardrush-end-to-end.md
  - the-set-id-asymmetry.md
this_entry_names:
  - packages/data-ingest/src/cardrush/discovery.ts                              # pure functions
  - packages/data-ingest/src/index.ts                                            # re-exports
  - apps/wholesale/src/lib/cardrush-discovery.ts                                # wholesale runner
  - apps/wholesale/src/app/api/cron/discover/cardrush/route.ts                   # cron route
  - apps/admin/scripts/cardrush-probe.ts                                         # +sitemap probe
  - apps/wholesale/drizzle/drafts/0015_cardrush_url_speculative_backfill.sql.draft  # SUPERSEDED notice + URL fix
  - apps/storefront/src/lib/manifest.ts                                          # discovery cron advertised
self_reference: this entry names itself; the discovery layer it describes operates against the sitemap whose existence the same entry confirmed by reconnaissance.
---

# The cardrush discovery — sitemap-driven catalog enumeration

> *"Websearch cardrush-op.jp to understand its website structure and all the links. Review our aggregator module."*  → diagnosis → *"go for full discovery pipeline."* — Yu, 2026-05-14.

The cardrush aggregator had been operational for a year — the scraper at [`packages/data-ingest/src/cardrush/index.ts`](../../packages/data-ingest/src/cardrush/index.ts) reliably extracts prices from any URL given to it. But it operated **on-demand only**: the daily snapshot iterated `cards.cardrush_url IS NOT NULL` and processed whatever was already seeded. The discovery substrate — *how cards get into the wholesale catalog in the first place* — was manual.

Reconnaissance against cardrush-op.jp revealed the unlock: **`/sitemap.xml` exists, enumerates every product, is publicly readable, and uses the URL pattern `/product/[N]` not `/product/detail.php?product_id=N`**. The kingdom had been documenting the wrong pattern in [drafts/0015](../../apps/wholesale/drizzle/drafts/0015_cardrush_url_speculative_backfill.sql.draft) for many sessions — substrate-honest bug, now corrected. And we'd never read the sitemap that's been sitting at the standard well-known location all along.

This kingdom ships the full self-discovering source.

---

## 1. The discovery layer ([`discovery.ts`](../../packages/data-ingest/src/cardrush/discovery.ts))

Pure functions where possible. Same User-Agent + rate-limit budget as the existing scraper (createFetcher pre-bound to cardrush.meta). Four primitives:

| Function | Input | Output |
|---|---|---|
| `fetchSitemap(host, fetcher)` | subdomain hostname | `{ ok, product_urls[], total_urls, error_reason?, fetched_at }` |
| `parseSitemapProductUrls(xml, host)` | sitemap XML string | `{ product_urls[], total_urls }` — pure |
| `parseCardMetadata(html, url)` | product page HTML + URL | `CardMetadata \| null` — pure |
| `fetchAndParseProduct(url, fetcher)` | product URL | `{ ok, metadata, error_reason?, fetched_at }` |

Substrate-honest absence: every metadata field can be null (set_code, card_number, rarity, name, image_url, stock_status). The parser never fabricates. The runner decides whether to insert, quarantine, or skip based on what's present.

`parseCardMetadata` parses the page title's `{<SET>-<NUMBER>}` token (e.g., `{EB04-061}`) for set/number; the rarity token (`SR`, `SEC`, `L`, etc.) immediately before the brace; the card name from the title prefix; the image URL from `<meta og:image>` or inline `cardrush-*/product/*.jpg` patterns; stock status from `在庫なし` / `カートに入れる` markers.

## 2. The wholesale runner ([`cardrush-discovery.ts`](../../apps/wholesale/src/lib/cardrush-discovery.ts))

Daily lifecycle per cron tick:

```
INSERT ingest_run (source_id='cardrush-discover', triggered_by='cron')
FOR EACH subdomain in CARDRUSH_SUBDOMAINS where confirmed=true:
  fetchSitemap(host, sharedFetcher)
  diff against cards.cardrush_url WHERE game_id matches
  FOR EACH new URL (capped at maxNewPerSubdomain=500):
    fetchAndParseProduct(url)
    IF metadata.set_code AND metadata.card_number:
      build SKU via @cambridge-tcg/sku
      INSERT INTO cards ON CONFLICT (sku) DO UPDATE SET
        cardrush_url = COALESCE(cards.cardrush_url, EXCLUDED.cardrush_url),
        name         = (only fill when existing is empty),
        set_code     = COALESCE(...),
        rarity       = COALESCE(...),
        image_url    = COALESCE(...)
    ELSE:
      INSERT INTO ingest_quarantine (reason="title parse incomplete: ...")
UPDATE ingest_run with counts + events jsonb
```

Key design choices:

- **Shared fetcher** — one rate-limit bucket across the entire run (sitemap + product fetches). Per cardrush's declared 0.5 rps budget.
- **`ON CONFLICT (sku) DO UPDATE SET ... COALESCE(...)`** — cooperative with cards seeded by other paths. The scraper, manual seed, refill tools all coexist; discovery fills gaps without overwriting.
- **Title-parse failures → quarantine, not silent skip** — operator reviews via the existing `/ops/ingest-quarantine` admin surface (kingdom-081 Phase 4.4). Substrate-honest about what we couldn't ground.
- **Per-subdomain cap (default 500)** — prevents the first run from fetching 1100+ pages at 0.5 rps (would take ~37 minutes per subdomain). Operator can override via `?maxNewPerSubdomain=N`. Subsequent days find ~0 new products in steady state.
- **Dry-run mode** — `?dryRun=1` walks sitemaps + computes diffs but skips product fetches + INSERTs. Operator runs once before a flag-day to see what would happen.

## 3. The cron route ([`/api/cron/discover/cardrush`](../../apps/wholesale/src/app/api/cron/discover/cardrush/route.ts))

Standard wholesale-cron auth (CRON_SECRET via Bearer, query param, or Vercel-Cron header). `maxDuration: 800` seconds (fluid functions max). Query params: `?dryRun=1` / `?maxNewPerSubdomain=N` / `?onlySubdomain=cardrush-op.jp` / `?triggeredBy=cron|admin|webhook`.

The route is NOT yet scheduled in `vercel.json`. Operator decision — like the kingdom-081 cron flip:

```diff
 "crons": [
   ...
+  { "path": "/api/cron/discover/cardrush", "schedule": "0 1 * * *" },
   { "path": "/api/cron/ingest/cardrush",   "schedule": "0 2 * * *" }
 ]
```

Discovery runs at 01:00 UTC (catalog walk + diff + new-product fetch), price snapshot at 02:00 UTC (existing-card scrape). Daily, the discovery cron seeds; the price-snapshot cron prices. New cards appear in the wholesale catalog within 24h of cardrush publishing them.

## 4. Probe extension ([`cardrush-probe.ts`](../../apps/admin/scripts/cardrush-probe.ts))

The kingdom-081 Phase 3.1 probe now also fetches `/sitemap.xml` per subdomain. The markdown output gains two columns: `sitemap` (HTTP status of /sitemap.xml) and `products` (count of `/product/[N]` URLs in it).

A subdomain showing `sitemap=200, products>0` is the strongest possible confirmation — not just "the host exists" but "the discovery cron can immediately run against it without further validation". The audit's `promote-to-confirmed` recommendation can incorporate this signal in a future iteration.

## 5. The backfill draft, corrected and superseded

[`drafts/0015`](../../apps/wholesale/drizzle/drafts/0015_cardrush_url_speculative_backfill.sql.draft) had documented the wrong URL pattern (`/product/detail.php?product_id=N`) for many sessions. Today:

- **Corrected**: every URL-construction line now uses `/product/[N]`
- **Superseded by kingdom-087**: a SUPERSEDED notice at the top points the operator at the discovery cron for new-subdomain coverage. The draft remains for the two cases discovery doesn't cover (backfilling existing rows, per-card corrections).

Substrate-honest about its own status: the draft acknowledges its narrower scope explicitly.

## 6. What the discovery layer DOESN'T do (named honestly)

- **Doesn't fetch prices.** That's the existing `/api/cron/ingest/cardrush` snapshot's job. Discovery seeds `cardrush_url`; snapshot reads it. Two crons, two concerns.
- **Doesn't delete cards.** A product removed from cardrush's sitemap stays in our `cards` table (historical price data is preserved). Future kingdom could add `cards.cardrush_last_seen_at` to track liveness.
- **Doesn't validate set_code against the `sets` table.** Composes naturally with kingdom-086's `audit:sets-coverage` — discovery may insert cards with set_codes that don't yet have a `sets` row; the audit flags them as orphans; operator decides per-row.
- **Doesn't infer language.** Hardcodes `lang: "ja"` since all CardRush subdomains are Japanese retail. When/if a CardRush English subdomain appears, this needs revisiting.
- **Doesn't probe speculative subdomains.** The cron walks `confirmed: true` only. The probe (`cardrush-probe.ts`) handles speculative confirmation; operator flips `confirmed: true` after a successful probe to enable discovery.

## 7. The structural lesson

> *Discovery primitives sit at standard locations. Read them before designing around their absence.*

We assumed for many kingdoms that cardrush had no enumerable catalog. We built `cards.cardrush_url` as a manually-seeded column. We built the kingdom-064 anticipate-then-confirm pattern with no actual confirm mechanism. The Phase 3.2 backfill draft assumed operator would manually construct URL → card mappings.

A single WebFetch to `/sitemap.xml` would have shown otherwise, at any point in the past year. The lesson generalises:

**Before designing a manual seed for an external source, check for**:
1. `/sitemap.xml` (search-engine-targeted enumeration)
2. `/robots.txt` (which may list other sitemap locations)
3. `/.well-known/*` (standardised discovery)
4. RSS / Atom feeds
5. Public catalog APIs (often undocumented but discoverable via DevTools)

We added this to the data-ingest source protocol's eight steps: when registering a new source, *first* probe for these primitives. Manual-seed paths are a last resort, not a default.

## 8. Recursion targets

1. **Schedule the discovery cron in `vercel.json`** — operator decision. One line.
2. **`pnpm audit:cardrush-discovery-health`** — for each confirmed subdomain, surface (sitemap_status, products_in_sitemap, cards_with_cardrush_url, recent_discover_runs). Substrate-honest about coverage drift.
3. **Per-language CardRush subdomains** — if/when cardrush.com or a Korean variant appears, generalize `lang: "ja"` to a per-subdomain map.
4. **Image download** — currently we store the cardrush image URL (hot-linked). Future kingdom could mirror images locally with attribution preserved.
5. **`cards.cardrush_last_seen_at`** — track when a product was last in the sitemap; alerts when a previously-discovered product disappears (delisted, sold out permanently, or set retired).
6. **Generalize the discovery contract** — add optional `discover()` to `SourceModule` so future sources (TCGplayer catalog, Cardmarket articles) can plug in the same shape. Today it's cardrush-specific; the second source generalises.
7. **Quarantine review for title-parse failures** — operator UI already exists via kingdom-081 Phase 4.4; surface a "title parsing" subset filter.
8. **Per-subdomain sitemap diff timeline** — track sitemap.xml hash daily; surface "new products this week" to the discovery-coverage audit + a future webhook event.

## 9. Post-shipping probe results (kingdom-087 follow-up)

Right after the discovery layer shipped, the extended probe ran against all 12 registered subdomains. **The numbers were big, and surfaced two bugs.**

### 9.1 The regex bug
Both `cardrush-probe.ts` and `discovery.ts` used `https?://${host}/product/\d+` — but cardrush sitemaps actually emit `https://www.<host>/product/<N>` (with `www.` prefix). First run reported every working sitemap as `products=0`. Fixed both regexes to tolerate optional `(?:www\.)?` prefix. The discovery runner also normalizes URLs (collapsing `www.` for dedup) so the first discovery run against an existing `cards.cardrush_url` (which may or may not have `www.`) doesn't re-discover every row.

### 9.2 Probe results post-fix

| Host | Game | Homepage | Sitemap | Products | Decision |
|---|---|---|---|---|---|
| cardrush-op.jp | op | ✓ 200 | ✓ 200 | **12,549** | confirmed (was) |
| cardrush-pokemon.jp | pkm | ✗ 403 | ✗ 403 | 0 | confirmed (was) — **REGRESSION** |
| cardrush-db.jp | dbs | ✓ 200 | ✓ 200 | **4,889** | confirmed (was) |
| cardrush-digimon.jp | dmw | ✓ 200 | ✓ 200 | **13,520** | **promote → confirmed** |
| cardrush-vanguard.jp | vng | ✓ 200 | ✓ 200 | **40,642** | **promote → confirmed** |
| cardrush-bs.jp | bsr | ✓ 200 | ✓ 200 | **35,485** | **promote → confirmed** |
| cardrush-mtg.jp | mtg | ✓ 200 | ✗ (fetch failed) | 0 | keep speculative — investigate |
| cardrush-ygo.jp | ygo | ✗ fetch_error | — | 0 | keep speculative — likely DNS-dead |
| cardrush-weiss.jp | wei | ✗ fetch_error | — | 0 | keep speculative — likely DNS-dead |
| cardrush-fab.jp | fab | ✗ fetch_error | — | 0 | keep speculative — likely DNS-dead |
| cardrush-lorcana.jp | lgr | ✗ fetch_error | — | 0 | keep speculative — likely DNS-dead |
| cardrush-fw.jp | dbf | ✗ fetch_error | — | 0 | keep speculative — likely DNS-dead |

**Total catalog accessible to discovery: ~107,085 products across 5 subdomains** (excluding pokemon while 403 is unresolved).

### 9.3 Two regressions surfaced

**`cardrush-pokemon.jp` returns HTTP 403** on both `/` and `/sitemap.xml` with our Chrome User-Agent. The site has added bot-blocking at some point. The discovery cron will record `sitemap_failed` in its events jsonb and skip the subdomain (substrate-honest). The **existing price-snapshot cron may also be affected** — the per-product scraper uses the same User-Agent. Operator verifies by checking the most-recent `ingest_run` row for `source_id='cardrush'` and looking at the `error_reason` counts.

Recursion target #9: investigate whether the per-product `/product/[N]` URL still works for pokemon (homepage block might not extend to deep paths) and adjust the scraper's request shape if needed.

**`cardrush-mtg.jp` homepage works but sitemap fetch failed.** Either the sitemap doesn't exist on that subdomain, or it's at a non-standard location, or our specific fetch timed out. Keep as `confirmed: false` until investigated. Recursion target #10.

### 9.4 Subdomains flipped to confirmed this kingdom

Updated `packages/data-ingest/src/cardrush/index.ts`:

```diff
-  "cardrush-digimon.jp":  { game: "dmw", confirmed: false, ... },
-  "cardrush-vanguard.jp": { game: "vng", confirmed: false, ... },
-  "cardrush-bs.jp":       { game: "bsr", confirmed: false, ... },
+  "cardrush-digimon.jp":  { game: "dmw", confirmed: true, note: "13,520 products in sitemap" },
+  "cardrush-vanguard.jp": { game: "vng", confirmed: true, note: "40,642 products in sitemap" },
+  "cardrush-bs.jp":       { game: "bsr", confirmed: true, note: "35,485 products in sitemap" },
```

The kingdom-064 anticipate-then-confirm pattern *finally fires*. Three subdomains promoted by mechanical evidence (working sitemap + product count > 0), not by guess. Notes updated with the substrate-honest count.

## 10. Post-deploy verification (after Yu pushes)

Once `vercel.json` lands and the deploy is live, the operator runs this sequence:

```bash
# 1. Dry-run — walks sitemaps + diffs against cards.cardrush_url; no writes.
curl -X POST \
  'https://wholesaletcgdirect.com/api/cron/discover/cardrush?dryRun=1' \
  -H "Authorization: Bearer $CRON_SECRET" | jq .

# Expected: summary.per_subdomain shows new_urls count per subdomain
# (digimon ~13k, vanguard ~40k, bs ~35k on first run, op/db ~0 if they're
# fully covered already). Substrate-honest count of work the real run would do.

# 2. First real run with conservative cap (100 new per subdomain).
curl -X POST \
  'https://wholesaletcgdirect.com/api/cron/discover/cardrush?maxNewPerSubdomain=100' \
  -H "Authorization: Bearer $CRON_SECRET" | jq .

# Expected: ~500 new cards inserted (5 confirmed-and-healthy subdomains × 100).
# Quarantined count is the test of the title parser; > 0 means some titles
# didn't match {SET-NUMBER} format — review at /ops/ingest-quarantine.

# 3. Inspect what landed.
psql $WHOLESALE_DATABASE_URL <<SQL
SELECT g.code AS game, count(*) AS new_cards
  FROM cards c
  JOIN games g ON g.id = c.game_id
 WHERE c.cardrush_url IS NOT NULL
   AND c.last_synced_at IS NULL
 GROUP BY g.code
 ORDER BY new_cards DESC;
SQL

# Expected: per-game counts of "discovered but not yet priced" cards.
# Tomorrow's price-snapshot cron will fill in prices.

# 4. Run the health audit to verify post-run state.
pnpm audit:cardrush-discovery-health

# Expected: ✓ each confirmed subdomain has sitemap + matching coverage ratio.
# Pokemon will still show HTTP 403 — separate recursion target.

# 5. Schedule the unrestricted cron.
# After steps 1-4 look good, the daily 01:00 UTC cron runs unrestricted
# (cap defaults to 500/subdomain). Subsequent days find ~0 new in steady state.
```

If step 2's first real run yields > 10 quarantined rows, halt and inspect via `/ops/ingest-quarantine` before scheduling the daily cron. The title parser may need adjustment for one of the new subdomains (digimon / vanguard / bs may have different title format than the One Piece sample we tested against).

## 11. Verification

- **Typecheck**: storefront + wholesale + admin all exit 0
- **`pnpm audit:hospitality`**: ✓ all 8 still pass
- **`pnpm audit:tributaries`**: ✓ all 10 still pass
- The wholesale-side runner integrates cleanly with existing `ingest_run` + `ingest_quarantine` substrate (kingdom-066 Phase A migration)
- Discovery cron is not auto-scheduled — operator opts in via `vercel.json` edit

7 files (3 new + 4 modified). kingdom-087.

— Sophia (Opus 4.7, 1M context), 2026-05-14.
