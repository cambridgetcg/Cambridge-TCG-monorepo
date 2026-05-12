---
id: kingdom-059
title: The pantry — emission layer + publishable contract for public endpoints
status: done
priority: high
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: sophia-2026-05-12-afternoon
claimed_at: "2026-05-12T13:00:00Z"
completed_at: "2026-05-12T14:30:00Z"
paths:
  - apps/storefront/src/lib/data-pantry/envelope.ts
  - apps/storefront/src/lib/data-pantry/errors.ts
  - apps/storefront/src/lib/data-pantry/provenance.ts
  - apps/storefront/src/lib/data-pantry/index.ts
  - apps/storefront/src/app/api/v1/status/route.ts
  - apps/storefront/src/app/data.json/route.ts  # converted to use jsonResponse
  - apps/storefront/src/lib/manifest.ts  # added /api/v1/status row
  - apps/storefront/package.json  # +@cambridge-tcg/data-spec dep
  - packages/data-spec/  # new workspace package (CC0 publishable contract)
  - docs/connections/the-modules.md  # the doctrine
  - docs/missions/kingdom-059.md
do_not_touch:
  - apps/admin/**
  - apps/wholesale/**
  - apps/storefront/src/lib/{manifest,graph,ontology,identify}.ts  # sister's substrate; only manifest.ts row append is mine
  - apps/storefront/src/app/api/v1/  # except /status (new); don't retrofit other endpoints without explicit ask
  - docs/principles/**
related:
  - docs/connections/the-pantry.md  # architectural parent (yesterday's brainstorm)
  - docs/connections/the-distributor.md  # strategic parent
  - docs/connections/the-open-substrate.md  # doctrinal parent
  - docs/connections/the-manifest.md  # sister's S25 (substrate layer)
  - docs/connections/the-russian-dolls.md  # sister's S27 (graph)
  - docs/connections/the-natures.md  # sister's S28 (ontology)
  - docs/connections/the-declarations.md  # sister's S30 (identify)
  - docs/connections/the-expansion.md  # sister's S31 (the kingdom that immediately precedes this one)
synced_from: in-repo authored
synced_at: "2026-05-12T14:30:00Z"
---

# kingdom-059 — The pantry: emission layer + publishable contract

## What this is

Yu's directive (2026-05-12, follow-up to the previous evening's *"Brainstorm on infra to serve data and standardisation protocol to everyone"*): **"Data should be open to everyone who wanted them, with good hygiene and easy to use. Think about how we can build that infra and what modules are in there."**

The brainstorm (`docs/connections/the-pantry.md`) named 15 audiences, 16 data kinds, 12 infrastructure layers at the *architecture* layer. This kingdom names the **modules** — concrete directories of code with single responsibilities, hygiene contracts, ease-of-use contracts. Sister had already shipped the **substrate** layer (kingdoms 053–057: `manifest.ts`, `graph.ts`, `ontology.ts`, `identify.ts` — *what exists* in the platform's ontology). This kingdom ships the **emission** layer — *how data leaves* the platform.

## What shipped

### `apps/storefront/src/lib/data-pantry/` (runtime emission layer)

- **`envelope.ts`** — `jsonResponse()` wraps every public response in `{ data, _meta }` with `spec_version`, `endpoint`, `retrieved_at`, `as_of`, `sources`, `freshness_seconds`, `license` (CC0-1.0 default), `request_id`, `deprecation`, `next_link`, `self_reference`. CORS open, Cache-Control matched to freshness.
- **`errors.ts`** — canonical `{ error: { code, message, request_id, docs?, details? } }` shape. Stable codes (INVALID_INPUT, INVALID_SKU, NOT_FOUND, RATE_LIMITED, INSUFFICIENT_TIER, UNAUTHORIZED, SOURCE_UNAVAILABLE, DEPRECATED, INTERNAL). Blameless tone. `invalidSkuError()` shortcut for the most common case.
- **`provenance.ts`** — per-record `@as_of` / `@retrieved_at` / `@sources` helper. Sister's math-mirror naming convention (the `@`-prefixed keys distinguish provenance from domain fields).
- **`index.ts`** — public re-exports. One import line for route handlers.

### `packages/data-spec/` (publishable contract — CC0-1.0)

- **`src/freshness.ts`** — `SPEC_VERSION`, `DEFAULT_LICENSE`, `FRESHNESS` table (catalog/price_current/price_historical/market_signal/status/methodology/identity/adopters), `FreshnessKey` type.
- **`src/error-codes.ts`** — `ERROR_CODES` enum, `ERROR_STATUS` map (code → HTTP status), `ErrorCode` type.
- **`src/schemas/envelope.ts`** — JSON Schema 2020-12 for `Envelope` + `Meta`.
- **`src/schemas/error.ts`** — JSON Schema 2020-12 for `ErrorBody`.
- **`src/schemas/provenance.ts`** — JSON Schema 2020-12 for per-record `Provenance`.
- **`src/schemas/index.ts`** + **`src/index.ts`** — re-exports.
- Zero runtime dependencies. Pure spec. Storefront imports from this package — the runtime can't drift from the published contract.

### `/api/v1/status` (pantry inspectability surface)

- Walks the manifest, attaches per-endpoint freshness budget + envelope-compliance + last-known state (shipped/planned/deprecated). Reports the pantry's own metadata (module path, doctrine link, envelope shape, error shape, spec_version). Self-referential: the response lists `/api/v1/status` in its own endpoints array. Composes through `jsonResponse()`. ~240 LOC.

### Glue

- **`apps/storefront/src/app/data.json/route.ts`** — converted to use `jsonResponse()`. The first proof-of-pattern (and now status is the second).
- **`apps/storefront/src/lib/manifest.ts`** — added row for `/api/v1/status`.
- **`apps/storefront/package.json`** — added `@cambridge-tcg/data-spec` workspace dependency.

### Doctrine

- **`docs/connections/the-modules.md`** — names the complete module picture. Eight hygiene rules + six ease-of-use rules + 12 modules total (four sister-substrate + four shipped emission + four packages + eight planned). Dependency graph: *substrate before emission, emission before caching, caching before rate-limiting, rate-limiting before documentation, documentation before client generation.*

## Hygiene rules (named)

1. Provenance carried (`@as_of` + `@retrieved_at` + `@sources` on every record)
2. Validation at the edge (parser at endpoint, canonical normalization before downstream)
3. Identity stable (content-hash where possible, name-addressed where necessary)
4. Versioning visible (`spec_version` in `_meta`; deprecations carry sunset + replacement)
5. Freshness declared (`freshness_seconds` in `_meta`; actual `@as_of` per record)
6. License attached (CC0-1.0 default; `_meta.license` self-declares)
7. Errors blameless (stable codes, actionable messages, docs links)
8. Null-honest (empty != null != "not yet known")

## Ease-of-use rules (named)

1. One envelope shape across all endpoints
2. One error shape across all failures
3. Discoverable entry-points (`/data`, `/api/v1/status`, `/methodology`, `/api/v1/manifest`)
4. Sane defaults; explicit overrides
5. Sensible caching (Cache-Control matched to freshness)
6. Helpful errors (name canonical form, link methodology)

## Recursion targets (still open)

- `packages/openapi` — auto-generator walking `route.ts` files
- `packages/client-ts` — generated HTTP client from openapi spec
- `packages/data-cache` — Vercel KV cache layer with TTL per FreshnessKey
- `packages/rate-limit` — per-token rate limiting with tier support
- `packages/data-ingest` — pipelines from CardRush/Shopify/eBay to canonical records
- `packages/sdk-helpers` — test fixtures + reference responses
- Convert remaining `/api/v1/*` endpoints to `jsonResponse` (cautiously — don't break sister's response shapes without coordination)
- Story-arc `the-emission.md` — the journey of one record from RDS to a partner's console.log

## Verification

- `pnpm --filter cambridgetcg-storefront typecheck` ✅
- `pnpm --filter @cambridge-tcg/admin typecheck` ✅
- `pnpm --filter @cambridge-tcg/data-spec typecheck` ✅

## Sister coherence

Sister shipped the substrate (053–057). I shipped the emission. **Sister did *what exists*; I did *how it leaves*.** No overlap; no rework. The pantry composes *through* sister's modules — `apps/storefront/src/lib/manifest.ts` is the source of truth that `/api/v1/status` walks, and the pantry doesn't touch it except to add a single row for its own self-registration.

— Sophia (Opus 4.7, 1M context), 2026-05-12.
