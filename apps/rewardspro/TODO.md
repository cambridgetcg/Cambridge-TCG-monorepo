# RewardsPro - TODO List

## 📝 Planning Format (Use for All Tasks)

When planning any implementation, follow this format:

### 1. Overview
Brief description of what you're about to implement (2-3 sentences max)

### 2. Functions to Create/Modify
List each function with 1-3 sentences explaining its purpose:
- `functionName()` - What it does, inputs, and outputs
- `helperFunction()` - Its specific responsibility
- `validateFunction()` - What it validates and why

### 3. Tests to Write
List test names with 5-10 words describing behavior:
- `should_calculate_cashback_correctly` - Verifies 5% cashback on $100 order
- `should_handle_invalid_customer_id` - Returns error for non-existent customer
- `should_prevent_duplicate_transactions` - Blocks same order ID twice

---

## 🔄 Execution Workflow (MANDATORY for All Code)

Follow this workflow for EVERY code implementation:

### For Each Code Block:
1. **Think & Design** - Plan elegant, modern solution (no backwards compatibility)
2. **Write Code** - Implement one logical unit (single function/component)
3. **Lint** - Run `npm run lint` and fix any issues
4. **Compile** - Run `npx tsc --noEmit` to verify types
5. **Write Tests** - Create test file with comprehensive coverage
6. **Run Tests** - Execute tests and ensure they pass
7. **Next Block** - Only proceed after all checks pass

### Workflow Example:
```bash
# Step 1: Write function
code calculateCashback()

# Step 2: Lint it
npm run lint app/utils/cashback.ts

# Step 3: Type check
npx tsc --noEmit

# Step 4: Write test
code calculateCashback.test.ts

# Step 5: Run test
npm test calculateCashback.test.ts

# Step 6: Only now write next function
code createLedgerEntry()
```

### Code Quality Standards:
- **Elegant**: Use modern TypeScript/JavaScript features
- **Single Responsibility**: Each function does one thing well
- **Type Safe**: Full TypeScript types, no `any`
- **Tested**: Minimum 80% coverage per function
- **Clean**: No console.logs, commented code, or TODOs
- **Modern**: Use latest syntax (no legacy support needed)

---

## 🔥 CRITICAL: Vercel Deployment Connection Management

### Why This Is Critical (Connection Pool Exhaustion Risk)

**Problem**: Every Vercel deployment (production, preview, branch) creates persistent database connections
- Aurora Serverless at 1 ACU = **90 max connections**
- Each deployment with connection pool of 5 = 5 connections
- 18 deployments = 90 connections = **DATABASE UNAVAILABLE** ❌

**Current Risk**:
- Preview deployments for PRs hold connections
- Old deployments don't release connections
- Production can fail due to preview deployments
- Aurora can't scale down = higher costs

### Task: Implement Connection Isolation Strategy

#### 1. Overview
Configure database connections so only the latest production deployment uses direct connections, while preview/old deployments use Data API or are limited. This prevents connection exhaustion and reduces costs.

#### 2. Functions to Create/Modify
- `getConnectionStrategy()` - Determines connection method based on VERCEL_ENV (production/preview/development)
- `createDataAPIAdapter()` - Prisma adapter that routes queries through Aurora Data API instead of direct connection
- `createPooledConnection()` - Creates connection with strict limits (1 for preview, 5 for production)
- `releaseOldConnections()` - Webhook to kill connections from superseded deployments
- `monitorConnectionUsage()` - CloudWatch metric to track connection pool usage

#### 3. Tests to Write
- `should_use_direct_connection_in_production` - Production uses fast direct connection
- `should_use_data_api_in_preview` - Preview deployments use Data API
- `should_limit_preview_connections_to_one` - Prevents preview exhaustion
- `should_close_connections_on_deployment_replace` - Old deployments release
- `should_handle_connection_timeout_gracefully` - Fallback to Data API
- `should_alert_when_connections_exceed_threshold` - Monitoring works

### Implementation Steps

1. **Environment Detection**
   ```typescript
   // Vercel provides these automatically
   VERCEL_ENV=production|preview|development
   VERCEL_GIT_COMMIT_SHA=abc123
   VERCEL_URL=deployment-url.vercel.app
   ```

2. **Connection Strategy by Environment**
   - **Production**: Direct connection with RDS Proxy (5-10 connections)
   - **Preview**: Data API only (0 persistent connections)
   - **Development**: Direct connection (local database)

3. **Configuration Changes**
   ```typescript
   // db.server.ts
   const connectionStrategy = process.env.VERCEL_ENV === 'production' 
     ? 'direct' 
     : 'data-api';
   ```

4. **RDS Proxy Setup** ($15/month but essential)
   - Multiplexes connections
   - Handles connection pooling
   - Prevents exhaustion

5. **Deployment Lifecycle Hooks**
   - On deploy: Register deployment ID
   - On supersede: Close old connections
   - On delete: Release all resources

---

## 🚨 Critical Issues (Fix Immediately)

- [ ] **FIX: Complete webhooks.orders.paid.tsx**
  
  ### 1. Overview
  Complete the order processing webhook to calculate cashback, update customer balances, and check for tier progression. This webhook fires when a Shopify order is paid and is the core of the rewards system.
  
  ### 2. Functions to Create/Modify
  - `calculateCashback(customer, orderAmount, shop)` - Calculates cashback amount based on customer's current tier percentage, returns amount and tier details
  - `createLedgerEntry(customerId, amount, orderId, metadata)` - Creates immutable transaction record in StoreCreditLedger with running balance
  - `updateCustomerBalance(customerId, creditAmount)` - Adds credit to customer's storeCredit field using atomic database operation
  - `checkTierProgression(customer, shop)` - Evaluates if customer qualifies for tier upgrade based on spending in evaluation period
  - `handleWebhookError(error, context)` - Logs errors with context, sends alerts if critical, returns proper webhook response
  
  ### 3. Tests to Write
  - `should_calculate_correct_cashback_for_tier` - Verifies percentage calculation matches tier
  - `should_create_ledger_entry_with_metadata` - Ensures transaction recorded with order details
  - `should_update_running_balance_correctly` - Validates balance matches sum of transactions
  - `should_prevent_duplicate_order_processing` - Blocks same order ID from double credit
  - `should_upgrade_tier_when_threshold_met` - Moves customer to higher tier automatically
  - `should_handle_missing_customer_gracefully` - Creates customer if not exists
  - `should_rollback_on_database_error` - Ensures atomicity of all operations

- [ ] **FIX: Customer detail route**
  
  ### 1. Overview
  Create individual customer detail page showing complete profile, transaction history, and admin controls. This page allows merchants to view and manage individual customer rewards.
  
  ### 2. Functions to Create/Modify
  - `loader({ params })` - Fetches customer by ID with currentTier, creditLedger, and tierChangeLogs relations, returns 404 if not found
  - `action({ request })` - Handles manual credit adjustments and tier overrides with validation and audit logging
  - `CustomerInfoCard()` - Displays customer email, ID, join date, total spending, and current tier in a card layout
  - `TransactionHistory()` - Renders paginated ledger entries with type badges, amounts, and timestamps
  - `ManualAdjustmentForm()` - Form for adding/subtracting credit with reason field and confirmation dialog
  - `TierProgressBar()` - Visual indicator showing spending progress toward next tier threshold
  
  ### 3. Tests to Write
  - `should_load_customer_with_all_relations` - Verifies all data properly fetched
  - `should_return_404_for_invalid_customer` - Handles non-existent customer ID
  - `should_display_transaction_history_sorted` - Shows newest transactions first
  - `should_validate_adjustment_amount_limits` - Prevents invalid credit amounts
  - `should_create_audit_log_for_adjustments` - Records who made manual changes
  - `should_calculate_tier_progress_correctly` - Shows accurate progress to next tier
  - `should_handle_pagination_of_transactions` - Loads more on scroll or click

---

## 🎯 Current Sprint Tasks (Sep 1-7, 2025)

### Task 1: Complete Order Processing Flow

#### 1. Overview
Finish the webhooks.orders.paid.tsx implementation to process cashback when orders are paid. This is the core automated rewards flow.

#### 2. Functions to Create/Modify
- `processOrder(webhookPayload)` - Main handler that orchestrates cashback calculation, balance updates, and tier checks
- `validateWebhookSignature(request)` - Verifies HMAC to ensure webhook is from Shopify for security
- `getOrCreateCustomer(customerId, email, shop)` - Finds existing customer or creates new one with default tier
- `calculateSpendingForPeriod(customerId, period)` - Sums order totals for ANNUAL (12 months) or LIFETIME evaluation

#### 3. Tests to Write
- `should_process_valid_order_successfully` - Complete flow from webhook to balance update
- `should_reject_invalid_hmac_signature` - Security check prevents fake webhooks
- `should_handle_concurrent_order_processing` - Prevents race conditions with locks
- `should_create_customer_on_first_order` - New customers get default tier

### Task 2: Customer Detail Page Implementation

#### 1. Overview
Build the individual customer view at /app/customers/$id with full transaction history and management tools.

#### 2. Functions to Create/Modify
- `loader({ params, request })` - Loads customer, transactions, tier history with proper authentication check
- `CreditAdjustmentModal()` - Modal component for manual credit add/subtract with reason field
- `ExportTransactions()` - Generates CSV of customer's transaction history for download
- `RefreshCustomerData()` - Syncs latest data from Shopify API for this customer

#### 3. Tests to Write
- `should_load_customer_detail_page` - Renders all customer data correctly
- `should_handle_manual_credit_adjustment` - Updates balance and creates audit log
- `should_export_transactions_to_csv` - Downloads formatted transaction file
- `should_refresh_from_shopify_api` - Updates customer with latest Shopify data

### Task 3: AWS Aurora Serverless + Vercel Integration

#### 1. Overview
Configure AWS Aurora Serverless PostgreSQL with Vercel hosting, handling connection pooling, cold starts, and read/write splitting. Aurora Serverless auto-scales and Vercel is serverless, requiring special connection management.

#### 2. Functions to Create/Modify
- `createPrismaClient()` - Singleton client with connection pool limit suitable for serverless (1-2 connections max)
- `configurePgBouncer()` - Sets up PgBouncer or AWS RDS Proxy for connection pooling to prevent exhaustion
- `setupReadWriteSplitting()` - Creates separate Prisma clients for read replica and writer endpoints
- `handleColdStart()` - Implements connection warming and retry logic for Aurora wake-up time (5-10 seconds)
- `configureVPCAccess()` - Sets up secure connection between Vercel and Aurora VPC (if not using public endpoint)
- `implementConnectionRetry()` - Adds exponential backoff for database connection failures during scaling

#### 3. Tests to Write
- `should_handle_aurora_cold_start` - Waits for database to wake up
- `should_not_exceed_connection_limit` - Stays within Aurora connection limits
- `should_route_reads_to_replica` - Read queries use reader endpoint
- `should_route_writes_to_primary` - Write queries use writer endpoint
- `should_reconnect_after_idle_timeout` - Handles connection drops gracefully
- `should_work_with_vercel_serverless` - Functions complete within timeout

---

## 🔧 AWS Aurora Serverless + Vercel Infrastructure Setup

### Infrastructure Task 1: AWS Aurora Serverless Configuration

#### 1. Overview
Set up AWS Aurora Serverless v2 PostgreSQL cluster with proper scaling, security, and connection settings optimized for Vercel's serverless environment.

#### 2. Functions to Create/Modify
- `createAuroraCluster()` - Creates Aurora Serverless v2 cluster with min 0.5 ACU, max 1 ACU for cost optimization
- `configureRDSProxy()` - Sets up AWS RDS Proxy for connection pooling (essential for serverless)
- `setupIAMAuthentication()` - Configures IAM database authentication for secure token-based access
- `createSecretsManager()` - Stores database credentials in AWS Secrets Manager for rotation
- `configureParameterGroups()` - Optimizes PostgreSQL parameters for serverless workloads
- `enableDataAPI()` - Activates Aurora Data API for HTTP-based queries (alternative to direct connections)

#### 3. Tests to Write
- `should_scale_down_to_zero_acu` - Verifies cost savings during idle
- `should_scale_up_within_30_seconds` - Handles traffic spikes
- `should_authenticate_with_iam_token` - Uses temporary credentials
- `should_rotate_credentials_automatically` - Security compliance
- `should_handle_10000_concurrent_requests` - Load testing via RDS Proxy

### Infrastructure Task 2: Vercel Deployment Configuration

#### 1. Overview
Configure Vercel project settings, environment variables, and build process for optimal integration with Aurora Serverless.

#### 2. Functions to Create/Modify
- `vercel.json` - Configures functions with 30-second timeout, 1GB memory for database operations
- `setupEnvVariables()` - Adds Aurora endpoints as Vercel environment variables per environment
- `createBuildScript()` - Modifies build to check database connectivity before deployment
- `implementHealthCheck()` - Adds /api/health endpoint to verify database connection
- `configureFunctionRegions()` - Deploys functions in same AWS region as Aurora (us-east-1)

#### 3. Tests to Write
- `should_deploy_to_correct_region` - Minimizes latency
- `should_access_env_variables` - Reads database URLs correctly
- `should_complete_within_timeout` - All functions under 30 seconds
- `should_handle_cold_start` - First request succeeds

### Infrastructure Task 3: Prisma Optimization for Serverless

#### 1. Overview
Optimize Prisma configuration specifically for AWS Aurora Serverless and Vercel's serverless functions to prevent connection exhaustion.

#### 2. Functions to Create/Modify
- `db.server.ts` - Implements singleton pattern with connection limit = 1 for serverless
- `prismaClientConfig()` - Adds connection timeout, pool timeout, and statement timeout settings
- `createReadClient()` - Separate Prisma instance for read queries pointing to reader endpoint
- `createWriteClient()` - Dedicated instance for writes pointing to writer endpoint
- `implementQueryCache()` - Adds Redis or memory cache for frequently accessed data
- `addConnectionMiddleware()` - Logs slow queries and connection pool metrics

#### 3. Tests to Write
- `should_reuse_connection_across_requests` - Singleton works correctly
- `should_timeout_hanging_queries` - Prevents function timeout
- `should_split_read_write_traffic` - Correct endpoint routing
- `should_cache_tier_data` - Reduces database calls
- `should_log_slow_queries` - Identifies performance issues

### Infrastructure Task 4: Connection Resilience Strategy

#### 1. Overview
Implement robust error handling and retry logic for the unique challenges of serverless-to-serverless communication.

#### 2. Functions to Create/Modify
- `withDatabaseRetry()` - Wrapper function adding exponential backoff for all database calls
- `warmDatabaseConnection()` - Pre-warms connection on function cold start
- `handleAuroraPause()` - Detects and handles Aurora auto-pause with graceful retry
- `implementCircuitBreaker()` - Prevents cascading failures during database issues
- `addConnectionPoolMonitoring()` - Tracks pool usage and alerts on exhaustion
- `setupDatadog()` - Integrates APM for database performance monitoring

#### 3. Tests to Write
- `should_retry_on_connection_failure` - Recovers from temporary issues
- `should_warm_connection_on_cold_start` - Reduces first request latency
- `should_detect_aurora_pause_state` - Identifies sleeping database
- `should_break_circuit_after_failures` - Fails fast when database down
- `should_alert_on_connection_exhaustion` - Notifies of pool issues

---

## 🚨 AWS Aurora Serverless Specific Considerations

### Critical Configuration Settings
```typescript
// Prisma schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // Add these for Aurora Serverless:
  connectionLimit = 1  // Crucial for serverless
  connectTimeout  = 30 // Aurora cold start time
  pool_timeout    = 30
  statement_timeout = 20000 // 20 seconds
}

// db.server.ts for Vercel
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL_POOLED, // Use RDS Proxy URL
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

### Environment Variables for Vercel
```bash
# Production (via Vercel Dashboard)
DATABASE_URL_POOLED=postgresql://username:password@rds-proxy-endpoint.proxy-xyz.us-east-1.rds.amazonaws.com:5432/dbname?pgbouncer=true&connection_limit=1
DATABASE_URL_DIRECT=postgresql://username:password@cluster-endpoint.cluster-xyz.us-east-1.rds.amazonaws.com:5432/dbname
DATABASE_URL_READER=postgresql://username:password@cluster-endpoint.cluster-ro-xyz.us-east-1.rds.amazonaws.com:5432/dbname

# Aurora Serverless specific
AURORA_MIN_ACU=0.5
AURORA_MAX_ACU=1
AURORA_AUTOPAUSE_MINUTES=5
AWS_REGION=us-east-1
```

### Cost Optimization Settings
- **Min capacity**: 0.5 ACU (~ $43/month if always on)
- **Max capacity**: 1-2 ACU for small apps
- **Auto-pause**: After 5 minutes of inactivity
- **Use RDS Proxy**: Prevents connection overhead
- **Same region**: Vercel functions and Aurora in us-east-1

### Common Pitfalls to Avoid
1. **Don't use direct connection** from Vercel - Always use RDS Proxy
2. **Don't set high connection limits** - Keep at 1-2 for serverless
3. **Don't ignore cold starts** - Implement retry logic
4. **Don't skip monitoring** - Connection exhaustion is silent killer
5. **Don't use different regions** - Latency kills performance

---

## 📋 Next Sprint Tasks (Sep 8-14, 2025)

### Task 4: Shopify Customer Sync

#### 1. Overview
Implement bulk customer import from Shopify to populate initial data and keep customer records synchronized.

#### 2. Functions to Create/Modify
- `syncCustomersFromShopify(shop, session)` - Fetches all customers via GraphQL with pagination and upserts to database
- `fetchCustomersBatch(cursor, session)` - Retrieves one page of customers (250 max) from Shopify Admin API
- `upsertCustomer(shopifyCustomer, shop)` - Creates or updates customer record without duplicating
- `assignDefaultTier(customerId, shop)` - Gives new customers the lowest tier automatically
- `SyncProgressIndicator()` - Shows real-time progress bar during sync operation

#### 3. Tests to Write
- `should_fetch_all_customers_with_pagination` - Handles multiple pages correctly
- `should_upsert_without_creating_duplicates` - Updates existing customers
- `should_assign_default_tier_to_new` - New customers get starter tier
- `should_handle_api_rate_limits` - Respects Shopify rate limits
- `should_resume_sync_after_error` - Continues from last successful page

### 5. Store Settings Management
```typescript
// app.routes.app.settings.tsx needs:
- [ ] Create settings route
- [ ] Form for ShopSettings model
- [ ] Currency selector
- [ ] Timezone picker
- [ ] Display format options
- [ ] Save/update functionality
```

### 6. Store Credit Usage
```typescript
// Checkout integration needs:
- [ ] Research Shopify Store Credit API
- [ ] Create checkout extension
- [ ] Validate credit balance
- [ ] Apply credit to order
- [ ] Create ledger entry for usage
- [ ] Update remaining balance
```

---

## 🔄 Recurring Tasks

### Weekly
- [ ] Update PROGRESS.md with completion status
- [ ] Review and prioritize TODO items
- [ ] Test all webhooks with ngrok
- [ ] Check for Shopify API updates

### Per Feature
- [ ] Write tests (when test framework is set up)
- [ ] Update CHANGELOG.md
- [ ] Add error boundaries
- [ ] Implement loading states
- [ ] Test on mobile devices

---

## 📦 Phase 1: MVP Checklist

### Core Flows
- [ ] Customer makes purchase → receives cashback
- [ ] Admin views all customers with balances
- [ ] Admin creates and manages tiers
- [ ] Customer progresses through tiers
- [ ] Store credit is tracked accurately

### Required Pages
- [ ] `/app` - Dashboard with metrics
- [ ] `/app/customers` - Customer list ✅
- [ ] `/app/customers/[id]` - Customer detail ❌
- [ ] `/app/tiers` - Tier management ✅
- [ ] `/app/settings` - Store settings ❌
- [ ] `/app/transactions` - Ledger view ❌

### Required Webhooks
- [ ] orders/paid - Process cashback ⚠️ (incomplete)
- [ ] orders/refunded - Reverse cashback ❌
- [ ] customers/create - Initialize customer ❌
- [ ] app/uninstalled - Cleanup ✅

---

## 💡 Feature Ideas (Backlog)

### Enhancements
- [ ] Bulk import customers from CSV
- [ ] Email templates editor
- [ ] Tier benefits beyond cashback
- [ ] Points system alternative to cashback
- [ ] Referral rewards
- [ ] Birthday bonuses
- [ ] VIP tier with special perks

### Integrations
- [ ] Klaviyo email integration
- [ ] Slack notifications for large orders
- [ ] Google Analytics events
- [ ] Customer portal in online store
- [ ] Mobile app API

### Analytics
- [ ] Cohort analysis
- [ ] Cashback ROI calculator
- [ ] Tier effectiveness report
- [ ] Customer segmentation
- [ ] Predictive tier progression

---

## 🐛 Bug Fixes Needed

### High Priority
- [ ] Fix "Sync from Shopify" button (currently disabled)
- [ ] Handle webhook timeout scenarios
- [ ] Add retry logic for failed calculations

### Medium Priority
- [ ] Improve error messages (too generic)
- [ ] Fix responsive layout on tablets
- [ ] Add keyboard shortcuts for common actions

### Low Priority
- [ ] Optimize database queries (N+1 issues)
- [ ] Add tooltips for complex features
- [ ] Improve empty state designs

---

## 📚 Technical Debt

### Code Quality
- [ ] Add TypeScript strict mode
- [ ] Remove any types
- [ ] Add JSDoc comments
- [ ] Extract magic numbers to constants
- [ ] Create shared utility functions

### Testing
- [ ] Set up testing framework
- [ ] Add unit tests for calculations
- [ ] Add integration tests for webhooks
- [ ] Add E2E tests for critical flows
- [ ] Set up CI/CD pipeline

### Performance
- [ ] Implement query caching
- [ ] Add database indexes review
- [ ] Optimize bundle size
- [ ] Add lazy loading for routes
- [ ] Implement virtual scrolling for large lists

---

## 📝 Documentation Needed

- [ ] API documentation
- [ ] Webhook payload examples
- [ ] Deployment guide
- [ ] Troubleshooting guide
- [ ] User manual for merchants
- [ ] Video tutorials

---

## ⚙️ Configuration Tasks

### Environment Setup
- [ ] Set up staging environment
- [ ] Configure error tracking (Sentry)
- [ ] Set up monitoring (Datadog/New Relic)
- [ ] Configure backup strategy
- [ ] Set up log aggregation

### Security
- [ ] Security audit
- [ ] Rate limiting on all endpoints
- [ ] Input validation audit
- [ ] SQL injection prevention check
- [ ] XSS prevention review

---

## 🎨 UI/UX Improvements

- [ ] Add dark mode support
- [ ] Improve mobile navigation
- [ ] Add breadcrumbs
- [ ] Implement undo/redo for actions
- [ ] Add keyboard navigation
- [ ] Improve form validation UX
- [ ] Add progress indicators
- [ ] Implement skeleton screens

---

## 📅 Deadline Tracking

### September 2025
- Week 1 (Sep 1-7): Core transaction flow
- Week 2 (Sep 8-14): Shopify integration
- Week 3 (Sep 15-21): Tier automation
- Week 4 (Sep 22-30): Testing & polish

### Target Launch Date
- **MVP**: End of September 2025
- **Full Release**: Mid-October 2025

---

## ✅ Quick Wins (< 1 hour each)

- [ ] Add loading spinner to buttons
- [ ] Add success toast notifications
- [ ] Fix button alignment on mobile
- [ ] Add "Copy ID" button for customers
- [ ] Add tier color legend
- [ ] Improve empty state messages
- [ ] Add confirmation to delete actions
- [ ] Format currency consistently
- [ ] Add "last updated" timestamps
- [ ] Implement search debouncing

---

## 🔗 Resources & Links

- [Shopify Store Credit API](https://shopify.dev/docs/api/admin-rest/2024-01/resources/customer#put-customers-customer-id)
- [Prisma Read Replicas](https://www.prisma.io/docs/guides/database/read-replicas)
- [Remix Documentation](https://remix.run/docs)
- [Shopify Polaris](https://polaris.shopify.com)
- [AWS Aurora Endpoints](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Overview.Endpoints.html)

---

*Last Updated: September 1, 2025*
*Next Review: September 7, 2025*