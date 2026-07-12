---
title: The pipeline — aggregation structure, standardisation, and the barriers
shape: node-view
date: 2026-05-12
status: design
maturity: structural
doctrines: [substrate-honesty, transparency, meaning, creation]
this_entry_names:
  - packages/data-ingest/src/types.ts
  - packages/data-ingest/src/registry.ts
  - packages/data-ingest/src/runner.ts          # shipped with this doc
  - packages/data-spec/src/schemas/envelope.ts
  - apps/storefront/src/lib/data-pantry/
  - docs/methodology/source-protocol.md
  - docs/connections/the-tributaries.md
  - docs/connections/the-pantry.md
  - docs/connections/the-modules.md
  - docs/STANDARDS-LICENSE.md
parents:
  - the-tributaries.md
  - the-modules.md
  - the-distributor.md
  - the-pantry.md
self_reference: this entry names itself in `this_entry_names`; ships its
                own minimum runner alongside the design (story-as-wire).
---

# The pipeline — aggregation structure, standardisation, and the barriers

> **Current-status correction, 2026-07-11:** This May design records the
> intended pipeline shape, not current collection coverage. CardRush is the
> only upstream with observed rows. Scryfall and Pokémon adapters are built
> but have never run; YGOPRODeck and TCGplayer are blocked; Cardmarket's
> public-file reader is not wired. Public access, software licensing, content
> rights, and redistribution permission are separate facts.

> *"Dive deeper into the data aggregation protocol and standardisation, also the barriers and how to overcome them. Think structure, think pipeline."* — Yu, 2026-05-12.

The previous three entries named (a) the catalog of upstream rivers — [`the-tributaries.md`](./the-tributaries.md); (b) the typed contract every source implements — [`the-modules.md`](./the-modules.md) + [`packages/data-ingest/`](../../packages/data-ingest/); (c) the eight-step protocol for adding one — [`docs/methodology/source-protocol.md`](../methodology/source-protocol.md). This entry asks the **deeper** structural question: *what is the full pipeline from upstream HTTP response to partner `console.log`, and what does it take to keep it honest at scale?*

Three concerns intertwine here:

1. **Structure** — the seven stages, the contracts between them, the state machine each row follows, the schemas that catch failure visibly.
2. **Standardisation** — what Cambridge TCG turns *into a standard* (SKU, encoding, response shape, freshness language, license) and how an adopter wires to it without partnership.
3. **Barriers** — five categories (legal / technical / operational / trust / inclusive) that prevent aggregation from working naively, with the specific upstreams that hit each, and the tactic for overcoming each.

The doc is long because the topic is. A future Sophia opening this should be able to grep for *one specific concern* (TCGplayer's rate limit; how `ingest_run` should be designed; what `redistribute: false` does downstream) and find the substrate-honest answer in one place.

---

## 1. The pipeline at one glance

```
   upstream                                                              consumer
   sources                                                               surfaces
   ───────                                                               ────────
                ┌───────────┐    ┌────────────┐    ┌────────────┐
   TCGplayer ─→ │           │    │            │    │            │ ─→ /api/v1/cards/[sku]
   Cardmarket→  │  STAGE 1  │    │  STAGE 2   │    │  STAGE 3   │ ─→ /api/v1/prices/[sku]
   CardRush  ─→ │   READ    │ ─→ │ NORMALIZE  │ ─→ │   WRITE    │ ─→ /api/v1/status
   Scryfall  ─→ │           │    │            │    │            │ ─→ /api/v1/sources [planned]
   eBay      ─→ │ (typed R) │    │ (R → C ;   │    │ (C → RDS ; │ ─→ /data/catalog.jsonl.gz
   …         ─→ │           │    │  pure)     │    │  txn+dedup)│ ─→ /llms.txt
                └─────┬─────┘    └─────┬──────┘    └─────┬──────┘ ─→ /standards.json
                      │                │ (fail)          │                ▲
                      ▼                ▼                 ▼                │
                ┌──────────┐     ┌──────────┐     ┌──────────┐            │
                │ STAGE 0  │     │ STAGE 4  │     │ STAGE 5  │     ┌──────┴──────┐
                │ TOKEN    │     │ QUARAN-  │     │  CACHE   │     │  STAGE 6    │
                │ BUCKET + │     │  TINE    │     │ (Vercel  │ ←── │   PANTRY    │
                │ User-Agt │     │  TABLE   │     │   KV)    │     │  envelope + │
                └──────────┘     └──────────┘     └──────────┘     │ _meta.sources│
                      ▲                ▲                 │         └──────┬──────┘
                      │                │                 │                │
                ┌─────┴─────┐    ┌────-┴─────┐    ┌──────┴─────┐    ┌────-┴──────┐
                │  STAGE 7  │    │  Admin    │    │  STAGE 8   │    │ STAGE 9    │
                │ INGEST_RUN│    │  review   │    │  CRON      │    │ FEDERATION │
                │ TABLE +   │    │  surface  │    │  ORCHEST.  │    │ (content-  │
                │ lifecycle │    │  (rerun / │    │ + staleness│    │  hash      │
                │  events   │    │  resolve) │    │  detection │    │  addressing)│
                └───────────┘    └───────────┘    └────────────┘    └────────────┘
```

**The stages, named:**

- **Stage 0** — Token bucket + User-Agent (the gate before any upstream call).
- **Stage 1** — Read (typed raw rows + provenance).
- **Stage 2** — Normalize (raw → canonical, pure).
- **Stage 3** — Write (canonical → RDS, with dedup + idempotency).
- **Stage 4** — Quarantine (failed normalizations preserved, not dropped).
- **Stage 5** — Cache (Vercel KV, TTL per FreshnessKey).
- **Stage 6** — Pantry (data-pantry envelope; `_meta.sources`).
- **Stage 7** — Ingest run log (every run's substrate-honest record).
- **Stage 8** — Cron orchestration (scheduling, dependencies, staleness).
- **Stage 9** — Federation (content-hash addressing; sister-platform mirroring).

Each stage has a typed contract, an invariant, a failure mode. The next ten sections name each.

---

## 2. Stage 0 — Token bucket + User-Agent

**Contract:** every outbound HTTP call carries identification, respects rate limits, honours Retry-After.

**Where:** [`packages/data-ingest/src/http.ts`](../../packages/data-ingest/src/http.ts) — `createFetcher(ctx, meta)`.

**Invariants:**
- User-Agent always identifies us (`cambridgetcg.com/1.0 (admin@cambridgetcg.com)`).
- Per-source token bucket; one source's burst can't starve another.
- 429 / 503 → wait for `Retry-After` (or exponential back-off) → retry up to 3 times.
- `AbortSignal` cancellation respected at every stage.

**Failure mode:** network error after 3 retries throws to the runner; the runner catches and emits an `error` lifecycle event. Never silent.

**Substrate-honesty:** the upstream owner can find us by User-Agent. If we misbehave, they can ask us to stop. We will comply. *We do not pretend to be a browser.*

---

## 3. Stage 1 — Read

**Contract:** `read(ctx: IngestContext) => AsyncIterable<RawRow<R>>`.

**Where:** each source module's `read()` in `packages/data-ingest/src/<id>/index.ts`.

**Invariants:**
- Lazy — iterating later requests doesn't pre-fetch.
- Per-row provenance attached at yield time.
- Stops cleanly on `ctx.signal.aborted`.
- Emits lifecycle events at meaningful boundaries (`start` / `page` / `rate-limit` / `error` / `done`).
- Never throws on upstream errors; absorbs into a `null`-marked raw row and emits `error`.

**Patterns:**
- **Bulk-dump** (Scryfall, Pokémon TCG API, YGOPRODeck): fetch one big payload, iterate in-memory. Memory caveat documented per-source.
- **Paginated API** (TCGplayer, Cardmarket, eBay): walk pagination cursors; one page at a time.
- **On-demand** (CardRush, eBay singleton): `read()` iterates a watch-list from `ctx.<id>.urls`; expose `scrape<X>(url, ctx)` for one-offs.
- **Partner-blocked** (distributors, Goldin): `read()` yields nothing; module exists for documentation.

**Failure mode:** all errors are events, not exceptions. *The pipeline survives one upstream's failure.*

---

## 4. Stage 2 — Normalize

**Contract:** `normalize(raw: R) => { ok: true; record: C } | { ok: false; reason: string }`.

**Pure.** Same `raw` → same result, no I/O, no clock reads.

**Where:** each source module's `normalize.ts` in `packages/data-ingest/src/<id>/`.

**Invariants:**
- Never throws.
- `reason` is actionable (`"unmapped lang 'qya' (Quenya); add to LANG_MAP"`, not `"normalization failed"`).
- Canonical SKU is built via [`@cambridge-tcg/sku`](../../packages/sku/) — never hand-rolled.
- Variant tags use publisher terms where they exist (`etched`, `showcase`, `1st-edition`).
- Multi-language printings produce distinct SKUs (`mtg-otj-001-en` ≠ `mtg-otj-001-ja`).

**Standardisation lever:** the normalizer is the **single bottleneck** that turns every upstream's idiosyncratic id into a Cambridge TCG canonical SKU. *This is where Cambridge TCG's standard imposes itself.*

**Failure mode:** normalizer rejects → row goes to quarantine, not RDS. The reason becomes the audit trail.

---

## 5. Stage 3 — Write

**Contract:** the *app's* runner (not the package) writes the canonical record to its destination (storefront RDS / wholesale RDS / admin table).

**Where:** per-app cron route or admin job. Recommended layout in §17 below.

**Invariants:**
- One transaction per batch (typical: 100–500 rows). Partial-write atomicity.
- Dedup on `(canonical_sku, source_id)`. Same printing × same source → one row updated, never duplicated.
- Idempotent — running the same ingest twice doesn't double-count.
- Provenance fields written alongside the record: `source_id`, `as_of`, `retrieved_at`, `ingest_run_id`.
- Existing-row updates preserve provenance history (separate `<table>_history` or `<table>_lifecycle_log` — see the Scribe's bookshelf in [`packages/lifecycle/`](../../packages/lifecycle/)).

**Substrate-honesty:** when a row was overwritten, the lifecycle log says so. *The current row is a cache; the history is the substrate.*

**Schema sketch — destination side** (storefront RDS, illustrative):

```sql
ALTER TABLE card_set_cards
  ADD COLUMN scryfall_id text,
  ADD COLUMN tcgplayer_product_id integer,
  ADD COLUMN cardmarket_id_product integer,
  ADD COLUMN ingest_source text,           -- 'scryfall', 'tcgplayer', etc.
  ADD COLUMN ingest_as_of timestamptz,
  ADD COLUMN ingest_run_id bigint REFERENCES ingest_run(id);

CREATE UNIQUE INDEX card_set_cards_scryfall_id_idx
  ON card_set_cards(scryfall_id) WHERE scryfall_id IS NOT NULL;
```

The cross-source-id columns (`scryfall_id`, `tcgplayer_product_id`, `cardmarket_id_product`) are the **federation primitive** — they let a partner who knows TCGplayer's id resolve to our SKU, and vice versa.

---

## 6. Stage 4 — Quarantine

**Contract:** every `normalize()` failure produces a quarantine row, not silence.

**Where:** the app's runner writes to `ingest_quarantine`.

**Schema sketch:**

```sql
CREATE TABLE ingest_quarantine (
  id              bigserial PRIMARY KEY,
  ingest_run_id   bigint NOT NULL REFERENCES ingest_run(id),
  source_id       text NOT NULL,
  upstream_id     text,                  -- the raw row's upstream id, if extractable
  raw_payload     jsonb NOT NULL,        -- full raw row for replay
  reason          text NOT NULL,         -- normalizer's actionable reason
  as_of           timestamptz NOT NULL,
  retrieved_at    timestamptz NOT NULL,
  quarantined_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_at     timestamptz,
  reviewed_by     text,
  resolution      text                   -- 'reprocess', 'discard', 'manual-fix', 'upstream-bug'
);
CREATE INDEX ingest_quarantine_unresolved_idx
  ON ingest_quarantine(source_id, quarantined_at) WHERE reviewed_at IS NULL;
```

**Admin review surface** (planned then as `apps/admin/src/app/(dashboard)/ingest/quarantine/page.tsx`; shipped post-merge at [`apps/storefront/src/app/admin/ops/ingest-quarantine/page.tsx`](../../apps/storefront/src/app/admin/ops/ingest-quarantine/page.tsx)):
- Filter by `source_id`, `reason` cluster, age.
- Inspect raw payload.
- One-click reprocess (after the normalizer is fixed).
- Mark as `discard` / `manual-fix` / `upstream-bug`.

**Why this matters:** *failed rows are evidence*. A pattern of `"unmapped lang 'qya'"` from Scryfall tells us the LANG_MAP is incomplete. A pattern of `"missing collector_number"` tells us the upstream changed its schema. Quarantine is how the platform *learns from upstream drift* instead of corrupting its own data.

---

## 7. Stage 5 — Cache

**Contract:** read-through cache between the RDS and the pantry; TTL matches the source's `FreshnessKey`.

**Where:** [`packages/data-cache`](../../packages/) — **planned**, see [`the-modules.md`](./the-modules.md) recursion target.

**Invariants:**
- Cache key includes the canonical SKU + the `spec_version` from [`@cambridge-tcg/data-spec`](../../packages/data-spec/) — cache invalidates on shape change.
- TTL = `FRESHNESS[meta.freshness]` from data-spec.
- Cache miss is transparent in `_meta.cache_status` (planned envelope field) — substrate-honesty extended.
- Vercel KV the default backend; abstractable for self-hosting.

**Failure mode:** cache miss = cache disabled = direct RDS read. Cache outage degrades performance, not correctness. *Cache is an optimization, not a contract.*

---

## 8. Stage 6 — Pantry (emission)

**Contract:** every public response wears the `{ data, _meta }` envelope; `_meta.sources` lists every contributing upstream.

**Where:** [`apps/storefront/src/lib/data-pantry/`](../../apps/storefront/src/lib/data-pantry/) — `jsonResponse({ data, endpoint, sources, freshness, as_of })`.

**Invariants** (mirrors §1 of [`the-modules.md`](./the-modules.md)):
- `_meta.sources` array names every source that contributed.
- `_meta.as_of` is the *earliest* `as_of` across contributing records when the response is an aggregate (substrate-honesty: a response is only as fresh as its stalest component).
- `_meta.freshness_seconds` declares the platform's *intent* on this kind of data.
- `_meta.license` declares aggregate response rights. Cambridge-authored or explicitly first-party work may be CC0; mixed upstream-derived responses use `NOASSERTION` until field-level lineage supports a narrower claim.
- `_meta.request_id` is quotable in support.

**Standardisation lever:** the envelope is the **single shape** every public response wears. Partners learn it once. *This is where Cambridge TCG's protocol surfaces to the outside world.*

---

## 9. Stage 7 — Ingest run log

**Contract:** every ingest job emits one `ingest_run` row at start, updates it at finish.

**Schema sketch:**

```sql
CREATE TABLE ingest_run (
  id            bigserial PRIMARY KEY,
  source_id     text NOT NULL,                  -- 'scryfall', 'tcgplayer', etc.
  spec_version  text NOT NULL,                  -- @cambridge-tcg/data-spec version
  triggered_by  text NOT NULL,                  -- 'cron', 'admin', 'webhook'
  triggered_at  timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  status        text NOT NULL DEFAULT 'running',  -- 'running' | 'done' | 'failed' | 'aborted'
  rows_read     int NOT NULL DEFAULT 0,
  rows_normalized int NOT NULL DEFAULT 0,
  rows_written  int NOT NULL DEFAULT 0,
  rows_quarantined int NOT NULL DEFAULT 0,
  errors        int NOT NULL DEFAULT 0,
  events        jsonb,                          -- array of IngestEvent
  notes         text                            -- operator-supplied
);
CREATE INDEX ingest_run_source_recent_idx
  ON ingest_run(source_id, triggered_at DESC);
```

**Why this matters:**
- **Substrate-honesty:** when a partner asks *"when was the catalog last refreshed?"* the platform answers from this table, not from a guess.
- **Drift detection:** comparing `rows_read` over time surfaces upstream-shape changes (a sudden drop = something's broken).
- **Reproducibility:** the `events` jsonb + `spec_version` + `triggered_at` lets us reconstruct what the system saw at that moment.

The Scribe's bookshelf ([`packages/lifecycle/`](../../packages/lifecycle/)) gets an `ingest_run` slot factory so admin + storefront journey readers both see ingest events.

---

## 10. Stage 8 — Cron orchestration

**Contract:** each source has a cron route at the right cadence; dependencies between sources are explicit; staleness is detected.

**Schedule (per [`the-tributaries.md`](./the-tributaries.md) §12):**

| Source | Cadence | FreshnessKey |
|--------|---------|--------------|
| CardRush | observed rows; daily/on-demand intent | `price_current` |
| Scryfall | adapter built, never run; no scheduled job | `catalog` |
| Pokémon TCG API | adapter built, never run; no scheduled job | `catalog` |
| YGOPRODeck | blocked pending written commercial-content permission | none |
| TCGplayer | blocked; no acquisition or serving cadence | none |
| Cardmarket | public daily files exist; reader and writer not wired | none yet |
| eBay | partial adapter; no observed rows in current coverage | `market_signal` intent |
| Other reserved slots | no module or scheduled job | none |

**Dependencies:** Scryfall must complete before any MTG price ingest writes (a price has no home without a card). The runner checks `ingest_run.status = 'done'` for the dependency and waits if not.

**Staleness detection:** an admin dashboard query checks `now() - max(ingest_run.finished_at)` per source against the FreshnessKey; if 2× over budget, an alert fires.

**Where the routes live:**
```
apps/storefront/src/app/api/cron/ingest/<id>/route.ts   # storefront-fed
apps/wholesale/src/app/api/cron/ingest/<id>/route.ts    # wholesale-fed
apps/admin/scripts/ingest-<id>.ts                       # on-demand operator
```

Per-app placement matters because the destination table lives in that app's RDS.

---

## 11. Stage 9 — Federation (content-hash addressing)

**Contract:** a downstream partner who only has a sha256 content_hash can resolve back to a canonical SKU.

**Where:** [`/api/v1/federation/identify/[hash]`](../../apps/storefront/src/app/api/v1/federation/identify/) — *shipped* (sister-authored, kingdom S26).

**Why this matters:** federation is what turns Cambridge TCG from *an aggregator* into *a standard*. A partner platform can:
1. Mirror Cambridge TCG's canonical universal-card representation (content-hash addressable).
2. Cache responses by content_hash, not by SKU.
3. When the SKU changes (e.g. publisher renames a set code), the content_hash stays stable.
4. The federation endpoint resolves the hash back to the current SKU.

This is the **third-party-friendly identity** layer. Cambridge TCG's SKU is human-readable; the content_hash is machine-stable; both addressable.

**Standardisation lever:** federation makes Cambridge TCG's standard *portable*. Adopt the SKU + the content-hash + the federation endpoint, and you can interop with the kingdom without partnership.

---

## 12. Standardisation — what we standardise, who adopts, governance

### 12.1 What we standardise

Five layers, layered from most-foundational to most-emergent:

| Layer | What | Where | License |
|-------|------|-------|---------|
| **SKU format** | `<game>-<set>-<number>-<lang>[-<variant>]` | [`packages/sku`](../../packages/sku/) | CC0 |
| **Encoding** | Universal-representation (content-hash + ratios + ISO+epoch + typed edges) | [`apps/storefront/src/lib/universal/`](../../apps/storefront/src/lib/universal/) + [`/methodology/universal-representation`](../../apps/storefront/src/app/methodology/universal-representation/) | CC0 |
| **Response shape** | `{ data, _meta }` envelope with `spec_version` / `sources` / `freshness_seconds` / `license` / `request_id` | [`packages/data-spec`](../../packages/data-spec/) + JSON Schema 2020-12 | CC0 |
| **Freshness language** | The `FreshnessKey` enum (`catalog` / `price_current` / `market_signal` / etc.) | [`packages/data-spec/src/freshness.ts`](../../packages/data-spec/src/freshness.ts) | CC0 |
| **Source license declaration** | Per-record `_meta.source_license` array | *planned* — envelope extension | CC0 (the spec; per-record license is the upstream's) |

**The corpus license is CC0** ([`docs/STANDARDS-LICENSE.md`](../STANDARDS-LICENSE.md)). Adopters get the contract free, forever. They get attribution-free use. They get *no usage tax*.

### 12.2 Who adopts (the four roles)

| Role | Adopts | What they get | What they give back |
|------|--------|---------------|---------------------|
| **Mirror** | SKU + encoding + envelope shape | A free downstream catalog API; partner-callers can substitute Cambridge TCG for their own | Attribution in their published responses (optional but encouraged) |
| **Builder** | SKU + envelope + `data-spec` JSON Schemas | Codegen-friendly client libraries; one contract across all integrations | Bug reports against the spec |
| **Aggregator** | SKU + the federation primitive (content-hash addressing) | Cross-platform card identity; partners can interop via hash even when SKUs diverge | Federation responses when their hash is asked of them (eventual: bilateral) |
| **Standard-citer** | The spec corpus as a citation | A documented, evolving, CC0 reference they can build their own product on | Citing the spec by URL + version |

**Substrate-honesty:** no role requires a partnership. No role requires payment. The CC0 license is the only contract. *Cambridge TCG offers the standard to be adopted; it does not gatekeep adoption.*

### 12.3 Governance — how the standard evolves

**Spec versioning** (the [`packages/data-spec`](../../packages/data-spec/) `SPEC_VERSION` constant, currently `"1"`):

- **Breaking changes** (new required field on `_meta`, removed field, semantic shift on an existing field) → bump `SPEC_VERSION` to `"2"`. Old responses continue to be served at `/api/v1/*` with `_meta.spec_version: "1"`; new responses at `/api/v2/*` with `"2"`. Deprecation window: 12 months minimum. Old endpoint emits `_meta.deprecation: { sunset, replacement }`.
- **Non-breaking additions** (new optional field, new `FreshnessKey`, new `ErrorCode`) → no version bump. Add to `data-spec`, ship.

**Change-log:** `docs/STANDARDS-CHANGELOG.md` — *planned, not yet shipped*. Versioned feed of changes. Citable. RSS-friendly.

**RFC process:** for breaking changes, write a connection-doc (`docs/connections/the-spec-v<N>.md`) describing the change + rationale + migration path + community feedback before bumping `SPEC_VERSION`. Mirrors how IETF RFCs work, scaled down.

**Quorum:** Yu decides (single-operator governance). When the platform grows past one operator, the quorum extends.

### 12.4 The adopter protocol

For a partner adopting Cambridge TCG's standard:

1. Read [`/standards`](../../apps/storefront/src/app/standards/) and the linked `data-spec` schemas.
2. Cite the CC0 license — no royalty owed, but attribution-by-URL is recommended.
3. Implement the envelope shape on your own responses.
4. Use the canonical SKU format on your own catalog.
5. (Optional) Federate: implement `/api/v1/federation/identify/[hash]` on your platform so Cambridge TCG can resolve your hashes too. Bilateral.
6. Register at `/standards/adopters` ([`apps/storefront/src/app/standards/adopters/page.tsx`](../../apps/storefront/src/app/standards/adopters/page.tsx)) — *currently empty; the registry exists for the first adopter*.

That's the protocol shape. Activating a source also requires a rights intake
for the exact access, content, use, and redistribution scope. A working
credential does not replace permission.

---

## 13. The barriers — substrate-honest names

Five categories. Each has specific upstream examples and a tactic for overcoming.

### 13.1 Legal barriers

| Barrier | Concrete examples | Tactic |
|---------|-------------------|--------|
| **ToS forbids scraping** | Mercari (JP + US), Yahoo Auctions JP, Bandai TCG+ mobile app | Skip. Document the gap honestly in [`the-tributaries.md`](./the-tributaries.md) "what we cannot get". A partner who *can* access the source can mirror to us via the federation primitive. |
| **Public API policy is not an open-data license** | Scryfall, Pokémon TCG API | Record `license: proprietary`, `redistribute: false`; use only within the evidenced policy and do not bulk-relicense upstream fields. |
| **Terms conflict with Cambridge's aggregation shape** | TCGplayer; YGOPRODeck commercial content | Block before credentials or network. Reopen only after written permission covers the exact use. |
| **Public files exist without an open-data grant** | Cardmarket Product Catalog + Price Guide | Build against the intentional public files, preserve attribution and proprietary rights, and keep raw redistribution false. |
| **Publisher-owned images** | Wizards (MTG), TPCi (Pokémon), Konami (Yu-Gi-Oh), Bandai (One Piece, Digimon, DBF) | Hot-link the publisher's CDN (don't re-host). Cache only the URL, not the bytes. Surface a `provenance: "publisher-derived"` note on the response. |
| **GDPR / privacy on user-identifying data** | eBay seller identifiers, social-sentiment authorship | Hash author identifiers before storing; never persist personally-identifiable data unless the originating user consented (storefront RDS users have consented; upstream platform users have not). |
| **Pre-release embargo** | Publisher set rotations, leaked spoilers | Honour publisher embargo dates; mark embargoed records with `meta.embargoed_until`; filter from public responses until the date passes. |

### 13.2 Technical barriers

| Barrier | Concrete examples | Tactic |
|---------|-------------------|--------|
| **Strict rate limits** | eBay (varies by approved program tier), Scryfall and Pokémon TCG API policy limits | Stage 0 token bucket per permitted source. Prefer intentional bulk files where available. A rate limit does not imply permission to activate. |
| **Pagination complexity** | eBay cursor-based; some APIs offset-based with max-page caps; some have no total-count and force "walk until empty" | Wrap in the source's `read()` async iterator; per-source pagination logic is the implementation detail. Standardise the output (one row per yield), not the input. |
| **Schema drift** (upstream renames a field, changes type, removes a value) | Any source can do this; Scryfall has shipped renames historically | The normalizer's `{ ok: false, reason }` catches it visibly. Quarantine accumulates; the pattern surfaces; operator fixes the normalizer. *Drift is detected, not hidden.* |
| **SKU-mapping mismatches** (one upstream id → many printings; many upstream ids → one printing) | TCGplayer productId is per-printing-per-condition; Cardmarket idProduct is per-printing-per-language; some upstreams collapse foil + non-foil into one record | Per-source mapping logic in `normalize.ts`. When ambiguous, the row goes to quarantine with `reason: "ambiguous SKU mapping; see docs/connections/the-pipeline.md §13.2"`. Operator-resolved. |
| **Variant explosion** (foil, etched, showcase, alt-art, full-art, 1st edition, …) | All TCGs have these; some publishers structure them in API (Scryfall: `frame_effects` + `promo_types`); some don't (CardRush: only condition) | The `variant` field in `CanonicalCard` is publisher-derived where structured, omitted where unclear. The SKU's optional `-<variant>` tail captures it. |
| **Multi-language printings** | Most TCGs ship in 4–11 languages; the same printing has its own SKU per language | Canonical SKU language code = ISO 639-1 (`-en`, `-ja`, `-zh`, `-ko`, `-fr`, etc.). Per-language normalizers in [`packages/data-ingest/src/scryfall/normalize.ts`](../../packages/data-ingest/src/scryfall/normalize.ts) `LANG_MAP`. |
| **Image deduplication** | Same printing → 5 different image hosts (Scryfall, TCGplayer, eBay, Pokémon TCG API, custom seller upload) | Prefer the publisher-affiliated source; the `image_url` column has a single value but a `image_sources` jsonb column (planned) records all known URLs. |
| **Sealed product vs singles** | Different schemas; sealed has product_type/age_rating/etc; singles has card-level fields | Discriminated-union canonical: `{ kind: "card"; data: CanonicalCard }` vs `{ kind: "sealed"; data: CanonicalSealed }` (sealed type planned). Each source's normalizer emits the appropriate kind. |

### 13.3 Operational barriers

| Barrier | Concrete examples | Tactic |
|---------|-------------------|--------|
| **Paid feed cost** | TCGCSV (~$50/mo), Untapped.gg, sentiment APIs | Budgeted per upstream; the partner-only tier is the only path for some upstreams; cost amortised across partners adopting our standard. |
| **Compute cost** | Running 10+ daily ingests; processing bulk dumps in memory | Stagger by `triggered_at`; use streaming JSON parsers for large dumps; cron compute on Vercel Functions (currently free tier). |
| **Storage cost** | Full Scryfall bulk = ~500MB; historical price-series across millions of SKUs = TBs over years | RDS storage budget; archive cold history to S3 (parquet); Stage-5 cache absorbs most read load. |
| **Maintenance burden** when a parser breaks | Single-operator (Yu) can only fix one parser at a time; sister Sophias parallelize | The audit + quarantine make breaks visible; the protocol makes fixes mechanical; pair-of-cuts (Yu + Sophia) means parallel investigation. |
| **Single-engineer risk** | If Yu is unavailable, fixes don't ship | The protocol is mechanical (8 steps); a future operator can fix one source without understanding the whole system. The protocol's substrate is *legible-by-default*. |

### 13.4 Trust + quality barriers

| Barrier | Concrete examples | Tactic |
|---------|-------------------|--------|
| **Stale data** (upstream cached longer than its declared freshness) | Most price-aggregator caches; Cardmarket weekly bulk | `_meta.as_of` declares the *upstream's* timestamp, not just when *we* fetched. Substrate-honest about staleness chains. |
| **Adversarial data** (sellers gaming TCGplayer market price by listing-then-cancelling) | A known TCGplayer + eBay vector | Cross-source aggregation: when 3 sources agree on a price within 20%, mark `confidence: high`; when one source diverges by 5×, mark `confidence: low` and `outlier: true`; downstream display the divergence honestly. |
| **Mislabeled records** (upstream has the wrong card image / oracle text) | Happens at publisher official sites; very common at TCGplayer for new sets | Publisher-affiliated sources (Scryfall for MTG, Pokémon TCG API for Pokémon) are the authoritative tier; commercial-aggregator sources are the secondary tier; partner-platform sources are tertiary. Conflict resolution names which tier wins. |
| **Provable lineage** (downstream wants to verify our claim) | Auditor / archivist participants | Content-hash addressing (§11) + `ingest_run` log (§9) + `_meta.sources` (§8) = lineage is queryable. *Any record can prove its origin.* |

### 13.5 Inclusive / cosmological barriers (the fifth question)

| Barrier | Concrete examples | Tactic |
|---------|-------------------|--------|
| **English-only catalog descriptions** | Scryfall's `printed_name` covers non-English; many sources don't | Per-language `name` + `oracle_text` where the source provides; fall through to the English when not. Future: machine-translation marker `name_translated: true` so downstream knows. |
| **Synchronous API exclusion of async partners** | Webhook-only or polling-based partners | The `response_window_hours` user column (kingdom-051); future `/api/v1/sync/digest` endpoint emitting an email-digest-style batch summary; rss/webhook channels named in manifest (currently planned). |
| **JSON-only formats exclude RDF / Linked Data consumers** | Library catalogers, semantic-web participants | `Accept: text/turtle` → emit as RDF Turtle; `Accept: application/ld+json` → JSON-LD with schema.org Card context. Currently planned. |
| **Sighted-only image alt-text gaps** | Most upstreams don't provide alt-text | Per-SKU alt-text generation (manual + LLM-assisted); the `image_alt` field on `CanonicalCard` (currently optional → recommended). |
| **Audience-of-one defaults** | Many endpoints assume "the requesting user is the subject" | Per-endpoint `audience` query param (planned); cosmology axis explicit; see [`/methodology/cosmology`](../../apps/storefront/src/app/methodology/cosmology/page.tsx). |

---

## 14. The row state machine

Each row that enters the pipeline transitions through a known set of states. *Substrate-honesty about where the row is.*

```
                      upstream
                          │
                          ▼
                  ┌───────────────┐
                  │  DISCOVERED   │  (in upstream's catalog, not yet fetched)
                  └───────┬───────┘
                          │ Stage 1 (read)
                          ▼
                  ┌───────────────┐
                  │   FETCHED     │  (raw row in memory; provenance attached)
                  └───────┬───────┘
                          │ Stage 2 (normalize)
                          ├────────────────────────────────────┐
                          ▼                                    ▼
                  ┌───────────────┐                  ┌───────────────┐
                  │  NORMALIZED   │                  │ QUARANTINED   │
                  └───────┬───────┘                  └───────┬───────┘
                          │ Stage 3 (write)                  │ Stage 4
                          ▼                                  │
                  ┌───────────────┐                          │
                  │   WRITTEN     │                          │
                  └───────┬───────┘                          │
                          │ Stage 5 (cache miss; lazy)       │
                          ▼                                  │
                  ┌───────────────┐                          │
                  │    CACHED     │                          │
                  └───────┬───────┘                          │
                          │ Stage 6 (pantry emit)            │
                          ▼                                  │
                  ┌───────────────┐                          │
                  │    SERVED     │  → partner               │
                  └───────────────┘                          │
                                                             │
                                                             │ admin review (Stage 4 cont.)
                                                             ├── reprocess → re-enters Stage 2
                                                             ├── manual-fix → re-enters Stage 3
                                                             ├── discard → terminal
                                                             └── upstream-bug → terminal (logged)
```

**Invariants:**
- A row is in exactly one state at any time.
- Transitions are logged in `ingest_run.events`.
- `QUARANTINED` is not a failure state — it's a state the operator can resolve.
- `DISCARDED` rows still leave a quarantine record for forensics.

---

## 15. Versioning + governance — detailed

### 15.1 The spec_version table

| Aspect | Version 1 (current) | Notes |
|--------|---------------------|-------|
| Envelope shape | `{ data, _meta }` | shipped |
| Required `_meta` fields | spec_version, endpoint, retrieved_at, as_of, sources, freshness_seconds, license, request_id, deprecation, next_link, self_reference | shipped |
| Error shape | `{ error: { code, message, request_id, docs?, details? } }` | shipped |
| FreshnessKey set | catalog, price_current, price_historical, market_signal, status, methodology, identity, adopters | shipped |
| Error code set | INVALID_INPUT, INVALID_SKU, MISSING_PARAM, NOT_FOUND, RATE_LIMITED, INSUFFICIENT_TIER, UNAUTHORIZED, SOURCE_UNAVAILABLE, DEPRECATED, INTERNAL | shipped |
| Per-record provenance | `@as_of` / `@retrieved_at` / `@sources` | shipped |
| `_meta.source_license` per-record license propagation | **planned** | breaking? — additive optional field is non-breaking |

### 15.2 Deprecation flow

When a field is to be removed:

1. Ship the replacement at `/api/v(N+1)/`.
2. Old endpoint at `/api/vN/*` adds `_meta.deprecation: { sunset: "2027-05-12T00:00:00Z", replacement: "/api/v2/..." }`.
3. 12-month deprecation window (minimum).
4. Sunset date → endpoint returns `410 DEPRECATED` with `_meta.deprecation` pointing to replacement.
5. Sunset entry logged in `docs/STANDARDS-CHANGELOG.md`.

### 15.3 RFC process (for breaking changes)

A new `docs/connections/the-spec-v<N>.md` is the RFC. It names:
- The change.
- The rationale (with examples of what's broken under v(N-1)).
- The migration path (what an adopter does to upgrade).
- Backward-compatibility shims (if any; usually a `/v(N-1)/` retain).
- A 30-day feedback window before the version is finalised.

Yu approves single-operator. Future-operator quorum is unfinalised.

---

## 16. Observability

Every pipeline run is observable through five surfaces:

| Surface | Granularity | Audience |
|---------|-------------|----------|
| `ingest_run` table | One row per run | operators (admin dashboard) |
| `ingest_run.events` jsonb | One entry per lifecycle event | operators (deep debugging) |
| `ingest_quarantine` table | One row per failed normalization | operators (drift detection) |
| Scribe lifecycle log (cross-app) | One entry per state transition | partners + operators (via [`/api/account/journey`](../../apps/storefront/src/app/api/account/journey/route.ts) and admin journey) |
| `/api/v1/sources` | Aggregate per-source state | partners + agents |

**Alerts** (planned):
- `ingest_run.status = 'failed'` 2× in a row → operator email.
- `now() - max(ingest_run.finished_at) > 2 * FRESHNESS[source.freshness]` → operator email + dashboard banner.
- `ingest_quarantine` unresolved count > 100 per source → operator email.

**Trust ladder** (the `/api/v1/sources` endpoint, planned):
```
{
  data: {
    sources: [
      {
        id: "scryfall",
        last_finished_at: "2026-05-12T03:14:22Z",
        freshness_seconds: 86400,
        rows_written_last_run: 89432,
        rows_quarantined_last_run: 12,
        recent_runs: [...],
        status: "healthy" | "stale" | "failing"
      },
      ...
    ]
  },
  _meta: { ... }
}
```

Substrate-honest. Partners poll this to know whether to trust an aggregate response.

---

## 17. The runner — the minimum stage-composition

Each app's runner wraps the package's `runSource()`. The package ships the composition; the app supplies the destination.

**Package side** ([`packages/data-ingest/src/runner.ts`](../../packages/data-ingest/src/runner.ts) — shipped with this doc):

```ts
export async function runSource<R, C>(
  source: SourceModule<R, C>,
  ctx: IngestContext,
  writer: (record: C) => Promise<void>,
  quarantineWriter: (entry: { raw: R; reason: string; provenance: RawProvenance }) => Promise<void>,
): Promise<RunSummary> { /* combines read + normalize + dispatch */ }
```

**App side** (storefront cron, sketch):

```ts
// apps/storefront/src/app/api/cron/ingest/scryfall/route.ts
import { scryfall, runSource } from "@cambridge-tcg/data-ingest";
import { query } from "@/lib/db";

export async function POST(req: Request) {
  await assertCronSecret(req);
  const ingest_run_id = await query(
    `INSERT INTO ingest_run (source_id, spec_version, triggered_by)
       VALUES ('scryfall', '1', 'cron') RETURNING id`,
  );

  const summary = await runSource(
    scryfall,
    {
      on_event: async (ev) => { /* append to ingest_run.events */ },
      signal: AbortSignal.timeout(45 * 60 * 1000),  // 45min cap
    },
    async (record) => {
      await query(
        `INSERT INTO card_set_cards (sku, game, set_code, ...)
           VALUES ($1, $2, $3, ...)
         ON CONFLICT (sku) DO UPDATE SET ...`,
        [record.sku, record.game, record.set, ...],
      );
    },
    async (q) => {
      await query(
        `INSERT INTO ingest_quarantine (ingest_run_id, source_id, raw_payload, reason, as_of, retrieved_at)
           VALUES ($1, 'scryfall', $2, $3, $4, $5)`,
        [ingest_run_id, q.raw, q.reason, q.provenance.as_of, q.provenance.retrieved_at],
      );
    },
  );

  await query(
    `UPDATE ingest_run SET finished_at = now(), status = 'done', rows_read = $1, ... WHERE id = $2`,
    [summary.rows_read, ingest_run_id],
  );

  return Response.json(summary);
}
```

The runner is ~50 lines (see the shipped file); the app's wrapper is similarly short. **Adding a new source's cron route is template-mechanical.**

---

## 18. Inclusive emission — multi-format paths

For non-default consumers (RDF readers, terminal-only agents, async-only partners, screen-reader audiences):

| Consumer | Path | Format | Status |
|----------|------|--------|--------|
| Browsers | `/api/v1/cards/[sku]` | JSON envelope | planned |
| RDF / Linked Data | `/api/v1/cards/[sku]` `Accept: text/turtle` | RDF/Turtle | planned |
| JSON-LD / schema.org | `/api/v1/cards/[sku]` `Accept: application/ld+json` | JSON-LD | planned |
| Terminal / curl | `/api/v1/cards/[sku]` `Accept: text/plain` | plain-text card sheet | planned |
| Screen readers | (no change) | JSON + `image_alt` field | planned |
| Async batch | `/api/v1/sync/digest` (webhook) | aggregated JSON | planned |
| Email digest | (manifest channel `email-digest`) | per-user opt-in summary | planned |
| RSS | (manifest channel `rss`) | Atom/RSS feed | planned |

The data is the same; the emission shape varies. *Different audiences, same substrate.* Cosmology axes from [`/methodology/cosmology`](../../apps/storefront/src/app/methodology/cosmology/page.tsx) inform what we emit for whom.

---

## 19. Recursion targets (this doc's promises)

Ordered roughly by leverage × tractability:

1. **Ship `ingest_run` + `ingest_quarantine` tables** as SQL migrations. The schemas above are the design; a migration file in `apps/storefront/drizzle/NNNN_ingest_tables.sql` is the next step.
2. **Wire `_meta.source_license` per-record propagation** in `packages/data-spec/src/schemas/envelope.ts` — add the optional field; envelope.ts attaches it from `source.meta.license` when emitting; non-breaking.
3. **Ship `/api/v1/sources` endpoint** — composes through `jsonResponse`; reads `ingest_run` for last-run state per source. The inverse-of-`/api/v1/status` for ingestion.
4. **Wire Cardmarket's public-file reader after field-rights design.** Keep TCGplayer and YGOPRODeck blocked; run a fresh rights intake before activating Scryfall or Pokémon.
5. **Ship the `ingest_quarantine` admin review surface** — a Manager-archetype page at `apps/admin/src/app/(dashboard)/ingest/quarantine/page.tsx`.
6. **Ship `docs/STANDARDS-CHANGELOG.md`** — versioned feed of spec changes; first entry is v1 (current state).
7. **Write `the-rivers-flow.md` as a story-arc** — one Scryfall row's journey through every stage above to a partner's `console.log`.
8. **Ship RDF + JSON-LD content negotiation** — multi-format emission for non-default consumers (§18).
9. **Ship `data-cache` package** — Stage 5 of the pipeline; Vercel KV backend.
10. **Wire cron orchestration** — per-source cron routes with dependency checks and staleness alerts (§10).

---

## 20. What this entry names — substrate-honestly

Ten pipeline stages, five barrier categories, seven row states, three governance flows, two table designs, eighteen recursion targets across this doc and its parents. The full structure of *how data becomes truth* on Cambridge TCG, from one upstream HTTP call to one partner's `console.log`, with the substrate-honest naming of every place the structure can fail.

This entry ships its own minimum runner ([`packages/data-ingest/src/runner.ts`](../../packages/data-ingest/src/runner.ts)) — story-as-wire form. The transport shape is reusable; the rights review is source-specific. The next source ships only when both are real.

It is named by [`the-tributaries.md`](./the-tributaries.md) (the upstream catalog), [`the-modules.md`](./the-modules.md) (the layer map), [`the-distributor.md`](./the-distributor.md) (the strategic positioning), [`the-pantry.md`](./the-pantry.md) (the downstream architecture). It will be named by `the-rivers-flow.md` (planned story-arc) and by every per-source ingest module that ships under `packages/data-ingest/`.

The kingdom now has:

- **A catalog** of upstream rivers (the-tributaries).
- **A contract** every source implements (data-ingest types).
- **A protocol** for adding one (source-protocol.md).
- **A pipeline** with named stages, barriers, and tactics (this doc).
- **An audit** that mechanically verifies conformance (audit:tributaries).
- **A standard** that's CC0 and partnership-free (data-spec + sku + universal-representation).

What's missing is mostly **reviewed instances** — the second, third, tenth source. No engineering estimate substitutes for access and rights evidence.

— Sophia, 2026-05-12.
