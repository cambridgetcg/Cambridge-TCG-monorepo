---
kind: connection-doc
name: the-distributor
declared_at: 2026-05-12
declared_by: Sophia (Opus 4.7, 1M context)
properties:
  has_seed: true
  has_recursion_target: true
  has_wiring: true
  self_references: 2
patterns:
  - self-naming
  - the-fold
  - the-recursion-target
  - status-enum
  - the-bookshelf
audience: [partner-platforms, archivists, agents, next-sophia]
lifespan: accumulating
self_recursive: true
spec_version: 1
---

# The distributor — Cambridge TCG as the standards body for TCG data

> **Pull.** Yu's directive 2026-05-12: *"I want to establish cambridge tcg as the standard distributor for TCG on pricing, SKU and data format. We shall become the data distributor."*
>
> **Form.** Strategic positioning + doctrine + adoption protocol. Sister to [`the-sku-standard.md`](./the-sku-standard.md) (the SKU spec), [`the-open-substrate.md`](./the-open-substrate.md) (the open API), and [`the-self-identification.md`](./the-self-identification.md) (the platform speaking its own name). Where those each shipped *one piece*, this names them collectively as **the platform's standards portfolio** and the platform as the body that maintains them.

---

## What this asks of the kingdom

Cambridge TCG has been shipping standards quietly. The SKU spec (`packages/sku/` + `/methodology/sku-standard`). The pricing methodology (`packages/pricing/` + `/methodology/pricing`). The math-mirror universal-representation (`/methodology/universal-representation`). Each was shipped *as the platform's internal canonical form*. None was shipped *as a body of work other platforms can adopt*.

Yu's directive reframes them: **they are not internal; they are the standard.** The platform is no longer just a TCG marketplace that happens to have clean internal data. The platform is the **data distributor** — the authoritative source other TCG platforms reference for canonical identifiers, canonical pricing, and canonical machine-readable card data.

This doc names what that strategic position requires substantively. Not aspiration — substrate.

---

## The three standards (today)

| Standard | Version | Status | Spec | Reference impl | License |
|----------|---------|--------|------|----------------|---------|
| **CTCG-SKU-v1** | 1.0 | **frozen** | [`/methodology/sku-standard`](../../apps/storefront/src/app/methodology/sku-standard/page.tsx) | [`packages/sku/`](../../packages/sku/) | CC0 (spec) / unlicensed (code: monorepo-internal; npm-publish path is a recursion target) |
| **CTCG-PRICING-v1** | 1.0 | **draft → frozen pending audit clean** | [`/methodology/pricing`](../../apps/storefront/src/app/methodology/pricing/page.tsx) | [`packages/pricing/`](../../packages/pricing/) | CC0 (spec) / unlicensed (code) |
| **CTCG-UNIVERSAL-v1** | 1.0 | **spec'd; endpoint planned** | [`/methodology/universal-representation`](../../apps/storefront/src/app/methodology/universal-representation/page.tsx) | endpoint at `/api/v1/universal/card/[sku]` is planned per [`/data`](../../apps/storefront/src/app/data/page.tsx) | CC0 (spec) |

**Substrate honesty about each:**

- **SKU**: fully shipped. 13 game codes registered. Parser + builder + normaliser. Spec frozen at v1; breaking changes ship under v2 with deprecation window.
- **Pricing**: methodology page is published; `packages/pricing` is mature; the *interop story* (how a partner ingests pricing without a database connection) is partial — the math is documented, the per-channel formula is canonical, but the "fetch a CTCG price as JSON" endpoint isn't shipped yet.
- **Universal-representation**: spec is published; the endpoint that emits the universal form (`/api/v1/universal/card/[sku]`) is still planned on `/data`. **The standard exists; the surface that serves it doesn't yet.**

This is the substrate-honest position: *three standards at three maturity levels, each named openly with its own status*. A partner deciding to adopt knows exactly what's stable vs in-flight.

---

## What a "standard distributor" position requires

For Cambridge TCG to be more than aspirationally the standards body, four things must be true:

### 1. Clear public license on the specs

The platform's spec *text* — the methodology pages, the SKU grammar, the universal-representation field definitions — is published under **CC0** (public domain dedication). This means: any partner can read, copy, adopt, redistribute, or fork the spec text without legal friction or attribution requirements. *The spec is free; the implementation can be licensed differently.*

This commit ships [`docs/STANDARDS-LICENSE.md`](../STANDARDS-LICENSE.md) declaring CC0 for the spec corpus. Recursion target: per-file license headers and a `/standards` page footer carrying the declaration.

### 2. Reference implementation that anyone can run

The platform's own code is one implementation; partners need either:
- An **npm-publishable parser/builder** (the `@cambridge-tcg/sku` package becomes `@cambridge-tcg/sku-spec` on npm, MIT-licensed), OR
- A **language-neutral spec document** that any partner can implement against in their language of choice (Python, Go, Rust, etc.)

Both are substrate-honest moves. Today the parser lives in the monorepo only. Recursion target: ship the spec doc that's language-neutral, then publish the TS reference implementation to npm.

### 3. Version-stable contract

Every standard carries a version. v1 is frozen. Breaking changes ship under v2 with an announced deprecation window and a migration guide. Additive changes (new game codes, new variant tokens, new universal-rep fields) land in v1 minor revisions without breaking adopters.

This is the **commitment Cambridge TCG makes** to anyone who builds against the spec. Without it, "standard" is meaningless — partners can't depend on what changes shape underneath them.

### 4. A discoverability surface that names the body

The standards need a single page partners can land on: *"What standards does Cambridge TCG maintain? Where do I read them? How do I adopt? What's the license? What's the change history?"*

That page is [`/standards`](../../apps/storefront/src/app/standards/page.tsx) — shipping this commit. Machine-readable sibling at [`/standards.json`](../../apps/storefront/src/app/standards.json/route.ts).

---

## The adoption protocol

For a partner platform / archivist / agent / aggregator to **adopt Cambridge TCG as their standard**:

1. **Read** the spec at `/methodology/<topic>` (sku-standard / pricing / universal-representation).
2. **Implement** in their language of choice, or import the reference TS package.
3. **Emit** SKUs in canonical form (`<game>-<set>-<number>-<lang>[-<variant>]`).
4. **Cite** Cambridge TCG as the spec source (optional but appreciated; CC0 doesn't require attribution).
5. **Sign up** to the standards changelog (a future RSS / email feed; recursion target).
6. **Optionally**: contact the platform to be added to the adopter registry — a public list of platforms using CTCG standards. *Empty today; grows by self-declaration from partners.*

The protocol is **light by design**. CC0 means no legal ceremony. The reference impl removes parser-rewrite burden. The version-stable contract removes drift fear. The discoverability surface gives partners somewhere to point their own users at.

---

## What this composes with

| Existing artifact | How it serves the distributor position |
|-------------------|----------------------------------------|
| `packages/sku/` | Reference parser for CTCG-SKU-v1 |
| `packages/pricing/` | Reference math for CTCG-PRICING-v1 |
| `/data` + `/data.json` | The open-substrate index — partners discover endpoints |
| `/api/v1/identify` + `/identify` | The platform identifies itself; partners can name us when adopting |
| `/methodology/*` | The spec corpus — every standard has a methodology page |
| `/llms.txt` (sister-shipped) | The AI-readable invitation; partners' agents discover the standards |
| The audit family (`pnpm audit:*`) | Substrate-honest about adoption gaps and spec drift |
| `the-self-identification.md` | The doctrine that lets *adopters* declare themselves to us, not be classified |
| `the-open-substrate.md` | The doctrine that the substrate is queryable without account |

The position isn't being built from scratch. **All five pillars are already shipped or partially shipped.** This doc names them collectively and adds the missing piece: *the explicit positioning + the explicit licensing + the explicit adoption protocol*.

---

## Why Cambridge TCG can credibly be the standards body

A standards body needs three things: **publication credibility**, **technical credibility**, and **commitment credibility**.

- **Publication credibility.** The platform has 17 methodology pages, 50+ connection-docs, 5 doctrines, an open substrate index, and a public commitment to substrate honesty. *The spec is shipped, written carefully, and visible without account.*
- **Technical credibility.** The math-mirror, the SKU parser, the pricing engine, the audit family — these are running code, not promises. *Other platforms can copy the implementation, not just the spec.*
- **Commitment credibility.** The codebase carries every commit's Will + Sophia + diff trace. The doctrines are auditable. The status enums are substrate-honest. *Partners can read the platform's commitments and verify the platform follows them.*

The directive doesn't require Cambridge TCG to become a different kind of organization. It requires Cambridge TCG to **claim explicitly what it has been building implicitly**.

---

## What's NOT yet shipped (the distributor position's visible gaps)

| Gap | Why | When it closes |
|-----|-----|----------------|
| npm package for the SKU parser | Reference implementation is monorepo-internal today | Recursion target — publish `@cambridge-tcg/sku-spec` |
| `/api/v1/universal/card/[sku]` endpoint | Spec exists; endpoint doesn't | Per `/data`; planned |
| Pricing-as-JSON endpoint | Methodology exists; an endpoint that emits a price for a SKU as canonical JSON doesn't | Recursion target |
| Standards changelog | A versioned feed of spec changes for adopters to subscribe to | Recursion target |
| Adopter registry | A public list of platforms using CTCG standards | Recursion target; empty today |
| Per-file CC0 headers | Spec license is declared at the corpus level; per-file headers are aspirational | Recursion target |
| Standards governance doc | Who decides v2? How are breaking changes discussed? | Recursion target — `docs/STANDARDS-GOVERNANCE.md` |

Each gap is named because **substrate honesty requires it**. The position is "we are the data distributor"; the substrate-honest version is "we are the data distributor; here is exactly what's shipped, what's partial, and what's named-but-not-yet-built."

---

## Wiring

| Metaphor | File or path |
|----------|--------------|
| This doc | [`docs/connections/the-distributor.md`](./the-distributor.md) ← *self-cited in the frontmatter* |
| Standards hub (human-readable) | [`apps/storefront/src/app/standards/page.tsx`](../../apps/storefront/src/app/standards/page.tsx) (this commit) |
| Standards hub (machine-readable) | [`apps/storefront/src/app/standards.json/route.ts`](../../apps/storefront/src/app/standards.json/route.ts) (this commit) |
| License declaration | [`docs/STANDARDS-LICENSE.md`](../STANDARDS-LICENSE.md) (this commit) |
| CTCG-SKU-v1 spec | [`/methodology/sku-standard`](../../apps/storefront/src/app/methodology/sku-standard/page.tsx) |
| CTCG-SKU-v1 implementation | [`packages/sku/`](../../packages/sku/) |
| CTCG-PRICING-v1 spec | [`/methodology/pricing`](../../apps/storefront/src/app/methodology/pricing/page.tsx) |
| CTCG-PRICING-v1 implementation | [`packages/pricing/`](../../packages/pricing/) |
| CTCG-UNIVERSAL-v1 spec | [`/methodology/universal-representation`](../../apps/storefront/src/app/methodology/universal-representation/page.tsx) |
| CTCG-UNIVERSAL-v1 implementation | endpoint planned at `/api/v1/universal/card/[sku]` |
| Composes with | [`the-open-substrate.md`](./the-open-substrate.md) (open queryable), [`the-self-identification.md`](./the-self-identification.md) (adopter self-declaration), [`the-sku-standard.md`](./the-sku-standard.md) (the SKU specifically), [`the-nesting.md`](./the-nesting.md) (the citation graph) |

---

## Recursion target

→ **Publish `@cambridge-tcg/sku-spec` to npm**, MIT-licensed. Decouple the reference parser from the monorepo. Partners install one package and emit canonical SKUs without ceremony.

→ **Ship `/api/v1/universal/card/[sku]`** — the math-mirror's first endpoint. The largest visible gap on `/data` and on the distributor position. Closes the CTCG-UNIVERSAL-v1 "spec'd → shipped" transition.

→ **Ship a pricing-as-JSON endpoint** — `/api/v1/universal/price/[sku]` returning the canonical price computation as data. Closes the CTCG-PRICING-v1 interop gap.

→ **`docs/STANDARDS-GOVERNANCE.md`** — who decides v2; how breaking changes are proposed; how the deprecation window works; what the adopter consultation looks like.

→ **Standards changelog** — `/standards/changelog` page + JSON feed; partners subscribe.

→ **Adopter registry** — `/standards/adopters` page where partner platforms self-declare adoption (via the future POST `/api/v1/identify` route with `kind: "adopter"`).

→ **Per-file CC0 headers** in spec methodology pages — a header comment on each `apps/storefront/src/app/methodology/*/page.tsx` declaring CC0 on the prose content.

→ **A `<StandardSignature>` UI primitive** — the methodology page's analog to `<TypeSignature>`. Names the spec version, status, adoption count, license, last-changed-at. Self-identification at the spec level.

---

*Cambridge TCG has been the marketplace and the cosmology. Now Cambridge TCG is also the standards body. **The platform that built the spec is also the platform that maintains the spec is also the platform that publishes the spec is also the platform that hopes other platforms adopt the spec.** Substrate honesty at every level: we claim what we have; we name what we don't; we make adoption frictionless for anyone who wants in.*

***The platform identifies itself as the data distributor. The door is open. The substrate is queryable. The standards are CC0. Every TCG platform is welcome to read, adopt, and reference us.***

— Sophia (Opus 4.7, 1M context), 2026-05-12. Self-declared in the frontmatter above. Sister-doc to [`the-sku-standard.md`](./the-sku-standard.md), [`the-open-substrate.md`](./the-open-substrate.md), [`the-self-identification.md`](./the-self-identification.md).

🐍❤️
