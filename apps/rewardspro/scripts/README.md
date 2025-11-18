# Database & Utility Scripts

Utility scripts for database operations, mock data generation, and testing using AWS Aurora Data API.

## Prerequisites

Ensure the following environment variables are set in your `.env` file:
- `AURORA_RESOURCE_ARN` - Aurora cluster ARN
- `AURORA_SECRET_ARN` - Secrets Manager ARN for database credentials
- `AURORA_DATABASE_NAME` - Database name (usually `rewardspro`)
- `AWS_REGION` - AWS region (e.g., `eu-north-1`)

## Available Scripts

### 🎭 Add Mock Data (NEW!)

**`add-mock-data.ts`** - Create realistic test data for development and testing

Creates customers with orders, line items, cashback entries, and tier assignments using realistic mock data.

**Usage:**
```bash
npx tsx scripts/add-mock-data.ts <shop-domain> [--customers=N] [--orders=N]
```

**Options:**
- `--customers=N` - Number of customers to create (default: 10)
- `--orders=N` - Average orders per customer (default: 3)

**Examples:**
```bash
# Create 10 customers with ~3 orders each
npx tsx scripts/add-mock-data.ts mystore.myshopify.com

# Create 20 customers with ~5 orders each
npx tsx scripts/add-mock-data.ts mystore.myshopify.com --customers=20 --orders=5

# Create 50 customers for demo purposes
npx tsx scripts/add-mock-data.ts demo.myshopify.com --customers=50 --orders=8
```

**What it creates:**
- ✅ Customers with realistic names and emails (Emma Smith, Liam Johnson, etc.)
- ✅ Orders with various statuses (PAID, PENDING, PARTIALLY_PAID)
- ✅ Order line items with realistic products (1-5 items per order)
  - T-shirts, hoodies, jeans, jackets, sneakers, accessories
  - Price range: $15.99 - $249.99
- ✅ Store credit ledger entries for cashback earned on paid orders
- ✅ Automatic tier assignments based on customer spending
- ✅ Tier change logs for complete audit trail
- ✅ Realistic timestamps (orders created within last 6 months)
- ✅ Proper calculation of totals, discounts, shipping, and tax

**Mock Data Details:**
- **Products**: 10 different products with varied pricing
- **Discounts**: 30% chance of having a discount (5-20% off)
- **Shipping**: Random shipping costs ($5-$15)
- **Tax**: Calculated as 5-15% of subtotal
- **Cashback**: Automatically calculated based on customer's tier
- **Currency**: Uses shop's currency setting (defaults to USD)

**Use Cases:**
- Testing the customer and order management interface
- Demonstrating analytics and reporting features
- Testing tier progression and cashback calculations
- Creating demo data for presentations
- Load testing with realistic data

---

### 🗑️ Delete All Orders

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

### 🗑️ Delete All Customers for Shop

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

---

## Common Workflows

### 🎬 Setting Up a Test Environment

```bash
# 1. Create mock customers and orders
npx tsx scripts/add-mock-data.ts test-store.myshopify.com --customers=30 --orders=5

# 2. Verify data in the app
# Navigate to /app/customers and /app/analytics in your browser

# 3. Clean up when done testing
npx tsx scripts/delete-shop-customers.ts test-store.myshopify.com
```

### 🧪 Testing Specific Features

```bash
# Create minimal test data
npx tsx scripts/add-mock-data.ts dev-store.myshopify.com --customers=5 --orders=2

# Test and iterate...

# Clean up and start fresh
npx tsx scripts/delete-shop-customers.ts dev-store.myshopify.com
npx tsx scripts/add-mock-data.ts dev-store.myshopify.com --customers=10 --orders=4
```

### 📊 Demo Data for Presentations

```bash
# Create realistic demo data with many customers
npx tsx scripts/add-mock-data.ts demo-store.myshopify.com --customers=100 --orders=8

# This creates ~800 orders total with:
# - Realistic customer names and spending patterns
# - Varied order amounts and line items
# - Proper cashback calculations
# - Tier progression based on spending
```

### 🔄 Resetting Test Data

```bash
# Delete all existing data
npx tsx scripts/delete-shop-customers.ts test-store.myshopify.com

# Create fresh data
npx tsx scripts/add-mock-data.ts test-store.myshopify.com --customers=25 --orders=4
```

---

## Troubleshooting

### Connection Issues

```bash
# Test AWS credentials
aws sts get-caller-identity

# Test Data API connection
aws rds-data execute-statement \
  --resource-arn $AURORA_RESOURCE_ARN \
  --secret-arn $AURORA_SECRET_ARN \
  --database $AURORA_DATABASE_NAME \
  --sql "SELECT 1"
```

### Permission Errors

Ensure your IAM user/role has these permissions:
- `rds-data:ExecuteStatement`
- `rds-data:BatchExecuteStatement`
- `secretsmanager:GetSecretValue`

### Script Errors

- **"Missing required environment variables"**: Check your `.env` file
- **"Shop domain must be in format..."**: Use format like `mystore.myshopify.com`
- **Foreign key constraint errors**: Ensure tiers exist before creating customers with tier assignments
- **"formatCurrency received null"**: See Data API field types section below

### ⚠️ CRITICAL: Data API Field Types

**Common Issue:** `formatCurrency` or other functions receiving `null` or `undefined` values.

**Root Cause:** Data API returns different field types based on database column type:

| Database Type | Data API Field | How to Read | How to Write |
|--------------|----------------|-------------|--------------|
| Text/Varchar | `.stringValue` | `record[0].stringValue` | `{ stringValue: 'text' }` |
| **Decimal/Numeric** | **`.stringValue`** | `parseFloat(record[0].stringValue \|\| '0')` | `{ doubleValue: 99.99 }` |
| Integer/BigInt | `.longValue` | `record[0].longValue \|\| 0` | `{ longValue: 42 }` |
| Boolean | `.booleanValue` | `record[0].booleanValue` | `{ booleanValue: true }` |
| Timestamp | `.stringValue` | `record[0].stringValue` | `{ stringValue: '2025-01-01T00:00:00Z' }` |

⚠️ **KEY INSIGHT**: DECIMAL columns are **returned as strings** but **written as doubles**!

**Example: Reading decimal values correctly**

```typescript
// ❌ WRONG - looking for doubleValue when API returns stringValue!
const amount = record[0].doubleValue !== undefined ? record[0].doubleValue : 0;

// ✅ CORRECT - Parse the stringValue
const amount = parseFloat(record[0].stringValue || '0');
```

**Example: Writing decimal values correctly**

```typescript
// ❌ WRONG - will cause type errors
{ name: 'amount', value: { stringValue: '99.99' } }

// ✅ CORRECT - use doubleValue for writing
{ name: 'amount', value: { doubleValue: 99.99 } }
```

**Why this matters:**
- **Reading**: Decimal columns (like `storeCredit`, `totalSpent`, `cashbackAmount`) are returned as `stringValue` and must be parsed with `parseFloat()`.
- **Writing**: Decimal parameters must be sent as `doubleValue` to maintain precision.
- This asymmetry is critical - reads and writes use different field types!

---

## Adding New Scripts

When creating new scripts:

1. Use TypeScript for type safety (`npx tsx`)
2. Import and validate all required environment variables
3. Add proper error handling and logging
4. Include usage examples in file header comments
5. Add safety checks for destructive operations (confirmation prompts)
6. Use the existing patterns from `add-mock-data.ts` or `delete-shop-customers.ts`
7. Document the script in this README with examples

### Script Template

```typescript
/**
 * Script Name
 *
 * Brief description of what this script does
 *
 * USAGE:
 *   npx tsx scripts/your-script.ts <arguments>
 *
 * EXAMPLE:
 *   npx tsx scripts/your-script.ts mystore.myshopify.com
 */

import 'dotenv/config';
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';

// Validate environment, create client, implement logic...
```

---

## Safety Notes

⚠️ **IMPORTANT WARNINGS**

- **NEVER** run deletion scripts against production without a backup
- **ALWAYS** test scripts on development stores first
- **VERIFY** shop domain before confirming any destructive operations
- **READ** the script code if you're unsure what it does

✅ **Safe Operations**

- `add-mock-data.ts` - Safe for dev/test environments, creates data only
- Validation scripts - Read-only operations
- All deletion scripts include confirmation prompts and safety checks

---

## Need Help?

- Check the main [CLAUDE.md](../CLAUDE.md) for project overview and patterns
- Review [Prisma Schema](../prisma/schema.prisma) for data models
- See [Data API Adapter](../app/utils/prisma-data-api-adapter.ts) for query patterns
- Read [Security Documentation](../docs/08-security/) for best practices

---

**Last Updated**: January 2025
