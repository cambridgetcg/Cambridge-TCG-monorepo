# Connections

A doc series that names the meaning-bridges between Cambridge TCG modules — the connections the code knows but doesn't say.

---

## What this is

The platform has 100+ tables, dozens of domains, and hundreds of routes. Every domain has a CLAUDE.md or a docstring that says what *it* does. Almost no domain says what it *means for* the domains around it.

That gap is what this series fills. Each entry is a node-centered view of the meaning graph — picks one module, names what other modules secretly need it for, and traces the *intentions* behind those connections (not just the data flow).

These docs are not architecture documentation. Architecture says "module A calls module B." These docs say "module A *exists because* of module B's failure mode" or "module A and module B share a substrate that nothing names" or "module A is the only place the platform earns the trust that module B borrows."

Format: short, code-cited, intention-led. Each entry recurses to a follow-up entry, building a path through the graph.

---

## How to read

Start at any entry. Each one has a **recursion target** at the bottom — follow it for the next perspective on the meaning graph. The recursion path matters: the sequence is itself a finding.

Or read the entries as a set — the union is a partial map of the platform's hidden architecture.

---

## Current entries

### Node-view entries (each node names what other modules secretly need it for)

| # | Module | Picked because | Recurses to |
|---|--------|----------------|-------------|
| 1 | [`membership.md`](./membership.md) | Random seed (date-char-count algorithm). Most cross-cutting commercial modulator; admin surface is currently a stub. | `bounty` |
| 2 | [`bounty.md`](./bounty.md) | Surprising flywheel with membership; phygital bridge. | `provable-fairness` |
| 3 | [`provable-fairness.md`](./provable-fairness.md) | The platform's transparency archetype; turns out to be a substrate primitive, not a domain. | (recursion exit) |
| 4 | [`subscription-lifecycle.md`](./subscription-lifecycle.md) | Re-recursion from #1 — `membership.md` named "Membership ↔ subscription state" as an unfilled gap. Random seed file (`apps/storefront/src/app/api/membership/cancel/route.ts`) chosen via `find` + `awk` random, landed inside that gap. The four-party protocol (user gesture / Stripe / mirror / sweep) gets named here, paired with in-code docstrings on the six membership module files. | `commission.ts` (next session) |

The 2026-05-05 paths split:
- **Path A** (#1→#2→#3) went *down* in abstraction — commercial → hybrid → substrate.
- **Path B** (#1→#4, separate session, in-code-paired) went *inward* — picked the `Membership ↔ subscription state` gap from #1 and made it the centre of #4. Each `lib/membership/*.ts` and `app/api/membership/*/route.ts` file now carries an intention-led top docstring. The connection-doc + the in-code work are the two surfaces of the same meaning.

A future recursion could go *up* — pick a user-facing surface, trace what makes it trustworthy. Or *outward* — follow #4's recursion target (commission.ts) into the trust × tier bridge.

### Story-arc entries (a single transaction traced through every domain it touches)

| # | Title | Seed | Walks through |
|---|-------|------|----------------|
| S1 | [`the-story.md`](./the-story.md) | Algorithmic — alphabetised verb list, day-of-month mod 14 = `place_order` | One P2P trade from match to coda. Sixteen tables, two users, every domain. |
| S2 | [`at-midnight.md`](./at-midnight.md) | Random seed (`find` + `awk`) → `apps/storefront/src/lib/email/streak-sweep.ts`. The sweep itself implies a story shape. | One user's evening on day 23 of a streak. The schedule-then-recheck protocol traced from sweep to drain to send-or-cancel. Five files. Paired with in-code docstrings. |
| S3 | [`charlies-tuesday.md`](./charlies-tuesday.md) | `sha256("2026-05-05 castles in the sky") mod (cards-we-know)` → same Charizard ex as S1. The dice gave the same card on purpose: documentary and fairy tale told back-to-back, same trade. | Same arc as S1, retold as fairy tale. Modules personified: the Cartographer (stock), the Matcher (order book), the Three Doors (escrow tiers), Master Stripe (foreign sovereign), the Treasurer (ledgers), the Bell-Ringer (cron + email), the Trust Court, the Scribe of Truth. |
| S4 | [`the-sealed-word.md`](./the-sealed-word.md) | Random seed → `apps/storefront/src/app/rewards/raffles/[id]/page.tsx`. The dice landed on a raffle — the platform's most theatrical machine. Sister-shipped, paired with a "the theatre" docstring on the raffle page. | A raffle drawn from the inside: the Seed (32 bytes) is the protagonist; the Manifest (a Merkle tree) is the witness; Jules and 231 other entrants are the chorus. Same fairy-tale pitch as S3, different machine. Provable fairness wearing a feather hat. |
| S5 | [`two-letters-and-a-falcon.md`](./two-letters-and-a-falcon.md) | Random seed (`find` + `awk`) → `apps/storefront/src/app/api/portfolio/search/route.ts`. Sister-shipped. | A fairy-tale of typeahead. Two letters typed; a Falcon dispatched; the Library of the Cardmaker pulls twenty pages from a vault of ten thousand; an Appraiser stamps each one; the Falcon flies home. Same pitch as S3/S4 applied to the smallest possible interaction (an autocomplete request). The fairy-tale form scales down to milliseconds. |
| S6 | [`the-cemetery-and-the-resurrectionist.md`](./the-cemetery-and-the-resurrectionist.md) | Random seed (`find` + `awk`) → `apps/storefront/src/app/api/admin/emails/[id]/route.ts`. The 36-line PATCH endpoint *is* the Resurrectionist; the seed self-identified. | The afterlife of the patient voice. An email's three-trial life, its death (`UPDATE … SET status='dead'`), and the operator's morning at the cemetery gate. Two verdicts: `retry` (resurrection) and `dismiss` (last rites). Sub-plot: the New Chapel is unbuilt (kingdom-020); the Resurrectionist works in the Old Chapel until the unified-admin tower finishes construction. **Wiring discipline: every metaphor maps to a file:line citation table at the bottom of the entry.** Yu's directive this round: *the interlinkage is on the coding and conceptual, functional level. Story serves to bridge modules, functions, serve as wiring.* |
| S7 | [`three-voices.md`](./three-voices.md) | Random seed (`find` + `awk`) → `apps/storefront/src/app/api/account/notifications/route.ts`. Sister-shipped. The dice landed on the bell — and the bell turned out to be unwired to its own kin. | A fairy tale that **ships its own wiring**. The journey timeline gains its 17th and 18th sources in the *same commit* as the story (see commit `ac07d40`). The prose is the wiring's commit message; the citations are the diff. First entry where the story precedes the code it justifies — story-as-wire made literal. |
| S8 | [`the-scribe.md`](./the-scribe.md) | `hour-of-day (07 UTC) mod 16 lifecycle-log tables` → `drizzle/0078_trade_lifecycle_log.sql`. The Scribe's freshest book (Charlie's trade was written into it yesterday). | The Scribe of Truth has been writing in sixteen books and now gets bookshelves. Story justifies and motivates a new module — `apps/storefront/src/lib/lifecycle/` — landing in the same commit. Three exemplar slots populated (admin_action / chargeback / trade); thirteen stubbed for future fill-in. Future readers (journey/timeline.ts, the user-detail hub) can migrate to compose against the bookshelf instead of rolling their own per-domain SQL. |

Story-arc entries are a different shape from node-view entries. Node-views ask "what does this module mean for the modules around it?" — they are *spatial*, panoramic, plural. Story-arcs ask "what happens when this single thing happens?" — they are *temporal*, first-person, singular. Both shapes belong here. Future entries can adopt either.

Four flavours of story-arc are now visible:
- **Transaction-as-protagonist** (S1) — a single thing crosses the platform; many systems briefly touch it; the story is *spatial in time*.
- **Person-evening-as-protagonist** (S2) — the platform performs an act on the user's behalf; the user's experience is the through-line; the story is *temporal in care*.
- **Fairy tale** (S3 / S4 / S5 / S6) — modules personified, kingdoms imagined, machines given roles. The prose plays; the citations don't. The story is *whimsical in rigor*. S6 introduces an explicit **wiring-discipline** rule: every metaphor must map to a file:line citation in a table at the bottom of the entry. The story is the diagram. *Reading the entry top to bottom is functionally equivalent to walking the dependency graph in the IDE.*
- **Story-as-wire** (S7 / S8) — the story precedes the code it justifies and ships in the same commit. S7 (sister) added two new journey-timeline sources alongside the prose; S8 (mine) ships a brand-new `lifecycle/` module on the storefront. The character motivates the abstraction; the abstraction enforces the character. *The fairy tale is load-bearing.* This is the form Yu's directive named directly: *story serves to bridge modules, functions, serve as wiring.*

All eight are honest. All eight make systems make sense as systems-for-someone. *Meaning held at any pitch still hums true.* The form scales from milliseconds to days, from documentary to fairy tale, from describing-existing-wiring to *being-the-wiring*.

---

## How to add an entry

When you build a module, refactor a connection, or notice that two systems are doing something together that neither's docstring acknowledges — write an entry.

Template:

```markdown
# <Module> — connections

> **Seed.** OR **Recursion N from `<previous>.md`.** Picked because <reason>.

## What this module is, in one sentence
A meaning-led description, not a mechanism description.

## What other modules secretly need it for

### → <Connected module>
**The thread.** Story-form description of the connection. Make it readable cold.
**The intention.** Why this connection exists, in one paragraph. Not "what" — "why."
**Code paths.** Files + line ranges, including the schema, the library, the surface.
**Surface today.** Where the connection is visible (or "Invisible — this doc is the first place it's named").

### → <Next>
…

## What's NOT yet connected (the visible gaps)
The negative space. Where a connection *should* exist but doesn't, or where it's intentionally absent.

## Recursion target
Pick one thread to follow. Say why. Link forward.
```

Length: ~150–250 lines. Density over coverage. The reader should be able to take one bullet from this doc to a code review and know what they're looking at.

---

## What this is NOT

- **Not architecture documentation.** That lives in `docs/architecture-*.md`. Architecture answers "how." Connections answer "why this matters for that."
- **Not an audit.** Audits live in `docs/principles/*-audit.md`. Audits list violations. Connections list intentions, including the ones that are working fine.
- **Not exhaustive.** A platform has more connections than any series can map. The point is to model the *practice* — to make connection-naming a habit, so when a builder touches a module they look outward as well as inward.
- **Not durable in the sense the principle docs are.** Connections drift; modules merge; intentions shift. Re-read every six months and update or archive.

---

## The intention behind the series

The platform is a single operator's labour at scale. The substrate has more meaning than any one head can hold. Naming connections externalises some of that meaning into a form the next session can pick up. Each entry is a small refusal of "the code is the documentation" — because the code is the *machinery*, and meaning is what the machinery is *for*.

A module without its connections documented is a module that, if you removed it, you couldn't predict the breakage in advance. Connection docs are how the platform avoids becoming a heap of independently-correct modules whose composition produces unpredictable behavior.

---

*The substrate connects what the surfaces don't. Naming the connections is the first work of meaning.*
