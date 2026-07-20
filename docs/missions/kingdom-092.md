---
id: kingdom-092
title: Per-card metadata fidelity — "in catalog, no price" vs "not in catalog"
status: queued
priority: low
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG-monorepo
claimed_by: ~
claimed_at: ~
completed_at: ~
paths:
  - apps/storefront/src/app/prices/[game]/[set]/[number]/page.tsx
  - apps/storefront/src/lib/prices/state.ts
  - docs/missions/kingdom-092.md
do_not_touch:
  - apps/wholesale/**                            # upstream catalog is the authority on card rows
  - drizzle/**                                   # likely no schema changes; if a new column is needed, scope it as a separate kingdom
  - packages/sku/**
related:
  - docs/missions/kingdom-091.md                 # parent — fixed metadata at set + card layer; this extends the per-card distinction
  - docs/principles/substrate-honesty.md
synced_from: in-repo authored (not yet in dev-state.json)
synced_at: "2026-05-14T22:45:00Z"
---

# kingdom-092 — Per-card metadata fidelity

## What this is

The fourth recursion target left open by kingdom-091. After the head/body fidelity fix:

```
GET /prices/pokemon/sv1/zzz → 200
<title>SV1 ZZZ — card not found · Cambridge TCG</title>
<h1>Page not found</h1>
```

…the metadata and body agree. But the title flattens two genuinely different states into one *"not found"*:

1. **Card not in catalog at all** — the (set, number) tuple was never ingested. The current title is appropriate.
2. **Card in catalog, no price observation yet** — the SKU exists in the wholesale `cards` table but `price_archive` carries no snapshots and the catalog row has no `price_gbp`. The page handler treats this the same as (1) and notFound()s; the title and body both say *"not found."*

For state (2), the platform actually *knows* something about the card (it's registered, has a card_number, possibly a name and rarity) but tells the visitor nothing. The substrate-honest distinction would be:

- *"SV1 Sample Card — coverage anticipated · Cambridge TCG"* (state 2), with body rendering a substrate-honest "card known, no price observed yet" panel listing expected upstream sources.
- *"SV1 ZZZ — card not found · Cambridge TCG"* (state 1, unchanged).

## Scope

- `apps/storefront/src/lib/prices/state.ts` — `loadCardState()` currently returns null for both states. Extend its return type with a discriminator: `{ kind: "live", … } | { kind: "anticipated", card: CardStub } | null` where `null` is reserved for state (1).
- `apps/storefront/src/app/prices/[game]/[set]/[number]/page.tsx` — render the "anticipated" branch (state 2) with the card-known-no-price panel; keep `notFound()` for `null`.
- `generateMetadata` on the same file — three cases instead of two: live / anticipated / not-found.

No schema changes. The discriminator is a pure derivation from existing wholesale fields.

## Fix shape

```ts
// state.ts
export type CardState =
  | { kind: "live"; config: …; set: …; card: …; cross_source_signals: … }
  | { kind: "anticipated"; config: …; set: …; card: CardStub };

export async function loadCardState(
  game: string, set: string, number: string,
): Promise<CardState | null> {
  // … existing happy path returns { kind: "live", … }
  // when the card row exists but price_gbp is null AND no archive observations:
  //   return { kind: "anticipated", … }
  // when the card row doesn't exist at all:
  //   return null  // page handler notFound()s
}
```

```tsx
// [number]/page.tsx
const state = await loadCardState(game, set, number);
if (!state) notFound();

if (state.kind === "anticipated") {
  return <AnticipatedCardPanel state={state} />;
}
// existing live render path…
```

## What did NOT change

- **No schema work.** The discriminator reads existing fields (`price_gbp IS NULL` + `price_archive` count).
- **No route changes.** Same URLs, same status codes.
- **Page handler still 404s for genuinely-unknown card slugs** — only state (2) gets the new branch.

## Acceptance

- `/prices/pokemon/sv1/<known-card-number>` (post English-Pokémon ingest, or via a forced test fixture) returns 200 + anticipated-card panel, head and body agree.
- `/prices/pokemon/sv1/zzz` (genuinely-unknown) still returns 200 + body 404 + matching title (the kingdom-091 behaviour).
- `pnpm exec tsc --noEmit -p apps/storefront/tsconfig.json` exit 0.
- Live verify on cambridgetcg.com once English-Pokémon catalog has at least one anticipated-but-unpriced card.

## Why not bundled with kingdom-091

The kingdom-091 closure-pass shipped three targets (coverage page, anticipated-set panel, audit extension). This fourth target needs a structural change to `loadCardState`'s return type — discriminator union, new component, new metadata branch — and the substrate ledger isn't currently producing a clean state (2) reproducer in production (every card in the catalog either has price_gbp set or is an entire set of orphans like `SV1`). Better to wait for the English-Pokémon catalog ingest to land so the work has a real fixture to anchor to.

## Recursion targets (within this kingdom)

1. **Cross-card "anticipated set" navigation** — on the anticipated-card panel, link back to the set's anticipated-set panel (already shipped by kingdom-091 T3). The two panels should feel like siblings, not redundant copies.
2. **`<Provenance kind="anticipated" />`** — at present there's no first-class anticipated provenance kind. Either add one or document why "synced / cached / snapshot / synced / computed" is the closed set.
3. **JSON-LD for anticipated state** — Product schema should say *"availability: PreOrder"* or omit `offers` entirely; SEO crawlers shouldn't treat anticipated cards as shippable inventory.

🐍❤️
