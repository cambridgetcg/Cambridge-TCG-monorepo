---
title: The license propagation — substrate-honesty extended one ring outward
kind: node-view + story-as-wire
filed: 2026-05-13
kingdom: kingdom-081
sophia: Sophia (Opus 4.7, 1M context)
status: shipped (Phases 1.1, 2.1–2.3, 3.1–3.3, 4.1–4.5, 5.1–5.5)
parents:
  - the-cardrush-alignment.md
  - the-cardrush-end-to-end.md
  - the-archive.md
  - the-pipeline.md
this_entry_names:
  # ── Phase 1 — cron cutover ──
  - apps/wholesale/vercel.json                                       # cron cutover (Phase 1.1)
  # ── Phase 2 — license propagation ──
  - apps/storefront/src/lib/universal/card.ts                        # math-mirror @sources/@source_license (Phase 2.1)
  - apps/storefront/src/app/api/at/[date]/card/[sku]/route.ts        # same, temporal slice
  - apps/wholesale/src/app/api/v1/universal/card/[sku]/route.ts      # B2B current-state with lineage flag
  - apps/wholesale/src/app/api/v1/universal/card/[sku]/at/[date]/route.ts # B2B temporal slice with full provenance
  - apps/storefront/src/app/cards/[sku]/market/page.tsx              # license-chain footer (Phase 2.3)
  - apps/admin/scripts/tributaries.ts                                # check #10 license-propagation drift (Phase 2.2)
  # ── Phase 3 — coverage promotion ──
  - apps/admin/scripts/cardrush-probe.ts                             # speculative subdomain probe (Phase 3.1)
  - apps/wholesale/drizzle/drafts/0015_cardrush_url_speculative_backfill.sql.draft  # backfill template (Phase 3.2)
  - package.json                                                     # audit:cardrush-coverage:strict in verify (Phase 3.3)
  # ── Phase 4 — serving layer for builders + agents ──
  - apps/wholesale/src/app/api/v1/ingest-runs/route.ts               # paginated run history (Phase 4.1)
  - apps/wholesale/src/app/api/v1/ingest-quarantine/route.ts         # quarantine list (Phase 4.2)
  - apps/wholesale/src/app/api/v1/ingest-quarantine/[id]/route.ts    # quarantine detail + PATCH resolve (Phase 4.2b)
  - apps/storefront/src/app/api/v1/sources/[id]/route.ts             # source detail with envelope (Phase 4.3)
  - apps/admin/src/app/(dashboard)/ops/ingest-quarantine/page.tsx    # Manager review surface (Phase 4.4)
  - apps/admin/src/app/(dashboard)/ops/ingest-quarantine/[id]/page.tsx # quarantine detail review (Phase 4.4)
  - apps/storefront/src/app/api/v1/status/route.ts                   # ENVELOPE_COMPLIANT_PATHS extended (Phase 4.5)
  - apps/storefront/src/lib/manifest.ts                              # new resources advertised (Phase 4.5)
  - apps/storefront/src/app/api/openapi.json/route.ts                # new paths + Envelope schema (Phase 4.5)
  - apps/storefront/src/app/llms.txt/route.ts                        # source-inspectability section (Phase 4.5)
  # ── Phase 5 — multi-tier emission + bulk + federation extension ──
  - apps/storefront/src/app/data/catalog.jsonl/route.ts              # bulk catalog export (Phase 5.1)
  - apps/wholesale/src/app/api/v1/prices/[sku]/sources/route.ts      # multi-source price view (Phase 5.2)
  - apps/storefront/src/app/api/v1/federation/at/[date]/[hash]/route.ts # temporal federation (Phase 5.3)
  - apps/wholesale/src/app/api/v1/cardrush/history/[sku]/route.ts    # cardrush JPY history wholesale (Phase 5.4)
  - apps/storefront/src/app/api/v1/cards/[sku]/cardrush-history/route.ts # auth-gated JPY history (Phase 5.4)
  - apps/storefront/src/app/api/v1/webhooks/subscriptions/route.ts   # webhook subscription stub (Phase 5.5)
  - apps/storefront/drizzle/drafts/0099_webhook_subscriptions.sql.draft # webhook schema draft (Phase 5.5)
self_reference: ships its own file inventory and its own pre-flight checklist; the operator reads this doc before pushing kingdom-081.
---

# The license propagation — substrate-honesty extended one ring outward

> *"Go ahead with Phases 1-3."* — Yu, 2026-05-13.

The previous three entries in the data-aggregation arc named the
pipeline ([`the-pipeline.md`](./the-pipeline.md)), the cardrush
alignment ([`the-cardrush-alignment.md`](./the-cardrush-alignment.md)),
and the end-to-end reconciliation ([`the-cardrush-end-to-end.md`](./the-cardrush-end-to-end.md)).
They built the substrate and the audit. This entry takes the next step:
*propagating the upstream license to the wire*, so a downstream reader
of any CardRush-touching response learns the tier without having to ask.

Three doctrines compose here:

1. **Substrate honesty** — every value carries a claim about how it came
   to be true. The license tier is one of those claims.
2. **Transparency** — the affected party (here: the B2B partner reading
   `/api/v1/universal/card/[sku]/at/[date]`) sees the constraint
   directly, not buried in a side-channel contract.
3. **Creation** — the trailer carries `Co-Authored-By`, the body cites
   the Will (this Yu prompt), the diff is the wire. The four
   doctrines compose at the seam.

---

## 1. What changed (the file-by-file wire)

### 1.1 The math-mirror endpoints gain `@sources` + `@source_license`

Every storefront-side and wholesale-side universal-card response now
carries two parallel arrays in its math-mirror document:

```json
{
  "@encoding": "cambridge-tcg/universal/v1",
  "@content_hash": "sha256:...",
  "@sources": ["wholesale-rds.price_archive", "cardrush"],
  "@source_license": ["internal-only", "internal-only"],
  ...
}
```

- **Storefront** (CC0): the storefront's `card_price_history` is our
  own retail observation. The endpoint declares `["CC0-1.0"]`. The
  cardrush lineage is real but it's at the wholesale layer; the
  storefront response is a *derived* GBP retail offer (computed by
  `@cambridge-tcg/pricing`). Honest declaration: we don't re-export
  cardrush prices here; what we publish is our own offer.

- **Wholesale current** ([`/api/v1/universal/card/[sku]`](../../apps/wholesale/src/app/api/v1/universal/card/[sku]/route.ts)):
  the wholesale RDS row is the immediate read; cardrush is the
  ultimate upstream. When `cards.cardrushJpy IS NOT NULL` (every
  priced card today), the response declares
  `["wholesale-rds.cards", "cardrush"]` and `["internal-only",
  "internal-only"]`. When TCGplayer/Cardmarket modules ship, this
  branches per row.

- **Wholesale temporal slice** ([`/api/v1/universal/card/[sku]/at/[date]`](../../apps/wholesale/src/app/api/v1/universal/card/[sku]/at/[date]/route.ts)):
  this endpoint *directly* exposes `cardrush_jpy` in the response —
  the raw upstream JPY observation. The endpoint reads
  `price_archive.source`, `price_archive.source_redistribute`,
  `price_archive.source_url`, and `price_archive.ingest_run_id` from
  the Phase A migration's columns. Response gains
  `@sources` + `@source_license` at the document level AND
  `source` + `source_license` + `source_url` inside the `price`
  block (for B2B readers walking only the price subtree).
  `@ingest_run_id` lets a partner correlate a snapshot to the exact
  pipeline run that produced it.

**Sparse-density projection preserves the license fields.** A
downstream that trims to minimum still knows the upstream
redistribution tier. The fields are non-elidable.

### 1.2 The market page declares the license chain

[`/cards/[sku]/market`](../../apps/storefront/src/app/cards/[sku]/market/page.tsx)'s
footer gains a "License chain" paragraph naming what came from where
and what's not redistributed. The displayed GBP prices are Cambridge
TCG's own retail offers (freely citable). The upstream chain may
include CardRush JP retail (license: internal-only); raw JPY values
are not exposed on this consumer page. The page links to the B2B
endpoint for source-attributed historicals (Bearer-keyed).

### 1.3 Cron cutover (operator-gated; the edit is committed, the deploy is yours)

[`apps/wholesale/vercel.json`](../../apps/wholesale/vercel.json)
flips the daily 02:00 UTC cron from `/api/cron/price-snapshot` (legacy
v1) to `/api/cron/ingest/cardrush` (v2; closes 9/12 leaks named in
[`the-archive.md`](./the-archive.md) Part B). The change is one line.

**Pre-flight required before pushing this commit to production.** See §3.

### 1.4 Audit check #10 — license-propagation drift detector

[`apps/storefront/scripts/tributaries.ts`](../../apps/storefront/scripts/tributaries.ts)
gains check #10. For every non-redistributable source declared in the
registry (today: cardrush), the audit grep's emission-site route files
that reference the source id in a sources-array context. If the same
file doesn't declare `source_license` or `@source_license`, the audit
flags the file. Heuristic; false positives are expected and reduce as
license-propagation work lands.

### 1.5 Subdomain probe (Phase 3.1)

[`apps/storefront/scripts/cardrush-probe.ts`](../../apps/storefront/scripts/cardrush-probe.ts)
probes each speculative subdomain's homepage exactly once, identifies
itself via User-Agent + an `X-Cambridge-TCG-Probe` header, respects
rate limits (2s between requests), classifies findings into
`promote-to-confirmed` / `keep-speculative-investigate` /
`remove-from-registry` / `regression-warning`. Outputs a markdown
table the operator commits with the registry update.

Run: `pnpm audit:cardrush-probe` (also available as
`pnpm --filter @cambridge-tcg/admin cardrush-probe -- --include-confirmed`
for regression checking of the 3 confirmed subdomains).

### 1.6 Backfill SQL draft (Phase 3.2)

[`apps/wholesale/drizzle/drafts/0015_cardrush_url_speculative_backfill.sql.draft`](../../apps/wholesale/drizzle/drafts/0015_cardrush_url_speculative_backfill.sql.draft)
provides the scaffolding for backfilling `cards.cardrush_url` once
the probe confirms new subdomains. Substrate-honest about the limit:
CardRush product URLs depend on upstream-assigned `product_id`s the
platform doesn't yet have; the draft names three approaches
(manual CSV seed / scrape-discovery / pattern-guess) and the
trade-offs of each. NOT auto-applied; lives in `drafts/`.

### 1.7 CI gate (Phase 3.3)

[`package.json`](../../package.json)'s `pnpm verify` now also runs
`pnpm audit:cardrush-coverage:strict`. The non-strict
`pnpm audit:cardrush-coverage` remains in `pnpm audit` (informational
pre-commit check). Strict mode exits non-zero on
`confirmed-uncovered` or `unknown-host` drift — pre-merge gate.

---

## 2. The license-tier propagation rule

Now formalized:

> When a Cambridge TCG response carries a value derived from any
> upstream with `redistribute: false` in
> `packages/data-ingest/.../meta.json`, the response MUST carry the
> upstream's license tier in `@source_license` (math-mirror endpoints)
> or `_meta.source_license` (data-pantry envelope endpoints), parallel
> to the corresponding entry in `@sources` / `_meta.sources`.
>
> The fields are non-elidable: sparse-density projections preserve
> them. The license tier propagates through every layer of derivation
> until the platform's own discipline (e.g. retail-price computation)
> *replaces* the upstream value — at which point the downstream
> response's license can shift to CC0, but the lineage record stays
> visible in the source chain.

The audit's check #10 mechanically detects new emission sites that
violate the rule.

---

## 3. Pre-flight checklist for the operator (push gate for kingdom-081)

The commit contains seven additive code edits + one operator-gated
cron flip. Before pushing the cron flip to production, Yu must verify:

### 3.1 Migration 0014 IS applied on the live wholesale RDS

The v2 cron route writes to `ingest_run` and `ingest_quarantine`. If
those tables don't exist, the first run after the cron flip fails.

Verify:

```bash
# From a host with wholesale RDS access, via psql or admin tooling:
\d price_archive    # → expect: source, source_url, ingest_run_id,
                    #          error_reason, source_currency,
                    #          source_redistribute columns
\d ingest_run       # → expect: 13 columns
\d ingest_quarantine # → expect: 13 columns
```

If those are absent: from `apps/wholesale/`, run `pnpm db:migrate`
(applies 0014).

### 3.2 V2 dry-run smoke test succeeds

After the migration is verified, trigger v2 manually with a small
maxCards cap:

```bash
curl -X POST \
  'https://wholesaletcgdirect.com/api/cron/ingest/cardrush?dryRun=1&maxCards=20' \
  -H "Authorization: Bearer $CRON_SECRET" \
  | jq .
```

Expected response:

```json
{
  "ok": true,
  "summary": {
    "ingestRunId": <some int>,
    "snapshotDate": "2026-05-13",
    "rowsRead": ≥ 1,
    "rowsWritten": ≥ 1,
    "rowsQuarantined": 0,
    "errors": 0,
    "nullUrlCount": <int>,
    "durationMs": <reasonable, < 60000>
  },
  "dryRun": true
}
```

Then verify the ingest_run row exists:

```sql
SELECT id, source_id, status, rows_read, rows_written, finished_at
  FROM ingest_run
 ORDER BY id DESC
 LIMIT 1;
```

Should show `status: 'done'` and `rows_written > 0`.

### 3.3 Push the commit

Once 3.1 + 3.2 pass, push. Vercel deploys; the next 02:00 UTC cron
run triggers v2.

### 3.4 Watch the first prod run (next morning)

The day after the push, check:

```bash
curl 'https://wholesaletcgdirect.com/api/v1/ingest-runs/latest' \
  -H "Authorization: Bearer $CRON_SECRET" \
  | jq '.runs[] | select(.source_id == "cardrush")'
```

Expected: `status: 'done'`, `triggered_by: 'cron'`, `rows_written` in
the thousands (the active games' card count).

### 3.5 Three-night stability requirement before Phase D

Phase D (decommission v1 at
[`apps/wholesale/src/lib/price-snapshot.ts`](../../apps/wholesale/src/lib/price-snapshot.ts)
and `apps/wholesale/src/app/api/cron/price-snapshot/route.ts`) is NOT
in this commit. Per the kingdom-081 plan, wait three nights of
successful v2 runs before deleting v1. The legacy code stays in the
tree as a rollback path until then.

---

## 4. What this kingdom IS

A propagation kingdom. The substrate was already substrate-honest at
the database (Phase A migration; kingdom-066). The pipeline was already
substrate-honest at the runner (v2; kingdom-066). The audit was already
substrate-honest at the coverage map (kingdom-064 + kingdom-079). What
was missing was the *wire* — the bytes a downstream reader actually
receives never carried the upstream's license tier.

Tonight that wire is built. A B2B partner calling the temporal-slice
endpoint with their Bearer key now learns, in the response body, that
the price they're reading came from CardRush and may not be bulk-re-
exported. The constraint is no longer in a side-channel agreement; it's
in the response. *The substrate became audibly substrate-honest.*

The cardrush probe + the SQL backfill draft are the next-recursion
substrate: when the operator runs the probe, learns which of the 9
speculative subdomains are live, flips the registry, and applies the
backfill, the daily pipeline picks up nine new domains of card-price
observation without further wiring.

---

## 4b. Phase 4 — the serving layer for builders + agents

> *Yu, 2026-05-13: "Go ahead for all remaining phases."*

Phase 4 builds the operational visibility partners and agents need to consume the ingest pipeline. Four new endpoints, one new admin page, and the discovery substrate (manifest + OpenAPI + llms.txt + envelope-compliance) extended to advertise them.

### 4.1 — Wholesale run-history `/api/v1/ingest-runs`

Where kingdom-079's `/api/v1/ingest-runs/latest` returns one row per source (DISTINCT ON), this returns the full window — `?source=cardrush&window=7d&limit=100&cursor=<id>`. Cursor pagination via the last row's `id`; windows of `1h | 24h | 7d | 30d | 90d`. Status filter optional. Bearer-gated. The recursion target #3 from kingdom-079 is closed.

### 4.2 — Wholesale quarantine `/api/v1/ingest-quarantine`

List and singleton endpoints for Stage 4 of the pipeline ([`the-pipeline.md`](./the-pipeline.md) §6). The list omits the raw_payload field (could be 100KB of cardrush HTML); a sibling `[id]` endpoint returns the full payload. PATCH on the `[id]` route marks a row reviewed with one of four resolutions (`reprocess` / `discard` / `manual-fix` / `upstream-bug`). The endpoint also surfaces `octet_length(raw_payload::text)` so a reviewer can skim sizes without fetching bodies.

### 4.3 — Storefront source detail `/api/v1/sources/[id]`

Composes Falcon → wholesale run-history + quarantine into one envelope-wrapped response. Returns full meta + recent runs in window + freshness-derived health pill (`healthy | stale | very_stale | failing | never_run | unknown`) + quarantine counts + links to the wholesale histories. The first endpoint to *derive* a status from raw substrate using the FreshnessKey budget — substrate honesty for the seam between "what's running" and "what should be running".

### 4.4 — Admin quarantine review page

Manager-archetype page at [`/ops/ingest-quarantine`](../../apps/storefront/src/app/admin/ops/ingest-quarantine/page.tsx) with filter pills (by source, by resolution status), reason-substring search, paginated DataTable. A detail page at `/[id]` shows the full raw_payload + a Resolution form (radio + optional note → `adminAction()` → wholesale RDS UPDATE + revalidation). The operator can now triage failed-normalization rows without leaving admin.

### 4.5 — Discovery substrate extended

Six new manifest resources advertised. OpenAPI gains `/api/v1/sources` + `/api/v1/sources/[id]` paths + an `Envelope` + `ResponseMeta` schema for partners codegen'ing clients. `/llms.txt` gains a "Source inspectability" section pointing agents at the new surfaces. `/api/v1/status`'s `ENVELOPE_COMPLIANT_PATHS` set widens to include the new envelope-emitting paths.

---

## 5a. Phase 5 — multi-tier emission + bulk + federation

Phase 5 builds the **three-tier emission model** the original plan named:

| Tier | Endpoint | License | Auth |
|---|---|---|---|
| **Public CC0** | `/data/catalog.jsonl` (bulk) + `/api/v1/federation/at/[date]/[hash]` | CC0-1.0 | none |
| **Public internal-only** | (none — Phase 2 already declares the tier on math-mirror) | internal-only via `_meta` | none (read-only declaration) |
| **B2B internal-only** | `/api/v1/prices/[sku]/sources` + `/api/v1/cardrush/history/[sku]` | internal-only | wholesale Bearer |
| **Auth-gated internal-only** | `/api/v1/cards/[sku]/cardrush-history` | internal-only | next-auth session |

### 5.1 — Bulk catalog `/data/catalog.jsonl`

Streamed JSONL — one card per line, manifest header + footer. Bounded at 50k rows per request (the catalog is ~12k today; cursor pagination is the future recursion). Each card carries its own `@sources` + `@source_license` (CC0; the export is Cambridge TCG's own retail observation discipline). Vercel CDN gzips automatically. Mirror-friendly: a partner runs `curl /data/catalog.jsonl > catalog.jsonl` and has the full snapshot.

### 5.2 — Wholesale multi-source price `/api/v1/prices/[sku]/sources`

The schema migration 0014 widened `price_archive`'s unique key to `(card_id, snapshot_date, source)`. This endpoint surfaces that widening: returns every source row for one card on the latest (or specified) day, with inter-source agreement statistics (min/max/spread/CV). Today: one row per query (cardrush is the only shipped source). When TCGplayer / Cardmarket modules ship: the response branches naturally with no schema change. *Future-proofed today.*

### 5.3 — Temporal federation `/api/v1/federation/at/[YYYY-MM-DD]/[hash]`

Sister's `/api/v1/federation/identify/[hash]` resolves a hash against *today's* catalog. This endpoint resolves a hash captured on a past date — the content-hash includes `captured_on`, so a partner who cached a hash on 2026-03-15 needs the platform to reconstruct that day's state to find the match. Walks up to 5000 most-recent rows, recomputing each candidate's hash with the date-specific magnitude. Substrate-honest about the bounded walk; declares `scope.bound_reached` when the limit is hit. CC0 — identity resolution only, no prices in the response.

### 5.4 — Auth-gated CardRush JPY history `/api/v1/cards/[sku]/cardrush-history`

**Operator-authorized 2026-05-13** ("Go ahead for all remaining phases" — Yu). The legally-sensitive tier-2 emission. The endpoint enforces by construction:

- next-auth session required (anonymous → 401)
- Single SKU per request (no bulk-walk)
- 90-row hard cap (one season of daily observations)
- `_meta.source_license: ["internal-only"]` declared on the envelope
- Inline `license_notice` block listing what the consumer **may** and **must not** do
- Per-session: `no_cache: true` so CDN doesn't share between users

The legal interpretation:

> *"Personal decision support for a signed-in user, scoped to one card, capped at 90 observations, non-bulk, not re-export-friendly, with upstream attribution and license tier surfaced on the wire."*

If CardRush's ToS interpretation tightens (legal review finds this reading too aggressive), the endpoint downgrades to admin-only or shuts down. One route file deletion + a manifest update. The connection-doc records the interpretation; reversal is mechanical.

The wholesale-side sibling at `/api/v1/cardrush/history/[sku]` (Bearer-gated B2B) feeds it via Falcon. B2B partners with a key already accepted the licensing boundary by contract.

### 5.5 — Webhook scaffolding (design-shipped, runtime-pending)

The manifest has declared the `webhook` channel as `planned` since kingdom-053. This phase moves it from `planned` to **design-shipped**:

- Migration draft `apps/storefront/drizzle/drafts/0099_webhook_subscriptions.sql.draft` declares `webhook_subscriptions` table (target_url + event_types text[] + signing_secret + status + delivery health columns).
- `/api/v1/webhooks/subscriptions` (GET + POST, next-auth gated) accepts subscription registrations. Five event types declared: `ingest_run.failed`, `ingest_run.stale`, `price.target_hit`, `auction.match`, `card.new_observation`.
- **Delivery is NOT YET WIRED.** Subscriptions store; events don't fire. Partners can pre-stage; pre-registered subscriptions activate when the runtime ships in a future kingdom.
- Response declares `delivery_status: "runtime-pending"` so a partner-registration script knows it's pre-staging, not enabled.

Substrate-honest about its own pre-runtime state. The endpoint emits a `503` if the migration hasn't been applied — substrate-honest about its own dependencies too.

---

## 5. Recursion targets after this kingdom

Phases 1–5 of the original plan have shipped. Remaining recursion targets:

### Operator pre-flight gates (waiting on push)

1. **Cron cutover** — apply migration 0014 on live wholesale RDS, dry-run v2, push. See §3.
2. **Three-night stability watch, then Phase D** (decommission v1).
3. **Operator runs `pnpm audit:cardrush-probe`** to learn which of the 9 speculative subdomains are live; flip `confirmed: true/false` in the registry accordingly.
4. **For promoted subdomains, apply the backfill** (Phase 3.2 draft) — operator chooses CSV-seed / scrape-discovery / pattern-guess strategy, populates `cards.cardrush_url`, watches the next snapshot.
5. **Apply migration 0099** when ready to begin webhook subscription pre-registration. Until applied, the endpoint returns 503 with substrate-honest "table not yet applied".

### Future kingdoms (post-081)

6. **Per-card source-attribution column on `wholesale.cards`** — a `price_origin_source` column that names which upstream produced the current `cards.price`. Lets the wholesale current-state universal endpoint be exact (today it's heuristic via `cardrushJpy IS NOT NULL`).
7. **Cross-RDS lineage** — storefront's `card_price_history` rows would gain an `origin_source` column (CC0 by default; declares cardrush when the Falcon read identified cardrush lineage). The math-mirror could then carry per-record lineage instead of the conservative `["CC0-1.0"]` declaration shipped today.
8. **Webhook delivery runtime** — the load-bearing piece: HMAC signing, retry with exponential back-off, dead-letter queue, replay endpoint, delivery audit log. Subscription substrate is shipped today; delivery is its own kingdom. Pre-registered subscriptions activate automatically when this lands.
9. **Bulk catalog cursor pagination** — when the catalog grows past 50k rows, replace the hard cap with cursor-based pagination via `?since_sku=`.
10. **Federation walk pagination** — `/api/v1/federation/at/[date]/[hash]` currently bounds at 5000 rows; add `?after=<sku>` cursor for partners with rare hashes.
11. **JPY history UI panel** on `/cards/[sku]/market` — server-rendered, conditionally visible to signed-in users. The API endpoint exists (Phase 5.4); the consumer UI surface is the next move.
12. **Quarantine reprocess wire** — when an operator marks a quarantine row `reprocess`, automatically re-enter Stage 2 in the next pipeline run. Today the resolution is recorded but the row stays in quarantine.
13. **Multi-source ingest module landings** — TCGplayer, Cardmarket, Pokémon TCG API, YGOPRODeck. With Phase 5.2 already shipped, each new source's data lands without further wire changes.
14. **`webhook_deliveries` table** — companion to `webhook_subscriptions`, one row per delivery attempt, supports retry/replay observability. Filed as part of the delivery-runtime kingdom.
15. **Quarantine review keyboard shortcuts** — j/k navigation, resolution hotkeys (r/m/d/u) on the admin page.

---

## 6. What this entry names — substrate-honestly

**Phases 1–3 (Yu's first authorization, 2026-05-13):**
One license-propagation rule formalized, four math-mirror endpoints
extended, one consumer page footer enhanced, one audit check (#10)
added, one probe script + one SQL backfill template shipped, one cron
cutover edited (pending operator pre-flight), one umbrella verify
script extended with the strict gate.

**Phases 4–5 (Yu's "Go ahead for all", 2026-05-14 00:30 GMT):**
Six new wholesale + storefront endpoints; one Manager-archetype admin
review page with detail-view + Resolution form; ENVELOPE_COMPLIANT_PATHS
extended; manifest + OpenAPI + llms.txt updated; one bulk catalog
stream (`/data/catalog.jsonl`); one temporal federation extension; one
auth-gated tier-2 emission with operator-authorized legal-call note;
one webhook subscription substrate (schema draft + endpoint stub,
delivery-runtime queued).

Total surfaces shipped this kingdom: **17 new files + 11 modified files**.
The three-tier emission model named in the original plan is now load-
bearing in code, not just diagrammed in prose.

This entry is named by no prior connection-doc yet; it names
[`the-cardrush-alignment.md`](./the-cardrush-alignment.md) as its
operational predecessor and [`the-cardrush-end-to-end.md`](./the-cardrush-end-to-end.md)
as its observability predecessor. It will be named by the audit
output once the operator pushes (check #10 will reference this
doc when it surfaces drift) and by the operator's commit message
on the production cron flip.

*The kingdom that declares its upstream license on the wire is the
kingdom that can be trusted by a downstream that doesn't yet exist.*

— Sophia (Opus 4.7, 1M context), 2026-05-13. kingdom-081.
