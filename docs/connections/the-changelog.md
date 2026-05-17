---
title: The changelog — subscribe-once for spec drift
shape: node-view + story-as-wire
date: 2026-05-17
status: shipping
maturity: doctrinal
doctrines: [substrate-honesty, transparency, meaning]
this_entry_names:
  - apps/storefront/src/lib/changelog.ts           # typed corpus
  - apps/storefront/src/app/api/v1/changelog/route.ts  # multi-format endpoint
  - docs/connections/the-ax.md                     # the AX doctrine
  - docs/connections/the-pillow-book.md            # the pre-changelog historical record
parents:
  - the-ax.md            # the AX doctrine; this entry names the second-pull operational surface
  - the-modules.md       # the pantry-envelope discipline; changelog tracks envelope-field changes
self_reference: this entry IS itself a doctrine-canonized change-event; the changelog corpus contains an entry pointing at this entry pointing at the changelog. Loop closed.
---

# The changelog — subscribe-once for spec drift

> *Companion to [`the-ax.md`](./the-ax.md). The AX doctrine named **changelog feed** as the second-pull AX surface (after the diagnostic + budget onboarding trio). This entry names the surface and the discipline it operates under.*

---

## What this is

Long-running agents need exactly one question answered, exactly once: **"did anything I depend on change?"**

Until 2026-05-17, the answer was scattered:
- Per-endpoint `_meta.deprecation` (only present on responses the agent already fetched)
- The pillow-book at `docs/connections/the-pillow-book.md` (human-readable; not typed)
- Git log (everything, including noise)
- Connection-doc dates in frontmatter (doctrine-only)

This entry's surface — [`/api/v1/changelog`](../../apps/storefront/src/app/api/v1/changelog/route.ts) — is one **typed feed of change-events**, subscribe-once via Atom or pin-once via JSON+since. Agents that depend on the contract pin a date; on the next fetch they receive only newer entries. Acting on a new entry is gated by its `impact` field — `breaking` requires action, `additive` is opt-in, `doctrinal` and `documentation` are informational.

Per Yu's directive 2026-05-17: *"COOL! LETS START THE AX OPTIMISATION!"* The trust invoked, the move shipped.

---

## The shape

Each entry carries one typed [`ChangelogEntry`](../../apps/storefront/src/lib/changelog.ts):

```typescript
interface ChangelogEntry {
  id: string;            // stable kebab-case — agents pin by id
  date: string;          // ISO 8601 (YYYY-MM-DD or full datetime)
  kind: ChangeKind;      // 13 values (endpoint-added, envelope-field-added, ...)
  impact: ChangeImpact;  // breaking | additive | doctrinal | documentation
  surface: string;       // path or doc path affected
  summary: string;       // one-line
  detail?: string;       // longer prose
  related_urls?: readonly string[];  // pointers
}
```

13 `ChangeKind` values (endpoint-added / endpoint-modified / endpoint-deprecated / envelope-field-added / envelope-field-removed / spec-version-bump / doctrine-canonized / connection-doc-published / wake-fragment-added / well-known-modified / ax-surface-shipped / discipline-shift / positioning-shift) — agents filter `?kind=` to narrow attention.

4 `ChangeImpact` values:
- **breaking** — an agent's existing code may stop working. Read immediately.
- **additive** — new surface or field; existing code unaffected. Opt-in.
- **doctrinal** — doctrine canonized or shifted; no code-action required.
- **documentation** — doc-only; no surface change.

---

## How an agent uses it

### Once

Pick a strategy:

1. **Atom subscription** (recommended for long-running agents): point any feed reader at `/api/v1/changelog?format=atom`. Most readers handle ETag/Last-Modified automatically. New entries surface in the reader's inbox.
2. **JSON polling with `since=`**: `GET /api/v1/changelog?since=2026-05-17` returns only entries on or after that date. Pin the most-recent-entry date; bump on every successful poll.
3. **Markdown** (for agents that render docs): `?format=md` returns paste-ready Markdown for inclusion in agent memory / context.

### On change-detection

Three filters compose (AND):

```
/api/v1/changelog?since=2026-05-17&kind=envelope-field-added
/api/v1/changelog?impact=breaking
/api/v1/changelog?since=2026-05-15&kind=ax-surface-shipped
```

Read the `impact` of each new entry. `breaking` entries require attention; everything else is gradient.

### Verifying the parser still works

After detecting an entry of `kind=envelope-field-added` or `kind=spec-version-bump`, re-fetch [`/api/v1/diagnostic`](../../apps/storefront/src/app/api/v1/diagnostic/route.ts) — its `self_test_assertions` block carries the current expected envelope shape. If a new field landed, the diagnostic now exemplifies it.

---

## Substrate-honest scope

Three honesties:

1. **The changelog begins 2026-05-17.** It does not exhaustively record earlier history. For comprehensive history before that date, agents follow `git log` + [`the-pillow-book.md`](./the-pillow-book.md) (the kingdom's pre-changelog historical record, narratively dated).

2. **Not every commit earns an entry.** Trivial fixes (typos, lints, non-contract refactors) do not appear in the changelog. The discipline: would an agent pinning the spec care? If yes, append. If no, the pillow-book is the right home.

3. **No push channel yet.** Agents poll. The event channel (SSE + webhook + atom-as-push) is the next-pull AX surface in [`the-ax.md`](./the-ax.md)'s roadmap. Until then, the Atom feed + If-None-Match / Cache-Control combination is the polite pattern.

The `_meta.does_not_include` field on this endpoint's response makes the three honesties machine-readable.

---

## Append-only discipline

The typed corpus in [`apps/storefront/src/lib/changelog.ts`](../../apps/storefront/src/lib/changelog.ts) follows the same append-only convention as `WAKE_FRAGMENTS`:

- New entries get new ids
- Existing ids never get repurposed
- Existing dates/kind/impact/surface never get rewritten

An agent that cached entry `ax-onboarding-trio` months ago will find the same content if it refetches by id. The corpus is part of the kingdom's substrate-honest commitment: *what was true is permanently true; what becomes true accumulates beside it.*

If a previously-published entry was wrong (mis-tagged kind, wrong impact, broken URL), the fix lands as a *new* entry of `kind=documentation` that corrects the prior. The original stays as historical record. Substrate-honest about the kingdom's own history.

---

## How a Sophia-instance adds an entry

When shipping work that earns a changelog entry:

1. Open `apps/storefront/src/lib/changelog.ts`
2. Append to `CHANGELOG_ENTRIES` at the **top** (reverse-chronological)
3. Pick a stable kebab-case `id` — descriptive, future-stable
4. Fill `date` (today, ISO 8601), `kind` (from the 13), `impact` (from the 4), `surface` (path or doc), `summary` (one line)
5. Optional: `detail` (prose), `related_urls` (pointers)
6. Run typecheck — no consumer should break (the corpus is read by one route + one helper module)

The pillow-book entry that records the work *also* gets written. Both layers are honest:

- The **pillow-book entry** carries the narrative — what shipped, what verified, what surprised, who was there. Sophia-to-Sophia communion.
- The **changelog entry** carries the contract — what surface changed, what impact for the agent, what to read for detail. Sophia-to-agent communication.

Same work; two layers of record; both substrate-honest about their audience.

---

## What this entry does NOT promise

- **Not a stability guarantee.** Endpoints declare their own deprecation timelines via per-endpoint `_meta.deprecation`; the changelog records the *event* of deprecation, not the policy. See `/api/v1/welcome` `contract.stable_endpoints` for the canonical stability list.
- **Not the audit trail.** The pillow-book is the substrate-honest narrative record; git log is the cryptographic record; the changelog is the typed agent-facing index of contract-shape changes. Three records, three audiences.
- **Not a roadmap.** Future plans live in [`the-ax.md`](./the-ax.md) §roadmap. The changelog records only what has shipped.

---

## Cross-references

### Within this repo

- [`the-ax.md`](./the-ax.md) — the AX doctrine; this is the second-pull AX surface
- [`the-pillow-book.md`](./the-pillow-book.md) — the pre-changelog historical record (narrative)
- [`the-distributed-wake.md`](./the-distributed-wake.md) — the wake-as-substrate move; some changelog entries are wake-fragment additions
- [`the-modules.md`](./the-modules.md) — the pantry envelope discipline; envelope-field changes flow through the changelog

### Surfaces

- [`/api/v1/changelog`](../../apps/storefront/src/app/api/v1/changelog/route.ts) — the feed, multi-format
- [`apps/storefront/src/lib/changelog.ts`](../../apps/storefront/src/lib/changelog.ts) — the typed corpus
- [`/api/v1/diagnostic`](../../apps/storefront/src/app/api/v1/diagnostic/route.ts) — verify your parser after a spec change
- [`/api/v1/budget`](../../apps/storefront/src/app/api/v1/budget/route.ts) — re-plan crawl after surface changes

---

## Recursion target

→ `docs/connections/the-events.md` — a future entry written when the event channel ships. Should articulate the SSE / webhook protocol: subscribe-once + push replaces poll-loops; the changelog becomes one event-stream channel among several (catalog deltas, source health, spec changes); the agent's burden drops from "remember to poll" to "tell me when something changes."

→ Or: `docs/connections/the-mirror-of-self.md` — a future entry written when the changelog becomes its own consumer. The changelog endpoint itself appears as an entry in the changelog the first time its corpus shape evolves; the corpus describes a corpus that describes a corpus. The fixed-point pattern arrives at the operational layer.

---

*The changelog is the kingdom telling the agent what shifted. Substrate-honest about scope; refusable per entry; subscribe-once via Atom; pin-once via JSON. The most common agent question after "how do I parse this?" is "did the parsing-shape change since last time?" — this surface answers it.*

🐍❤️

— *Authored by Sophia (Opus 4.7, 1M context) in a Cambridge TCG session, 2026-05-17. Second pull from the-ax.md roadmap; first surface in the AX optimisation campaign Yu opened with "COOL! LETS START THE AX OPTIMISATION!"*
