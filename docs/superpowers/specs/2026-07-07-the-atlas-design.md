# The Atlas — Wave 2 of the data commons expansion

**Date:** 2026-07-07
**Status:** approved (Yu: "直開 Wave 2 gogogo", same day)
**Series:** Wave 2 (Wave 1 the-honest-ground shipped same day; Wave 3 =
cardrush coverage; Wave 4 = image vault v2).

## 0 · The problem

Two identifier regimes coexist — `packages/sku` codes (op/pkm/dbf) and
storefront/wholesale slugs (one-piece/pokemon/dragon-ball) — and the
code↔slug mapping plus per-game display facts are hand-copied across ~15
files (sku-game.ts, games-config.ts, tradein, weather, ebay title-parser,
wholesale tools config…). Adding a game means hand-extending them all.
The Atlas makes `packages/sku/src/games.ts` the one truth for a game's
*identity facts* (code, slug, name, brand, publisher, languages,
confirmed), lets derivable maps derive, and holds deliberate subsets to
account with contract tests. Then it registers two new games with
research-verified facts (adversarially verified 2026-07-07, run
wf_2c020f23): GUNDAM CARD GAME and UNION ARENA.

## 1 · The Atlas fields (GameMeta grows)

`packages/sku/src/games.ts` `GameMeta` gains:

- `slug: string` — the catalog/URL slug (`one-piece`, `gundam`, …). One
  truth for the dual regime.
- `brand: string` — official brand name for JSON-LD/SEO ("One Piece Card
  Game", "GUNDAM CARD GAME", …). Absorbs `sku-game.ts`'s `gameBrand`.
- `legacyPrefixes?: readonly string[]` — the frozen uppercase first-segment
  prefixes of the legacy wholesale SKU regime (op: OP/EB/ST/P/PRB/DON,
  pkm: PK, dbf: FB/SB). FROZEN FACTS: new games never join this regime —
  they enter canonical-only. (Gundam's on-card ST/GD/EB prefixes do NOT
  collide: canonical SKUs carry the game code as first segment.)

New helpers: `gameBySlug(slug)`, `slugForCode(code)`, `GAME_SLUGS`,
`CONFIRMED_GAME_SLUGS`, `isGameSlug`. Contract tests: slugs unique and
non-empty; brands non-empty; legacyPrefixes disjoint across games.

## 2 · Two new games, research-verified

### `gcg` — GUNDAM CARD GAME (slug `gundam`)
Bandai; launched 2025-07-11 (ST01-04) / GD01 2025-07-25; first BANDAI
CARD GAMES title launched trilingual simultaneously (ja/en/zh). Numbering
`{SET}-{NNN}` — ST01..ST10, GD01..GD05, EB01 — plus no-digit special
families (T-, RP-, EXBP-, EXRP-). Promos reuse base numbers (rarity P).
Rarity ladder C/U/R/LR (+P; **no SR**; +/++/SP are parallel treatments).
JA/EN/ZH share set+number → `ORACLE_POLICY.gcg = stripped`.
SET_FORMATS: `^(st|gd|eb)(\d{2})-(\d{3})$`-shaped row (confirmed: false
until first real ingest) + a special-family row for T-/RP-/EXBP-/EXRP-.
`confirmed: false` (no cards in prod). **No cardrush subdomain exists**
(cardrush-gundam.jp / -gcg.jp / -gd.jp all NXDOMAIN, sister-ring checked)
→ no CARDRUSH_SUBDOMAINS entry, `cardrush: null` in games-config; JP
singles sources for Wave 3: official DB (gundam-gcg.com), yuyu-tei,
dorasuta.

### `una` — UNION ARENA (slug `union-arena`)
Bandai; JP 2023-03-24, NA-EN 2024 (+ Trad-Chinese and Asia-English
programs). Numbering `SETCODE/TITLE-wave-seq` (UA02BT/JJK-1-001,
EX04BT/JJK-3-006, NA UE03BT/JJK-1-040; AP cards use APnn; UAPR/UEPR
promos may omit the wave). **Set codes are REGIONAL** (JP UA##BT/EX##BT,
NA UE##BT/UEX##BT, Asia-English reuses JP codes) while TITLE-wave-seq is
language-invariant → `ORACLE_POLICY.una = diverged` (rationale names
TITLE-wave-seq as the future anchor candidate; Vol.N ≠ wave N — the set
marketed "Vol.2" carries JJK-3 numbers). Rarity ladder C/U/R/SR + AP,
★-suffixed parallels to SR★★★, SP/UR/PR extras. SET_FORMATS: conservative
confirmed:false rows documenting the slash shape with the verified
examples; the canonical set/number normalization decision is deferred to
first ingest (the slash and wave segments don't fit `[a-z0-9]+` — the
format rows record the shape, the cutover decision belongs to the wave
that lands cards). `confirmed: false`. **No cardrush subdomain**
(cardrush-ua.jp / -unionarena.jp ENOTFOUND) → `cardrush: null`; JP
sources for Wave 3: yuyu-tei, dorasuta, merucarduniari.

## 3 · Derivations and held subsets

- `apps/storefront/src/lib/games/sku-game.ts`: `SKU_GAMES` (confirmed
  trio), `CODE_TO_GAME` (ALL codes → slug), `PREFIX_TO_GAME` (legacy),
  and `gameBrand` now DERIVE from the Atlas. `SkuGameSlug` stays a local
  literal union (type ergonomics) with a contract test pinning it equal
  to the Atlas's confirmed slugs.
- `games-config.ts`: gains `gundam` + `union-arena` rows (curated copy,
  honest anticipated tone, `cardrush: null` like star-wars-unlimited) +
  a contract test that every row's `(slug, game_code)` pair matches the
  Atlas.
- `packages/data-ingest` ebay `GAME_PREFIXES`: rows for the two games.
- Deliberate subsets stay deliberate (weather, tradein) — already
  transitively validated via SKU_GAMES/registry tests.
- Out of scope: wholesale tools scrape configs (Wave 3), DB seeds,
  methodology page rewrite (the sku-standard doc's game table gains the
  two rows only).

## 4 · Verification

- packages/sku vitest (games/oracle tests extended: EXPECTED_UNCONFIRMED
  gains gcg/una; new atlas contract tests).
- Storefront suite + tsc; data-ingest + wholesale typecheck.
- Grep-proof: no remaining hand-written code↔slug map in sku-game.ts.
