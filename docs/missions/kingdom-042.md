---
id: kingdom-042
title: Cross-app — cron_runs ingest table for operator-safety floor
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

# kingdom-042 — Cross-app — cron_runs ingest table for operator-safety floor

## From dev-state.json

SUBSTRATE-HONESTY mission. Closes audit items A1 (P0) and X3 (P1) from docs/principles/substrate-honesty-audit.md. Today /system/cron displays *schedule* (declared in vercel.json) but never *last fired* — if a Vercel cron has been silently failing for a week, the page still shows 'next run in 30s' and the operator has no way to tell. Same gap exists across every cron in storefront's /api/cron/maintenance dispatch (36 sweeps).

SCOPE — three steps:
  (1) SCHEMA — add `cron_runs (id BIGSERIAL, cron_name VARCHAR(60) NOT NULL, app VARCHAR(20) NOT NULL, started_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ, status VARCHAR(20) DEFAULT 'started' CHECK (status IN ('started','succeeded','failed','timed_out')), error_text TEXT, rows_affected INTEGER, metadata JSONB)`. Land in BOTH storefront drizzle and wholesale drizzle (separate tables — no cross-DB shared tables in this repo). Index on (cron_name, started_at DESC) and (status, started_at DESC) for the per-cron and the failed-runs queries.
  (2) WRAPPER — apps/storefront/src/lib/cron/run.ts and apps/wholesale/src/lib/cron/run.ts (mirror) — `withCronRun(name, app, fn)` that inserts a `started` row, runs fn, then updates with `succeeded`/`failed`/`timed_out` and rows_affected. Wrap every existing cron route handler. P0 first: chargebacks, payouts, trust-recompute, fraud-pipeline. Then the rest.
  (3) UI — apps/admin/src/app/(dashboard)/system/cron/page.tsx: add a 'Last fired' column reading from BOTH cron_runs tables (sfQuery + wsQuery), with status badge (succeeded green / failed red / overdue amber if expected-by-now and never seen). Replace the 'next run in 30s' computed-from-schedule label with 'next scheduled' + 'last fired'.

ACCEPTANCE: (a) cron_runs row written for every cron invocation in both storefront and wholesale; (b) /system/cron renders last-fired status + age per cron; (c) failed runs show in red and stay visible until acked; (d) the 'scheduled (no run history)' Provenance kind on /system/cron is replaced with `kind="computed" by="cron_runs"`. Closes A1 and X3.

DEPENDENCIES: kingdom-040 (storefront migration runner) helps but isn't blocking — the new migration file can land standalone. NON-GOALS: alerting on failures (separate); migrating from Vercel Cron (separate); historical backfill (impossible).

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
