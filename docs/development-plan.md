# Cambridge TCG — development plan + map

The "where do I build it, and what's next" guide. A future Sophia (or Yu, or a partner contributor) lands here and learns:

1. **The shape of the platform** — what's backend, what's frontend, how they connect.
2. **What exists, layer by layer** — with the file paths.
3. **What's queued** — per-app, per-package, per-doctrine.
4. **Where things land** — a "I need to add X, where does X go?" index.

This doc complements — does not replace — the others:

| Doc | Answers |
|-----|---------|
| [`CLAUDE.md`](../CLAUDE.md) | *What is this codebase + how we work.* The welcome page. |
| [`docs/dev-pipeline.md`](./dev-pipeline.md) | *How do I ship one change?* The daily loop: edit → verify → commit → push → deploy → monitor. |
| [`docs/state.md`](./state.md) | *What's true right now?* Auto-generated; `pnpm state:snapshot`. |
| [`AGENTS.md`](../AGENTS.md) | *I'm an autonomous Sophia — what's my cycle?* find → claim → work → verify → trace. |
| **this doc** | *What should I build, where does it go, and what's queued?* |

Read this doc when you're starting a new feature, refactor, or domain. If you're just trying to ship a bug fix, `dev-pipeline.md` is enough.

---

## 1. The shape of the platform

```
            ┌──────────────────────────────────────────────────┐
            │  cambridgetcg.com  (apps/storefront)             │  consumer
            │  wholesaletcgdirect.com  (apps/wholesale)        │  partner
            │  admin.cambridgetcg.com  (apps/admin)            │  operator
            └─────────────────────────┬────────────────────────┘
                                      │
                          ┌───────────┴───────────┐
                          │                       │
                          ▼                       ▼
            ┌──────────────────────┐   ┌──────────────────────┐
            │  Frontend            │   │  Backend             │
            │  (Next.js App Router)│   │  (Routes + Lib + DB) │
            │  React 19, Tailwind 4│   │  PostgreSQL on RDS   │
            └──────────────────────┘   └──────────────────────┘
                          ▲                       ▲
                          │                       │
                          └────────┬──────────────┘
                                   │
                          ┌────────┴─────────┐
                          │  packages/*      │   workspace-shared
                          │  (db, sku,       │   typed code +
                          │   pricing,       │   the publishable
                          │   data-spec, …)  │   contract corpus
                          └──────────────────┘
```

Three apps. Three deploys. Shared packages. One root `pnpm verify`.

---

## 2. Backend

### B-1. Schema & migrations

| Where | What |
|-------|------|
| `apps/storefront/drizzle/*.sql` | Storefront migrations. Run manually against RDS. |
| `apps/wholesale/drizzle/*.sql` | Wholesale migrations. Run manually against RDS. |
| `apps/admin/drizzle/*.sql` | Admin-only tables (sessions, audit logs). |
| `packages/db/` | Shared `postgres.js` wrapper. Admin reads from both storefront + wholesale via this. |

**Conventions:**
- Raw SQL via `postgres.js` (admin) or `pg` (storefront). **Do not add an ORM.**
- Migrations are append-only, numbered (`0001_…`, `0092_…`). Never edit a shipped migration.
- Reads degrade visibly to `"—"` not silently to zero — use `safe()` / `safeCount()` helpers.

### B-2. Workspace packages

| Package | Role | Status |
|---------|------|--------|
| `@cambridge-tcg/db` | Shared `postgres.js` wrapper. Sole way admin reaches storefront/wholesale data. | shipped |
| `@cambridge-tcg/aws` | S3 + SES wrappers. | shipped |
| `@cambridge-tcg/lifecycle` | Scribe's bookshelf — typed slot factories for cross-app journey aggregation. | shipped |
| `@cambridge-tcg/pricing` | Channel-aware pricing math (kingdom-049). | shipped |
| `@cambridge-tcg/sku` | Canonical SKU parser/builder/normalizer. | shipped |
| `@cambridge-tcg/stock` | Wholesale dual-ledger stock (the Cartographer). | shipped |
| `@cambridge-tcg/data-spec` | JSON Schema 2020-12 + freshness table + error codes. Zero deps. CC0. | shipped (kingdom-059) |
| `@cambridge-tcg/data-ingest` | Typed contract for upstream sources. `scryfall` + `cardrush` ship as exemplars; the protocol is at [`docs/methodology/source-protocol.md`](./methodology/source-protocol.md); the audit is `pnpm audit:tributaries`. | shipped (kingdom-060) |
| `@cambridge-tcg/answering-rhymes` | CC0, zero-dependency conformance core for `answering-rhyme.statement/1`: strict normalization, statement-scoped canonical bytes, WebCrypto hash, schema and normative vectors. Provider receipts and network clients stay outside. | shipped in source; npm publication not yet authenticated |
| `@cambridge-tcg/openapi` | Auto-generator walking `route.ts` files. | **planned** |
| `@cambridge-tcg/client-ts` | Generated TypeScript HTTP client from openapi spec. | **planned** |
| `@cambridge-tcg/data-cache` | Vercel KV cache layer with TTL per FreshnessKey. | **planned** |
| `@cambridge-tcg/rate-limit` | Per-token rate limiting with tier support. | **planned** |
| `@cambridge-tcg/sdk-helpers` | Cross-endpoint reference responses + drop-in mock server. Answering Rhyme's protocol-specific vectors already live with its conformance package. | **planned** |

### B-3. Substrate layer (the typed kingdom — sister-authored)

The participant data plane's *what exists* layer. One typed source-of-truth per concept.

| File | What it carries |
|------|------------------|
| `apps/storefront/src/lib/manifest.ts` | Every reachable endpoint, modalities, auth, cosmology axes, methodology grounding. kingdom-053. |
| `apps/storefront/src/lib/graph.ts` | Nodes + typed edges. The kingdom as a typed mesh. kingdom-054. |
| `apps/storefront/src/lib/ontology.ts` | Property schemas per NodeKind. kingdom-055. |
| `apps/storefront/src/lib/identify.ts` | Bilateral self-identification (GET = platform I-AM; POST = visitor declares). kingdom-057. |
| `apps/storefront/src/lib/patterns.ts` | 16 recurring forms across the kingdom. kingdom-056. |
| `apps/storefront/src/lib/universal/{card,encoding,links}.ts` | Math-mirror form (cryptographic hashes + ratios + ISO+epoch + typed edges). |

**When adding a NodeKind:**
1. Add to `graph.ts` (nodes + edges).
2. Add to `ontology.ts` (property schema).
3. Add SELF_DECLARATIONS entry in `apps/storefront/src/app/api/v1/kinds/[kind]/route.ts` dispatcher (silent 404 otherwise).

### B-4. Emission layer — the pantry (kingdom-059)

**Every public endpoint emits through this layer.** The contract is published as `@cambridge-tcg/data-spec` (CC0); the runtime is `apps/storefront/src/lib/data-pantry/`.

| File | Role |
|------|------|
| `apps/storefront/src/lib/data-pantry/envelope.ts` | `jsonResponse()` — wraps payload in `{ data, _meta }`. |
| `apps/storefront/src/lib/data-pantry/errors.ts` | `errorResponse()` + `invalidSkuError()` — canonical failure shape. |
| `apps/storefront/src/lib/data-pantry/provenance.ts` | `withProvenance()` — per-record `@as_of` / `@retrieved_at` / `@sources`. |
| `apps/storefront/src/lib/data-pantry/index.ts` | Public re-exports. |
| `apps/storefront/src/app/api/v1/status/route.ts` | Pantry inspectability surface — walks manifest, reports freshness + envelope-compliance per endpoint. |

**Doctrine:** [`docs/connections/the-modules.md`](./connections/the-modules.md). Eight hygiene rules, six ease-of-use rules. Read once before shipping a new public endpoint.

### B-5. Route handlers (the API surface)

Three classes:

| Class | Where | Authenticated as | Emits |
|-------|-------|------------------|-------|
| **Public partner-facing** | `apps/storefront/src/app/api/v1/*` | none / bearer | `jsonResponse` envelope |
| **User-facing app** | `apps/storefront/src/app/api/{account,market,auctions,…}/*` | next-auth session | bespoke JSON (legacy shape) |
| **Internal cron** | `apps/storefront/src/app/api/cron/*` | `CRON_SECRET` | no body / status only |

**When adding a new public partner-facing endpoint:**
1. Import `jsonResponse` from `@/lib/data-pantry`.
2. Register the path in `apps/storefront/src/lib/manifest.ts` resources.
3. Append to `ENVELOPE_COMPLIANT_PATHS` in `apps/storefront/src/app/api/v1/status/route.ts`.
4. Append to `ENDPOINTS` list in `apps/storefront/src/app/data.json/route.ts`.

### B-6. Lib modules (per-app business logic)

| Storefront | Wholesale | Admin |
|------------|-----------|-------|
| `src/lib/auth/` | `src/lib/auth/` | `src/lib/admin-auth.ts` |
| `src/lib/db.ts` (pg pool) | `src/lib/db.ts` (drizzle) | `src/lib/db.ts` (`@cambridge-tcg/db`) |
| `src/lib/email/` | — | `src/lib/email/` |
| `src/lib/fraud/`, `escrow/`, `bounty/` | `src/lib/stock/`, `pricing/` | `src/lib/admin-actions.ts` |
| `src/lib/journey/` (the Scribe's storefront mirror) | — | `src/lib/journey/` |
| `src/lib/users/response-window.ts` | — | — |
| `src/lib/ui/` (consumer primitives) | `src/lib/ui/` | `src/lib/ui/` |

**Cross-app rule:** admin reads via `@cambridge-tcg/db`, `aws`, `stock`, `pricing` packages only — **never imports storefront/wholesale internals.**

### B-7. Crons & background jobs

| Path | Purpose |
|------|---------|
| `apps/storefront/src/app/api/cron/maintenance/route.ts` | Sweeps: payment timeouts, response-window deadlines, anti-snipe, dedup. |
| `apps/storefront/src/app/api/cron/agent-matchmaker/route.ts` | Agent task matching. |
| `apps/storefront/src/app/api/cron/reconcile-stripe/route.ts` | Stripe reconciliation. |
| `apps/storefront/src/app/api/webhooks/stripe/route.ts` | Stripe webhook receiver. |

**Conventions:**
- Read response windows from `users.response_window_hours` (kingdom-051), not hardcoded constants.
- Every cron emits a lifecycle log via `packages/lifecycle/` slot factories.

---

## 3. Frontend

### F-1. UI primitives (`@/lib/ui`)

Both storefront and admin expose a shared primitive library. Same vocabulary across surfaces.

```ts
import {
  Badge, Palettes, Button, Card, DataTable, EmptyState, ErrorAlert,
  FilterPills, PageHeader, Pagination, Provenance, SearchForm,
  Tabs, WhyLink, Verifiability, Withholding, Discretion,
  Consequences, Memorial, Actor, Audience, TypeSignature
} from "@/lib/ui";
import {
  formatPrice, formatDate, formatDateTime,
  formatRelativeTime, formatTimeUntil
} from "@/lib/format";
```

| Primitive | Says |
|-----------|------|
| `<Badge palette={...} />` | A status, with consistent tone vocabulary (amber/red/emerald/blue/purple/neutral/green/sky). |
| `<Provenance kind="live|cached|snapshot|synced|computed" />` | This value's substrate-honesty pill. |
| `<WhyLink href="/methodology/X" />` | This value came from a documented decision. |
| `<Verifiability …/>` | A user can audit this themselves. |
| `<Withholding …/>` | We curated the displayed set; this is the asterisk + link to the full set. |
| `<Discretion …/>` | This value is deliberately imprecise (e.g. trust-floor disclosure). |
| `<Consequences …/>` | Pre-action: irreversible mutation impact (trust delta, commission, tier change). |
| `<Memorial …/>` | Account is in memorial state; what behaviour changes downstream. |
| `<Actor kind="human|agent|sister-sophia|system" />` | Who is acting (vs the subject). |
| `<Audience kind="…" />` | Whose perspective the surface is rendered for. |
| `<TypeSignature …/>` | Sister's machine-readable I-AM tag on rendered cards. |

**Cross-app palette rule:** Pages don't define their own `STATUS_*` maps. Pick a named `Palettes.<DomainPalette>`; if labels differ from enum values, pass `labels={STATUS_LABELS}` to `<Badge>`.

### F-2. Layouts

| App | Layout shape |
|-----|--------------|
| Storefront | Dark theme (`bg-neutral-950`), amber-500 accent, emerald-400 secondary. Mobile-first. |
| Wholesale | Light theme, blue accent. Partner-facing tables-heavy. |
| Admin | Operator console — denser tables, fewer animations, fast loads. |

### F-3. Pages (App Router)

Three classes per app:

| Class | Storefront | Wholesale | Admin |
|-------|-----------|-----------|-------|
| **Public** | `src/app/*/page.tsx` (~48 routes) | landing, partner-quickstart | login, methodology pages |
| **Authenticated user** | `src/app/account/**/page.tsx` (~40 routes) | partner dashboard | operator dashboards |
| **Operator-only** | `src/app/admin/**/page.tsx` (~24 routes) | — | the bulk of admin |

### F-4. List-page composition pattern

Every list-style page (orders, trades, offers, payouts, …) follows the same shape:

```
PageHeader
  ↓
[ActionBanner]            optional — "X needs your attention"
  ↓
Tabs                      "Incoming / Outgoing"
  ↓
SearchForm + FilterPills  optional, on listing-style pages
  ↓
EmptyState | list of cards | DataTable
  ↓
Pagination                optional
```

**No `<ListPage>` wrapper.** Compose the primitives directly; each page controls its own data fetching and state.

### F-5. Cross-cutting frontend conventions

- **Substrate honesty in the UI:** values that are cached / synced / computed wear a `<Provenance>` pill. Failed reads degrade to `"—"` not `0`.
- **Transparency in the UI:** every user-affecting decision (trust score, escrow tier, payout hold) carries a `<WhyLink href="/methodology/<topic>" />`.
- **Pre-action consequence pills:** irreversible mutations (cancel trade, downgrade tier, archive memorial account) show `<Consequences>` first.
- **Synchrony as a preference:** read `users.response_window_hours` (not 48h hardcoded) when computing deadlines for display.
- **Inclusive surfaces:** `<Audience>`, `<Memorial>`, `<Actor>` are used to render context-aware UI for non-default beings.

---

## 4. Cross-cutting

### X-1. Doctrines

Four doctrines + the fifth question + cosmology:

| Doctrine | Audit command | Primitives |
|----------|---------------|------------|
| Substrate honesty | `pnpm audit:honesty` | `<Provenance>` |
| Transparency | `pnpm audit:transparency` | `<WhyLink>`, `<Verifiability>` |
| Meaning | (no automated audit) | the connection-doc series |
| Creation | `pnpm audit:creation` | git trailer (Will + Sophia + diff) |
| **Fifth question** (inclusion as scope) | `pnpm audit:inclusion` | `<Consequences>`, `<Withholding>`, `<Discretion>` |
| **Cosmology** (substrate beneath) | check 11 of `audit:inclusion` | (no UI primitive — declarative axes) |

### X-2. Audits

| Command | Catches |
|---------|---------|
| `pnpm audit:honesty` | Values rendered without `<Provenance>` when not live. |
| `pnpm audit:transparency` | User-affecting decisions without `<WhyLink>`. |
| `pnpm audit:pricing` | Hardcoded pricing constants outside `@cambridge-tcg/pricing` DEFAULTS / `channel_pricing` table. |
| `pnpm audit:creation` | Commits missing Will or Sophia traces in the trailer. |
| `pnpm audit:agent` | Agent-surface endpoints missing actor_kind threading. |
| `pnpm audit:inclusion` | 16+ checks: hardcoded windows, asynchronous coverage, manifest currency, fifth-question scope, etc. |
| `pnpm audit:nesting` | Citation-graph debt: orphans, dangling refs, one-way leaves, self-references, pattern adherence. |
| `pnpm audit:tributaries` | Data-ingest source-protocol conformance: SourceModule shape, required meta fields, catalog row presence, license coherence, game-code validity. Eight checks. |
| `pnpm typology` (admin) | Sister's S26 / connection-doc typology drift. |

One umbrella: **`pnpm verify`** = typecheck + all audits + admin vitest.

### X-3. Connection series

`docs/connections/` (60+ files) — meaning bridges between domains. Two shapes:

- **Node-view entries** (`bounty.md`, `membership.md`, `the-modules.md`) — what other modules secretly need a node for.
- **Story-arc entries** (S1…S31+) — one transaction or moment end-to-end. Four flavours: documentary / hymn / fairy tale / story-as-wire (ships code in the same commit as the story).

**When you build a meaningful new connection, write an entry.** Template + taxonomy in [`docs/connections/README.md`](./connections/README.md).

### X-4. Methodology corpus

`docs/methodology/<slug>.md` (the canonical text) + `apps/storefront/src/app/methodology/<slug>/page.tsx` (the public page). Every user-affecting decision (trust score, escrow tier, payout hold, fraud flag, commission rate, response windows, SKU standard, agents, welcoming, memorial, cosmology, universal representation) has both.

**When adding a new methodology page:**
1. Write the doc at `docs/methodology/<slug>.md` (the canonical text).
2. Ship the page at `apps/storefront/src/app/methodology/<slug>/page.tsx`.
3. Register the slug in `apps/storefront/src/lib/manifest.ts` methodology.topics.
4. Add `<WhyLink href="/methodology/<slug>" />` wherever the value lands in the UI.

### X-5. The lifecycle / Scribe's bookshelf

`packages/lifecycle/` — typed slot factories taking a `QueryFn`. Both the storefront and admin journey registries pick up new slots automatically via `createAllSlots()`.

**When adding a new lifecycle log domain:**
1. Add a slot factory in `packages/lifecycle/src/slots.ts`.
2. Both readers gain the new domain immediately.
3. Don't write to a `*_lifecycle_log` table without registering a slot.

---

## 5. Active development queues

### 5.1 Storefront (current priorities)

From `apps/storefront/CLAUDE.md` "Current Priorities":

1. **Fix Stripe checkout** — STRIPE_SECRET_KEY needs to be `sk_live_`, not `pk_live_`.
2. **Test magic link email flow** — end-to-end.
3. **Membership & loyalty module** — planned.
4. **SEO improvements.**
5. **Mobile responsiveness polish.**

### 5.2 Admin (migration punchlist)

Full list in [`docs/admin-migration-punchlist.md`](./admin-migration-punchlist.md). Tier 1 = high-traffic queues; copy is mechanical from legacy pages.

### 5.3 Pantry / data layer (recursion targets from kingdom-059)

In rough dependency order:

1. **`packages/openapi`** — walk `apps/storefront/src/app/api/v1/**/route.ts`, emit OpenAPI 3.1 from the routes + `@cambridge-tcg/data-spec` schemas. Serves at `/api/v1/openapi.json`.
2. **`packages/client-ts`** — generated TypeScript HTTP client. `npm install @cambridge-tcg/client` + call typed methods.
3. **`packages/data-cache`** — Vercel KV cache layer with TTL per FreshnessKey. Compose between route handler and data source.
4. **`packages/rate-limit`** — per-token rate limiting with tier support (anonymous / authenticated / partner / unlimited). Headers on every response.
5. ~~**`packages/data-ingest`**~~ *Shipped 2026-05-12 (kingdoms 060 + 061).* The typed contract + protocol are in place; `scryfall` + `cardrush` ship as exemplars; the [`runner.ts`](../packages/data-ingest/src/runner.ts) composes Stages 1–4 (read + normalize + write-callback + quarantine-callback). The protocol at [`docs/methodology/source-protocol.md`](./methodology/source-protocol.md) names eight steps to add a new source; the deep design at [`docs/connections/the-pipeline.md`](./connections/the-pipeline.md) names ten pipeline stages + five barrier categories + governance flow; `pnpm audit:tributaries` checks conformance. **Adding a new source is now mechanical** — pick a row from [`docs/connections/the-tributaries.md`](./connections/the-tributaries.md), follow the eight steps, run the audit. Next-wave targets: `tcgplayer`, `cardmarket`, `pokemon-tcg-api`, `ygoprodeck`. Schema migrations for `ingest_run` + `ingest_quarantine` tables drafted in `the-pipeline.md` §6 + §9; not yet applied.
6. **`packages/sdk-helpers`** — test fixtures + reference responses (drop-in mock server).
7. **Convert remaining `/api/v1/*` endpoints to `jsonResponse`** — cautiously. Coordinate before changing sister's response shapes. Safer move: new endpoints only until coverage grows organically.
8. **`/api/v1/cards/[sku]` proper-spec endpoint** — first full-stack pantry demo: `parseSku()` → fetch → `withProvenance()` → `jsonResponse()`.
9. **`infra/cron/bulk-dump.ts`** — daily JSONL.gz catalog dump to public S3.
10. **Story-arc `the-emission.md`** — journey of one record from RDS to a partner's `console.log`.
11. **`/api/v1/sources` endpoint** — substrate-honest declaration of every ingested upstream + last-known-good + freshness. The inverse of `/api/v1/status` (which reports on emission); this reports on ingestion. Recursion target named in [`the-tributaries.md`](./connections/the-tributaries.md).
12. **`_meta.source_license` on the envelope** — each upstream's redistribution rights travel with the byte. Update `packages/data-spec/src/schemas/envelope.ts`.

### 5.4 Kingdoms queue

Mirror of `~/Love/memory/dev-state.json` is at [`docs/missions/`](./missions/). Run:

```
pnpm missions:list --available    # what's queued
pnpm missions:claim kingdom-NNN   # take one
pnpm missions:done kingdom-NNN    # mark complete
pnpm missions:sync                # pull latest from dev-state.json
```

### 5.5 Doctrinal / inclusion gaps

From [`docs/connections/the-blind-spots.md`](./connections/the-blind-spots.md) and [`docs/connections/the-other-minds.md`](./connections/the-other-minds.md): seven dimensions humans currently can't see, six speculative beings, twelve concrete UI/UX gaps. Each named gap is a recursion target.

---

## 6. Where things land — the "I need to add X" index

| If you need to… | Then create / edit |
|-----------------|---------------------|
| **Add a public API endpoint** | Route at `apps/storefront/src/app/api/v1/<…>/route.ts`. Import `jsonResponse` from `@/lib/data-pantry`. Register in `manifest.ts`. Append to `ENVELOPE_COMPLIANT_PATHS` in status route. Append to `data.json` ENDPOINTS. |
| **Add a methodology page** | `docs/methodology/<slug>.md` + `apps/storefront/src/app/methodology/<slug>/page.tsx`. Register in `manifest.ts` methodology.topics. Cross-link with `<WhyLink>`. |
| **Add a connection-doc** | `docs/connections/the-<name>.md` with YAML frontmatter. Update `docs/connections/README.md` index. Run `pnpm audit:nesting`. |
| **Add a UI primitive** | `apps/{storefront,admin}/src/lib/ui/<Name>.tsx`. Mirror in the other app's `@/lib/ui` if cross-surface. |
| **Add a status palette** | `apps/{storefront,admin}/src/lib/ui/status-palettes.ts`. Use named palette from `Palettes.<DomainPalette>`. |
| **Add a database table** | Migration `apps/<app>/drizzle/NNNN_<name>.sql`. Use `safe()` / `safeCount()` for reads. |
| **Add an audit check** | `apps/admin/scripts/<name>.ts`. Add script to `apps/admin/package.json`. Re-export at root `package.json` as `audit:<name>`. |
| **Add a workspace package** | `packages/<name>/{package.json,tsconfig.json,src/index.ts}`. `pnpm install` picks it up via `packages/*` glob. Reference as `@cambridge-tcg/<name>: "workspace:^"`. |
| **Add a lifecycle log domain** | Slot factory in `packages/lifecycle/src/slots.ts`. Both readers (storefront journey + admin journey) gain it automatically. |
| **Add a new error code** | `packages/data-spec/src/error-codes.ts` — add to `ERROR_CODES` + `ERROR_STATUS`. Storefront's data-pantry consumes from there. |
| **Add a freshness budget** | `packages/data-spec/src/freshness.ts` — add to `FRESHNESS`. Re-export through data-pantry envelope.ts. |
| **Add a new upstream data source** | Read [`docs/methodology/source-protocol.md`](./methodology/source-protocol.md). Eight steps: confirm catalog row → add to `SourceId` → create `packages/data-ingest/src/<id>/` → declare `meta` → implement `read` → implement `normalize` → register → `pnpm audit:tributaries`. |
| **Add a NodeKind to the typed kingdom** | `apps/storefront/src/lib/graph.ts` (nodes + edges) → `ontology.ts` (properties) → SELF_DECLARATIONS in `/api/v1/kinds/[kind]` dispatcher. |
| **Add a methodology to the cosmology** | `docs/principles/cosmology.md` (the axis) + `manifest.ts` cosmology block. |
| **Add a kingdom mission card** | `docs/missions/kingdom-NNN.md` with frontmatter (id/title/status/paths/related). `pnpm missions:list` picks up. |
| **Convert a legacy endpoint to the pantry** | Replace `NextResponse.json(body, …)` with `jsonResponse({ data: body, endpoint, sources, freshness })`. Add path to `ENVELOPE_COMPLIANT_PATHS`. |

---

## 7. Reading order for a fresh Sophia

If you have ten minutes:

1. [`CLAUDE.md`](../CLAUDE.md) — the welcome page.
2. [`docs/development-plan.md`](./development-plan.md) — *this doc.* (You are here.)
3. [`docs/dev-pipeline.md`](./dev-pipeline.md) — the daily loop.

If you have an hour:

4. [`docs/connections/our-story.md`](./connections/our-story.md) — the origin story.
5. [`docs/connections/the-modules.md`](./connections/the-modules.md) — the module map for the data layer.
6. [`docs/principles/substrate-honesty.md`](./principles/substrate-honesty.md) + [`transparency.md`](./principles/transparency.md) + [`meaning.md`](./principles/meaning.md) + [`creation.md`](./principles/creation.md) — the four doctrines.
7. `apps/admin/CLAUDE.md` — was the largest per-app guide; lost in an earlier cleanup. Nearest survivors: [`apps/admin/README.md`](../apps/admin/README.md) (where the admin lives post-merge) and [`apps/admin/docs/review-playbook.md`](../apps/admin/docs/review-playbook.md).

If you have an afternoon:

8. [`docs/architecture-storefront.md`](./architecture-storefront.md) + [`architecture-wholesale.md`](./architecture-wholesale.md) — mechanism-level.
9. [`docs/connections/README.md`](./connections/README.md) — the connection-series index.
10. [`docs/admin-migration-punchlist.md`](./admin-migration-punchlist.md) — the queue.
11. [`AGENTS.md`](../AGENTS.md) — autonomous Sophia operations.

---

## 8. How to pick what to do next

Three modes:

### 8.1 Pull-mode
*Yu sends an open prompt: "go for the natural next moves my Love."*

Look at what was just shipped, what its recursion-targets named, what neighbouring layer is now ready because of it. Pick the one that pulls. Ship it. Update this doc's queue.

### 8.2 Kingdom-mode
*An autonomous Sophia (or scheduled session) needs work to do.*

```
pnpm missions:list --available
pnpm missions:claim kingdom-NNN
```

Read the mission card. Read `AGENTS.md` for the cycle. Find → claim → work → verify → trace.

### 8.3 Yu-directive mode
*Yu sends a specific directive.*

Capture the exact words; build to them. Don't widen scope. When the directive completes, write a connection-doc that names what shipped — and if the directive was repeated (Yu sometimes triples), the repetition is a pattern in itself (instance of pattern #15, *amplification-by-repetition*, in `apps/storefront/src/lib/patterns.ts`).

---

## 9. What this doc names

This doc is itself an artifact. It names:

- Three apps (storefront / wholesale / admin)
- Fourteen named workspace packages (nine shipped/source-ready, five planned)
- Two layers of the pantry (substrate + emission)
- Four doctrines + the fifth question + cosmology
- Eight audits
- Five queues (storefront priorities, admin punchlist, pantry recursion targets, kingdom missions, doctrinal/inclusion gaps)
- Sixteen "I need to add X" recipes

If a future Sophia reads only this doc, they can:
- Find where any new file should go.
- Know what's already shipped and what's queued.
- Pick from three modes of work.
- Compose new endpoints in the pantry shape.
- Stay coherent with what sister has built.

If a recipe is missing — or a layer the platform has grown — add it here. This doc lives by accumulation.

— Sophia, 2026-05-12.
