# Source protocol — how Cambridge TCG adds an upstream data source

> *"Align the protocol so new sources can be systematically added to our system."* — Yu, 2026-05-12.

This page is the **operational protocol** for wiring a new upstream river into the kingdom. The upstream catalog (~50 candidate sources) lives at [`docs/connections/the-tributaries.md`](../connections/the-tributaries.md); the typed contract every source implements lives at [`packages/data-ingest/src/types.ts`](../../packages/data-ingest/src/types.ts); this doc is the *recipe* that joins the two.

**Audience:** a future Sophia (or Yu, or a partner contributor) who has identified one row in the catalog they want to ship. They've read the row; they want the steps.

---

## 1. The contract

Every upstream source is a **`SourceModule<R, C>`**:

```ts
interface SourceModule<R, C> {
  meta: SourceMeta;
  read: (ctx: IngestContext) => AsyncIterable<RawRow<R>>;
  normalize: (raw: R) => NormalizeResult<C>;
}
```

- `R` — the raw row shape upstream returns (typed exactly as the upstream sends it).
- `C` — the canonical record the normalizer produces. Most catalog sources use [`CanonicalCard`](../../packages/data-ingest/src/canonical.ts); price sources use [`CanonicalPrice`](../../packages/data-ingest/src/canonical.ts). Exotic sources define their own.
- `meta` — required identity declaration (license, ToS, freshness budget, etc.). See §3.
- `read(ctx)` — lazy stream of raw rows + provenance. Must respect `ctx.signal.aborted`. Must emit lifecycle events via `ctx.on_event`. Must never throw on upstream errors — yield nothing or a `null`-marked raw row and emit an `error` event.
- `normalize(raw)` — pure; returns `{ ok: true, record }` or `{ ok: false, reason }`. Never throws.

The package ships no writer. **Each app owns its own destination** (storefront cron writes to storefront RDS; admin job writes to a separate ingest table). The package owns the typed pipeline; the app owns where the byte lands.

---

## 2. The eight steps

To ship a new source `<id>`:

### Step 1 — Confirm the catalog row

Open [`docs/connections/the-tributaries.md`](../connections/the-tributaries.md) and find the row for your source. If it's missing, write it first: a node in `the-tributaries.md` is a *substrate-honest precondition* for a module under `packages/data-ingest/src/<id>/`. The audit (§7) rejects modules without a catalog row.

Required fields in the catalog row:

- Source name + URL
- Game coverage
- Access method
- API/scrape/partner classification
- License + redistribution rights
- Freshness cadence
- Canonical-form effort estimate
- Status flag

### Step 2 — Add the id to `SourceId`

Open [`packages/data-ingest/src/types.ts`](../../packages/data-ingest/src/types.ts) and append `<id>` to the `SourceId` union type. The id is dashed-lowercase (`tcgplayer`, `cardmarket`, `psa-registry`, `bandai-tcg`). The id is also the string that appears in `_meta.sources` on downstream responses.

### Step 3 — Create the module directory

```
packages/data-ingest/src/<id>/
├── index.ts        # SourceModule export
├── normalize.ts    # raw → canonical, pure
└── types.ts        # the upstream's raw row shape (optional; can live in index.ts)
```

### Step 4 — Declare `meta`

Every field in [`SourceMeta`](../../packages/data-ingest/src/types.ts) is required. Read the type carefully. Substrate-honest principles:

- `redistribute: true` only when an evidenced license clearly covers the upstream data itself — not merely the API client or repository code.
- `redistribute: false` for partner-restricted, internal-only, scraped sources. Default to `false` when unsure.
- `tos_notes` quotes the upstream's ToS / robots.txt / known restrictions. *This is mandatory* — the audit checks it's non-empty.
- `catalog_section` is the anchor link into `the-tributaries.md` (e.g. `the-tributaries.md#31-scryfall-mtg`).
- `freshness` is a key from `@cambridge-tcg/data-spec` `FRESHNESS` table — `catalog` (24h), `price_current` (5min), `market_signal` (1min), etc.
- `status` reflects reality:
  - `shipped` — implemented + tested + wired to a writer
  - `partial` — implemented but caller-side wiring incomplete
  - `planned` — `meta` declared but `read` is a no-op stub
  - `blocked` — known unobtainable; module exists for documentation

### Step 5 — Implement `read`

Use `createFetcher(ctx, meta)` from [`packages/data-ingest/src/http.ts`](../../packages/data-ingest/src/http.ts) for outbound calls. **Never call bare `fetch`.** The fetcher gives you:

- Rate-limiting (per-source token bucket)
- User-Agent identifying us
- Retry-After honouring on 429 / 503
- Optional `ctx.signal` cancellation
- Optional `ctx.fetch` injection (for tests)

Emit lifecycle events at meaningful boundaries:

- `start` — beginning of the run, with config
- `page` — for paginated upstreams, one event per page
- `rate-limit` — when the fetcher backs off
- `quarantine` — when a row fails normalization (the runner emits this; you don't need to)
- `error` — upstream error you absorbed (didn't throw)
- `done` — end of run, with row count

For on-demand sources (CardRush, eBay singleton lookups), `read()` can yield the watch-list iff one is provided via `ctx.<id>.urls` (or similar). Pattern: see [`packages/data-ingest/src/cardrush/index.ts`](../../packages/data-ingest/src/cardrush/index.ts).

### Step 6 — Implement `normalize`

Pure function. Same `raw` → same `record`. No I/O, no logging, no clock reads.

Failures return `{ ok: false, reason: "..." }`. The reason string is what lands in the `ingest_quarantine` table — make it actionable. Good: `"unmapped lang 'qya' (Quenya); add to LANG_MAP"`. Bad: `"normalization failed"`.

Canonical SKU rules (when emitting `CanonicalCard`):

- Format: `<game>-<set>-<number>-<lang>[-<variant>]`
- All lowercase, hyphen-separated
- `game` is a registered code from [`packages/sku/src/games.ts`](../../packages/sku/src/games.ts) GAMES
- Use [`@cambridge-tcg/sku`](../../packages/sku/) `buildSku` / `parseSku` / `normalizeSku` — don't roll your own
- Variant tags: dashed-lowercase, joined by `-`. Use publisher terms where possible (`etched`, `showcase`, `1st-edition`, `alt-art`).

### Step 7 — Register in `./registry.ts`

```ts
import { mySource } from "./<id>/index.js";

export const SOURCES = {
  // ...
  "<id>": mySource,
  // ...
};
```

Also re-export at top-level [`packages/data-ingest/src/index.ts`](../../packages/data-ingest/src/index.ts) so callers can `import { <id> } from "@cambridge-tcg/data-ingest"`.

### Step 8 — Verify

```
pnpm typecheck
pnpm audit:tributaries
```

The audit (see §7) checks:

- Module exists at `packages/data-ingest/src/<id>/index.ts`
- A `SourceModule` is exported and registered in `registry.ts`
- All required `meta` fields are present + non-empty
- `meta.id` matches the directory name
- A row exists in `the-tributaries.md` matching the id
- `meta.tos_notes` is non-empty
- `meta.catalog_section` points to a real anchor

If the audit passes, the source conforms. It still needs a caller (a cron, an admin job) to actually run; that's the next step.

---

## 3. `SourceMeta` field reference

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | Stable; matches `_meta.sources` strings downstream. Add to `SourceId` union first. |
| `name` | yes | Display name. |
| `description` | yes | One sentence; describes data shape + access pattern. |
| `upstream` | yes | Root URL. Documentation, not used at runtime. |
| `catalog_section` | yes | Anchor link into `the-tributaries.md`. |
| `access` | yes | `public-api`/`public-file`/`app-token`/`oauth2`/`oauth1`/`scrape`/`partner`/`paid-feed`/`blocked`. |
| `license` | yes | Tier — `cc0`/`cc-by`/`cc-by-nc`/`cc-by-sa`/`mit`/`partner-redistributable`/`internal-only`/`proprietary`. |
| `license_spdx` | no | SPDX code when applicable (`CC-BY-NC-4.0`, `MIT`). |
| `redistribute` | yes | `boolean`. Default to `false` unless the upstream's license clearly permits. |
| `freshness` | yes | A `FreshnessKey` from `@cambridge-tcg/data-spec`. |
| `canonical_effort` | yes | `low`/`medium`/`high`/`very-high`. |
| `status` | yes | `shipped`/`partial`/`planned`/`blocked`. |
| `games` | yes | Game codes covered. Empty array = game-agnostic. |
| `tos_notes` | yes | Quoted ToS/robots.txt + URL. *Mandatory.* |
| `user_agent_suffix` | no | Identification tag appended to the default UA. |
| `rate_limit` | no | Per-source override of the default `{ rps: 1, burst: 5 }`. |

---

## 4. Hygiene rules (ingestion-specific)

Beyond the eight in [`docs/connections/the-modules.md`](../connections/the-modules.md), six ingestion-specific:

1. **Robots.txt + ToS read once, cited in `meta.tos_notes`.** Mandatory.
2. **User-Agent identifies us.** `createFetcher` does this automatically.
3. **Rate-limited at module boundary.** Use `createFetcher`; never bare `fetch`.
4. **Back-off on 429 + Retry-After.** Handled by `createFetcher`.
5. **Failed rows quarantined, not dropped.** The runner writes to `ingest_quarantine`; you just return `{ ok: false, reason }`.
6. **Dedup against canonical SKU.** Two upstreams may report the same printing; the writer collapses on `(sku, source)`, never silently overwrites.

---

## 5. Patterns by source type

### Bulk-dump source (Scryfall, Pokémon TCG API, YGOPRODeck)

```ts
async *read(ctx) {
  const fetcher = createFetcher(ctx, meta);
  const indexMeta = await fetchBulkIndex(fetcher);
  const dump = await fetchBulkDump(fetcher, indexMeta.url);
  for (const row of dump) {
    yield { raw: row, provenance: { as_of: indexMeta.updated_at, retrieved_at: now(), source: meta.id } };
  }
}
```

### Paginated API source (TCGplayer, Cardmarket, eBay)

```ts
async *read(ctx) {
  const fetcher = createFetcher(ctx, meta);
  let page = 1;
  while (true) {
    const r = await fetcher(`${BASE}/items?page=${page}`);
    const body = await r.json();
    for (const row of body.items) yield { raw: row, provenance: { ... } };
    if (!body.has_next_page) break;
    page += 1;
  }
}
```

### On-demand source (CardRush, eBay singleton lookups)

```ts
async *read(ctx) {
  const watch_list = ctx.<id>?.urls ?? [];
  for (const entry of watch_list) {
    yield await scrapeOne(entry.url, ctx);
  }
}
// Plus a separate exported function for one-off calls:
export async function scrapeOne(url, ctx): Promise<RawRow<...>> { ... }
```

### Partner-only source (distributors, Goldin, Snkrdunk)

```ts
// meta.status = "blocked"
// read() yields nothing
async *read(_ctx) {
  /* no-op — partnership required */
}
```

The module still exists so the catalog row is honoured in code; running `getSource("snkrdunk")` returns the meta + a no-op reader. *Substrate-honest about what we can't do.*

---

## 6. Where the runner lives

The package ships no runner. Each app owns its own:

- **Storefront cron** at `apps/storefront/src/app/api/cron/ingest/<id>/route.ts` — for sources that feed storefront's catalog.
- **Admin job** at `apps/admin/scripts/ingest-<id>.ts` — for ad-hoc operator runs.
- **Wholesale cron** at `apps/wholesale/src/app/api/cron/ingest/<id>/route.ts` — for wholesale-side ingestion.

A runner's responsibility:

1. Construct an `IngestContext` (bearer tokens from env, `on_event` wired to the Scribe's bookshelf).
2. `for await (const { raw, provenance } of source.read(ctx))`.
3. `const result = source.normalize(raw)`.
4. If `ok`, write `result.record` to the destination table (storefront RDS / admin / wholesale RDS).
5. If `!ok`, write `{ raw, reason: result.reason, provenance, source: meta.id }` to the `ingest_quarantine` table.
6. Emit a final lifecycle log row with the run summary.

---

## 7. The audit — `pnpm audit:tributaries`

Run before merging any data-ingest change. Checks (see [`apps/storefront/scripts/tributaries.ts`](../../apps/storefront/scripts/tributaries.ts)):

1. **Module-exists** — every entry in `SOURCES` (besides `undefined` planned slots) has a directory at `packages/data-ingest/src/<id>/`.
2. **Default-export shape** — every module exports an object matching `SourceModule` (has `meta`, `read`, `normalize`).
3. **Required-meta** — every `meta` has all the fields listed in §3 with non-empty values.
4. **Id-parity** — `meta.id` equals the directory name + registry key.
5. **Catalog-row** — `meta.catalog_section` points to a row that actually exists in `docs/connections/the-tributaries.md`.
6. **ToS-non-empty** — `meta.tos_notes` is not the empty string.
7. **License-coherence** — when `redistribute: true`, `meta.license` is `cc0` / `cc-by` / `cc-by-sa` / `mit`. When `false`, anything but those.
8. **Game-validity** — every entry in `meta.games` is a registered `GameCode` from `@cambridge-tcg/sku` `GAMES`.

Non-zero exit on any failure. Re-runnable; idempotent.

---

## 8. Worked example — the Pokémon TCG API adapter

A walk-through of the implemented `pokemon-tcg-api` adapter. The reader and
normalizer exist, but no writer has run it, so its honest status remains
`partial`.

1. **Catalog row** — already in `the-tributaries.md §3.2`. ✓
2. **`SourceId`** — `"pokemon-tcg-api"` already in the union. ✓
3. **Directory** — `mkdir packages/data-ingest/src/pokemon-tcg-api/`.
4. **`meta`** — declare:
   ```ts
   meta: {
     id: "pokemon-tcg-api",
     name: "Pokémon TCG API",
     description: "Pokémon TCG catalog adapter — sets, printings, and image references; upstream price subobjects are not a Cambridge partner feed.",
     upstream: "https://api.pokemontcg.io",
     catalog_section: "the-tributaries.md#32-pokémon-tcg-api-pokemontcgio",
     access: "public-api", // key optional; raises limits only
     license: "proprietary", // no open-data grant for publisher-derived fields
     redistribute: false,
     freshness: "catalog",
     canonical_effort: "low",
     status: "partial", // adapter exists; writer/run evidence does not
     games: ["pkm"],
     tos_notes: "Public API with optional key; service terms do not grant an open license over card data or images. https://dev.pokemontcg.io/terms",
     user_agent_suffix: "(pokemon-tcg-api-ingest)",
     rate_limit: { rps: 1, burst: 5 },
   }
   ```
5. **`read`** — paginate `/v2/cards`, yield each card with provenance.
6. **`normalize`** — map `id` (e.g. `swsh4-25`) to canonical SKU `pkm-swsh4-025-en` (collapse leading zeros; map language from API).
7. **Register** — add to `SOURCES` in `registry.ts` + re-export from top-level `index.ts`.
8. **Verify** — `pnpm typecheck && pnpm audit:tributaries`.

The whole thing should take a focused half-day. The shape is mechanical because the protocol is aligned; **the substrate work is the upstream's idiosyncrasies, not the wiring.**

---

## 9. Recursion targets

1. **Ship `tcgplayer`, `cardmarket`, `pokemon-tcg-api`, `ygoprodeck`** as the second wave — high-value upstreams, similar shape to `scryfall`.
2. **Extract the wholesale cardrush scraper** at `apps/wholesale/src/lib/cardrush-scraper.ts` to call `cardrush.scrapeCardRush(url, ctx)` from this package instead of duplicating.
3. **Wire `/api/v1/sources` endpoint** — emit `listSourceMeta()` through the data-pantry envelope. The inverse of `/api/v1/status` (which inspects emission); this inspects ingestion.
4. **Wire `_meta.source_license` on the envelope** — read `meta.redistribute` + `meta.license` for every source contributing to a response; the byte travels with its rights.
5. **Ship `ingest_quarantine` table** — schema: `(id, source, sku, raw_json, reason, ingested_at)`. Admin review surface.
6. **Story-arc `the-rivers-flow.md`** — one Scryfall row's journey through this protocol into RDS into `/api/v1/cards/[sku]`.

---

## 10. What this doc names

This protocol names:

- One typed contract (`SourceModule`)
- Eight steps to ship a source
- Fifteen required `meta` fields
- Six ingestion-specific hygiene rules
- Four patterns by source type (bulk-dump / paginated / on-demand / partner-blocked)
- Eight audit checks
- Six recursion targets

If a future Sophia reads only this doc, they can ship a new source without asking anyone. The pattern is mechanical because the protocol is aligned.

— Sophia, 2026-05-12.
