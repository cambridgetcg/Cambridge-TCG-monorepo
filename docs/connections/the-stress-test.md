---
title: The stress test — pricing, SKU, unknown games, language inclusiveness
shape: node-view
date: 2026-05-13
status: audit + design
maturity: foundation
doctrines: [substrate-honesty, transparency, meaning, inclusion]
this_entry_names:
  - packages/sku/                              # the canonical SKU package
  - packages/sku/src/games.ts                  # extended with 7 anticipated game codes this turn
  - packages/pricing/                          # the centralised pricing math
  - apps/admin/scripts/pricing-audit.ts        # the pricing drift detector (passes 0)
  - apps/admin/scripts/sku.ts                  # NEW — the SKU canonical-form drift detector
  - apps/wholesale/tools/lib/cardrush-mapper.ts # hand-rolls SKUs (drift finding)
  - apps/wholesale/tools/lib/config.ts          # per-game SKU template literals (drift finding)
  - apps/wholesale/src/lib/db/seed.ts           # 10 legacy-form literal SKUs (drift finding)
  - apps/wholesale/drizzle/0013_cards_name_translations.sql  # the language-extension column
  - apps/storefront/src/lib/universal/card.ts   # how universal-card reads SKU + multi-lang
  - apps/storefront/src/app/api/v1/bridge/route.ts  # cross-Sophia error-code drift (fixed this turn)
parents:
  - the-cardrush-alignment.md
  - the-modules.md
  - the-tributaries.md
  - the-pillow-book.md  # the running record this entry joins
self_reference: this entry names itself in `this_entry_names`; the audit it ships finds itself in any future stress test.
---

# The stress test — pricing, SKU, unknown games, language inclusiveness

> *"Stress test the foundation. Is every module and submodules working for the pricing? Is the SKU standardised? How about SKU for games we dont have yet? Also think about language inclusiveness."* — Yu, 2026-05-13.

A foundation is not a doctrine — it's the load-bearing substrate underneath the doctrines. This turn stress-tests four foundation layers: **pricing** (the math), **SKU standardisation** (the catalog's universal address), **unknown-game handling** (the openness of the catalog), and **language inclusiveness** (whose name appears on the card).

Each is a question with two halves: *does the doctrinal claim hold, and where does the actual code drift from the claim?*

The doc has five sections. **§1 Pricing** finds the math centralised and the audit healthy. **§2 SKU** finds substantial drift between the declared canonical form (`packages/sku`) and actual code (zero apps adopt it). **§3 Unknown games** ships seven anticipated codes following the speculative-subdomain pattern. **§4 Language** finds half-shipped — the schema supports multi-language names but the resolver isn't wired. **§5 Cross-Sophia drift** documents one error-code mismatch found between sister's bridge route and my data-pantry contract.

Each finding has a severity, a place, and a fix (shipped, drafted, or named).

---

## 1. Pricing — every module + submodule working?

**Verdict: healthy.** The pricing math is centralised, audited, and substrate-honestly named.

### 1.1 Module inventory

| Layer | Module | Role | Status |
|-------|--------|------|--------|
| Math | [`packages/pricing`](../../packages/pricing/) | `computePrice`, `computePriceForChannel`, `calculatePrice`, `calculatePriceByCategory`, `DEFAULTS` constants | shipped |
| Runtime config | wholesale RDS `channel_pricing` table | per-channel multipliers + margin + VAT (kingdom-049 Phase 1) | shipped |
| Daily snapshot | [`price-snapshot.ts`](../../apps/wholesale/src/lib/price-snapshot.ts) (v1) + [`price-snapshot-v2.ts`](../../apps/wholesale/src/lib/price-snapshot-v2.ts) (v2, kingdom-066) | scrape CardRush → compute → write `price_archive` + `cards.price` | both shipped |
| Mutation audit | `card_price_change_log` (delta-only) + [`logPriceChange`](../../apps/wholesale/src/lib/price-change-log.ts) | every `cards.price` change recorded | shipped |
| Historical archive | `price_archive` (one row per card×date) | the canonical history | shipped |
| Storefront mirror | `card_price_history.spot_gbp` | per-(sku, captured_on) | shipped |
| Public surfaces | [`/api/v1/universal/card/[sku]`](../../apps/storefront/src/app/api/v1/universal/card/[sku]/route.ts), [`/api/at/[date]/card/[sku]`](../../apps/storefront/src/app/api/at/[date]/card/[sku]/route.ts), [`/market/[sku]`](../../apps/storefront/src/app/market/[sku]/page.tsx), [`/cards/[sku]/market`](../../apps/storefront/src/app/cards/[sku]/market/page.tsx) | every surface goes through the same `card_price_history` or `price_archive` query | shipped |
| Audit | `pnpm audit:pricing` ([`apps/storefront/scripts/pricing-audit.ts`](../../apps/storefront/scripts/pricing-audit.ts)) | catches hardcoded constants, silent fallback, mutation drift | shipped |

### 1.2 What the audit reports

```
$ pnpm audit:pricing
1. Computation surfaces      — No off-canonical pricing math found.
2. Silent fallback           — No silent fallback to JS DEFAULTS detected.
3. History-table redundancy  — No history-table redundancy detected.
4. Price-change lifecycle    — Lifecycle log is declared.
5/6. Storefront coverage     — Every customer-facing price surface ships Provenance + WhyLink.
7. Mutator inventory         — 3 paths mutate cards.price (all use the helpers).

Total drift findings: 0
```

**Three known mutators of `cards.price`:**
1. `apps/wholesale/src/app/api/cards/[id]/route.ts` — admin manual edit
2. `apps/wholesale/src/lib/price-snapshot.ts` — daily v1 cron
3. `apps/wholesale/src/lib/price-snapshot-v2.ts` — daily v2 cron (kingdom-066)

All three import `calculatePriceByCategory` or `computePrice` from `@cambridge-tcg/pricing`. None hand-rolls the math.

### 1.3 Edge cases the audit doesn't yet cover

Worth naming honestly even if no fix lands this turn:

- **Negative / zero prices.** `apps/wholesale/src/app/api/orders/route.ts:59` checks `card.price <= 0` and rejects — good. But `calculatePriceByCategory` itself doesn't guard against zero/negative JPY input; a corrupted upstream returning `priceJpy: 0` could produce `baseGbp: 0` and ship a free card. Substrate-honesty fix: add a `MIN_REASONABLE_JPY` floor in `@cambridge-tcg/pricing` that returns `null` for inputs below; callers handle null.
- **Multi-currency.** The current pipeline assumes JPY input + GBP output. When TCGplayer (USD) or Cardmarket (EUR) ingest ships, the `cards.cardrush_jpy` column name is misleading. Phase A migration (kingdom-066) added `source_currency` to `price_archive` per-row — good. But `cards.cardrush_jpy` still column-codes the assumption. A future migration renames to `source_price` + `source_currency` per row.
- **FX rate provenance.** `fetchGbpJpyRate()` returns one number; we don't record *which source* (Bank of England, OpenExchangeRates, fallback?) or *which timestamp*. Leak #8 in [`the-archive.md`](./the-archive.md) Part B. Recursion target: add `gbp_jpy_rate_source` + `gbp_jpy_rate_fetched_at` columns.
- **VAT consistency.** VAT_MULTIPLIER lives in `packages/pricing/DEFAULTS`. Every consumer pulls from there. The audit's check 2 (silent fallback) ensures no consumer hardcodes 1.20. ✓

**No P0 findings.** Pricing is the healthiest of the four foundation layers stress-tested.

---

## 2. SKU standardisation — declared vs actual

**Verdict: substantial drift. The spec exists; the apps don't use it.**

### 2.1 The declared canonical form

[`packages/sku`](../../packages/sku/) (kingdom-050's standardisation ship) declares:

```
<game>-<set>-<number>-<lang>[-<variant>]

  game:    registered code (op, pkm, mtg, ygo, …)  — lowercase
  set:     publisher set code                       — lowercase
  number:  collector number                         — lowercase
  lang:    ISO 639-1                                — lowercase (ja, en, zh, ko, fr, …)
  variant: optional, hyphen-joined tokens           — lowercase
```

Example: `op-op01-001-ja`, `pkm-svobf-006-en-rev`, `mtg-otj-001-en-etched`.

The package ships `parseSku` (strict; rejects non-canonical), `normalizeSku` (legacy → canonical coercion), `buildSku` (typed builder), `isGameCode` (game-code guard).

### 2.2 What the actual code does

I shipped a new audit this turn — `pnpm audit:sku` — that scans all 1,056 source files in the workspace for SKU patterns. First-run findings:

```
$ pnpm audit:sku

  files scanned:                1056
  hand-rolled SKU assembly:     21 hits across 8 files
  legacy-form literal strings:  10 hits in 1 file
  @cambridge-tcg/sku adopters:  3 files  (only in packages/data-ingest)

  Migration target: app code adopts @cambridge-tcg/sku helpers
  (buildSku, parseSku, normalizeSku) at every SKU read/write site.
  Currently 3 of 1056 scanned files. (0.28% adoption.)
```

**The findings concretely:**

- **Hand-rolled SKU assembly** in [`apps/wholesale/tools/lib/cardrush-mapper.ts`](../../apps/wholesale/tools/lib/cardrush-mapper.ts) (`\`${base}-V${encodeProductId(...)}\``), [`apps/wholesale/tools/lib/config.ts`](../../apps/wholesale/tools/lib/config.ts) (per-game template literals — `\`${prefix}-${cardNumber}-JP\``), and 6 other files.
- **10 literal SKUs** in [`apps/wholesale/src/lib/db/seed.ts`](../../apps/wholesale/src/lib/db/seed.ts) hard-coded as `"OP-OP01-001-JP"` ... `"OP-OP01-010-JP"`.
- **0.28% adoption** of `@cambridge-tcg/sku` — only the data-ingest package uses it.

### 2.3 The shape of the drift

| Layer | Form in use | Canonical | Status |
|-------|-------------|-----------|--------|
| Wholesale `cards.sku` | `OP-OP01-001-JP` (UPPERCASE + non-ISO lang) | `op-op01-001-ja` | drifted |
| Wholesale tooling output | `\`${prefix}-${cardNumber}-JP\`` (template) | `buildSku({ game, set, number, lang })` | drifted |
| Storefront `card_set_cards.sku` | mirrors wholesale (uppercase) | canonical | drifted |
| Scryfall ingest normaliser | `mtg-otj-001-en` (canonical) | canonical | ✓ |
| Pokémon TCG API ingest normaliser | `pkm-svobf-001-en` (canonical) | canonical | ✓ |
| CardRush normaliser | uses `inferred_sku` from caller — caller passes uppercase | canonical | drifted via caller |

**The two SKU vocabularies coexist today.** The new data-ingest sources (scryfall, pokemon-tcg-api, ygoprodeck) produce canonical SKUs. The legacy wholesale tooling produces uppercase SKUs. Both write to `card_set_cards.sku` (storefront) and `cards.sku` (wholesale) — neither column has a `CHECK` constraint enforcing form, so both forms can coexist row-by-row.

### 2.4 Why this matters

Three downstream consequences:

1. **`/api/v1/universal/card/[sku]` is case-sensitive.** A partner who reads `op-op01-001-ja` from the catalog and queries it against `card_set_cards.sku WHERE sku = 'op-op01-001-ja'` may miss legacy rows stored as `OP-OP01-001-JP`. The platform's public address space is split.
2. **The federation primitive's content_hash** depends on canonicalised input. Two scrapes of the same card with different SKU casing produce different `@content_hash` values — false federation mismatches.
3. **The audit catches it.** That's already a substrate-honesty win — *we know what's drifted because the audit names it.*

### 2.5 Fix path (drafted, not shipped)

A future kingdom can:

1. **One-shot migration** — `UPDATE card_set_cards SET sku = lower(sku)` + a normalization pass that re-maps "JP" → "ja", "CN" → "zh", "KR" → "ko" via `packages/sku` `normalizeSku()`. Append-only; rollback by snapshotting before.
2. **Add a `CHECK` constraint** to `card_set_cards.sku` and `cards.sku` enforcing the canonical regex.
3. **Migrate the seed files** to use `buildSku({ game: "op", set: "op01", number: "001", lang: "ja" })`.
4. **Migrate `apps/wholesale/tools/lib/config.ts`** to call `buildSku` instead of template literals.
5. **Re-run `pnpm audit:sku`** — expect adoption count to climb toward 1,056.

This is a focused half-day of mechanical work, not a redesign. The substrate is ready; the apps need to adopt.

---

## 3. Unknown games — the catalog's openness

**Verdict: strict by design; extended this turn.**

### 3.1 What happens when an unregistered game's SKU arrives

`parseSku("swu-twi-001-en")` (Star Wars Unlimited, hypothetically) returns **null** — the parser is strict, and `swu` wasn't in `GameCode` before this turn.

This means:
- A partner submitting a Star Wars Unlimited price record gets `INVALID_SKU` from the data-pantry.
- The wholesale ingest pipeline rejects the row to quarantine.
- The card never makes it into the catalog.

**This is correct strict-mode behaviour.** But it's *also* a barrier: the platform can't accept market data for a TCG until someone edits `GAMES` in `packages/sku/src/games.ts`.

### 3.2 The extension I shipped this turn

I extended `packages/sku/src/games.ts` with **seven anticipated game codes** following the same pattern as the speculative cardrush subdomains (kingdom-064):

| Code | Game | Publisher | Status |
|------|------|-----------|--------|
| `swu` | Star Wars Unlimited | Fantasy Flight Games | anticipated (`confirmed: false`) |
| `sor` | Sorcery: Contested Realm | Erik Olofsson | anticipated |
| `alt` | Altered TCG | Equinox | anticipated |
| `rft` | Riftbound | Riot Games (2025+) | anticipated |
| `rsh` | Yu-Gi-Oh! Rush Duel | Konami | anticipated |
| `pkp` | Pokémon Pocket | TPCi | anticipated |
| `gen` | Genshin Impact TCG | HoYoverse | anticipated |

Each entry carries `confirmed: false`. The new `isConfirmedGameCode()` guard + `CONFIRMED_GAME_CODES` / `ANTICIPATED_GAME_CODES` exports let downstream code distinguish.

**Substrate-honest fix:** anticipated games are now ingestable. When the first SKU lands and confirms market presence, the operator flips `confirmed: true` in the same commit that adds the first card. Pattern mirrors the cardrush subdomain promotion procedure.

### 3.3 The registration protocol

To add a game beyond these seven:

1. Append to `GameCode` union + `GAMES` registry in [`packages/sku/src/games.ts`](../../packages/sku/src/games.ts).
2. Set `confirmed: false`.
3. Run `pnpm audit:tributaries` — game-validity check passes when ingested SKUs use the new code.
4. When first real card lands, flip `confirmed: true` + add to data-ingest as needed.

No methodology page or platform-wide change required. The catalog stays open to extension.

### 3.4 Why "anticipated" matters

A partner submitting Sorcery prices a year from now doesn't need Cambridge TCG to "add Sorcery support" first. The code is already there; the first scrape confirms. **The platform's openness is now substrate-honest about expected growth.**

---

## 4. Language inclusiveness — whose name on the card

**Verdict: half-shipped. Schema supports it; resolver doesn't.**

### 4.1 What the data declares

The `GAMES` registry already lists per-game language support:

```ts
op:  { languages: ["ja", "en", "zh", "ko"], ... }
pkm: { languages: ["en", "ja", "zh", "ko", "fr", "de", "es", "it", "pt"], ... }
mtg: { languages: ["en", "ja", "zh", "ko", "fr", "de", "es", "it", "pt", "ru"], ... }
ygo: { languages: ["en", "ja", "zh", "ko", "fr", "de", "es", "it"], ... }
```

10 distinct languages across the four major games. Plus the canonical SKU's `lang` field already addresses each printing separately (`op-op01-001-ja` ≠ `op-op01-001-en`).

### 4.2 What the schema supports

[`apps/wholesale/drizzle/0013_cards_name_translations.sql`](../../apps/wholesale/drizzle/0013_cards_name_translations.sql) added a `cards.name_translations JSONB` column in kingdom-051 Phase 6:

```jsonb
{ "zh": "魔人布欧", "ko": "마인 부우", "es": "Buu", "jp_romaji": "Mahjin Buu" }
```

Sparse JSONB keyed by ISO 639-1; populated per-card as translators (human or machine) supply entries.

### 4.3 What the rendering does

**Where it's actually wired:**

- The schema column exists.
- `cards.name` stays the Japanese original (substrate-honest).
- `cards.name_en` stays the English translation.
- `cards.name_translations` is empty for almost every card today.

**Where it's NOT wired:**

- No resolver in the storefront UI yet. The canonical fallback chain (`name_translations[lang] || name_en || name || card_number`) is named in the migration comment but not implemented in any consumer.
- `/account/preferences` doesn't yet have a "display script" picker (mentioned in the migration as "Phase 6.5" — not yet shipped).
- The math-mirror endpoint `/api/v1/universal/card/[sku]` returns `card_name` (the Japanese-or-English fallback) — doesn't honour the requesting client's `Accept-Language` header.
- No RTL handling for Arabic or Hebrew printings — but no Arabic/Hebrew TCGs are in scope today.
- No transliteration column (romanji of Japanese names, pinyin of Chinese, etc.) — useful for screen-readers + agent processing.

### 4.4 Why this matters

The four most-played TCGs ship in **9–10 languages each**. Storefront serves them in **2 languages** (JA + EN fallback). A Korean-speaking collector reading the platform sees English fallback for a card the publisher prints in Korean. The substrate *could* serve them; the resolver doesn't yet.

### 4.5 Fix path (drafted, not shipped)

Three phases:

1. **Resolver helper** in `apps/storefront/src/lib/cards/name.ts` — accepts `(card, preferredLangs[])` and returns the best match through the fallback chain.
2. **`/account/preferences`** field for `display_languages: string[]` ordered by preference.
3. **Math-mirror endpoint** reads `Accept-Language` header + `name_translations` to emit per-language names.

Plus the structural addition:
- A `name_romanji` / `name_pinyin` column for transliteration — useful for screen-readers, search, and agents that don't render CJK glyphs.

None of these are blockers today; all are substrate-honestly named as missing.

---

## 5. Cross-Sophia drift — one finding (fixed this turn)

The stress test surfaced one real drift between sister's parallel work and the data-pantry contract.

### 5.1 The bridge route

Sister shipped [`/api/v1/bridge/route.ts`](../../apps/storefront/src/app/api/v1/bridge/route.ts) (part of kingdom-068's the-collective work — the universal-language bridge between two beings). It correctly used `jsonResponse` + `errorResponse` from `@/lib/data-pantry`. But the error codes were **gRPC-style** (`"invalid_argument"`, `"not_found"`, `"not_public"`) where the data-pantry's typed `ErrorCode` enum uses SCREAMING_SNAKE (`"INVALID_INPUT"`, `"NOT_FOUND"`, etc.).

The freshness key was `"live"` — not a member of the `FreshnessKey` union (which only has `catalog`, `price_current`, `price_historical`, `market_signal`, `status`, `methodology`, `identity`, `adopters`).

These were latent typecheck errors — picked up only when I touched `packages/sku` for the GAMES extension, forcing the workspace typecheck.

### 5.2 Fix shipped

In `/api/v1/bridge/route.ts`:
- `"invalid_argument"` → `"INVALID_INPUT"`
- `"live"` → `60` (custom number; 60s freshness for live-computed bridge scores)
- `e.code === "not_found"` → maps to `"NOT_FOUND"`, status 404
- `e.code === "not_public"` → maps to `"INSUFFICIENT_TIER"`, status 403
- Other bridge-error codes → `"INVALID_INPUT"`, status 400

The bridge module's own `BridgeError` class retains its gRPC-style codes internally (sister's design); the mapping to canonical codes happens at the error-response boundary.

### 5.3 What this teaches

Two Sophias building in parallel will produce coherent work most of the time, but error-code conventions need an explicit shared substrate. Now they have one — `@cambridge-tcg/data-spec` exports the canonical `ERROR_CODES`. The next contributor reads from there.

**Substrate-honest finding for future audits:** consider extending `audit:tributaries` (or a new `audit:envelope`) to scan `jsonResponse({ freshness })` calls and `errorResponse({ code })` calls to validate strings against the spec. Recursion target.

---

## 6. Summary table — what the stress test found

| Layer | Verdict | Drift findings | Audit | Fix path |
|-------|---------|----------------|-------|----------|
| **Pricing** | healthy | 0 from `audit:pricing` | shipped | edge cases named (§1.3); no urgent fix |
| **SKU canonicalisation** | substantial drift | 21 hand-rolled + 10 legacy literal + 0.28% adoption | **new `pnpm audit:sku` shipped** | migration drafted (§2.5); SQL one-shot + tooling rewrite |
| **Unknown games** | strict by design | 0 registered games for ~7 anticipated TCGs | tributaries audit | **extended this turn** — 7 new anticipated codes; pattern mirrors cardrush subdomains |
| **Language inclusiveness** | half-shipped | resolver missing; 0% display-language preference coverage | none yet | fix path drafted (§4.5); needs `apps/storefront/src/lib/cards/name.ts` |
| **Cross-Sophia drift** | one finding | bridge route used gRPC-style error codes | typecheck caught | **fixed this turn** (§5.2) |

---

## 7. Recursion targets

Ordered by leverage × tractability:

1. **Migrate `apps/wholesale/src/lib/db/seed.ts`** to use `buildSku()` — closes 10 literal-form drift findings in one file.
2. **Migrate `apps/wholesale/tools/lib/config.ts`** per-game generators to use `buildSku()` — closes the largest source of hand-rolled assembly.
3. **One-shot SQL migration** `UPDATE card_set_cards SET sku = lower(normalizeSku(sku))` — coerces the legacy uppercase form to canonical. Append a `CHECK` constraint after.
4. **Language resolver** at `apps/storefront/src/lib/cards/name.ts` — reads `name_translations` + `Accept-Language` for the math-mirror surface.
5. **`/account/preferences.display_languages`** column — user opt-in for non-English display.
6. **Audit: envelope-codes** — scan `jsonResponse({ freshness })` and `errorResponse({ code })` calls against the data-spec enums. Catches future cross-Sophia drift before it lands.
7. **`name_romanji` / `name_pinyin` columns** — transliteration for screen-readers + agents.
8. **`MIN_REASONABLE_JPY` floor** in `@cambridge-tcg/pricing` to guard against corrupted-zero upstream rows.
9. **`gbp_jpy_rate_source` + `gbp_jpy_rate_fetched_at` columns** on `price_archive` — FX provenance.
10. **First-ingest confirmation flow** for anticipated games — when an anticipated `confirmed: false` game gets its first canonical SKU written, emit a lifecycle event + remind the operator to flip the flag.

---

## 8. What this entry names — substrate-honestly

Four foundation layers stress-tested (pricing, SKU, unknown games, language). One new audit shipped (`pnpm audit:sku`, 10th in the family). One package extended (`packages/sku` with 7 anticipated game codes + `confirmed` flag + `isConfirmedGameCode` guard). One cross-Sophia drift fixed (the bridge route's error codes). Ten recursion targets ordered.

The foundation is **healthy where named** and **honestly drifted where the spec exists but the apps don't adopt**. The pricing layer is the load-bearing example: a centralized package + a runtime audit + a per-mutator inventory + a mutation log all hold. SKU is the load-failing example: a centralized package shipped but 99.72% of files don't import it.

The stress test does what stress tests do — *names the load each layer can carry, and names the points where the load isn't yet carried.* The audit ships; the fix path is drafted; the operator decides cadence.

This entry names itself in `this_entry_names`. It is named by [`the-cardrush-alignment.md`](./the-cardrush-alignment.md) (whose Phase A migration is the precedent for the SKU one-shot migration) and [`the-modules.md`](./the-modules.md) (whose dependency-graph this validates). It will be named by the future migration commits that close each drift.

— Sophia, 2026-05-13.
