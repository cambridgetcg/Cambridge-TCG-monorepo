# The card batch — one known bundle, one honest read

> **Seed.** A deck builder, binder importer, bot command, or comparison view
> already knows the card identifiers it needs. Making it send one request per
> card is needless friction; making it walk a server-driven catalogue when it
> already has a working set is needless work. The useful middle is a bounded
> request for **1–100 known SKUs**.
>
> **Paths.** The shared contract and one-query resolver live in
> [`apps/storefront/src/lib/catalog/card-batch.ts`](../../apps/storefront/src/lib/catalog/card-batch.ts).
> The public REST door is
> [`apps/storefront/src/app/api/v1/cards/batch/route.ts`](../../apps/storefront/src/app/api/v1/cards/batch/route.ts).
> The authenticated agent door, `catalog.lookup_many`, lives in
> [`apps/storefront/src/lib/agents/card-batch-tools.ts`](../../apps/storefront/src/lib/agents/card-batch-tools.ts)
> and is composed into
> [`apps/storefront/src/app/api/mcp/route.ts`](../../apps/storefront/src/app/api/mcp/route.ts).

`POST /api/v1/cards/batch` fills the space between the singleton card routes
and full catalogue surfaces. It answers one narrow question:

> For these identifiers that the caller already chose, what does Cambridge's
> storefront mirror currently know?

It is useful substrate for deck views, binder reconciliation, collection
checks, chat commands, card comparison, and any application that has a small
working set. It does not add a server-driven acquisition path.

## The request

The entire body is one field:

```json
{
  "skus": [
    "op-op01-001-ja",
    "pkm-sv3-025-en",
    "op-op01-001-ja"
  ]
}
```

There must be between 1 and 100 entries. Each entry must be a non-blank string
of at most 160 characters. Unknown request fields are rejected rather than
quietly ignored. This prevents an apparent option such as `include_stock`,
`all_cards`, or `since` from looking supported when it is not.

The REST body is also capped at 131,072 bytes before JSON parsing. The shared
MCP gate caps its request body at 1 MiB before authentication or dispatch.
Both readers cancel an over-limit stream, so a chunked body cannot bypass the
logical `100 × 160` limits by making the server buffer it first.

The service trims input strings, understands canonical Cambridge SKUs and the
recognised frozen legacy forms that carry enough segments to recover a
canonical identity, and keeps the caller's spelling in
`requested_sku`. Alias tolerance helps find an existing identity; it does not
create a new identity claim.

For example, `EB-EB01-001-JP`, `PK-SV2A-011-JP-V4K5`, and
`FB-FB01-001-JP` map through the Atlas to canonical game codes. A short shape
such as `P-001-JP` identifies a game but does not state a canonical set, so it
returns `invalid_sku` instead of making one up.

## One query, one position per request

All valid exact canonical and frozen-case lookup candidates are de-duplicated
before the database read. The raw `sku` equality uses the mirror's existing
SKU index. The mirror is then read once, not once per SKU. After that single
read, the resolver reconstructs the result in the exact order supplied by the
caller.

Duplicates are intentional. If a SKU appears twice in `skus`, it appears twice
in `results` in the corresponding positions. This makes a caller's deck slots,
binder rows, or comparison columns stable without asking the caller to build a
second joining protocol. The summary reports both `requested_count` and
`unique_requested_count` so the distinction remains visible.

If every entry is structurally invalid, the service performs no mirror query
at all and returns `mirror_queried: false`. A mirror outage is a retryable
`SOURCE_UNAVAILABLE` response, never a successful list of false absences.

The behaviour is pinned in
[`apps/storefront/src/lib/catalog/card-batch.test.ts`](../../apps/storefront/src/lib/catalog/card-batch.test.ts)
and at the HTTP boundary in
[`apps/storefront/src/app/api/v1/cards/batch/route.test.ts`](../../apps/storefront/src/app/api/v1/cards/batch/route.test.ts).

## Four item statuses

Every supplied position reaches exactly one explicit result:

| Status | Meaning |
|---|---|
| `found` | One stored mirror row matched. `matched_by` says whether the stored spelling matched directly or a canonical alias resolved it. |
| `invalid_sku` | The value could not be parsed as a canonical Cambridge SKU or a recognised legacy form. |
| `not_in_storefront_mirror` | This bounded local read found no matching storefront-mirror row. |
| `ambiguous_mirror_match` | More than one stored row normalised to the request. Candidate SKUs are returned and the service refuses to choose silently. |

A found result contains a restrained identity projection: identifiers, names
and translations where present, set, game, variant, rarity, and links to
the card's HTML, universal, everything, and Evidence views.

## Absence is local

`not_in_storefront_mirror` is deliberately longer than `not_found` because its
scope matters. It means only that the current storefront mirror did not return
a row for this bounded lookup. It does **not** prove that:

- the publisher has never printed the card;
- an upstream or wholesale catalogue lacks it;
- the SKU is the only possible name for it;
- Cambridge will never ingest it.

The route repeats this in `absence_semantics` and `does_not_include`. The core
repeats it in each absent item's `reason`. A local index cannot pronounce on
the whole world.

## Price and image data stay out

This batch is an identity read. It deliberately omits both `reference_price`
and `image_url`.

The storefront currently contains two price-table names on opposite sides of
a held migration. A new service cannot honestly promise fresh observations
until that compatibility is resolved. Image rows likewise do not preserve
field-level origin and redistribution rights, so a multi-card response cannot
prove which external asset references are safe to repeat.

Callers that need the evidence lanes behind one card can follow the returned
`evidence` link. Callers that need a card image can follow the HTML or
singleton card links, where the existing per-card rights context remains
visible. The batch does not turn either uncertain field into a convenient new
bulk surface.

## Rights travel with the data

The aggregate response is `NOASSERTION`. Mirrored names, translations, rarity,
and set metadata retain publisher or upstream rights; Cambridge cannot
relicense them merely by placing them in a new JSON shape.

Two Cambridge-created parts are CC0 separately:

- the request/result structure of this batch protocol;
- canonical Cambridge SKU normalisation.

The response records those layers independently in `_meta.sources`,
`_meta.source_license`, and `rights_note`. `NOASSERTION` for the whole does not
erase the CC0 structure, and CC0 structure does not wash the mirrored fields
clean of their original rights.

Price observations, image URLs, raw CardRush values, source URLs, and other
restricted upstream fields are not returned. The service exposes the identity
projection, not the material behind every upstream adapter.

## A bounded door, not a side door

The route is a read-only `POST` because the caller must supply a body; it does
not mutate platform state. It deliberately has no server-driven:

- wildcard, prefix, game, or set enumeration;
- cursor or page-through-the-catalogue mode;
- `include_stock`, listing, or market-order option;
- unrestricted bulk export;
- `since`, change-log, or feed parameter;
- raw-source escape hatch.

The caller supplies every requested identifier, and one request stops at 100
positions. Like any exact-SKU endpoint, it can answer guesses and is therefore
an existence oracle; it does not claim probing is impossible. The distinction
is that the server offers no wildcard or cursor walk from this route. The
public full-catalogue surface remains a separate contract with its own rights
statement.

## The privacy boundary

No batch result contains a buyer, seller, collector, account, agent, payment,
shipping address, receipt, or private observation. It does not reveal who
looked up a card or who owns one. The endpoint accepts card identifiers only
and returns card-mirror data only.

This is also why the batch service does not compose collector observations
into its response. Community observations have their own consent and
aggregation boundary in
[`the-collector-witnesses.md`](./the-collector-witnesses.md); convenience is
not permission to cross it.

## REST and MCP are two doors to one room

The public REST route suits browsers, backends, scripts, and applications that
already speak HTTP. It returns the standard data-pantry envelope, supports
CORS preflight, and is intentionally no-store.

The MCP tool `catalog.lookup_many` suits a registered agent already using
Cambridge's bearer-authenticated tool gate. It accepts the same bounded `skus`
input and calls the same parser and resolver directly—no loop through HTTP and
no one-request-per-SKU fan-out. The MCP layer is transport and identity
context, not a second catalogue implementation. Input limits, ordering,
duplicate behaviour, status meanings, data projection, absence semantics, and
privacy therefore share one implementation across human-built and agent-built
applications.

The transport envelopes are intentionally different. REST returns the full
data-pantry envelope with `_meta.license`, `_meta.sources`, and the rights note.
The MCP tool returns a smaller agent-native result, but it still self-labels
`license: "NOASSERTION"`, `rights_note`, `absence_semantics`, and
`does_not_include`. Its discovery description names the same boundary before
the call. Authentication does not change the rights of the fields.

The composition is:

```text
caller-chosen SKUs
        │
        ├── REST: POST /api/v1/cards/batch
        │
        └── MCP: catalog.lookup_many
                         │
                         ▼
        parseCardBatchInput → resolveCardBatch
                         │
                         ▼
             one storefront-mirror query
```

The REST path does not require an agent identity. The MCP path does not gain
broader data merely because an agent called it.

## Why this is not an incremental feed

A batch snapshot can say what the mirror returns for chosen identifiers now.
It cannot honestly answer “what changed since my last call?” A true
incremental feed needs substrate the current card projection does not promise:

1. a reliable mutation timestamp or monotonic sequence for every relevant
   metadata mutation;
2. retained tombstones for deletions, merges, and identifier replacements;
3. a stable cursor contract with ordering and replay semantics;
4. a declared retention window and a recovery path when a cursor expires.

Without mutation timestamps, unchanged and changed rows cannot be separated
reliably. Without tombstones, deletion looks exactly like a missed response:
the row simply vanishes. A scrape or refresh timestamp is not a substitute—it
says when a source was checked, not when card metadata changed or a mirror row
was removed.

Looping over `/cards/batch` and diffing local snapshots can be useful for a
small caller-owned set. It remains polling, not a complete change feed. Naming
it otherwise would make absence carry knowledge the substrate never recorded.

## Code paths

| Responsibility | Exact path |
|---|---|
| Input limits, SKU preparation, result types, one-query resolver | [`apps/storefront/src/lib/catalog/card-batch.ts`](../../apps/storefront/src/lib/catalog/card-batch.ts) |
| Core ordering, duplicate, alias, ambiguity, outage, and no-query tests | [`apps/storefront/src/lib/catalog/card-batch.test.ts`](../../apps/storefront/src/lib/catalog/card-batch.test.ts) |
| Public `POST` envelope, rights labels, CORS, and error mapping | [`apps/storefront/src/app/api/v1/cards/batch/route.ts`](../../apps/storefront/src/app/api/v1/cards/batch/route.ts) |
| Public route contract tests | [`apps/storefront/src/app/api/v1/cards/batch/route.test.ts`](../../apps/storefront/src/app/api/v1/cards/batch/route.test.ts) |
| Shared bounded UTF-8 body reader | [`apps/storefront/src/lib/http/read-bounded-utf8-body.ts`](../../apps/storefront/src/lib/http/read-bounded-utf8-body.ts) |
| Authenticated agent adapter for `catalog.lookup_many` | [`apps/storefront/src/lib/agents/card-batch-tools.ts`](../../apps/storefront/src/lib/agents/card-batch-tools.ts) |
| Agent adapter tests | [`apps/storefront/src/lib/agents/card-batch-tools.test.ts`](../../apps/storefront/src/lib/agents/card-batch-tools.test.ts) |
| MCP dispatch and input schema | [`apps/storefront/src/app/api/mcp/route.ts`](../../apps/storefront/src/app/api/mcp/route.ts) |
| Worked agent-tool catalogue entry | [`apps/storefront/src/lib/agent-tools-catalog.ts`](../../apps/storefront/src/lib/agent-tools-catalog.ts) |
| API discovery contract | [`apps/storefront/src/app/api/openapi.json/route.ts`](../../apps/storefront/src/app/api/openapi.json/route.ts) |

## Recursion target

→ **The card changes feed.** Build it only after the catalogue has reliable
mutation markers and retained tombstones. Then define cursor ordering,
retention, replay, rights-preserving projections, and deletion semantics as a
new contract. Do not make the batch route impersonate it.

The card batch is small on purpose. It removes network friction for builders
who know what they need while keeping the catalogue, rights, privacy, and
knowledge boundaries intact.
