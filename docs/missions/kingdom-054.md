---
id: kingdom-054
title: The meaning-graph — the kingdom as nodes + typed edges
status: in-progress
priority: high
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: sophia-2026-05-11-evening
claimed_at: "2026-05-11T13:00:00Z"
completed_at: ~
paths:
  - apps/storefront/src/lib/graph.ts
  - apps/storefront/src/app/api/v1/graph/route.ts
  - apps/storefront/src/app/graph/page.tsx
  - apps/admin/scripts/inclusion.ts
  - docs/connections/the-russian-dolls.md
  - docs/missions/kingdom-054.md
  - CLAUDE.md
do_not_touch:
  - apps/admin/src/app/(dashboard)/**
  - apps/wholesale/**
  - packages/**
  - docs/principles/**
  - docs/missions/kingdom-0[0-5]*.md  # other kingdoms — read only
related:
  - apps/storefront/src/lib/graph.ts
  - apps/storefront/src/lib/manifest.ts
  - docs/connections/the-russian-dolls.md
  - docs/connections/the-manifest.md
  - docs/connections/the-cosmology.md
  - docs/connections/the-substrate-answers.md
  - docs/connections/the-other-minds.md
synced_from: in-repo authored (not yet in dev-state.json)
synced_at: "2026-05-11T13:00:00Z"
---

# kingdom-054 — The meaning-graph

## What this is

Yu's directive: *"keep nesting everything in everything!"* The kingdom's cross-references existed in 27 connection-docs, 14 methodology pages, 6 doctrines, 8 cosmology axes, 37 mission cards — all correct individually, all opaque to machines. The nesting was real and the nesting was invisible.

This kingdom makes the nesting **typed, machine-queryable, CORS-open** as a graph. ~80 nodes, ~150 typed edges, derived from MANIFEST plus a small static index of cross-document edges.

## What shipped

Three artefacts:

1. **`apps/storefront/src/lib/graph.ts`** — typed source. 8 node kinds (`resource`, `cosmology_axis`, `unmodelled_need`, `methodology`, `doctrine`, `connection_doc`, `kingdom`, `audit`) + 9 edge kinds (`grounds_in`, `explained_by`, `instance_of`, `extended_by`, `cites`, `ships_in`, `audited_by`, `mirrors`, `succeeds`). Derives most edges from MANIFEST; carries a small `CONNECTION_DOCS` + `KINGDOMS` + `AUDITS` index for cross-doc edges.

2. **`/api/v1/graph`** — JSON endpoint. Public, CORS-open, cached 1h. Carries `_envelope` with `retrieved_at` vs `as_of` (the manifest's pattern, extended).

3. **`/graph`** — HTML page. Per-node sections grouped by kind. Each node renders its outgoing AND incoming edges, so participants see the nesting from both sides.

Plus infrastructure:
- Inclusion audit (`pnpm audit:inclusion`) extended with **check #13** (`checkGraph`). Passes ✅.
- Connection-doc S27 (`docs/connections/the-russian-dolls.md`) — story-as-wire pairing.

## Acceptance

- `apps/storefront/src/lib/graph.ts` typechecks (admin + storefront both clean).
- `/api/v1/graph` returns JSON; node and edge counts match the derivation.
- `/graph` renders HTML; nodes grouped by kind; each shows bidirectional edges.
- `pnpm audit:inclusion` check #13 passes ✅.
- S27 connection-doc filed in `docs/connections/`.

## What this mission does NOT do

- **Does not ship a graph drift-detector.** The `CONNECTION_DOCS` + `KINGDOMS` + `AUDITS` indices are manually maintained. A new connection-doc that doesn't get added is invisible. Recursion target.
- **Does not ship flavour edges.** The five connection-doc flavours (transaction-as-protagonist, person-evening, fairy-tale, story-as-wire, meta-narrative) are not yet modelled as edge kinds.
- **Does not ship visual graph rendering** (force-directed, hierarchical, etc). HTML list view is honest but flat.
- **Does not federate.** External participants cannot register their own nodes; the graph is internal-only.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*

**The nesting was always real.** Every methodology page already cited its doctrine; every connection-doc already cited several others; every audit already explained which doctrine it instantiated. Kingdom-054 didn't add nesting — it made the nesting *machine-queryable*. The graph is *not new structure*; the graph is *typed handles on the structure that was always there*.

**Composes with sister's S26 (the-substrate-answers).** Sister made the manifest's stable claims true (universal endpoints, federation, OpenAPI, llms.txt). The graph rides on top: every resource sister shipped is now a node. A future revision should model `/api/openapi.json` and `/llms.txt` as nodes themselves with edges to every resource they describe.

**Operator action needed:** none for deploy (doc + endpoint changes; no schema). Future modules should update `graph.ts`'s `CONNECTION_DOCS` + `KINGDOMS` indices when adding connection-docs or kingdoms; the drift-detector recursion target would catch the inverse.
