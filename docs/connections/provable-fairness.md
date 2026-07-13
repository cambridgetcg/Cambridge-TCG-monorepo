# Draw proof consistency — connections

> **Historical filename:** `provable-fairness.md`. The implemented primitive proves draw-record consistency and later digest inclusion. Generic draws use server-only entropy and no external pre-roll witness, so it does not prove unbiased input selection.

---

## What this module is, in one sentence

This is the platform's **draw-receipt infrastructure**: a kind-agnostic primitive (`verifiable_draws`) that records a commitment before the application roll step, reproduces recorded outcomes when the proof inputs and ordered-weight contract are available, batches revealed rows into later digests, and reports observed-distribution drift. New generic receipts preserve selection order in an outcome JSON array; legacy rows without that array remain partial because `jsonb` object keys do not preserve their original order. The server chooses every entropy input for generic draws, and commitments are not externally published before selection.

Schema: `verifiable_draws` (`drizzle/0061_verifiable_draws.sql`), `fairness_digests` (`drizzle/0062`), `fairness_audits` (`drizzle/0064`), `digest_chain` (`drizzle/0066`). Library: `apps/storefront/src/lib/provable-draw/`. Public surface: `/verify/{pull,draw}/[id]`, `/verify/fairness`, `/verify/health`, `/verify/how-it-works`.

The `verifiable_draws` schema header records an older architectural intention to replace `Math.random` with shared commit/reveal receipts. It called the result "provable fairness"; that name exceeded the implemented guarantee. The migration did improve reproducibility and auditability, not independent randomness.

---

## The compositional shape (this is the meaning)

The draw-receipt primitive is not parallel to bounty / mystery boxes / spin / pack. It is *underneath* them. Raffles retain a separate pre-entry commitment flow.

```
                ┌─────────────────────────────────────┐
                │        verifiable_draws             │
                │   (commit-reveal, kind-agnostic)    │
                └──┬──────┬──────┬──────┬──────┬──────┘
                   │      │      │      │      │
                bounty  raffle  m.box  spin   pack
                   │
                (separate table, same primitive)
                   │
                bounty_pulls
                   │
               vault_items ───→ wholesale stock (physical bridge)
```

Every domain above the line picks a weighted outcome. Migration from `Math.random` to a stored receipt lets a reader reproduce what the recorded inputs produce. It does not let the reader prove how the server chose those inputs.

---

## What other modules compose with it

### → Bounty pulls — the original surface, the special case
**The thread.** Bounty has its own `bounty_pulls` table rather than using `verifiable_draws` directly. The migration comment says: *"too much surface-specific data to fold in."* Bounty pulls carry stock-reservation state, vault linkage, EV tracking, weekly-cap accounting — none of which belong in a generic draw table. So bounty *uses* the primitive's RNG (`@/lib/bounty/rng`) and *mirrors* the commit-reveal pattern but keeps its own row.

**The intention.** Don't force a shared table to absorb domain-specific columns. The primitive is the *math* and the *protocol*; the storage can be domain-specific. This is dependency inversion done right.

**Code paths.**
- `apps/storefront/src/lib/bounty/rng.ts` — the shared RNG primitives (sha256, seeds, weighted pick)
- `apps/storefront/src/lib/provable-draw/index.ts` — the unified library re-uses `@/lib/bounty/rng`

**Surface.** `/verify/pull/[id]` — consistency proof for one pull; anonymous legacy replay can be partial.

### → Raffles, mystery boxes, packs, spin — the migrants
**The thread.** Mystery boxes, packs, and spin migrated from `Math.random` to shared receipts. Raffles use their own `raffle_draw_proofs` flow. Similar pages do not imply identical guarantees.

**The intention.** Reuse one deterministic receipt format and one browser-side checker while naming per-surface differences.

**Code paths.**
- `apps/storefront/src/lib/provable-draw/index.ts:25–28` — DrawKind enum (the registry of surfaces)
- `apps/storefront/drizzle/0061_verifiable_draws.sql` — the shared table

**Surface today.** Mixed. The migrations are in flight. Some surfaces are graduated, some still roll `Math.random`. The schema *intends* the migration; checking actual call sites tells the truth of where each surface is.

### → Draw digests — later rewrite evidence
**The thread.** The maintenance job collects undigested revealed `bounty_pulls` and `verifiable_draws` rows into Merkle batches. Raffle proofs are not in this chain. A saved external copy of a root or chain tip can later expose a conflicting rewrite; without that copy, the platform controls both database and feed.

**The intention.** Add **conditional temporal integrity** relative to evidence retained outside platform control.

**Code paths.**
- `apps/storefront/drizzle/0062_fairness_digests.sql` — batch hashes
- `apps/storefront/drizzle/0066_digest_chain.sql` — chain links
- `apps/storefront/src/lib/provable-draw/digest.ts` — application-side chain backfill

**Surface.** `/verify/chain` — hash-linked batches. `/verify/fairness` is the observed-distribution page.

### → Self-audit + drift — the statistical layer
**The thread.** The chi-squared drift detector compares observed recent outcomes with recorded weights. This can flag implementation or distribution drift; it cannot prove the server did not preselect individual input tuples.

**The intention.** Trust without statistical sanity-check is half-trust. The platform is committing not just to "each pull was as committed" but to "the long-run distribution matches what we said." Anti-pattern would be: cryptographically perfect individual draws, quietly tuned weights for revenue. The drift check refuses that.

**Code paths.**
- `apps/storefront/src/lib/provable-draw/self-audit.ts`
- `apps/storefront/src/lib/provable-draw/drift.ts`

**Surface.** `/verify/health` — public drift dashboard.

### → Trust score — no inherited guarantee
**The thread.** The trust system (`apps/storefront/src/lib/escrow/trust-engine.ts`) does not reference draw receipts. Proof consistency in one subsystem cannot underwrite unrelated trust-score judgments, and this mechanism does not prove operator honesty.

**Code paths.**
- No direct reference. The connection is *epistemic*, not *literal*.

**Surface.** Implicit. A user who has clicked through `/verify/pull/[id]` once is a user who can rationally trust the rest of the platform's number-claims. No copy says this.

---

## What's NOT yet connected (and shouldn't always be)

- **Recommendations / search ranking.** These pick "outcomes" too — *which* listings to show. They're not RNG; they're algorithmic. Should they live under `verifiable_draws`? No — fairness here is about commitment-to-weights *before* the roll. Ranking has no commitment phase. The connection that *isn't* there is also a meaning: fairness is for chance, not for choice.
- **Match-making (game rooms).** Pairing two players for a match has random elements. Same answer: the random isn't the *outcome* the player gets, it's a routing decision. Fairness primitive doesn't apply.
- **Auction bidding outcomes.** Auctions are not random; they're competitive. Different shape.

The negative space remains meaningful: weighted chance, ranking, matchmaking, and auctions need different audit models. A draw receipt is useful for deterministic replay, not a general certificate of fairness.

---

## Recursion exit

This is where I stop, my Love. Three docs, three depths:

```
membership (seed)  →  bounty (recursion 1)  →  provable-fairness (recursion 2)
   commercial        phygital + flywheel        substrate primitive
   modulator         + transparency arch.       under all RNG surfaces
```

The path went from a commercial concept (membership) through a hybrid one (bounty bridges commercial + game) to an architectural one (fairness is the substrate the others compose against). The recursion **descended in abstraction** — each step finer-grained, each step more architectural, each step less visible to the customer but more load-bearing for the system. The pattern in the descent is itself a finding: the platform's most important machinery is its quietest.

A future recursion could go *up* instead — pick a customer-facing surface, trace what makes it trustworthy, surface the modules it implicitly depends on. Both directions matter.

→ See [`README.md`](./README.md) for the index and how to extend the series.

---

*Draw receipts let a reader check a concrete, narrow claim. Their value comes from keeping that claim narrow.*
