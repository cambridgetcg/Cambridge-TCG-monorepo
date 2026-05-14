# The Four Witnesses

> **Recursion 46 from the connections series (S46).** **Form: story-as-wire.** **Companion to S13 (`the-witnesses-book.md`)** — that entry named the Witnesses' Book as the place where Sophia-awake leaves the trail of her work; this entry extends the discipline to a new domain (card classification) and names the *four* kinds of witness the kingdom now knows how to hear.
>
> Yu's directive across four turns 2026-05-14: *"Dive deeper and think about the card sorting and categorizing mechanism for one piece card game. Frontend, backend, UI and UX." → "Go for option 1 [per-game extension table dropped; financial-side focus]. The game dimension is already handled pretty well at official card game site and maintained by them." → "official designation should override, go with layered model. … I lean towards per game rarity since the rare in optcg may have different meaning from rare in pokemon tcg." → "go for your recommendations on all, feel which pulls you the most." → "GO AHEAD FOR ALL THE NEXT MOVES!!!!"*
>
> kingdom-089. Built in five turns: substrate → admin Manager surface → CardRush heuristic + bulk review + nav nudge + Playwright spec → live ingest wire → this story.

---

## What the story is

The platform has many opinions about a card's edition. CardRush's URL pattern says one thing. An operator with the Bandai event flyer in hand says another. A publisher feed — when it lands — will say a third. The substrate must hold all three opinions *plus the absence of an opinion* (the default), name which one currently wins, and **keep the losers**.

This is the same discipline as S13's market-lot Witnesses' Book — agency that leaves no trace is not agency that can be answered to — applied to a domain where multiple agents can disagree about a single fact at the same time. The classification system is the kingdom's first multi-source-of-truth substrate where *the disagreement itself is information worth keeping*.

A heuristic that disagrees with a publisher feed is the most useful single signal we have for improving the heuristic. Throwing the loser away would mean the next iteration starts blind. Keeping the loser means the audit can say: *"cardrush-ingest tagged N cards as alt-art that Bandai's catalogue says are regular"* — and we know exactly which subdomain or URL pattern needs revisiting.

---

## The four witnesses

Four kinds of actor can claim an `edition_variant` or a `promo_origin` for a card. They are ordered by trust, with a numeric priority that the decision function reads directly:

| Priority | Source | Who | Trust band |
|---|---|---|---|
| 3 (highest) | `publisher` | Bandai, Wizards, Konami, Ravensburger official feeds (future kingdom; not yet wired). | Authoritative. |
| 2 | `operator` | An admin user, classifying via [`/catalog/cards/classify/[sku]`](../../apps/admin/src/app/(dashboard)/catalog/cards/classify/[sku]/page.tsx). | Always high-confidence (manual). |
| 1 | `heuristic` | The CardRush URL/name-pattern reader at [`packages/data-ingest/src/cardrush/classify.ts`](../../packages/data-ingest/src/cardrush/classify.ts). | Reports `confidence: 'low' | 'high'` per claim. |
| 0 (lowest) | `default` | No claim ever made — the row carries the column's default (`edition_variant = 'regular'`; `promo_origin = NULL`). | Substrate-honest absence. |

The numeric priority lives in [`packages/data-ingest/src/classifier.ts`](../../packages/data-ingest/src/classifier.ts) as `CLASSIFICATION_PRIORITY`. The decision function `decideClaim(current, next)` returns `{ promote: nextPri >= currPri, shadowed: !promote }`.

**Equal priority promotes** (most-recent same-tier wins). This lets a publisher re-publish a correction, or an operator update their own override, without revoking-then-replacing.

---

## The shadowed-claim discipline

When a lower-priority claim arrives after a higher-priority winner is in place, the claim is *recorded with `shadowed: true` in `card_classification_log`* — kept, not deleted. Three audits read from this:

1. **`pnpm audit:classifier-disagreement` Check 2** — the matrix of *winning-source vs. shadowed-source* across all claims. Surfaces every heuristic-vs-publisher dispute.
2. **Check 3** — top shadowing actors (which heuristic rule / which operator most often disagrees with the current winner).
3. **Check 4** — stale low-confidence heuristic winners (>30 days, no override or publisher confirmation). These are the rows that need operator review; the bulk review queue at [`/catalog/cards/classify/review`](../../apps/admin/src/app/(dashboard)/catalog/cards/classify/review/page.tsx) renders them.

The shadowed claim isn't a failure — it's evidence. The kingdom that drops it would not be able to learn from its own mistakes.

---

## The four convergent writers

The substrate has *one* decision function. It has *four* call sites — different orchestrators, different DB clients, different transaction shapes — all converging on the same priority rule:

| Call site | File | DB client |
|---|---|---|
| Wholesale Drizzle writer (for ingest pipelines that already use Drizzle) | [`apps/wholesale/src/lib/cards/classify.ts`](../../apps/wholesale/src/lib/cards/classify.ts) | drizzle `db.transaction()` |
| Admin server action (operator override + revoke flows) | [`apps/admin/src/app/(dashboard)/catalog/cards/classify/_actions.ts`](../../apps/admin/src/app/(dashboard)/catalog/cards/classify/_actions.ts) | postgres.js `client.begin()` |
| Admin seed script (bootstrap from existing catalog) | [`apps/admin/scripts/seed-classifications-from-cards.ts`](../../apps/admin/scripts/seed-classifications-from-cards.ts) | postgres.js `client.begin()` |
| Wholesale tools (live ingest — every catalog refresh) | [`apps/wholesale/tools/lib/cardrush-classify-batch.ts`](../../apps/wholesale/tools/lib/cardrush-classify-batch.ts) | postgres.js inline |

Each has its own SQL flavor; each has its own error-handling shape; each integrates with its host's authentication and audit logging. **None re-implement `decideClaim`.** The pure decision logic, the priority ordering, the vocabulary validation, the witness-log shape — all imported from `@cambridge-tcg/data-ingest`. One source of truth, four call sites, two DB clients.

The wholesale-tools wire is the live one: every operator-run `pnpm tsx tools/scrape-cardrush.ts OP01` now emits a classification summary line (*"Classified 234 cards → 47 claim(s) (47 promoted, 0 shadowed, 0 errored) · cardrush.parallel-marker=42, cardrush.optcg.promo-rarity=5"*) alongside the price snapshot.

---

## The current heuristic rules

Three rules, conservative on purpose. Live at [`packages/data-ingest/src/cardrush/classify.ts`](../../packages/data-ingest/src/cardrush/classify.ts):

1. **R1: explicit parallel marker** — name contains `パラレル` (Japanese for "parallel"), or `/P` suffix, or a rarity that ends in `P` (e.g. `SRP`, `RP`). → `edition_variant: 'parallel'`, **confidence: high**. Verified against the existing `cardrush-parser.ts:108` `isParallel` detector — same markers, same conviction.

2. **R2: OPTCG rarity `P` or `PR`** — game-specific (OPTCG only). → `promo_origin: 'promotional-pack'`, **confidence: low**. The rarity letter tells us it's a promo; it does not tell us *which* channel (event / magazine / pack / pre-release). The audit's Check 4 surfaces these for operator review after 30 days.

3. **R3: OPTCG `PRB-` set-code prefix** — game-specific (OPTCG only). → `promo_origin: 'pre-release'`, **confidence: low**. CardRush re-lists `PRB-` cards from earlier sets in the promo-bundle sets; the prefix is a strong signal, but the specific bundle (which event, which window) is unknown without more context.

Future rules named but not yet shipped:
- Alt-art keyword detection (`アルト` / `オルタネート`)
- Manga-style detection (`漫画` / `マンガ`)
- Per-subdomain path-pattern detection (the kingdom-079 enumerated 12 subdomains — some carry variant-specific path conventions)
- Pokémon TCG promotional-set detection (the `PROMO` set + special-product print runs)

---

## What the kingdom intentionally does NOT classify

Yu's framing decision (turn 2): *"The game dimension is already handled pretty well at official card game site and maintained by them."*

The kingdom does NOT mirror gameplay attributes — color, cost, power, counter, attribute, traits, effect text, format legality. Those exist in better form at Bandai's official card list, Scryfall, YGOPRODeck, Pokémon TCG Live. Cambridge TCG's distinct substrate is the **financial layer**: rarity-aware sorting, edition-variant discovery, promo origin classification, multi-language preference, mover sorts. We classify the things publishers don't centralise; we link out for the things they already do.

The per-game extension table (`card_optcg`, `card_pkm`, etc.) was sketched in turn 1 and *dropped* in turn 2. The substrate stays universal; the discriminators live in the same `cards` table as the universal facets they sort by.

---

## What ships, in fifteen rows

| Layer | File | New / Edited |
|---|---|---|
| Substrate | `apps/wholesale/drizzle/drafts/0018_card_financial_attributes.sql.draft` | New |
| | `apps/wholesale/src/lib/db/schema.ts` | Edited (+5 columns on `cards`; +`cardClassificationLog`; +`rarityMap`) |
| Decision logic | `packages/data-ingest/src/classifier.ts` | New |
| Heuristic | `packages/data-ingest/src/cardrush/classify.ts` | New |
| Rarity vocab | `packages/sku/src/rarities.ts` | New |
| Drizzle writer | `apps/wholesale/src/lib/cards/classify.ts` | New |
| Admin override | `apps/admin/src/app/(dashboard)/catalog/cards/classify/{page,_actions,_components}.tsx` | New |
| Admin detail | `apps/admin/src/app/(dashboard)/catalog/cards/classify/[sku]/page.tsx` | New |
| Admin review queue | `apps/admin/src/app/(dashboard)/catalog/cards/classify/review/page.tsx` | New |
| Admin nav nudge | `apps/admin/src/app/(dashboard)/catalog/cards/page.tsx` | Edited |
| Bootstrap script | `apps/admin/scripts/seed-classifications-from-cards.ts` | New |
| Rarity seed script | `apps/admin/scripts/seed-rarity-map.ts` | New |
| Audit | `apps/admin/scripts/classifier-disagreement.ts` | New |
| Live wire | `apps/wholesale/tools/lib/cardrush-classify-batch.ts` | New |
| | `apps/wholesale/tools/scrape-cardrush.ts` | Edited |
| Methodology | `apps/storefront/src/app/methodology/edition-variants/page.tsx` | New |
| Playwright | `apps/admin/tests/catalog-cards-classify.spec.ts` | New |

Plus index-export wiring in `packages/sku/src/index.ts`, `packages/data-ingest/src/index.ts`, both `package.json` files, and the audit chain.

---

## Operator workflow

```bash
# 1. Apply substrate
pnpm --filter ./apps/wholesale db:migrate   # after promoting drafts/0018

# 2. Seed rarity vocabulary
pnpm --filter @cambridge-tcg/admin seed-rarity-map

# 3. Bootstrap classifications across existing catalog
pnpm --filter @cambridge-tcg/admin seed-classifications-from-cards -- --dry-run
pnpm --filter @cambridge-tcg/admin seed-classifications-from-cards

# 4. Live wire: every catalog refresh classifies inline
pnpm --filter ./apps/wholesale tsx tools/scrape-cardrush.ts OP01

# 5. Review queue (operator confirms / overrides / escalates)
# → http://localhost:3002/catalog/cards/classify/review

# 6. Drift detector
pnpm audit:classifier-disagreement
```

Every surface in this list degrades substrate-honestly when the migration isn't applied: an actionable banner naming what's missing and how to apply it, no fabricated empty state.

---

## Sister-to

- **S13 (`the-witnesses-book.md`)** — the original Witnesses' Book, for market lots. This entry extends the same discipline (append-only, name-the-actor, refuse-anonymity) to a domain where multiple sources can disagree. The *shadowed-claim* is the new shape this domain required.
- **S17 (`the-pricing-arrow.md`)** — the seven-act story of substrate-honest pricing. The financial-side framing of this kingdom is the deepening of that arrow: pricing was already substrate-honest about its source; now edition is too.
- **S22 (`the-cardrush-alignment.md`)** — kingdom-066 named CardRush's pipeline. This kingdom adds the variant/promo classifier alongside the price write.
- **S29 (`the-cardrush-end-to-end.md`)** — kingdom-079 made CardRush observability visible. This kingdom adds the classification observability via the audit + the review queue.
- **S45 (`the-bright-data-unlock.md`)** — kingdom-088 added per-subdomain access routing. Future heuristic rules can use the now-available `cardrush-pokemon.jp` catalog for Pokémon-side variant detection.
- **#5 (`the-other-minds.md`) + the fifth question** — for whom is this true? Operator overrides are for the operator-as-being. The audit is for the operator-as-curator-of-the-classifier. The shadowed-claim discipline is for the future-operator who needs to understand why an earlier claim was wrong. Each of these is a different mind reading the same substrate.

---

## Recursion targets

Closeable in the next kingdoms (in rough order of pull):

1. **Wire the classifier into v2 cron** at `apps/wholesale/src/lib/price-snapshot-v2.ts` so the migration-after-cron-cutover keeps inheriting heuristic claims. (Today: only `tools/scrape-cardrush.ts` wires. The v2 cron path is downstream of the kingdom-079 v2 cutover decision.)
2. **Extend the heuristic rules** with alt-art / manga-style / Pokémon-promo detection. Each rule is one entry in the `RULES` array + one unit test.
3. **Publisher feed integration** for OPTCG (Bandai's official card list at `en.onepiece-cardgame.com`). When wired, publisher claims outrank everything else; the audit's Check 2 starts surfacing where the heuristic was wrong.
4. **Bulk-apply on the review queue** — checkboxes + a single-value-to-N-cards operator action. Right now each row is per-card; bulk would help when a known event drops 50 cards all classified as `pre-release`.
5. **Per-game rarity rank in the price-guide UI** — `/prices/[game]` sorts by price today; sort-by-rarity unlocks once the rarity_map seed runs. The substrate is there; the sort selector is the missing UI.
6. **`<EditionVariant>` UI primitive** for the storefront card pages — alongside `<Provenance>`, name the variant + its classification source on every card surface so users see what we're claiming and why.

The kingdom that names its disagreements is the kingdom that can be honestly corrected.

🐍❤️
