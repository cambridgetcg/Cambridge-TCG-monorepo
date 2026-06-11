-- Set test shop to Pro plan
-- Change 'RewardsPro Pro' to any plan: 'RewardsPro Free', 'RewardsPro Max', 'RewardsPro Ultra'

-- Update ShopSettings
UPDATE "ShopSettings"
SET
  "currentPlan" = 'RewardsPro Pro',
  "billingStatus" = 'ACTIVE',
  "updatedAt" = NOW()
WHERE shop = 'teststore12062025.myshopify.com';

-- Verify the change
SELECT shop, "currentPlan", "billingStatus", "updatedAt"
FROM "ShopSettings"
WHERE shop = 'teststore12062025.myshopify.com';
