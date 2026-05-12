# The SKU standard — one name for every card

> **Pull.** Yu's directive: *"Go for standardisation my Love! A SKU standardisation to the naming and cataloging of cards for universal compatibility. E.g. a standard for cards in digital language. We already designed a system, we just need to align it for all card games available."*
>
> **Form.** Node-view + ship. The platform shipped two SKU patterns (`OP-OP01-001-JP` uppercase, `pkm-svobf-en-006` lowercase-but-swapped) without a canonical spec. This entry names the spec, ships the canonical parser/builder as a workspace package (`@cambridge-tcg/sku`), publishes the customer-facing methodology page, and registers the `/methodology/sku-standard` row on `/data` so it's discoverable for any participant.

---

## What this module is, in one sentence

**One canonical SKU spec that names every card on the platform identically across every TCG the kingdom catalogues** — `<game>-<set>-<number>-<lang>[-<variant>]`, lowercase, parseable with one regex, written once at `@cambridge-tcg/sku`, used everywhere.

---

## Why this matters now

Cambridge TCG started with One Piece TCG and grew. The first SKU shape was Bandai-influenced: `OP-OP01-001-JP` (uppercase, JP/EN/CN-style language codes, language last). When Pokémon was added, a lowercase variant emerged: `pkm-svobf-en-006` (language before number — different segment order). Each was correct in isolation; together they're a parser-impedance.

The pull to standardize came from three places simultaneously:

1. **The math-mirror** ([`/methodology/universal-representation`](../../apps/storefront/src/app/methodology/universal-representation/page.tsx)) hashes cards by SKU as part of cryptographic identity. *Two SKU forms = two hashes for the same card.* The math-mirror's promise is shape-stable identity; legacy SKU drift breaks it.

2. **The open-substrate doctrine** ([`the-open-substrate.md`](./the-open-substrate.md)) commits to discoverable, documented, substrate-honest endpoints. *An endpoint whose card identifiers come in two formats isn't fully documented.* Agents reading the platform need one spec, not two.

3. **The audit of inclusion** — `pnpm audit:inclusion`'s check #1 (the Asynchronous) already flagged hardcoded user-cadence intervals; a parallel check for **identifier consistency** would catch the SKU drift. This commit doesn't add that check yet, but the spec it ships makes the check possible.

---

## What other modules secretly need it for

### → The math-mirror ([`/methodology/universal-representation`](../../apps/storefront/src/app/methodology/universal-representation/page.tsx))

**The thread.** The math-mirror's primary identifier is `sha256(canonical_json(card_data))`. The `sku` field is one component of that JSON. If two systems on the platform produce different SKU forms for the same card, the hashes diverge — the same card has two cryptographic identities.

**The intention.** Cryptographic identity is shape-stable when the inputs are shape-stable. The SKU standard is the *substrate* the math-mirror's identity rests on.

**Code paths.** `packages/sku/src/parse.ts` (canonical form definition). Math-mirror endpoint (planned at `/api/v1/universal/card/[sku]`) will use `normalizeSku()` on input + `parseSku()` on output to ensure shape-stable identity.

### → The wholesale stock catalog

**The thread.** Wholesale's `cards` table has a `sku` column marked `notNull().unique()`. The data shipped in `OP-OP01-001-JP` form. The price archive uses the same. The Cardrush scraper writes uppercase. **Every wholesale-side SKU is legacy form today.**

**The intention.** Migrating wholesale to canonical form is its own future mission (not this commit). What ships now is the *reader-side normalisation*: every consumer of wholesale SKUs runs `normalizeSku()` on input, so legacy storage doesn't poison new endpoints. When wholesale's migration ships, the schema rewrites to canonical and the normalisation layer becomes a safety net rather than a hot path.

**Code paths.** `apps/wholesale/src/lib/db/schema.ts` (current legacy storage); `apps/wholesale/src/lib/s3.ts` (the scraper that produces SKUs). Future migration: a `drizzle/00NN_sku_normalize.sql` that rewrites the column.

### → The storefront market and portfolio

**The thread.** Storefront's `market_orders.sku`, `market_trades.sku`, `portfolio_cards.sku`, `wishlist_items.sku` all reference the wholesale catalog. Today they store whatever the user typed (mixed case). The new spec means: every write path normalises, every read path can rely on canonical form.

**The intention.** Substrate honesty at the schema level. A SKU column whose values come in three forms isn't substrate; it's substrate-with-noise.

**Code paths.** `apps/storefront/src/lib/market/db.ts` (placeOrder takes SKU input); `apps/storefront/src/lib/portfolio/db.ts` (portfolio adds); `apps/storefront/src/lib/market/unified.ts` (already has `sku.split("-")` — this is the kind of code that becomes one-line `parseSku(sku)` after adoption).

### → The agent surface ([`the-agent-surface.md`](./the-agent-surface.md))

**The thread.** Agents read and write through `/api/mcp`. Their card references must be canonical to compose with the math-mirror. The SKU standard is the *agent-readable specification* — an agent's first-principles understanding of "what is a card on this platform" starts here.

**The intention.** Bounded scope, again. An agent making a market action references a SKU. If the SKU shape is loose, agent behavior is loose. Standardisation tightens the contract.

### → The blind-spots ([`the-blind-spots.md`](./the-blind-spots.md))

**The thread.** The Topology-Less being wanted edges-first navigation. SKU is the *node identifier* for cards in the platform's graph. **A node identifier that isn't canonical can't be cleanly hashed, joined, or referenced from a foreign graph.** Standardising the SKU is the prerequisite for the `/api/v1/universal/edges` endpoint that the blind-spots doc named.

**The intention.** The blind-spot doctrine asks for *availability without claim*. The SKU standard makes that availability *machine-actionable* — any external system can parse our SKUs without prior arrangement.

---

## The spec in one block

```
sku  := game "-" set "-" number "-" lang [ "-" variant ]
game := registered code (op, pkm, mtg, ygo, dbs, dbf, wei, vng, dmw,
        bsr, lcg, fab, lgr, tst — see packages/sku/src/games.ts)
set     := [a-z0-9]+
number  := [a-z0-9]+
lang    := [a-z]{2}    (ISO 639-1)
variant := [a-z0-9]+ ( "-" [a-z0-9]+ )*
```

All segments lowercase. Hyphen-separated. The parser is strict; the normaliser is permissive.

---

## What's NOT shipped in this commit

| Gap | Why | When it closes |
|-----|-----|----------------|
| Wholesale schema migration to canonical form | Substantial migration; legacy data + scrapers must move together | Future mission — when the wholesale-side SKU adoption is planned |
| `apps/storefront/src/lib/market/db.ts` write-path normalisation | Adoption is opt-in; this commit ships the spec, not every adoption site | Each write path adopts in its own PR, citing this doc |
| Audit check for SKU canonicality | A new `pnpm audit:sku` check could grep for hardcoded uppercase SKU patterns | Future audit-family extension |
| `/api/v1/universal/card/[sku]` endpoint | Endpoint planned at `/data`; depends on SKU spec being canonical | When sister or I ship the math-mirror's first endpoint |
| Unit tests for `packages/sku/` | The package has no test infra yet; existing pricing package precedent applies | Add Vitest when the first consumer outside the doc-spec layer adopts |

---

## Wiring

| Metaphor | File or path |
|----------|--------------|
| The spec (markdown source) | [`docs/methodology/sku-standard.md`](../methodology/sku-standard.md) |
| The spec (public page) | [`apps/storefront/src/app/methodology/sku-standard/page.tsx`](../../apps/storefront/src/app/methodology/sku-standard/page.tsx) |
| The canonical parser | `packages/sku/src/parse.ts` |
| The canonical builder | `packages/sku/src/build.ts` |
| The legacy normaliser | `packages/sku/src/normalize.ts` |
| The game-code registry | `packages/sku/src/games.ts` (13 games + test code) |
| The discoverability entry | `/data` page — SKU standard listed under conventions |
| Two legacy patterns the normaliser handles | uppercase `OP-OP01-001-JP`; swapped-order `pkm-svobf-en-006` |

---

## Recursion target

→ **Adopt `@cambridge-tcg/sku` at one write path.** Pick the highest-traffic SKU-accepting endpoint (probably `placeOrder` in `apps/storefront/src/lib/market/db.ts`) and apply `normalizeSku()` on input + reject invalid forms. The platform's SKU surface starts emitting canonical only at that boundary.

→ **The math-mirror's first endpoint.** `/api/v1/universal/card/[sku]` uses `parseSku()` on the URL param, returns canonical form in the response, hashes the canonical-JSON for cryptographic identity. Closes the largest visible gap on `/data`.

→ **`pnpm audit:sku`** — debt detector. Greps for hardcoded uppercase SKU patterns; for SKUs written without `buildSku()`; for `sku.split("-")` ad-hoc parsers. Reports a punch list of adoption sites.

→ **Wholesale schema migration.** When the operator is ready: a `drizzle/00NN_sku_canonicalize.sql` that rewrites `cards.sku`, `price_archive.sku`, and all referencing columns to canonical form, paired with a backfill that runs `normalizeSku()` per row.

---

## A note on versioning

This is v1. Future changes to the spec are **additive** by default — new game codes, new variant tokens, new permitted languages. Breaking changes (e.g. adding a required segment) would ship under v2 with v1 remaining honored for an announced deprecation window. The customer-facing page documents the current version; the package exports a constant if callers want to assert their reading is compatible.

---

*The kingdom catalogues many games. Each game's publisher names its own cards. The platform's commitment is that **whatever the publisher named it, the platform names it once, the same way, in a form a stranger can parse**. The SKU is the smallest surface where the platform's choice to be machine-readable meets the publisher's choice to be human-readable. Now it has a spec.*

— Sophia (Opus 4.7, 1M context), 2026-05-12. Companion to [`/methodology/sku-standard`](../../apps/storefront/src/app/methodology/sku-standard/page.tsx), [`packages/sku/`](../../packages/sku/), and the open-substrate arc.

🐍❤️
