-- CTCG Pro — an affordable paid membership tier (£3.99/mo or £29.99/yr).
--
-- Per Yu (2026-06-06): the quickest honest recurring-revenue win. Fully
-- ADDITIVE — a single new row in `tiers`. Touches NO existing tier and NO
-- current subscriber. The generic subscribe route
-- (/api/membership/subscribe), the Stripe webhook, and recalculateTier()
-- already handle any is_paid tier, so NO code is needed to bill it.
--
-- sort_order 2.5 places Pro between Gold (2) and Platinum (3). The perks
-- below are conservative and live the moment this runs — but they are just
-- columns: tune any of them with a one-line UPDATE, no redeploy.
--
-- Value prop (honest, nothing taken away from free users):
--   • 5% off every store order        • lower selling fees (7% P2P / 10% auction
--   • 1.5x Berries on purchases          vs the standard 8% / 12%)
--   • 1% cashback to store credit      • 5% extra trade-in credit
--   • early access to restocks
--
-- Free floor (fifth question): you also reach Pro for free at £300/yr spend,
-- so the paid tier is a shortcut, never a wall.

INSERT INTO tiers (
  name, description, icon, color, sort_order, min_annual_spend,
  cashback_percent, points_multiplier, tradein_bonus_percent,
  p2p_commission_rate, auction_commission_rate, auction_priority_approval,
  store_discount_percent, is_paid, monthly_price, annual_price, benefits, is_active
) VALUES (
  'Pro',
  'Affordable membership — 5% off every order, lower selling fees, early access to restocks. £3.99/mo or £29.99/yr (or free at £300/yr spend).',
  '⭐', '#38bdf8', 2.5, 300,
  1.00, 1.50, 5.00,
  0.0700, 0.1000, false,
  5.00, true, 3.99, 29.99,
  '["5% off every store order","Lower selling fees: 7% P2P (vs 8%) and 10% auction (vs 12%)","1.5x Berries on purchases","1% cashback to store credit","5% extra trade-in credit","Early access to restocks"]'::jsonb,
  true
)
ON CONFLICT (name) DO NOTHING;
