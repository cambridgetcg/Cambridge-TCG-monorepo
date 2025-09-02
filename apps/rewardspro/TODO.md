# 📋 TODO - Active Tasks

*Last Updated: September 1, 2025*


## 🚀 Current Sprint (Active)

### 🔴 Critical Priority


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

#### 🔧 Store Settings Page Implementation

- [ ] **Create Store Settings Management Interface**
  - Status: Not started
  - Priority: HIGH - ShopSettings model exists but no UI
  - Database: ShopSettings model already defined in Prisma schema
  
  **Implementation Plan:**
  
  1. [ ] **Create settings route file** (`app.settings.tsx`)
     - Use standard Remix route pattern
     - Follow existing tier/customer page structure
     
  2. [ ] **Implement loader function**
     - Fetch existing ShopSettings for shop
     - Create default settings if none exist
     - Handle authentication via `authenticate.admin`
     
  3. [ ] **Implement action handler**
     - Process form submissions
     - Validate all input fields
     - Update ShopSettings in database
     - Return success/error responses
     
  4. [ ] **Build settings form UI**
     - Use Polaris Page and Card components
     - Group related settings in sections
     - Follow Shopify admin design patterns
     
  5. [ ] **Currency configuration**
     - Select dropdown with all 33 currencies (USD, EUR, GBP, CAD, AUD, JPY, etc.)
     - Radio button group for display type (Symbol vs Code)
     - Show preview of currency format (e.g., "$100.00" vs "USD 100.00")
     
  6. [ ] **Timezone settings**
     - Searchable dropdown with common timezones
     - Default to America/New_York
     - Group by region for easier selection
     - Show current time in selected timezone
     
  7. [ ] **Store information**
     - Text field for store name (display name)
     - URL field with validation (store URL)
     - Auto-populate from Shopify data if available
     - Read-only shop domain display
     
  8. [ ] **User feedback**
     - Success banner on save
     - Error messages for validation failures
     - Unsaved changes warning
     - Loading spinner during save
     
  9. [ ] **Navigation integration**
     - Add Settings link to app.tsx navigation
     - Use SettingsIcon from Polaris icons
     - Place after Customers in nav order
     
  10. [ ] **Form features**
      - Client-side validation
      - Loading states during save
      - Reset to defaults option
      - Optimistic UI updates
  
  **Technical Requirements:**
  - Rate limiting (reuse pattern from tiers page)
  - Input sanitization and validation
  - Proper error boundaries
  - Responsive design for mobile
  - Handle timezone conversion for dates
  
  **Files to create/modify:**
  - `app/routes/app.settings.tsx` - Main settings page
  - `app/routes/app.tsx` - Add navigation link
  - `app/routes/api.test-settings.tsx` - Test endpoint (optional)
  
  **Data structure (from ShopSettings model):**
  ```typescript
  {
    id: string (uuid)
    shop: string (unique, e.g., "store.myshopify.com")
    storeName: string
    storeUrl: string
    storeCurrency: Currency enum (33 options)
    currencyDisplayType: "SYMBOL" | "CODE"
    timezone: string (e.g., "America/New_York")
    createdAt: DateTime
    updatedAt: DateTime
  }
  ```
  
  **Currency Options (33 total):**
  - Americas: USD, CAD, MXN, BRL, CLP
  - Europe: EUR, GBP, CHF, SEK, NOK, DKK, PLN, CZK, HUF, RON
  - Asia-Pacific: JPY, CNY, KRW, SGD, HKD, TWD, THB, MYR, IDR, PHP, INR
  - Others: AUD, NZD, ZAR, AED, TRY, RUB, ILS
  
  **Success Criteria:**
  - Settings page loads without errors
  - All fields save correctly to database
  - Currency preview updates in real-time
  - Timezone changes reflected immediately
  - Form validation prevents invalid data
  - Responsive on mobile devices

- [ ] **Enable Customer Sync from Shopify**
  - Status: Button exists but disabled
  - Next: Implement GraphQL query and bulk import
  - Features: Progress indicator, sync status

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