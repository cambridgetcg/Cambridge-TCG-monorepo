-- 0111_market_order_return_window.sql
--
-- Per-listing return window. Migration 0070 gave sellers a per-listing
-- accepts_returns opt-in and gave market_trades a return_window_days
-- snapshot column (default 14), but the listing itself had no window
-- column — a seller could opt into returns yet had nowhere to declare
-- for how long, so every trade silently inherited the trade-side
-- default. This adds the listing-side column that the ask form and
-- POST /api/market/orders persist, and that trade creation (both the
-- order-match path and offer acceptance) snapshots onto
-- market_trades.return_window_days.
--
-- Bounds (1–60 days) are enforced at the API; the column default of 14
-- mirrors the trade-side default so existing rows keep today's behaviour.

BEGIN;

ALTER TABLE market_orders
  ADD COLUMN IF NOT EXISTS return_window_days INTEGER NOT NULL DEFAULT 14;

COMMENT ON COLUMN market_orders.return_window_days IS
  'Seller-chosen return window (days) for this listing. Snapshotted onto market_trades.return_window_days at trade creation; meaningful only when accepts_returns is true.';

COMMIT;
