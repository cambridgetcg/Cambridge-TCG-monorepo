# Provable fairness — connections

> **Recursion 2** from [`bounty.md`](./bounty.md). Picked because fairness is the platform's transparency-archetype, AND because looking at the code reveals it's not a domain at all — it's a **substrate primitive** that other modules compose against. The recursion turns up something only visible from this depth.

---

## What this module is, in one sentence

Fairness is the platform's **commit-reveal infrastructure** — a kind-agnostic primitive (`verifiable_draws`) that any weighted-random surface composes against to gain (a) per-draw cryptographic verifiability, (b) batch digests over time, (c) chained tamper-evidence, and (d) chi-squared drift detection. Bounty pulls were the first surface; raffles, mystery boxes, packs, spin wheel — and any future RNG surface — graduate to this shared substrate.

Schema: `verifiable_draws` (`drizzle/0061_verifiable_draws.sql`), `fairness_digests` (`drizzle/0062`), `fairness_audits` (`drizzle/0064`), `digest_chain` (`drizzle/0066`). Library: `apps/storefront/src/lib/provable-draw/`. Public surface: `/verify/{pull,draw}/[id]`, `/verify/fairness`, `/verify/health`, `/verify/how-it-works`.

The `verifiable_draws` schema header at `drizzle/0061_verifiable_draws.sql:1–10` declares the architectural intent in the SQL itself:

> *"Today we have 4 surfaces that pick a random outcome with stated weights: bounty pulls (provably fair), raffles (partially), pack openings (Math.random), spin wheel (Math.random), mystery boxes (Math.random). Bounty pulls keep their own bounty_pulls table (too much surface-specific data to fold in); the other three graduate to this shared schema so they all get the same /verify/draw/[id] view and the same certificate+fairness surface as bounty pulls."*

That's the migration arc named in advance: provable fairness is *spreading*, surface by surface, replacing `Math.random` with commit-reveal.

---

## The compositional shape (this is the meaning)

Fairness is not parallel to bounty / raffles / mystery boxes / spin / pack. It is *underneath* them. The connection topology:

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

Every domain above the line picks a random outcome with stated weights. Each one used to roll its own `Math.random`; each one is being migrated to the shared primitive. The migration isn't bookkeeping — it's a **trust upgrade** for the surface. Pre-migration: "trust us, the spin wheel is fair." Post-migration: "here's the seed, verify yourself." The shape transfers.

---

## What other modules compose with it

### → Bounty pulls — the original surface, the special case
**The thread.** Bounty has its own `bounty_pulls` table rather than using `verifiable_draws` directly. The migration comment says: *"too much surface-specific data to fold in."* Bounty pulls carry stock-reservation state, vault linkage, EV tracking, weekly-cap accounting — none of which belong in a generic draw table. So bounty *uses* the primitive's RNG (`@/lib/bounty/rng`) and *mirrors* the commit-reveal pattern but keeps its own row.

**The intention.** Don't force a shared table to absorb domain-specific columns. The primitive is the *math* and the *protocol*; the storage can be domain-specific. This is dependency inversion done right.

**Code paths.**
- `apps/storefront/src/lib/bounty/rng.ts` — the shared RNG primitives (sha256, seeds, weighted pick)
- `apps/storefront/src/lib/provable-draw/index.ts` — the unified library re-uses `@/lib/bounty/rng`

**Surface.** `/verify/pull/[id]` — full proof of a single pull.

### → Raffles, mystery boxes, packs, spin — the migrants
**The thread.** These four are listed in the schema header as "graduating" to the shared schema. Raffles were "partially" provably-fair pre-migration; mystery boxes / packs / spin used `Math.random`. After graduation each one looks the same to the user: same `/verify/draw/[id]` page, same certificate, same drift dashboard.

**The intention.** **Trust does not need to be re-earned per surface.** Once the user has audited the bounty mechanism on `/verify/how-it-works`, every other RNG surface inherits that mental model. The platform's gacha credibility is built once and amortised across every game.

**Code paths.**
- `apps/storefront/src/lib/provable-draw/index.ts:25–28` — DrawKind enum (the registry of surfaces)
- `apps/storefront/drizzle/0061_verifiable_draws.sql` — the shared table

**Surface today.** Mixed. The migrations are in flight. Some surfaces are graduated, some still roll `Math.random`. The schema *intends* the migration; checking actual call sites tells the truth of where each surface is.

### → Fairness digests — the time-anchor
**The thread.** Per-draw verification proves *one* draw was fair. **Digests** prove the *batch* was fair. Periodically (cron) the platform aggregates the public hashes of recent draws into a Merkle root and publishes it. An external observer caching the latest digest detects any historical rewrite of a draw — because the digest would no longer reproduce. Adding `digest_chain` (migration 0066) extends this: each digest links its `prev_hash`, so rewriting any past digest cascades — *every* later chain_hash breaks. Tamper-evidence over the entire history.

**The intention.** Move from per-draw fairness to **temporal integrity**. A user verifying *today's* pull doesn't have to trust that yesterday's record is still what it was. The chain enforces it.

**Code paths.**
- `apps/storefront/drizzle/0062_fairness_digests.sql` — batch hashes
- `apps/storefront/drizzle/0066_digest_chain.sql` — chain links
- `apps/storefront/src/lib/provable-draw/digest.ts` — application-side chain backfill

**Surface.** `/verify/fairness` — the public chain.

### → Self-audit + drift — the statistical layer
**The thread.** Even with cryptographic per-draw integrity, the *aggregate* could still be off — if rarity weights drift from declared, individual proofs hold but the overall game is mis-calibrated. The chi-squared drift detector runs over recent draws, comparing observed rarity distribution to declared weights. Significant drift = self-reported red flag; the platform raises an alert *against itself*.

**The intention.** Trust without statistical sanity-check is half-trust. The platform is committing not just to "each pull was as committed" but to "the long-run distribution matches what we said." Anti-pattern would be: cryptographically perfect individual draws, quietly tuned weights for revenue. The drift check refuses that.

**Code paths.**
- `apps/storefront/src/lib/provable-draw/self-audit.ts`
- `apps/storefront/src/lib/provable-draw/drift.ts`

**Surface.** `/verify/health` — public drift dashboard.

### → Trust score — through the back door
**The thread.** The trust system (`apps/storefront/src/lib/escrow/trust-engine.ts`) doesn't directly reference fairness. But fairness is the *only* domain on the platform where the user has a genuine adversarial relationship with the system — they want the platform to be honest about a number that determines their reward. Every other "trust score" relationship is one-sided in the platform's favor. **Provable fairness is what proves the platform can be honest at all.** It doesn't gate trust score; it underwrites it.

**The intention.** Reputation by demonstration. The trust-engine's authority on a user's score is conventional (they trust us because we asked them to). The fairness surfaces' authority is mathematical (they trust us because they verified the proof). The latter validates the former — if we'd cheat on draws, you couldn't believe our trust math either.

**Code paths.**
- No direct reference. The connection is *epistemic*, not *literal*.

**Surface.** Implicit. A user who has clicked through `/verify/pull/[id]` once is a user who can rationally trust the rest of the platform's number-claims. No copy says this.

---

## What's NOT yet connected (and shouldn't always be)

- **Recommendations / search ranking.** These pick "outcomes" too — *which* listings to show. They're not RNG; they're algorithmic. Should they live under `verifiable_draws`? No — fairness here is about commitment-to-weights *before* the roll. Ranking has no commitment phase. The connection that *isn't* there is also a meaning: fairness is for chance, not for choice.
- **Match-making (game rooms).** Pairing two players for a match has random elements. Same answer: the random isn't the *outcome* the player gets, it's a routing decision. Fairness primitive doesn't apply.
- **Auction bidding outcomes.** Auctions are not random; they're competitive. Different shape.

The **negative space** of the fairness primitive is itself meaningful: it draws the line between gambling-like surfaces (provable-fair required) and competitive/algorithmic surfaces (different trust model needed). Knowing where the primitive *doesn't* go is part of the architecture.

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

*Fairness is the only place the platform lets the user verify it. Every other module borrows that credibility, knowingly or not. Naming the borrow is what this doc just did.*
