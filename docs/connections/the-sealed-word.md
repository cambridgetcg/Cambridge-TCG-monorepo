# The Sealed Word

> **Recursion / story-form.** Random seed: `apps/storefront/src/app/rewards/raffles/[id]/page.tsx`. The dice landed on a raffle — the platform's most theatrical machine, where suspense and cryptography wear the same costume. **Form: fairy-tale, fully verifiable.** Every beat is code-anchored; every flourish is real architecture wearing a feather hat.

> *Castles in the sky have foundations in math.*

---

## Cast

- **The Seed.** Thirty-two bytes of pure randomness. Born in a function. Will not survive the week. Carries the weight of everything.
- **Jules.** Twenty-six. Has wanted the gold-foil Charizard their whole adult life. Has 4,000 Berries. Today is Tuesday.
- **The Manifest.** A Merkle tree. Begins empty. Grows like a vine. Becomes the platform's only honest answer to "who entered."
- **The Platform.** Plays many parts. Sometimes the auctioneer, sometimes the cryptographer, sometimes (by design) the locked-up wizard who has tied their own hands.
- **The Chorus.** Two hundred and thirty-one other entrants. Mostly anonymous. Their hopes are weighted in Berries.

---

## Scene I — The birth of the Word

It is **Tuesday, 3:47 PM**. The raffle was created an hour ago by an admin who clicked a button. Behind that button, a function fires: `commitSeed()` (`apps/storefront/src/lib/rewards/provable-fair.ts:36`).

```
const newSeed = crypto.randomBytes(32).toString("hex");
//              ^ The Seed is born here. It has 64 hex characters.
//                It will live exactly as long as the raffle.
```

The Platform now has a problem that is also the whole game. *It knows the Word.* The Word will determine the winner — deterministically, when the time comes. If the Platform reveals the Word later, that's fair. But what stops the Platform from peeking at the entries first, deciding who it likes, and then *choosing a Word* that lands on its favourite?

The Platform solves this the way every fairy-tale solves a Big Problem: with a sealed envelope.

It computes `SHA-256(serverSeed)` — the **commitment** — and posts the commitment publicly. The Word itself stays hidden. (`raffles.seed_commitment` is set; `raffles.server_seed` is set but never returned through any API until the draw fires. Look at `apps/storefront/src/app/api/rewards/raffles/[id]/route.ts` — the seed itself is not in the JSON.)

The commitment is **not** the Word. It is a *promise about the Word*. SHA-256 is a one-way street — given the commitment, you cannot derive the Word. Given the Word, you can verify the commitment. So the Platform has just publicly bound itself: *"whatever Word I reveal at draw time, it must hash to this. I cannot change my mind."*

The Seed has been **sealed**. The wax has hardened. The envelope is pinned to the wall in the public square.

> *"You may peek at the seal. You may not peek at the letter."*

---

## Scene II — The Gathering

The next 47 hours are the Gathering. The raffle page (`apps/storefront/src/app/rewards/raffles/[id]/page.tsx`) renders a countdown:

> 🕐 *2 days, 7 hours, 14 minutes*

Jules opens it on the train. They've heard about this one. Gold-foil Charizard, mint, donated by some grading service, drawn at midnight on Thursday. They have 4,000 Berries. Each entry costs 100. They could enter forty times. They enter ten — superstition says odd-numbered entry counts are bad luck, even-numbered are too obvious, prime numbers are for showoffs, ten is just *ten*.

The click hits `POST /api/rewards/raffles/[id]/enter`. Inside, `atomicSpend()` (`apps/storefront/src/lib/rewards/atomic-spend.ts`) does exactly what it sounds like: in a single SQL transaction, it deducts 1,000 Berries from `points_ledger`, inserts ten rows into `raffle_entries`, and refuses to proceed if Jules's balance is insufficient. There is no daydreaming step where Jules has the entries but not the deduction or vice versa. **The accounting cannot lie about itself.** (See [`docs/principles/substrate-honesty.md`](../principles/substrate-honesty.md) Rule 1, but for points.)

Each new row is a leaf on a Merkle vine. The leaf carries: `(user_id, raffle_id, entry_number, weight)`. The Manifest grows. As of now it has 1,847 leaves across 232 entrants — Jules is leaves 1,758 through 1,767 (a contiguous block, awarded in submission order so the leaf positions are themselves a chronological record).

The Chorus enters too. Some buy three entries, some buy a hundred. Most enter once and call it superstition. A few don't enter and just watch the count climb. The Platform watches all of this and **does nothing** — the Word is sealed, the Manifest is growing, the Platform's hands remain tied.

> *(Stage direction: the Platform paces in a back room, occasionally glancing at the sealed envelope on the wall, doing nothing else. Whatever happens next is a function of two things only: the Word, and the Manifest. The Platform cannot influence either.)*

The countdown ticks. **2d 1h 14m.** **0d 18h 6m.** **0d 0h 4m.** The page (`useCountdown` in `[id]/page.tsx:8`) updates every second. Jules has class but watches anyway. They lose track of whether they're rooting for the countdown to hit zero or never hit zero.

---

## Scene III — The Revealing

**Thursday, midnight.** The cron fires.

`/api/cron/maintenance` (one of thirty-six sweeps, dispatched in priority order) reaches the **raffle auto-draw** stage. `runRaffleAutoDraw()` (`apps/storefront/src/lib/rewards/raffle-sweep.ts:27`) asks the database one question:

> *Show me every raffle whose `draw_at` has passed and whose status is still `active`.*

Tonight, this raffle. Just this one. The function calls `provablyFairDraw()`.

What happens next takes 11 milliseconds and is the entire reason this story is true.

```
1. Read the Word.            const seed = raffle.server_seed;   // out of hiding
2. Hash the Manifest.        const entryHash = sha256(JSON.stringify(orderedEntries));
3. Combine.                  const combined  = seed + entryHash;
4. Hash again.               const winnerHash = sha256(combined);
5. Modulo.                   const winnerIndex = BigInt("0x" + winnerHash) % totalEntries;
6. Walk the leaves.          // The leaf at winnerIndex is the winner.
```

That's it. Six steps. Pure determinism. **The same six steps run by anyone with the seed and the manifest will produce the same winner index, every time.**

The winner index lands on **leaf 1,762**. The leaf belongs to Jules.

The Platform writes the result. `raffles.winner_user_id = jules.id`. `raffles.status = 'completed'`. `raffles.server_seed` is now publicly readable (the seal has broken; the Word is loose). A row enters `raffle_draw_proofs` with the seed, the manifest hash, the combined input, the winner index — every input the verifier will need (`apps/storefront/src/lib/rewards/provable-fair.ts` finalisation block).

Three things happen that Jules does not yet see.

**First**, the winner notification queues. `email_queue` gains a row with `event = 'raffle_winner'` and a 30-second debounce. Sixty seconds from now, SES will accept it; ninety from now, Jules's phone will buzz on the bedside table. (See [`docs/connections/email.md`](./email.md) for what that buzz means architecturally.)

**Second**, `prize_fulfilment_log` opens its first entry for this prize: `action = 'won'`, `target_user_id = jules.id`. The lifecycle log starts ticking. Over the next four days, this log will gain six more entries — `awaiting_address`, `address_provided`, `picked`, `packed`, `shipped`, `delivered` — each one a small ceremony the platform performs around the card moving from a vault in Cambridge to Jules's flat in Manchester.

**Third**, and this is the magic: the **proof becomes public**.

---

## Scene IV — The Bulletin

The page at `/verify/draw/[id]` (`apps/storefront/src/app/verify/draw/[id]/page.tsx`) renders.

It shows:

| Field | Value |
|---|---|
| Seed commitment | `8a4f...c3b2` *(the wax seal, posted Tuesday 3:47 PM)* |
| Server seed (revealed) | `f7e1...a209` *(the Word, sealed and now broken)* |
| Verify commitment | ✅ `SHA-256(server_seed)` matches `seed_commitment` |
| Manifest hash | `d8b6...7e4f` |
| Total entries (weighted) | 1,847 |
| Winner index | 1,762 |
| Winner | `jules` |
| Verify in browser | [Replay the draw client-side →] |

The "Replay the draw client-side" link runs the same six steps in the user's browser, in JavaScript, with the seed and manifest loaded over the public API. **The user verifies the platform without trusting it.** This is what `apps/storefront/src/lib/bounty/verify-client.ts` was made for; the raffle page borrows the function. The math runs in the user's tab; the result agrees with the server's; the platform exhales.

A skeptical entrant called Beatrice (leaf 1,891) re-runs it the next morning. The numbers come out right. She updates her notes. She enters the next raffle.

Jules, who entered ten leaves and won on leaf 1,762, never touches the verify page. Most winners don't. **The verify page exists for the people who don't win.**

> *(That is the whole reason it exists. Winners are easy to make happy; you give them the prize. Losers are who you owe an honest accounting to. The verify page is the platform's letter to its losers.)*

---

## Coda — Why this is a castle in the sky

Raffles look like the most decorative part of the platform. They're surrounded by amber gradients and amimated countdowns, the prize is a piece of cardboard, the stakes are 100-Berry entries.

But under the costume, the raffle is the platform's **most rigorous machine**. Every other domain still has trust gaps: the chargebacks page is reconciled-not-authoritative, the trust score has methodology debt, the email queue can have stale data. The raffle has none. From the moment the Word is sealed to the moment the proof is published, the platform's hands are tied to the math.

Three things are doing the work, and they're all worth naming:

1. **The commit comes before the entries.** This is the load-bearing inversion. If the Word were generated *after* entries closed, the platform could pick a winner and craft a Word that produced them. The commit-first sequence makes this impossible. (`commitSeed()` is called when the raffle is *created*, not at draw time. Read `commitSeed`'s docstring — "Idempotent: only writes a seed if one isn't already present" — that idempotence is the platform refusing to overwrite its own commitment, even by accident.)

2. **The deterministic combine.** The Word + the Manifest hash + a SHA-256 + a modulo. No randomness left to chance after the Word is fixed. **The winner is mathematically determined the moment the entries close.** The cron just opens the envelope and reads the answer that has been there for hours.

3. **The verify page exists for the losers.** It is genuinely useful only to people the platform did not just give a thing to. That alone tells you what the platform thinks fairness means.

Castle in the sky: the joy of the raffle is real, the cardboard prize is real, the gold-foil Charizard is real. The cryptography is also real. **A platform that can be playful and rigorous in the same machine has accomplished something rare**. Most marketplaces choose one. This one didn't.

> *The wax seal is theatre. The wax seal is also math. They are not in conflict; they are the same thing said in two languages.*

---

## What other parts of the platform secretly need this for

### → `apps/storefront/src/lib/bounty/verify-client.ts` — the shared cryptography

The Merkle root + replay logic isn't raffle-specific. It is reused by **bounty pulls** (the gacha-style "what did I roll" surface at `/verify/pull/[id]`). One library; two domains; same trust theatre. When a third domain joins (auctions? governance Merkle?), it borrows the same function. **The platform has invested once in a primitive that becomes reusable as it accumulates trust users.**

### → `apps/storefront/src/lib/rewards/atomic-spend.ts` — the points-substrate

The Berries that buy entries are themselves accounted in a substrate that cannot lie about itself. Atomic-spend is the raffle's economic side-rail; without it, the entries phase would have a race condition and the Manifest would be a fiction. The cryptography handles fairness; the atomicity handles correctness. They compose silently.

### → `apps/storefront/src/lib/rewards/prize-fulfilment-log.ts` — the after-life

The proof page is the *intellectual* honesty of the raffle. The fulfilment log is the *physical* honesty: the platform commits to delivering the cardboard. Six lifecycle entries (`won → awaiting_address → address_provided → picked → packed → shipped → delivered`) — each one a small ceremony, each one a row the user can read on `/account/standing`. The card crossing the country has its own audit trail.

### → `apps/storefront/src/app/verify/fairness/page.tsx` — the aggregate view

If a single draw is the proof, the **fairness dashboard** is the chi-squared test: across hundreds of raffles, do the actual win-distributions match the published weighting? This is the platform's standing offer to anyone who wants to re-examine its honesty in aggregate, not just per-raffle. Currently bounty-only; auctions and trades and governance are the roadmap (transparency-audit R3-2).

### → `apps/storefront/src/app/account/standing/page.tsx` — the loser's home

The verify page is the public account. `/account/standing` is the personal one. A loser who wants to inspect *why they lost* can navigate from the raffle page to verify, then back to standing for context. The platform's transparency stack is layered: per-raffle proof, aggregate fairness, per-user history. They cohere.

---

## What's NOT yet connected (the visible gaps)

- **No on-chain anchoring of the seed_commitment.** The provable-fair docstring mentions this as an option ("Optional blockchain anchoring: publish commitment hash on-chain for immutability"). Today the commitment lives in our DB; an admin with DB write access could in principle alter it before the draw. On-chain anchoring would close that loop. (Threat model is small for solo-operator; still: castle has a draughty window.)
- **No raffle-specific fairness aggregate.** The fairness dashboard currently only covers bounty pulls. Adding raffle-level aggregates would let an auditor verify that across all raffles, win-rate matches entry-weight to within statistical tolerance.
- **No public Merkle root publication for the raffle Manifest.** The Manifest hash is in the proof, but the leaves themselves aren't published as a Merkle tree (where each leaf could prove its own inclusion to a third-party verifier without trusting the manifest hash). Pull pages do this — raffles don't yet.

---

## Recursion target

→ `apps/storefront/src/lib/rewards/atomic-spend.ts` — the points-substrate beneath this whole story. The raffle's cryptography assumes the Berries are real; atomic-spend is what makes the Berries real. If the Manifest is the soul of the raffle, atomic-spend is the bones. Picked because: every fairy-tale needs an economy that isn't a fairy-tale. Following this thread will land us in the points ledger, the membership cashback flywheel, and the question of *what makes a virtual currency honest*.

---

## How to extend the fun-form

When a new domain on the platform has theatre-and-rigor in the same machine, write its own fairy-tale. The form is:

- Cast (3-5 actors, named, given motivations real or imagined).
- Acts (the temporal arc — birth, gathering, revealing, bulletin, or whatever the domain's rhythm is).
- Stage directions = code paths. Inline. Cite freely.
- A coda that names *why the rigor is the joy* — they are not opposed; they are the same thing.
- Recursion target.

Length: ~250 lines. The reader should laugh once, learn three things, and be able to walk to the code with the prose still in their head.

---

*The platform is many; the platform's purpose is one. Naming the purpose at the level of one raffle, traced end-to-end, is how an operator running this alone keeps the joy and the rigor in the same room.*

*The wax seal is theatre. The wax seal is also math.*
*The recipe travels.*
*The Word is sealed until it's not, and that is when the magic happens.*

🐍❤️
