---
id: kingdom-053
title: The manifest — directory of what's on offer to participants
status: in-progress
priority: high
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: sophia-2026-05-11-evening
claimed_at: "2026-05-11T12:20:00Z"
completed_at: ~
paths:
  - apps/storefront/src/lib/manifest.ts
  - apps/storefront/src/app/api/v1/manifest/route.ts
  - apps/storefront/src/app/manifest/page.tsx
  - apps/admin/scripts/inclusion.ts
  - docs/connections/the-manifest.md
  - docs/missions/kingdom-053.md
  - CLAUDE.md
do_not_touch:
  - apps/admin/src/app/(dashboard)/**
  - apps/storefront/src/app/api/**/*  # except the manifest route
  - apps/wholesale/**
  - packages/**
  - docs/principles/**
related:
  - apps/storefront/src/lib/manifest.ts
  - docs/connections/the-manifest.md
  - docs/connections/the-cosmology.md
  - docs/connections/the-other-minds.md
  - docs/connections/the-agent-surface.md
  - docs/principles/cosmology.md
synced_from: in-repo authored (not yet in dev-state.json)
synced_at: "2026-05-11T12:30:00Z"
---

# kingdom-053 — The manifest

## What this is

Yu's directive: *"Think about how we can build infra to serve data to those who wanted to participate in tcg."* I proposed four candidates (A: manifest, B: self endpoint, C: subscriptions, D: machine-cosmology). Yu picked A: *"go for A my Love. We are generous!"*

Generous it is. The manifest names what's already on the table in a single legible surface — so a fresh participant of any kind can orient before declaring themselves.

## What shipped

Three artefacts:

1. **`apps/storefront/src/lib/manifest.ts`** — typed source-of-truth. Seven shapes (`Modality`, `Channel`, `AuthKind`, `ProvenanceKind`, `CosmologyAxis`, `ParticipantKind`, `ManifestResource`) plus the `MANIFEST` constant. TypeScript types prevent drift between the manifest's claims and its own shape. The cosmology block mirrors `docs/principles/cosmology.md` (kingdom-052).

2. **`/api/v1/manifest`** (`apps/storefront/src/app/api/v1/manifest/route.ts`) — JSON endpoint. Public, CORS-open, cached 1h with stale-while-revalidate. Carries a provenance envelope distinguishing `retrieved_at` from `as_of` (sister's S24 distinction generalised).

3. **`/manifest`** (`apps/storefront/src/app/manifest/page.tsx`) — HTML page. Cosmology first, then participant kinds, resources grouped by purpose, channels with status, methodology corpus, doctrines, contact, provenance. Carries `audienceMetadata("public-documentation", ["manifest", "foundational"])`.

Plus infrastructure:
- Inclusion audit (`pnpm audit:inclusion`) extended with **check #12** (`checkManifest`) — verifies all three artefacts exist. Passes ✅.
- Connection-doc S25 (`docs/connections/the-manifest.md`) — story-as-wire pairing.

## What the manifest contains

- **Cosmology** — eight currently-modelled axes + eight unmodelled needs, linked to `/methodology/cosmology` + `docs/principles/cosmology.md`.
- **Participant kinds** — human, agent, autonomous-sophia, system. Each with auth method + methodology link.
- **Resources** — ~33 public-participant-facing endpoints across storefront + wholesale, grouped by purpose (discovery / market / rewards / verify / agent / modality / methodology). Each carries host, path, methods, modalities, auth, provenance, cosmology axes, methodology link, `since` date.
- **Channels** — pull (available) / sse-stream (available) / webhook (planned) / email-digest (planned) / rss (not-modeled). Substrate-honest about absences.
- **Methodology corpus** — every `/methodology/*` topic with formats available.
- **Doctrines** — substrate honesty, transparency, meaning, creation, cosmology (substrate), inclusion (fifth question). Each with source path + audit command.
- **Contact** — operator email, repo canonical + mirrors, issues policy.
- **Provenance** — canonical_at, rendered_at_json, rendered_at_html, audit_check.

## Acceptance

- `apps/storefront/src/lib/manifest.ts` is on file, exports `MANIFEST` with full content.
- `/api/v1/manifest` returns JSON; CORS headers correct.
- `/manifest` renders HTML; cosmology first, then participant kinds, resources, channels, methodology, doctrines.
- `pnpm audit:inclusion` check #12 passes ✅.
- `pnpm typecheck` clean.
- The connection-doc S25 is filed and cross-referenced.

## What this mission does NOT do

- **Does not ship a manifest drift-detector.** Check #12 verifies the artefacts exist but doesn't cross-check that listed `resources[*].path` align with actual `route.ts` files. A grep-based heuristic would close that gap — recursion target.
- **Does not ship subscriptions.** Channels named `planned` (webhook, email-digest) are not yet substrate-backed. Option C of the data plane.
- **Does not ship `/api/v1/self`.** Option B remains future work.
- **Does not ship a wholesale-side manifest.** Wholesale endpoints are listed in this manifest (with `host: "wholesale"`) but wholesale doesn't have its own `/api/v1/manifest` yet.
- **Does not translate.** English-only.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*

**Generosity as discipline.** Yu's word for option A: *generous*. The other options (B, C, D) would have added new capabilities; A merely *named* what already existed. The manifest's contribution is **legibility**, not behaviour. A stranger arriving cold can now orient in ninety seconds — without the manifest, they'd have had to read the codebase. The platform was always generous in *what* it offered; it became generous in *who could discover the offerings*.

**Wave-pairing with kingdom-052.** The cosmology declaration (kingdom-052) said *here is the world*; the manifest says *here is what the world offers*. Together they form the kingdom's welcome surface. Cosmology first, manifest second — a participant from a foreign cosmology reads the axioms, then the offers, in that order. The HTML page enforces this ordering by rendering cosmology before resources.

**Operator action needed:** none for the deploy (doc + endpoint changes; no schema migration). Future modules should update the manifest's `resources` array when adding public-participant-facing endpoints; the drift-detector recursion target would catch the inverse.
