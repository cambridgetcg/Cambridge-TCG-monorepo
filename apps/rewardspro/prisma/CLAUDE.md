# /prisma Directory - Database Schema & Migrations

## 📁 Directory Structure

```
/prisma
├── schema.prisma              # Database schema definition
├── /migrations               # Migration history
│   └── /20250829131415_new_baseline  # Latest migration
│       └── migration.sql     # SQL migration script
└── migration_lock.toml      # Migration lock file
```

## 📊 Database Schema Overview

### Core Models

#### Session
**Purpose**: Shopify OAuth session storage
```prisma
model Session {
  id            String    @id
  shop          String    # Store domain
  state         String    # OAuth state
  isOnline      Boolean   # Online/offline access
  scope         String?   # Granted scopes
  expires       DateTime? # Session expiration
  accessToken   String    # Shopify access token
  userId        BigInt?   # User ID (online sessions)
  // Additional user fields...
}
```
**Key Features**:
- Indexed on `shop` for fast lookups
- Stores both online and offline tokens
- Tracks user details for online sessions

#### ShopSettings
**Purpose**: Store-specific configuration
```prisma
model ShopSettings {
  id                      String   @id @default(uuid())
  shop                    String   @unique
  storeName               String   # Display name
  storeUrl                String   # Store URL
  storeCurrency           Currency # Currency enum
  currencyDisplayType     CurrencyDisplayType
  timezone                String   # Store timezone
}
```
**Key Features**:
- One record per shop
- Configurable currency display
- Timezone for accurate reporting

#### Tier
**Purpose**: Loyalty tier definitions
```prisma
model Tier {
  id                String   @id
  shop              String
  name              String   # Tier name
  minSpend          Int      # Minimum spending threshold
  cashbackPercent   Int      # Cashback percentage
  evaluationPeriod  EvaluationPeriod # ANNUAL or LIFETIME
  customers         Customer[] # Related customers
}
```
**Key Features**:
- Unique constraint on `[shop, name]`
- Flexible evaluation periods
- One-to-many relationship with customers

#### Customer
**Purpose**: Customer profiles and balances
```prisma
model Customer {
  id                String   @id @default(uuid())
  shop              String
  shopifyCustomerId String   # Shopify customer ID
  email             String
  storeCredit       Decimal  # Current balance
  currentTierId     String?  # Current tier
  currentTier       Tier?    # Tier relation
  creditLedger      StoreCreditLedger[]
  tierChangeLogs    TierChangeLog[]
}
```
**Key Features**:
- Unique on `[shop, shopifyCustomerId]`
- Decimal precision for store credit
- Full audit trail via relations

#### StoreCreditLedger
**Purpose**: Transaction history and audit trail
```prisma
model StoreCreditLedger {
  id             String   @id @default(uuid())
  customerId     String
  shop           String
  amount         Decimal  # +/- transaction amount
  balance        Decimal  # Running balance
  type           LedgerEntryType
  shopifyOrderId String?  # Order reference
  metadata       Json?    # Flexible data storage
}
```
**Key Features**:
- Immutable transaction log
- Running balance for performance
- JSON metadata for flexibility
- Unique on `[shop, shopifyOrderId, type]`

#### TierChangeLog
**Purpose**: Tier change history and triggers
```prisma
model TierChangeLog {
  id             String   @id @default(uuid())
  customerId     String
  shop           String
  fromTierId     String?  # Previous tier
  toTierId       String?  # New tier
  changeType     TierChangeType
  triggerType    TierTriggerType
  totalSpending  Decimal? # Spending at change
  metadata       Json?    # Additional context
}
```
**Key Features**:
- Complete tier change history
- Tracks trigger reasons
- Spending snapshots
- Indexed for performance

### Enums

#### Currency
Supported currencies (33 total):
- Major: USD, EUR, GBP, CAD, AUD, JPY
- Additional: CHF, CNY, SEK, NZD, etc.

#### CurrencyDisplayType
- `SYMBOL`: Display currency symbol (e.g., $)
- `CODE`: Display currency code (e.g., USD)

#### EvaluationPeriod
- `ANNUAL`: 12-month rolling window
- `LIFETIME`: All-time spending

#### LedgerEntryType
- `CASHBACK_EARNED`: Cashback from orders
- `ORDER_PAYMENT`: Store credit used
- `REFUND_CREDIT`: Refund to store credit
- `MANUAL_ADJUSTMENT`: Admin adjustments
- `SHOPIFY_SYNC`: Sync corrections

#### TierChangeType
- `INITIAL_ASSIGNMENT`: First tier
- `UPGRADE`: Moving up tiers
- `DOWNGRADE`: Moving down tiers

#### TierTriggerType
- `ACCOUNT_CREATED`: New customer
- `PERIODIC_REVIEW`: Scheduled evaluation
- `SPENDING_MILESTONE`: Threshold reached
- `MANUAL_ADMIN`: Manual override

## 🔄 Migration Strategy

### Current Migration
- **20250829131415_new_baseline**: Complete schema baseline
- Includes all models and relationships
- Optimized indexes for performance

### Migration Commands
```bash
# Create new migration
npx prisma migrate dev --name migration_name

# Apply migrations (development)
npx prisma migrate dev

# Deploy migrations (production)
npx prisma migrate deploy

# Reset database (development only)
npx prisma migrate reset

# Check migration status
npx prisma migrate status
```

## 🎯 Database Design Principles

### 1. Audit Trail
- Never delete transaction records
- Use soft deletes where applicable
- Maintain complete history

### 2. Data Integrity
- Foreign key constraints
- Unique constraints for business rules
- NOT NULL for required fields

### 3. Performance
- Indexes on frequently queried fields
- Composite indexes for common queries
- Running balances to avoid recalculation

### 4. Flexibility
- JSON fields for variable data
- Enum types for controlled values
- Extensible schema design

## 🔍 Common Queries

### Get Customer with Tier
```typescript
const customer = await db.customer.findUnique({
  where: { 
    shop_shopifyCustomerId: {
      shop: session.shop,
      shopifyCustomerId: customerId
    }
  },
  include: { 
    currentTier: true 
  }
});
```

### Calculate Store Credit Balance
```typescript
const balance = await db.storeCreditLedger.findFirst({
  where: { customerId },
  orderBy: { createdAt: 'desc' },
  select: { balance: true }
});
```

### Get Tier Changes
```typescript
const changes = await db.tierChangeLog.findMany({
  where: { customerId },
  orderBy: { createdAt: 'desc' },
  take: 10
});
```

## 🚨 Important Constraints

### Unique Constraints
- `Session`: id
- `ShopSettings`: shop
- `Tier`: [shop, name]
- `Customer`: [shop, shopifyCustomerId]
- `StoreCreditLedger`: [shop, shopifyOrderId, type]

### Cascade Rules
- Deleting a Tier sets Customer.currentTierId to NULL
- Deleting a Customer cascades TierChangeLog entries
- StoreCreditLedger entries are never deleted

## 🔧 Maintenance

### Regular Tasks
1. Monitor database size
2. Analyze query performance
3. Update indexes as needed
4. Archive old ledger entries (if needed)

### Backup Strategy
- Use database provider's backup features
- Export critical data regularly
- Test restore procedures

## 🐛 Troubleshooting

### Common Issues

#### Migration Failures
- Check database permissions
- Verify connection string
- Ensure schema is valid

#### Performance Issues
- Review slow query logs
- Check index usage
- Consider pagination

#### Data Integrity
- Use transactions for multi-table updates
- Validate data before insertion
- Handle race conditions

### Useful Commands
```bash
# Validate schema
npx prisma validate

# Format schema file
npx prisma format

# Open Prisma Studio
npx prisma studio

# Generate ERD diagram
npx prisma generate --generator erd
```