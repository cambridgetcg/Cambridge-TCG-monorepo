---
id: kingdom-048
title: TCG transparency — governance Merkle root publication
status: queued
priority: high
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

# kingdom-048 — TCG transparency — governance Merkle root publication

## From dev-state.json

Addresses transparency-audit Ring-1 finding R1-2 (P1, P0 if threat model includes admin-side rewrite). Today `admin_actions_log` is append-only by convention, not by enforcement. A Merkle root adds inclusion and consistency evidence; it is not immutable unless an independent party or channel retains the earlier root.

BUILD: (a) Daily cron at 00:05 UTC: SHA-256 over each previous-UTC-day `admin_actions_log` row → Merkle tree. Store root hash + tree depth + leaf count in `governance_proofs`, sign it, and publish it both at `/verify/governance/<date>.json` and through a channel retained outside platform control. (b) `/verify/governance/<date>` — humans see root + leaf count + signing key and can check row inclusion. (c) `/verify/governance` index — lists every published date + current root. (d) Admin `/system/audit` per-row verification affordance when the row's date has a root.

LINEAGE: reuse the draw receipt's Merkle mechanics, but add an independent publication channel. This makes later disagreement detectable relative to retained roots; it does not make the database cryptographically immutable.

ACCEPTANCE: daily evidence file lands automatically in both platform and independent locations; an external observer with a retained root can verify covered row inclusion and detect a conflicting later presentation without relying on the live feed alone.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
