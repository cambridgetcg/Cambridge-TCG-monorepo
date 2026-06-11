# Sync System Analysis & Standardization Guide

## Overview

This document analyzes the existing sync functions in the RewardsPro codebase, identifies standardization opportunities, and proposes additional syncs to be built.

---

## Current Sync Types

### 1. Customer Sync

**Purpose**: Import customer data from Shopify and assign loyalty tiers.

| Aspect | Details |
|--------|---------|
| **Service** | `app/services/customer-sync-job.server.ts` |
| **Model** | `CustomerSyncJob` |
| **API Routes** | `/api/customer-sync/start`, `/api/customer-sync/process`, `/api/customer-sync/status` |
| **UI** | `app/routes/app.customers.sync.tsx`, Settings > Data & Sync tab |
| **Batch Size** | 100 customers |
| **Pagination** | GraphQL cursor |
| **Tier Integration** | Yes - calls `updateCustomerToEffectiveTier()` |

**Data Synced**:
- Customer ID, email, name
- Amount spent, order count
- Tier assignment based on spending

---

### 2. Order History Sync

**Purpose**: Import order history for accurate spending calculations and cashback tracking.

| Aspect | Details |
|--------|---------|
| **Service** | `app/services/order-sync-job.server.ts` |
| **Model** | `OrderSyncJob` |
| **API Routes** | `/api/order-sync/start`, `/api/order-sync/process`, `/api/order-sync/status` |
| **UI** | `app/routes/app.orders-sync.tsx`, Settings > Data & Sync tab |
| **Batch Size** | 50 orders |
| **Pagination** | GraphQL cursor |
| **Date Range** | Configurable (30d, 90d, 365d, all) |

**Data Synced**:
- Order details (subtotal, discounts, shipping, tax, total)
- Line items with product/variant info
- Refunds and adjustments
- Cashback calculations (based on tier at order time)
- Creates `StoreCreditLedger` entries for historical audit

---

### 3. Store Credit Sync

**Purpose**: Import existing Shopify store credit balances to local database.

| Aspect | Details |
|--------|---------|
| **Service** | `app/services/credit-sync-job.server.ts` |
| **Model** | `StoreCreditSyncJob` |
| **API Routes** | `/api/credit-sync/start`, `/api/credit-sync/process`, `/api/credit-sync/status` |
| **UI** | Settings > Data & Sync tab |
| **Batch Size** | 25 customers |
| **Pagination** | Local ID cursor |
| **API Calls** | Individual per customer (slower) |

**Data Synced**:
- Store credit balance per customer
- Creates `SHOPIFY_SYNC` ledger entries for audit trail

---

### 4. Incremental Order Sync (Background)

**Purpose**: Efficient syncing of new/updated orders without full re-processing.

| Aspect | Details |
|--------|---------|
| **Service** | `app/services/incremental-order-sync.service.ts` |
| **Model** | `SyncStatus` |
| **Trigger** | Webhook handlers, cron jobs |
| **Batch Size** | 50 orders |
| **Pagination** | GraphQL cursor |

**Process**:
- Initial sync: Last 30 days on first run
- Catch-up sync: If gap > 24 hours
- Incremental sync: Only updated_at changes

---

### 5. Webhook Customer Sync (Real-time)

**Purpose**: Handle real-time customer data from Shopify webhooks.

| Aspect | Details |
|--------|---------|
| **Service** | `app/services/webhook-customer-sync.server.ts` |
| **Trigger** | `customers/create`, `customers/update` webhooks |
| **Processing** | Single customer per webhook |

---

## Common Patterns

### Shared State Machine

All sync jobs use the `SyncJobStatus` enum:
```
PENDING → IN_PROGRESS → COMPLETED
                      → FAILED
                      → CANCELLED
```

### Job Model Structure

```prisma
model [Entity]SyncJob {
  id              String          @id @default(uuid())
  shop            String
  status          SyncJobStatus   @default(PENDING)
  total[Entity]s  Int?            // Total count from Shopify
  processedCount  Int             @default(0)
  createdCount    Int             @default(0)
  updatedCount    Int             @default(0)
  skippedCount    Int             @default(0)
  errorCount      Int             @default(0)
  lastCursor      String?         // For resume capability
  batchSize       Int             @default(N)
  lastError       String?         @db.Text
  errorDetails    Json?
  startedAt       DateTime?
  completedAt     DateTime?
  lastActivityAt  DateTime?
  triggeredBy     String?         // 'manual' | 'install' | 'cron'
  metadata        Json?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@index([shop, status])
  @@index([shop, createdAt(sort: Desc)])
}
```

### Service Function Pattern

Each sync service exposes these functions:
```typescript
// Start new job
startSyncJob(shop, admin, triggeredBy?): Promise<SyncJobResult>

// Process next batch
processBatch(jobId, admin): Promise<SyncJobResult>

// Get job status
getSyncJobStatus(shop): Promise<SyncJobResult | null>

// Get specific job
getSyncJobById(jobId): Promise<SyncJobResult | null>

// Resume failed/cancelled job
resumeSyncJob(jobId, admin): Promise<SyncJobResult>

// Cancel in-progress job
cancelSyncJob(jobId): Promise<boolean>

// Get stats for UI
getSyncStats(shop): Promise<StatsResult>
```

### Result Interface

```typescript
interface SyncJobResult {
  success: boolean;
  jobId: string;
  status: string;
  progress: {
    processedCount: number;
    totalCount: number | null;
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    errorCount: number;
    percentComplete: number;
  };
  hasMore: boolean;
  error?: string;
}
```

### API Route Pattern

```typescript
// POST /api/[entity]-sync/start
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const result = await startSyncJob(session.shop, admin, triggeredBy);
  return json(result);
}

// POST /api/[entity]-sync/process
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const { jobId, resume } = await request.json();
  const result = resume
    ? await resumeSyncJob(jobId, admin)
    : await processBatch(jobId, admin);
  return json(result);
}

// GET /api/[entity]-sync/status
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const result = await getSyncJobStatus(session.shop);
  return json(result);
}
```

---

## Inconsistencies to Address

### 1. Batch Size Variations
- Customer: 100
- Order: 50
- Credit: 25

**Recommendation**: Document reasoning for each. Credit sync is slower due to individual API calls per customer.

### 2. Pagination Methods
- Customer/Order: GraphQL cursor (Shopify-controlled)
- Credit: Local ID cursor (database-controlled)

**Recommendation**: Use GraphQL cursors when fetching from Shopify, local cursors when iterating local data.

### 3. Tier Resolution Handling
- Customer sync: Direct call to `updateCustomerToEffectiveTier()` per customer
- Order sync: Creates order within transaction, tier assignment implicit
- Credit sync: No tier impact

**Recommendation**: Always call tier resolution after any data change that could affect tier. Document in service comments.

### 4. Ledger Entry Creation
- Order sync: Creates `CASHBACK_EARNED` entries
- Credit sync: Creates `SHOPIFY_SYNC` entries
- Customer sync: No ledger entries

**Recommendation**: Consistent audit trail - document which operations create ledger entries.

### 5. Stats Functions
- Credit sync: Has `getCreditSyncStats()`
- Customer sync: Has `getCustomerSyncStats()` (added)
- Order sync: Has `getOrderSyncStats()` (added)

**Status**: Now consistent across all syncs.

---

## Standardization Recommendations

### 1. Create Abstract Sync Service Interface

```typescript
interface SyncService<TJob, TResult> {
  start(shop: string, admin: AdminApiContext, options?: object): Promise<TResult>;
  processBatch(jobId: string, admin: AdminApiContext): Promise<TResult>;
  getStatus(shop: string): Promise<TResult | null>;
  getById(jobId: string): Promise<TResult | null>;
  resume(jobId: string, admin: AdminApiContext): Promise<TResult>;
  cancel(jobId: string): Promise<boolean>;
  getStats(shop: string): Promise<object>;
}
```

### 2. Shared Error Handling Utility

Create `app/utils/sync-errors.ts`:
```typescript
export enum SyncErrorType {
  RATE_LIMIT = 'RATE_LIMIT',
  NETWORK = 'NETWORK',
  VALIDATION = 'VALIDATION',
  PERMISSION = 'PERMISSION',
  NOT_FOUND = 'NOT_FOUND',
  UNKNOWN = 'UNKNOWN'
}

export function classifyError(error: Error): SyncErrorType { ... }
export function shouldRetry(errorType: SyncErrorType): boolean { ... }
export function getRetryDelay(errorType: SyncErrorType, attempt: number): number { ... }
```

### 3. Unified Progress Tracking Component

Create a reusable `<SyncProgress>` component:
```tsx
interface SyncProgressProps {
  job: SyncJob | null;
  type: 'customer' | 'order' | 'credit';
  onCancel: () => void;
  onDismiss: () => void;
}
```

### 4. Centralized Sync Status Dashboard

Consider creating `app/routes/app.sync-status.tsx`:
- Shows all sync jobs across all types
- Unified view of sync health
- Quick actions for all sync types

---

## Additional Syncs to Build

### High Priority

#### 1. Product Sync
**Purpose**: Import products for analytics and tier-product associations.

**Use Cases**:
- Product-based cashback rules
- Category-based tier qualification
- Product performance analytics

**Proposed Structure**:
```prisma
model ProductSyncJob {
  // Standard sync fields
  totalProducts Int?
  // ...
}

model Product {
  id              String    @id @default(uuid())
  shop            String
  shopifyProductId String
  title           String
  handle          String
  productType     String?
  vendor          String?
  tags            String[]
  status          String    // ACTIVE, ARCHIVED, DRAFT
  // ...
}
```

#### 2. Metafield Sync
**Purpose**: Sync customer metafields for loyalty program data.

**Use Cases**:
- Bidirectional metafield sync
- Customer loyalty status visible in Shopify admin
- Tier display in customer accounts

**Data to Sync**:
- Current tier name
- Points/credits balance
- Tier expiration date
- Cashback percentage

---

### Medium Priority

#### 3. Gift Card Sync
**Purpose**: Track gift card usage and balance for loyalty programs.

**Use Cases**:
- Gift card-based rewards
- Loyalty point to gift card conversion tracking
- Gift card analytics

#### 4. Draft Order Sync
**Purpose**: Track draft orders for B2B/wholesale loyalty programs.

**Use Cases**:
- B2B customer tier qualification
- Wholesale order cashback
- Sales rep commission tracking

#### 5. Inventory Sync
**Purpose**: Sync inventory levels for reward availability.

**Use Cases**:
- Reward product availability
- Low stock alerts for tier products
- Pre-order loyalty bonuses

---

### Low Priority (Future Consideration)

#### 6. Collection Sync
**Purpose**: Sync collections for category-based rewards.

#### 7. Discount Code Sync
**Purpose**: Track discount usage for loyalty analytics.

#### 8. Customer Segment Sync
**Purpose**: Leverage Shopify segments for tier targeting.

---

## Implementation Priority Matrix

| Sync Type | Priority | Complexity | Impact | Status |
|-----------|----------|------------|--------|--------|
| Customer | DONE | Medium | High | ✅ Complete |
| Order | DONE | High | High | ✅ Complete |
| Store Credit | DONE | Medium | Medium | ✅ Complete |
| Product | HIGH | Medium | High | 📋 Planned |
| Metafield | HIGH | Low | High | 📋 Planned |
| Gift Card | MEDIUM | Low | Medium | 📋 Planned |
| Draft Order | MEDIUM | Medium | Low | 📋 Planned |
| Inventory | LOW | Low | Low | 📋 Future |
| Collection | LOW | Low | Low | 📋 Future |
| Discount Code | LOW | Low | Low | 📋 Future |
| Customer Segment | LOW | Medium | Medium | 📋 Future |

---

## Architecture Decisions

### Why Client-Side Polling?

Current implementation uses client-side polling instead of WebSockets or Server-Sent Events:

**Pros**:
- Simple implementation
- Works with all hosting providers
- No persistent connection management
- Stateless API endpoints

**Cons**:
- Higher request volume
- Slight delay in progress updates
- Browser tab must stay open

**Future Consideration**: For large-scale syncs, consider:
- Background job queue (Bull, Resque)
- WebSocket for real-time updates
- Server-side batch processing without client involvement

### Why Separate Job Models?

Each sync type has its own model instead of a generic `SyncJob`:

**Pros**:
- Type-safe progress fields (totalOrders vs totalCustomers)
- Sync-specific metadata
- Independent schema evolution
- Cleaner queries

**Cons**:
- More models to maintain
- Similar code patterns

**Recommendation**: Keep separate models but extract shared utilities.

---

## Testing Checklist

For any new sync implementation:

- [ ] Start job creates record with IN_PROGRESS status
- [ ] Batch processing increments counters correctly
- [ ] Cursor is persisted for resume capability
- [ ] Resume from cursor works correctly
- [ ] Cancel sets status to CANCELLED
- [ ] Concurrent sync prevention works
- [ ] Error handling doesn't lose progress
- [ ] Stats function returns accurate data
- [ ] UI shows real-time progress
- [ ] Completion triggers any post-sync actions

---

## File Reference

### Services
- `app/services/customer-sync-job.server.ts`
- `app/services/order-sync-job.server.ts`
- `app/services/credit-sync-job.server.ts`
- `app/services/incremental-order-sync.service.ts`
- `app/services/webhook-customer-sync.server.ts`
- `app/services/background-customer-sync.server.ts`

### API Routes
- `app/routes/api.customer-sync.*.tsx`
- `app/routes/api.order-sync.*.tsx`
- `app/routes/api.credit-sync.*.tsx`

### UI Pages
- `app/routes/app.customers.sync.tsx`
- `app/routes/app.orders-sync.tsx`
- `app/routes/app.settings.tsx` (Data & Sync tab)

### Database Models
- `prisma/schema.prisma` - CustomerSyncJob, OrderSyncJob, StoreCreditSyncJob, SyncStatus
