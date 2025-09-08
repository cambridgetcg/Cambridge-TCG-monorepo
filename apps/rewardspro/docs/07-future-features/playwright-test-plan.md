# 🎭 Playwright Testing Plan for Shopify App

## Overview
Playwright testing will provide automated browser feedback to diagnose and fix the blank page authentication issue and ensure the app works correctly in the Shopify Admin embedded context.

## 📋 Implementation Todos

### Phase 1: Setup & Configuration
- [ ] **Install Playwright with Shopify-specific configuration**
  ```bash
  npm init playwright@latest
  # or for existing project
  npm install -D @playwright/test
  npx playwright install
  ```

- [ ] **Create playwright.config.ts**
  - Configure for Shopify Admin embedded context
  - Set up authentication state management
  - Configure trace recording for debugging

- [ ] **Set up test environment variables**
  - Create `.env.test` for test credentials
  - Configure test shop URL
  - Set up test API keys

### Phase 2: Core Test Implementation

#### 1. Authentication Flow Test
```typescript
// tests/auth.spec.ts
test('Shopify OAuth flow', async ({ page }) => {
  // Test OAuth redirect
  // Verify session creation
  // Check token storage
});
```

#### 2. App Bridge Initialization Test
```typescript
// tests/app-bridge.spec.ts
test('App Bridge loads correctly', async ({ page }) => {
  // Check if window.shopify exists
  // Verify API key is present
  // Test session token generation
});
```

#### 3. Blank Page Debugging Test
```typescript
// tests/blank-page-debug.spec.ts
test('Debug blank page issue', async ({ page }) => {
  // Capture console logs
  // Check for JavaScript errors
  // Verify network requests
  // Screenshot at each step
});
```

#### 4. Embedded Context Test
```typescript
// tests/embedded.spec.ts
test('App loads in Shopify Admin', async ({ page }) => {
  // Test iframe embedding
  // Verify CSP headers
  // Check frame-ancestors
});
```

### Phase 3: Advanced Testing

#### Visual Regression Testing
```typescript
// tests/visual.spec.ts
test('Visual regression', async ({ page }) => {
  await page.screenshot({ path: 'screenshots/app-loaded.png' });
  // Compare with baseline
});
```

#### Performance Testing
```typescript
// tests/performance.spec.ts
test('Page load performance', async ({ page }) => {
  const metrics = await page.evaluate(() => performance.timing);
  // Assert load time thresholds
});
```

## 🔧 Playwright Configuration

### playwright.config.ts
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: {
    timeout: 10000
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results.json' }],
    ['junit', { outputFile: 'junit.xml' }]
  ],
  use: {
    baseURL: process.env.SHOPIFY_APP_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Custom context for Shopify
    extraHTTPHeaders: {
      'X-Shopify-Access-Token': process.env.TEST_ACCESS_TOKEN || ''
    }
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'shopify-embedded',
      use: {
        ...devices['Desktop Chrome'],
        // Simulate Shopify Admin iframe context
        viewport: { width: 1024, height: 768 },
        extraHTTPHeaders: {
          'Content-Security-Policy': "frame-ancestors 'self' https://*.myshopify.com"
        }
      }
    }
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

## 🎯 Test Scenarios for Blank Page Issue

### Scenario 1: Direct Access Test
```typescript
test('Direct access without embedding', async ({ page }) => {
  await page.goto('/api/test-auth?shop=test-shop.myshopify.com');
  const response = await page.textContent('body');
  console.log('Auth test response:', response);
});
```

### Scenario 2: Console Error Capture
```typescript
test('Capture console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  
  await page.goto('/');
  
  if (errors.length > 0) {
    console.error('JavaScript errors found:', errors);
  }
  
  expect(errors).toHaveLength(0);
});
```

### Scenario 3: Network Request Analysis
```typescript
test('Analyze network requests', async ({ page }) => {
  const failedRequests: string[] = [];
  
  page.on('requestfailed', request => {
    failedRequests.push(`${request.url()} - ${request.failure()?.errorText}`);
  });
  
  await page.goto('/');
  
  if (failedRequests.length > 0) {
    console.error('Failed requests:', failedRequests);
  }
});
```

### Scenario 4: App Bridge Detection
```typescript
test('App Bridge availability', async ({ page }) => {
  await page.goto('/');
  
  const hasAppBridge = await page.evaluate(() => {
    return typeof window.shopify !== 'undefined';
  });
  
  const appBridgeConfig = await page.evaluate(() => {
    return window.shopify?.config || null;
  });
  
  console.log('App Bridge available:', hasAppBridge);
  console.log('App Bridge config:', appBridgeConfig);
  
  expect(hasAppBridge).toBeTruthy();
});
```

## 📊 Debugging Commands

### Run Tests with UI Mode
```bash
npx playwright test --ui
```

### Run with Debug Mode
```bash
npx playwright test --debug
```

### View Test Report
```bash
npx playwright show-report
```

### Record New Tests
```bash
npx playwright codegen https://your-app.vercel.app
```

### View Trace
```bash
npx playwright show-trace trace.zip
```

## 🚀 Package.json Scripts

Add these scripts to package.json:
```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:report": "playwright show-report",
    "test:e2e:trace": "playwright show-trace",
    "test:e2e:codegen": "playwright codegen"
  }
}
```

## 🔍 Specific Tests for Current Issue

### Test 1: Verify Environment Variables
```typescript
test('Environment variables are set', async ({ page }) => {
  const response = await page.goto('/api/test-auth');
  const data = await response?.json();
  
  expect(data.environment.SHOPIFY_API_KEY).toBeTruthy();
  expect(data.environment.SHOPIFY_API_SECRET).toBeTruthy();
});
```

### Test 2: Session Token Generation
```typescript
test('Session token is generated', async ({ page }) => {
  await page.goto('/?shop=test-shop.myshopify.com');
  
  // Wait for App Bridge
  await page.waitForFunction(() => window.shopify !== undefined, { timeout: 10000 });
  
  // Check for session token in requests
  const hasToken = await page.evaluate(() => {
    // Check if fetch includes authorization header
    return new Promise(resolve => {
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const headers = args[1]?.headers;
        resolve(headers?.['Authorization']?.includes('Bearer'));
        return originalFetch.apply(this, args);
      };
      
      // Trigger a fetch
      fetch('/api/test-auth');
    });
  });
  
  expect(hasToken).toBeTruthy();
});
```

### Test 3: CSP Headers Check
```typescript
test('CSP headers allow Shopify embedding', async ({ page }) => {
  const response = await page.goto('/');
  const csp = response?.headers()['content-security-policy'];
  
  console.log('CSP Header:', csp);
  
  expect(csp).toContain('frame-ancestors');
  expect(csp).toContain('https://*.myshopify.com');
});
```

## 🎬 GitHub Actions Integration

### .github/workflows/playwright.yml
```yaml
name: Playwright Tests
on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]
jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: 20
    - name: Install dependencies
      run: npm ci
    - name: Install Playwright Browsers
      run: npx playwright install --with-deps
    - name: Run Playwright tests
      run: npx playwright test
      env:
        SHOPIFY_API_KEY: ${{ secrets.SHOPIFY_API_KEY }}
        SHOPIFY_API_SECRET: ${{ secrets.SHOPIFY_API_SECRET }}
    - uses: actions/upload-artifact@v3
      if: always()
      with:
        name: playwright-report
        path: playwright-report/
        retention-days: 30
```

## 📈 Benefits of Playwright Testing

1. **Real Browser Feedback**: See exactly what happens in the browser
2. **Console Error Capture**: Catch JavaScript errors automatically
3. **Network Analysis**: Identify failed requests and API issues
4. **Visual Debugging**: Screenshots and videos of failures
5. **Trace Viewer**: Step-by-step execution replay
6. **Cross-browser Testing**: Test in Chrome, Firefox, Safari
7. **CI/CD Integration**: Automated testing on every commit

## 🎯 Priority Tests for Blank Page Issue

1. **Console Error Detection** - Highest Priority
2. **App Bridge Initialization** - Highest Priority  
3. **Authentication Flow** - High Priority
4. **Network Request Monitoring** - High Priority
5. **CSP Header Validation** - Medium Priority
6. **Visual Regression** - Low Priority

## 🔧 Next Steps

1. Install Playwright
2. Create initial test for blank page debugging
3. Run tests and collect browser feedback
4. Use trace viewer to analyze failures
5. Fix issues based on test results
6. Add tests to CI/CD pipeline

---

*This testing plan will provide complete browser feedback and help diagnose the blank page issue effectively.*