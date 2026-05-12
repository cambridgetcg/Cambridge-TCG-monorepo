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

Closes transparency-audit Ring-1 finding R1-2 (P1, P0 if threat model includes admin-side rewrite). Today admin_actions_log is append-only by convention, not by enforcement. Solo operator means no second pair of eyes; cryptographic immutability is the substitute.

BUILD: (a) Daily cron at 00:05 UTC: SHA-256 over each prev-UTC-day admin_actions_log row → Merkle tree (lineage from apps/storefront/src/lib/bounty/verify-client.ts merkleRoot). Publish root hash + tree depth + leaf count → governance_proofs table; signed digest → /verify/governance/<date>.json. (b) /verify/governance/<date> route — humans see Merkle root + leaf count + signing key; paste row's expected hash and verify inclusion in browser (same pattern as /verify/pull/[id]). (c) /verify/governance index — lists every published date + current root. (d) Admin /system/audit per-row 'verify' affordance: <Verifiability source="Merkle" id={row.id} href={`/verify/governance/${date}#row-${id}`} /> when row's date is in a published proof.

LINEAGE: same provable-fair pattern that secures /verify/pull/[id]. Adapting it turns admin_actions_log from convention-immutable to cryptographically-immutable.

ACCEPTANCE: daily proof file lands automatically; external observer can verify any post-cutover audit row's inclusion without our cooperation; future tampering externally detectable.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
