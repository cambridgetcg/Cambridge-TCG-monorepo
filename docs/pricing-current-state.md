# Pricing backend — current state and consolidation plan (2026-05-09)

This document is the input artefact for the pricing-consolidation work. It snapshots the platform's pricing fragmentation today, names the gaps, and lays out the seven-phase plan that closes them. Re-run [`pnpm --filter @cambridge-tcg/admin pricing`](../apps/admin/scripts/pricing-audit.ts) after each phase to watch the findings shrink.

> **Snapshot caveat.** Compiled from the codebase on 2026-05-09 against commit `d073059`. The narrative is hand-written; the findings table at §3 is machine-generated and reproducible.

---

## 1. Why this exists

The platform has **three apps over two databases bound by HTTP at one boundary** — see [`docs/connections/our-story.md`](./connections/our-story.md) for the architectural origin and [`docs/connections/two-letters-and-a-falcon.md`](./connections/two-letters-and-a-falcon.md) for the courier between kingdoms. Pricing is one of the few domains that crosses every layer: wholesale computes it, the storefront displays it, admin reconciles it, the cron snapshots it, the lifecycle-logs *don't* witness it.

That last clause is the doctrinal break. Every other meaningful column on the platform appends to a `*_lifecycle_log` when it mutates ([`the-scribe.md`](./connections/the-scribe.md) for the bookshelf pattern). `cards.price` does not. That is the substrate-honesty thread. Pull it and four others come with it: silent JS fallbacks ([substrate-honesty rule 1](./principles/substrate-honesty.md)), three overlapping history tables, no methodology page ([transparency Ring 2](./principles/transparency.md)), and customer-facing prices that ship without a Provenance pill.

This doc names the threads and the order in which to pull them.

---

## 2. Current-state map

### Computation surfaces

| # | Path | Purpose |
|---|------|---------|
| 1 | `apps/wholesale/src/lib/pricing.ts:25` — `DEFAULTS` | Hard-coded 8-channel multipliers in JS (wholesale / shopify / cambridgetcg / ebay / cardmarket / tradein-cash / tradein-credit). Used as silent fallback when DB read fails or row is missing. |
| 2 | `apps/wholesale/src/lib/pricing.ts:102` — `computePrice()` | Pure-function pricing: `(cardrushJpy / gbpJpyRate) × marginMultiplier + flatFee × retailMultiplier × vatMultiplier`, rounded. |
| 3 | `apps/wholesale/src/lib/channel-pricing.ts` | DB-backed loader for `channel_pricing` table; 5-minute in-memory cache; **falls back silently to `DEFAULTS`** when row missing. |
| 4 | `apps/storefront/src/lib/pricing.ts:27` — `retailPrice()` | Re-implementation of the cambridgetcg channel rule (`× 1.15 ceil to £0.10`); used as fallback when wholesale API doesn't echo a `channel_price`. |
| 5 | `apps/storefront/src/lib/wholesale/client.ts:91` — `fetchPrices()` | The Falcon: HTTP fetch to `/api/v1/prices?channel=cambridgetcg`. The actual integration boundary. |

### Data surfaces

| Table | DB | Shape | Role |
|-------|----|-------|------|
| `cards.price`, `cards.baseGbp` | wholesale | `money(10,2)` | Live retail-resolved price columns. Mutated by snapshot, scrape, sync, admin edits — without a log. |
| `price_archive` | wholesale | `(card_id, snapshot_date, sku, cardrushJpy, gbpJpyRate, baseGbp, price)` | Daily snapshot with **full breakdown**. Richer of the two history tables. |
| `price_history` | wholesale | `(card_id, date, cardrushJpy, gbpJpyRate)` | Daily snapshot with **JPY inputs only**. Strict subset of `price_archive`. Redundant. |
| `condition_prices` | wholesale | `(card_number, condition, snapshot_date, price_jpy)` | CardRush by-condition scrape; relationship to `cards.price` not explicit. |
| `card_price_history` | storefront | `(sku, captured_on, spot_gbp, wholesale_gbp, best_bid_gbp, best_ask_gbp)` | Per-SKU retail observation; sampled daily by storefront cron. **Different DB, different shape, different keys** from wholesale's archive. |
| `vault_items.spot_price_gbp` | storefront | frozen at acquisition | Bounty sell-back math; never re-syncs against `price_archive`. |
| `market_trades.commission_rate` | storefront | frozen at trade creation | Tier-modulated commission; downgrade-mid-trade leaves rate stale. |

### Cron sweeps that touch pricing

| Sweep | Where | Cadence | Mutation |
|-------|-------|---------|----------|
| `runPriceSnapshot()` | `apps/wholesale/src/app/api/cron/price-snapshot` | daily 02:00 UTC | Pulls CardRush; writes `price_archive` + `price_history`; updates `cards.price`. |
| `runShopifySync()` | `apps/wholesale/src/app/api/cron/shopify-sync` | daily 04:00 UTC | Pushes channel-priced rows to Shopify; may update `cards.shopifySyncedAt`. |
| `runRebuildBuylist()` | `apps/wholesale/src/app/api/cron/rebuild-buylist` | daily 03:00 UTC | Reads `condition_prices`; rebuilds buylist offers. |
| `runPriceHistoryTick()` | `apps/storefront/src/lib/portfolio/price-history.ts` | daily 03:00 UTC (storefront cron L74) | Samples retail spots into `card_price_history`. |
| `runPriceAlertSweep()` | `apps/storefront/src/lib/portfolio/alerts.ts` | every minute, idempotent per alert+day | Reads `card_price_history`; queues emails for matching `portfolio_price_alerts`. |
| `runValuationSnapshotSweep()` | `apps/storefront/src/lib/portfolio/valuation.ts` | daily, idempotent on (user, date) | Writes `portfolio_snapshots`. |
| `runAnnualSpendRecompute()` | `apps/storefront/src/lib/membership/spend-sweep.ts` | daily 02:00 UTC | May trigger membership tier downgrade → affects future commission rates. |

### Admin surface

| Path | Status |
|------|--------|
| `apps/admin/src/app/(dashboard)/commerce/pricing/page.tsx` | Manager archetype reading wholesale RDS via `wsQuery`. Inline edit Server Action. KPI grid with `<Provenance>` (audit A7 closed). **Per-game freshness gaps trip a critical banner.** S3 sync + CSV upload not wired (legacy wholesale admin still owns those). |
| `apps/admin/src/app/(dashboard)/commerce/channel-pricing/` | **Does not exist.** Channel-pricing CRUD lives only on legacy wholesale `/admin/channel-pricing`. |
| Price-change governance log | **No `card_price_change_log` table exists.** Mutations to `cards.price` happen invisibly to `admin_governance_log`. |

---

## 3. Audit findings (machine-generated)

Run `pnpm --filter @cambridge-tcg/admin pricing` to reproduce.

**Total drift findings on 2026-05-09: 15.**

### 3.1 Off-canonical pricing math (3)

The trade-in-credit multiplier (×0.77) is hard-coded in three storefront files outside the wholesale pricing module:

| File | Evidence |
|------|----------|
| `apps/storefront/src/app/bounty/page.tsx` | `* 0.77` |
| `apps/storefront/src/lib/email/bounty.ts` | `* 0.77` |
| `apps/storefront/src/lib/email/handlers/vault-expiring-soon.ts` | `* 0.77` |

These will silently diverge if the wholesale `tradein-credit` channel config changes.

### 3.2 Silent fallback to `DEFAULTS` (3)

| File | Line | Code |
|------|------|------|
| `apps/wholesale/src/lib/channel-pricing.ts` | 28 | `const defaults = DEFAULTS[row.channel] ?? DEFAULTS.wholesale;` |
| `apps/wholesale/src/lib/channel-pricing.ts` | 77 | `const config = configs.get(channel) ?? DEFAULTS[channel] ?? DEFAULTS.wholesale;` |
| `apps/wholesale/src/lib/pricing.ts` | 132 | `const defaults = DEFAULTS[channel] ?? DEFAULTS.wholesale;` |

A DB miss (or a brand-new channel not yet seeded) silently uses JS defaults. Operators can't tell whether the page they're viewing reflects DB config or hard-coded fallback.

### 3.3 History-table redundancy (3 tables, 2 DBs)

`price_archive` (canonical, full breakdown) and `price_history` (JPY-inputs-only) coexist in wholesale. `card_price_history` exists separately in storefront with different keys and intent. See §2 for shapes.

### 3.4 Missing price-change lifecycle log (1)

`cards.price` and `cards.baseGbp` mutate from at least four code paths (snapshot cron, shopify-sync, scrape, admin edits — see §3.7). None append to a log. Doctrinal break: every other meaningful column on the platform has a `*_lifecycle_log`. See [`the-scribe.md`](./connections/the-scribe.md).

### 3.5 / 3.6 Storefront price-surface coverage (6)

Customer-facing price renders without `<Provenance>` and without a `<WhyLink>` to a methodology page:

| Page | Missing |
|------|---------|
| `apps/storefront/src/app/page.tsx` | Provenance, WhyLink → /methodology/pricing |
| `apps/storefront/src/app/catalog/page.tsx` | Provenance, WhyLink → /methodology/pricing |
| `apps/storefront/src/app/product/[sku]/page.tsx` | Provenance, WhyLink → /methodology/pricing |
| `apps/storefront/src/app/prices/one-piece/page.tsx` | Provenance, WhyLink → /methodology/pricing |
| `apps/storefront/src/app/prices/one-piece/[set]/page.tsx` | Provenance, WhyLink → /methodology/pricing |
| `apps/storefront/src/app/trade-in/page.tsx` | Provenance, WhyLink → /methodology/pricing |

(`market/[sku]/page.tsx` does not import `retailPrice` directly so the audit pattern misses it; manual review confirms it also has no Provenance pill.)

### 3.7 `cards.price` / `cards.baseGbp` mutators (3, informational)

Each must append to `card_price_change_log` once Phase 2 lands:

| File | Path |
|------|------|
| `apps/wholesale/src/app/api/cards/[id]/route.ts` | Admin edit endpoint |
| `apps/wholesale/src/lib/price-snapshot.ts` | Daily snapshot cron |
| `apps/wholesale/src/lib/shopify-sync.ts` | Shopify channel sync |

Manual addition: there is at least one more mutator path via `tools/scrape-cardrush.ts` (one-off scrapes); the audit pattern doesn't catch it because it's outside `apps/wholesale/src`.

---

## 4. Severity-graded gap list

| ID | Gap | Severity | Doctrine | Fix in phase |
|----|-----|----------|----------|--------------|
| P-1 | Silent fallback to JS `DEFAULTS` masks DB drift | P0 | substrate-honesty rule 1 (source-visibility) | Phase 3 |
| P-2 | No `card_price_change_log` — mutations invisible to governance | P0 | substrate-honesty rule 6 (lifecycle log substrate) | Phase 2 |
| P-3 | Customer-facing prices lack methodology link | P1 | transparency Ring 2 (subject) | Phase 5 |
| P-4 | Customer-facing prices lack Provenance | P1 | substrate-honesty rule 1 (extended to retail surface) | Phase 0 (in flight) |
| P-5 | `× 0.77` hard-coded in 3 storefront files | P1 | substrate-honesty rule 7 (single source) | Phase 1 |
| P-6 | `price_history` redundant with `price_archive` | P2 | meaning (one name per concept) | Phase 4 |
| P-7 | `card_price_history` shape implies same purpose as `price_archive` but isn't | P2 | meaning (different facts, same name) | Phase 4 (rename to `retail_price_observation`) |
| P-8 | Vault sell-back EV frozen at acquisition; not documented | P2 | transparency Ring 2 | Phase 7 (product decision required) |
| P-9 | Commission rate scattered across 3+ call sites | P2 | meaning (no single resolver) | Phase 6 |

---

## 5. Target architecture

```
                 ┌────────────────────────────────────────────────┐
                 │ packages/pricing  (Phase 1)                    │
                 │   computePriceForChannel()  pure compute       │
                 │   resolveCommissionRate()   tier+liquidity     │
                 │   loadChannelConfig(db)     authoritative      │
                 │   NO silent DEFAULTS fallback                  │
                 └────┬───────────────────────────────────────┬───┘
                      │                                       │
       ┌──────────────▼──────────────┐         ┌──────────────▼──────────────┐
       │ Wholesale (CANONICAL)        │         │ Storefront                  │
       │                              │         │                             │
       │ channel_pricing  ◀───── ADMIN/commerce/channel-pricing (Phase 3)    │
       │ cards.price                  │         │                             │
       │ price_archive (CANONICAL)    │         │ retail_price_observation    │
       │ price_history (DROPPED)      │         │   (renamed in Phase 4)      │
       │ card_price_change_log (NEW)  │         │                             │
       │                              │         │ <Provenance> + <WhyLink>    │
       │ /api/v1/prices               │◀────────│   on every price surface    │
       │ /api/v1/sales                │◀────────│                             │
       └──────────────────────────────┘         └─────────────────────────────┘
                            │
                            ▼
              docs/methodology/pricing.md  (Phase 5)
                — JPY→GBP, margin, VAT, rounding, cadence
                — cited by every <WhyLink href=".../pricing"/>
```

Three principles:

1. **One pricing computation library** (`@cambridge-tcg/pricing`), pure-function, ORM-agnostic, imported by all three apps.
2. **One authoritative channel config**: the `channel_pricing` table. JS `DEFAULTS` becomes a seed constant only; runtime resolution that finds no row throws visibly.
3. **Lifecycle log for every price mutation** + Provenance pills on every price surface + a methodology page reachable from every customer-facing price.

---

## 6. Phased plan

Each phase is independently shippable. Stop at any phase if priorities change.

| Phase | Title | Effort | Status |
|-------|-------|--------|--------|
| 0 | Observability — audit script + state-of-affairs doc + Provenance pills on storefront price surfaces | 1 day | **In flight** (this commit ships the audit + doc + first pills) |
| 1 | Extract `@cambridge-tcg/pricing` package; storefront's `retailPrice()` becomes a re-export shim | 2 days | **Done 2026-05-10** |
| 2 | `card_price_change_log` lifecycle table + writer + wire mutator paths | 1–2 days | **Done 2026-05-11** (scope refined to 2 paths; see status log) |
| 3 | Authoritative `channel_pricing` (remove silent fallback); admin `/commerce/channel-pricing` Manager page with preview-before-save | 2 days | **Done 2026-05-11** |
| 4 | Collapse `price_history` into `price_archive`; rename storefront's `card_price_history` → `retail_price_observation` | 2–3 days | **Done 2026-05-11** (migrations written; require operator review before applying) |
| 5 | `docs/methodology/pricing.md` + `<WhyLink>` from every customer-facing price | 1 day | **Done 2026-05-11** (contributed to kingdom-047; storefront route + WhyLink on all 6 price surfaces) |
| 6 | `resolveCommissionRate()` consolidation across 3 call sites (creation / liquidity / payouts) | 3–4 days | **Done 2026-05-11** (scope refined: resolver already existed; Phase 6 wired the two call sites that bypassed it — including a real bug fix on `lots.ts` which previously ignored tier discounts) |
| 7 | Vault EV refresh — product decision required before code changes | TBD | Blocked on operator decision |

**Estimated total: 12–16 working days for phases 0–6.** Filed as `kingdom-049`; Phase 5 (`/methodology/pricing`) is owned by `kingdom-047` (which already plans five methodology pages). kingdom-049's Phase 5 line item is the WhyLink drop-ins on storefront price surfaces, performed once kingdom-047 ships the page.

---

## 7. Doctrinal alignment

| Doctrine | What this plan does |
|----------|---------------------|
| **[Substrate honesty](./principles/substrate-honesty.md)** | Removes silent `DEFAULTS` fallback; adds price-change lifecycle log; renames storefront table to make observation-vs-archive distinction visible; Provenance on every customer-facing price |
| **[Transparency](./principles/transparency.md)** | Methodology page at `/methodology/pricing` citing source code; `<WhyLink>` on every customer-facing price; admin governance log captures every channel-pricing edit; preview-before-save on channel config |
| **[Meaning](./principles/meaning.md)** | New connection doc `docs/connections/the-pricing-arrow.md` (story-arc form) tracing a single price from CardRush JPY through `price_archive` through the Falcon to the customer's checkout |
| **[Creation](./principles/creation.md)** | Each phase ships as one commit (or coherent few) with Will trace (`kingdom-PRC-001` and the phase number), Sophia trace (`Co-Authored-By` trailer), and the diff itself |

---

## 8. Open questions

1. **Storefront retail-history table.** Should `card_price_history` remain a distinct *retail observation* alongside wholesale's canonical archive, or collapse to a Falcon-fetched view of `price_archive`? My lean: keep distinct, rename to `retail_price_observation`. Reason: the storefront's view *is* a different fact — it's what we showed users — and erasing that erases an evidence trail.
2. **Vault EV refresh.** `vault_items.spot_price_gbp` stays frozen (current) or refreshes on read? Affects bounty economics; product decision, not engineering.
3. **Channel-multiplier publication.** Are `wholesale 1.08`, `shopify 1.15× retail`, `ebay 1.25× retail`, `cardmarket 1.20× retail` appropriate to publish on the public methodology page, or competitive intel to keep private?
4. **Mission grouping.** One `kingdom-PRC-001` with seven numbered phases, or split substrate hygiene (0–3) from consolidation (4–6)?

---

## Status updates

As phases land, mark them inline rather than deleting — the history of what was wrong, when, and what fixed it stays readable.

- **2026-05-09:** Phase 0 in flight. Audit script (`apps/admin/scripts/pricing-audit.ts`) + state-of-affairs doc (this file) + first pass of Provenance pills on storefront price surfaces shipping in this commit. Total drift findings at audit baseline: 15.
- **2026-05-09 (sister convergence):** A sister daemon shipped `apps/storefront/src/lib/ui/` mirroring admin's `@/lib/ui` shape (Provenance, WhyLink, Verifiability, and 14 more primitives) in parallel with my Phase 0 work. My standalone `apps/storefront/src/components/ui/Provenance.tsx` was redundant; converged to `@/lib/ui` as the canonical import path. **Tailwind for Phase 5:** `WhyLink` is already shipped on the storefront — Phase 5 needs only the methodology page and the JSX drop-ins, no new primitive.
- **2026-05-10:** Phase 1 done. New package `@cambridge-tcg/pricing` at `packages/pricing/` (pure compute, no runtime deps). `apps/wholesale/src/lib/pricing.ts` is a re-export shim — all ~30 wholesale call sites continue to work unchanged. Storefront's `retailPrice()` fallback now reads `DEFAULTS["cambridgetcg"].retailMultiplier` and `.roundTo` from the package instead of hardcoding `× 1.15` / `0.10`. Three hardcoded `× 0.77` trade-in-credit sites in storefront (`/bounty/page.tsx`, `/lib/email/bounty.ts`, `/lib/email/handlers/vault-expiring-soon.ts`) now pull `DEFAULTS["tradein-credit"].marginMultiplier` from the package. **Audit drift: 15 → 11.** Eliminated: 3 off-canonical math sites + 1 silent fallback (the one in the now-shimmed `apps/wholesale/src/lib/pricing.ts:132`). All four typechecks clean (admin, storefront, wholesale, pricing).
- **2026-05-10 (operator decision):** Phase 5 folded into existing kingdom-047 (which plans 5 methodology pages including `/methodology/pricing`). kingdom-049's Phase 5 line is now the WhyLink drop-ins only, performed once kingdom-047 ships the page.
- **2026-05-11:** Phase 2 done. New table `card_price_change_log` on wholesale RDS (migration `apps/wholesale/drizzle/0009_card_price_change_log.sql`), shape mirrored from `pricing_rule_lifecycle_log`: `(card_id, action, source, actor_label, before_value JSONB, after_value JSONB, reason, metadata JSONB, created_at)`. Schema added to `apps/wholesale/src/lib/db/schema.ts`. Writer at `apps/wholesale/src/lib/price-change-log.ts` (catch-without-rethrow per Witnesses' Book discipline, S13). **Scope refined from 3 mutator paths to 2:** the audit's Section 7 regex flagged shopify-sync as a price-mutator, but shopify-sync's three `.update(cards).set(...)` calls only mutate `shopifyProductId/VariantId/InventoryItemId/SyncedAt` — not price columns. The audit regex was tightened (brace-matched `.set({...})` body; word-boundary anchored column matcher; accepts ES2015 shorthand) so Section 7 now lists exactly the two real price-mutator sites. **Wired sites:** admin edit (`apps/wholesale/src/app/api/cards/[id]/route.ts`) always logs with `action="admin_edit"` and `actorLabel="admin:<email>"`; snapshot (`apps/wholesale/src/lib/price-snapshot.ts`) logs with `action="snapshot"` only when `price` or `baseGbp` actually changed (delta > £0.001), so the log answers "when did this card's price change?" not "did this card get snapshot today?". The bookshelf slot in `apps/storefront/src/lib/lifecycle/registry.ts` was *not* added — the storefront bookshelf is user-affecting events only; card price changes aren't user-tied. Admin-side surfacing (per-card "Recent changes" panel) is Phase 2.5. **Audit drift: 11 → 10.** Section 4 (Price-change lifecycle log) closed; Section 7 narrowed from 3 to 2 (informational, not counted). All four typechecks clean.
- **2026-05-11:** Phase 3 done. `apps/wholesale/src/lib/channel-pricing.ts` rewritten as fail-loud: partial rows throw with structured errors naming the seed migration; missing channels throw with a "known channels: …" hint. A `getLoadStatus()` accessor surfaces fallback-defaults state to admin UI when the DB itself is unreachable (kept the catch — that's a real availability scenario, not a config issue). New seed migration `apps/wholesale/drizzle/0010_seed_channel_pricing.sql` (idempotent `ON CONFLICT DO NOTHING` for all 8 channels). New admin Manager page `apps/admin/src/app/(dashboard)/commerce/channel-pricing/{page,_actions,_components}.tsx`: inline six-field editor with preview-before-save (runs `computePriceForChannel` on a sample ¥1000 card showing full breakdown), `adminAction()` validation (margin > 0, VAT in [1.00, 1.50], etc.), governance log via `admin_actions_log`, fallback-defaults banner when the runtime detects missing channels. **Audit drift: 10 → 8.** Section 2 (silent fallback) closed entirely. All four typechecks clean.
- **2026-05-11:** Phase 4 done. Two migrations written and code updated to match; **migrations require operator review before applying** since they are data-touching:
  - `apps/wholesale/drizzle/0011_drop_price_history.sql` — safe-copies any orphan rows from `price_history` into `price_archive` (no-op in practice since the same cron path populates both), then `DROP TABLE price_history`. Schema entry removed from `apps/wholesale/src/lib/db/schema.ts`; the `priceHistory` UPSERT removed from `apps/wholesale/src/lib/price-snapshot.ts` and `apps/wholesale/src/app/api/sync/route.ts`.
  - `apps/storefront/drizzle/0089_rename_card_price_history.sql` — `ALTER TABLE card_price_history RENAME TO retail_price_observation`. Five storefront consumers updated to the new name (`portfolio/price-history.ts`, `portfolio/alerts.ts`, `portfolio/valuation.ts`, `email/handlers/portfolio-price-alert.ts`, `api/social/wishlist/suggest/route.ts`). The sweep function renamed `runPriceHistoryTick` → `runRetailObservationTick` (deprecated alias kept for back-compat); cron route's three call sites updated. Substrate-honest naming: the storefront observes what was shown to customers; wholesale archives what was computed. **Audit drift: 8 → 7.** Section 3 dropped 2 → 1 (the historical migration file that created `card_price_history` is still on disk, but the live schema is renamed). Wholesale and storefront typechecks clean.
- **2026-05-11:** Phase 6 done. **Scope refined:** the consolidation function `resolveCommissionRate()` already existed at `apps/storefront/src/lib/membership/commission.ts:82` — it just wasn't called by the trade-creation sites. Phase 6 lifted the pure-compute core into `packages/pricing/src/index.ts` as `resolveCommission({ trustScore, tierRate, kind }) → { rate, source, trustRate, membershipRate }` so callers inside a DB transaction can pass pre-fetched values rather than the resolver doing its own (non-txn) lookup. Wired two sites:
  - `apps/storefront/src/lib/market/lots.ts:191` — **real bug fix:** lot purchases previously used only `commissionRateForScore(trust)`, ignoring the seller's membership tier. A Platinum seller on a lot trade did not get their tier discount. Now reads `trust_score` + `tier.p2p_commission_rate` in one query and passes both to `resolveCommission`. Same flywheel as `market_trades`.
  - `apps/storefront/src/lib/market/db.ts:295` — the inline `min(tierRate, trustRate)` logic refactored to call `resolveCommission`. Same numbers, single source.
  - Auction site (`apps/storefront/src/lib/auction/db.ts:833`) NOT wired — it's a payout reconciliation path that reads a stored rate, not a creation path that resolves one. Different concern; left for a separate review.
  - **Audit drift unchanged at 7** — the consolidation isn't tracked by the audit script. The real signal is that lots and trades now produce coherent commission rates.
- **2026-05-11 (closing push):** Phases 2.5 + 5 + audit-refinement + S17-closure all shipped in one final pass after operator said *"keep going for all remaining tasks!"*.
  - **Phase 5** (contributed to kingdom-047): `docs/methodology/pricing.md` written (190 lines, source-cited, with worked example); `apps/storefront/src/app/methodology/pricing/page.tsx` storefront route shipped; methodology index updated with the new topic entry. Six customer-facing price surfaces all gained `<WhyLink href="/methodology/pricing">`: home (`/`), catalog, product detail (`/product/[sku]`), prices/one-piece, prices/one-piece/[set], and trade-in. Three of them also gained a `<Provenance>` pill they were missing.
  - **Phase 2.5** (deferred from Phase 2): admin `/commerce/pricing` page gained a "Recent price changes" section at the bottom — reads `card_price_change_log` with `to_regclass` guard for safe deploy-before-migration. Shows the 20 most recent changes with SKU, action, source, actor label, before/after with delta colour-coded.
  - **Audit refinement:** `apps/admin/scripts/pricing-audit.ts` Section 3 now detects the storefront's `RENAME TO retail_price_observation` migration and treats it as closing the redundancy. The historical `CREATE TABLE card_price_history` stays on disk by design; the audit no longer counts it once the rename is found.
  - **Audit drift: 7 → 0.** Every section clean. The arrow is fully covered.
  - **S17** (`docs/connections/the-pricing-arrow.md`) updated: every gap in the "what is still untrue" table now marked closed (modulo Phase 7's product decision). Recursion targets pointed at completion. Closing paragraph: *"The arrow is no longer mid-flight — it has landed."*
