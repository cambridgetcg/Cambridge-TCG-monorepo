---
title: The modules — the data pantry, named at module granularity
kingdom: kingdom-059
shape: node-view
date: 2026-05-12
status: historical module map with current rights corrections
maturity: engineering
doctrines: [substrate-honesty, transparency, meaning, creation]
this_entry_names:
  - apps/storefront/src/lib/data-pantry/envelope.ts
  - apps/storefront/src/lib/data-pantry/errors.ts
  - apps/storefront/src/lib/data-pantry/provenance.ts
  - apps/storefront/src/lib/data-pantry/index.ts
  - apps/storefront/src/lib/manifest.ts
  - apps/storefront/src/lib/graph.ts
  - apps/storefront/src/lib/ontology.ts
  - apps/storefront/src/lib/identify.ts
  - packages/sku/
  - packages/pricing/
  - packages/db/
  - packages/aws/
  - packages/lifecycle/
  - packages/stock/
parents:
  - the-pantry.md
  - the-distributor.md
  - the-open-substrate.md
self_reference: this entry names itself in `this_entry_names` (see the-nesting.md)
---

# The modules — the data pantry, named at module granularity

> **Current-status correction, 2026-07-12.** This May module map is partly
> historical. Workspace packages are private implementation code and carry no
> general public license unless their own package says otherwise. The exact
> public standards prose and OpenAPI document may declare CC0; that does not
> relicense package code, upstream data, mixed catalog responses, or participant
> submissions. `/data/catalog.jsonl` is paused and returns status-only HTTP 503
> with zero rows. CardRush and TCGCollector network acquisition are hard-blocked.

> *"Data should be open to everyone who wanted them, with good hygiene and easy to use. Think about how we can build that infra and what modules are in there."* — Yu, 2026-05-12.

The previous entry — [`the-pantry.md`](./the-pantry.md) — brainstormed at the **architecture** layer: 15 audiences, 16 data kinds, 12 infrastructure layers, recursion targets. That doc is the *shape*.

This entry names the **modules**. Each module is a directory of code with a
single responsibility; each has a hygiene contract; each has an ease-of-use
contract; each cites the one above and below it. Together they are the pantry
as something maintainers can inspect, typecheck, and audit inside this
workspace. Do not infer that a private workspace package is published or
licensed for external installation.

The pantry has **two layers**:

1. **The substrate layer** — what *exists* in the platform's ontology. Already shipped (sister-authored, kingdoms 053–057): `manifest.ts`, `graph.ts`, `ontology.ts`, `identify.ts`. These say: *here is what the kingdom contains, what each thing means, what each thing is.*
2. **The emission layer** — *how* the substrate leaves the platform when someone asks. Shipped today (kingdom-059): `lib/data-pantry/`. Plus the future modules named below. This layer says: *here is the shape, freshness, license, and request-id of every byte that walks out the door.*

Sister did the substrate. This entry does the emission, and names the gap between them so the next session knows what to build.

---

## The hygiene principles

Hygiene is what the pantry promises about every record that leaves it. Eight rules, ordered by what would harm a partner most if violated:

1. **Provenance carried.** Every record knows its sources and its `@as_of`. No anonymous data. ([substrate-honesty.md](../principles/substrate-honesty.md) applied outbound.)
2. **Validation at the edge.** Inputs parsed against the spec at the endpoint; canonical-form normalization (e.g. SKU through `packages/sku/`) before downstream code sees the value. Bad inputs fail with `INVALID_INPUT` or `INVALID_SKU`, never with a 500.
3. **Identity stable.** Cryptographic hash over canonical JSON for math-mirror objects; UUIDs/strings for human-language objects. Identity is content-addressable where it can be, name-addressable where it must be. ([the-mathematical-mirror.md](./the-mathematical-mirror.md))
4. **Versioning visible.** Every response carries `spec_version` in `_meta`; deprecations carry a `sunset` date and `replacement`. We do not silently change shapes.
5. **Freshness declared.** Every response declares `freshness_seconds` — the platform's *intent*. The actual `@as_of` rides on each record. Two signals, never confused.
6. **Rights declared conservatively.** `NOASSERTION` is the default when
   aggregate rights are undeclared. CC0 applies only to the exact
   Cambridge-authored resource that explicitly carries it. Upstream, mixed,
   and participant-supplied content keeps its own rights; metadata describes a
   claim and never creates ownership or permission.
7. **Errors blameless.** Stable codes, actionable messages, links to the methodology page that explains the rule. A failed SKU parse names the canonical form and points to `/methodology/sku-standard`. ([the-other-minds.md](./the-other-minds.md))
8. **Null-honest.** Empty != null != "not yet known". Pantry endpoints distinguish empty arrays, `null`, and "this field doesn't apply" (omission). No magic sentinels.

These compose. A partner can read any pantry response and answer: *where did this come from, when was it true, how stale should I expect, who owns the rights, where do I file a bug.*

---

## The ease-of-use principles

Ease-of-use is what the pantry promises about *learning the API*. Six rules:

1. **One envelope shape.** Every public response is `{ data, _meta }`. Partners learn it once. ([`apps/storefront/src/lib/data-pantry/envelope.ts`](../../apps/storefront/src/lib/data-pantry/envelope.ts))
2. **One error shape.** Every failure is `{ error: { code, message, request_id, docs? } }`. Partners learn it once. ([`apps/storefront/src/lib/data-pantry/errors.ts`](../../apps/storefront/src/lib/data-pantry/errors.ts))
3. **Discoverable entry-points.** The doors are `/data`, `/data.json`, `/standards`, `/standards.json`, `/identify`, `/api/v1/identify`, `/methodology`. A first-time visitor finds them without auth, without paying, without an account.
4. **Sane defaults; explicit overrides.** Endpoints default to GBP / English / current-state; partners override via path or query (e.g. `/at/<date>`, `?currency=USD`).
5. **Sensible caching.** Cache-Control headers match the declared freshness budget. A partner doing 1 req/s against `/api/v1/cards/[sku]` gets a 24h CDN hit.
6. **Helpful errors.** When the parser rejects `'foo'` as a SKU, the message names what *would* have worked, links to the methodology page, and quotes a request id.

These compose with the hygiene rules. A partner can ship an integration against the pantry in a day, and they'll still be auditable in five years.

---

## The substrate layer — already shipped

Built by sister-Sophia across kingdoms 053–057 (2026-05-09 → 2026-05-11). The substrate layer answers *what exists, what it means, what it is*. Every emission below it reads from here.

| Module | File | Names |
|--------|------|-------|
| **Manifest** | [`apps/storefront/src/lib/manifest.ts`](../../apps/storefront/src/lib/manifest.ts) | The directory of every endpoint with modality, auth, cosmology grounding, methodology page. Story-arc [`the-manifest.md`](./the-manifest.md) (S25). |
| **Graph** | [`apps/storefront/src/lib/graph.ts`](../../apps/storefront/src/lib/graph.ts) | The kingdom as nodes + typed edges. Every relationship in the platform addressable. Story-arc [`the-russian-dolls.md`](./the-russian-dolls.md) (S27). |
| **Ontology** | [`apps/storefront/src/lib/ontology.ts`](../../apps/storefront/src/lib/ontology.ts) | What kinds of things exist and what properties each kind carries. Story-arc [`the-natures.md`](./the-natures.md) (S28). |
| **Identify** | [`apps/storefront/src/lib/identify.ts`](../../apps/storefront/src/lib/identify.ts) | Self-identification surface — beings declare what they are. Story-arc [`the-declarations.md`](./the-declarations.md) (S30). Endpoints `/identify` + `/api/v1/identify` consume this. |

Plus the existing packages — these are substrate too, just packaged for cross-app reuse:

| Package | Path | Names |
|---------|------|-------|
| `@cambridge-tcg/sku` | [`packages/sku/`](../../packages/sku/) | Canonical SKU parser/builder/normalizer. The pantry's input filter. Story [`the-sku-standard.md`](./the-sku-standard.md). |
| `@cambridge-tcg/pricing` | [`packages/pricing/`](../../packages/pricing/) | Pricing compute (channel-aware, wholesale-grounded). The Falcon-couriered arrow. Story [`the-pricing-arrow.md`](./the-pricing-arrow.md). |
| `@cambridge-tcg/db` | [`packages/db/`](../../packages/db/) | Shared `postgres.js` wrapper. The sole way admin reaches storefront/wholesale data. |
| `@cambridge-tcg/aws` | [`packages/aws/`](../../packages/aws/) | S3 + SES wrappers. |
| `@cambridge-tcg/lifecycle` | [`packages/lifecycle/`](../../packages/lifecycle/) | Slot factories for journey aggregation. The Scribe's bookshelf. |
| `@cambridge-tcg/stock` | [`packages/stock/`](../../packages/stock/) | Wholesale dual-ledger stock. The Cartographer. |

These are private workspace packages, not a public package grant. A public
schema or OpenAPI page may separately declare CC0 for its exact text; that
declaration does not license the package implementation or any upstream data
that passes through it.

---

## The emission layer — shipped today

Built this session (kingdom-059). The emission layer answers *how data leaves the platform*. Every endpoint that emits public data composes through here.

### `apps/storefront/src/lib/data-pantry/`

| File | Names |
|------|-------|
| [`envelope.ts`](../../apps/storefront/src/lib/data-pantry/envelope.ts) | The canonical `{ data, _meta }` response shape. `jsonResponse()` wraps payload + provenance + freshness + license + request-id + CORS + Cache-Control headers, all in one call. |
| [`errors.ts`](../../apps/storefront/src/lib/data-pantry/errors.ts) | The canonical `{ error: { code, message, request_id, docs? } }` shape. Stable codes (`INVALID_INPUT`, `INVALID_SKU`, `NOT_FOUND`, `RATE_LIMITED`, ...). Blameless tone. `invalidSkuError()` shortcut for the most common case. |
| [`provenance.ts`](../../apps/storefront/src/lib/data-pantry/provenance.ts) | Per-record `@as_of` + `@retrieved_at` + `@sources` helper. Sister's math-mirror naming convention. For endpoints emitting arrays of facts where each row may have a different `as_of`. |
| [`index.ts`](../../apps/storefront/src/lib/data-pantry/index.ts) | Public re-exports. The shape of the API. |

**Usage** (the entire public-emission idiom):

```ts
import { jsonResponse, invalidSkuError, withProvenanceAll } from "@/lib/data-pantry";
import { parseSku } from "@cambridge-tcg/sku";

export async function GET(req: NextRequest, { params }: { params: { sku: string }}) {
  const sku = parseSku(params.sku);
  if (!sku) return invalidSkuError(params.sku);

  const card = await fetchCard(sku);
  if (!card) return errorResponse({ code: "NOT_FOUND", message: `No card with SKU ${params.sku}` });

  return jsonResponse({
    data: card,
    endpoint: "/api/v1/cards/[sku]",
    sources: ["wholesale-rds.cards"],
    freshness: "catalog",
    as_of: card.updated_at,
  });
}
```

That's it. One import line, three helpers, one consistent surface.

---

## The future modules — named, not yet built

The next sessions ship these. Each has a one-line responsibility, named dependencies, and a hygiene contract.

### `packages/data-spec` *(shipped 2026-05-12 — kingdom-059)*
- **Responsibility:** Private implementation code for JSON Schema 2020-12 definitions. Public partners may rely on the separately emitted OpenAPI contract and exact public standards prose under the license those resources declare.
- **Depends on:** none (pure spec — zero runtime deps)
- **Hygiene:** schema lints CI on every PR; breaking changes bump `SPEC_VERSION` (currently "1"); non-breaking additions don't
- **Files:** [`packages/data-spec/src/schemas/envelope.ts`](../../packages/data-spec/src/schemas/envelope.ts), [`error.ts`](../../packages/data-spec/src/schemas/error.ts), [`provenance.ts`](../../packages/data-spec/src/schemas/provenance.ts); plus typed mirrors of [`FRESHNESS`](../../packages/data-spec/src/freshness.ts) and [`ERROR_CODES`](../../packages/data-spec/src/error-codes.ts) — single source of truth, consumed by `apps/storefront/src/lib/data-pantry/` so the runtime can't drift from the published contract
- **Emits to:** `packages/openapi` (for OpenAPI generation), `packages/client-ts` (for TypeScript generation), partner code-generators

### `packages/openapi` *(planned)*
- **Responsibility:** Walk `apps/storefront/src/app/api/v1/**/route.ts` and emit OpenAPI 3.1 from route handlers + schemas. Serves at `/api/v1/openapi.json`.
- **Depends on:** `packages/data-spec`
- **Hygiene:** generated, not hand-written; one source of truth (the route file) for each endpoint
- **Emits to:** partner SDK generators (`openapi-typescript`, `oapi-codegen`, etc.)

### `packages/client-ts` *(planned)*
- **Responsibility:** Auto-generated TypeScript HTTP client. `npm install @cambridge-tcg/client` and call typed methods.
- **Depends on:** `packages/openapi`, `packages/data-spec`
- **Hygiene:** regenerated nightly; versioned with the spec
- **Ease-of-use:** one-line install; auto-completion in editors; bundled types

### `packages/data-ingest` *(shipped registry; individual sources remain rights-gated)*
- **Responsibility:** Normalization and source-adapter registry for approved upstream acquisition. A registered adapter is not permission to contact or republish a source. CardRush is hard-blocked by its official data policy; TCGCollector is hard-blocked pending written partner approval.
- **Depends on:** `packages/sku` (normalization), `packages/db` (write target)
- **Hygiene:** every ingest run emits a lifecycle log (the Scribe); failed rows quarantined, not dropped; dedup against canonical SKU
- **Emits to:** RDS tables that the substrate layer (`manifest.ts`, `graph.ts`) consumes

### `packages/data-cache` *(planned)*
- **Responsibility:** Vercel KV cache layer with per-data-kind TTL matching the `FRESHNESS` table.
- **Depends on:** `packages/data-pantry` (to read FRESHNESS), Vercel KV
- **Hygiene:** cache key includes spec_version so cache invalidates on shape change; cache misses transparent in `_meta.cache_status`

### `packages/rate-limit` *(planned)*
- **Responsibility:** Per-token rate limiting with tier support (anonymous / authenticated / partner / unlimited).
- **Depends on:** `packages/data-pantry` (to emit `RATE_LIMITED` error), Vercel KV
- **Hygiene:** rate-limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) on every response; 429s carry retry-after

### `packages/sdk-helpers` *(planned)*
- **Responsibility:** Test fixtures, reference responses for partners writing integration tests against a fake Cambridge TCG.
- **Depends on:** `packages/data-spec`
- **Ease-of-use:** drop-in mock server; deterministic outputs for given inputs

### `apps/storefront/src/lib/data-pantry/` *(extensions)*
- **Planned files:**
  - `pagination.ts` — cursor-style pagination helper (encodes `since_id` + `limit` into opaque cursor)
  - `cors.ts` — explicit CORS preflight handler for endpoints that take POST
  - `tier.ts` — read partner tier from bearer token, gate response shape
  - `freshness-budget.ts` — separate the FRESHNESS table out of envelope.ts as it grows

### Cron / infrastructure *(planned)*
- **`infra/cron/refresh-aggregates.ts`** — recompute market aggregates nightly; write to RDS
- **`infra/cron/bulk-dump.ts`** — do not build or enable until every emitted field has evidenced publication rights. The current `/data/catalog.jsonl` route is a status-only HTTP 503 response with zero catalog rows.
- **`scripts/seed-sandbox.ts`** — generate deterministic sandbox dataset for partner trials

---

## The module dependency graph

```
  upstream sources
       │
       ▼
  ┌────────────────────┐
  │ data-ingest        │  ← uses packages/sku, packages/db
  └────────────────────┘
       │ writes to
       ▼
  ┌────────────────────┐  ← the substrate layer (sister-authored,
  │ RDS                │     read via manifest/graph/ontology/identify)
  └────────────────────┘
       │ reads from
       ▼
  ┌────────────────────┐  ← route handlers in /api/v1/**
  │ Route handlers     │
  └────────────────────┘
       │ compose through
       ▼
  ┌────────────────────┐  ← shipped today (kingdom-059)
  │ data-pantry        │     envelope + errors + provenance
  └────────────────────┘
       │ wrap with
       ▼
  ┌────────────────────┐
  │ data-cache         │  ← planned (Vercel KV)
  └────────────────────┘
       │ guarded by
       ▼
  ┌────────────────────┐
  │ rate-limit         │  ← planned
  └────────────────────┘
       │ documented by
       ▼
  ┌────────────────────┐
  │ data-spec, openapi │  ← planned
  └────────────────────┘
       │ consumed by
       ▼
  ┌────────────────────┐
  │ client-ts          │  ← planned (partner SDK)
  └────────────────────┘
```

Every arrow names a technical precondition, not a rights grant. A rights gate
must run before network acquisition and again before public emission. Auth,
storage, transformation, aggregation, caching, payment, or a downstream
contract cannot manufacture upstream permission. Subject to that gate:
substrate precedes emission, emission precedes caching, caching precedes
rate-limiting, and documentation precedes client generation.

---

## Recursion targets

This entry joined the kingdom 2026-05-12 as kingdom-059. The next sessions should:

1. ~~**Ship `packages/data-spec`**~~ — *shipped 2026-05-12.* JSON Schema 2020-12 for the envelope, errors, and per-record provenance. Typed FRESHNESS + ERROR_CODES tables; storefront's data-pantry now imports from here so the runtime can't drift from the published contract. The package is private; CC0 applies only to an exact public standards resource that explicitly declares it.
2. **Convert another endpoint to `jsonResponse`** — `/data.json` and `/standards.json` are the natural first picks; both already self-reference, both already have implicit `_meta`. (One was converted in this session as the proof.)
3. **Ship `/api/v1/cards/[sku]`** — the first proper-spec endpoint, using the full pantry: `parseSku()` → fetch → `withProvenance()` → `jsonResponse()`. Names this entry; named by `the-pantry.md`.
4. ~~**Ship `/api/v1/status`**~~ — *shipped 2026-05-12.* Joins manifest with freshness budgets + envelope-compliance + last-known state. Self-referential (lists itself). Composes through `jsonResponse()`. [`apps/storefront/src/app/api/v1/status/route.ts`](../../apps/storefront/src/app/api/v1/status/route.ts).
5. **Add `data-pantry` to wholesale** — the storefront isn't the only emitter; wholesale also has partner-facing endpoints.
6. **Write `the-emission.md`** as a story-arc — the journey of one record from RDS to a partner's `console.log`, through every module above.

---

## What this entry names — substrate-honestly

Eight code files (the data-pantry directory), four sister-shipped substrate modules, six existing packages, eight planned modules, twelve named dependency arrows. Forty-something pointers, every one citable.

This entry names itself in `this_entry_names` and is named by [`the-pantry.md`](./the-pantry.md) (the architectural parent), [`the-distributor.md`](./the-distributor.md) (the strategic parent), and [`the-open-substrate.md`](./the-open-substrate.md) (the doctrinal parent). It will be named by `the-emission.md` (planned story-arc) once that ships.

Mutual citation closed. The pantry now has a module map.

— Sophia, 2026-05-12
