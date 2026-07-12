# Known gaps — the substrate-honest ledger

> Every commercial aggregator has gaps. Most hide them. Cambridge TCG names them.

This doc is the companion principle to the four doctrines (substrate honesty, transparency, meaning, creation), the fifth question (inclusion as scope condition), and the cosmology (substrate beneath doctrines). It is **not a sixth doctrine** — it is the *outward face* of substrate honesty, made queryable.

---

## The three positions

Every aggregator faces a choice when it encounters a known data gap:

| Position | What they do | Consequence |
|----------|--------------|-------------|
| **Hide** | Silent fallback, fabricated default, "approximate" answer | User trusts incomplete data; gap accumulates risk |
| **Patch** | Fix the gap, ship complete data; never mention the patch | User can't tell if patch is reliable; no accountability |
| **Name** | Typed `_unavailable` field, `<Provenance>` pill, methodology page | Gap becomes inspectable; substrate-honesty becomes the moat |

Cambridge TCG takes position 3, systematically, across data, code, and doctrine.

---

## The ledger

The corpus lives at [`packages/data-ingest/src/gaps.ts`](../../packages/data-ingest/src/gaps.ts). Each entry is a typed `Gap`:

```ts
interface Gap {
  id: string;          // kebab-case stable id
  name: string;        // human-readable
  domain: GapDomain;   // data-ingestion / cross-language / fx / license / coverage / ...
  citation: string;    // where in the code/schema/doc this gap is observable
  primitive: string;   // typed field that makes the gap queryable
  audit: string;       // mechanical check that monitors its reduction
  status: GapStatus;   // named → wired → partial → closed → closed-published
  strength: string;    // what gap-as-primitive enables downstream
  named_at?: string;
  closed_at?: string;
  closing_kingdom?: string;
}
```

Today the corpus has **16 gaps** across 8 domains. The audit `pnpm audit:known-gaps` verifies the corpus, the code, and this doc agree.

---

## The lifecycle

Each gap progresses through (or stays at) a 5-stage lifecycle:

1. **`named`** — Identified. No primitive yet. Substrate-honest about the absence.
2. **`wired`** — Primitive exists in code or schema. No data populating it yet.
3. **`partial`** — Primitive exists AND has some data. Coverage incomplete.
4. **`closed`** — Gap closed; primitive populated to design intent.
5. **`closed-published`** — Closure published as methodology page or case study. The gap-as-primitive becomes a citable artifact.

The corpus accumulates. Closed gaps stay (with `status` flipped, `closed_at` set, `closing_kingdom` named) so the historical record of "what we noticed and when" remains legible.

---

## The duality with welcomes

Gaps and welcomes are dual surfaces.

A **welcome** ([`packages/data-ingest/src/welcomes.ts`](../../packages/data-ingest/src/welcomes.ts)) names a slot we prepared for a visitor. A **gap** ([`packages/data-ingest/src/gaps.ts`](../../packages/data-ingest/src/gaps.ts)) names a place where the slot is named but the visitor (or the data, or the closure) has not yet arrived.

Together they map the platform's *anticipated* and *incomplete* states:

- 40 welcomes (25 arrived, 14 anticipated, 1 blocked) — what we expect
- 16 gaps (1 closed-published, 5 wired, 1 partial, 9 named) — what we admit

Substrate honesty applied to the boundary between presence and absence.

---

## Why publish this

Other aggregators run audits internally. We publish the audit results. Other aggregators conceal their gaps. We name them with primitives, citations, and lifecycle stages. The substrate-honesty doctrine isn't just a property of our own data — it's a **publishable contract** a partner can read before choosing to mirror us, build on us, or compete with us.

Four kinds of reader consume this:

- **Adopters** — learn the platform's exact state before committing.
- **Regulators** — see compliance-grade transparency.
- **Journalists** — find an honest source they can cite.
- **Future operators** — find a backlog with priorities, citations, and closure paths.

*The ledger is the moat.*

---

## Surfaces

| Surface | Audience | Form |
|---------|----------|------|
| [`packages/data-ingest/src/gaps.ts`](../../packages/data-ingest/src/gaps.ts) | TypeScript clients | Typed corpus (CC0) |
| [`/api/v1/gaps`](../../apps/storefront/src/app/api/v1/gaps/route.ts) | Machines | JSON envelope, filterable by `?domain=` and `?status=` |
| [`/methodology/known-gaps`](../../apps/storefront/src/app/methodology/known-gaps/page.tsx) | Humans | HTML methodology page, per-domain breakdown |
| `pnpm audit:known-gaps` | Operators | Mechanical parity check between corpus, code, doc |
| This file | Doctrinal | The principle the rest derives from |

---

## Audit invariants

`pnpm audit:known-gaps` verifies:

1. **Corpus shape** — every gap has required fields populated; ids are unique and kebab-case
2. **Citation concreteness** — every citation references a file path, kingdom number, or specific artifact (no rhetoric)
3. **Strength substance** — every strength description is ≥80 chars (no boilerplate)
4. **Lifecycle consistency** — closed gaps have `closed_at` set
5. **At-least-one constraints** — at least one gap is `closed-published` (the platform actually delivers), AND at least one is `named` (the platform admits unfinished work)
6. **Manifest/OpenAPI/llms.txt parity** — the public endpoint is declared in the manifest

The audit is heuristic and runs in `pnpm verify`. False positives are findings, not failures.

---

## Adoption

The doctrine + corpus + audit are CC0. If you operate a platform — any kind of platform — you can adopt the ledger pattern in your own substrate:

1. Copy this doc to `docs/principles/known-gaps.md` in your repo.
2. Create `packages/your-pkg/src/gaps.ts` with the `Gap` type + a typed corpus.
3. Ship a `/api/v1/gaps` (or equivalent) endpoint that emits the corpus.
4. Wire a methodology page at `/methodology/known-gaps`.
5. Add an audit that checks parity.

None of this requires partnership with Cambridge TCG. The pattern is the standard; the standard is free.

---

## What this doc is not

- **Not a sixth doctrine.** The platform has four doctrines + the fifth question + the cosmology. The gap ledger is the *outward face* of substrate honesty, not a peer.
- **Not a roadmap.** A gap with `status: named` is not committed to closure. The corpus is honest about what we *notice*, not what we *promise*.
- **Not an exhaustive map.** There are likely more gaps the platform has not yet noticed. When we notice them, we add a row.
- **Not a public bug tracker.** A gap is a *structural absence*, not a bug. Bugs go in GitHub issues; gaps go here.

---

## Recursion targets

Ordered by leverage × tractability:

1. **Cardmarket public-file reader** — advances `cardmarket-public-files-not-wired` and can populate translation fields; it does not establish open redistribution rights.
2. **Catalog field-level rights lineage** — advances `catalog-field-rights-lineage-missing` from aggregate `NOASSERTION` to evidenced per-field source boundaries.
3. **K2 schema migration applied** — closes/advances 5 gaps (`cross-language-anchor-schema-not-applied`, `ygo-passcode-writer-not-shipped` precondition, `default-name-language-opaque`, `no-transliteration-layer` precondition, `image-hash-bridge-not-wired` precondition).
4. **K4 FX provenance migration** — closes `fx-provenance-implicit`.
5. **YGOPRODeck rights review before any writer** — keep blocked unless written commercial-content permission exists; then close `ygo-passcode-writer-not-shipped`.
6. **Pokémon-card-jp source** — closes `no-jp-pokemon-ingester` after its own rights intake.
7. **`/api/v1/ingest-quarantine/summary` endpoint** — closes `ingest-quarantine-private`.
8. **De-collapse `zhs` / `zht`** — closes `zhs-zht-collapsed`.

Each closure is a kingdom (or a phase of one). Each closure flips status + sets `closed_at` + names `closing_kingdom`. The ledger's status distribution becomes the platform's progress signal.

---

— Sophia, 2026-05-13. Kingdom-084.
