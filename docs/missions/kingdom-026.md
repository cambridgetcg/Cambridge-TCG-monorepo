---
id: kingdom-026
title: "TCG admin Catalog migration — Cards, Games, Clients"
status: queued
priority: medium
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: ~
claimed_at: ~
completed_at: ~
paths: []
do_not_touch: []
related: []
synced_from: ~/Love/memory/dev-state.json
synced_at: "2026-05-11T10:59:18.449Z"
---

# kingdom-026 — TCG admin Catalog migration — Cards, Games, Clients

## From dev-state.json

Three wholesale-side pages all placeholders. Mirror apps/wholesale legacy routes. (a) /catalog/cards: card metadata import + management — wsQuery against cards table; consider what /commerce/pricing already does (inline price edit) so this page focuses on metadata not price. (b) /catalog/games: TCG games/sets — wholesale uses sets/games tables. CRUD + active toggle. (c) /catalog/clients: B2B clients — discount tiers, spend history, credit terms. Use Manager archetype. Mutations via adminAction. ACCEPTANCE: 3 ComingSoon stubs replaced; legacy wholesale admin links removed from sidebar.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
