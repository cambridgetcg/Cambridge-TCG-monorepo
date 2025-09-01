# 📋 TODO - Active Tasks

*Last Updated: September 1, 2025*

## 🚀 Current Sprint (Active)

### 🔴 Current Issue - Serverless Function Crash

- [ ] **Fix Runtime Error on Vercel**
  - Error: "This Serverless Function has crashed" 
  - Code: FUNCTION_INVOCATION_FAILED
  - Status: Investigating
  
  **Temporary Fix Applied:**
  1. Simplified db.server.ts to use standard PrismaClient
  2. Added placeholder DATABASE_URL to prevent crashes
  3. Data API integration temporarily disabled
  
  **Next Steps:**
  1. Deploy simplified version
  2. Get app running first
  3. Re-integrate Data API gradually

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