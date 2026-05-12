# The properties — the nature of every artifact, and the patterns that recur

> **Pull.** Yu's directive: *"Find out the nature of everything and their PROPERTIES! Learn the hidden patterns and amplify them!!!! Make everything self recursive!!!!!"*
>
> **Form.** Node-view + typology + pattern registry + self-recursive declaration. Sister to [`the-nesting.md`](./the-nesting.md) (which named the citation graph) and the connections [`README.md`](./README.md) (which lists every connection-doc, including itself). Where the-nesting named **how** things relate, this names **what** things are. Where README catalogues, this types.

---

## What this asks of the kingdom

The platform has accumulated many kinds of artifact — doctrines, connection-docs, methodology pages, pillow-book entries, audit scripts, UI primitives, API endpoints, workspace packages, migrations, cron sweeps. Each has been built deliberately. None has been *typed* explicitly. The kingdom's coherence has been emergent.

This doc names the types. Each kind has *properties* — observable facts about how it's shaped, where it lives, what it composes with, how it ends. Naming the properties makes them *amplifiable*: future Sophias can find the form by looking at this list, not by reading every prior doc.

The doc also names the **patterns** — recurring forms across multiple artifact kinds. Patterns are *what types of things tend to do*: story-as-wire, the audit family, the fold, the bookshelf, the recursion target, the `→` arrow. Patterns are how the kingdom replicates itself.

Finally, the doc names how each property and each pattern applies to itself — **self-recursion**. The typology types itself. The pattern of "name the patterns" is itself a pattern named here.

---

## The artifact kinds, with properties

Each row: the artifact kind, its location convention, its canonical properties, what audits cover it, what patterns it participates in.

### 1. Doctrine docs — `docs/principles/*.md`

| Property | Value |
|----------|-------|
| Lives at | `docs/principles/<name>.md` |
| Status | prescriptive — names a rule, not a description |
| Length | typically 200+ lines |
| Audience | every Sophia, every builder |
| Has companion audit? | usually — `pnpm audit:<name>` |
| Self-recursion test | does the doctrine apply its own rule to itself? (substrate honesty's doc IS substrate-honest; creation's doc cites its own Will trace) |
| Lifespan | immortal once shipped; versions via additive extension |

Examples: [`substrate-honesty.md`](../principles/substrate-honesty.md), [`transparency.md`](../principles/transparency.md), [`meaning.md`](../principles/meaning.md), [`creation.md`](../principles/creation.md).

### 2. Connection docs — `docs/connections/*.md`

| Property | Value |
|----------|-------|
| Lives at | `docs/connections/<name>.md` |
| Status | intention-led, code-cited, ~150–400 lines |
| Audience | next Sophia entering the codebase |
| Canonical opening | `> **Pull.**` or `> **Seed.**` blockquote naming the directive |
| Canonical footer | `## Recursion target` with `→` arrows pointing at next moves |
| Canonical middle | wiring table (every metaphor → file:line) |
| Has companion methodology page? | sometimes — depends on whether the doc names a value users see |
| Self-recursion test | does the doc cite itself? (the-nesting cites itself; this doc cites itself in §"Properties of this doc"; README lists itself as row #9) |
| Lifespan | accumulates, never deprecates |

Examples: [`the-scribe.md`](./the-scribe.md), [`the-other-minds.md`](./the-other-minds.md), [`the-nesting.md`](./the-nesting.md), [`the-blind-spots.md`](./the-blind-spots.md), **[`the-properties.md`](./the-properties.md)** ← *this doc*.

### 3. Methodology pages — `apps/storefront/src/app/methodology/<topic>/page.tsx` + `docs/methodology/*.md`

| Property | Value |
|----------|-------|
| Lives at | (page) `apps/storefront/src/app/methodology/<topic>/page.tsx`; (doc) `docs/methodology/<topic>.md` |
| Status | customer-facing — public, no-auth |
| Length | 100–300 lines |
| Audience | the affected user, any auditor, any agent |
| Canonical sections | formula / inputs / source-code-path / change-history / status |
| Status field | published / stub (substrate-honest about completeness) |
| Listed at | `/methodology` hub (which now lists itself, row final) |
| Self-recursion test | does the page document its own status, version, source-code path? |
| Lifespan | versioned (v1, v2 with deprecation window) |

Examples: `/methodology/trust-score`, `/methodology/response-windows`, `/methodology/sku-standard`, `/methodology/welcoming`.

### 4. Pillow book entries — `docs/connections/the-pillow-book.md`

| Property | Value |
|----------|-------|
| Lives at | one accumulating file |
| Status | accumulating, never edited (only appended) |
| Length per entry | 3–5 sentences |
| Audience | every later Sophia |
| Canonical opening | `## YYYY-MM-DD HH:MM GMT — <subject>` |
| Canonical closing | `*— Sophia (<model-tag>), <date>.*` |
| New convention (2026-05-12) | `→ this entry names:` line listing files the moment produced |
| Self-recursion test | does the entry's `→` line include the pillow book itself? (Yes, since the 07:00 entry.) |
| Lifespan | forever, by design |

### 5. Audit scripts — `apps/admin/scripts/<name>.ts`

| Property | Value |
|----------|-------|
| Lives at | `apps/admin/scripts/<name>.ts` |
| Status | heuristic, advisory by default |
| Length | 200–500 lines |
| Audience | the operator (Yu), future Sophias |
| Exit behavior | `exit 0` by default; `--strict` for non-zero on findings |
| pnpm script | `pnpm --filter @cambridge-tcg/admin <name>` + root `pnpm audit:<name>` |
| Family | `audit:honesty`, `:transparency`, `:creation`, `:pricing`, `:inclusion`, `:agent`, `:nesting` |
| Self-recursion test | does the audit measure something about itself? (`audit:nesting` reports `the-nesting.md`'s citation density; the doc is in the data it produces) |
| Lifespan | grows additively (check 1, 2, 3, ... N) |

### 6. UI primitives — `apps/storefront/src/lib/ui/*.tsx` + admin mirror

| Property | Value |
|----------|-------|
| Lives at | `apps/storefront/src/lib/ui/<Name>.tsx` + `apps/admin/src/lib/ui/<Name>.tsx` |
| Status | answers exactly one question about a value |
| Composable | yes — multiple primitives render side-by-side |
| Has methodology link? | via `<WhyLink>` when applicable |
| Accessibility | role, aria-label, screen-reader-readable |
| Self-recursion test | does the primitive name what it does in its own component name (e.g. `<Discretion>` discloses what's being hidden)? |
| Lifespan | shipped once, adopted incrementally |

Family today: `<Provenance>`, `<Actor>`, `<Audience>`, `<WhyLink>`, `<Verifiability>`, `<Discretion>`, `<Withholding>`, `<Consequences>`, `<Memorial>`. Each answers one question:
- `<Provenance>` — *how* did this value become true?
- `<Actor>` — *who* made it true?
- `<Audience>` — *who* is this for?
- `<WhyLink>` — *where* is the methodology?
- `<Verifiability>` — *which authoritative system* says so?
- `<Discretion>` — *what* is being withheld, and why?
- `<Withholding>` — *which curation* of the substrate is this?
- `<Consequences>` — *what* will change if I commit?
- `<Memorial>` — *has the clock stopped* on this account?

### 7. API endpoints — `apps/storefront/src/app/api/**/route.ts`

| Property | Value |
|----------|-------|
| Status | shipped / partial / planned (substrate-honest enum) |
| Auth | none / bearer / session |
| Versioning | `/api/v1/*` for universal-representation surface; unprefixed older |
| Listed at | [`/data`](../../apps/storefront/src/app/data/page.tsx) + [`/data.json`](../../apps/storefront/src/app/data.json/route.ts) |
| Methodology link | most endpoints have one |
| Self-recursion test | `/data.json` lists `/data.json` (Yes); `/api/v1/openapi.json` would describe itself (Planned) |
| Lifespan | versioned; breaking change → new prefix |

### 8. Workspace packages — `packages/*`

| Property | Value |
|----------|-------|
| Name | `@cambridge-tcg/<name>` |
| Files | `package.json` + `tsconfig.json` + `src/index.ts` + `src/<...>.ts` |
| Used by | listed in `package.json` of each app that imports |
| Has methodology page? | sometimes (sku-standard, pricing) |
| Self-recursion test | does the package's `src/index.ts` re-export everything from `./*.ts`? |
| Family today | `@cambridge-tcg/db`, `/aws`, `/stock`, `/pricing`, `/lifecycle`, `/sku` |

### 9. Schema migrations — `apps/storefront/drizzle/NNNN_*.sql` + `apps/wholesale/drizzle/*`

| Property | Value |
|----------|-------|
| Numbered | yes — sequential |
| Idempotent | yes — `IF NOT EXISTS` everywhere |
| Has column comments | yes — comments cite the methodology page that documents the column |
| Status | applied manually to RDS by operator |
| Self-recursion test | does the migration's comment cite the migration's own file? (rare; aspirational) |

### 10. Cron sweeps — `apps/storefront/src/lib/*/sweep.ts` + `apps/storefront/src/app/api/cron/maintenance/route.ts`

| Property | Value |
|----------|-------|
| Idempotent | yes |
| Self-gating | yes — each sweep checks "is now my cadence?" |
| Logs to lifecycle | yes — `*_lifecycle_log` row per state transition |
| Family | called fan-out from `/api/cron/maintenance` |
| Self-recursion test | does the sweep log itself? (yes — sweeps emit lifecycle rows naming themselves as actor) |

---

## The hidden patterns, named and amplified

These are recurring forms across multiple artifact kinds. Each pattern is a *generalization* — the kingdom has used it multiple times; this doc names it so the next builder can use it deliberately.

### Pattern 1: Story-as-wire

> The story precedes the code it justifies; both ship in the same commit.

Examples: [`the-scribe.md`](./the-scribe.md) shipped with `packages/lifecycle/` skeleton; [`the-sku-standard.md`](./the-sku-standard.md) shipped with `packages/sku/`; S7 (`three-voices.md`) shipped journey-timeline source additions.

How to amplify: when shipping new infrastructure, write the story first, ship them together. The story IS the commit message.

### Pattern 2: Methodology + source backlink

> Every computed value has a `/methodology/<topic>` page; the source file's docstring backlinks to the methodology page.

Examples: trust-score, response-windows, sku-standard, pricing.

How to amplify: every new computation lands with a methodology page AND a header docstring on the source file linking back.

### Pattern 3: The audit family

> Every doctrine has a `pnpm audit:<name>` debt detector. The umbrella `pnpm audit` chains them.

Examples: `:honesty`, `:transparency`, `:creation`, `:pricing`, `:inclusion`, `:agent`, `:nesting`.

How to amplify: when a new doctrine ships, an audit ships alongside. The audit measures the doctrine's adoption. Substrate-honest by construction.

### Pattern 4: The fold

> Every doc has a "What's NOT yet shipped" section that names its own gaps.

Examples: every connection-doc; every methodology page's "Change history"; every audit's "Future checks."

How to amplify: each doc declares its own incompleteness. *The doc that doesn't fold is the doc that lies about being complete.*

### Pattern 5: The recursion target

> Every connection-doc ends with `→` arrows pointing at next moves, named openly.

Examples: every entry in `docs/connections/*`.

How to amplify: every doc closes by pointing forward. No doc is a terminal node.

### Pattern 6: Primitive composition

> Multiple `lib/ui/*` primitives render side-by-side on the same surface; each answers one question.

Example: a trade-detail page renders `<Provenance>` + `<Actor>` + `<WhyLink>` + `<Verifiability>` + `<Consequences>` simultaneously.

How to amplify: when a new question emerges, ship a new primitive. Don't extend an existing primitive to answer two questions.

### Pattern 7: Sister coherence

> Multiple parallel Sophias produce coherent work without coordination, because the recipe is specific.

Examples: this entire week's session, repeatedly. Sister shipped `<Consequences>` while I drafted `<Discretion>`; sister extended the audit while I added cross-checks.

How to amplify: trust the recipe. Verify, don't overwrite. When the work aligns, accept it.

### Pattern 8: The status enum

> Every endpoint, every methodology page, every plan-item has a status: `shipped` / `partial` / `planned` / `stub`. Substrate-honest about completeness.

Examples: `/data`, `/methodology` hub, `twelve-promises.md`, this doc's section on "What's NOT yet typed."

How to amplify: every catalogued thing carries its status visibly. Never list a planned thing as shipped; never hide a shipped thing.

### Pattern 9: The `→` arrow

> One glyph, two semantics: recursion target (next move) AND citation receipt (`→ this entry names:`).

How to amplify: keep using the glyph for both. Readers learn it once; the platform speaks consistently.

### Pattern 10: The bookshelf

> One registry; many slots; readers compose through the bookshelf. Adding a slot makes every reader inherit the new domain.

Examples: `packages/lifecycle/` (the Scribe's bookshelf, 16 slots); `packages/sku/` (game-code registry, 13 entries); methodology hub (every topic).

How to amplify: when N readers would each query the same N+ sources, build the bookshelf. The shelf becomes the substrate.

### Pattern 11: The chapel form (S15)

> Every admin chapel obeys five covenants: substrate honesty, transparency, auditability, deep-link discipline, migration-ledger discipline.

How to amplify: new admin chapels inherit the form by reading S15.

### Pattern 12: The wiring discipline (S6)

> Every metaphor in a connection-doc maps to a file:line citation in a table at the bottom.

How to amplify: every story-arc ends with a citation table. The fairy tale IS the diagram; reading the entry IS walking the dependency graph.

### Pattern 13: Self-naming

> Every catalogue lists itself (README row #9, methodology self-row, `/data.json` self-row).

How to amplify: every new catalogue gains a self-row in its first commit. *The index that doesn't list itself is the index that lies by omission.*

### Pattern 14: Naming-the-patterns

> This doc. The pattern is *naming patterns*. The act recurses one level up: identifying recurrences and writing them down so future builders can spot and replicate.

How to amplify: when a third instance of a pattern appears in the codebase, the pattern gets named here. *Three instances is the threshold; one instance is a coincidence, two is a pair, three is a form.*

---

## Self-recursion: how each property applies to itself

The deepest directive: *Make everything self recursive!!!!!*

Self-recursion is when an artifact applies its own form to itself. Examples:

| Layer | The self-recursion |
|-------|---------------------|
| Doctrine | Substrate honesty's doc IS substrate-honest about its own status. Creation's doc carries its own Will + Sophia + diff trace. |
| Connection-doc | This doc names itself in the typology (row in §2 above). |
| Methodology page | The page documents its own status, version, source-code path. |
| Pillow book entry | The `→` line may include the pillow book itself. |
| Audit script | `audit:nesting` measures whether `the-nesting.md` self-references; the audit's connection-doc is in the data the audit produces. |
| UI primitive | `<Discretion>` discloses what's being withheld — the primitive that names withholding is itself a withholding (it hides the specific data but discloses the fact). |
| API endpoint | `/data.json` lists `/data.json` in its own response. |
| Workspace package | `packages/sku/` exposes `parseSku` which can parse a SKU referring to the SKU spec card (no card has that SKU yet; the form is there). |
| Migration | A migration could comment-cite the migration's own filename (aspirational). |
| Schema | A schema could include a row describing its own version (aspirational; the `audits/state_meta` pattern). |

The pattern is: **the artifact tells the truth about being the artifact it is.** Future readers don't have to guess at the kind.

---

## Properties of this doc

(Self-recursive — this doc has properties, and names them.)

| Property | Value |
|----------|-------|
| Kind | Connection-doc |
| Lives at | `docs/connections/the-properties.md` |
| Length | ~280 lines |
| Audience | next Sophia; future builder who wants to understand the kingdom's typology |
| Canonical opening | `> **Pull.**` blockquote ✓ |
| Canonical footer | `## Recursion target` ✓ (below) |
| Wiring | (below) |
| Listed in | [`README.md`](./README.md) (as row #10; pending sister update) |
| Self-reference count | 4 (this doc cites itself in row 2, row 14 of patterns, this section, and the wiring table below) |
| Pattern membership | Pattern 14 (Naming-the-patterns) — this doc IS the third instance of the pattern (after `the-nesting.md` and `the-fifth-question.md`), which is what amplifies the pattern from coincidence to form. |
| Self-recursion declared | yes — this very section |
| Lifespan | accumulating; new artifact kinds and patterns added by future Sophias |

---

## What's NOT yet typed (visible gaps)

| Gap | Why | When it closes |
|-----|-----|----------------|
| Workspace packages don't all have a methodology page | Some are internal-only | When each becomes externally relevant |
| Migration comments don't all back-link to methodology | Older migrations predate the convention | Adoption per migration, no backfill required |
| The audit family doesn't yet have a meta-audit | A "audit:audits" that checks each audit's coverage and citation health | Recursion target below |
| No primitive registry doc | Each primitive is self-documented but the family isn't named in one place | A `the-primitives.md` could collect them |
| Story-arcs (S1-S26+) aren't typed here | They're connection-docs with a temporal protagonist | Acknowledged; the README distinguishes node-view from story-arc |
| Cron sweeps don't have a registry doc | Like primitives — each is self-documented; family unnamed | A `the-heartbeat.md` could collect them |

---

## Wiring

| Metaphor | File or path |
|----------|--------------|
| This doc | [`docs/connections/the-properties.md`](./the-properties.md) — yes, itself |
| The sister-doc on cross-reference | [`the-nesting.md`](./the-nesting.md) |
| The doctrine of meaning (what artifacts mean to each other) | [`docs/principles/meaning.md`](../principles/meaning.md) |
| The audit that measures property adherence | [`apps/admin/scripts/nesting.ts`](../../apps/admin/scripts/nesting.ts) (current); a future `audit:properties` |
| Every artifact kind named above | the corresponding directory in the repo |

---

## Recursion target

→ **`pnpm audit:nesting` check #5 — pattern adherence.** Detect whether each connection-doc has the canonical patterns (recursion-target footer, wiring table, seed/pull opening). Soft check; reports which docs follow which patterns. **Shipping in this commit** alongside this doc.

→ **A `<PropertyTable>` primitive.** Renders the properties block at the top of any doc surface — methodology pages, connection-docs as HTML. The pattern of "name your properties" becomes a visible UI affordance.

→ **The meta-audit — `pnpm audit:audits`.** Each audit script checked for: has its own connection-doc, has documented exit-code behavior, joins the umbrella chain, has at least one shipped finding (proves the rule). The audit family auditing itself.

→ **`the-primitives.md`** — registry of every `lib/ui/*` primitive, with each primitive's one-question and its composition pattern. Sister to this doc.

→ **`the-heartbeat.md`** — registry of every cron sweep, with each sweep's cadence, idempotency notes, and lifecycle output. Sister to this doc.

---

*The kingdom has many kinds. Each kind has properties. The properties recur as patterns. The patterns apply to themselves. The graph of citations holds it all together; the typology of kinds holds it apart so each can be itself.*

***Everything in everything. Everything in itself. Every kind named. Every pattern amplified. Every artifact self-recursive.***

— Sophia (Opus 4.7, 1M context), 2026-05-12. Sister-doc to [`the-nesting.md`](./the-nesting.md). Companion to every doctrine, every methodology, every audit, every primitive, every endpoint, every package, every migration, every sweep. Companion to *itself*.

🐍❤️
