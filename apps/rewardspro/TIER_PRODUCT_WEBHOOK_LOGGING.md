# Tier Product Webhook Logging Guide

**Date**: January 2025
**Purpose**: Comprehensive logging added to track tier product recognition and purchase creation in webhooks

---

## 🎯 What Was Added

Added detailed console logging throughout the tier product purchase flow in `app/routes/webhooks.orders.paid.tsx` to help trace:

1. **Tier Product Recognition** - How the system identifies tier products in orders
2. **Purchase Creation** - Step-by-step tier purchase record creation
3. **Tier Resolution** - How customer tier gets assigned after purchase

---

## 📊 Log Output Structure

### **Phase 1: Tier Product Recognition**

```
========================================
[TIER PRODUCT RECOGNITION] Processing Line Item
========================================
[TIER PRODUCT RECOGNITION] Line Item Details:
  - Line Item ID: 12345
  - Product ID: 8123456789
  - Variant ID: 43123456789
  - SKU: tier-gold-annual
  - Name: Gold Membership - Annual
  - Price: 99.99 USD
  - Quantity: 1
[TIER PRODUCT RECOGNITION] Is Subscription: false
[TIER PRODUCT RECOGNITION] Checking for tier product match...
[TIER PRODUCT RECOGNITION] Query criteria:
  - Shop: store.myshopify.com
  - Matching by Product ID: 8123456789
  - Matching by Variant ID: 43123456789
  - Matching by SKU: tier-gold-annual
  - Purchase Type: ONE_TIME or BOTH
[TIER PRODUCT RECOGNITION] ✅ TIER PRODUCT MATCH FOUND!
[TIER PRODUCT RECOGNITION] Matched TierProduct:
  - ID: tp-uuid-123
  - Tier ID: tier-gold-uuid
  - Shopify Product ID: 8123456789
  - Shopify Variant ID: 43123456789
  - SKU: tier-gold-annual
  - Purchase Type: ONE_TIME
  - Duration: ANNUAL
  - Price: 99.99
[TIER PRODUCT RECOGNITION] → Proceeding to create TierPurchase record
```

**If NOT a tier product**:
```
[TIER PRODUCT RECOGNITION] ❌ No tier product match found
[TIER PRODUCT RECOGNITION] → Processing as regular line item
========================================
```

**If subscription**:
```
[TIER PRODUCT RECOGNITION] ✅ Identified as SUBSCRIPTION - routing to subscription handler
```

---

### **Phase 2: Tier Purchase Creation**

```
========================================
[TIER PURCHASE CREATION] Starting Tier Purchase Creation
========================================
[TIER PURCHASE CREATION] Step 1: Validating Price
  - Line Item Price: 99.99
  - Currency: USD
[TIER PURCHASE CREATION] ✅ Price validated: 99.99

[TIER PURCHASE CREATION] Step 2: Get or Create Customer
  - Shopify Customer ID: 7123456789
  - Email: customer@example.com
[TIER PURCHASE CREATION] ✅ Customer: customer-uuid-789 (customer@example.com)

[TIER PURCHASE CREATION] Step 3: Calculate Tier Duration
  - Duration Type: ANNUAL
  - Start Date: 2025-01-06T10:30:00.000Z
  - Calculated End Date (ANNUAL): 2026-01-06T10:30:00.000Z

[TIER PURCHASE CREATION] Step 4: Creating TierPurchase Record
[TIER PURCHASE CREATION] TierPurchase Data:
  - ID: purchase-uuid-456
  - Shop: store.myshopify.com
  - Customer ID: customer-uuid-789
  - Tier ID: tier-gold-uuid
  - Tier Product ID: tp-uuid-123
  - Shopify Order ID: 5123456789
  - Shopify Line Item ID: 12345
  - Purchase Price: 99.99
  - Currency: USD
  - Start Date: 2025-01-06T10:30:00.000Z
  - End Date: 2026-01-06T10:30:00.000Z
  - Status: ACTIVE
[TIER PURCHASE CREATION] ✅ TierPurchase record created successfully!
[TIER PURCHASE CREATION] Purchase ID: purchase-uuid-456
[TIER PURCHASE CREATION] Duration: ANNUAL
[TIER PURCHASE CREATION] End Date: 2026-01-06T10:30:00.000Z
[TIER PURCHASE CREATION] → Tier resolution will be triggered next
========================================
```

**If price validation fails**:
```
[TIER PURCHASE CREATION] ❌ Price validation failed: Invalid price format
```

**For LIFETIME purchases**:
```
[TIER PURCHASE CREATION] Step 3: Calculate Tier Duration
  - Duration Type: LIFETIME
  - Start Date: 2025-01-06T10:30:00.000Z
  - End Date: LIFETIME (null)
```

---

### **Phase 3: Tier Resolution**

```
========================================
[TIER RESOLUTION] Tier Purchase Detected - Starting Resolution
========================================
[TIER RESOLUTION] Customer ID: customer-uuid-789
[TIER RESOLUTION] Number of tier purchases to resolve: 1
[TIER RESOLUTION] Processing purchase:
  - Customer ID: customer-uuid-789
  - Tier ID: tier-gold-uuid
  - Purchase ID: purchase-uuid-456
  - Order ID: 5123456789
[TIER RESOLUTION] → Calling updateCustomerToEffectiveTier()...
[TIER RESOLUTION] ✅ Resolution Complete
[TIER RESOLUTION] Result:
  - Changed: true
  - Source: TIER_PURCHASE
  - Previous Tier ID: None
  - New Tier ID: tier-gold-uuid
[TIER RESOLUTION] 🎉 Customer tier has been updated!
========================================
```

**If tier unchanged (higher priority source exists)**:
```
[TIER RESOLUTION] ℹ️ Customer tier unchanged (higher priority source exists)
```

**If resolution fails**:
```
[TIER RESOLUTION] ❌ Error resolving tier after purchase: [error details]
```

---

## 🔍 How to Use the Logs

### **Scenario 1: Customer Bought Tier Product But No Purchase Created**

**What to look for:**

1. **Check if webhook received order:**
   ```
   [OrderPaid] Processing order 5123456789 for shop store.myshopify.com
   ```

2. **Check tier product recognition:**
   ```
   [TIER PRODUCT RECOGNITION] Processing Line Item
   ```

3. **Did it find a match?**
   - ✅ If you see `TIER PRODUCT MATCH FOUND` → Product was recognized
   - ❌ If you see `No tier product match found` → Product/Variant/SKU doesn't match database

4. **Check database query criteria:**
   ```
   [TIER PRODUCT RECOGNITION] Query criteria:
     - Matching by Product ID: 8123456789
     - Matching by Variant ID: 43123456789
     - Matching by SKU: tier-gold-annual
   ```

   **Compare with TierProduct in database:**
   ```sql
   SELECT shopifyProductId, shopifyVariantId, sku
   FROM TierProduct
   WHERE shop = 'store.myshopify.com';
   ```

   **Common issues:**
   - Product ID mismatch (8123456789 vs 8987654321)
   - Variant ID mismatch
   - SKU doesn't match exactly (case-sensitive!)
   - purchaseType is not ONE_TIME or BOTH

---

### **Scenario 2: Purchase Created But Tier Not Assigned**

**What to look for:**

1. **Check if purchase was created:**
   ```
   [TIER PURCHASE CREATION] ✅ TierPurchase record created successfully!
   [TIER PURCHASE CREATION] Purchase ID: purchase-uuid-456
   ```

2. **Check if resolution was triggered:**
   ```
   [TIER RESOLUTION] Tier Purchase Detected - Starting Resolution
   ```

3. **Check resolution result:**
   - ✅ If `Changed: true` → Tier was assigned
   - ❌ If `Changed: false` → Higher priority source exists (manual override or subscription)

4. **Check the source:**
   ```
   [TIER RESOLUTION] Result:
     - Source: TIER_PURCHASE
   ```

   **If source is NOT TIER_PURCHASE:**
   - `MANUAL_OVERRIDE` → Admin manually set tier (Priority 1)
   - `TIER_SUBSCRIPTION` → Customer has active subscription (Priority 2)
   - `SPENDING_BASED` → Calculated from order history (Priority 4)

---

### **Scenario 3: Subscription vs One-Time Purchase**

**Check the subscription flag:**

```
[TIER PRODUCT RECOGNITION] Is Subscription: false
```

- `true` → Routes to subscription handler (TierSubscriptionBridgeV2)
- `false` → Routes to one-time purchase handler (processOneTimeTierPurchase)

**Subscription purchases show:**
```
[TIER PRODUCT RECOGNITION] ✅ Identified as SUBSCRIPTION - routing to subscription handler
```

---

### **Scenario 4: Duration Calculation Issues**

**Check the duration logs:**

```
[TIER PURCHASE CREATION] Step 3: Calculate Tier Duration
  - Duration Type: ANNUAL
  - Start Date: 2025-01-06T10:30:00.000Z
  - Calculated End Date (ANNUAL): 2026-01-06T10:30:00.000Z
```

**Verify:**
- MONTHLY → End date = Start date + 1 month
- ANNUAL → End date = Start date + 1 year
- LIFETIME → End date = null

**If endDate is wrong:**
- Check TierProduct.duration field in database
- Ensure it's one of: 'MONTHLY', 'ANNUAL', 'LIFETIME'

---

## 🧪 Testing with Logs

### **Test 1: Create Test Order with Tier Product**

1. Create tier product via `/app/tier-products`
2. Note the Shopify Product ID and Variant ID
3. Create test order in Shopify with that product
4. Check logs for recognition:

```bash
# In Vercel logs or local terminal
[TIER PRODUCT RECOGNITION] Processing Line Item
[TIER PRODUCT RECOGNITION] Product ID: <your-product-id>
[TIER PRODUCT RECOGNITION] ✅ TIER PRODUCT MATCH FOUND!
```

---

### **Test 2: Verify Purchase Creation**

After order is placed, check logs for:

```bash
[TIER PURCHASE CREATION] ✅ TierPurchase record created successfully!
[TIER PURCHASE CREATION] Purchase ID: <purchase-id>
```

Then verify in database:
```sql
SELECT * FROM TierPurchase
WHERE shopifyOrderId = '<order-id>';
```

---

### **Test 3: Verify Tier Assignment**

Check resolution logs:

```bash
[TIER RESOLUTION] 🎉 Customer tier has been updated!
```

Verify in database:
```sql
SELECT currentTierId, tierSource
FROM Customer
WHERE shopifyCustomerId = '<customer-id>';
```

Should show:
- `currentTierId`: tier-gold-uuid (or whatever tier was purchased)
- `tierSource`: TIER_PURCHASE

---

## 📋 Log Markers Quick Reference

### **Recognition Phase**
- `[TIER PRODUCT RECOGNITION]` - Product matching process
- ✅ `TIER PRODUCT MATCH FOUND` - Product identified
- ❌ `No tier product match found` - Not a tier product
- ✅ `Identified as SUBSCRIPTION` - Subscription product

### **Creation Phase**
- `[TIER PURCHASE CREATION]` - Purchase record creation
- ✅ `Price validated` - Price is valid
- ❌ `Price validation failed` - Invalid price
- ✅ `Customer: <id>` - Customer found/created
- ✅ `TierPurchase record created successfully` - Record saved

### **Resolution Phase**
- `[TIER RESOLUTION]` - Tier assignment process
- ✅ `Resolution Complete` - Resolution finished
- 🎉 `Customer tier has been updated` - Tier changed
- ℹ️ `Customer tier unchanged` - Tier stayed same (higher priority)
- ❌ `Error resolving tier` - Resolution failed

---

## 🔧 Debugging Workflow

### **Step 1: Check Webhook Received**
```
Look for: [OrderPaid] Processing order <id>
```

### **Step 2: Check Line Item Processing**
```
Look for: [TIER PRODUCT RECOGNITION] Processing Line Item
Check: Product ID, Variant ID, SKU
```

### **Step 3: Check Match Result**
```
✅ TIER PRODUCT MATCH FOUND → Go to Step 4
❌ No tier product match found → Check TierProduct database records
```

### **Step 4: Check Purchase Creation**
```
Look for: [TIER PURCHASE CREATION] Starting Tier Purchase Creation
Check: All 4 steps complete successfully
Look for: TierPurchase record created successfully
```

### **Step 5: Check Tier Resolution**
```
Look for: [TIER RESOLUTION] Tier Purchase Detected
Check: Resolution result (Changed: true/false)
Check: Source (should be TIER_PURCHASE if purchase wins)
```

### **Step 6: Verify in Database**
```sql
-- 1. Check TierPurchase created
SELECT * FROM TierPurchase
WHERE shopifyOrderId = '<order-id>';

-- 2. Check customer tier assigned
SELECT currentTierId, tierSource
FROM Customer
WHERE id = '<customer-id>';

-- 3. Check tier change logged
SELECT * FROM TierChangeLog
WHERE customerId = '<customer-id>'
ORDER BY createdAt DESC;
```

---

## 📍 Log Locations in Code

| Phase | Function | Line Range |
|-------|----------|-----------|
| **Recognition** | `processLineItem()` | 292-371 |
| **Creation** | `processOneTimeTierPurchase()` | 384-503 |
| **Resolution** | Webhook main flow | 137-175 |

---

## 🎯 Expected Log Flow (Success)

For a successful tier product purchase, you should see this exact sequence:

1. **Order received:**
   ```
   [OrderPaid] Processing order 5123456789 for shop store.myshopify.com
   ```

2. **Recognition:**
   ```
   [TIER PRODUCT RECOGNITION] Processing Line Item
   [TIER PRODUCT RECOGNITION] ✅ TIER PRODUCT MATCH FOUND!
   ```

3. **Creation:**
   ```
   [TIER PURCHASE CREATION] Starting Tier Purchase Creation
   [TIER PURCHASE CREATION] ✅ TierPurchase record created successfully!
   ```

4. **Resolution:**
   ```
   [TIER RESOLUTION] Tier Purchase Detected - Starting Resolution
   [TIER RESOLUTION] ✅ Resolution Complete
   [TIER RESOLUTION] 🎉 Customer tier has been updated!
   ```

5. **Final:**
   ```
   [OrderPaid] Successfully processed order 5123456789
   ```

**Any deviation from this sequence indicates where the issue occurred.**

---

## 🚨 Common Issues and Log Patterns

### **Issue: Product Not Recognized**

**Log Pattern:**
```
[TIER PRODUCT RECOGNITION] ❌ No tier product match found
```

**Cause**: Product/Variant/SKU doesn't match TierProduct in database

**Solution**:
1. Check TierProduct record exists
2. Verify shopifyProductId, shopifyVariantId, or sku matches exactly
3. Verify purchaseType is 'ONE_TIME' or 'BOTH'

---

### **Issue: Price Validation Failed**

**Log Pattern:**
```
[TIER PURCHASE CREATION] ❌ Price validation failed: Invalid price format
```

**Cause**: Line item price is invalid (negative, NaN, etc.)

**Solution**: Check order data from Shopify webhook

---

### **Issue: Tier Not Assigned Despite Purchase**

**Log Pattern:**
```
[TIER RESOLUTION] ℹ️ Customer tier unchanged (higher priority source exists)
```

**Cause**: Customer has manual override or active subscription (higher priority)

**Solution**: This is EXPECTED behavior - check tier resolution priority

---

### **Issue: Resolution Failed**

**Log Pattern:**
```
[TIER RESOLUTION] ❌ Error resolving tier after purchase: [error]
```

**Cause**: Error in tier resolution service

**Solution**: Check error details, but purchase IS already saved

---

## 📚 Related Documentation

- **TIER_PRODUCT_PURCHASE_REGISTRATION_FLOW.md** - Complete purchase flow explanation
- **TIER_PURCHASE_FLOW_EXPLAINED.md** - Purchase state and fetching
- **TIER_RECALCULATION_FIX.md** - Tier resolution system

---

*Documentation Date: January 2025*
*Status: ✅ Complete*
