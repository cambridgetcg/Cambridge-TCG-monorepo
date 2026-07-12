# The Sealed Word

> *A seal becomes a witness only when someone outside the room keeps it.*

This document used to tell the raffle as a fully verifiable fairy tale. The
code supports a narrower and still useful account. This version says exactly
what is stored, what is public, and what a public reader cannot prove.

## The actual flow

### 1. Creation stores a commitment

`createRaffle()` inserts the raffle, then calls `commitSeed()`. That function
generates a 32-byte server seed, stores the seed and its SHA-256 commitment in
the `raffles` table, and inserts the commitment into `raffle_draw_proofs`.

This is a database write, not an external timestamp. If the write fails, new
entries are now refused until a commitment exists.

### 2. Active listings expose the hash

`GET /api/rewards/raffles` returns `seed_commitment` for active raffles. Draft
raffles are not in that public list, and the server seed stays private until
the draw proof is published.

An entrant can save the active listing's commitment outside Cambridge TCG
before entering. That saved copy is the independent witness: after the draw,
the revealed seed must hash to the value the entrant retained. Without an
outside copy, Cambridge TCG controls both the database row and the live API.

### 3. Entries remain private

Entries accumulate in `raffle_entries`. The full draw input contains entry and
account UUIDs. Publishing that manifest would turn raffle participation into
identity publication, so the public proof withholds it.

### 4. The draw is deterministic

The legacy-named `provablyFairDraw()` computes:

```text
entry_hash    = sha256(ordered private entry manifest)
combined_hash = sha256(server_seed + entry_hash)
winner_index  = combined_hash mod total_weighted_entries
```

The result and proof fields are stored in `raffle_draw_proofs`. The public
projection reveals the server seed, stored commitment, entry hash, combined
hash, weighted index, and aggregate entry counts. It withholds the manifest
and winner identity.

## What a public reader can check

- The revealed server seed hashes to the stored commitment.
- The revealed seed plus the stored entry hash reproduces the combined hash.
- The combined hash reproduces the published weighted index.
- If the reader saved the active raffle commitment before entry, the later
  seed is consistent with that independently retained value.

## What a public reader cannot check

- The private entry manifest cannot be reconstructed from its hash.
- The public cannot independently confirm that the entry hash represents every
  eligible entry in the right order.
- The public cannot map the weighted index to a participant without the private
  manifest.
- Database `committed_at` is not an external timestamp.
- The raffle proof is not included in the shared `fairness_digests` chain.
- Legacy raffles that first receive a seed immediately before drawing have a
  reproducible result but no pre-entry witness.

The public API therefore reports `complete_draw_verification: false`. That is
not a failed hash check; it is the honest boundary of the public evidence.

## Code map

- `apps/storefront/src/lib/rewards/db.ts` creates raffles, exposes active
  commitments, and refuses entry without one.
- `apps/storefront/src/lib/rewards/provable-fair.ts` stores the seed and creates
  the deterministic draw receipt. Its filename and function name are legacy.
- `apps/storefront/src/app/api/rewards/raffles/[id]/proof/route.ts` returns the
  privacy-safe public proof.
- `apps/storefront/src/lib/rewards/raffle-sweep.ts` draws due raffles. Its
  fallback commitment for legacy rows is not pre-entry evidence.
- `apps/storefront/src/app/rewards/raffles/[id]/page.tsx` shows active entrants
  the commitment so they can retain it before entering.

The theatre can stay. The guarantee must stay smaller than the story.
