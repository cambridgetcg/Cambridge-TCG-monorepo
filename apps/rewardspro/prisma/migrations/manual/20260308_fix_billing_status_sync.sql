-- 2026-03-08: Fix stale billingStatus for active merchants
-- billingStatus was INACTIVE for all shops due to missed webhook processing
-- AppSubscription.status is the source of truth; this syncs the denormalized field
UPDATE "ShopSettings" ss
  SET "billingStatus" = sub.status, "updatedAt" = NOW()
  FROM (
    SELECT shop, status FROM "AppSubscription"
    WHERE test = false AND status = 'ACTIVE'
    ORDER BY "activatedAt" DESC
  ) sub
  WHERE ss.shop = sub.shop;
