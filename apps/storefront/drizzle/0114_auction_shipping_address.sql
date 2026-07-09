-- 0114_auction_shipping_address.sql
--
-- Auction parity (kingdom-102): auction winners' shipping addresses are
-- finally collected, stored, and shown to the seller — closing the exact
-- gap migration 0105 closed for P2P trades. Before this, an auction winner
-- paid through Stripe Checkout but no address was ever collected; the seller
-- was told to ship with a tracking number to an address they had no way to
-- learn (the personas had to fall back to a DM). The auction pay route now
-- asks Stripe for shipping_address_collection (same global country list as
-- the trade pay route); the webhook persists what Stripe collected here; the
-- seller sees it on the winner-fulfilment panel and in the seller-paid email.
--
-- Shape mirrors market_trades.shipping_address (0105) exactly: a flat JSONB
-- object from Stripe's collected_information.shipping_details — { name,
-- line1, line2, city, state, postal_code, country }, all keys optional.
-- NULL = collected before this migration / not yet paid. Participant-only;
-- never on public auction surfaces.

ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS shipping_address JSONB;

COMMENT ON COLUMN auctions.shipping_address IS
  'Auction winner''s shipping address as collected by Stripe Checkout at pay time (collected_information.shipping_details, flattened). Keys: name, line1, line2, city, state, postal_code, country — all optional. NULL = paid before migration 0114 / not yet paid. Participant-only; the seller''s ship-to surface. Mirrors market_trades.shipping_address.';
