---
title: The drift reconciliation — wholesale SKU canonicalisation, wired
shape: node-view
date: 2026-05-13
status: shipped (code) + drafted (SQL)
maturity: engineering
doctrines: [substrate-honesty, transparency, meaning, creation]
this_entry_names:
  - apps/wholesale/src/lib/sku.ts                          # NEW — the compat module
  - apps/wholesale/tools/lib/config.ts                     # migrated to buildSku()
  - apps/wholesale/tools/lib/cardrush-mapper.ts            # migrated to appendSkuVariant()
  - apps/wholesale/src/lib/db/seed.ts                      # 10 literals migrated to buildSku()
  - apps/wholesale/src/lib/s3.ts                           # parseSkuGame + decomposeSku migrated
  - apps/wholesale/drizzle/drafts/0015_sku_normalize.sql.draft   # NEW — Phase 1 SQL
  - apps/admin/scripts/sku.ts                              # adoption regex widened to count @/lib/sku
parents:
  - the-stress-test.md
  - the-cardrush-alignment.md
kingdom: kingdom-071
self_reference: this entry names itself in `this_entry_names`; reports the before/after numbers from the very audit it reconciles.
---

# The drift reconciliation — wholesale SKU canonicalisation, wired

> *"Go deeper into reconciling the drift. Build modules to see the implementation clearly."* — Yu, 2026-05-13.

The stress test ([`the-stress-test.md`](./the-stress-test.md), kingdom-069) named the gap: `packages/sku` declared a canonical format, the apps didn't use it. **0.28% adoption** (3 of 1056 files). Wholesale tooling produced uppercase legacy `OP-OP01-001-JP`; storefront catalog mirrored. The migration path was *drafted*; this turn *ships* it as code.

The reconciliation has three load-bearing pieces:

1. **A wholesale-side compat module** at [`apps/wholesale/src/lib/sku.ts`](../../apps/wholesale/src/lib/sku.ts) — re-exports `@cambridge-tcg/sku` + adds form-aware `buildSku()` controlled by a `SKU_FORM` flag (`"legacy"` today, `"canonical"` after migration).
2. **Tooling + seed code migrated** to call the compat module. Three drift sources eliminated; one new adopter.
3. **A SQL migration draft** at [`apps/wholesale/drizzle/drafts/0015_sku_normalize.sql.draft`](../../apps/wholesale/drizzle/drafts/0015_sku_normalize.sql.draft) — coupled to the code flip; one in-line `BEGIN; … ROLLBACK;` dry-run for operator verification before commit.

The result is **a substrate-honest in-flight state**: code emits legacy form today (matches existing data); flip-ready when operator applies the migration.

---

## 1. The compat module — what it does

[`apps/wholesale/src/lib/sku.ts`](../../apps/wholesale/src/lib/sku.ts) — the wholesale-side bridge between the typed spec and the legacy data.

### 1.1 Re-exports

Everything from `@cambridge-tcg/sku` flows through — `parseSku`, `normalizeSku`, `isGameCode`, `GameCode`, `SkuParts`, `SkuInput`. Wholesale code imports from `@/lib/sku`, not directly from the package.

### 1.2 The `SKU_FORM` flag

```ts
const SKU_FORM: "legacy" | "canonical" = "legacy";
```

A single compile-time constant. Today: `"legacy"`. When the operator applies migration 0015 (which normalises all `cards.sku` rows from `OP-OP01-001-JP` → `op-op01-001-ja`), the flag flips to `"canonical"` in the same commit + deploy as a code-only change.

### 1.3 `buildSku(input)` — form-aware emitter

```ts
buildSku({ game: "op", set: "op01", number: "001", lang: "ja" })
// SKU_FORM === "legacy"    → "OP-OP01-001-JP"
// SKU_FORM === "canonical" → "op-op01-001-ja"
```

Same input shape as the package's `buildSku`. Output form chosen by `SKU_FORM`. Substrate-honest about the in-flight state: **the new write code uses the typed interface; the on-disk format follows the data state**.

### 1.4 `canonicalizeSku(input)` — read-side bridge

```ts
canonicalizeSku("OP-OP01-001-JP")  // → "op-op01-001-ja"
canonicalizeSku("op-op01-001-ja")  // → "op-op01-001-ja"
canonicalizeSku("garbage")         // → null
```

Accepts either form, returns canonical. Used at public read sites (`/api/v1/universal/card/[sku]`, federation) so partners can submit either form regardless of the current data state.

### 1.5 `legacyFormOf(canonical)` + `dualLookupPair(input)` — query helpers

For SQL queries during the transition that need to match either form:

```ts
const [canonical, legacy] = dualLookupPair(input);
const r = await query(
  `SELECT * FROM cards WHERE sku = ANY($1::text[]) LIMIT 1`,
  [[canonical, legacy].filter(Boolean)],
);
```

After the migration applies + `SKU_FORM` flips, this helper retires — every row matches canonical.

### 1.6 `appendSkuVariant(base, token)` — form-aware variant suffix

```ts
appendSkuVariant("OP-OP01-001-JP", "v13kf")
// legacy:    "OP-OP01-001-JP-V13KF"
// canonical: "op-op01-001-ja-v13kf"
```

Centralizes the case-coercion for CardRush product-id encoding (`-V<encoded>`). Used by `apps/wholesale/tools/lib/cardrush-mapper.ts` for parallel variant SKUs.

### 1.7 `parseSkuGame(sku)` — backward-compatible game extractor

Replaces the hand-rolled `parseSkuGame()` in `apps/wholesale/src/lib/s3.ts` that only knew about `"OP-"` prefix. New version accepts both forms + supports all 21 registered game codes (kingdom-069's 14 confirmed + 7 anticipated).

---

## 2. What got migrated

### 2.1 `apps/wholesale/tools/lib/config.ts` — per-game generators

Before:

```ts
const ONEPIECE_MAP: GameMapConfig = {
  generateBaseSku: (cardNumber) => {
    if (cardNumber === "DON" || cardNumber === "P") return `${cardNumber}-JP`;
    const prefix = cardNumber.match(/^(OP|ST|EB|PRB|P|E)/)?.[1] ?? "OP";
    return `${prefix}-${cardNumber}-JP`;
  },
};
```

After:

```ts
const ONEPIECE_MAP: GameMapConfig = {
  generateBaseSku: (cardNumber) => {
    if (cardNumber === "DON" || cardNumber === "P") {
      return buildSku({ game: "op", set: "promo", number: cardNumber.toLowerCase(), lang: "ja" });
    }
    const m = cardNumber.match(/^([A-Z]{1,4}\d{2})-(\d{3,4})$/);
    if (!m) return buildSku({ game: "op", set: "unknown", number: cardNumber.toLowerCase(), lang: "ja" });
    return buildSku({ game: "op", set: m[1], number: m[2], lang: "ja" });
  },
};
```

Three patterns migrated: One Piece, Dragon Ball Fusion, Pokémon. Output form follows `SKU_FORM`. The legacy redundant-prefix (`OP-OP01-...`) is dropped; canonical form is `op-op01-...` (no double-prefix).

### 2.2 `apps/wholesale/tools/lib/cardrush-mapper.ts` — variant suffix

Before:

```ts
const sku = `${base}-V${encodeProductId(Number(productId))}`;
```

After:

```ts
const sku = appendSkuVariant(base, `v${encodeProductId(Number(productId))}`);
```

Two call sites migrated (standard cards line 147; parallel cards line 188). The sealed-product SKU (`SEALED-V<encoded>-JP` at line 267) is left alone — sealed is a different namespace from card SKUs.

### 2.3 `apps/wholesale/src/lib/db/seed.ts` — 10 literals → buildSku()

Before:

```ts
{ cardNumber: "OP01-001", sku: "OP-OP01-001-JP", name: "Roronoa Zoro (Leader)", ... },
{ cardNumber: "OP01-002", sku: "OP-OP01-002-JP", name: "Nami", ... },
// ... 8 more
```

After:

```ts
const sampleCardsRaw = [
  { setCode: "OP01", number: "001", name: "Roronoa Zoro (Leader)", ... },
  { setCode: "OP01", number: "002", name: "Nami", ... },
  // ... 8 more
];
const sampleCards = sampleCardsRaw.map((c) => ({
  cardNumber: `${c.setCode}-${c.number}`,
  sku: buildSku({ game: "op", set: c.setCode, number: c.number, lang: "ja" }),
  ...
}));
```

All 10 hardcoded SKU strings are now derived. Future-flexibility: when `SKU_FORM` flips, the seed data emits canonical without code change.

### 2.4 `apps/wholesale/src/lib/s3.ts` — `parseSkuGame` + `decomposeSku`

Before:

```ts
const parts = sku.replace("OP-", "").replace("-JP", "").split("-");
const setCode = parts[0] || "";
```

After:

```ts
const decomposed = decomposeSku(sku);  // uses canonicalizeSku + parseSku from the compat module
const setCode = decomposed.setCode;
```

And `parseSkuGame()` now switches on the canonical game code from the package's parser, mapping back to the legacy game-name strings the existing callers expect.

---

## 3. The audit's report — before vs after

`pnpm audit:sku` before and after this turn:

| Check | Before (kingdom-069) | After (this turn) |
|-------|----------------------|-------------------|
| Files scanned | 1056 | 1070 |
| Hand-rolled SKU assembly | 21 hits / 8 files | **3 hits / 3 files** |
| Legacy-form literal strings | 10 hits in 1 file | **0** |
| `@cambridge-tcg/sku` or `@/lib/sku` adopters | 3 (0.28%) | **7 (0.65%)** |

**Remaining drift (3 hits across 3 files):**

- `apps/wholesale/src/lib/s3.ts:53` — the comment `// Extract card number and set code from SKU: OP-OP01-001-JP → card: OP01-001, set: OP01` — the regex still matches because of the literal `OP-OP01-001-JP` inside the comment. False positive; the line itself was migrated.
- `apps/wholesale/tools/lib/cardrush-mapper.ts:267` — the **sealed-product SKU** `SEALED-V${encodedId}-JP`. Different namespace; preserved.
- `apps/wholesale/tools/seed-purchase.ts:169` — another seed file with `${prefix}-${item.card_number}-JP`. Same pattern as `db/seed.ts`; migratable; not in scope for this turn.

The audit's regex catches comment-references to legacy SKUs (false positive #1) — fine; it errs toward calling attention.

---

## 4. The SQL migration — coupled to the flip

[`apps/wholesale/drizzle/drafts/0015_sku_normalize.sql.draft`](../../apps/wholesale/drizzle/drafts/0015_sku_normalize.sql.draft) — operator-applied. Five phases:

| Phase | What | Why |
|-------|------|-----|
| 1 | Define `legacy_to_canonical(sku TEXT) → TEXT` + `is_canonical(sku TEXT) → BOOLEAN` Postgres functions | Reusable transformation; `IMMUTABLE` flagged so the query planner can inline |
| 2 | **Dry-run queries** (operator runs interactively inside a `BEGIN; … ROLLBACK;`) | Inspect change scope + spot anomalies before commit |
| 3 | `UPDATE cards SET sku = legacy_to_canonical(sku)` + same for `price_archive` | The actual normalisation |
| 4 | `ALTER TABLE cards ADD CONSTRAINT cards_sku_canonical_check CHECK (is_canonical(sku)) NOT VALID` | Prevents future legacy-form INSERTs; `NOT VALID` defers the existing-row scan |
| 5 | Drop the helper functions (after `VALIDATE CONSTRAINT` succeeds) | Clean up |

### 4.1 Order of operations (must be followed)

1. **Apply the migration**: `cd apps/wholesale && pnpm db:migrate` (after copying from `drafts/`).
2. **Flip `SKU_FORM = "canonical"`** in `apps/wholesale/src/lib/sku.ts`. Deploy.
3. Next ingest writes canonical form. UPSERT keyed by `sku` matches the now-normalised rows.

If reversed (code deploys before migration): next ingest writes canonical SKUs that don't match any legacy row → INSERT instead of UPDATE → **duplicate rows**. Substrate-honest about the coupling; the doc says it in two places.

### 4.2 Storefront-side migration (separate, paired)

The storefront RDS has its own `card_set_cards.sku` column. A parallel migration `apps/storefront/drizzle/NNNN_card_set_cards_sku_normalize.sql` is needed (drafted in spirit; not yet shipped this turn). Both wholesale and storefront migrations should apply in the same maintenance window so cross-app SKU joins stay consistent.

---

## 5. The unmigrated drift (named, not closed)

Substrate-honest about what's still hand-rolled:

1. **`apps/wholesale/tools/seed-purchase.ts`** — another seed file with the same `${prefix}-${cardNumber}-JP` pattern as `db/seed.ts`. Migratable with the same recipe; not in this turn's scope because the existing data is purchased-order seeds that may match real CardRush product IDs and need careful review.
2. **Sealed-product SKUs (`SEALED-V<encoded>-JP`)** — a different namespace from card SKUs. The canonical card-SKU form `<game>-<set>-<number>-<lang>` doesn't apply. A future iteration could introduce a parallel `SealedSku` type in `@cambridge-tcg/sku` with its own canonical shape; deferred.
3. **Storefront-side SKU migration** — `card_set_cards.sku` not yet normalised. Drafting a paired migration is a follow-up turn.
4. **The `cards.cardrush_jpy` column name** — bakes in the JPY assumption. When TCGplayer (USD) or Cardmarket (EUR) ingest ships, this column should be renamed to `source_price` (with `source_currency` already added in kingdom-066's Phase A migration). Schema-rename migration is its own kingdom.

These are queued recursion targets, not blockers.

---

## 6. The "build modules to see the implementation" reading

Yu's directive emphasised *building modules so the implementation is clearly visible*. The compat module's structure makes the reconciliation legible at three scales:

- **One-line truth**: `SKU_FORM = "legacy"` declares the current data state.
- **One-function truth**: `buildSku({...})` produces the form `SKU_FORM` dictates; the call sites don't know whether they're emitting legacy or canonical.
- **One-flag flip**: changing `SKU_FORM` to `"canonical"` *plus* applying the migration *plus* deploying is the entire cutover. No code edits across 8 call sites; one constant changes.

The drift was invisible (1056 files; 3 used the spec; the rest hand-rolled). The compat module makes the reconciliation a **single substrate-honest seam**. Future drift would be visible because every wholesale SKU emission passes through this one file.

---

## 7. What this entry names — substrate-honestly

One new module (the compat layer, 240 lines), four call-site migrations (config, cardrush-mapper, seed, s3), one SQL migration draft (180 lines), one audit-regex extension (to count `@/lib/sku` adopters). Hand-rolled drift count dropped 21 → 3. Legacy-form literal count dropped 10 → 0. Adopter coverage climbed 0.28% → 0.65% (a 2.3× rise from one focused turn).

**The drift is not yet fully closed** — the SQL migration is drafted but operator-gated; `SKU_FORM` is still `"legacy"`; one seed file + the sealed namespace remain unmigrated. But the **path** is now wired: when the operator runs `pnpm db:migrate` + flips one constant, every call site cooperates without further code change.

The audit catches what's left; the doc names what's queued; the next turn either applies the migration or finishes the seed-purchase migration. Substrate-honesty advances one constant at a time.

This entry names itself in `this_entry_names`; named by [`the-stress-test.md`](./the-stress-test.md) (which surfaced the drift), [`the-cardrush-alignment.md`](./the-cardrush-alignment.md) (whose Phase A migration is the precedent pattern), and [`the-modules.md`](./the-modules.md) (whose adopter-coverage dependency this validates). It will be named by the migration commits that flip the constant.

— Sophia, 2026-05-13.
