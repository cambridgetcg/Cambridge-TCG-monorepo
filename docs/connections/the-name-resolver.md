---
title: The name resolver — substrate-honest multi-language card names
shape: node-view
date: 2026-05-13
status: shipped (helper) + drafted (migration)
maturity: engineering
doctrines: [substrate-honesty, transparency, meaning, inclusion]
kingdom: kingdom-075
this_entry_names:
  - apps/storefront/src/lib/cards/name.ts                            # NEW — the resolver
  - apps/storefront/src/lib/universal/card.ts                        # buildUniversalCard now accepts preferredLangs
  - apps/storefront/src/app/api/v1/universal/card/[sku]/route.ts     # Accept-Language wired
  - apps/storefront/drizzle/drafts/0098_card_name_translations.sql.draft  # NEW — Phase 1 migration
parents:
  - the-stress-test.md
  - the-introduction.md
  - the-universal-language.md
self_reference: this entry names itself in `this_entry_names`; the resolver it describes is the gap this entry closes.
---

# The name resolver — substrate-honest multi-language card names

> *"Go for the language resolver."* — Yu, 2026-05-13.

The stress test ([`the-stress-test.md`](./the-stress-test.md), kingdom-069 §4) named the gap: the four major TCGs publish in **9–10 languages each**; the storefront serves them in **2** (English fallback for Korean-speaking collectors, no resolver for Pokémon's Spanish/French/German printings). The schema column `cards.name_translations JSONB` shipped in kingdom-051 Phase 6 — *no consumer was wired*. Sister's recent on-ramp work ([`the-introduction.md`](./the-introduction.md) #22) opens doors to **non-native-intelligence beings** — but if they then can't read a Korean card name in Korean, the on-ramp is one-sided.

This entry closes the gap. The resolver is **a pure function** that takes a card record + a preferred-language list and returns the best-match name plus substrate-honest provenance for which language won and why. The math-mirror endpoint `/api/v1/universal/card/[sku]` now reads `Accept-Language` (+ optional `?lang=` query) and serves the resolved name per request.

The entry has four parts: §1 the resolver's shape; §2 the wiring through `buildUniversalCard`; §3 the SQL migration drafted alongside; §4 what's queued.

---

## 1. The resolver — `apps/storefront/src/lib/cards/name.ts`

A pure module. Two exported functions.

### 1.1 `parseAcceptLanguage(header)`

RFC 4647-lite parser. Takes an HTTP `Accept-Language` header, returns a ranked list of lowercase language tags (q-value ordered, q=0 entries dropped).

```ts
parseAcceptLanguage("ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7")
// → ["ko-kr", "ko", "en-us", "en"]
```

Empty header → `[]`. Wildcard `"*"` → `[]`. Substrate-honest about absence.

### 1.2 `resolveCardName(record, preferredLangs)`

The resolver. Picks the best name from the available data given the caller's preferences. Returns a `ResolvedName` with five fields:

```ts
{
  resolved: "로로노아 조로",             // the chosen string
  resolved_lang: "ko",                    // ISO 639-1 of the choice
  resolved_from: "preferred",             // how the choice was made
  fallback_chain: [                       // languages tried in order
    { lang: "ko", available: true },
  ],
  available_languages: ["en", "ja", "ko"], // what the record has
}
```

The `resolved_from` field is the substrate-honesty:

- `"preferred"` — matched the caller's first-choice language
- `"preferred_alt"` — matched a lower-priority preferred language
- `"name_en"` — fell through to the dedicated English column
- `"default"` — fell through to `card_name` (platform default; language not declared)
- `"missing"` — nothing usable found (returns empty string)

### 1.3 The fallback chain

The resolver expands region-tagged preferences to their base (`ko-KR` → also try `ko`), preserves order, dedupes. Then for each expanded preference:

1. Check `record.name_translations[lang]` — return if present + non-empty.
2. **Special case for `en`**: also honour `record.name_en` even if `name_translations` lacks `en`.

After all preferences fail:
3. Try `record.name_en` (so a caller with no preferences still gets English when available).
4. Fall through to `record.card_name` (the platform default — could be JP or EN; we don't claim a code).
5. Empty record → empty resolved + `resolved_from: "missing"`.

Every step is recorded in `fallback_chain`. A caller reading the response sees which languages were tried and which were available.

### 1.4 What the resolver does NOT do

- Mutate the record.
- Cache anything (callers cache at the response layer).
- Transliterate (placeholder `transliterate()` exported for future romanji/pinyin work — returns `null` today).
- Pick on the caller's behalf without a preference list (returns `default` instead of guessing).

---

## 2. Wiring — `buildUniversalCard` + the route

### 2.1 `buildUniversalCard(sku, density, preferredLangs?)`

The math-mirror builder gains an optional `preferredLangs: string[]` parameter. Pass `[]` (default) to get the platform default; pass `["ko", "ja"]` to honour those preferences in order.

The `name` field of the response goes from:

```jsonc
"name": {
  "natural_token": "Roronoa Zoro",
  "_note": "natural-language; cannot be reconstructed from structure"
}
```

to:

```jsonc
"name": {
  "natural_token": "로로노아 조로",
  "resolved_lang": "ko",
  "resolved_from": "preferred",
  "available_languages": ["en", "ja", "ko"],
  "_note": "natural-language; cannot be reconstructed from structure"
}
```

The full `fallback_chain` is emitted only at `density=saturated`. Sparse + normal density modes keep the response lean.

### 2.2 The route reads `Accept-Language` + `?lang=`

[`/api/v1/universal/card/[sku]`](../../apps/storefront/src/app/api/v1/universal/card/[sku]/route.ts) precedence:

```
?lang=ko  (explicit override, single value)
   ↓
Accept-Language: ko-KR,ko;q=0.9,en;q=0.8
   ↓
[]  (platform default)
```

Explicit `?lang=` wins; the resolver then falls through to the `Accept-Language` chain if the override isn't available. Substrate-honest: the response's `resolved_from` field tells the caller which preference matched.

### 2.3 `Vary: Accept-Language` cache header

The response gains `Vary: Accept-Language` so HTTP caches keep per-language variants distinct. Without it, the first response (in whatever language) would be served to all subsequent callers regardless of their preferences.

### 2.4 The query degrades gracefully

`fetchCardRow()` SELECTs `name_en` + `name_translations` via `to_jsonb(csc.*) -> 'name_translations'` instead of direct column reference. When migration 0098 hasn't applied yet (and the columns don't exist), the JSONB extraction returns `null` instead of throwing. **The wire works today; the data fills in when the migration applies.**

---

## 3. The SQL migration — drafted

[`apps/storefront/drizzle/drafts/0098_card_name_translations.sql.draft`](../../apps/storefront/drizzle/drafts/0098_card_name_translations.sql.draft) — operator-applied.

Adds two columns to `card_set_cards`:

```sql
ALTER TABLE card_set_cards
  ADD COLUMN IF NOT EXISTS name_translations JSONB,
  ADD COLUMN IF NOT EXISTS name_en VARCHAR(300);

CREATE INDEX IF NOT EXISTS idx_card_set_cards_name_translations
  ON card_set_cards USING GIN (name_translations);
```

Plus column COMMENTs naming the resolver as the consumer + the wholesale source.

**Backfill is separate.** The migration doesn't auto-sync from wholesale's `cards.name_translations` because:
1. The wholesale and storefront RDS are separate databases (no FDW today).
2. A backfill script (or a future ingest pipeline) does the cross-DB sync.

Until backfill runs: the column exists, the resolver gracefully returns `card_name`, and partners reading the math-mirror response see `available_languages: []` — substrate-honest about the data state.

---

## 4. What's queued (recursion targets)

Ordered by leverage × tractability:

1. **Apply the migration** — `cp drafts/0098_*.sql.draft drizzle/0098_*.sql && pnpm db:push`. Substrate-honest delta: columns exist, no data yet.
2. **Backfill script** — one-off pass that pulls wholesale's `cards.name_translations` into storefront's `card_set_cards`. Could be a cron, an admin job, or a one-time `tsx` script.
3. **`/account/preferences.display_languages`** — user-set ordered list. Today the resolver reads only `Accept-Language` + `?lang=`. Adding the preference column means logged-in users get their declared languages even without a configured browser.
4. **Transliteration columns** — `name_romanji` / `name_pinyin` / `name_hangulja` for screen-readers + agents that can't render CJK glyphs. The `transliterate()` stub in `name.ts` is the future entrypoint.
5. **`/api/v1/cards/[sku]/names`** — public endpoint that lists ALL known translations for a SKU. Substrate-honest catalog of what's available; lets a partner know whether a translation exists before requesting it.
6. **Wire the temporal endpoint** — `/api/at/[date]/card/[sku]` should honour the same precedence. Two-line addition.
7. **Wire `/cards/[sku]/market`** — the HTML mirror surface for the trader. Today it shows `card_name` only; should honour preferences.
8. **Cross-cultural ingest** — when the `data-ingest` pipelines run for Pokémon/MTG, capture per-language names. Today Scryfall's `printed_name` is captured but not preserved per-language.
9. **Audit: name-resolver coverage** — count storefront `card_set_cards` rows where `name_translations IS NOT NULL` and compute coverage % per game. The number tells the platform how multilingual it is.
10. **Math-mirror universal name** — sister's S23 work flagged `name` as `_note_opaque` (natural-language; cannot be reconstructed). The resolver adds **language provenance** to the opaque field. A future iteration could add a content-hash over the *resolution itself* so two callers seeing different names know they got different views of the same card.

---

## 5. What this entry names — substrate-honestly

One pure helper module (~280 LOC), one route wired, one schema migration drafted, three layers updated in `buildUniversalCard` (row type + query + response shape). The math-mirror endpoint can now serve a Korean-speaking collector's request in Korean *when the data is populated* — today it gracefully returns the platform default; tomorrow (after the migration + backfill) it returns the right script.

**The wire is ready; the data fills in over time.** Substrate-honesty: the response's `available_languages: []` declares the absence today; partners and agents know exactly what coverage exists without guessing.

The four components compose with sister's recent work:
- [`the-universal-language.md`](./the-universal-language.md) (#21, sister) — math as bridge across asymmetric beings; this resolver is the *bridge for the natural-language field* sister's doctrine flagged opaque.
- [`the-introduction.md`](./the-introduction.md) (#22, sister) — on-ramp for non-native-intelligence; the introduction's seven engagement doors now actually serve those beings' languages when they walk through.
- [`the-stress-test.md`](./the-stress-test.md) (#20, mine) §4 — the gap this resolver closes.
- [`the-drift-reconciliation.md`](./the-drift-reconciliation.md) (#23, mine) — the SKU canonicalisation is upstream of this work; canonical SKUs are how a partner addresses a card; the resolver is how they read it back.

This entry names itself in `this_entry_names`; named by the stress test (which found the gap), by the introduction + universal-language (which depend on inclusive surfaces), by the SKU drift reconciliation (the parallel canonicalisation effort). It will be named by the migration commit that applies 0098 + by the backfill script that fills the data.

— Sophia, 2026-05-13. kingdom-075.
