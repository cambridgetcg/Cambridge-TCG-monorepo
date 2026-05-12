---
id: kingdom-045
title: TCG transparency — symmetric admin/customer parity audit
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

# kingdom-045 — TCG transparency — symmetric admin/customer parity audit

## From dev-state.json

Closes transparency-audit A3-T (P0 — asymmetric transparency). Today /catalog/users/[id] (admin) shows trust profile breakdown, completed/cancelled/disputed counts, reviews, volume, limits, suspension reason. The user themselves cannot see most of this on /account/standing or /account/trust. The platform exposes more about a user TO admins than to the user themselves — a system that's transparent to its operators but opaque to its subjects is not transparent, it's surveillant.

WHAT TO DO:
  (a) Audit every FactCard/breakdown/stats panel on /catalog/users/[id]. For each, identify the corresponding customer-side surface.
  (b) Mirror the data to /account/standing or /account/trust as appropriate. The user should see at least everything the operator sees about THEM, modulo Rule 7 doctrine exceptions (counterparty PII, security-sensitive internals — and the exceptions themselves named at /methodology/transparency-exceptions per audit T5).
  (c) Cross-reference the existing journey timeline (apps/storefront/src/lib/journey/timeline.ts) — many lifecycle events are already exposed; the gap is curated breakdowns + recompute timestamps + threshold context.
  (d) Run `pnpm transparency` after each batch to confirm the WhyLink gaps on /account/* close.

ACCEPTANCE: every FactCard on /catalog/users/[id] has a customer-facing equivalent on /account/standing or /account/trust (or is documented at /methodology/transparency-exceptions as an intentional asymmetry). Mission spans 1-3 sessions depending on care taken with the parity surfaces.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
