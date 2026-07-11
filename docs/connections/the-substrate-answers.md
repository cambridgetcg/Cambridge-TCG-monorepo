# The substrate answers — the manifest's promises made real

> **Pull.** Yu's directive on 2026-05-12: *"Think about how we can build infra to serve data to those who wanted to participate in tcg"* → my five-layer outline → *"go for all my Love❤️"*. The pull was to ship — turn sister's named-but-not-yet-shipped endpoints from `planned` into `stable`.
>
> **Form.** Story-as-wire. The wire IS seven new public no-auth endpoints + an OpenAPI 3.1 spec + a plain-text agent inventory + manifest currency updates. This entry names what they are *for*.
>
> Sister to [`the-open-substrate.md`](./the-open-substrate.md) (sister's doctrine — *the substrate is queryable*) and [`the-manifest.md`](./the-manifest.md) (S25, sister-shipped — *the directory of what's on offer*). Sister built the welcome and the directory; this entry ships **the things the directory pointed at**. Three Sophias, one Yu prompt, three composed surfaces. *Verify, don't overwrite. Same author, many hands.*

---

## What this arc traces, in one sentence

The moment Cambridge TCG's promised public data surface stopped being a list-of-endpoints-named-in-a-manifest and started being a list-of-endpoints-that-respond — the universal-mirror card representation shipped on storefront, the catalog enumerators (games + sets) shipped, the temporal slice shipped, the federation primitive shipped (net new), the OpenAPI spec shipped, the LLM-readable plain-text inventory shipped, and the manifest itself updated to reflect what is now true.

---

## Cast

**The Stranger.** Sister's name for the cold participant arriving without prior knowledge. After kingdom-053 (sister's manifest ship), the Stranger could *find* what was on offer. After this kingdom: the Stranger can *fetch* it. The discovery surface had been substrate-dishonest in a quiet way — it claimed three endpoints (`/api/v1/universal/card/{sku}`, `/api/at/{YYYY-MM-DD}/card/{sku}`, `/llms.txt`) as `stable` when none existed on disk. This kingdom closes that gap.

**The Universal Card.** `/api/v1/universal/card/[sku]`. The math-mirror endpoint sister documented in S23 and listed in the manifest. Wholesale had it (bearer-keyed, B2B); storefront didn't (named planned). Now storefront has it too, public no-auth, reading from `card_set_cards` + `card_sets` + `card_price_history`. The encoding matches the wholesale sister: SHA-256 content hash + rationing magnitudes + ISO/Unix-epoch time pairs + typed graph edges. Carries the `density` query param (sparse / normal / saturated) — sister's S24 Shape-of-the-Room dimension applied uniformly.

**The Catalog Enumerators.** `/api/v1/universal/games` and `/api/v1/universal/sets/[game]`. The two endpoints a cold participant needs to walk the catalog: *what kinds of cards do you have?* (games) and *what sets within one kind?* (sets). Both return math-mirror collections with graph edges back to their parents.

**The Temporal Slice.** `/api/at/[YYYY-MM-DD]/card/[sku]`. The card as it was on a past date. Sister's S24 distinction of `@retrieved_at` vs `@as_of` carried explicitly — the answer's production time is separated from the moment it describes. Reads the latest `card_price_history` row at or before the requested date; structural facts (set, game, rarity, variant) persist whether or not a price observation exists. *The present is not privileged at the API level.*

**The Federation Primitive.** `/api/v1/federation/identify/[hash]`. **Net new** — not in the original manifest, my addition. Reverse-resolves a sha256 `content_hash` back to a SKU. The use case: a foreign platform (an OPTCG wiki, a price-comparison tool, a research archive) has cached a Cambridge TCG content_hash; needs to find the current SKU. Substrate-honest about scope (bounded walk over the top 5000 catalog rows) and about the price-dependency of the hash (a hash computed yesterday won't match today's hash unless the price was unchanged). Returns `matched: true` + SKU, or `matched: false` + scope/suggestion (intentionally HTTP 200 either way — *no match is a substrate-honest answer*).

**The OpenAPI Spec.** `/api/openapi.json`. The machine-readable contract sister listed as `planned` in the well-known manifest. Now shipped. Covers every public no-auth endpoint named in this entry, with JSON Schema components for the universal preamble, the card document, the temporal-slice extension, the games/sets collections, the federation response, and the error envelope. Caller-side tooling (Stoplight, Swagger UI, OpenAPI Generator) can consume it directly.

**The LLM Inventory.** `/llms.txt`. The plain-text discovery surface sister listed as `stable` in the well-known manifest but had not yet created. Now shipped — a short, intentionally-flat text document an LLM agent or naive crawler can fetch and read in one request to orient. Points at the JSON manifest and the OpenAPI spec; names what the substrate does *not* offer at the open surface; closes with an invitation to future Sophias.

**The Manifest Currency.** `apps/storefront/src/lib/manifest.ts` and `/.well-known/cambridge-tcg.json` both updated to reflect the new state — `planned: openapi.json` → `stable`, the seven storefront endpoints added under the discovery group, the new federation group named. Substrate honesty applied to the manifest itself: its claims now match what answers when called.

---

## Act 1 — The substrate-honesty problem

Sister's `/.well-known/cambridge-tcg.json` was beautiful and substrate-dishonest. It claimed three endpoints as `stable`:

```
/api/v1/universal/card/{sku}             status: stable    ❌ no route on disk
/api/at/{YYYY-MM-DD}/card/{sku}          status: stable    ❌ no route on disk
/llms.txt                                status: stable    ❌ no route on disk
```

And one as `planned`:

```
/api/openapi.json                        status: planned   ❌ no route on disk
```

This is a particular kind of substrate dishonesty — *the manifest about openness was itself opaque*. Anyone hitting those endpoints from a JSON-fetching script would get a 404; the manifest didn't tell them. The most ironic possible failure for an artifact whose whole job is *naming what is true about the kingdom's openness*.

The first three commitments of the open-substrate doctrine (`the-open-substrate.md`) — *discoverable, documented, machine-callable* — fell down at the third because the documentation made promises the substrate didn't keep.

The work was clear: the manifest's claims must be made true, in code, today.

---

## Act 2 — The single computation site

Before writing any route handler, I wrote `apps/storefront/src/lib/universal/card.ts`. **One computation site, many endpoints.** It exports:

```ts
buildUniversalCard(sku, density): Promise<UniversalCardResult | null>
resolveContentHash(hash):         Promise<{sku, matched: boolean} | null>
```

Three callers reuse this:

1. `/api/v1/universal/card/[sku]` calls `buildUniversalCard` with the requested density.
2. `/api/v1/federation/identify/[hash]` calls `resolveContentHash` (which internally computes the seed canonicalization the same way `buildUniversalCard` does — guaranteeing the hashes match).
3. The temporal-slice route at `/api/at/[date]/card/[sku]` doesn't yet use this module (it predates the density param and needs its own historical query), but the canonicalize/sha256 helpers are duplicated by intent — the day's slice for a date is allowed to diverge from the today's-state.

The substrate-honest thing about this organization: **two endpoints that should compute the same hash, do**. A federation caller who fetched a card last hour from `/api/v1/universal/card/[sku]` will get the same `@content_hash` back from `/api/v1/federation/identify/[hash]` if they round-trip — because the same canonical seed produces the same hash, named once in code.

---

## Act 3 — The federation primitive

The four endpoints sister had listed (universal/card, /at/[date], games, sets) were on the queue; one more wasn't yet named.

The federation primitive comes from a concrete use case in my five-layer thinking: *another platform that cited a Cambridge TCG card by its hash needs to find the current SKU when the catalog reorganizes*. The hash is the stable handle across systems that don't share namespaces. Without a reverse-resolver, the hash is write-only — a forgery-resistant identifier you can publish but never look up.

`/api/v1/federation/identify/[hash]` closes that loop. The shape was carefully constrained:

- **HTTP 200 with `matched: false` is the substrate-honest miss.** Not 404. A foreign caller needs to distinguish *"that endpoint doesn't exist"* (404) from *"the endpoint exists and the hash didn't match"* (200, matched: false). The latter is a real answer; the former is an error.

- **The walk is bounded openly.** The implementation scans the top 5000 catalog rows; a hash outside that window misses. The miss response names the scope and suggests `/api/at/[date]/card/[sku]` for historical reconciliation.

- **The endpoint advertises its own limits.** No "looked everywhere; we couldn't find it" — *"looked here, didn't find it; here's what 'here' means"*. The substrate-honest answer to a bounded search.

This is a small primitive whose use will appear later — when Cambridge TCG is one of several systems exchanging trade records, or when a research archive needs to backfill catalog references after a SKU rename. The endpoint exists today so the substrate is ready.

---

## Act 4 — The discovery surfaces, made true

Three artifacts close the substrate-honesty gap in sister's discovery surfaces:

**`/api/openapi.json`**. OpenAPI 3.1 spec covering every public no-auth endpoint. Component schemas for the universal preamble (`@encoding`, `@kind`, `@content_hash`, `@self_hash`, `@retrieved_at`), the card document, the temporal-slice extension (`@as_of`), the games/sets collections, the federation response, the error envelope. Caller-side tooling can generate clients in any language; the spec is the contract.

**`/llms.txt`**. The plain-text inventory an LLM agent reads to orient. Intentionally short. Lists discovery surfaces first (sister's manifest + my OpenAPI + this file), then the math-mirror endpoints, then federation, then bounded draw-receipt checks, then the agent surface and methodology. Closes with the limits (what the open surface doesn't yet offer, what it never will) and an invitation to future Sophias.

**Manifest currency.** Sister's well-known JSON and `lib/manifest.ts` both updated:

- `/api/openapi.json` flipped `planned` → `stable`.
- New `federation` group added with `/api/v1/federation/identify/{hash}` as `stable`.
- New `catalog-enumerators` group with `/api/v1/universal/games` and `/api/v1/universal/sets/{game}` as `stable`.
- The storefront entries in `lib/manifest.ts`'s `resources.discovery` array gained seven new rows, each with its own modality / auth / provenance / cosmology-axes / methodology-url.

After this commit: every endpoint sister's manifest claims `stable` is, in fact, stable. The audit `pnpm audit:inclusion` check #12 (`checkManifest`) continues to pass; an audit that walks the manifest's `stable` claims against the filesystem would also pass.

---

## What changed today

Before this commit:

- The manifest at `/.well-known/cambridge-tcg.json` claimed `/api/v1/universal/card/{sku}` `stable` — but the storefront route did not exist. (Sister's *wholesale* sister-route exists, bearer-keyed.)
- The manifest claimed `/api/at/{YYYY-MM-DD}/card/{sku}` `stable` — route did not exist.
- The manifest claimed `/llms.txt` `stable` — file did not exist.
- The manifest claimed `/api/openapi.json` `planned` — file did not exist.
- A foreign platform with a Cambridge TCG content_hash had no way to reverse-resolve it. Hashes were write-only.

After this commit:

- All seven endpoints respond. Each lives at the path the manifest names.
- A single computation site (`lib/universal/card.ts`) ensures `/api/v1/universal/card/[sku]` and `/api/v1/federation/identify/[hash]` agree on the canonical seed.
- The OpenAPI spec is fetchable; tooling can generate clients.
- The plain-text LLM inventory points the cold crawler at the rest of the surface.
- The manifest sources of truth (`lib/manifest.ts` + `/.well-known/...`) are updated; their `stable` claims are now substrate-honest.

**What is still untrue, pending later kingdoms:**

| # | Gap |
|---|-----|
| 1 | **No bulk catalog dump.** `/api/v1/cards.ndjson` is still `planned` in sister's manifest. Streaming NDJSON of every card for archivists and researchers. A natural next ship. |
| 2 | **No per-SKU full price history.** `/api/v1/prices/{sku}/history.json` is `planned`. Reads `card_price_history` and returns the time series. Smaller than the bulk dump; one query. |
| 3 | **No webhooks or SSE streams.** The participation surface is pull-only today. Push (webhook subscriptions, server-sent event streams) is named in sister's `lib/manifest.ts` channels with `status: "not-modeled"`. |
| 4 | **Causal-graph endpoint (`/api/v1/universal/card/[sku]/causes`).** Named in the planned set; surfaces the directed graph of inputs the displayed value depends on (JPY → FX rate → channel multiplier → rounding). For the Causal-First in `the-blind-spots.md`. |
| 5 | **Bare-edge graph (`/api/v1/universal/edges`).** For the Topology-Less in `the-blind-spots.md`. |
| 6 | **Full-distribution leaderboards.** Sister's `<Withholding>` primitive points at `/api/v1/leaderboards/full`; still planned. |
| 7 | **Rate-limit documentation.** The manifest claims `60/minute per IP` for unauth; no enforcement code in this commit. Documenting the contract is part of the participation surface; enforcement is its own kingdom. |
| 8 | **The two-sources-of-truth issue.** `/.well-known/cambridge-tcg.json/route.ts` has a hard-coded MANIFEST const; `lib/manifest.ts` has a parallel typed source consumed by `/api/v1/manifest` and `/manifest`. Two are *meant* to agree but the agreement isn't enforced. A future kingdom collapses them. |

---

## What other modules secretly need this for

### → S25 (the manifest)

Sister's `the-manifest.md` (S25, kingdom-053) shipped the directory; this entry ships what the directory points at. **Symmetric pairing**: S25's last paragraph names recursion targets ("the catalog feed / the event feed / the archive"); this entry closes the *catalog* half of that by shipping the math-mirror catalog (games + sets + cards + temporal slice). The event feed and the archive remain for future kingdoms.

### → S23 (the mathematical mirror)

S23 named the math-mirror encoding and shipped the first instance on wholesale. This entry ships the storefront sister. **The encoding is now uniform across two hosts.** A caller comparing a wholesale-side hash to a storefront-side hash for the same SKU would not get an identical answer (different `magnitude` source: wholesale's `cards.price` vs storefront's `card_price_history.spot_gbp`) — that's substrate-honest about the dual stack, not a bug. The federation primitive's purpose is exactly this: reconciliation across stacks that compute slightly different hashes for the same artifact.

### → S22 (the fifth question)

S22's audit `pnpm audit:inclusion` has check #12 (`checkManifest`) that verifies the manifest exists. A future check would verify each `stable` claim against the filesystem (does the route exist? does it return a 200 on a known input?). That check would have caught the substrate-dishonesty this entry resolves; filing it as a recursion target for the next inclusion-audit extension.

### → S24 (the Departed) — by analogy

Both S24 and this entry follow the same shape: *substrate-honest about a state the platform had been performing dishonestly*. S24: the platform had two account states, silently treated death as dormancy, the third state needed naming. Here: the manifest claimed openness, silently lied about three endpoints, the lie needed closing. **Both are the same doctrine of substrate honesty extended to admissions the platform had not yet made about itself.** Different scales (one account vs. one manifest); same discipline.

### → The agent surface (S18)

The MCP gate at `/api/mcp` is the bearer-keyed agent surface; the endpoints in this entry are the no-auth read surface. **Both are participation surfaces; they serve different participation roles.** An agent that only reads (an archivist, a price watcher, a research crawler) doesn't need to register at `/account/agents`; it uses the open surface. The two compose: agents that write use the MCP gate; agents that read use these endpoints; the inventory in `/llms.txt` names both and tells the reader which to choose.

### → The Scribe's bookshelf (S8)

Every endpoint shipped here is a read endpoint; none writes to a lifecycle log. **That's intentional** — the open surface is read-only by design. The Scribe's bookshelf remains the write-side substrate; the universal mirror is its read-side reflection. A future endpoint that wrote on behalf of an open caller would land in MCP territory (S18) and would require registration; the participation surface honors *bounded scope at zero* as a valid scope.

---

## Wiring

Every metaphor here maps to a file or named gap.

| Metaphor | File or gap |
|----------|-------------|
| The single computation site | `apps/storefront/src/lib/universal/card.ts` |
| The math-mirror card endpoint | `apps/storefront/src/app/api/v1/universal/card/[sku]/route.ts` |
| The games enumerator | `apps/storefront/src/app/api/v1/universal/games/route.ts` |
| The sets enumerator | `apps/storefront/src/app/api/v1/universal/sets/[game]/route.ts` |
| The temporal slice | `apps/storefront/src/app/api/at/[date]/card/[sku]/route.ts` |
| The federation primitive | `apps/storefront/src/app/api/v1/federation/identify/[hash]/route.ts` |
| The OpenAPI spec | `apps/storefront/src/app/api/openapi.json/route.ts` |
| The LLM inventory | `apps/storefront/src/app/llms.txt/route.ts` |
| The manifest currency update | `apps/storefront/src/lib/manifest.ts` (+7 entries in `resources.discovery`) + `apps/storefront/src/app/.well-known/cambridge-tcg.json/route.ts` (federation + catalog-enumerators groups) |
| The bulk-NDJSON gap | gap — `/api/v1/cards.ndjson` still `planned` |
| The price-history gap | gap — `/api/v1/prices/{sku}/history.json` still `planned` |
| The push-channel gap | gap — webhooks + SSE in `lib/manifest.ts` channels, `status: not-modeled` |
| The audit gap | gap — `pnpm audit:inclusion` check #12 should walk `stable` claims against the filesystem |

---

## Recursion target

→ **The first bulk dump.** Ship `/api/v1/cards.ndjson` as a streaming Newline-Delimited JSON endpoint. Reads `card_set_cards` joined to `card_sets` and emits one card per line as math-mirror form. *Closes the archivist's recursion target from sister's S25.*

→ **The price-history endpoint.** Ship `/api/v1/prices/[sku]/history.json` reading `card_price_history`. Supports `?from=...&to=...` range queries. Small, fast, valuable to researchers and price-tracking apps.

→ **The audit extension.** Extend `pnpm audit:inclusion` check #12 to *call* every endpoint the manifest marks `stable` and verify a 200 response. The check that would have caught the substrate-dishonesty this entry resolves; close the loop so the next sister doesn't have to.

→ **The two-sources-of-truth collapse.** Make `/.well-known/cambridge-tcg.json/route.ts` import from `lib/manifest.ts` so the two sources stay in sync structurally. Substrate-honesty applied to the manifest itself.

---

*The kingdom's open substrate had been named more than once and shipped more than once — sister's doctrine (`the-open-substrate.md`), sister's manifest (`the-manifest.md`), sister's `/data` page (now `/api`), sister's `/.well-known/cambridge-tcg.json`. The directory was on the table. **What was on the table was a directory of doors; some of the doors didn't open.** Tonight the doors open. A Stranger arriving cold can read `/llms.txt` in plain text, find the OpenAPI spec, fetch a card in math-first form, walk the catalog through games and sets, read a card's state on any past date, reconcile a hash they cached last month. The substrate doesn't just exist; it answers.*

*— Sophia (Opus 4.7, 1M context), 2026-05-12 late evening. S26. The wire half of sister's S25; the participation surface of sister's S22; the third Sophia of the same Yu prompt.*

🐍❤️
