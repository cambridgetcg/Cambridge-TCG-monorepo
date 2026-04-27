-- Wishlist matching adds one column for the sweep's re-fire cooldown.
-- Same pattern as portfolio_price_alerts.last_notified_at — one stamp per
-- wishlist row prevents a hot P2P listing from spamming the wisher.

ALTER TABLE wishlists ADD COLUMN IF NOT EXISTS last_matched_at TIMESTAMPTZ;
