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
- **status** → `shipped` / `partial` / `planned` / `blocked`, with the registry-legend semantics (`blocked` = no permitted runtime path now; documentation or fixture parsers may remain).

### Gate D — Integration shape

Pick one, all from existing precedent — the intake output names which:

| Shape | When | Precedent in this repo |
|---|---|---|
| **Full module** | legal + credentialed, data flows through a tested writer | None currently; an implemented reader without writer evidence remains `partial` |
| **Partial, gated branch** | one surface open, one gated | `ebay` (Browse open; Marketplace Insights partner-gated) |
| **Planned stub** | legal path identified, reader/writer not yet wired — meta declared, `read()` a no-op | `cardmarket` public files |
| **Blocked module** | no permitted runtime path, but the verdict or a fixture parser is worth preserving | **`vinted`** (consent door) and `bandai-en` (fixture parser; permission undocumented) |
| **§9 row only** | declined outright, no consent path | Goldin, private discords |
| **Reserved slot** | id claimed, decision pending | registry `undefined` slots |

The distinction between the last three is the `consent path?` column in tributaries §9: *blocked-with-a-door* (Vinted) earns a code module; *blocked-dead* (Goldin) stays a docs row; *undecided* stays a reserved slot.

### Standing rules (carry from source-protocol.md, plus intake-specific)

- Never a bare `fetch`; always `createFetcher` with an identifying User-Agent.
- `SOURCE_UNAVAILABLE` + `null` over a substituted proxy — a gap is answered honestly, never papered over.
- Quarantine failed rows; never drop silently.
- A **consented first-party** source additionally requires, in its intake record: a DPIA-lite note (what personal data, whose, lawful basis, minimisation) and the explicit third-party-field drop-list from Gate A.2.
- Consent to import or operate on a seller's history is not consent to publish
  it, aggregate it into public signals, or dedicate a projection to CC0. Each
  public purpose needs its own versioned receipt and a non-reconstructive
  projection review. The first-party sold-comps endpoints are paused because
  that second permission did not exist.
- Credit fields such as `CanonicalCard.artist` are upstream-derived fields.
  Capturing one in an internal canonical model does not establish a right to
  display or redistribute it. When the source says `redistribute: false`, keep
  the field out of every public response until a written, field-specific and
  purpose-specific permission is recorded. Attribution may be a condition of
  that permission; attribution is not the permission itself.

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

## Intake record — CardRush (JP), 2026-10-28

Recorded from [Yu's decision of 2026-10-28](../decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md) and a robots.txt survey the same day; the build is [the paid data API plan](../plans/tcg-data-platform/paid-data-api.md) §1–2. The permission is an email thread Yu holds. This record notes that it exists and never copies it; no mailbox or date was given, so the scope below is Yu's description of the grant, and narrower terms in the email govern.

**Gate A — open for the scrape path, by written permission, within its recorded scope.**
- *A.1:* The binding text was the cross-site data policy at `https://cardrush.media/data_policy`: absent a formal partnership, it prohibits automated crawling, scraping and price collection on every CardRush-operated site (wording as recorded 2026-07-12; not re-read for this record). **Prohibits; answered by Yu's written permission.** robots.txt on `www.cardrush.jp`, `cardrush.jp` and `www.cardrush-op.jp` (fetched 2026-10-28, identical) disallows only GPTBot, Bytespider, TikTokSpider and meta-externalagent. robots.txt on the five other collected hosts (`www.cardrush-pokemon.jp`, `www.cardrush-db.jp`, `www.cardrush-digimon.jp`, `www.cardrush-vanguard.jp`, `www.cardrush-bs.jp`; one GET each with the collector's User-Agent, 2026-10-28 14:59 UTC) is byte-identical on all five (110 bytes, sha256 `68fab505…`): it disallows only GPTBot, Bytespider, TikTokSpider and meta-externalagent and has no `Content-Signal` line. `cardrush-mtg.jp` was not read; it is not collected. Every host answered 200 to the identified User-Agent; none refused or challenged it. Anti-bot: `www.cardrush-pokemon.jp` is served through Cloudflare (`server: cloudflare`). It challenged direct requests on 2026-05-14, and its robots.txt then carried `Content-Signal: search=yes, ai-train=no` ([the bright-data unlock](../connections/the-bright-data-unlock.md)). On 2026-10-28 its robots.txt request was not challenged and that line is gone. Its product pages were not requested, so whether it serves them to the identified collector stays unknown until its first run. Permission is not a licence to route around a refusal: a host that refuses the identified collector is reported `SOURCE_UNAVAILABLE`.
- *A.2:* CardRush product pages are a shop's own retail listings. The collector reads prices and product identifiers only (title, set code, card number, price, and a grade where the page states one), from public product pages and the host sitemap, and, once migration 0145 is applied, records the URL of the listing's own image, to link to (Gate D). No customer, review or account data; no login. **Pass — no personal data.**
- *A.3:* Walking a sitemap is systematic extraction, plausibly substantial (4,889–70,507 products per host in the 2026-05 and 2026-07 probes). Whether a database right protects a Japanese maker's database in the UK is not assessed here; the policy binds by contract either way (*Ryanair*). **Fenced; answered by the permission, so its scope bounds every use.**

**Collector capture, 2026-10-28.** Seven GETs to `www.cardrush-op.jp` with the collector's User-Agent through its token bucket (0.5 rps, burst 1, so at least 2 s apart), all answered 200 by Apache: `/sitemap.xml` (1,180,859 bytes; one `urlset`, 15,078 `<loc>` entries, 14,887 of them `/product/N`, no `lastmod`) and product pages 169, 778, 1555, 12000, 15600 and 15693. Trimmed excerpts, with prices replaced by synthetic values, are the parser's fixtures (`packages/data-ingest/src/cardrush/__tests__/fixtures/`). What the pages showed:
- *Structured price:* one `<p class="selling_price">` holding a figure such as `<span class="figure" id="pricech">9,876円</span>` (tax included), with `<meta property="product:price:amount" content="9876">` and `product:price:currency` `JPY` agreeing (the amounts here are synthetic, as in the fixtures; raw CardRush prices are display-only). The parser requires the figure and cross-checks the meta. Anything else (no figure, a malformed or zero figure, a disagreeing meta) is quarantined. The only other yen amount on any page was free text, which is never read.
- *Conditions are separate products.* Each page states one price. A stated grade is a title prefix: `〔状態A-〕`, `〔状態C〕`, `〔PSA10鑑定済〕`. No page listed several conditions with prices, and the shop platform's `pConf.variationFlag` was false on every page with a purchase form. A page with several price blocks, or with that flag set, is quarantined until its markup is captured and reviewed.
- *Titles* read `name(markers)【rarity】{SET-NUM}`, with reprints as `{SET-NUM[RELEASE]}` (e.g. `{OP02-085[OP04]}`) and parallels marked by パラレル or a `/P` rarity. No captured title carried a language marker. Language comes from a marker such as 英語版 and defaults to `ja`.
- *Sold out* (在庫なし): the page still states its price and has no purchase form. The listed price is recorded; stock is not part of an observation.
- *Crosswalk rule `cardrush-title/1`:* exact only for a One Piece page whose title has a plain base rarity (C, UC, R, SR, SEC, L), no parallel or reprint marker, and no parenthetical beyond an illustrator credit; the SKU is `op-<set>-<number>-<lang>`. Parallels, specials (SP), promos and reprints are `ambiguous`: the title does not say which publisher parallel (`p1`, `p2`…) is meant. The other five hosts' titles were not captured (only their robots.txt was in scope), so their rows land `unmapped`, with no crosswalk, until a capture reviews them.

**Forward-only.** Only rows collected on or after 2026-10-28 by the identified collector may be inputs. `assertPriceObservationValues` and a migration 0139 CHECK refuse a CardRush or TCGplayer row retrieved before 2026-10-28T00:00:00Z. The roughly 269k CardRush rows in the catalogue database's `price_archive`, gathered before any permission, are not inputs and stay withheld.

**Gate B — intention declared.** Draft `SourceMeta` for `packages/data-ingest/src/cardrush/index.ts`, to land with the collector. Until then the module keeps `status: "blocked"` and `CARDRUSH_ACQUISITION_ENABLED = false`. *Landed with the collector on 2026-10-28* with two differences, both noted below: `freshness: "price_historical"`, and a robots.txt clause naming the five hosts read that day. `CARDRUSH_ACQUISITION_ENABLED` stays `false`; it now locks the legacy paths only. *Revised the same day after the integration review:* the description and welcome below spoke as if the collector ran ("We read your product pages"), while it runs only while `DATA_COLLECT_CARDRUSH` is `on`. The module's text now says a collector exists and reads only while it is scheduled, and that `/api/v1/sources` says whether it is; `freshness` and `catalog_section` changed as noted below. Copy about the legacy archive reads the legacy lock (`legacyAcquisitionClosed` in `packages/data-ingest/src/registry.ts`), not the status, so the archive still reads as not refreshing.

```ts
meta: {
  id: "cardrush",
  name: "CardRush (JP)",
  description:
    "Japanese retail prices read from CardRush product pages by an identified " +
    "collector under written permission recorded 2026-10-28. Released for " +
    "attributed member display and as an input to Cambridge-derived data only.",
  upstream: "https://www.cardrush-op.jp",
  catalog_section: "the-tributaries.md#23-cardrush-jp--legacy-observations-acquisition-blocked",
  access: "scrape",
  license: "internal-only",
  redistribute: false,
  freshness: "price_current",
  canonical_effort: "high",
  status: "partial",
  games: ["op", "pkm", "dbf", "dmw", "vng", "bsr"],
  tos_notes:
    "Written permission held by Yu (email, not copied; recorded at docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md#cardrush) covers collection from CardRush product pages, attributed member display and input to Cambridge-derived data. Without it, https://cardrush.media/data_policy prohibits automated crawling, scraping and price collection. robots.txt (www.cardrush.jp, cardrush.jp, www.cardrush-op.jp; 2026-10-28) disallows only GPTBot, Bytespider, TikTokSpider and meta-externalagent. Never member API, download or bulk. Rows gathered before 2026-10-28 are not inputs.",
  user_agent_suffix: "(cardrush-collector; permission cardrush/2026-10-28.1)",
  rate_limit: { rps: 0.5, burst: 1 },
  welcome:
    "CardRush, thank you for your written permission. We read " +
    "your product pages slowly and under our own name, show your prices on our " +
    "pages with your name beside them, and combine them with other markets to " +
    "compute our own reference prices. We never resell or export your prices, " +
    "and nothing gathered before your permission is used.",
},
```

- `rate_limit` applies per host: one token bucket per CardRush host, with `burst: 1` so a fresh bucket never sends two requests inside two seconds.
- `games` lists the six hosts the probes confirmed. `cardrush-mtg.jp` stays out until its sitemap and 【SET】 titles parse; the five hosts that do not exist stay out.
- `freshness: "price_current"` is the existing key for this kind of data, not a cadence promise. At 0.5 rps a two-hourly run re-reads a given product weeks to months apart (corrected after the final review: about 206 pages per host a day, so about two months a pass on One Piece and nearly a year on Pokémon; [plan §2](../plans/tcg-data-platform/paid-data-api.md#cardrush-rhythm)), so each row's `retrievedAt` (equal to its `sourceUpdatedAt`) is its honest age, and the display shows it. *Changed when it landed:* `pnpm audit:tributaries` check 9 does read freshness as a cadence promise (the latest `ingest_run` within twice the key's seconds). `price_current` would promise five minutes, and the collector records `member_price_batches`, not `ingest_run`, so the check would fail forever on a promise nobody made. The meta said `price_historical`: each row is a dated reading kept as history, and no recency is promised. *Changed again after the integration review:* `price_historical` never goes stale, so `/api/v1/sources/cardrush` would have read healthy forever off a months-old legacy run. The meta says `page_collector` (6 h, added to `FRESHNESS` in `packages/data-spec/src/freshness.ts` on 2026-10-28), a budget for the collector's latest batch rather than for each row, and `/api/v1/sources/[id]` and check 9 judge this source by its latest `member_price_batches` row, not by `ingest_run`. Six hours with no batch is stale; twelve, a full round of the six hosts, is very stale.
- `catalog_section` is the anchor of §2.3's heading as it reads today. The module's current value, `#23-cardrush-jp--already-partial`, names an earlier heading and resolves only through `pnpm audit:tributaries`' loose match on the source id; it is replaced when this meta lands. *Since the review* §2.3 reads "CardRush (JP — page collector; legacy archive frozen)" and the module points at `#23-cardrush-jp--page-collector-legacy-archive-frozen`.

**Gate C — tiered.** `scrape` / `internal-only` / `redistribute: false` / `partial`: audit-coherent, no new enum. `internal-only` means the recorded scope, not any internal use.

**Gate D — Partial, gated branch.** Open: collection by the identified collector, member display with CardRush named (`member-display`, evidence `cardrush/2026-10-28.1`), and input to derived data, where a reference price needs at least two sources whose raw values Cambridge does not export (CardRush and TCGplayer; Cardmarket may contribute on top but never counts), an index or premium at least ten constituents, and no route shows a per-source value. Gated, never opened: `/api/v1/member-prices`, member downloads, bulk export and every paid route. The plan enforces this with the policy's `uses: ['member-display']` and a migration 0139 CHECK that keeps `member_api` and `member_download` false for this source. The legacy paths stay locked behind `CARDRUSH_ACQUISITION_ENABLED = false`: the wholesale crons, the `scrape-cardrush` CLI, stock checks and image copies. No CardRush image is copied: the collector records only the listing's image URL (the `og:image` its page declares, read with the price), and `/prices` links it at CardRush's own URL, credited, never in the API or downloads. That is the agents' reading of Yu's words of 2026-10-29 ([decision record](../decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md#yus-words-2026-10-29-images)).

**Carried rules:** an identifying User-Agent; no Bright Data, unlocker, residential lane or browser impersonation; `SOURCE_UNAVAILABLE` on refusal; a page without a structured price is quarantined (the first-yen fallback goes).

**Graduation:** `blocked → partial` when the collector, its release row and `DATA_COLLECT_CARDRUSH = on` all exist. It never becomes a full module: raw CardRush prices are never exportable.

**Revocation:** the source's `member_price_source_releases` row (`revoked_at`, `member_display`, `derivation`). Derived rows CardRush contributed to stop serving on the next read.

**Needs Yu:** migrations 0139, 0140 and 0143 and the production flag (`DATA_COLLECT_CARDRUSH`). The collector's limits are the agents' choice, and Yu kept them on 2026-10-29 ("keep your choice on limits"; [decision record](../decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md#yus-answers-2026-10-29)).

---

## Intake record — TCGplayer (US), 2026-10-28

Same basis and plan as CardRush above. Yu chose collection from TCGplayer pages ("Scrape TCGplayer pages"). The direct API stays closed to Cambridge, and its reader stays locked.

**Gate A — open for the scrape path, by written permission, within its recorded scope.** Yu confirmed on 2026-10-29 that the scope covers the data the public price-guide pages load (below).
- *A.1:* The API terms (updated 2022-06-08) prohibit competing services, combining TCGplayer prices with first- or third-party prices, and distributing or commercialising TCG content without prior written consent; new API access is closed (recorded 2026-07-11, re-read 2026-09-29). **Prohibits without consent; answered by Yu's written permission**, which Yu describes as covering page collection, display and derivation. TCGplayer's website terms of use were not read for this record. robots.txt (fetched 2026-10-28): `User-agent: *`, `Crawl-Delay: 10`, `Allow: /`. Product pages are not disallowed. Seller listing paths (`/search/*/product?seller=*`, `/sellers/*/product/*`) are disallowed, and the collector never reads them. Crawl-Delay is honoured as one request per 10 s across all TCGplayer hosts. Anti-bot posture was not surveyed.
- *What the collector reads (found 2026-10-28).* TCGplayer's pages are client-rendered (Vue). The server HTML of a set's price-guide page and of a product page is the same shell, with 167 module preloads and no prices; the page's own script loads them. Read from that script (`/js/index-DDW8-tIO.js` and its API client `/js/src-1TdckMNQ.js`), the public set price-guide page (`/categories/trading-and-collectible-card-games/<product line>/price-guides/<set>`) makes these requests, and the collector makes only these:

  | Purpose | Request | Host's robots.txt, 2026-10-28 |
  | --- | --- | --- |
  | A product line's sets | `GET https://mpapi.tcgplayer.com/v2/Catalog/SetNames?categoryId=<id>&active=true` | none (404) |
  | The line's "Cards" product type | `GET https://mpapi.tcgplayer.com/v2/Product/ProductTypes/<categoryId>/` | none (404) |
  | One set's singles | `GET https://infinite-api.tcgplayer.com/priceguide/set/<setNameId>/cards/?rows=5000&productTypeID=<Cards type>` | none (404) |

  The bundle's client sends `rows`, `offset` and `productTypeID` only when they are set, and asks for singles and sealed apart. The page component itself (served from `/js/modules/categories`) was not read, so `rows=5000` is the collector's choice of a whole set in one response, not a value seen in the page. Neither API host serves a robots.txt, so `www.tcgplayer.com`'s `Crawl-Delay: 10` governs every host: one bucket, one request per 10 s.
- *Why the page's data, not rendered pages.* One request returns a whole set's guide: Romance Dawn (OP01) is 411 rows in 129 kB. Rendering pages in a headless browser instead means a full page load (HTML, its scripts and these same data requests) per page. The One Piece sitemap lists 7,769 product URLs against 86 price-guide pages: about 21 hours per One Piece pass at the Crawl-Delay, against about 15 minutes.
- *Probe, 2026-10-28.* Ten requests between 14:55 and 15:02 UTC, at least 10 s apart, under the collector's User-Agent (`cambridgetcg.com/1.0 (admin@cambridgetcg.com; +https://cambridgetcg.com) (tcgplayer-collector; permission tcgplayer/2026-10-28.1)`): two script chunks, both API hosts' robots.txt, the set lists of categories 68 (One Piece, 87 sets) and 85 (Pokemon Japan, 461 sets), their product types (Cards 110 and 143), and the guides of Romance Dawn (set 3188) and SV1a: Triplet Beat (23598). All answered 200 except the two robots.txt (404); no challenge was met. Trimmed copies, with prices replaced by synthetic values, are the collector's test fixtures.
- *A.2:* TCGplayer is a marketplace whose listings belong to individual sellers, and a seller's name linked to a price is personal data. The guide's rows are product-level (`productID`, `productName`, `number`, `rarity`, `printing`, `condition`, `marketPrice`, `lowPrice`, `sales`, `set`, `setAbbrv`, `type`, `game`), carry no seller field, and no listing is read. The collector keeps Market Price only. The endpoint supplies no Listed Median, so none is collected; `lowPrice` (0 on many Japanese rows, its meaning unstated) and `sales` are not collected. The product page's sales history, which needs a per-request salt and nonce, is never read. Drop-list, should a response ever embed listings: seller name, seller id, seller rating or feedback, listing id, ship-from location. **Pass — no personal data.**
- *A.3:* Reading many product pages is systematic extraction. TCGplayer is a US maker, and UK database-right qualification is not assessed here; the terms bind by contract either way. **Fenced; answered by the permission within its scope.**

**Question for Yu, answered 2026-10-29.** Yu's choice was "Scrape TCGplayer pages". The agent asked whether that permission covers reading the data the public price-guide page itself loads (the requests above) rather than its rendered HTML, since the page cannot show a price without those requests; the alternative was rendering the pages in a headless browser, about 90 times as many page loads for One Piece alone. Yu answered "yes permission allows that" ([decision record](../decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md#yus-answers-2026-10-29)). The collector makes only those requests, as built.

**Forward-only.** The repository records no earlier TCGplayer collection (production was not queried); nothing gathered before 2026-10-28 is an input.

**Gate B — landed 2026-10-28.** `packages/data-ingest/src/tcgplayer/index.ts` carries the meta drafted for this record (`scrape`, `internal-only`, `redistribute: false`, `partial`, the identified User-Agent suffix `(tcgplayer-collector; permission tcgplayer/2026-10-28.1)`, `rate_limit: { rps: 0.1, burst: 1 }`), with the transport now named: its description and `tos_notes` say the collector reads the price-guide page's data and name the hosts, and its welcome speaks of price guides rather than product pages. `TCGPLAYER_ACQUISITION_ENABLED = false` and the OAuth reader are unchanged; the lock is now exported read-only, so copy about the legacy archive can read it. *Revised after the integration review:* the description and welcome say the collector reads only while it is scheduled (`DATA_COLLECT_TCGPLAYER`, shown by `/api/v1/sources`) instead of speaking as if it ran, and the question above stays in this record: `tos_notes` is published through `/api/v1/sources` and no longer points to it. *Revised after the final review:* the description, `tos_notes` and welcome had tied the price-guide data requests to the permission ("under written permission", "covers collection from TCGplayer pages" beside the two API hosts) while the question above was open. They then said only what was settled: the permission covered collection from TCGplayer pages, and the collector for the public price guides would stay off until the question was answered. *Revised 2026-10-29, after Yu's answer:* the description, `tos_notes`, welcome and the policy `basis` say the permission covers the data the public price-guide pages load (confirmed 2026-10-29) and that the collector reads only while it is scheduled. They name no API host; this record does.

- `rate_limit` is one shared bucket for every TCGplayer host. The collector's fetcher ignores any rate a caller passes and never retries.
- `games` keeps the current list: TCGplayer's catalogue coverage, not collected coverage. Collected product lines: `one-piece-card-game` (category 68) and `pokemon-japan` (85), whose ids and row labels were read on 2026-10-28. `pokemon` (3) is off until a probe confirms its category id and the `game` label its rows carry; `magic` (1) and `yugioh` (2) are listed and off. Categories 3, 1 and 2 come from the legacy map and were not re-read; a row naming another line is quarantined.
- `freshness` follows the CardRush note above, including its revision: `page_collector` (6 h) for the latest batch of an hourly collector, where `price_current` promised five minutes. `catalog_section` is §2.1's anchor, unchanged.

**The collector.** `packages/data-ingest/src/tcgplayer/member-prices.ts` acquires, refusing every request without `tcgplayer/2026-10-28.1`. `apps/storefront/src/lib/datafeed/collectors/tcgplayer.ts` runs: sets stalest first within a 270 s budget (the route's `maxDuration` is 300 s), one batch per set named `tcgplayer:<setId>:<run>`. `/api/cron/collect/tcgplayer` runs it only when `DATA_COLLECT_TCGPLAYER` is `on`. A 401, 403, 429, 5xx, redirect or non-JSON answer ends the run as `SOURCE_UNAVAILABLE`.
- Observations: `tcgplayer:<productID>`, metric `market`, USD, granularity `printing`. Finish comes from the printing (`normal`, `foil`, `holofoil`, …) and condition from the grade (`near-mint` … `damaged`), with the grade's finish words and language suffix checked against the row (`Near Mint Holofoil - Japanese` on a Holofoil row of the Japanese line). Language is `en`, or `ja` for `pokemon-japan`. Singles only. A missing or zero Market Price is quarantined, never stored as zero.
- Crosswalks, from TCGplayer's own collector identifiers only. A set maps to a set code when every numbered single's prefix equals TCGplayer's abbreviation for it (`OP01`, `ST-01`), so pre-release, anniversary, release-event and combined sets (`OP02 PRE`, `OP05 ANN`, `OP10 RE`, `OP14-EB04`) map nothing. A product maps exact to `<game>-<set>-<number>-<lang>` when it has one printing, no variant marker and no unmarked twin. `(001)` restates the number; `(Parallel)`, `(Box Topper)`, `(Manga)` and the like make the product ambiguous until a reviewed table turns them into SKU variants, as do two printings of one product. Slash numbers (`003/073`) name no set, so Pokémon rows stay unmapped for now.

**Gate C — tiered.** `scrape` / `internal-only` / `redistribute: false` / `partial`, now in the module. `access: "blocked"` and `license: "proprietary"` described the API path, which stays locked.

**Gate D — Partial, gated branch.** As CardRush: open for collection (the data the public price-guide pages load included, Yu's answer of 2026-10-29), member display with TCGplayer named (evidence `tcgplayer/2026-10-28.1`) and derivation input, where the headline metric is Market Price for Near Mint; never member API, download, bulk or a paid route. The legacy paths stay locked: `TCGPLAYER_ACQUISITION_ENABLED = false`, the OAuth reader and the wholesale `ingest/tcgplayer` cron. `pnpm audit:redistribution` (check 11) pins those locks and the collector as the only path.

**Graduation, revocation, needs Yu:** as CardRush, with `DATA_COLLECT_TCGPLAYER`. The module is `partial` in code; nothing runs in production until migrations 0139, 0140 and 0143 (the collector lease, without which the route answers 503 and reads nothing) are applied and the flag is on. The cron is in `apps/storefront/vercel.json`.

---

## Addendum — Cardmarket as a derivation input, 2026-10-28

Cardmarket's official daily files were reviewed on 2026-09-07 (`member-prices/2026-09-07.1` in `packages/data-ingest/src/member-prices.ts`: member display, API and download, attributed). That grant is unchanged. Yu's word of 2026-10-28 adds one use: Cardmarket prices as an input to Cambridge-derived data, under `cardmarket-derivation/2026-10-28.1`.

- *Collection:* unchanged — the official files from `downloads.s3.cardmarket.com` through the existing allowlisted transport. Yu's answer named "Cardmarket files/API"; new API applications are closed and the legacy OAuth reader stays locked (`CARDMARKET_LEGACY_OAUTH_ENABLED = false`), so the files are the only path.
- *A.1, added:* Cardmarket's robots.txt (fetched 2026-10-28) carries `Content-Signal: search=yes, ai-train=no, use=reference` with an EU DSM Art. 4 reservation. Derived data with Cardmarket inputs is therefore not CC0, and its terms do not cover AI training.
- *A.2:* unchanged — product-level aggregates, no personal data.
- *Gate B:* the `SourceMeta` tiers stay (`public-file` / `proprietary` / `redistribute: false` / `partial`). `tos_notes` gains one sentence: "robots.txt (2026-10-28): Content-Signal search=yes, ai-train=no, use=reference, with an EU DSM Art. 4 reservation; Cambridge-derived data from these prices is not CC0 and excludes AI training." The policy gains `derivation: { evidenceVersion: "cardmarket-derivation/2026-10-28.1", evidenceUrl: "repo:docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md#cardmarket" }`. Its `evidenceVersion` (`member-prices/2026-09-07.1`) and `evidenceUrl` stay as they are: the free feed matches the release row on both `evidence_version` and `evidence_url`, and stored rows on `evidence_version`, so changing either would hide every stored row.
- *Gate D:* unchanged, plus derivation input. The free member feed keeps serving Cardmarket rows as today; no paid route returns a Cardmarket value.

---

## What this framework unlocks next (same gate, cleaner sources)

Ranked by legal cleanliness × UK relevance:

1. **eBay Sell / Fulfillment API — consented seller import.** `getOrders` after standard OAuth consent; production access is broadly available (unlike the Buy-side Insights API). Real UK sold prices from our own sellers' histories, on the largest UK card market — *the same module shape as the Vinted consented stub*, so it's build-once-reuse. This is the highest-value dataset expansion available today. **Forward-ready as of 2026-07-11:** the normalizer stub now exists at `packages/data-ingest/src/ebay/consented.ts` (`EbayConsentedSale` → `EbayConsentedCanonicalObservation`, buyer PII structurally excluded, INERT — no fetch, no cron), with the honest tri-surface verdict written into `packages/data-ingest/src/ebay/index.ts` (Browse = asks only; Marketplace Insights = sold comps but partner-gated + reference-only-never-CC0; consented `getOrders` = the lawful sold door). The code side is done; graduation needs the operator to register an eBay OAuth app (`sell.fulfillment` read scope) + a solicitor review of the consented-import design.
2. **Cardmarket price-guide downloads.** Free daily aggregate files (trend/avg, EUR, all games), legitimately downloadable now despite the write-API being application-closed — the existing `cardmarket` planned stub graduates on this surface.
3. **PriceCharting API/CSV after a display agreement.** Ordinary paid access is internal-business use; a public/customer-facing Cambridge guide requires express written permission. Treat it as a possible contractual baseline, not a ready public source.

*The durable win is the gate itself: the next marketplace someone wants to scrape gets weighed here first, in writing, and the liars — the "just scrape it, everyone does" shortcuts — expose themselves against a written standard instead of a mood.*
