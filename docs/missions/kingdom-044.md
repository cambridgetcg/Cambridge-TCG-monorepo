---
id: kingdom-044
title: Storefront — close lifecycle-log gaps for derived-state tables
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

# kingdom-044 — Storefront — close lifecycle-log gaps for derived-state tables

## From dev-state.json

SUBSTRATE-HONESTY mission. Closes audit item X2 (P1 with one P0 sub-item). The principle: status columns are caches; *_lifecycle_log tables are the substrate. Most domains have logs (chargeback_lifecycle_log, refund_lifecycle_log, market_trade_lifecycle_log, etc.). Gaps:
  - **trust_profiles** (P0 — financial routing depends on trust_score; recompute history is currently invisible). Add `trust_score_lifecycle_log` with (id, user_id, before_score, after_score, recomputed_by VARCHAR (cron_name | 'admin_override' | 'event_<reason>'), reason TEXT, components JSONB, recomputed_at TIMESTAMPTZ). Wire trust-recompute sweep to append on every change.
  - **portfolio_snapshots** (P1 — no audit trail of which inputs produced a snapshot). Add `portfolio_snapshot_lifecycle_log` capturing input version (price-snapshot id, holdings hash) per snapshot.
  - **users.subscription_status / paid_tier_id** (P1 — membership tier changes drive commission). Add `subscription_lifecycle_log` (user_id, before_tier, after_tier, source VARCHAR ('stripe_webhook'|'admin_grant'|'auto_recompute'), stripe_event_id, ...).
  - **user_email_preferences** (P1 — GDPR-relevant consent changes). Add `user_email_preferences_lifecycle_log` (user_id, before, after, changed_via, ip_hash, ts).

SCOPE: four migrations + four log-append wrappers + a section in /catalog/users/[id] to surface the trust-recompute history (most operationally valuable of the four).

ACCEPTANCE: (a) trust score recompute appends a log row including before/after and components; (b) /catalog/users/[id] renders the recompute history under the trust-profile section; (c) the other three logs exist + are populated by their natural write paths; (d) docs/principles/substrate-honesty-audit.md X2 marked closed.

DEPENDENCIES: kingdom-040 (storefront migration apply) blocks landing the new migrations to production; can be developed against dev RDS in parallel. NON-GOALS: reading the logs into customer-facing surfaces (separate); GDPR data-export reading from these (separate).

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
