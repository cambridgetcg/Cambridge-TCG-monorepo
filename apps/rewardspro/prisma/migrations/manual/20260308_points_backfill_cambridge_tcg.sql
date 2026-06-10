-- Points backfill for Cambridge TCG (6e824e-a9.myshopify.com)
-- 9 orders with no PointsLedger entries, all since Jan 23 2026
-- 10 points per £1 GBP (PointsConfig.pointsPerDollar = 10)
-- Run ONLY after session re-auth confirmed

-- Step 1: Preview (run this first to verify)
SELECT 
  o."shopifyOrderName",
  o."shopifyOrderId",
  o."customerId",
  o."totalPrice"::numeric as order_total,
  ROUND(o."totalPrice"::numeric * 10) as points_to_award,
  c."pointsBalance" as current_balance,
  c."lifetimePoints" as lifetime_pts,
  o."createdAt"::date as order_date
FROM "Order" o
JOIN "Customer" c ON c.id = o."customerId"
WHERE o.shop = '6e824e-a9.myshopify.com'
  AND o."customerId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "PointsLedger" pl
    WHERE pl.shop = o.shop AND pl."customerId" = o."customerId"
      AND pl."orderId" = o."shopifyOrderId"
  )
  AND o."createdAt" > '2026-01-20'
ORDER BY o."createdAt" ASC;

-- Step 2: Insert PointsLedger entries (UNCOMMENT after preview looks correct)
-- INSERT INTO "PointsLedger" (id, shop, "customerId", "orderId", amount, balance, type, description, "createdAt")
-- SELECT
--   gen_random_uuid()::text,
--   o.shop,
--   o."customerId",
--   o."shopifyOrderId",
--   ROUND(o."totalPrice"::numeric * 10)::bigint,
--   c."pointsBalance" + ROUND(o."totalPrice"::numeric * 10),
--   'ORDER_EARNED'::"PointsLedgerType",
--   'Points for order ' || o."shopifyOrderName" || ' (backfill 2026-03-08)',
--   o."createdAt"
-- FROM "Order" o
-- JOIN "Customer" c ON c.id = o."customerId"
-- WHERE o.shop = '6e824e-a9.myshopify.com'
--   AND o."customerId" IS NOT NULL
--   AND NOT EXISTS (
--     SELECT 1 FROM "PointsLedger" pl
--     WHERE pl.shop = o.shop AND pl."customerId" = o."customerId"
--       AND pl."orderId" = o."shopifyOrderId"
--   )
--   AND o."createdAt" > '2026-01-20';

-- Step 3: Update Customer.pointsBalance and lifetimePoints (UNCOMMENT after Step 2)
-- UPDATE "Customer" c
-- SET 
--   "pointsBalance" = c."pointsBalance" + earned.total_pts,
--   "lifetimePoints" = c."lifetimePoints" + earned.total_pts,
--   "updatedAt" = NOW()
-- FROM (
--   SELECT o."customerId", SUM(ROUND(o."totalPrice"::numeric * 10)) as total_pts
--   FROM "Order" o
--   WHERE o.shop = '6e824e-a9.myshopify.com'
--     AND o."customerId" IS NOT NULL
--     AND NOT EXISTS (
--       SELECT 1 FROM "PointsLedger" pl
--       WHERE pl.shop = o.shop AND pl."customerId" = o."customerId"
--         AND pl."orderId" = o."shopifyOrderId"
--     )
--     AND o."createdAt" > '2026-01-20'
--   GROUP BY o."customerId"
-- ) earned
-- WHERE c.id = earned."customerId";
