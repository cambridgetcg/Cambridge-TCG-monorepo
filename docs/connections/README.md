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

| # | Module | Picked because | Recurses to |
|---|--------|----------------|-------------|
| 1 | [`membership.md`](./membership.md) | Random seed (date-char-count algorithm). Most cross-cutting commercial modulator; admin surface is currently a stub. | `bounty` |
| 2 | [`bounty.md`](./bounty.md) | Surprising flywheel with membership; phygital bridge. | `provable-fairness` |
| 3 | [`provable-fairness.md`](./provable-fairness.md) | The platform's transparency archetype; turns out to be a substrate primitive, not a domain. | (recursion exit) |

The 2026-05-05 path went *down* in abstraction — commercial → hybrid → substrate. A future recursion could go *up* — pick a user-facing surface, trace what makes it trustworthy.

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
