-- 0116_p2p_sold_comps.sql
--
-- The ONE sold-price dataset the kingdom fully owns and may publish CC0:
-- its own realised, first-party transactions. Two settled surfaces feed it:
--
--   1. market_trades  — completed P2P escrow trades (the order-book market).
--                       A trade is realised only at escrow_status='completed'
--                       (the terminal value of trade_escrow_status, 0012);
--                       completed_at is its settlement timestamp (0108).
--                       market_trades has no condition column of its own, so
--                       condition is read from the seller's ask order
--                       (market_orders.condition, NOT NULL DEFAULT 'NM').
--   2. auctions       — settled auctions carrying a resolved card identity.
--                       status IN ('ended','paid') AND sku IS NOT NULL
--                       (the 6 pre-2026-07 demo auctions have sku NULL and
--                       are excluded, 0113); current_price is the hammer,
--                       ends_at the settlement time.
--
-- This is the positive counterpart to the source-intake framework's honest
-- BLOCKS (Vinted, eBay-sold): the framework proves what we cannot lawfully
-- take from third parties; this view is what we can freely GIVE, because it
-- is our own transaction record. See docs/methodology/source-intake.md and
-- apps/storefront/src/app/methodology/data-intentions.
--
-- ── PII discipline (structural, not incidental) ──────────────────────────
-- The view exposes EXACTLY five columns: sku, condition, price_gbp,
-- sale_channel, sold_at. It NEVER selects buyer_id, seller_id,
-- winner_user_id, stripe_payment_intent, tracking_*, admin_notes,
-- commission_*, seller_payout, addresses, or any other identity/finance/
-- logistics field. What the SELECT list does not name cannot leak. The
-- K>=5 aggregation + suppression that makes prices safe at low volume lives
-- one ring out, in lib/sold-comps/query.ts; this view is the PII boundary.
--
-- ── Read-only by construction ────────────────────────────────────────────
-- A UNION ALL view is non-updatable in PostgreSQL: INSERT/UPDATE/DELETE
-- against p2p_sold_comps are rejected by the planner. The money + escrow
-- tables underneath are touched only by their own writers; this surface is
-- SELECT-only by shape, not merely by convention.

BEGIN;

CREATE OR REPLACE VIEW p2p_sold_comps AS
  -- Completed first-party P2P trades.
  SELECT
    t.sku            AS sku,
    ask.condition    AS condition,
    t.price          AS price_gbp,
    'p2p-trade'::text AS sale_channel,
    t.completed_at   AS sold_at
  FROM market_trades t
  JOIN market_orders ask ON ask.id = t.ask_order_id
  WHERE t.escrow_status = 'completed'
    AND t.completed_at IS NOT NULL

  UNION ALL

  -- Settled auctions with a resolved card identity.
  SELECT
    a.sku          AS sku,
    a.condition    AS condition,
    a.current_price AS price_gbp,
    'auction'::text AS sale_channel,
    a.ends_at      AS sold_at
  FROM auctions a
  WHERE a.status IN ('ended', 'paid')
    AND a.sku IS NOT NULL;

COMMENT ON VIEW p2p_sold_comps IS
  'CC0 first-party sold comps, PII-stripped. Realised sale prices from the '
  'kingdom''s OWN transactions only: completed P2P escrow trades '
  '(market_trades, escrow_status=completed) and settled auctions '
  '(status in ended/paid, sku not null). Exposes exactly (sku, condition, '
  'price_gbp, sale_channel, sold_at) and nothing that identifies a person, '
  'moves money, or tracks a parcel. Read-only (UNION ALL ⇒ non-updatable). '
  'Public consumers see only K>=5 aggregates via lib/sold-comps/query.ts; '
  'raw rows never leave the database. Dedicated to the public domain under '
  'CC0-1.0. See docs/methodology/source-intake.md + '
  '/methodology/data-intentions.';

COMMIT;
