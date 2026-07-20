---
id: kingdom-090
title: POOF — the price-search module (composition-only over five substrate kingdoms)
status: done
priority: high
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG-monorepo
claimed_by: sophia-2026-05-14 (Opus 4.7, 1M context)
claimed_at: "2026-05-14T13:00:00Z"
completed_at: "2026-05-14T14:30:00Z"
paths:
  - apps/storefront/src/lib/search/resolver.ts
  - apps/storefront/src/lib/search/variants.ts
  - apps/storefront/src/app/api/v1/search/cards/route.ts
  - apps/storefront/src/app/api/v1/cards/[sku]/everything/route.ts
  - apps/storefront/src/app/api/v1/search/everything/route.ts
  - apps/storefront/src/app/prices/search/page.tsx
  - apps/storefront/src/app/prices/[game]/page.tsx
  - apps/storefront/src/lib/manifest.ts
  - apps/storefront/src/app/api/v1/status/route.ts
  - apps/storefront/src/lib/nav/menu-config.ts
  - apps/storefront/src/components/layout/Footer.tsx
  - docs/connections/the-poof.md
  - docs/connections/README.md
  - docs/connections/the-ebay-alignment.md
  - docs/missions/kingdom-090.md
do_not_touch:
  - drizzle/**                                # no schema changes — pure-composition kingdom
  - packages/sku/**                           # SKU canonical untouched
  - apps/wholesale/**                         # Falcon-consumed, not modified
  - apps/admin/**
related:
  - docs/connections/the-poof.md              # this kingdom's story-arc + wiring map
  - docs/connections/the-cardrush-alignment.md # kingdom-066 — CardRush ingestion (substrate)
  - docs/connections/the-name-resolver.md      # kingdom-075 — SKU canonical (substrate)
  - docs/connections/the-cardrush-end-to-end.md # kingdom-079 — observability + price_archive provenance
  - docs/connections/the-bright-data-unlock.md  # kingdom-088 — upstream_proxy declaration (substrate)
  - docs/connections/the-pillow-book.md        # 2026-05-14 entry — the live-verify story
synced_from: in-repo authored (not yet in dev-state.json)
synced_at: "2026-05-14T14:30:00Z"
---

# kingdom-090 — POOF

## What this is

Yu's directive 2026-05-14: *"GOOD! NOW LETS DESIGN A PRICE SEARCH MODULE!!!!! IDEALLY I WOULD ONLY NEED TO PUT IN THE CARD NUMBER AND FILTER FOR CARD GAME THEN POOF!!!! PRICE, TRANSACTION HISTORIES, AVAILABLE SOURCES, DIFFERENT LANGUAGE ALL POPS UP!"*

The kingdom's first **composition-only** feature. No new tables, no new substrate, no new clients. Five substrate kingdoms (066 CardRush ingestion · 075 SKU canonical · 080 cross-source archive · 082 envelope · 088 proxy declaration) had quietly ripened; POOF is the single resolver that turns (game, card-number) into a typed SKU and lets every existing wire compose around it.

Total round-trip from "DESIGN" to live verification: ~90 minutes across nine deploys through the gitSource API workaround per `ops-deploy-runbook.md §Untrusted committer`.

## What shipped

- **`lib/search/resolver.ts`** — pure-compute helpers: `normalizeQuery`, `parseSetNumberShape`, `parseSkuShape`, `scoreMatches` (5-tier confidence ladder: canonical-SKU-exact / set+number publisher form / set+number bare-digit / set+number suffix / fuzzy number-only), `groupSiblings`, `summarizeMatches`. Every match carries a stable `reason` string for substrate-honest UI display + audit.

- **`lib/search/variants.ts`** — sibling classifier with 8-tier waterfall (self / promo set-code / cross-set super-parallel / promo name-marker / parallel name-marker / alt-art name-marker / cross-language by name-script / alt-art catch-all). Dictionaries for Japanese (`漫画背景` / `プロモ` / `金文字` / `パラレル`) and English markers. `effectiveLanguage` infers script from card-name CJK-vs-Latin ratio — distinct from SKU `lang` segment because OPTCG ships both JP-text and EN-text prints inside the same JP set.

- **`/api/v1/search/cards`** — resolver endpoint; `(game, q) → matches`.

- **`/api/v1/cards/[sku]/everything`** — composer endpoint; one SKU → card meta + prices_today (with cross-source agreement stats) + history-summary per source (Phase 1: sparkline stats only) + siblings across variants + ctcg quote. Four Falcon calls in parallel, each degrading to `null` on failure; `composition.falcon_calls` is the operator-visible breadcrumb.

- **`/api/v1/search/everything`** — convenience endpoint; folds resolver + composer for the common (game, card-number) → POOF case. Returns matches-only when ambiguous; folded `data.everything` when unambiguous.

- **`/prices/search`** — server-rendered HTML face; URL-driven (shareable permalink). Four sections: matches block · today's prices · history summary · variants grouped by kind.

- **Entry-point form on `/prices/[game]`** — *"Card number → everything"* card-number form, slug pre-filled, submits to `/prices/search`.

- **Substrate-honesty surfaces.** Per-row license tier pill (CC0 / partner-redistributable / internal-only); proxy column (`↻ proxy` for Bright Data Web Unlocker-routed CardRush rows per kingdom-088); `<Provenance kind="cached" ttl="5m" />`; `<WhyLink>` to `/methodology/cross-source-pricing` and `/methodology/edition-variants`; license boundary explicit (raw history tape gated to Phase 2 auth-tier-2).

- **Discoverability.** Nav promotion to three locations (Cards → Browse #1 · Market → Buy · Footer Shop). The HTML face is the always-on door from anywhere in the storefront.

## What did NOT change

- **No schema changes.** Pure composition — every read goes through existing Falcon courier helpers (`fetchCard` / `fetchPriceSources` / `fetchCardrushHistory` / `fetchTcgplayerHistory` / `fetchPrices` / `fetchSets` / `fetchGames`).
- **No new tables, no migrations.**
- **No retail-flow changes** — cart, checkout, trade-in, market, auctions all untouched.
- **No license boundary loosening** — CardRush observation raw tape still internal-only; TCGplayer still partner-redistributable.

## Acceptance

- `pnpm --filter @cambridge-tcg/storefront typecheck` exits 0 (no new errors from kingdom-090 work; pre-existing ambient typing issues unrelated).
- Live POOF at `https://www.cambridgetcg.com/prices/search?game=op&q=OP01-001` renders card identity + 5 variant siblings (V11DZ alt-art, V11L1 base, V11L2 EN-text, VY12/VY13 gold-text promos).
- JSON wire returns `count=5 best=exact folded_sku=OP-OP01-001-JP-V11DZ`.
- Verify-don't-overwrite: existing retail / wholesale / welcome-all surfaces untouched.

## The three quiet bugs (live-verified)

The unit-shape thinking missed three real-world facts about the data. Each surfaced during live probing of `OP-OP01-001-JP-V11DZ` (Roronoa Zoro SR, ロロノア・ゾロ):

1. **`card_number` stored as full publisher form** (`"OP01-001"`) not bare digits (`"001"`). Tier 2 of the confidence ladder added (`set+number publisher form`).
2. **Game-token slug/code/prefix drift.** Wholesale `games` row: `code='onepiece'` / `slug='one-piece'` / SKU prefix `op`. None equal each other. Resolved via set-based lookup using `fetchSets()` → set's `game_code`.
3. **Legacy uppercase SKUs.** Wholesale `cards.sku === X` is case-sensitive; kingdom-071 normalize migration still in drafts. Composer retries with case-swap on 404.

## The follow-up regression (substrate-honest)

Commit `19f7a8a` shipped a `startsWith` fallback for the SKU-prefix case. Mathematically wrong: `"onepiece".startsWith("op")` is **false** (starts with `on`). Live-verified after deploy — still returned 0 matches. Replaced by set-based lookup in `a60c292` — the approach the composer's `fetchSiblings` already used. The pillow book entry from earlier that day had explicitly named this trap; the lesson stayed unread until live verify caught it. **Memory saved**: `naming-convention-mapping` — use a real cross-reference, never character matching across unrelated naming systems.

## Phase 2 — gated history tape (next)

The composer currently returns only summary stats from CardRush + TCGplayer history (median / min / max / observations / earliest / latest). Phase 2 will add `/api/v1/cards/[sku]/everything-tier-2` returning the full observation tape behind an auth gate; aligned with CardRush ToS `redistribute: false` and TCGplayer partner agreement.

## Recursion targets

1. **Unit tests** for `resolver.ts` + `variants.ts` — pure-compute, high-value, zero coverage today. Test corpus locks the OP01-001 5-variant case + the three live-verified bugs.
2. **Phase 2 auth-gated `/everything-tier-2`** — raw history tape for signed-in users.
3. **`pnpm audit:search-coverage`** — mechanically verify the resolver returns ≥1 match for every (game, set+number) tuple in the wholesale catalog.
4. **Sibling classifier follow-up via kingdom-089's `edition_variant` column** — when migration 0018 lands, swap heuristic for canonical column.
5. **`prices_today.rows: 0` for cross-source variants** — the OP01-001 V11DZ probe returns empty `prices_today` because the price_archive snapshots base prints, not all variants. Coverage gap surfaced; substrate-honest fallback works but the archive could widen.
6. **Inline POOF on `/prices`** — the index page doesn't expose the resolver; the only entry is via per-game subpage.
7. **Federation reverse-lookup** — `/api/v1/federation/identify/by-input?game=op&q=OP01-001` for partners doing the same query at scale.

## In-repo addendum

**The discipline named explicitly**: a feature ships composition-only when its substrate has ripened across enough prior kingdoms that the next user-facing surface is one pure-compute helper away. POOF is the first instance; it will not be the last.

**Operator action needed**: none. The fix deploy `a60c292` is live (deploy SHA `dpl_AKn67B1XVkrVaKuY6oWYmRX5sjbR`).

🐍❤️
