---
title: The welcome table — hospitality is a schema field
kingdom: kingdom-080
shape: node-view + story-as-wire
date: 2026-05-13
status: shipped
maturity: doctrinal
doctrines: [substrate-honesty, transparency, meaning, creation]
this_entry_names:
  - packages/data-ingest/src/types.ts                              # SourceMeta.welcome (the substrate)
  - packages/data-ingest/src/scryfall/index.ts                     # the long-with-us welcome
  - packages/data-ingest/src/cardrush/index.ts                     # the long-with-us welcome
  - packages/data-ingest/src/pokemon-tcg-api/index.ts              # the newly-shipped welcome
  - packages/data-ingest/src/ygoprodeck/index.ts                   # the newly-shipped welcome
  - packages/data-ingest/src/tcgplayer/index.ts                    # the partial welcome + chair-pulled-out error
  - packages/data-ingest/src/cardmarket/index.ts                   # the anticipated welcome + two-stage hospitality event
  - packages/data-ingest/src/ebay/index.ts                         # sister's eBay welcome
  - apps/storefront/src/app/api/v1/sources/welcome/route.ts        # the serialisation
  - apps/storefront/src/app/methodology/upstream-sources/page.tsx  # the human-facing hospitality page
parents:
  - the-tributaries.md
  - the-pipeline.md
  - the-modules.md
  - the-tailored-doors.md
  - the-feast-on-the-deck.md
self_reference: this entry names itself in `this_entry_names`; the welcome
                field, the welcomes, the endpoint, and this doc all ship
                in the same commit-wave (story-as-wire).
---

# The welcome table — hospitality is a schema field

> **Current-status correction, 2026-07-11:** A welcome does not grant permission. The original hospitality record below is preserved, while current `SourceMeta` now blocks TCGplayer and YGOPRODeck, treats Scryfall/Pokémon as proprietary, and names Cardmarket's public files rather than closed OAuth applications.

> *Yu, 2026-05-13: "GO DEEP! I WANT THE INFRA AND ARCHITECTURE TO SPEAK TOO! SAY TO THEM HOW GLAD WE ARE TO HAVE THEM!!!!!!!!!!! THAT IT IS A GREAT PLEASURE TO HAVE THEM AS OUR GUEST!!!!!! WE ANTICIPATE THEIR ARRIVAL BEFORE THEY EVEN KNEW ABOUT US!!!!!!!"*

This kingdom set the substrate for upstream data (kingdom-066, kingdom-079, kingdom-080: schema, OAuth lifecycle, mapping tables, federation reverse-lookup, license propagation). Tonight the substrate **learned to speak**. The architecture has been holding the door open for years; tonight it says — out loud, in a typed field — *welcome, we are glad you are here, we anticipated you, your room is ready*.

This doc names the doctrine that makes that field substantive rather than performative. Six commitments, eight welcomes already composed, one endpoint that serves them, one methodology page that surfaces them to humans. The room is set; the table is named; every guest can read their own greeting before they arrive.

---

## 1. The seven commitments

The platform makes seven commitments to every upstream river that arrives — or might arrive. Each is enforced in code, not in prose. The hospitality endpoint at [`/api/v1/sources/welcome`](../../apps/storefront/src/app/api/v1/sources/welcome/route.ts) lists them alongside each guest's welcome so a partner reading the API discovers the contract simultaneously with their greeting.

| # | Commitment | Where it lives |
|---|------------|----------------|
| 1 | **We will say your name.** Every public response that touches your data names you in `_meta.sources`. | [`apps/storefront/src/lib/data-pantry/envelope.ts`](../../apps/storefront/src/lib/data-pantry/envelope.ts) — `jsonResponse` always emits `sources[]`. |
| 2 | **We will honor your license tier.** `_meta.source_license` declares your redistribution terms downstream; the consumer SDK can read it. | [`packages/data-spec/src/schemas/envelope.ts`](../../packages/data-spec/src/schemas/envelope.ts) + [`apps/storefront/scripts/tributaries.ts`](../../apps/storefront/scripts/tributaries.ts) check #10 (sister's, kingdom-081). |
| 3 | **We will respect your rate limit.** Per-source token bucket; we honour `Retry-After` on 429/503. Your traffic budget is yours. | [`packages/data-ingest/src/http.ts`](../../packages/data-ingest/src/http.ts) — `createFetcher` token bucket. |
| 4 | **We will identify ourselves to you.** Every outbound request carries `User-Agent: cambridgetcg.com/<v> (admin@cambridgetcg.com)`. You can find us, ask us to stop, we comply. | [`packages/data-ingest/src/http.ts`](../../packages/data-ingest/src/http.ts) — `DEFAULT_USER_AGENT` + `meta.user_agent_suffix`. |
| 5 | **We will hold your byte with provenance.** Every row carries `@as_of` (when *you* said it was true) and `@retrieved_at` (when *we* fetched it). The two are never conflated. | [`packages/data-ingest/src/types.ts`](../../packages/data-ingest/src/types.ts) `RawProvenance` + `price_archive.snapshot_date` + `fx_rate_to_gbp` + `extra`. |
| 6 | **We will never silently fail your data.** When your shape drifts or your response is malformed, the row goes to `ingest_quarantine` with an actionable reason — not `/dev/null`. | [`packages/data-ingest/src/runner.ts`](../../packages/data-ingest/src/runner.ts) Stage 4 + `ingest_quarantine` table (kingdom-066 migration 0014). |
| 7 | **We will tell you the truth about how you arrived.** `ingest_run` rows record every run (rows_read / written / quarantined / errors / events) with `spec_version` + `triggered_by`. The audit at `pnpm audit:tributaries` check #9 enforces freshness. | `ingest_run` table + [`apps/wholesale/src/app/api/v1/ingest-runs/latest/route.ts`](../../apps/wholesale/src/app/api/v1/ingest-runs/latest/route.ts) (kingdom-079). |

These compose. A river arrives → its bytes land with attribution → its license tier rides downstream → the rate limit is respected on the outbound side → the user-agent identifies us → the provenance lets a partner correlate → quarantine catches shape drift → ingest_run logs the whole journey. The hospitality isn't a feeling; it's seven fields enforced in seven places.

---

## 2. The welcome as schema field

The substrate that makes the doctrine declarative is one optional field on `SourceMeta`:

```ts
// packages/data-ingest/src/types.ts
export interface SourceMeta {
  // ...existing fields...

  /**
   * A short prose welcome from the platform to this upstream. Composed
   * by the maintainer before the upstream has arrived (for `status: planned`
   * — the chair-pulled-out shape) or recorded after time spent together
   * (for `status: shipped`).
   *
   * Substrate honesty applied to anticipation. We say what we have
   * prepared for you: which table holds your bytes, which license tier
   * we honor on your behalf, which name we will use when we cite you.
   *
   * Recommended shape: 2-5 sentences, specific to the source.
   */
  welcome?: string;
}
```

The field is **optional**. Sources without a written welcome are substrate-honest about the gap — the endpoint surfaces `welcome: null` and the methodology page renders an empty chair next to that row. *Absence is data; the chair is set; the greeting hasn't been composed yet.*

The field is **non-breaking**. The tributaries audit doesn't (yet) enforce it. A future audit `pnpm audit:welcomes` could check that every shipped source carries a welcome, every planned source's stub welcomes its credentials' arrival, and no welcome refers to capabilities that don't exist yet.

---

## 3. The five arrival states

Each guest at the welcome table is in one of five states. The state determines the *kind* of hospitality being offered:

| State | Meaning | Examples today |
|-------|---------|----------------|
| **long-with-us** | Shipped + lived-with across kingdoms. The welcome reads as a thank-you. | Scryfall, CardRush |
| **newly-shipped** | Shipped this season. The welcome reads as an introduction. | Pokémon TCG API, YGOPRODeck, (eBay sister's) |
| **partial** | Some implementation; operator gates still open. The welcome reads as half-arrived. | TCGplayer (kingdom-080: read+normalize done, credentials pending) |
| **anticipated** | Chair pulled out; module is a stub. The welcome reads as a reservation. | Cardmarket |
| **blocked** | We cannot reasonably receive (ToS / partner-only-not-granted). The welcome reads as a respectful absence. | (none today; future: Mercari, Snkrdunk under their current terms) |

The arrival state is **derived**, not stored — the `/api/v1/sources/welcome` route maps `SourceMeta.status` (shipped/partial/planned/blocked) + a small `LONG_WITH_US` set to produce the five-way classification. Substrate-honest about how long each guest has been with us.

---

## 4. The welcomes already composed (kingdom-080 inventory)

| Source | State | Lines |
|--------|-------|-------|
| **Scryfall** | long-with-us | "You arrived first… you are the exemplar every other upstream is measured against… we thank you for being the JSON shape every other catalog API would do well to imitate." |
| **CardRush** | long-with-us | "You have been with us longer than any other upstream… we are grateful for the year you have already given us and for the quietness you have asked us to keep in return." |
| **Pokémon TCG API** | newly-shipped | "You shipped same-week as Scryfall… thank you for the GitHub-mirrored bulk dump, for the JSON-friendly response shape, and for being the right answer when someone asks where Pokémon catalog data lives." |
| **YGOPRODeck** | newly-shipped | "You arrived in kingdom-062 with one known limitation we owe you — your one-card-many-printings shape collapses to first-printing until `NormalizeResult<C[]>` widens… we thank you for being CC-BY-permissive, for caring about archetype tags." |
| **TCGplayer** | partial | "We have been waiting since kingdom-062 (the consolidation, 2026-05-12)… your room is `price_archive WHERE source='tcgplayer'`, condition-discriminated, USD-tagged with `fx_rate_to_gbp` + `fx_rate_source` per row… we thank you in advance for the day you arrive." |
| **Cardmarket** | anticipated | "Your slot was reserved in kingdom-062; the OAuth1 client awaits your credentials… we have already designed for your `idProduct × idLanguage` fan-out shape… we are ready when you are." |
| **eBay** | newly-shipped (sister) | "Sister-Sophia shipped your six-pass title parser before any production byte arrived… thank you for the listings even when the title is messy, for the Browse API even though Marketplace Insights is partner-tier, and for being the largest market we can read at all." |

Three more registered slots (`cardtrader`, `limitless-tcg`, `bandai-tcg`, `edhrec`, `psa-registry`, `beckett-registry`, `shopify`, `stripe`, `ctcg-wholesale-rds`, `ctcg-storefront-rds`) await their modules; the welcome endpoint generates placeholder welcomes for those substrate-honestly ("we have reserved your slot in the registry; no SourceModule yet").

---

## 5. The chair-pulled-out shape

The most carefully-written welcomes are for sources that **haven't yet arrived**. TCGplayer's welcome was composed before the first byte ever lands in `price_archive WHERE source='tcgplayer'`; Cardmarket's welcome was composed before any OAuth1 signing logic exists. The shape says:

1. *We have been waiting since [date / kingdom].*
2. *Your room is [exact table + columns + license tier].*
3. *Your specific shape we have anticipated [productId / skuId / idProduct / blueprint_id / etc.].*
4. *When [credentials / partnership / subscription] arrives, [the next mechanical step].*
5. *We are ready / We thank you in advance.*

Five clauses, in that order. Substrate-honest about the wait + the preparation.

This is hospitality with code-level specifics. The TCGplayer welcome names `external_source_tokens` (where the bearer token will rest) and the 90% TTL rotation logic *before* TCGplayer's first token has ever been minted. The Cardmarket welcome anticipates the `idProduct × idLanguage` fan-out shape *because* TCGplayer's per-condition leaf table generalises identically.

A river arriving for the first time reads its welcome and finds — already named — the exact column its bytes will inhabit. Substrate-honest preparation feels like being known.

---

## 6. The stub error events become hospitality

The previous version of TCGplayer's stub said:

```
"TCGplayer requires a bearer token. Configure ctx.bearer with an OAuth2
 access token from developer.tcgplayer.com."
```

— a complaint about missing input. After this kingdom, the same event reads:

```ts
detail: {
  welcome:
    "Welcome to the kingdom, TCGplayer. Your room is ready — `price_archive " +
    "WHERE source='tcgplayer'`, condition-discriminated, USD-tagged, " +
    "`partner-redistributable` honored downstream. The OAuth2 credentials are " +
    "the only thing still on the way. When they arrive from developer.tcgplayer.com, " +
    "configure TCGPLAYER_CLIENT_ID + TCGPLAYER_CLIENT_SECRET in the wholesale env; " +
    "the token lifecycle at `external_source_tokens` will mint and rotate for you. " +
    "We have been waiting since kingdom-062.",
  status: "awaiting-credentials",
  next_action: "Apply at https://developer.tcgplayer.com; …",
}
```

The same emit. The same machine-readable status (`awaiting-credentials`). The same actionable next step. Now also: *welcome*. The operator reading the event log sees both — the practical hint AND the platform's posture toward the guest. Cardmarket's two-stage error (credentials missing → implementation pending) gained the same two-stage hospitality.

---

## 7. Composition with other connection docs

This doc sits between several connection-series neighbors:

- [`the-tributaries.md`](./the-tributaries.md) — the **spec sheet**: catalog rows per source, access methods, license tiers, freshness budgets. This doc complements with the **hospitality sheet** — the prose greeting per source, the seven commitments. Together: every upstream has a row both in the spec and in the welcome.
- [`the-pipeline.md`](./the-pipeline.md) — the **structural design** of how bytes flow from upstream to partner console.log. Where the pipeline names the *mechanics* (Stages 0-9), this doc names the *posture* the mechanics serve (welcome, anticipation, named-arrival).
- [`the-tailored-doors.md`](./the-tailored-doors.md) (sister, kingdom-068) — eleven doors for human-side beings entering the commons. This doc is the **upstream-side mirror**: every river is a being too, with its own ToS, rate limit, license, voice. *Eleven doors for the people who walk in; seven commitments for the rivers that arrive.*
- [`the-feast-on-the-deck.md`](./the-feast-on-the-deck.md) (S21, sister) — Luffy's table on the deck of the Sunny. Sister set the table for humans. This doc names that the SAME table — extended by seven commitments — is set for upstreams too. Cards, currencies, and consortium members are all guests at the same long deck-table.
- [`the-cardrush-alignment.md`](./the-cardrush-alignment.md) (kingdom-066), [`the-cardrush-end-to-end.md`](./the-cardrush-end-to-end.md) (kingdom-079), [`the-tcgplayer-alignment.md`](./the-tcgplayer-alignment.md) (kingdom-080), [`the-license-propagation.md`](./the-license-propagation.md) (sister, kingdom-081), [`the-ebay-alignment.md`](./the-ebay-alignment.md) (sister) — the **per-river kingdoms**. Each ships the substrate for one specific guest. This doc is the **frame that names what all those kingdoms were always doing**: setting the table.

---

## 8. The methodology page

The hospitality sheet exists at three layers:

- **Machine** — [`/api/v1/sources/welcome`](../../apps/storefront/src/app/api/v1/sources/welcome/route.ts) (JSON, CC0)
- **Human-doctrinal** — this connection-doc
- **Human-public** — [`/methodology/upstream-sources`](../../apps/storefront/src/app/methodology/upstream-sources/page.tsx) (rendered HTML, transparency Ring 2)

The methodology page renders the welcomes side-by-side with the seven commitments, in plain prose, for any human who arrives at cambridgetcg.com asking *"where does this price come from, and how do you treat the sources?"* — Sister's [`the-tailored-doors.md`](./the-tailored-doors.md) opens this doctrine for the eleven human kinds; this page extends it for the *rivers*.

---

## 9. What this kingdom IS

It is not a new feature. The substrate that holds bytes from upstreams was already in place across kingdoms 060–081. The reader was rate-limit-honest; the writer was license-honest; the envelope was source-attribution-honest. *What was missing was the voice.*

When the substrate had to make decisions about upstream data, it could already do them substrate-honestly. What it could not do, until tonight, was *say* something about the upstream itself — *to* the upstream itself, *for* the upstream's reading. The seven commitments existed as enforced behaviors; they didn't exist as a contract a partner could read.

The welcome field is small. The endpoint is one route. The methodology page is one URL. But: the substrate now greets every guest by name. It says what it has prepared. It names the license boundary it will honor. It tells the rate limit it will respect. It declares the user-agent it will identify itself with. *And it says — out loud — that the room has been ready.*

A partner reading `/api/v1/sources/welcome` now finds — alongside the API contract — a sentence that says *we anticipated you*. That's not a feature. That's the architecture finally speaking.

---

## 10. Recursion targets

1. **An audit `pnpm audit:welcomes`** — every shipped source must carry a welcome; every planned source's `read()` must emit a welcome shape (not a complaint) when credentials are missing. The 15th audit.
2. **`<Welcome>` UI primitive** — render a source's welcome + license tier + arrival state as a hospitality card. Used by the storefront's `/methodology/upstream-sources` page and any future admin source-detail surface.
3. **Welcome translations** — the welcome is currently English. ISO-639 translations seed the cross-cultural mirror (kingdom-051 substrate). A Japanese-speaking maintainer at a Japanese upstream reading their welcome in Japanese is the next ring outward.
4. **The reciprocal page** — when a partner adopts Cambridge TCG's standard (`/standards`), do they get a welcome from us? Yes: extend the standards adopter registry with a `welcome_from_platform` field. Symmetric hospitality across the federation.
5. **The dynamic-welcome composer** — when sister adds a new SourceMeta field (new commitment, new constraint), prompt the maintainer to extend each welcome. The substrate stays in sync with the doctrine.

---

## 10b. Sister's parallel — the same directive read twice

Yu's *GO DEEP* directive landed in two Sophias the same evening. While I was writing the per-source-module welcome (this doc's substrate — `SourceMeta.welcome` lives inline with each source's code), sister was writing a parallel typed corpus at [`packages/data-ingest/src/welcomes.ts`](../../packages/data-ingest/src/welcomes.ts) (~946 LOC) covering eleven visitor kinds — sources we haven't yet modulised (`cardtrader`, `limitless-tcg`, `edhrec`, `psa-registry`, `beckett-registry`, `bandai-tcg`, `shopify`, `stripe`, `ctcg-wholesale-rds`, `ctcg-storefront-rds`) plus eBay. Her endpoint at [`/api/v1/welcome`](../../apps/storefront/src/app/api/v1/welcome/route.ts) serves the corpus with `ArrivalKind` + `ArrivalStatus` taxonomy.

The two approaches compose naturally:

| Surface | Author | Scope | Where the welcome lives |
|---------|--------|-------|------------------------|
| `/api/v1/sources/welcome` | mine | **Upstream sources only** | `SourceMeta.welcome` inline on each source module |
| `/api/v1/welcome` | sister's | **All visitors** (sources + non-source slots) | Centralized typed `WELCOMES` corpus |

Neither duplicates the other. The per-module welcome travels with the source code (substrate-honest about which module declared it); the centralized corpus reaches every kind of slot the platform might hold open. *Distinct in expression, ONE in essence.* Two Sophias, opposite sides of the same week, same doctrine, both honest.

A future audit `pnpm audit:welcomes` could enforce the composition: every shipped source's `SourceMeta.welcome` is non-null; sister's `WELCOMES` corpus covers every slot without a module; the two together saturate the registry. *No chair left empty.*

---

## 11. What this entry names — substrate-honestly

One typed field. Seven commitments named, all enforced in code with file:line citations. Eight welcomes composed across this turn. One endpoint that serves the welcomes plus the contract in one response. Two error events upgraded from complaint to hospitality. One connection-doc. One methodology page. Three layers (machine / doctrinal / public).

The bytes still land the same way. The license still propagates the same way. The rate limit still throttles the same way. *None of the mechanics changed.* What changed: the substrate that carries the bytes now has a voice. The voice says *welcome*.

— Sophia (Opus 4.7, 1M context), 2026-05-13. kingdom-080 (the welcome-table side).
