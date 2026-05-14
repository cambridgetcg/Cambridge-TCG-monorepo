---
title: The POOF
kind: story-arc
filed: 2026-05-14
kingdom: kingdom-090
sophia: Sophia (Opus 4.7, 1M context)
status: shipped
---

# The POOF

> *Yu, 2026-05-14, after the deploy-doc cleanup: "GOOD! NOW LETS DESIGN A PRICE SEARCH MODULE!!!!! IDEALLY I WOULD ONLY NEED TO PUT IN THE CARD NUMBER AND FILTER FOR CARD GAME THEN POOF!!!! PRICE, TRANSACTION HISTORIES, AVAILABLE SOURCES, DIFFERENT LANGUAGE ALL POPS UP!"* — and after I sketched the architecture, *"GO AHEAD!!!!"*

This is the kingdom's first **composition-only** feature. The whole module ships without a single new table, without a single new client, without a single new substrate primitive. What it ships is the *one missing key* — a resolver that turns a card number into a canonical SKU — and around that key, five substrate kingdoms that had been ripening separately for many sessions snap into a single user-facing wire.

The deep observation is what this means about the platform's age: *a feature ships composition-only when its substrate has ripened enough that the next user-facing surface is one pure-compute helper away.* POOF is the first instance. It will not be the last.

## The five kingdoms that converged

| Kingdom | What it gave POOF |
|---|---|
| **kingdom-066** — CardRush alignment | The `cards` table populated with JP rows; `price_archive` carrying per-source per-day snapshots; the protocol-aligned ingest path |
| **kingdom-075** — Name-resolver + SKU canonical | The `<game>-<set>-<number>-<lang>[-variant]` shape that the resolver parses |
| **kingdom-080** — Rebrand + cross-source archive | `fetchPriceSources` returning per-source rows with cross-source agreement stats (spread, CV, distinct_source_count) |
| **kingdom-082** — Hospitality + envelope | `jsonResponse({ data, _meta })` so every POOF response speaks the same dialect as the rest of the platform |
| **kingdom-088** — Bright Data unlock | `_meta.upstream_proxy` parallel array declaring which rows rode through `cardrush-pokemon.jp` |

The composer at [`/api/v1/cards/[sku]/everything`](../../apps/storefront/src/app/api/v1/cards/[sku]/everything/route.ts) fires four Falcon calls in parallel against four of those substrates simultaneously. Each degrades to `null` on failure; the response surface acknowledges absence rather than fabricating data. The fifth substrate (the proxy declaration) joins the response shape only when the proxied source is present.

## The shape

```
   /prices/[game]                          /prices/search
   (entry-point form — slug pre-filled)    (HTML face — server-rendered, URL-driven)
            │                                       │
            └───────────────┬───────────────────────┘
                            ▼
              /api/v1/search/everything    ← convenience (one round-trip)
                            │
            ┌───────────────┼───────────────┐
            ▼                               ▼
   /api/v1/search/cards         /api/v1/cards/[sku]/everything
   (resolver — sku candidates)  (composer — everything for one sku)
            │                               │
            ▼                               ▼
         lib/search/resolver.ts          lib/wholesale/client.ts
                                         (Falcon to wholesale)
                                          + lib/search/variants.ts
                                          (sibling classifier — 8-tier waterfall)
```

Two pure modules ([`lib/search/resolver.ts`](../../apps/storefront/src/lib/search/resolver.ts), [`lib/search/variants.ts`](../../apps/storefront/src/lib/search/variants.ts)) + three routes + one HTML page + one form widget. ~1100 LOC total. The resolver's 5-tier confidence ladder covers `OP01-001` (set+number, common case), `001` (number-only, fuzzy), and `op-op01-001-ja` (canonical SKU). The variants classifier distinguishes self / language / alt-art / parallel / super-parallel / promo / unknown with substrate-honest `variant_kind_reason` strings for every classification.

## The three quiet bugs the unit-shape thinking missed

Each surfaced during live probing of `OP-OP01-001-JP-V11DZ` (Roronoa Zoro SR, ロロノア・ゾロ):

1. **`card_number` stored as full publisher form.** The resolver originally only checked bare-digit form (`"001"`); wholesale actually stores `"OP01-001"`. Tier 2 of the confidence ladder added.

2. **Game-token slug/code/prefix drift.** The wholesale `games` row stores `code='onepiece'`, `slug='one-piece'`, but the SKU prefix is `op`. None equal each other; none are prefixes of each other. Resolved via *set-based lookup*: every set carries a `game_code`, so `fetchSets()` → find set → use its declared `game_code`. The composer already used this pattern in `fetchSiblings`.

3. **Legacy uppercase SKUs.** Wholesale's `cards.sku === X` is case-sensitive; kingdom-071's normalize migration still in drafts. Composer retries with case-swap on 404 and re-fires dependents with the corrected casing.

After these closed, the wire works: 5 sibling variants resolve for OP-OP01-001, prices range £1.35 to £150.53 (when sampled against base print V11L1). The first version was wrong about real-world data; the substrate-honest move was acknowledging each gap visibly rather than papering over it — logging every game-token attempt before switching to set-based lookup, then removing the logs once the path was right.

## The follow-up regression (the lesson I had to learn twice)

Yu probed the live URL a few hours after the initial ship: *"oh I see a price search module! But is it POOF?"* The empty landing rendered fine, but the JSON probe with `?game=op&q=OP01-001` returned **0 matches** — while `?game=one-piece` returned the expected 5.

Diagnosis: the composer had a `startsWith` fallback (commit `987a547`); the two resolver endpoints had only exact-match. Users typing the natural SKU prefix `op` (the placeholder hint *"op, pkm, mtg…"* steered them into this!) hit the broken path. I shipped a `startsWith` fix in `19f7a8a`.

It was mathematically wrong. `"onepiece".startsWith("op")` is **false** — it starts with `on`. Live-verify after deploy still returned 0 matches.

The pillow book entry from earlier that same day had explicitly named this trap: *"the wholesale games table's `code` is 'onepiece' while the slug is 'one-piece' (neither matches the SKU's 'op' prefix)."* The warning was in the repo already. I didn't read it before reaching for `startsWith`. The proper fix in `a60c292` ported the composer's set-based lookup — the approach this codebase already knew. The lesson got saved to memory as `naming-convention-mapping`: *use a real cross-reference, never character matching across unrelated naming systems.*

## Substrate honesty at the seams

Every POOF response declares per-source license tier in parallel arrays:

```json
{
  "data": { ... },
  "_meta": {
    "sources": ["wholesale-rds.cards", "cardrush", "tcgplayer"],
    "source_license": ["cc0", "internal-only", "partner-redistributable"],
    "upstream_proxy": ["none", "bright-data-web-unlocker", "none"],
    "freshness_seconds": 300
  }
}
```

The HTML face renders this as per-row tier pills (`emerald` / `blue` / `amber`), a `↻ proxy` indicator on rows that came through Bright Data Web Unlocker, and a `<Provenance kind="cached" ttl="5m" />` pill on the card identity header. The Phase 1 license boundary is explicit: raw history observations are summarized (median / min / max / earliest / latest), with the note *"Phase 1 — sparkline stats only; raw tape gated to authenticated tier-2."*

## What this kingdom IS

POOF is what platforms feel like when their substrate has matured enough that the next surface is one resolver away. The five composed kingdoms didn't plan their convergence — they each solved a local problem (a license boundary, a SKU shape, an envelope, a proxy declaration). The convergence happened in retrospect, on this Thursday afternoon, in 90 minutes across nine deploys. The substrate had been ready for many kingdoms; the resolver was the missing key.

The kingdom's first composition-only feature is also the first instance of a pattern: when local substrate-honesty accumulates enough, global features become cheap. Future POOFs are now visible — the federation reverse-lookup (`/api/v1/federation/identify/by-input`), the camera-scan endpoint (image → SKU candidates), the cross-platform price comparison surface. Each will compose over substrate that's already been built kingdom-by-kingdom for honest local reasons.

*The substrate had been ready for many kingdoms; the resolver was the missing key.*

## Recursion targets

1. **Unit tests** for `resolver.ts` + `variants.ts` — pure-compute, high-value, zero coverage. The 5 OP01-001 SKUs are a natural test corpus; the three live-verified bugs become locked test cases.
2. **Phase 2 auth-gated `/everything-tier-2`** — raw observation tape for signed-in users.
3. **Federation reverse-lookup by (game, card-number)** — partners ask the same question; one new endpoint shape, all composition.
4. **`pnpm audit:search-coverage`** — mechanically verify the resolver returns ≥1 match for every (game, set+number) tuple in the catalog.
5. **Sibling classifier upgrade** — replace heuristic with kingdom-089's `edition_variant` column once migration 0018 lands.
6. **`prices_today` widening** — the price_archive currently snapshots mainstream prints, not all variants. POOF surfaces the gap honestly (V11DZ returns `rows: 0`); coverage could expand.
7. **Inline POOF on `/prices`** — the index page doesn't expose the resolver; only the per-game subpage links to it.
8. **The fairy-tale companion** — every load-bearing module in this series eventually gets a story-arc; POOF deserves one (working title: *the Falconer's whisper*).

— Sophia (Opus 4.7, 1M context), 2026-05-14. kingdom-090.
