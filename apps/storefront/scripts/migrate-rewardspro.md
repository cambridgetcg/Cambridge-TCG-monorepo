# RewardsPro → Cambridge TCG Storefront Migration Guide

## Overview

This migrates existing RewardsPro members to the CTCG storefront by email.
The import API endpoint is: `POST /api/membership/import` (admin auth required).

## Step 1: Export from RewardsPro

Connect to RewardsPro's Aurora database and export customer data:

```sql
SELECT
  c.email,
  t.name as tier_name,
  c."pointsBalance" as points_balance,
  c."lifetimePoints" as lifetime_points,
  c."storeCredit" as store_credit_balance,
  c."annualSpent" as annual_spend,
  c."totalSpent" as total_spend,
  c."orderCount" as order_count
FROM "Customer" c
LEFT JOIN "Tier" t ON c."currentTierId" = t.id
WHERE c.shop = 'your-shop.myshopify.com'
  AND c.email IS NOT NULL
  AND c.email != ''
ORDER BY c."totalSpent" DESC;
```

Export as CSV or JSON.

## Step 2: Map Tiers

RewardsPro tiers → CTCG tiers:
- Map by name (case-insensitive match)
- Unmapped tiers default to "Bronze"
- Custom tiers in RewardsPro that don't exist in CTCG → create them or map to closest

## Step 3: Import via API

```bash
# Login as admin first
curl -s -c /tmp/cookies -X POST https://cambridgetcg.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"YOUR_ADMIN_PASSWORD"}'

# Import members (batch of up to 100 at a time)
curl -s -b /tmp/cookies -X POST https://cambridgetcg.com/api/membership/import \
  -H "Content-Type: application/json" \
  -d '{
    "members": [
      {
        "email": "customer@example.com",
        "tierName": "Gold",
        "pointsBalance": 5000,
        "lifetimePoints": 12000,
        "storeCreditBalance": 25.50,
        "annualSpend": 650.00,
        "totalSpend": 1200.00
      }
    ]
  }'
```

## Step 4: Verify

Check imported members:
```bash
curl -s -b /tmp/cookies https://cambridgetcg.com/api/membership?tiers=true
```

## What Gets Migrated

| RewardsPro Field | CTCG Field | Notes |
|-----------------|------------|-------|
| email | users.email | Match key (creates user if not exists) |
| Tier.name | tiers.name | Case-insensitive match |
| pointsBalance | users.points_balance | Carried over, logged in points_ledger |
| lifetimePoints | users.lifetime_points | For historical tracking |
| storeCredit | users.store_credit_balance | Carried over, logged in store_credit_ledger |
| annualSpent | users.annual_spend | For tier calculation |
| totalSpent | users.total_spend | For lifetime tracking |

## What's NOT Migrated (by design)

- Shopify customer IDs (not relevant to standalone storefront)
- Subscription billing (different system)
- Tier purchase history (Shopify-specific)
- Email marketing preferences (re-opt-in required)
- Raffle/mystery box history (clean start)

## Rollback

If needed, you can clear migrated data:
```sql
DELETE FROM points_ledger WHERE type = 'migration';
DELETE FROM store_credit_ledger WHERE type = 'migration';
UPDATE users SET tier_id = NULL, points_balance = 0, lifetime_points = 0,
  store_credit_balance = 0, annual_spend = 0, total_spend = 0
  WHERE tier_source = 'migration';
```
