# Tier Purchase Flow - Complete Explanation

**Date**: January 2025
**Issue Fixed**: Active purchases not showing - missing `shopifyOrderId` and `startDate` in response

---

## 🔍 The Problem You Encountered

**Symptom**: "No active tier purchases found" even though customer has purchases

**Root Cause**: Backend `check-purchases` action was missing fields that the UI expected

**Fix Applied**: Added `shopifyOrderId` and `startDate` to `activePurchases` response (line 417-418)

---

## 📊 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    TIER PURCHASE LIFECYCLE                      │
└─────────────────────────────────────────────────────────────────┘

1️⃣ PURCHASE CREATION (Two paths)
   │
   ├─ A) Real Shopify Order (Production)
   │  └─ webhooks.orders.paid.tsx
   │     ├─ Shopify sends webhook when order is paid
   │     ├─ Loop through line items
   │     ├─ Check if item matches tier product (by productId/variantId/SKU)
   │     └─ Create TierPurchase record in database
   │
   └─ B) Test Simulation (Test Page)
      └─ app.test-tier-products.tsx (lines 254-275)
         ├─ User clicks "Simulate Purchase"
         ├─ Manually create TierPurchase record
         └─ Use test order ID: `test-order-${Date.now()}`

2️⃣ TIERPURCHASE DATABASE RECORD
   │
   ├─ Table: TierPurchase
   ├─ Fields Created:
   │  ├─ id: UUID
   │  ├─ shop: Store domain (CRITICAL for multi-tenant isolation)
   │  ├─ customerId: Who bought it
   │  ├─ tierId: Which tier they get
   │  ├─ tierProductId: Which product was purchased
   │  ├─ shopifyOrderId: Link to Shopify order
   │  ├─ shopifyLineItemId: Link to specific line item
   │  ├─ purchasePrice: What they paid
   │  ├─ currency: USD, EUR, etc.
   │  ├─ startDate: When tier access starts
   │  ├─ endDate: When tier expires (null = LIFETIME)
   │  ├─ status: ACTIVE, EXPIRED, REFUNDED
   │  ├─ metadata: JSON with extra info
   │  ├─ createdAt: Record creation timestamp
   │  └─ updatedAt: Last modified timestamp
   │
   └─ Duration Calculation (lines 234-251):
      ├─ MONTHLY → endDate = startDate + 1 month
      ├─ ANNUAL → endDate = startDate + 1 year
      └─ LIFETIME → endDate = null

3️⃣ TIER RESOLUTION (Assign tier to customer)
   │
   └─ updateCustomerToEffectiveTier() called (line 278)
      └─ app/services/tier-resolution.server.ts
         ├─ Check 4 tier sources (priority order):
         │  1. Manual Override (Priority 1) - Admin assignments
         │  2. Tier Subscription (Priority 2) - Recurring subscriptions
         │  3. Tier Purchase (Priority 3) - One-time purchases ← WE ARE HERE
         │  4. Spending-Based (Priority 4) - Calculated from orders
         │
         ├─ Find ACTIVE tier purchases:
         │  └─ WHERE status = 'ACTIVE'
         │     AND (endDate IS NULL OR endDate >= NOW())
         │
         ├─ If multiple purchases, pick highest minSpend tier
         ├─ Compare with other sources
         └─ Update customer.currentTierId to winning tier

4️⃣ FETCHING PURCHASES (Check Purchase State)
   │
   └─ app.test-tier-products.tsx - "check-purchases" action (lines 341-436)
      │
      ├─ A) Fetch ALL Purchases (line 358-362):
      │  └─ db.tierPurchase.findMany({
      │       where: { customerId, shop },
      │       include: { tier: true, tierProduct: true },
      │       orderBy: { createdAt: 'desc' }
      │     })
      │  └─ Returns: ALL purchases regardless of status
      │
      ├─ B) Fetch ACTIVE Purchases (lines 365-378):
      │  └─ db.tierPurchase.findMany({
      │       where: {
      │         customerId,
      │         shop,
      │         status: 'ACTIVE', ← MUST be ACTIVE
      │         OR: [
      │           { endDate: null },        ← LIFETIME purchases
      │           { endDate: { gte: now } } ← Not expired yet
      │         ]
      │       },
      │       include: { tier: true, tierProduct: true }
      │     })
      │  └─ Returns: Only purchases that are currently active
      │
      └─ C) Fetch Tier Subscriptions (lines 381-385):
         └─ db.tierSubscription.findMany({
              where: { customerId, shop },
              include: { tier: true }
            })
         └─ Returns: All tier subscriptions (active/paused/cancelled)

5️⃣ RESPONSE DATA (What gets returned to UI)
   │
   ├─ allPurchases: (lines 400-413)
   │  └─ ALL tier purchases with full details:
   │     ├─ tierName, shopifyOrderId, purchasePrice
   │     ├─ startDate, endDate, status
   │     ├─ isExpired (calculated: endDate < now)
   │     └─ daysRemaining (calculated: days until expiry)
   │
   ├─ activePurchases: (lines 414-421) ← FIXED IN THIS COMMIT
   │  └─ Only ACTIVE purchases with:
   │     ├─ tierName
   │     ├─ shopifyOrderId ← ADDED (was missing!)
   │     ├─ startDate ← ADDED (was missing!)
   │     ├─ endDate
   │     └─ daysRemaining
   │
   ├─ subscriptions: (lines 422-426)
   │  └─ Tier subscriptions with:
   │     ├─ tierName, status
   │     ├─ billingInterval (MONTHLY/ANNUAL)
   │     └─ currentPeriodEnd
   │
   └─ summary: (lines 427-433)
      └─ Statistics:
         ├─ totalPurchases
         ├─ activePurchases
         ├─ expiredPurchases
         ├─ refundedPurchases
         └─ activeSubscriptions

6️⃣ UI DISPLAY (Results Tab)
   │
   └─ Lines 1186-1338
      ├─ Customer Summary Card
      ├─ Purchase Summary Card (totals with badges)
      ├─ Active Purchases Table ← Uses activePurchases data
      ├─ All Purchase History Table ← Uses allPurchases data
      └─ Tier Subscriptions Table ← Uses subscriptions data
```

---

## 🔍 Why Active Purchases Might Not Show

### ✅ FIXED: Missing Fields in Response
**Before (Bug)**:
```typescript
activePurchases: activeTierPurchases.map(p => ({
  id: p.id,
  tierName: p.tier.name,
  endDate: p.endDate?.toISOString() || 'LIFETIME',
  daysRemaining: p.endDate ? Math.ceil(...) : null
}))
```

**After (Fixed)**:
```typescript
activePurchases: activeTierPurchases.map(p => ({
  id: p.id,
  tierName: p.tier.name,
  shopifyOrderId: p.shopifyOrderId,  // ← ADDED
  startDate: p.startDate.toISOString(), // ← ADDED
  endDate: p.endDate?.toISOString() || null,
  daysRemaining: p.endDate ? Math.ceil(...) : null
}))
```

**Why This Caused "No Active Purchases"**:
- UI expected `shopifyOrderId` and `startDate` fields
- Backend wasn't returning them
- DataTable tried to display `undefined` values
- Could have caused render errors or empty display

### Other Possible Reasons (Check These)

#### 1️⃣ **Status Not Set to ACTIVE**
```typescript
// Check in database:
SELECT status FROM TierPurchase WHERE customerId = '...';

// If status is NOT 'ACTIVE', purchase won't show
// Possible values: ACTIVE, EXPIRED, REFUNDED
```

**Fix**: Update status
```typescript
await db.tierPurchase.update({
  where: { id: purchaseId },
  data: { status: 'ACTIVE' }
});
```

#### 2️⃣ **endDate Already Expired**
```typescript
// Active query checks:
WHERE endDate IS NULL OR endDate >= NOW()

// If endDate < NOW(), purchase is considered expired
```

**Example**:
```typescript
// Purchase created:
startDate: 2024-01-01
endDate: 2024-02-01 (1 month)

// Today: 2025-01-06
// Result: endDate < now → NOT included in active purchases
```

**Fix**: Check `allPurchases` instead - it shows ALL purchases with expiration status

#### 3️⃣ **Wrong customerId**
```typescript
// Make sure you're checking the right customer
// Query uses exact match on customerId
```

**Debug**:
```typescript
console.log('Checking purchases for customer:', customerId);
const allPurchases = await db.tierPurchase.findMany({
  where: { customerId, shop }
});
console.log('Found purchases:', allPurchases.length);
```

#### 4️⃣ **Missing shop Scope**
```typescript
// ALWAYS include shop in queries!
where: {
  customerId: '...',
  shop: '...' // ← REQUIRED for multi-tenant isolation
}
```

If `shop` doesn't match, no results returned.

#### 5️⃣ **Purchase Created in Different Shop**
```typescript
// In development/testing, you might have multiple shop instances
// Purchase might be in shop1.myshopify.com
// But you're querying shop2.myshopify.com
```

**Fix**: Check which shop the purchase belongs to
```sql
SELECT shop, customerId, status, endDate
FROM TierPurchase
WHERE customerId = '...';
```

---

## 🧪 Debugging Checklist

### Step 1: Check if ANY purchases exist
```typescript
const allPurchases = await db.tierPurchase.findMany({
  where: { customerId, shop }
});
console.log('Total purchases:', allPurchases.length);
console.log('Purchases:', allPurchases);
```

### Step 2: Check purchase status
```typescript
allPurchases.forEach(p => {
  console.log({
    id: p.id,
    status: p.status,
    startDate: p.startDate,
    endDate: p.endDate,
    isExpired: p.endDate ? p.endDate < new Date() : false
  });
});
```

### Step 3: Check active purchase query
```typescript
const now = new Date();
const activePurchases = await db.tierPurchase.findMany({
  where: {
    customerId,
    shop,
    status: 'ACTIVE',
    OR: [
      { endDate: null },
      { endDate: { gte: now } }
    ]
  }
});
console.log('Active purchases:', activePurchases.length);
```

### Step 4: Check tier resolution
```typescript
import { resolveEffectiveTier } from '~/services/tier-resolution.server';

const resolution = await resolveEffectiveTier(shop, customerId);
console.log('Tier resolution:', {
  effectiveTier: resolution.effectiveTierName,
  source: resolution.effectiveSource,
  allSources: resolution.allSources
});
```

---

## 📋 Quick Reference: Query Patterns

### Get All Purchases (Any Status)
```typescript
const allPurchases = await db.tierPurchase.findMany({
  where: { customerId, shop },
  include: { tier: true, tierProduct: true },
  orderBy: { createdAt: 'desc' }
});
```

### Get Active Purchases Only
```typescript
const now = new Date();
const activePurchases = await db.tierPurchase.findMany({
  where: {
    customerId,
    shop,
    status: 'ACTIVE',
    OR: [
      { endDate: null },        // LIFETIME
      { endDate: { gte: now } } // Not expired
    ]
  },
  include: { tier: true }
});
```

### Get Expired Purchases
```typescript
const expiredPurchases = await db.tierPurchase.findMany({
  where: {
    customerId,
    shop,
    endDate: { lt: new Date() } // endDate in the past
  }
});
```

### Get Purchases by Status
```typescript
const refundedPurchases = await db.tierPurchase.findMany({
  where: {
    customerId,
    shop,
    status: 'REFUNDED'
  }
});
```

---

## 🎯 Expected Behavior After Fix

### When Purchase is ACTIVE and NOT EXPIRED:
✅ Shows in "Active Tier Purchases" table with:
- Tier badge (green)
- Order ID (e.g., `test-order-1704539876543`)
- Start date (formatted)
- End date (formatted or "♾️ LIFETIME")
- Days remaining (number or "∞")

### When Purchase is ACTIVE but EXPIRED:
- Shows in "All Purchase History" with EXPIRED badge (yellow)
- Does NOT show in "Active Tier Purchases"
- `isExpired` = true in data

### When Purchase is REFUNDED:
- Shows in "All Purchase History" with REFUNDED badge (red)
- Does NOT show in "Active Tier Purchases"
- Counted in summary statistics

---

## 🔧 Files Modified

**File**: `app/routes/app.test-tier-products.tsx`

**Lines Changed**: 414-421

**What Changed**:
- Added `shopifyOrderId` to activePurchases response
- Added `startDate` to activePurchases response
- Fixed `endDate` to return `null` instead of string `'LIFETIME'`

**Before**:
```typescript
activePurchases: activeTierPurchases.map(p => ({
  id: p.id,
  tierName: p.tier.name,
  endDate: p.endDate?.toISOString() || 'LIFETIME', // ❌ Wrong type
  daysRemaining: p.endDate ? ... : null
}))
```

**After**:
```typescript
activePurchases: activeTierPurchases.map(p => ({
  id: p.id,
  tierName: p.tier.name,
  shopifyOrderId: p.shopifyOrderId,  // ✅ Added
  startDate: p.startDate.toISOString(), // ✅ Added
  endDate: p.endDate?.toISOString() || null, // ✅ Fixed type
  daysRemaining: p.endDate ? ... : null
}))
```

---

## ✅ Verification Steps

After this fix, test the flow:

1. **Create a test purchase**:
   - Go to "Simulate Purchase" tab
   - Select customer
   - Select tier product
   - Click "Simulate Purchase"

2. **Check purchase state**:
   - Go to "Purchase State" tab
   - Select same customer
   - Click "Check Purchase State"

3. **Verify results**:
   - ✅ "Active Tier Purchases" table should show the purchase
   - ✅ Should display Order ID (e.g., `test-order-1704539876543`)
   - ✅ Should display Start Date (formatted)
   - ✅ Should display End Date or "♾️ LIFETIME"
   - ✅ Should display Days Remaining or "∞"

4. **Check all purchases**:
   - Scroll to "All Purchase History" table
   - Should show same purchase with full details
   - Status badge should be green "ACTIVE"
   - Expired? badge should be green "No"

---

*Fixed: January 2025*
*Status: ✅ Complete*
