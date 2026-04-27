-- OG hidden tier for original Cambridge TCG customers

ALTER TABLE tiers ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

INSERT INTO tiers (name, description, icon, color, sort_order, min_annual_spend,
  cashback_percent, points_multiplier, tradein_bonus_percent,
  p2p_commission_rate, auction_commission_rate, auction_priority_approval,
  store_discount_percent, is_paid, is_hidden, benefits)
VALUES (
  'OG',
  'Reserved for original Cambridge TCG customers. You were here from the start.',
  '👑', '#FFD700', 99, 0,
  7, 7.00, 0,
  0.0000, 0.0000, true,
  7.00, false, true,
  '["7% store discount on all purchases", "7% cashback on cash spent", "7x points multiplier", "0% P2P marketplace commission", "0% auction commission", "Priority auction approval", "OG badge on profile", "You were here from the start"]'::jsonb
)
ON CONFLICT (name) DO NOTHING;
