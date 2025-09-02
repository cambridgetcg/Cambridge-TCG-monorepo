# 📋 TODO - Active Tasks

*Last Updated: September 1, 2025*

## 🚀 Current Sprint (Active)

### ✅ Fixed - Session Token Not Saving to RDS

- [x] **Fix Shopify Session Storage to AWS RDS** ✅
  - Problem: Session tokens from Shopify OAuth not being written to database
  - Root Cause: PrismaSessionStorage wasn't working with Data API
  
  **Solution Implemented:**
  1. ✅ Created custom DataAPISessionStorage adapter
  2. ✅ Replaced PrismaSessionStorage in shopify.server.ts
  3. ✅ Implemented all SessionStorage interface methods
  4. ✅ Added comprehensive logging for debugging
  5. ✅ Tested all CRUD operations successfully
  
  **Files Updated:**
  - `app/utils/session-data-api-adapter.ts` - New Data API session storage
  - `app/shopify.server.ts` - Updated to use DataAPISessionStorage
  - `app/routes/api.test-data-api-session.tsx` - Test endpoint created
  
  **Verified Working:**
  - Store session: ✅
  - Load session: ✅
  - Find by shop: ✅
  - Delete session: ✅

### ✅ Fixed - Aurora Data API Enum Type Error

- [x] **Fix PostgreSQL Enum Type Casting in Data API** ✅
  - Error: "column 'evaluationPeriod' is of type 'EvaluationPeriod' but expression is of type text"
  - Root Cause: Aurora Data API passes enum values as text strings, but PostgreSQL requires explicit casting
  
  **Solution Implemented:**
  1. ✅ Added enum field detection in DataAPIModelProxy
  2. ✅ Implemented explicit type casting for enum fields (`:param::text::EnumType`)
  3. ✅ Updated create, update, and updateMany methods
  4. ✅ Mapped all enum fields across all tables
  5. ✅ Created test endpoint to verify enum handling
  
  **Files Updated:**
  - `app/utils/prisma-data-api-adapter.ts` - Added enum casting logic
  - `app/routes/api.test-enum.tsx` - Test endpoint for enum operations
  
  **Enum Fields Fixed:**
  - Tier: evaluationPeriod (EvaluationPeriod)
  - ShopSettings: storeCurrency (Currency), currencyDisplayType (CurrencyDisplayType)
  - StoreCreditLedger: type (LedgerEntryType)
  - TierChangeLog: changeType (TierChangeType), triggerType (TierTriggerType)

## 🚀 Current Sprint (Active)

### ✅ Fixed - @vercel/remix Import Error

- [x] **Fixed CommonJS/ESM Module Import Error** ✅
  - Error: "Named export 'createReadableStreamFromReadable' not found"
  - Root Cause: @vercel/remix is CommonJS module
  
  **Solution Implemented:**
  1. ✅ Replaced ALL @vercel/remix imports with @remix-run/node
  2. ✅ Updated 13 files with correct imports
  3. ✅ Build tested successfully
  
  **Files Updated:**
  - entry.server.tsx
  - All route files using @vercel/remix
  - Changed from: `import { ... } from "@vercel/remix"`
  - Changed to: `import { ... } from "@remix-run/node"`

### ✅ Latest Fixes

- [x] **Fixed Vite Import Resolution Error** ✅
  - Error: "Rollup failed to resolve import ~/utils/aurora-data-api"
  - Solution: Added paths configuration to tsconfig.json
  - Added: `"paths": { "~/*": ["./app/*"] }`
  - Build now succeeds with health endpoint

### ✅ Completed - AWS Aurora Data API Integration

- [x] **Migrated to Pure Data API Implementation** ✅
  - Removed legacy DATABASE_URL/DIRECT_URL dependencies
  - Updated db.server.ts to use Data API adapter exclusively
  - Prisma schema now uses placeholder URL for generation only
  - All database operations go through Aurora Data API
  
  **Benefits:**
  - Zero persistent connections (serverless-friendly)
  - No connection pool exhaustion
  - Works identically in all environments
  - Reduced complexity

### 🔴 Critical Build Error - Prisma Schema

- [x] **Fix Prisma DIRECT_URL Error** ✅
  - Error: "Environment variable not found: DIRECT_URL"
  - Root Cause: directUrl field requires DIRECT_URL env var
  
  **Solution Implemented:**
  1. ✅ Removed directUrl from schema.prisma (it's optional)
  2. ✅ Added dummy DATABASE_URL in build env for Prisma generation
  3. ✅ Changed buildCommand from "build:migrate" to "build"
  4. ✅ Tested locally - builds successfully
  
  **Note**: Runtime will use actual DATABASE_URL from env vars

### 🔴 Current Build Issues (From Vercel Logs)

- [x] **Fix Node.js Version Warning** ✅
  - Warning: "Detected engines: { node: '>=20.10.0' } will automatically upgrade"
  - Solution: Changed to "node": "20.x" in package.json
  - Impact: Prevents unexpected major version upgrades

- [x] **Address Security Vulnerabilities** ✅
  - Status: 8 moderate severity vulnerabilities (was 5, now showing 8)
  - Analysis Complete:
    - Main issue: esbuild vulnerability in dev dependencies
    - Cannot auto-fix due to peer dependency conflicts
    - Risk Assessment: LOW - Only affects development server
    - Action: Accept risk as it's dev-only and moderate severity
  - Note: Production build not affected by these vulnerabilities

- [ ] **Monitor Build Completion**
  - Build started successfully in iad1 (Washington DC)
  - Install completed with warnings (expected)
  - Next: Check if build and deployment succeed
  - Action: Monitor Vercel dashboard for completion

### 🔴 Critical Priority

- [x] **Fix @remix-run/route-config Module Error** ✅
  - Error: "Cannot find module '@remix-run/route-config'"
  - Root Cause: Module was in devDependencies but needed for production build
  - Additional Issue: CLAUDE.md was incorrectly in routes directory
  
  **Action Plan Completed:**
  1. ✅ Moved @remix-run/route-config from devDependencies to dependencies
  2. ✅ Fixed CLAUDE.md location (moved from app/routes/ to app/)
  3. ✅ Updated vercel.json with proper settings:
     - buildCommand: npm run build:migrate (includes DB migrations)
     - outputDirectory: build (explicit output dir)
  4. ✅ Tested build locally - SUCCESS

- [x] **Fix Vercel Functions Configuration Error** ✅
  - Error: "The pattern 'app/**/*.tsx' doesn't match any Serverless Functions inside the `api` directory"
  - Root Cause: Remix apps don't use `api` directory; functions config is incorrect
  - Solution: Removed functions configuration from vercel.json
  - Status: COMPLETED - Remix handles its own routing
  
  **Action Plan Completed:**
  1. ✅ Investigated error - Vercel looking for API routes but this is Remix
  2. ✅ Analyzed structure - Confirmed no `api` directory, Remix uses `app/routes`
  3. ✅ Fixed configuration - Removed `functions` block from vercel.json
  4. ⏳ Next: Deploy to Vercel to verify fix works

### 🔴 Critical Priority - Playwright Browser Testing
- [ ] **Set Up Playwright for Browser Feedback**
  - Status: Not started
  - Priority: CRITICAL - Need browser feedback for blank page issue
  - Actions:
    1. Install Playwright: `npm install -D @playwright/test`
    2. Create playwright.config.ts for Shopify context
    3. Write test for blank page debugging
    4. Capture console errors and network failures
    5. Test App Bridge initialization
  - Benefits: Real browser feedback, console error capture, network analysis

### 🔴 Critical Priority (Existing)
- [ ] **Fix Order Webhook Implementation** - `webhooks.orders.paid.tsx` cuts off mid-implementation
  - Status: Partially implemented (50%)
  - Blockers: File incomplete at line 100
  - Next: Complete cashback calculation and ledger entry creation

- [ ] **Implement Customer Detail Pages** - Routes to `/app/customers/[id]` return 404
  - Status: Not started
  - Files: Need to create `app.customers.$id.tsx`
  - Features: Transaction history, tier progression, manual adjustments


### 🟡 High Priority
- [ ] **Enable Customer Sync from Shopify**
  - Status: Button exists but disabled
  - Next: Implement GraphQL query and bulk import
  - Features: Progress indicator, sync status

- [ ] **Create Store Settings UI**
  - Status: Model exists, no interface
  - Files: Need `app.settings.tsx`
  - Features: Currency config, timezone, display preferences

### 🟢 Medium Priority
- [ ] **Configure Vercel Environment Variables**
  - Status: Documentation complete, awaiting setup
  - Next: Add variables in Vercel dashboard per environment
  - Docs: See `DEPLOYMENT_CHECKLIST.md`

- [ ] **Test Deployment Connection Isolation**
  - Status: Implementation complete, needs production testing
  - Next: Deploy to preview and verify Data API routing
  - Monitor: Check CloudWatch for connection metrics

## 🎭 Playwright E2E Testing Implementation

### Phase 1: Setup & Configuration
- [ ] **Install Playwright and Dependencies**
  - Install @playwright/test as dev dependency
  - Configure playwright.config.ts for Shopify context
  - Set up browser contexts for embedded app testing
  
- [ ] **Configure Playwright MCP Server**
  - Install @playwright/mcp@latest
  - Add MCP configuration to Claude settings
  - Set up persistent browser profiles for auth
  
- [ ] **Create CLAUDE.md Configuration**
  - Document project structure and testing requirements
  - Define testing environments (dev, staging, production)
  - Specify code style and testing patterns

### Phase 2: Test Infrastructure
- [ ] **Set Up Test Environment**
  - Configure test store URLs and credentials
  - Handle Cloudflare Turnstile with test keys
  - Set up session storage for authentication
  
- [ ] **Implement Page Object Model**
  - Create base page class for common functionality
  - Build page objects for each major section:
    - LoginPage
    - TiersPage
    - CustomersPage
    - DashboardPage
  
- [ ] **Create Test Utilities**
  - Authentication helper functions
  - Test data generators
  - API helpers for hybrid testing
  - Screenshot and reporting utilities

### Phase 3: Core Test Suites
- [ ] **Authentication & Setup Tests**
  - Test Shopify OAuth flow
  - Verify app installation process
  - Test session persistence
  
- [ ] **Tier Management Tests**
  - Create new tier with all field validations
  - Edit existing tier
  - Delete tier with confirmation
  - Test enum field handling (EvaluationPeriod)
  - Verify tier listing and sorting
  
- [ ] **Customer Management Tests**
  - View customer list with pagination
  - Search and filter customers
  - View customer details
  - Test store credit operations
  - Verify tier assignment

- [ ] **Store Credit Ledger Tests**
  - Test cashback calculations
  - Verify ledger entry creation
  - Test manual adjustments
  - Validate balance calculations

### Phase 4: Advanced Testing
- [ ] **Visual Regression Testing**
  - Set up baseline screenshots
  - Implement visual comparison
  - Configure threshold tolerance
  
- [ ] **Performance Testing**
  - Monitor page load times
  - Track API response times
  - Measure database query performance
  - Set performance budgets
  
- [ ] **Mobile Responsiveness**
  - Test on different viewport sizes
  - Verify touch interactions
  - Test embedded app on mobile

### Phase 5: CI/CD Integration
- [ ] **GitHub Actions Workflow**
  - Create .github/workflows/e2e-tests.yml
  - Configure test execution on PR
  - Set up test reporting
  - Upload artifacts (screenshots, traces)
  
- [ ] **Test Data Management**
  - Create test data setup/teardown
  - Implement test isolation
  - Handle test data in different environments

### Implementation Code Structure:
```
/tests
  /e2e
    /fixtures
      - auth.json (saved auth state)
      - test-data.ts
    /pages
      - base.page.ts
      - login.page.ts
      - tiers.page.ts
      - customers.page.ts
    /specs
      - auth.spec.ts
      - tiers.spec.ts
      - customers.spec.ts
    /utils
      - helpers.ts
      - api-client.ts
  playwright.config.ts
  CLAUDE.md
```

### Key Configurations Needed:

**playwright.config.ts:**
- Extended timeouts for Shopify dynamic content (30s action, 60s navigation)
- Network idle wait strategy
- Authentication state reuse
- Parallel execution settings
- Reporter configuration (HTML, JSON, JUnit)

**Test Environment Variables:**
- SHOPIFY_TEST_STORE_URL
- SHOPIFY_TEST_API_KEY
- SHOPIFY_TEST_API_SECRET
- TURNSTILE_TEST_SITEKEY (1x00000000000000000000AA)
- TURNSTILE_TEST_SECRET (1x0000000000000000000000000000000AA)

**CLAUDE.md Content:**
```markdown
# RewardsPro Shopify App Testing

## Project Type
- Shopify Embedded App (Remix + Vite)
- Database: AWS Aurora PostgreSQL (Data API)
- Testing Focus: Loyalty tiers, customer management, store credit

## Testing Requirements
- Test tier CRUD operations with enum handling
- Verify customer store credit calculations
- Check authentication flow
- Validate Data API integration

## Environment Setup
- Development: http://localhost:3000
- Test Store: [configure-your-store].myshopify.com
- Use Turnstile test keys for CI/CD

## Code Style
- Use Page Object Model
- Async/await for all operations
- Group tests by feature
- Use data-testid attributes
```

## 📅 Upcoming Tasks (Next Sprint)

### Phase 1: Core Functionality
- [ ] Complete order processing flow end-to-end
- [ ] Implement store credit usage at checkout
- [ ] Add refund processing webhook
- [ ] Create credit ledger display with filters

### Phase 2: Tier Automation
- [ ] Build tier evaluation system (scheduled job)
- [ ] Implement auto-progression logic
- [ ] Add tier change notifications
- [ ] Create grace period handling

### Phase 3: Analytics & Reporting
- [ ] Design analytics dashboard
- [ ] Implement key metrics calculations
- [ ] Add revenue tracking from rewards
- [ ] Create tier performance reports

## 🐛 Bug Fixes Needed

### TypeScript Errors
- [ ] Fix `@vercel/remix` import error in `entry.server.tsx`
- [ ] Fix `createdAt` property error in `api.test-session.tsx`

### UI/UX Issues
- [ ] Add loading states throughout app
- [ ] Implement proper error boundaries
- [ ] Add confirmation dialogs for destructive actions

## 💡 Technical Debt

- [ ] Add comprehensive test coverage (target 80%)
- [ ] Optimize database queries with proper indexes
- [ ] Implement caching strategy for tier calculations
- [ ] Add request rate limiting to all API endpoints

## 📝 Documentation Tasks

- [ ] Complete API documentation
- [ ] Add inline code documentation
- [ ] Create user guide for merchants
- [ ] Document deployment process

---

## Task Completion Criteria

A task is considered complete when:
- ✅ Code is implemented and working
- ✅ All linting checks pass
- ✅ TypeScript compilation succeeds
- ✅ Tests are written and passing
- ✅ Documentation is updated
- ✅ Task is moved to COMPLETED_TASKS.md

---

*Note: This file is actively maintained. Completed tasks are archived to COMPLETED_TASKS.md*