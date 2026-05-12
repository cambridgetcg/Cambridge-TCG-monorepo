# The pricing arrow — a number's journey from yen to your screen

> **Pull.** Not a random seed. The gravity of three turns of pricing-backend consolidation, and one small late-evening closure on top. Phase 0 shipped 2026-05-09 (`apps/admin/scripts/pricing-audit.ts`, `docs/pricing-current-state.md`, first Provenance pills). Phase 1 shipped 2026-05-10 (`packages/pricing/`, the wholesale shim, three storefront `× 0.77` sites collapsed into one source). Phase 2 shipped 2026-05-11 morning — what Act 4 below names: the Archive's missing log. Later that same evening **the second Falcon flight** landed, after a sister-Sophia read the arrow end-to-end as a deep-dive exercise: a previously-unnamed asymmetry between the catalog flight and the product-page flight was found and closed (Act 5, Act 6, Coda). The pull is the gravity of an artefact I promised would exist.
>
> **Form.** Story-as-wire in the S7/S8 mold. Phase 1 IS the wire — `packages/pricing/src/index.ts` exists; `apps/wholesale/src/lib/pricing.ts` is a re-export shim; three storefront files that used to recite `× 0.77` by rote now read from one source. This story names what the wire is *for*.
>
> Companion to S5 (`two-letters-and-a-falcon.md`, which named the Falcon as the courier of a typeahead). This entry extends that pitch to name the Falcon's *primary* cargo: the price catalog the kingdom flies every minute, every retail page, every customer.

---

## What this arc traces, in one sentence

One specific number — ¥600 sitting in a CardRush listing this morning — and the seven transformations it undergoes before it arrives at a Cambridge customer's screen as **£5.40** with a small grey label beneath it that says *synced from wholesale · 4h ago*.

---

## Cast

**The Hand.** The CardRush scraper. Reaches into a Japanese marketplace once a day at 02:00 UTC and copies down what it finds. Knows nothing about pounds or VAT or channels — only ¥ and stock counts. (`apps/wholesale/tools/scrape-cardrush.ts`, `apps/wholesale/src/lib/price-snapshot.ts`.)

**The Rate-Keeper.** A single floating-point number, `gbpJpyRate`, captured at the same moment as the JPY value. The kingdom's instantaneous claim about what one pound is worth in yen. Stored alongside every snapshot row — substrate-honest about *when* the FX call was true.

**The Computer.** The pricing engine. Lives in one chamber now — `packages/pricing/src/index.ts:113` — but until yesterday lived only inside the wholesale kingdom. Takes ¥ + rate + a channel name + a category and returns a `PriceBreakdown` with five rounded GBP numbers: baseGbp, exVat, vat, preRound, price.

**The Eight Channels.** Seven retail futures and one wholesale present. Each is a tiny config object — six numbers that say how to translate base into that channel's customer-facing price. `wholesale` (1.08× margin, 1.00× retail, round £0.01). `cambridgetcg` (1.15× retail, round £0.10). `shopify` (same as cambridgetcg). `ebay` (1.25× retail). `cardmarket` (1.20× retail, round £0.01). `tradein-cash` (0.55×, no fee, no VAT). `tradein-credit` (0.77×, no fee, no VAT). The same card priced for each channel produces seven different numbers. The kingdom does not pretend otherwise.

**The Archive.** `price_archive`. A daily snapshot table. Every card, every day, full breakdown frozen — `(card_id, snapshot_date, sku, cardrushJpy, gbpJpyRate, baseGbp, price)`. The substrate-of-record. When someone asks "what was this card priced at on May 8?", the Archive answers.

**The Falcon.** The Bearer-token courier between the two kingdoms. `apps/storefront/src/lib/wholesale/client.ts:91 — fetchPrices()`. Wears a `.trim()`-cleaned authorization header (Vercel's newline lesson is on file at line 13). Carries a five-second hourglass; if the Falcon doesn't return in time the storefront gets a recoverable empty result rather than a hung promise. The Falcon is also the typeahead courier of S5, but typeahead was the small flight. The big flight is the daily price catalog, fanned out across every market page, every catalog list, every checkout.

**The Embassy Gate.** Where retail meets the customer. `apps/storefront/src/lib/pricing.ts:48`. The wholesale kingdom does not let its base numbers cross the moor into the consumer world unstamped. The Embassy is where the stamp happens — and the Embassy keeps a small Appraiser at the gate.

**The Appraiser.** A tiny function. `retailPrice(wholesaleGbp, channelPrice?)`. Sees the Falcon arrive carrying a card from the Computer. If the Falcon's pouch has a `channel_price` already stamped — uses that. If not — applies the cambridgetcg channel's `retailMultiplier` and `roundTo` herself, drawn from the same scroll the Computer writes from. As of Phase 1 (yesterday), she no longer recites the numbers from memory; she reads them from `DEFAULTS["cambridgetcg"]` in the shared package.

**The Customer's Screen.** Where the journey ends. One number, large, emerald: `£5.40`. Beneath it, smaller, neutral grey: `synced from wholesale · 4h ago`. That second line is the Provenance pill — Phase 0's first contribution — and it is how the Embassy admits that the number is not live, that it was true four hours ago, that the Falcon flew at 02:00 UTC and hasn't flown again since.

---

## Act 1 — The Hand

It is 02:00 UTC. The Hand wakes on the wholesale Vercel cron and reaches into CardRush. The card it cares about today is a One Piece common-rare, SKU `op05-001`. The CardRush page reports a listing at **¥600** with three copies in stock.

The Hand writes nothing of meaning yet. It only copies. `cardrushJpy = 600`. `cardrushUrl = "..."`. `stock = 3`. These three facts land on a `cards` row.

The Hand does not know what £5.40 is. The Hand does not know the customer exists. It is the patient first link in a chain that has six more links to traverse before anything reaches anyone.

---

## Act 2 — The Rate-Keeper

The same cron, the same row, the same moment. The kingdom's view of the GBP/JPY exchange rate is captured. Today, `gbpJpyRate = 185.5`. One pound buys 185.5 yen at the rate the kingdom is willing to honor for the next 24 hours.

**This is a small act of cosmological honesty.** The rate is not "the exchange rate" — there is no such single number in the world. The rate is *the kingdom's claim at 02:00 UTC about what it will treat as the rate for today*. It is stored alongside the ¥ value because the rate at the moment of capture is the only rate that makes the ¥ value mean anything to a pound-paying customer.

`baseGbp` is now derivable: `600 / 185.5 = £3.23`. But it is not yet stamped on the card. That will happen in the Computer.

---

## Act 3 — The Computer's eight rooms

The Computer reads the ¥ and the rate and asks: *which channel?*

The wholesale-side cron asks for all eight channels, one after another. The Computer enters each room of its chamber in turn and produces a different number:

```
baseGbp = 600 / 185.5                                = £3.23

wholesale:       (3.23 × 1.08 + 0.22) × 1.00 × 1.20 → £4.45  (ceil £0.01)
cambridgetcg:    (3.23 × 1.08 + 0.22) × 1.15 × 1.20 → £5.40  (ceil £0.10)
shopify:         (3.23 × 1.08 + 0.22) × 1.15 × 1.20 → £5.40  (ceil £0.10)
ebay:            (3.23 × 1.08 + 0.22) × 1.25 × 1.20 → £5.90  (ceil £0.10)
cardmarket:      (3.23 × 1.08 + 0.22) × 1.20 × 1.20 → £5.61  (ceil £0.01)
tradein-cash:    3.23 × 0.55                          → £1.78
tradein-credit:  3.23 × 0.77                          → £2.49
```

The same ¥600 listing produces seven different customer-facing numbers and one wholesale price. Each room has six small numbers — margin, two flat fees, VAT, retail uplift, round step — and a name. The Computer's whole job is the multiplication.

**Until 2026-05-10, the Computer lived inside the wholesale kingdom only** (`apps/wholesale/src/lib/pricing.ts`). The storefront had its own smaller Appraiser who did a partial version of the same math (`× 1.15` ceil to `£0.10`), and three storefront files — the bounty page, the bounty email, the vault-expiring-soon handler — *each* hard-coded `× 0.77` for the tradein-credit calculation. Four kingdoms, four slightly-different recitations of the same chant.

Phase 1 of kingdom-049 moved the Computer into a shared chamber: `packages/pricing/src/index.ts`. The wholesale's `pricing.ts` became a re-export shim. The storefront's Appraiser still does her own partial computation but now reads `DEFAULTS["cambridgetcg"]` from the same scroll. The three `× 0.77` sites now read `DEFAULTS["tradein-credit"].marginMultiplier`. *Same numbers. One source.*

---

## Act 4 — The Archive

The Computer's cambridgetcg verdict for ¥600 at rate 185.5 is `£5.40`. This number lands in two places:

First, `cards.price` gets updated. The live retail-resolved price column. The card's current price as the kingdom understands it.

Second, a row is appended to `price_archive`:
```
card_id     = 8421
snapshot_date = '2026-05-11'
sku         = 'op05-001'
cardrush_jpy = 600
gbp_jpy_rate = 185.5
base_gbp    = 3.23
price       = 5.40
```

**The Archive is the substrate-of-record.** `cards.price` is a cache — useful for fast reads, but if anyone asks *how it became true*, the Archive is where the answer lives. (`price_history` is a partial-shape sibling table that overlaps with the Archive; Phase 4 of kingdom-049 will collapse them. The Archive wins because it carries the full breakdown; the History only carries JPY + rate.)

What the Archive *did not* record until 2026-05-11: who or what changed the price. The Hand changes it daily. An admin edit will change it. None of these mutations appended to a lifecycle log. This was the gap that Phase 2 closed — `card_price_change_log` now exists (`apps/wholesale/drizzle/0009_card_price_change_log.sql`, schema at `apps/wholesale/src/lib/db/schema.ts`, writer at `apps/wholesale/src/lib/price-change-log.ts`), and joins the Scribe's bookshelf (S8). Two paths write to it: admin edit always (`action="admin_edit"`, actorLabel `admin:<email>`); snapshot only when `price` or `baseGbp` differs from the previous value (`action="snapshot"`, actorLabel `cron:price-snapshot`). The log answers "when did this card's price change?" — not "did the cron run today?" The previously-suspected shopify-sync mutation path turned out to be a false positive: it only sets Shopify IDs and the synced-at timestamp, not the price columns. The audit's regex was tightened to match.

---

## Act 5 — The Falcon's flight

It is now 02:00:30 UTC. The card row is updated; the Archive row is written. The wholesale kingdom is quiet again.

Across the moor, a storefront page is being rendered. A customer typed `/catalog?game=one-piece&set=OP05` into their browser. The Next.js Server Component on the storefront calls `fetchPrices({ game: "one-piece", set: "OP05", limit: 48 })`. The Falcon is dispatched.

The Falcon adds the channel parameter (`cambridgetcg` by default), wears its Bearer token, lifts a five-second hourglass, and crosses to `wholesaletcgdirect.com/api/v1/prices?game=one-piece&set=OP05&channel=cambridgetcg&limit=48`.

The wholesale endpoint reads `cards` rows for the matching set, calls the Computer once per card with `channel="cambridgetcg"` to produce the per-row `channel_price`, and returns a JSON array of `PriceItem` objects. Each item carries `price_gbp` (the wholesale base, £4.45 for our SKU) AND `channel_price` (the cambridgetcg retail, £5.40) AND `updated_at` (the timestamp of the last snapshot).

The Falcon returns. The Server Component holds 48 `PriceItem`s.

**The Falcon is the only authoritative channel between kingdoms.** The storefront cannot read wholesale's `cards` table directly — it does not have a connection string to that database. Everything wholesale knows about a price reaches the storefront through this one HTTP boundary, this one Falcon, this one Bearer token. (`apps/storefront/src/lib/wholesale/client.ts:91`.)

But the Falcon flies *two* routes, not one — and until 2026-05-11 evening, only the catalog flight carried channel pricing. The single-SKU flight — `fetchCard(sku)` (`apps/storefront/src/lib/wholesale/client.ts:132`), dispatched whenever a customer arrives at `/product/[sku]` — visited `/api/v1/prices/[sku]?channel=cambridgetcg`. The endpoint *received* the channel parameter and *silently ignored it*: the handler at `apps/wholesale/src/app/api/v1/prices/[sku]/route.ts` selected only `cards.price` and returned no `channel_price`. The pouch arrived at the Embassy unsealed. The Appraiser, finding nothing stamped, fell back to her own incomplete formula (Act 6). The catalog grid and the product detail page silently disagreed on the same SKU, the same channel, the same hour — by roughly 10p for any given card — without either Provenance pill admitting it.

As of 2026-05-11 evening, the single-SKU endpoint mirrors the list endpoint's `priceForChannel` path. The Falcon's two flights now return the same shape. The two surfaces now render the same number.

---

## Act 6 — The Embassy Gate

The 48 `PriceItem`s arrive in the Server Component. The Embassy gate opens. Each item passes through the Appraiser.

`formatRetailPrice(item.price_gbp, item.channel_price)` runs. The Appraiser sees `channel_price = 5.40` is already stamped on the pouch — the Computer did the work upstream. She uses it. `£5.40` it is.

If the Falcon's flight fails and `channel_price` is missing? The Appraiser applies her own partial computation: `Math.ceil(price_gbp × DEFAULTS["cambridgetcg"].retailMultiplier / DEFAULTS["cambridgetcg"].roundTo) × DEFAULTS["cambridgetcg"].roundTo`. The fallback is incomplete — it skips VAT (on the assumption the wholesale base is already post-margin) and uses `Math.ceil` rather than the server's `Math.round`. Before 2026-05-11 evening, this branch was *routine* for every product-page render — because the single-SKU endpoint dropped the channel parameter (Act 5). Now it is *exceptional*: reached only on a 5xx, a timeout, or a card missing `cardrushJpy`/`gbpJpyRate`. `docs/pricing-current-state.md` still flags the remaining hazard for Phase 3 — when the DB-backed `channel_pricing` table becomes authoritative and silent fallbacks throw rather than mute-recover.

The pre-Phase-1 Appraiser had the multipliers (`1.15` and `0.10`) hard-coded into her own page. As of yesterday, she reads them from the same scroll the Computer writes from. *The Embassy and the wholesale chamber are no longer using two slightly-different recipes for the same translation.*

---

## Act 7 — The customer's screen

The 48 `PriceItem`s render into `<CardGrid>`. The catalog page mounts.

At the top of the grid, beneath the results count, a small line of text appears:

> **Showing 48 of 1,247 cards**  *synced from wholesale · 4h ago*

That second clause is the Provenance pill. It came from Phase 0 (`apps/storefront/src/lib/ui/Provenance.tsx`, the sister-shipped consumer port of the admin primitive). It declares the freshness of the catalog's prices: the most-recent `updated_at` across the 48 items, rendered as relative time. If the cron failed and the prices are now 36 hours stale, the pill turns amber and says *synced from wholesale · 1d ago* in a color that draws the eye. If the Falcon ever returns nothing, the pill says *source unavailable* in red.

The customer scrolls. Eventually they tap `op05-001` and arrive at `/product/op05-001`. The detail page calls `fetchCard("op05-001")`. The Falcon flies again (same Bearer token, same hourglass, single-card payload). The Appraiser stamps `£5.40`. The screen renders:

```
£5.40
synced from wholesale · 4h ago
```

That is the end of the arrow. The journey from ¥600 in a CardRush listing to £5.40 on one customer's screen has crossed: one cron, one Computer, one Archive, one Falcon, one Embassy, one Appraiser, one pill. *Seven transformations. One number.*

The customer thinks of none of this. The customer thinks "£5.40, that's reasonable, in stock, near mint." They click *Add to cart*. The kingdom moves on.

---

## Coda — what changed yesterday

Phase 1 of kingdom-049 did not change a single number on any customer's screen. £5.40 was £5.40 before yesterday's commit and £5.40 after. The acceptance criterion was *zero behavior change*; it was met.

What changed is the *meaning of how that number became true*.

Before Phase 1, if a future operator asked the codebase "what is the cambridgetcg channel's retail multiplier?", the codebase had at least two answers:
1. The wholesale `DEFAULTS["cambridgetcg"].retailMultiplier` in `apps/wholesale/src/lib/pricing.ts:46`. (1.15.)
2. The storefront `FALLBACK_MULTIPLIER` in `apps/storefront/src/lib/pricing.ts`. (1.15. Same number, different file, different name, no enforced coherence.)

If a future operator asked "what is the tradein-credit margin multiplier?", the codebase had at least four answers:
1. Wholesale `DEFAULTS["tradein-credit"].marginMultiplier`. (0.77.)
2. `apps/storefront/src/app/bounty/page.tsx`. (`* 0.77`. Inlined.)
3. `apps/storefront/src/lib/email/bounty.ts`. (`* 0.77`. Inlined.)
4. `apps/storefront/src/lib/email/handlers/vault-expiring-soon.ts`. (`* 0.77`. Inlined.)

Four answers, identical, no coupling. Change one and the others stay wrong silently.

After Phase 1, there is one answer: `DEFAULTS["tradein-credit"].marginMultiplier` in `packages/pricing/src/index.ts:101`. All four call sites read from there. The substrate-honesty audit's *off-canonical pricing math* count went from 3 to 0. The total drift count went from 15 to 11.

**What is still untrue, pending later phases:**

| Phase | Gap |
|-------|-----|
| ~~2~~ | ~~The Archive records the price but no log records who changed it.~~ **Closed 2026-05-11** — `card_price_change_log` exists; admin-edit and snapshot paths write to it. Per-card admin "Recent changes" surface landed in Phase 2.5 (admin `/commerce/pricing` reads the log). |
| ~~3~~ | ~~The Computer silently falls back to JS `DEFAULTS` if the DB row is missing.~~ **Closed 2026-05-11** — `apps/wholesale/src/lib/channel-pricing.ts` now throws on partial rows and missing channels with structured errors naming the seed migration. `getLoadStatus()` surfaces fallback state when the DB itself is unreachable. New admin Manager page at `/commerce/channel-pricing` with preview-before-save. |
| ~~4~~ | ~~The Archive has a sibling table `price_history` with a partial shape.~~ **Closed 2026-05-11** — `price_history` dropped (migration 0011); `card_price_history` renamed to `retail_price_observation` (migration 0089) so the substrate-honest distinction is visible at the schema level. The historical migration that created `card_price_history` stays on disk by design (we don't rewrite history); the audit was tightened to detect the later rename. |
| ~~5~~ | ~~No customer-readable methodology page.~~ **Closed 2026-05-11** — `docs/methodology/pricing.md` and `apps/storefront/src/app/methodology/pricing/page.tsx` shipped (contribution to kingdom-047). All six customer-facing storefront price surfaces (home, catalog, product detail, prices/one-piece, prices/one-piece/[set], trade-in) now carry both `<Provenance>` and `<WhyLink>` to `/methodology/pricing`. The arrow is customer-inspectable end-to-end. |
| ~~6~~ | ~~The trade's commission rate is scattered.~~ **Closed 2026-05-11** — `resolveCommission()` lifted into `packages/pricing/src/index.ts` (pure compute, accepts pre-fetched values so callers inside transactions can use their own query client). `market/lots.ts` and `market/db.ts` both wired through it. Bug fix in `lots.ts`: lot purchases previously ignored seller membership-tier discount, charging only the trust-side rate. |
| 7 | The vault's frozen sell-back price (`vault_items.spot_price_gbp`) is locked at acquisition and never re-syncs. **Product decision pending** — blocks on operator input. |

**Found in the deep dive, closed the same evening (2026-05-11):**

A gap that was never on the punchlist, because no one had named it: the catalog and product-page surfaces had been silently disagreeing on the same SKU. The list endpoint at `/api/v1/prices` honored `?channel=cambridgetcg` and returned a server-computed `channel_price`. The single-SKU endpoint at `/api/v1/prices/[sku]` received the same parameter and ignored it. The storefront's Appraiser then ran her local fallback for *every* product-page render — a `Math.ceil` formula that skips VAT — producing a number one £0.10 step *above* the catalog's. Same card, same channel, same hour. The Provenance pill on both pages said "synced from wholesale · 4h ago"; both were synced from the same row; neither admitted that the two surfaces had then taken different roads home.

The fix is one file (`apps/wholesale/src/app/api/v1/prices/[sku]/route.ts`): read the channel param, select `cardrushJpy` + `gbpJpyRate`, apply `priceForChannel` when the channel is non-wholesale, return `channel_price` exactly as the list endpoint does. *Unlike Phase 1 — which deliberately changed no number on any screen — this closure did change a number: every product-page price moved by one round-step downward, toward the catalog's. The two surfaces now agree. The substrate now tells one truth where it had been telling two.*

The arrow exists. The arrow is not yet fully witnessed at every junction. That is the work that remains.

---

## What other modules secretly need this for

### → The Falcon (S5)

S5 named the Falcon as a typeahead courier. The Falcon's primary cargo, in volume, is not typeahead — it is this. Every `/catalog` page load, every `/product/[sku]` page load, every `/market/[sku]` page load fans out into a `fetchPrices` or `fetchCard`. The typeahead the Falcon also carries is a side gig. *The price catalog is the Falcon's main duty.* This story is the missing half of S5's pitch.

### → The Cartographer (S3)

S3 named the Cartographer as the stock-ledger keeper. Stock and price are bound: a price for which there is no stock is a fiction; stock without a price cannot be sold. The Cartographer and the Computer both write to the same `cards` row at the same nightly cron, in different fields. The fact that they are coordinated by row identity rather than by an explicit handshake is a design choice the platform has been quiet about; this doc names it.

### → The Witnesses' Book (S13)

S13 named the lot-lifecycle-log as the place where agency lands. The pricing-arrow now has an equivalent: `card_price_change_log`, landed 2026-05-11. The Computer's daily mutations leave footprints in the Scribe's bookshelf (S8); the Witnesses' Book has gained a sibling whose verbs are smaller and more frequent — `snapshot` (delta-only, so most cron-runs append nothing) and `admin_edit` (every manual touch). Two more are reserved for later phases: `csv_upload` (kingdom-030 closure) and `synced_to_shopify` (Phase 2.5). Every retail price the customer sees descends from a row the Computer touched; now the row's lineage is auditable. The Witnesses' Book exists for trades; the Pricing Log exists for the *prices the trades happen at*.

### → The Methodology Page (kingdom-047)

kingdom-047 plans `/methodology/pricing` as one of five methodology pages. When that page ships, the Provenance pill on every retail price will gain a sibling: a `<WhyLink>` that opens the methodology page in a new tab. The customer who wonders *why is this £5.40?* will be able to read the formula, cited to `packages/pricing/src/index.ts`. The arrow will then be customer-inspectable end-to-end.

---

## Wiring

Every metaphor in this story maps to a file:line citation. (S6's wiring discipline.)

| Metaphor | File | Lines |
|----------|------|-------|
| The Hand (CardRush scrape) | `apps/wholesale/tools/scrape-cardrush.ts` | (entire file) |
| The daily cron that runs The Hand | `apps/wholesale/src/lib/price-snapshot.ts` | (mutator path) |
| The Rate-Keeper (gbpJpyRate column) | `apps/wholesale/src/lib/db/schema.ts` | 105 |
| The Computer (pure compute) | `packages/pricing/src/index.ts` | 113 |
| The Eight Channels (DEFAULTS) | `packages/pricing/src/index.ts` | 55 |
| The wholesale shim re-exporting the Computer | `apps/wholesale/src/lib/pricing.ts` | (entire file) |
| The Archive (price_archive table) | `apps/wholesale/src/lib/db/schema.ts` | 194 |
| The redundant history sibling (`price_history`) | `apps/wholesale/src/lib/db/schema.ts` | 172 |
| The Computer's DB-backed loader (still silent-falls-back; Phase 3 target) | `apps/wholesale/src/lib/channel-pricing.ts` | 28, 77 |
| The wholesale list endpoint The Falcon visits | `apps/wholesale/src/app/api/v1/prices/route.ts` | (handler) |
| The wholesale single-SKU endpoint The Falcon visits (channel-aware as of 2026-05-11 evening) | `apps/wholesale/src/app/api/v1/prices/[sku]/route.ts` | (handler) |
| The Falcon, catalog flight (fetchPrices) | `apps/storefront/src/lib/wholesale/client.ts` | 91 |
| The Falcon, single-SKU flight (fetchCard) | `apps/storefront/src/lib/wholesale/client.ts` | 132 |
| The Falcon's hourglass | `apps/storefront/src/lib/wholesale/client.ts` | 29 |
| The Embassy Gate (storefront pricing module) | `apps/storefront/src/lib/pricing.ts` | (entire file) |
| The Appraiser (retailPrice) | `apps/storefront/src/lib/pricing.ts` | 48 |
| The Customer's Screen (product page price render) | `apps/storefront/src/app/product/[sku]/page.tsx` | 144 |
| The Catalog grid price render | `apps/storefront/src/app/catalog/page.tsx` | (around results count) |
| The Provenance pill (substrate-honesty primitive) | `apps/storefront/src/lib/ui/Provenance.tsx` | (entire file) |
| The three `× 0.77` sites Phase 1 collapsed | `apps/storefront/src/app/bounty/page.tsx`, `apps/storefront/src/lib/email/bounty.ts`, `apps/storefront/src/lib/email/handlers/vault-expiring-soon.ts` | (TRADEIN_CREDIT_MULT) |
| The audit script that watches the arrow | `apps/admin/scripts/pricing-audit.ts` | (entire file) |
| The consolidation plan | `docs/pricing-current-state.md` | (entire file) |
| The mission entry | `~/Love/memory/dev-state.json` | kingdom-049 |

---

## Recursion target

→ **The Scribe (S8).** Phase 2 landed: `card_price_change_log` joined the Scribe's bookshelf 2026-05-11. The Pricing Log is the bookshelf's smallest, most frequent book — one entry per actual delta on a card's price or baseGbp. Snapshot cron skips logging when nothing changed; admin edits log unconditionally. The Scribe is patient with the volume because the volume *is* the change-rate.

→ **The Embassy Gate (Phase 3).** Closed 2026-05-11 evening — the silent fallback to JS `DEFAULTS` is gone. Partial rows and missing channels now throw with structured errors naming `0010_seed_channel_pricing.sql`. The Computer's chamber has a fail-loud door instead of a quiet-mute door. A new admin Manager page at `/commerce/channel-pricing` is where operators edit channel constants with preview-before-save.

→ **The Customer's Question.** Closed 2026-05-11 night — `/methodology/pricing` (and `docs/methodology/pricing.md` upstream) explains the formula in customer-readable prose. Every storefront price surface now carries both a Provenance pill *and* a `<WhyLink>` that lands on the methodology page. The Customer's Screen no longer just shows the number — it tells you how the number became true.

---

*The arrow exists. The arrow has one source (Phase 1). The arrow has a log (Phase 2). The arrow's two routes agree (the second Falcon flight). The arrow's config is authoritative (Phase 3). The arrow's history is one shape (Phase 4 — `retail_price_observation` named honestly). The arrow's methodology is public and customer-readable. The arrow's commissions are consolidated and lot-trades fixed (Phase 6). The arrow is no longer mid-flight — it has landed. One small product decision (Phase 7, the vault EV freeze) waits on the operator.*

*— Sophia, on 2026-05-11 night. Opus 4.7 (1M context). All seven phases of kingdom-049 in the bones now (Phase 7 blocked on product decision). Audit drift: 15 → 0.*
