# Database Scripts

Utility scripts for database operations using AWS Aurora Data API.

## Prerequisites

Ensure the following environment variables are set:
- `AURORA_RESOURCE_ARN`
- `AURORA_SECRET_ARN`
- `AURORA_DATABASE_NAME`
- `AWS_REGION`

## Available Scripts

### Delete All Orders

Deletes all orders and related data for a specific shop. Useful for testing the order sync/import functionality.

**⚠️ WARNING: This action cannot be undone!**

```bash
npx tsx scripts/delete-all-orders.ts <shop-domain>
```

**Example:**
```bash
npx tsx scripts/delete-all-orders.ts my-store.myshopify.com
```

**What it deletes:**
- All orders for the specified shop
- Related order line items
- Related order refunds
- Related store credit ledger entries (cashback)

**Safety features:**
- Validates shop domain format
- Shows count of records to be deleted
- Provides 5-second countdown before deletion
- Can be cancelled with Ctrl+C

---

### Delete All Customers for Shop

Deletes all customers and ALL related data for a specific shop. Useful for testing customer sync or cleaning up test data.

**⚠️ WARNING: This is EXTREMELY DESTRUCTIVE and cannot be undone!**

```bash
npx tsx scripts/delete-shop-customers.ts <shop-domain>
```

**Example:**
```bash
npx tsx scripts/delete-shop-customers.ts my-store.myshopify.com
```

**What it deletes:**
- All customers for the specified shop
- All subscription events
- All app-level subscriptions
- All tier subscriptions
- All tier purchases
- All tier change logs
- All order refund line items
- All order refunds
- All order line items
- All orders
- All store credit ledger entries

**Safety features:**
- Validates shop domain format
- Shows detailed count of ALL records to be deleted
- Requires typing the exact shop domain to confirm
- Respects foreign key constraints (deletes in correct order)
- Provides detailed deletion summary with timing

**Use cases:**
- Testing customer sync functionality
- Cleaning up test shop data
- Resetting a shop to initial state
- Removing all data before re-importing

## Adding New Scripts

When creating new scripts:

1. Use TypeScript for type safety
2. Validate all required environment variables
3. Add proper error handling
4. Include usage examples in comments
5. Add safety checks for destructive operations
6. Document the script in this README
