# RewardsPro Database Guide

## 🗄️ Database Overview

RewardsPro uses AWS Aurora Serverless v2 PostgreSQL with Prisma ORM for type-safe database operations. The system is designed for scalability, reliability, and zero-downtime deployments.

## 🏛️ Database Architecture

```
┌─────────────────────────────────────────────┐
│           Application Layer                  │
│         (Remix + Prisma Client)             │
└─────────────────┬───────────────────────────┘
                  │
         ┌────────▼────────┐
         │  Prisma ORM     │
         │  Type Safety    │
         │  Query Builder  │
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │ Aurora Data API │
         │ Zero Connections│
         │ Auto-scaling    │
         └────────┬────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
┌───▼───┐    ┌───▼───┐    ┌───▼───┐
│Writer │    │Reader │    │Reader │
│  Node │◄───│ Node  │◄───│ Node  │
└───────┘    └───────┘    └───────┘
    │
┌───▼───────────────────┐
│  Automated Backups    │
│  Point-in-time Recovery│
└───────────────────────┘
```

## 📊 Database Schema

### Core Tables

#### 🔐 Session
Manages Shopify OAuth sessions
```prisma
model Session {
  id            String    @id
  shop          String
  state         String
  isOnline      Boolean   @default(false)
  scope         String?
  expires       DateTime?
  accessToken   String
  userId        BigInt?
  onlineAccessInfo Json?
  
  @@index([shop])
}
```

#### 🏪 ShopSettings
Store-specific configuration
```prisma
model ShopSettings {
  id                    String   @id @default(uuid())
  shop                  String   @unique
  isActive              Boolean  @default(true)
  cashbackEnabled       Boolean  @default(true)
  minimumOrderAmount    Decimal  @default(0)
  evaluationPeriod      String   @default("LIFETIME")
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}
```

#### 🏆 Tier
Loyalty tier definitions
```prisma
model Tier {
  id               String     @id @default(uuid())
  shop             String
  name             String
  minSpend         Decimal?
  cashbackPercent  Float
  benefits         Json?
  sortOrder        Int        @default(0)
  isActive         Boolean    @default(true)
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt
  
  customers        Customer[]
  tierChangeLogs   TierChangeLog[]
  
  @@unique([shop, name])
  @@index([shop, isActive])
}
```

#### 👤 Customer
Customer profiles and balances
```prisma
model Customer {
  id                 String    @id @default(uuid())
  shop               String
  shopifyCustomerId  String
  email              String
  storeCredit        Decimal   @default(0)
  lifetimeSpending   Decimal   @default(0)
  currentTierId      String?
  tierEvaluatedAt    DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  
  currentTier        Tier?     @relation(fields: [currentTierId], references: [id])
  creditLedger       StoreCreditLedger[]
  tierChangeLogs     TierChangeLog[]
  
  @@unique([shop, shopifyCustomerId])
  @@index([shop, email])
  @@index([currentTierId])
}
```

#### 💳 StoreCreditLedger
Transaction history for store credits
```prisma
model StoreCreditLedger {
  id              String    @id @default(uuid())
  customerId      String
  shop            String
  amount          Decimal
  balance         Decimal
  type            String    // CREDIT, DEBIT, ADJUSTMENT
  reason          String
  orderId         String?
  referenceId     String?
  metadata        Json?
  createdAt       DateTime  @default(now())
  
  customer        Customer  @relation(fields: [customerId], references: [id])
  
  @@index([customerId, createdAt])
  @@index([shop, orderId])
}
```

#### 📈 TierChangeLog
Audit trail for tier changes
```prisma
model TierChangeLog {
  id              String    @id @default(uuid())
  customerId      String
  shop            String
  fromTierId      String?
  toTierId        String?
  fromTierName    String?
  toTierName      String?
  changeType      String    // UPGRADE, DOWNGRADE, INITIAL_ASSIGNMENT
  triggerType     String    // ORDER_PLACED, MANUAL, EVALUATION, ACCOUNT_CREATED
  totalSpending   Decimal?
  metadata        Json?
  createdAt       DateTime  @default(now())
  
  customer        Customer  @relation(fields: [customerId], references: [id])
  toTier          Tier?     @relation(fields: [toTierId], references: [id])
  
  @@index([customerId, createdAt])
  @@index([shop, changeType])
}
```

## 🔄 Database Operations

### Connection Strategy

```typescript
// app/db.server.ts
import { PrismaClient } from "@prisma/client";
import { getPrismaClient } from "./utils/prisma-adapter";

// Singleton pattern for connection reuse
let db: PrismaClient;

declare global {
  var __db__: PrismaClient | undefined;
}

if (process.env.NODE_ENV === "production") {
  db = getPrismaClient(); // Uses Data API adapter
} else {
  if (!global.__db__) {
    global.__db__ = new PrismaClient();
  }
  db = global.__db__;
}

export default db;
```

### Common Query Patterns

#### 1. Fetching with Relations
```typescript
// Get customer with current tier
const customer = await db.customer.findUnique({
  where: { 
    shop_shopifyCustomerId: {
      shop: session.shop,
      shopifyCustomerId: customerId
    }
  },
  include: {
    currentTier: true,
    creditLedger: {
      take: 10,
      orderBy: { createdAt: 'desc' }
    }
  }
});
```

#### 2. Bulk Operations
```typescript
// Bulk create customers
const customers = await db.customer.createMany({
  data: customerData,
  skipDuplicates: true
});

// Bulk update tiers
await db.customer.updateMany({
  where: {
    shop: session.shop,
    lifetimeSpending: { gte: 1000 }
  },
  data: {
    currentTierId: goldTierId
  }
});
```

#### 3. Transactions
```typescript
// Atomic operations
const result = await db.$transaction(async (tx) => {
  // Update customer balance
  const customer = await tx.customer.update({
    where: { id: customerId },
    data: {
      storeCredit: { increment: creditAmount }
    }
  });
  
  // Create ledger entry
  await tx.storeCreditLedger.create({
    data: {
      customerId,
      shop,
      amount: creditAmount,
      balance: customer.storeCredit,
      type: 'CREDIT',
      reason: 'Order cashback',
      orderId
    }
  });
  
  return customer;
});
```

#### 4. Aggregations
```typescript
// Calculate statistics
const stats = await db.customer.aggregate({
  where: { shop: session.shop },
  _count: true,
  _sum: {
    storeCredit: true,
    lifetimeSpending: true
  },
  _avg: {
    storeCredit: true
  }
});

// Group by tier
const tierStats = await db.customer.groupBy({
  by: ['currentTierId'],
  where: { shop: session.shop },
  _count: true,
  _sum: {
    storeCredit: true
  }
});
```

## 🔐 Aurora Data API Specifics

### Limitations & Workarounds

#### 1. No Auto-generated UUIDs
```typescript
// ❌ Won't work with Data API
id String @id @default(uuid())

// ✅ Generate UUID in application
import { v4 as uuidv4 } from 'uuid';

await db.customer.create({
  data: {
    id: uuidv4(), // Explicitly generate
    // ... other fields
  }
});
```

#### 2. No Auto-updated Timestamps
```typescript
// ❌ Won't work with Data API
updatedAt DateTime @updatedAt

// ✅ Set timestamps explicitly
const now = new Date();
await db.customer.update({
  where: { id },
  data: {
    // ... other fields
    updatedAt: now // Explicitly set
  }
});
```

#### 3. Composite Unique Constraints
```typescript
// Use findFirst instead of findUnique for composite keys
const customer = await db.customer.findFirst({
  where: {
    shop: session.shop,
    shopifyCustomerId: customerId
  }
});
```

## 🚀 Migrations

### Development Migrations

```bash
# Create a new migration
npx prisma migrate dev --name add_customer_tags

# View migration status
npx prisma migrate status

# Reset database (CAUTION: deletes all data)
npx prisma migrate reset
```

### Production Migrations

```bash
# Deploy migrations
npx prisma migrate deploy

# In CI/CD pipeline
npm run build:migrate
```

### Migration Best Practices

1. **Always test migrations locally first**
2. **Create backups before production migrations**
3. **Use descriptive migration names**
4. **Keep migrations small and focused**
5. **Never edit existing migrations**

### Example Migration

```sql
-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyCustomerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "storeCredit" DECIMAL(10,2) DEFAULT 0,
    "currentTierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_shop_shopifyCustomerId_key" 
ON "Customer"("shop", "shopifyCustomerId");

-- CreateIndex
CREATE INDEX "Customer_shop_email_idx" 
ON "Customer"("shop", "email");

-- AddForeignKey
ALTER TABLE "Customer" 
ADD CONSTRAINT "Customer_currentTierId_fkey" 
FOREIGN KEY ("currentTierId") 
REFERENCES "Tier"("id") 
ON DELETE SET NULL 
ON UPDATE CASCADE;
```

## 📈 Performance Optimization

### Indexing Strategy

```prisma
// Single column index
@@index([shop])

// Composite index (order matters!)
@@index([shop, createdAt])

// Unique constraint (automatically indexed)
@@unique([shop, shopifyCustomerId])
```

### Query Optimization

```typescript
// ✅ Use select to limit fields
const customers = await db.customer.findMany({
  select: {
    id: true,
    email: true,
    storeCredit: true
  }
});

// ✅ Use pagination
const customers = await db.customer.findMany({
  skip: 20,
  take: 10,
  orderBy: { createdAt: 'desc' }
});

// ✅ Use where clauses effectively
const activeCustomers = await db.customer.findMany({
  where: {
    shop: session.shop,
    storeCredit: { gt: 0 },
    currentTierId: { not: null }
  }
});

// ❌ Avoid N+1 queries
// Bad: Separate queries for each relation
for (const customer of customers) {
  const tier = await db.tier.findUnique({
    where: { id: customer.currentTierId }
  });
}

// ✅ Good: Include relations
const customersWithTiers = await db.customer.findMany({
  include: { currentTier: true }
});
```

## 🔍 Database Monitoring

### Key Metrics to Track

1. **Connection Count**: Monitor Data API usage
2. **Query Performance**: Track slow queries
3. **Storage Usage**: Monitor database size
4. **CPU/Memory**: Watch Aurora metrics
5. **Error Rates**: Track failed queries

### Monitoring Queries

```sql
-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Find slow queries
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Check index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

## 🛠️ Maintenance Tasks

### Regular Maintenance

```bash
# Weekly tasks
- Review slow query logs
- Check index usage
- Monitor storage growth

# Monthly tasks  
- Analyze query patterns
- Update database statistics
- Review and optimize indexes

# Quarterly tasks
- Performance audit
- Schema optimization review
- Backup strategy review
```

### Backup Strategy

```typescript
// Automated backups configured in Aurora
- Continuous backups to S3
- 7-day retention period
- Point-in-time recovery available
- Cross-region backup replication
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Connection Timeout
```typescript
// Issue: Data API timeout
// Solution: Increase timeout or optimize query
const result = await db.$queryRaw`
  SELECT * FROM large_table
  LIMIT 1000
`; // Add pagination
```

#### 2. Transaction Deadlock
```typescript
// Issue: Concurrent updates cause deadlock
// Solution: Use advisory locks or retry logic
async function updateWithRetry(fn: () => Promise<any>, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, 100 * Math.pow(2, i)));
    }
  }
}
```

#### 3. Migration Failures
```bash
# Check migration status
npx prisma migrate status

# Force reset if needed (dev only)
npx prisma migrate reset

# Manual intervention
psql $DATABASE_URL -c "DELETE FROM _prisma_migrations WHERE migration_name = 'failed_migration';"
```

## 📚 Best Practices

### 1. **Use Transactions for Related Operations**
Ensure data consistency with atomic operations

### 2. **Implement Soft Deletes When Appropriate**
Preserve data for audit trails

### 3. **Version Your Schema Changes**
Use Prisma migrations for all schema changes

### 4. **Monitor Query Performance**
Use query analysis tools regularly

### 5. **Plan for Scale**
Design schema with growth in mind

### 6. **Document Complex Queries**
Add comments for business logic

### 7. **Test Migration Rollbacks**
Have a plan for reverting changes

### 8. **Use Read Replicas**
Distribute read load when needed

## 🔗 Related Documentation

- [Prisma Documentation](https://www.prisma.io/docs)
- [Aurora Data API Guide](./docs/AWS_IAM_SETUP.md)
- [architecture.md](./architecture.md)
- [troubleshooting.md](./troubleshooting.md)