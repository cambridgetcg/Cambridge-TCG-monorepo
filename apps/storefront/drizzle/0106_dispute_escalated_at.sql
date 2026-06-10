-- Dispute SLA escalation — add the escalated_at lifecycle timestamp.
--
-- Migration 0057 added under_review_at / awaiting_evidence_at / withdrawn_at,
-- but 'escalated' (already a status the admin queue selects on:
-- `status IN ('open','escalated')`) had no timestamp column.
--
-- The dispute-SLA sweep (lib/trust/dispute-sla-sweep.ts, wired into
-- /api/cron/maintenance) auto-escalates disputes that have sat in 'open'
-- past their response window (the trade's dispute_window_hours, default 72h)
-- with no admin triage. This column anchors the escalation step on the
-- customer/admin timeline and gives the sweep an honest audit stamp.
--
-- SAFETY: escalation is a status + priority change only. No money moves —
-- an admin still resolves every dispute via resolveDispute().

BEGIN;

ALTER TABLE trade_disputes
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

-- Backfill: rows already in 'escalated' get their stamp from updated_at as
-- the best available approximation (mirrors the 0057 backfill pattern).
UPDATE trade_disputes SET escalated_at = updated_at
  WHERE escalated_at IS NULL AND status = 'escalated';

COMMIT;
