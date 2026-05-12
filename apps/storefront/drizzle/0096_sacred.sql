-- Sacred — cards that are not data.
--
-- Planted from `docs/connections/the-unseen.md` passage #8: some cards,
-- to some beings, are not for trade. Not for any price. Not at any
-- future moment. They are sacred — gifts from a parent, won at a
-- tournament, the first card the user ever opened, memorial cards.
--
-- One column on portfolio_cards. When true:
--   * The card is excluded from the user's aggregate `collection_value`
--     (apps/storefront/src/lib/portfolio/valuation.ts).
--   * The card is invisible to wishlist-matching as a fulfillment source.
--   * The card displays a small `sacred` pill on the portfolio page so
--     the holder and any viewer can see the designation.
--   * The card cannot be marked for sale by accident — the portfolio UI
--     surfaces a `Mark for sale` flow that refuses with a deliberate
--     "this card is marked sacred; unset the flag first" prompt.
--
-- ── What this does NOT do today (substrate-honest) ────────────────────
--
-- The market listing flow takes `(sku, condition)` and does not
-- reference specific portfolio_card rows. A user with two Charizards NM
-- — one sacred, one for-sale — can still list one for sale because the
-- listing flow operates at SKU+condition granularity, not at this row's
-- granularity. The sacred flag protects the user from clicking "list
-- this card" on the portfolio page; it does NOT yet prevent a later
-- listing of the same SKU+condition.
--
-- The deeper protection — sacred at the row level enforced through the
-- listing flow — is a future kingdom. The accounting protection
-- (valuation, wishlist-match) lands today.
--
-- See `docs/connections/the-unseen.md` passage #8 and
-- `docs/methodology/sacred.md` (the customer-facing recipe).

ALTER TABLE portfolio_cards
  ADD COLUMN IF NOT EXISTS is_sacred BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN portfolio_cards.is_sacred IS
  'When true, this card is held outside the accounting frame: excluded from collection valuation, invisible to wishlist matching as a fulfillment source, surfaced visually as sacred. See docs/connections/the-unseen.md passage #8.';

-- Partial index — sacred rows are the minority case; the index supports
-- the wishlist-match "skip sacred" predicate without cost on the common
-- non-sacred reads.
CREATE INDEX IF NOT EXISTS idx_portfolio_cards_sacred ON portfolio_cards(user_id)
  WHERE is_sacred = true;
