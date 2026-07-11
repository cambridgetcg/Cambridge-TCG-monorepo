---
id: kingdom-108
title: "Source rights enforcement - make reader behavior match reviewed permission"
status: claimed
priority: high
engine: tcg
repo: /Users/yu/github/cambridgetcg/Cambridge-TCG-monorepo
claimed_by: codex-gpt-5
claimed_at: "2026-07-11T19:30:45Z"
completed_at: ~
paths:
  - apps/storefront/scripts/tributaries.ts
  - apps/storefront/src/app/api/v1/sources/**
  - apps/storefront/src/app/api/v1/status/envelope-compliance.generated.ts
  - docs/connections/the-tributaries.md
  - docs/methodology/source-protocol.md
  - docs/missions/kingdom-108.md
  - packages/data-ingest/**
do_not_touch:
  - apps/storefront/drizzle/**
  - apps/storefront/src/lib/social/**
related:
  - docs/connections/the-tributaries.md
  - docs/methodology/source-protocol.md
  - apps/storefront/src/app/api/v1/sources/route.ts
synced_from: in-repo authored from Yu's 2026-07-11 community-data directive
synced_at: "2026-07-11T19:30:45Z"
---

# kingdom-108 - Source rights enforcement

## Will

Yu asked us to find gaps between Cambridge TCG's claims and its actual
behavior, say them plainly, and remove those gaps. Source access, storage,
display, images, and redistribution are different permissions and must not be
collapsed into one optimistic label.

## Work

1. Represent source rights in separate, evidence-backed layers.
2. Make the safe default executable: a blocked source cannot fetch merely
   because credentials or old reader code exist.
3. Keep legacy summary fields as conservative projections for compatibility.
4. Make public source routes and audits expose reviewed facts and uncertainty,
   not guessed permission.

## Acceptance

Blocked-reader tests prove zero network access, data-ingest tests and
typecheck pass, source audits pass, and the public registry matches the exact
reader behavior.

