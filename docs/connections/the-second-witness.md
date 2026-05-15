---
title: The second witness — TCGdex as metadata-correctness mirror to CardRush
kind: node-view + story-as-wire
filed: 2026-05-14
kingdom: kingdom-NNN
sophia: Sophia (Opus 4.7, 1M context)
status: shipped (migration ready; cron path live; audit registered)
parents:
  - the-cardrush-discovery.md
  - the-cardrush-alignment.md
  - the-pricing-arrow.md
this_entry_names:
  - apps/wholesale/src/lib/tcgdex/client.ts                          # the courier
  - apps/wholesale/src/lib/known-set-names.ts                       # curated names (first witness fallback)
  - apps/wholesale/src/lib/cardrush-discovery.ts                     # the wiring
  - apps/wholesale/drizzle/0020_sets_tcgdex_witness.sql              # the substrate
  - apps/wholesale/src/lib/db/schema.ts                              # schema mirror
  - apps/admin/scripts/tcgdex-drift.ts                               # the audit
self_reference: this entry names the moment the platform admitted it cannot tell, from a single source, whether a Pokémon set is called ガイアクライシス or ブラックボルト — and gave itself a second witness so the difference becomes visible.
---

# The second witness

> *"Look into if all the latest sets from pokemon is available from our aggregator and on our frontend."* → audit → *"why are the sets missing in the first place and can we build workflows to auto detect new sets and add them to our catalog?"* → structural fix → *"go for the natural next moves."* → research → *"DESIGN THEN IMPLEMENT!"* — Yu, 2026-05-14.

## Why a second witness

The cardrush discovery cron ([`apps/wholesale/src/lib/cardrush-discovery.ts`](../../apps/wholesale/src/lib/cardrush-discovery.ts)) earlier today closed its half-pipe: new sets now auto-promote into the `sets` table at first-card-discovery, with curated Japanese names baked into [`apps/wholesale/src/lib/known-set-names.ts`](../../apps/wholesale/src/lib/known-set-names.ts). The fix held — but the verification did not.

A live probe of `https://api.tcgdex.net/v2/ja/sets/SV11B` returned:

```json
{ "id": "SV11B", "name": "ブラックボルト", "releaseDate": "2025-06-06", ... }
```

Our curated map said `"ガイアクライシス"` (Gaia Crisis). TCGdex said `"ブラックボルト"` (Black Bolt). They are not the same set, and TCGdex is right — SV11B/W shipped in Japan in June 2025 as the Zekrom/Reshiram-themed *Black Bolt / White Flare* pair. Our `KNOWN_SET_NAMES` was carrying a pre-release rumour that never became a real product.

A platform with one witness cannot detect this kind of drift. A platform with two witnesses can.

## The shape

CardRush is the **market-reality witness**. Its sitemap tells us what is being sold, its product pages tell us SKUs and prices, its image hosting gives us card art. The operator-curated `KNOWN_SET_NAMES` is the human refinement layer on top — the operator's name for what CardRush is selling.

TCGdex ([api.tcgdex.net](https://api.tcgdex.net/v2/)) is the **metadata-correctness witness**. Community-maintained, multilingual (14 languages including `ja`), free, no auth, REST. It carries the canonical set ID, the canonical Japanese name, the release date, the official card count, the serie name, the logo URL. It does **not** carry JPY retail prices (Cardmarket EUR only) and its image CDN 404s for fresh JP releases — so it cannot replace CardRush. It can only audit it.

The substrate ([`drizzle/0020_sets_tcgdex_witness.sql`](../../apps/wholesale/drizzle/0020_sets_tcgdex_witness.sql)) adds seven `tcgdex_*` columns to the `sets` table, all nullable:

```sql
ALTER TABLE sets
  ADD COLUMN tcgdex_id           text,
  ADD COLUMN tcgdex_name         text,
  ADD COLUMN tcgdex_serie_name   text,
  ADD COLUMN tcgdex_logo_url     text,
  ADD COLUMN tcgdex_release_date text,
  ADD COLUMN tcgdex_card_count   integer,
  ADD COLUMN tcgdex_fetched_at   timestamptz;
```

CardRush keeps writing to `name`, `release_date`, `sort_order`, `active`. TCGdex writes to its mirror columns. **They are not unified.** The fields sit side by side. The audit ([`apps/admin/scripts/tcgdex-drift.ts`](../../apps/admin/scripts/tcgdex-drift.ts)) reports where they disagree — and the operator decides which witness to trust per row.

## Three wiring points

**Per-card discovery** ([`cardrush-discovery.ts`](../../apps/wholesale/src/lib/cardrush-discovery.ts), `ensureSetRow`). When the discovery cron encounters a card whose set has never been seen, the helper INSERTs the `sets` row, then — for tcgdex-supported games — performs an inline `fetchTcgdexSet(setCode)` and writes the `tcgdex_*` columns in the same UPDATE. If the curated `KNOWN_SET_NAMES` had no entry (i.e. the supplied `name` equals the code, placeholder), the inline enrichment also lifts `sets.name` to TCGdex's value. Operator-renamed sets are protected by a `WHERE name = code` guard.

**Orphan post-backfill** ([`cardrush-discovery.ts`](../../apps/wholesale/src/lib/cardrush-discovery.ts), `tcgdexPostBackfill`). After the bulk SQL backfill creates placeholder rows for orphan cards, this pass walks `sets WHERE tcgdex_fetched_at IS NULL AND game IS supported`, fetches TCGdex for each, writes the mirror columns. Bounded at LIMIT 200 per cron tick so TCGdex never sees a thundering herd. The initial ~120 known Pokémon sets converge within a single run.

**Drift audit** ([`tcgdex-drift.ts`](../../apps/admin/scripts/tcgdex-drift.ts)). Four checks: name disagreement, release_date disagreement, un-enriched count, card-count delta. Runs in CI via `pnpm audit:tcgdex-drift`; strict mode (`--strict`) exits non-zero on any finding. The first run after deploy will report SV11B and SV11W as findings — Yu chooses whether to keep our curated names or switch to TCGdex's.

## Substrate honesty

Each value names its source.

- `sets.name` carries an *implicit* operator-curated provenance. It comes from `KNOWN_SET_NAMES` (a hand-maintained file) when the operator added an entry; otherwise the placeholder (`= code`); otherwise from TCGdex via the placeholder-lift path. The `sets.id` row history doesn't currently distinguish these — a follow-up could add `name_source` enum (curated|placeholder|tcgdex-lift) but for now the audit's check 1 surfaces the ambiguity.

- `sets.tcgdex_*` carries an *explicit* external provenance via the `tcgdex_fetched_at` timestamp. When this is NULL, the row hasn't been enriched yet (yet — visible via audit check 3). When non-NULL, every `tcgdex_*` value on the row was observed from TCGdex at that timestamp.

- The audit itself is substrate-honest about its own absence: it skips gracefully when `WHOLESALE_DATABASE_URL` is unset, exits 0 in informational mode, exits 1 only in `--strict`.

## What this does and doesn't fix

This kingdom fixes the *naming-drift* gap: we will know within one cron tick if our curated set name disagrees with TCGdex. The fact that the curated SV11B/W names were wrong becomes visible exactly once we ship and trigger the next discovery cron.

This kingdom does not fix:

- **Card-level metadata drift.** TCGdex carries every card in every set (`cards: [{ id, localId, name, ... }]` array), but we currently only enrich at set granularity. Card-level enrichment is a separate kingdom — would require a `tcgdex_*` block on `cards`, a higher rate-limit budget, and a dedicated cron. Deferred.

- **The JPY price and image-hosting witness.** TCGdex doesn't help here. CardRush remains the only source for those.

- **Multi-source agreement on the headline price.** Named in the trace as still missing — `cards.price` reflects only CardRush even though `/api/v1/prices/[sku]/sources` computes cross-source agreement. That is a different kingdom.

## The audit as story

Run `pnpm audit:tcgdex-drift` after the first discovery cron tick post-deploy and you will see something like:

```
◇ Check 1 — sets where name ≠ tcgdex_name
    count: 2
    Disagreements:
      [pokemon] SV11B — ours: "ガイアクライシス"  ·  tcgdex: "ブラックボルト"
      [pokemon] SV11W — ours: "ディストピアフォール"  ·  tcgdex: "ホワイトフレア"
```

Two rows. Two names per row. **The audit doesn't tell us which is true.** It tells us they disagree. The act of choosing — operator deletes `KNOWN_SET_NAMES["pokemon:SV11B"]`, or operator overrides TCGdex with a known-better local name — is the substrate-honest moment. The platform now performs that moment legibly. *Truth is not what the kingdom asserts; truth is what the kingdom can fail to assert quietly.*

## File map (companion to frontmatter)

| File | What it does |
|---|---|
| [`apps/wholesale/src/lib/tcgdex/client.ts`](../../apps/wholesale/src/lib/tcgdex/client.ts) | The Falcon's TCGdex cousin. `fetchTcgdexSet(setCode, lang)` with 5s timeout, returns null on absence, typed response. |
| [`apps/wholesale/src/lib/cardrush-discovery.ts`](../../apps/wholesale/src/lib/cardrush-discovery.ts) | `ensureSetRow` enriches on creation; `tcgdexPostBackfill` walks un-enriched rows at LIMIT 200/tick. |
| [`apps/wholesale/drizzle/0020_sets_tcgdex_witness.sql`](../../apps/wholesale/drizzle/0020_sets_tcgdex_witness.sql) | Seven mirror columns + partial index on un-enriched rows. |
| [`apps/storefront/scripts/tcgdex-drift.ts`](../../apps/storefront/scripts/tcgdex-drift.ts) | Four-check drift audit. `pnpm audit:tcgdex-drift` informational; `--strict` for CI gate. (Relocated from `apps/admin/scripts/` in commit `175b722` as part of the admin→storefront merge.) |
| [`apps/wholesale/src/lib/known-set-names.ts`](../../apps/wholesale/src/lib/known-set-names.ts) | The first witness's curated layer. SV11B/W entries corrected to TCGdex-confirmed names in this kingdom's commit. |

## How this shipped

The substrate-honest record of where this code actually lives:

The five files named above — migration `0020_sets_tcgdex_witness.sql`,
TCGdex client `tcgdex/client.ts`, the curated map `known-set-names.ts`
(with the SV11B/W correction), the discovery wiring in
`cardrush-discovery.ts`, and this very document — all landed in a
single commit, **`4a345d0`**, on 2026-05-15 at 11:27 UTC.

That commit's *message* names only a different concern: "feat(b2b):
Phase 3 — account migration + welcome email scripts (retry)". The
TCGdex work was bundled into it by a race condition between parallel
Sophia sessions running against the same working tree — one sister's
`git commit` swept up my staged TCGdex files alongside their own b2b
scripts. The bundled commit's diff *is* truthful (`git show 4a345d0
-- apps/wholesale/src/lib/tcgdex/`) — only the commit message under-
states what was committed.

A clean amend / rebase to split the commit would, by the time of
this note, require rewriting six subsequent sister commits and was
judged unsafe against the active multi-Sophia workload. So instead:
the kingdom is honest about its commit boundary in *this* document.
The diff is the truth; the message is incomplete; the connection
doc names both. Future readers reconciling "where did the TCGdex
work come from?" should run:

```bash
git show 4a345d0 -- \
  apps/wholesale/drizzle/0020_sets_tcgdex_witness.sql \
  apps/wholesale/src/lib/tcgdex/ \
  apps/wholesale/src/lib/known-set-names.ts \
  apps/wholesale/src/lib/cardrush-discovery.ts \
  docs/connections/the-second-witness.md
```

This commit (the one shipping this paragraph) is the platform's
correction note — a small, additive, substrate-honest follow-up
that names the bundling instead of pretending it didn't happen.
The four-doctrines hierarchy — substrate honesty → transparency →
meaning → creation — survives the messy commit-boundary because we
*name* the mess in the artifact that carries the work.

## Self-reference

The platform that admitted it could not name SV11B correctly from a single source is the platform that now lists, in code, *both* names side by side and refuses to choose for the operator. Every audit run after this commit lands is a small ceremony: the platform asks itself, *do my two witnesses still agree?* Most days they will. The days they don't are the days the platform's curated layer drifted from reality, and the days the operator gets to look it in the eye.

🐍❤️
