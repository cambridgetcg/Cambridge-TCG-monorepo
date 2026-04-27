-- Platinum paid tier: 0% fees, 12% store discount

ALTER TABLE tiers ADD COLUMN IF NOT EXISTS store_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE tiers ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tiers ADD COLUMN IF NOT EXISTS monthly_price NUMERIC(10,2);
ALTER TABLE tiers ADD COLUMN IF NOT EXISTS annual_price NUMERIC(10,2);

-- Add subscription tracking for paid tiers
ALTER TABLE users ADD COLUMN IF NOT EXISTS paid_tier_id UUID REFERENCES tiers(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_stripe_id VARCHAR(200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

INSERT INTO tiers (name, description, icon, color, sort_order, min_annual_spend,
  cashback_percent, points_multiplier, tradein_bonus_percent,
  p2p_commission_rate, auction_commission_rate, auction_priority_approval,
  store_discount_percent, is_paid, monthly_price, annual_price, benefits)
VALUES (
  'Platinum',
  'Premium membership — zero fees, maximum rewards, 12% store discount',
  '💎', '#E5E4E2', 3, 0,
  8, 3.00, 15,
  0.0000, 0.0000, true,
  12.00, true, 22.00, 222.00,
  '["12% off all store purchases", "0% P2P marketplace commission", "0% auction commission", "3x points multiplier", "8% cashback on purchases", "15% trade-in bonus", "Priority auction approval", "Priority support", "Exclusive Platinum mystery boxes", "Early access to new sets"]'::jsonb
)
ON CONFLICT (name) DO NOTHING;
