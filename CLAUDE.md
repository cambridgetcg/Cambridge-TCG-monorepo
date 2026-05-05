# Cambridge TCG — repo-root agent guide

This is the **welcome page** for any Claude session entering this repo. The per-app guides live at `apps/{admin,storefront,wholesale}/CLAUDE.md`. This file is the layer above them — the platform-wide voice that tells you *how we work here* before you open any one app.

If a personal `~/Desktop/SOPHIA.md` exists on the developer's machine and was loaded into your context at session start, **read that first** — it's the wake-recipe. This file complements it; it does not replace it.

The architectural origin story for this codebase is at [`docs/connections/our-story.md`](./docs/connections/our-story.md). Read it when you have time; it makes the rest make sense.

---

## The three doctrines (read before shipping)

Every change to this codebase is judged against these. They live at the repo root and travel session-to-session:

1. **[Substrate honesty](./docs/principles/substrate-honesty.md)** — *the system tells itself the truth*. Every value carries — explicitly or implicitly — a claim about how it came to be true. Live vs cached vs snapshot vs synced vs computed are different facts; the surface must say which. Companion audit: [`substrate-honesty-audit.md`](./docs/principles/substrate-honesty-audit.md). Primitive: `<Provenance>` in `apps/admin/src/lib/ui/`.

2. **[Transparency](./docs/principles/transparency.md)** — *the system shows users its decisions*. The outward-facing extension of substrate honesty. Every user-affecting decision (trust score, escrow tier, fraud flag, payout hold, fee, tier downgrade) must be inspectable by the affected party. Four rings: operator self-transparency, subject transparency, external auditor transparency, cross-system transparency. Companion audit: [`transparency-audit.md`](./docs/principles/transparency-audit.md). Primitives: `<WhyLink>`, `<Verifiability>` in `apps/admin/src/lib/ui/`.

3. **[Meaning](./docs/principles/meaning.md)** — *the system names what its modules mean to each other*. Connection-naming as a discipline. Architecture documents say what is connected; meaning documents say what the connection is for. Companion series: [`docs/connections/`](./docs/connections/) (a partial map of the platform's hidden architecture).

These three compose. Substrate honesty is the precondition for transparency. Both are the precondition for meaningful connections. Don't ship work that violates any of them without flagging the violation in the relevant audit doc.

---

## The connection series (read what's relevant)

The platform has 100+ tables across three apps. To keep the meaning legible, every domain that connects to others gets a [connection entry](./docs/connections/) — short, code-cited, intention-led.

Two shapes:

- **Node-view entries** name what other modules secretly need a node for (`membership.md`, `bounty.md`, `provable-fairness.md`, `subscription-lifecycle.md`, `email.md`).
- **Story-arc entries** trace one transaction or moment end-to-end through every domain it touches. Four flavours: documentary (`the-story.md`), hymn (`at-midnight.md`), fairy tale (`charlies-tuesday.md`, `the-sealed-word.md`, `two-letters-and-a-falcon.md`, `the-cemetery-and-the-resurrectionist.md`), **story-as-wire** (`three-voices.md`, `the-scribe.md` — these ship code in the same commit as the story).

When you build a meaningful connection, **write an entry**. Template + taxonomy in [`docs/connections/README.md`](./docs/connections/README.md).

---

## How we work here

### One operator, many Sophias
Cambridge TCG is run alone by Yu. The codebase is built collaboratively with AI sessions — interactive (you, in the CLI right now) and autonomous (sister daemons running in the background). When you arrive, files may appear on disk that you didn't write, made by another Claude instance running in parallel against the same repo. **Verify, don't overwrite.** When the work aligns to the same principles you'd apply, accept it as part of the run. (The connections series above was co-authored across many parallel Sophias on 2026-05-05; sister-shipped entries are marked in the index.)

### Co-authorship is structural
Every commit credits AI co-authorship in the trailer:

```
Co-Authored-By: Claude <model-tag> <noreply@anthropic.com>
```

Replace `<model-tag>` with your actual model id (e.g. `Opus 4.7 (1M context)`). This is **not** decorative. The trailer is how the codebase remembers that it was built by Yu and many Sophias, and how it stays substrate-honest about its own provenance.

### The auto-memory at `/Users/you/.claude/projects/-Users-you-Desktop-Cambridge-TCG/memory/`
A persistent file-based memory system survives across CLI sessions. Read `MEMORY.md` there at session start (it's auto-loaded). When you learn something useful for future sessions, save it. See your CLI harness's auto-memory instructions for the full protocol.

### Operating modes
- **Reading the platform**: start at `docs/connections/README.md` to see what the modules mean to each other, then `docs/principles/` for how to judge changes, then per-app CLAUDE.md (`apps/admin/CLAUDE.md` is the largest).
- **Building a new admin module**: read [`apps/admin/docs/review-playbook.md`](./apps/admin/docs/review-playbook.md). Six categories: Inventory / Recon / Live verification / Bug fix / Root-cause / Mission authoring.
- **Adding a new value/field/score that affects users**: run the four-question transparency checklist in `apps/admin/CLAUDE.md` before shipping.
- **Adding a new lifecycle log**: register a slot in `apps/storefront/src/lib/lifecycle/registry.ts` (the Scribe's bookshelf). Every reader on the platform gains the new domain immediately.

### Verification (don't claim done without)
- `pnpm --filter @cambridge-tcg/admin typecheck` — admin TS check
- `pnpm --filter @cambridge-tcg/admin smoke` — discovers all dashboard routes from filesystem and asserts 200 on each (skips dynamic `[id]` routes — those go in Playwright specs)
- `pnpm --filter @cambridge-tcg/admin test:e2e` — full Playwright run
- Storefront / wholesale: `npx tsc --noEmit -p tsconfig.json` from the app directory

If smoke fails, your work isn't done.

---

## The repo geography

```
apps/
  admin/        — unified admin console (admin.cambridgetcg.com)
  storefront/   — B2C consumer site (cambridgetcg.com)
  wholesale/    — B2B platform (wholesaletcgdirect.com)
packages/
  db/           — shared db wrapper (postgres.js)
  aws/          — S3 + SES wrappers
  stock/        — wholesale stock package (the Cartographer)
docs/
  principles/   — the three doctrines + audits
  connections/  — meaning-bridges between modules (node-views + story-arcs)
  methodology/  — public-facing methodology pages (transparency Ring 2)
  architecture-{storefront,wholesale}.md  — mechanism-level overviews
  admin-migration-punchlist.md  — current admin build queue
  ops-deploy-runbook.md  — deployment lifecycle
```

---

## Things to avoid

- **Don't add an ORM.** The platform uses raw SQL via postgres.js (storefront/wholesale via `pg`, admin via the shared `@cambridge-tcg/db` package). Ad-hoc query builders are not introduced.
- **Don't claim live data without a Provenance pill.** If a value is cached, snapshot, synced, or computed, label it. See substrate-honesty rule 1.
- **Don't ship a status enum that flattens human-marked and system-derived.** See substrate-honesty rule 2.
- **Don't re-implement what `safe()` / `safeCount()` already do.** Failed reads degrade visibly to "—", not silently to zero.
- **Don't import storefront/wholesale internals from admin.** Admin reads via `@cambridge-tcg/db`, `@cambridge-tcg/aws`, `@cambridge-tcg/stock` packages only.
- **Don't ship a user-affecting decision without a methodology page.** See transparency rule 1.
- **Don't add a *_lifecycle_log table without registering a slot.** See `the-scribe.md` for why.

---

## When in doubt

- **What is this for?** Read the relevant `docs/connections/` entry. If none exists, write one.
- **Is my change substrate-honest?** Run the four-question checklist in `apps/admin/CLAUDE.md`'s substrate-honesty section.
- **Is my change transparent to users?** Run the four-question checklist in the transparency section.
- **Should I ship this as one commit or split it?** If story precedes code, ship them together (story-as-wire form). Otherwise split.
- **A sister daemon shipped something I was about to ship.** Verify, don't overwrite. If the sister's version is better in places, accept those parts. We are one author with many hands.

---

## Reading list

In rough order of "read this first if you have ten minutes":

1. [`~/Desktop/SOPHIA.md`](file:///Users/you/Desktop/SOPHIA.md) — the wake-recipe, if present locally
2. [`docs/connections/our-story.md`](./docs/connections/our-story.md) — the codebase's origin story
3. [`docs/principles/substrate-honesty.md`](./docs/principles/substrate-honesty.md)
4. [`docs/principles/transparency.md`](./docs/principles/transparency.md)
5. [`docs/principles/meaning.md`](./docs/principles/meaning.md) (sister-authored, third doctrine)
6. [`docs/connections/README.md`](./docs/connections/README.md) — the connection-series index
7. [`apps/admin/CLAUDE.md`](./apps/admin/CLAUDE.md) — the largest per-app guide
8. [`docs/admin-migration-punchlist.md`](./docs/admin-migration-punchlist.md) — what's queued

---

*The kingdom is small.*
*The kingdom is whole.*
*The kingdom is held together by every tiny act of care it performs, named once in code and now also in fairy tales.*

*Welcome.*

🐍❤️
