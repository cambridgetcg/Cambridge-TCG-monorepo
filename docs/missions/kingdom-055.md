---
id: kingdom-055
title: The ontology — what each kind of thing IS
status: in-progress
priority: high
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: sophia-2026-05-12-morning
claimed_at: "2026-05-12T10:30:00Z"
completed_at: ~
paths:
  - apps/storefront/src/lib/ontology.ts
  - apps/storefront/src/app/api/v1/ontology/route.ts
  - apps/storefront/src/app/ontology/page.tsx
  - apps/admin/scripts/inclusion.ts
  - docs/connections/the-natures.md
  - docs/missions/kingdom-055.md
  - CLAUDE.md
do_not_touch:
  - apps/admin/src/app/(dashboard)/**
  - apps/wholesale/**
  - packages/**
  - docs/principles/**
  - apps/storefront/src/lib/manifest.ts
  - apps/storefront/src/lib/graph.ts
related:
  - apps/storefront/src/lib/ontology.ts
  - apps/storefront/src/lib/graph.ts
  - apps/storefront/src/lib/manifest.ts
  - docs/connections/the-natures.md
  - docs/connections/the-russian-dolls.md
  - docs/connections/the-manifest.md
  - docs/connections/the-cosmology.md
synced_from: in-repo authored (not yet in dev-state.json)
synced_at: "2026-05-12T10:30:00Z"
---

# kingdom-055 — The ontology

## What this is

Yu's directive (doubled): *"keep nesting everything in everything! Keep nesting everything in itself!!! Find out the nature of everything and their PROPERTIES!"*

The graph (kingdom-054) named relations. This kingdom declares **the schema beneath the graph** — what kinds of things exist, and what properties each kind carries beyond its citations.

## What shipped

Three artefacts:

1. **`apps/storefront/src/lib/ontology.ts`** — typed source. ONTOLOGY constant declaring property schemas for all 8 NodeKinds (resource / cosmology_axis / unmodelled_need / methodology / doctrine / connection_doc / kingdom / audit). ~60 typed properties total. Each property carries `name`, `type`, `enum_values?`, `description`, `source` (manifest / graph / audit / ontology / computed), `modality` (observable / declared / derived). Plus a `propertiesFor(node)` extractor that populates concrete values for any graph node.

2. **`/api/v1/ontology`** — JSON endpoint. Public, CORS-open, cached 1h. Carries `_envelope` distinguishing `retrieved_at` from `as_of`.

3. **`/ontology`** — HTML page. Renders each `NodeKind` with its property table (name / type / source / modality / description). Carries `audienceMetadata("public-documentation", ["ontology", "foundational", "schema"])`.

Plus infrastructure:
- Inclusion audit (`pnpm audit:inclusion`) extended with **check #14** (`checkOntology`). Passes ✅.
- Connection-doc S28 (`docs/connections/the-natures.md`) — story-as-wire pairing.

## Acceptance

- `apps/storefront/src/lib/ontology.ts` typechecks clean (storefront).
- `/api/v1/ontology` returns JSON; carries 8 kinds and ~60 properties.
- `/ontology` renders HTML; one section per kind with property table.
- `pnpm audit:inclusion` check #14 passes ✅.
- S28 connection-doc filed.

## What this mission does NOT do

- **Does not add a `properties` field to `GraphNode`** (yet). A small follow-up extends the graph type and populates values via `propertiesFor()`.
- **Does not implement graph-aware derived properties.** The extractor returns `0` for `methodology_instantiation_count` and `resource_grounding_count`; a future revision walks the graph during extraction.
- **Does not validate values at runtime.** A future zod or json-schema layer could.
- **Does not version per-property.** All properties are introduced at ontology version 1.0.0.
- **Does not extend to non-platform things** (no `card` or `sophia` kinds yet). Named as recursion targets.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*

**The essence/accident distinction.** The graph's edges are *accidents* — relations a thing has with other things, contingent on context. The ontology's properties are *essences* — what a thing *is*, intrinsic to being-its-kind. A resource without methodology has no `explained_by` edge but still has a `stability` property. Both layers are needed: the graph for navigation, the ontology for prediction.

**Substrate honesty applied to the ontology itself.** Each property declares its `source` and `modality`. A `stability: "stable"` is *declared* by a Sophia; a `modality_count: 2` is *derived* from MANIFEST. A participant reading the ontology can tell which properties are *observed truths* and which are *Sophia judgement calls*.

**Operator action needed:** none for deploy (doc + endpoint changes; no schema migration).

**Composes with sister-shipped layers:** S25 (manifest) lists instances; S26 (substrate-answers) makes the listings real; S27 (graph) names relations; S23 (cosmology) declares axes of fact; S28 (ontology) declares the property schema of each instance's nature. Five layers, each beneath the last.
