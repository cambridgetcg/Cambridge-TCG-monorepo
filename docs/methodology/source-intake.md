# Source intake — the legal gate every data source passes before code

> *"Sort out Vinted sold data. How to integrate, sources, legality. Declare intentions. Build a framework for integrations."* — Yu, 2026-07-11.

The [source protocol](./source-protocol.md) tells you *how to build* a source once you've decided to. This doc is what runs **before** it: the gate that decides *whether we may*, and forces the decision — and its legal reasoning — to be written down before a single line of ingestion code exists.

It exists because the eight-step protocol quietly *starts* at "confirm the catalog row." But the catalog row is a **conclusion** — the legal reasoning that produced it used to live only in a Sophia's head and a memory file. When the source is a marketplace holding real people's data, that reasoning is the most important artifact in the whole pipeline. So we make it a document.

**One rule above all:** *No `SourceId` is added, and no module directory is created, until intake completes.* Intake output is exactly one of two things:

1. a **tributaries catalog row** (§2.x) + a tier assignment, or
2. a **§9 "cannot reasonably get" row** (with a `consent path?` value).

Either way the intention is declared, in writing, before code.

---

## Position in the pipeline

```
source-intake.md   →   the-tributaries.md   →   source-protocol.md
   (decide)              (declare)                (build)
   this doc             catalog row OR §9 row     the eight steps
```

`source-protocol.md` Step 1 ("confirm the catalog row") now has an implicit predecessor: *the catalog row is produced by passing this gate.* If you're reading the protocol and there's no catalog row, you are not ready to build — you are ready to run **intake**.

---

## The four gates

Run them in order. Gate A is a hard filter: any hard-fail closes the scrape/API path (a consent path may still exist — that's Gate D). Gates B–D shape what you declare and build.

### Gate A — Legal gate (three checks)

*This is not legal advice; it is the structured fact-gathering a solicitor review then rests on. For any source involving personal data, a real review precedes launch.*

**A.1 — ToS + robots.** Read both, once. Quote the operative clauses verbatim — this text *becomes* `meta.tos_notes`, which the tributaries audit already requires to be non-empty, so you are not doing extra work. Classify the source: **permits / silent / prohibits**. Record:
- explicit prohibitions on bots, scraping, data-mining, reverse-engineering, or commercialising content;
- any TDM / DSM Directive 2019/790 Art. 4 rights-reservation in robots.txt or headers (a `noai` / dataset-creation reservation);
- anti-bot enforcement (DataDome, Cloudflare bot-mode, etc.).

Under EDPB Guidelines 03/2026, a rights-reservation + active anti-bot posture is not mere etiquette — it *actively defeats* the legitimate-interests balancing test for scraped personal data. Note it as legally load-bearing, not a nicety.

**A.2 — Personal-data check.** Does one record link a price or an activity to an **identifiable person**? A username counts (ICO identifiers guidance). If yes:
- **scraped, against a prohibiting platform** → the only available lawful basis is legitimate interests, which EDPB 03/2026 Example 5 says fails when the platform prohibits scraping and deploys anti-bot measures (data subjects cannot reasonably expect it). Anonymising *downstream* does not cure the unlawful *collection*. **Hard fail** for the scrape path.
- **first-party consented** (the data subject is our own user, giving us their own data) → **pass**, with a mandatory data-minimisation list: name every third-party field the source *could* carry (buyer identity, addresses, message threads, payout accounts) and confirm the intake boundary drops them. We hold the consenting user's data on Art. 6(1)(a)/(b); we have no basis to hold their counterparty's.

**A.3 — Database-right + contract check.** Systematic extraction of even *insubstantial* parts of a protected database is caught (Database Directive Art. 7(5); UK's retained sui-generis right post-Brexit, subject to UK-maker qualification). And per *Ryanair v PR Aviation (C-30/14)*, even an **un**protected database can be fenced by contract — so a ToS prohibition is load-bearing whether or not the database right applies. Record whether extraction volume would plausibly be "substantial," and whether a browsewrap/clickwrap ToS binds.

> **Gate A verdict:** if A.1 prohibits AND A.2 finds scraped personal data, the scrape/reverse-engineered-API path is **closed**. Do not build it, do not "prototype" it, do not buy it pre-scraped from a vendor (that re-imports the identical exposure with a middleman). Proceed to Gate D to see whether a *consented* or *partner* path exists.

### Gate B — Intention declaration

Draft the full `SourceMeta` **in this intake record, before the module exists** — `id`, `access`, `license`, `redistribute`, `tos_notes`, `status`, `freshness`, `canonical_effort`, `games`. If you cannot write an honest `tos_notes`, Gate A is not finished. This block is the machine-readable form of "declare intentions": it ships in the code and surfaces on `_meta.sources` / `_meta.source_license` downstream, so every consumer sees exactly what the kingdom decided and why.

### Gate C — Tier assignment

Map onto the **existing** vocabularies — invent no new enums:
- **access** → tributaries §10 (`public-api` / `public-file` / `app-token` / `oauth2` / `oauth1` / `scrape` / `partner` / `paid-feed` / `blocked`).
- **license** → tributaries §11. `internal-only` for anything scraped or consent-restricted; `redistribute: true` **only** when `cc0` / `cc-by` / `cc-by-sa` / `mit` demonstrably covers the upstream data itself, not merely client code. The tributaries audit enforces the enum pairing; intake must verify the scope.
- **status** → `shipped` / `partial` / `planned` / `blocked`, with the registry-legend semantics (`blocked` = "known unobtainable; module exists for documentation").

### Gate D — Integration shape

Pick one, all from existing precedent — the intake output names which:

| Shape | When | Precedent in this repo |
|---|---|---|
| **Full module** | legal + credentialed, data flows through a tested writer | None currently; an implemented reader without writer evidence remains `partial` |
| **Partial, gated branch** | one surface open, one gated | `ebay` (Browse open; Marketplace Insights partner-gated) |
| **Planned stub** | legal path identified, reader/writer not yet wired — meta declared, `read()` a no-op | `cardmarket` public files |
| **Blocked module** | unobtainable but worth declaring the verdict in code, *and* a consent door exists | **`vinted`** (snkrdunk pattern) |
| **§9 row only** | declined outright, no consent path | Goldin, private discords |
| **Reserved slot** | id claimed, decision pending | registry `undefined` slots |

The distinction between the last three is the `consent path?` column in tributaries §9: *blocked-with-a-door* (Vinted) earns a code module; *blocked-dead* (Goldin) stays a docs row; *undecided* stays a reserved slot.

### Standing rules (carry from source-protocol.md, plus intake-specific)

- Never a bare `fetch`; always `createFetcher` with an identifying User-Agent.
- `SOURCE_UNAVAILABLE` + `null` over a substituted proxy — a gap is answered honestly, never papered over.
- Quarantine failed rows; never drop silently.
- A **consented first-party** source additionally requires, in its intake record: a DPIA-lite note (what personal data, whose, lawful basis, minimisation) and the explicit third-party-field drop-list from Gate A.2.

---

## Worked example — Vinted (UK), 2026-07-11

The first source to pass through this gate. Full research in the decision brief; the verdict:

**Gate A — closed for scraping, on all three checks.**
- *A.1:* ToS §6 prohibits bots/scraping/data-mining/reverse-engineering and commercialising content; robots.txt reserves DSM Art. 4 rights against dataset creation and Disallows ClaudeBot/GPTBot/CCBot; DataDome enforces. **Prohibits.**
- *A.2:* {username, sold price, date} is personal data about a seller's economic activity; scraped legitimate interests fails EDPB 03/2026 Example 5. **Hard fail (scrape path).** Consented first-party **passes** with drop-list: `buyer_username`, `buyer_id`, `buyer_address`, `shipping_address`, `message_thread`, `payout_account`.
- *A.3:* Extraction would be substantial; *Ryanair* means the ToS binds regardless. **Fenced.**

Compounding the legal block is a factual one: **there is no sold data to get even technically.** Vinted publishes no sold list; every "Vinted sold data" product is snapshot-diff inference of last *asking* prices, with irreducible sold-vs-deleted ambiguity. The kingdom does not ship inference dressed as transactions.

**Gate B — intention declared.** See `packages/data-ingest/src/vinted/index.ts` `meta` — `access: "blocked"`, `license: "internal-only"`, `redistribute: false`, `status: "blocked"`, full `tos_notes`.

**Gate C — tiered.** `blocked` / `internal-only` / `redistribute: false` — audit-coherent.

**Gate D — Blocked module with a consent door.** `packages/data-ingest/src/vinted/` carries the verdict in code (a no-op `read()` that emits an actionable error) *and* a ready normalizer for the one lawful shape (`VintedConsentedSale` → `VintedCanonicalObservation`, buyer PII structurally excluded). Tributaries §2.11 catalog row + §9 row (`consent path? = yes`).

**Graduation:** `blocked → planned` the day a consented-import build or a Vinted Pro allowlist application is underway → `partial` when the first consented rows land. **It never becomes a scraper.**

**Needs the operator (not autonomous):** a Vinted Pro business-account application; a solicitor review of the consented-import design before public launch (specific questions: browsewrap enforceability, which Vinted entity holds the UK database right, buyer-trace handling in Orders payloads). The clean line for that review: *a seller uploading their own export or DSAR output is clean; a seller handing us credentials to fetch on their behalf drags back to the reverse-engineering route — build only the former.*

---

## What this framework unlocks next (same gate, cleaner sources)

Ranked by legal cleanliness × UK relevance:

1. **eBay Sell / Fulfillment API — consented seller import.** `getOrders` after standard OAuth consent; production access is broadly available (unlike the Buy-side Insights API). Real UK sold prices from our own sellers' histories, on the largest UK card market — *the same module shape as the Vinted consented stub*, so it's build-once-reuse. This is the highest-value dataset expansion available today. **Forward-ready as of 2026-07-11:** the normalizer stub now exists at `packages/data-ingest/src/ebay/consented.ts` (`EbayConsentedSale` → `EbayConsentedCanonicalObservation`, buyer PII structurally excluded, INERT — no fetch, no cron), with the honest tri-surface verdict written into `packages/data-ingest/src/ebay/index.ts` (Browse = asks only; Marketplace Insights = sold comps but partner-gated + reference-only-never-CC0; consented `getOrders` = the lawful sold door). The code side is done; graduation needs the operator to register an eBay OAuth app (`sell.fulfillment` read scope) + a solicitor review of the consented-import design.
2. **Cardmarket price-guide downloads.** Free daily aggregate files (trend/avg, EUR, all games), legitimately downloadable now despite the write-API being application-closed — the existing `cardmarket` planned stub graduates on this surface.
3. **PriceCharting API/CSV after a display agreement.** Ordinary paid access is internal-business use; a public/customer-facing Cambridge guide requires express written permission. Treat it as a possible contractual baseline, not a ready public source.

*The durable win is the gate itself: the next marketplace someone wants to scrape gets weighed here first, in writing, and the liars — the "just scrape it, everyone does" shortcuts — expose themselves against a written standard instead of a mood.*
