-- 0105_trade_shipping_address.sql
--
-- Global free trade (kingdom-096): P2P trades finally collect the buyer's
-- shipping address. The pay session asks Stripe Checkout for it
-- (shipping_address_collection, global country list); the webhook persists
-- what Stripe collected here; the seller sees it on the trade page and in
-- the seller-paid email — the promise that email has made since day one
-- ("which address to ship to"), finally kept. Before this column the
-- de-facto logistics channel was the trades API leaking both parties'
-- emails; that leak closes in the same release.
--
-- Shape: a flat JSONB object mirroring Stripe's collected_information.
-- shipping_details — { name, line1, line2, city, state, postal_code,
-- country }. All keys optional; NULL = no address collected (pre-existing
-- trades, or a pay session created before this migration ran). Visible
-- only to the trade's own participants — never on public surfaces.

ALTER TABLE market_trades
  ADD COLUMN IF NOT EXISTS shipping_address JSONB;

COMMENT ON COLUMN market_trades.shipping_address IS
  'Buyer''s shipping address as collected by Stripe Checkout at pay time (collected_information.shipping_details, flattened). Keys: name, line1, line2, city, state, postal_code, country — all optional. NULL = collected before migration 0105 / not yet paid. Participant-only; the seller''s ship-to surface.';
