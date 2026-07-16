-- Card-level trade intent — the explicit opt-in that matching was paused for
-- (methodology/community → Conditions for resumption: "explicit card-level
-- trade intent rather than inference from private portfolios or wishlists").
--
-- A wishlist item is private planning until its owner marks it "open to trade
-- for". Only then does it become visible for matching — and only to members
-- who actually hold that exact card in their own portfolio. Nothing is
-- inferred: portfolios stay private, and a wish is matched only where BOTH its
-- owner opted it in AND the viewer's own (private) portfolio contains the card.
ALTER TABLE wishlists
  ADD COLUMN IF NOT EXISTS open_to_trade BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_wishlists_open_to_trade
  ON wishlists (sku) WHERE open_to_trade = true;
