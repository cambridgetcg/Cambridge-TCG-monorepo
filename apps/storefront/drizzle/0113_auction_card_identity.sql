-- 0113_auction_card_identity.sql
--
-- Auction parity (kingdom-102): auctions finally know which card they sell.
-- Before this, an auction had only a free-text `title` — so it had no
-- reference price, could never appear on its own card's /market or /prices
-- page, could not feed wishlist matching, and its portfolio realize-on-
-- completion read a `set_code` column that never existed (silently no-op'd
-- for every completed auction — see the fulfilment.ts fix in the same wave).
--
-- The order-book market already resolves an exact printing + condition on
-- every listing (market_orders.sku / .condition). Auctions now carry the
-- same two facts, resolved from the catalog card-picker on /auctions/sell,
-- so the whole card-identity + reference-price machinery the market just
-- gained (lib/market/catalog-card.ts, reference-price.ts) works on auctions
-- verbatim.
--
-- NULLABLE: the 6 pre-pivot demo auctions carry no card identity and are
-- left null — they predate the collectors-first market and will never
-- settle again. Every new auction sets both.

ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS sku       VARCHAR(60),
  ADD COLUMN IF NOT EXISTS condition VARCHAR(10);

CREATE INDEX IF NOT EXISTS idx_auctions_sku ON auctions (sku) WHERE sku IS NOT NULL;

COMMENT ON COLUMN auctions.sku IS
  'The exact card printing this auction sells (canonical SKU, resolved from the catalog on /auctions/sell). Mirrors market_orders.sku so card identity + reference price resolve the same way. NULL only for the pre-2026-07 demo auctions.';
COMMENT ON COLUMN auctions.condition IS
  'Graded/played condition of the card (NM/LP/MP/HP/DMG), mirroring market_orders.condition. NULL only for the pre-2026-07 demo auctions.';
