# RewardsPro Testing Guide

## 📋 Table of Contents
1. [Testing Philosophy](#testing-philosophy)
2. [Testing Setup](#testing-setup)
3. [Unit Testing](#unit-testing)
4. [Integration Testing](#integration-testing)
5. [Component Testing](#component-testing)
6. [End-to-End Testing](#end-to-end-testing)
7. [Testing Best Practices](#testing-best-practices)
8. [CI/CD Integration](#cicd-integration)

## Testing Philosophy

RewardsPro follows a comprehensive testing strategy:
- **Unit Tests**: Test individual functions and utilities in isolation
- **Integration Tests**: Test API routes and database interactions
- **Component Tests**: Test React components and Polaris UI elements
- **E2E Tests**: Test complete user workflows

### Testing Pyramid
```
       /\
      /E2E\     (10%) - Critical user paths
     /------\
    /Component\  (30%) - UI components
   /----------\
  /Integration \ (30%) - API & database
 /--------------\
/   Unit Tests   \ (30%) - Pure functions
```

## Testing Setup

### Required Dependencies

```bash
# Install testing dependencies
npm install --save-dev \
  vitest \
  @testing-library/react \
  @testing-library/jest-dom \
  @testing-library/user-event \
  @shopify/react-testing \
  @shopify/app-bridge-react \
  msw \
  @faker-js/faker \
  @types/jest
```

### Configuration Files

#### `vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        '*.config.js',
        '*.config.ts',
        'build/',
        '.cache/'
      ]
    },
    alias: {
      '~': path.resolve(__dirname, './app'),
      '@': path.resolve(__dirname, './app')
    }
  }
});
```

#### `test/setup.ts`
```typescript
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock Shopify App Bridge
vi.mock('@shopify/app-bridge-react', () => ({
  Provider: ({ children }: { children: React.ReactNode }) => children,
  useAppBridge: () => ({
    dispatch: vi.fn(),
    subscribe: vi.fn(),
    error: vi.fn()
  }),
  ResourcePicker: vi.fn(),
  Toast: vi.fn(),
  Modal: vi.fn()
}));

// Mock environment variables
vi.mock('process', () => ({
  env: {
    SHOPIFY_API_KEY: 'test-api-key',
    DATABASE_URL: 'postgresql://test'
  }
}));
```

## Unit Testing

### Testing Utility Functions

#### `test/utils/formatters.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { 
  formatCurrency, 
  formatPercentage, 
  formatDate,
  calculateTierProgress 
} from '~/utils/formatters';

describe('formatCurrency', () => {
  it('formats USD correctly', () => {
    expect(formatCurrency(100, 'USD')).toBe('$100.00');
    expect(formatCurrency(1234.5, 'USD')).toBe('$1,234.50');
  });

  it('formats EUR correctly', () => {
    expect(formatCurrency(100, 'EUR')).toBe('€100.00');
  });

  it('handles negative values', () => {
    expect(formatCurrency(-50, 'USD')).toBe('-$50.00');
  });

  it('handles zero', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0.00');
  });
});

describe('formatPercentage', () => {
  it('formats whole numbers', () => {
    expect(formatPercentage(50)).toBe('50%');
  });

  it('formats decimals', () => {
    expect(formatPercentage(33.33)).toBe('33.33%');
  });

  it('rounds to specified decimals', () => {
    expect(formatPercentage(33.3333, 2)).toBe('33.33%');
  });
});

describe('calculateTierProgress', () => {
  it('calculates progress correctly', () => {
    expect(calculateTierProgress(500, 1000)).toBe(50);
    expect(calculateTierProgress(750, 1000)).toBe(75);
  });

  it('caps progress at 100%', () => {
    expect(calculateTierProgress(1500, 1000)).toBe(100);
  });

  it('handles zero threshold', () => {
    expect(calculateTierProgress(100, 0)).toBe(100);
  });
});
```

#### `test/utils/validators.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import {
  validateEmail,
  validateTierName,
  validateCashbackPercent,
  validateSpendingThreshold
} from '~/utils/validators';

describe('validateEmail', () => {
  it('validates correct emails', () => {
    expect(validateEmail('test@example.com')).toBe(true);
    expect(validateEmail('user+tag@domain.co.uk')).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(validateEmail('invalid')).toBe(false);
    expect(validateEmail('@domain.com')).toBe(false);
    expect(validateEmail('user@')).toBe(false);
  });
});

describe('validateTierName', () => {
  it('validates tier names', () => {
    expect(validateTierName('Gold')).toBe(true);
    expect(validateTierName('VIP Plus')).toBe(true);
  });

  it('rejects invalid tier names', () => {
    expect(validateTierName('')).toBe(false);
    expect(validateTierName('a'.repeat(51))).toBe(false);
    expect(validateTierName('Tier@123')).toBe(false);
  });
});

describe('validateCashbackPercent', () => {
  it('validates percentages within range', () => {
    expect(validateCashbackPercent(5)).toBe(true);
    expect(validateCashbackPercent(0)).toBe(true);
    expect(validateCashbackPercent(100)).toBe(true);
  });

  it('rejects invalid percentages', () => {
    expect(validateCashbackPercent(-1)).toBe(false);
    expect(validateCashbackPercent(101)).toBe(false);
    expect(validateCashbackPercent(NaN)).toBe(false);
  });
});
```

## Integration Testing

### Testing API Routes

#### `test/routes/api.tiers.test.ts`
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loader, action } from '~/routes/api.tiers';
import { db } from '~/db.server';
import { authenticate } from '~/shopify.server';

vi.mock('~/db.server', () => ({
  db: {
    tier: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    }
  }
}));

vi.mock('~/shopify.server', () => ({
  authenticate: {
    admin: vi.fn(() => Promise.resolve({
      session: { shop: 'test-shop.myshopify.com' }
    }))
  }
}));

describe('Tiers API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loader', () => {
    it('returns all tiers for the shop', async () => {
      const mockTiers = [
        { id: '1', name: 'Bronze', minSpend: 0, cashbackPercent: 2 },
        { id: '2', name: 'Silver', minSpend: 500, cashbackPercent: 3 }
      ];

      vi.mocked(db.tier.findMany).mockResolvedValue(mockTiers);

      const request = new Request('http://test.com/api/tiers');
      const response = await loader({ request, params: {}, context: {} });
      const data = await response.json();

      expect(db.tier.findMany).toHaveBeenCalledWith({
        where: { shop: 'test-shop.myshopify.com' },
        orderBy: { minSpend: 'asc' }
      });
      expect(data).toEqual({ tiers: mockTiers });
    });
  });

  describe('action', () => {
    it('creates a new tier', async () => {
      const newTier = {
        name: 'Gold',
        minSpend: 1000,
        cashbackPercent: 5,
        evaluationPeriod: 'ANNUAL'
      };

      vi.mocked(db.tier.create).mockResolvedValue({
        id: '3',
        shop: 'test-shop.myshopify.com',
        ...newTier
      });

      const formData = new FormData();
      formData.append('action', 'create');
      Object.entries(newTier).forEach(([key, value]) => {
        formData.append(key, value.toString());
      });

      const request = new Request('http://test.com/api/tiers', {
        method: 'POST',
        body: formData
      });

      const response = await action({ request, params: {}, context: {} });
      const data = await response.json();

      expect(db.tier.create).toHaveBeenCalledWith({
        data: {
          ...newTier,
          shop: 'test-shop.myshopify.com'
        }
      });
      expect(data.success).toBe(true);
    });

    it('handles validation errors', async () => {
      const formData = new FormData();
      formData.append('action', 'create');
      formData.append('name', '');
      formData.append('minSpend', '-100');

      const request = new Request('http://test.com/api/tiers', {
        method: 'POST',
        body: formData
      });

      const response = await action({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.errors).toBeDefined();
      expect(db.tier.create).not.toHaveBeenCalled();
    });
  });
});
```

### Testing Database Operations

#### `test/db/operations.test.ts`
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '~/db.server';
import { 
  createCustomer,
  updateStoreCreditBalance,
  recordTierChange,
  calculateLifetimeSpending
} from '~/models/customer.server';

describe('Customer Operations', () => {
  beforeEach(async () => {
    // Clean up test data
    await db.customer.deleteMany({
      where: { shop: 'test-shop.myshopify.com' }
    });
  });

  it('creates a customer with initial tier', async () => {
    const customer = await createCustomer({
      shop: 'test-shop.myshopify.com',
      shopifyCustomerId: '123456',
      email: 'test@example.com'
    });

    expect(customer).toMatchObject({
      shop: 'test-shop.myshopify.com',
      shopifyCustomerId: '123456',
      email: 'test@example.com',
      storeCredit: 0
    });

    // Verify tier assignment
    const tierLog = await db.tierChangeLog.findFirst({
      where: { customerId: customer.id }
    });
    expect(tierLog?.changeType).toBe('INITIAL_ASSIGNMENT');
  });

  it('updates store credit balance correctly', async () => {
    const customer = await createCustomer({
      shop: 'test-shop.myshopify.com',
      shopifyCustomerId: '789',
      email: 'balance@example.com'
    });

    await updateStoreCreditBalance(customer.id, 50, 'CASHBACK_EARNED', {
      orderId: 'order-123'
    });

    const updatedCustomer = await db.customer.findUnique({
      where: { id: customer.id }
    });
    expect(updatedCustomer?.storeCredit).toBe(50);

    // Verify ledger entry
    const ledgerEntry = await db.storeCreditLedger.findFirst({
      where: { customerId: customer.id }
    });
    expect(ledgerEntry).toMatchObject({
      amount: 50,
      balance: 50,
      type: 'CASHBACK_EARNED'
    });
  });
});
```

## Component Testing

### Testing Polaris Components

#### `test/components/TierCard.test.tsx`
```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TierCard } from '~/components/TierCard';
import { PolarisTestProvider } from '@shopify/react-testing';

const mockTier = {
  id: '1',
  name: 'Gold',
  minSpend: 1000,
  cashbackPercent: 5,
  evaluationPeriod: 'ANNUAL' as const,
  customerCount: 150
};

describe('TierCard', () => {
  it('renders tier information correctly', () => {
    render(
      <PolarisTestProvider>
        <TierCard tier={mockTier} />
      </PolarisTestProvider>
    );

    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('$1,000+ annual spending')).toBeInTheDocument();
    expect(screen.getByText('5% cashback')).toBeInTheDocument();
    expect(screen.getByText('150 customers')).toBeInTheDocument();
  });

  it('calls onEdit when edit button is clicked', () => {
    const onEdit = vi.fn();
    render(
      <PolarisTestProvider>
        <TierCard tier={mockTier} onEdit={onEdit} />
      </PolarisTestProvider>
    );

    fireEvent.click(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalledWith(mockTier);
  });

  it('shows delete confirmation', () => {
    const onDelete = vi.fn();
    render(
      <PolarisTestProvider>
        <TierCard tier={mockTier} onDelete={onDelete} />
      </PolarisTestProvider>
    );

    fireEvent.click(screen.getByText('Delete'));
    expect(screen.getByText('Delete tier?')).toBeInTheDocument();
    
    fireEvent.click(screen.getByText('Confirm'));
    expect(onDelete).toHaveBeenCalledWith('1');
  });

  it('displays correct icon based on tier level', () => {
    const { rerender } = render(
      <PolarisTestProvider>
        <TierCard tier={{ ...mockTier, name: 'Bronze' }} />
      </PolarisTestProvider>
    );
    expect(screen.getByTestId('bronze-icon')).toBeInTheDocument();

    rerender(
      <PolarisTestProvider>
        <TierCard tier={{ ...mockTier, name: 'Diamond' }} />
      </PolarisTestProvider>
    );
    expect(screen.getByTestId('diamond-icon')).toBeInTheDocument();
  });
});
```

#### `test/components/CustomerBalanceCard.test.tsx`
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CustomerBalanceCard } from '~/components/CustomerBalanceCard';
import { PolarisTestProvider } from '@shopify/react-testing';
import { useFetcher } from '@remix-run/react';

vi.mock('@remix-run/react', () => ({
  useFetcher: vi.fn()
}));

describe('CustomerBalanceCard', () => {
  it('displays loading state initially', () => {
    vi.mocked(useFetcher).mockReturnValue({
      data: undefined,
      state: 'loading',
      load: vi.fn(),
      submit: vi.fn(),
      Form: 'form' as any,
      formData: undefined,
      formMethod: undefined,
      formAction: undefined
    });

    render(
      <PolarisTestProvider>
        <CustomerBalanceCard customerId="123" />
      </PolarisTestProvider>
    );

    expect(screen.getByTestId('balance-skeleton')).toBeInTheDocument();
  });

  it('displays customer balance correctly', async () => {
    vi.mocked(useFetcher).mockReturnValue({
      data: {
        customer: {
          storeCredit: 150.50,
          currentTier: {
            name: 'Gold',
            cashbackPercent: 5
          },
          lifetimeValue: 3500
        }
      },
      state: 'idle',
      load: vi.fn(),
      submit: vi.fn(),
      Form: 'form' as any,
      formData: undefined,
      formMethod: undefined,
      formAction: undefined
    });

    render(
      <PolarisTestProvider>
        <CustomerBalanceCard customerId="123" />
      </PolarisTestProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('$150.50')).toBeInTheDocument();
      expect(screen.getByText('Gold tier')).toBeInTheDocument();
      expect(screen.getByText('5% cashback')).toBeInTheDocument();
    });
  });

  it('handles error state', () => {
    vi.mocked(useFetcher).mockReturnValue({
      data: { error: 'Customer not found' },
      state: 'idle',
      load: vi.fn(),
      submit: vi.fn(),
      Form: 'form' as any,
      formData: undefined,
      formMethod: undefined,
      formAction: undefined
    });

    render(
      <PolarisTestProvider>
        <CustomerBalanceCard customerId="123" />
      </PolarisTestProvider>
    );

    expect(screen.getByText('Customer not found')).toBeInTheDocument();
  });
});
```

## End-to-End Testing

### Setup Playwright

#### `playwright.config.ts`
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    }
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI
  }
});
```

### E2E Test Examples

#### `e2e/tier-management.spec.ts`
```typescript
import { test, expect } from '@playwright/test';

test.describe('Tier Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tiers');
  });

  test('creates a new tier', async ({ page }) => {
    await page.click('text=Add Tier');
    
    await page.fill('input[name="name"]', 'Platinum');
    await page.fill('input[name="minSpend"]', '5000');
    await page.fill('input[name="cashbackPercent"]', '7');
    await page.selectOption('select[name="evaluationPeriod"]', 'ANNUAL');
    
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Platinum')).toBeVisible();
    await expect(page.locator('text=$5,000+ annual spending')).toBeVisible();
    await expect(page.locator('text=7% cashback')).toBeVisible();
  });

  test('edits an existing tier', async ({ page }) => {
    await page.click('text=Gold >> .. >> button:has-text("Edit")');
    
    await page.fill('input[name="cashbackPercent"]', '6');
    await page.click('text=Save Changes');
    
    await expect(page.locator('text=6% cashback')).toBeVisible();
    await expect(page.locator('text=Tier updated successfully')).toBeVisible();
  });

  test('deletes a tier', async ({ page }) => {
    await page.click('text=Bronze >> .. >> button:has-text("Delete")');
    await page.click('text=Confirm');
    
    await expect(page.locator('text=Bronze')).not.toBeVisible();
    await expect(page.locator('text=Tier deleted successfully')).toBeVisible();
  });

  test('validates tier constraints', async ({ page }) => {
    await page.click('text=Add Tier');
    
    await page.fill('input[name="name"]', '');
    await page.fill('input[name="minSpend"]', '-100');
    await page.fill('input[name="cashbackPercent"]', '150');
    
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Tier name is required')).toBeVisible();
    await expect(page.locator('text=Minimum spend must be positive')).toBeVisible();
    await expect(page.locator('text=Cashback must be between 0 and 100')).toBeVisible();
  });
});
```

#### `e2e/customer-journey.spec.ts`
```typescript
import { test, expect } from '@playwright/test';

test.describe('Customer Journey', () => {
  test('customer earns and uses rewards', async ({ page }) => {
    // Navigate to customer details
    await page.goto('/customers/12345');
    
    // Check initial balance
    await expect(page.locator('[data-testid="store-credit"]')).toHaveText('$0.00');
    
    // Process a new order
    await page.click('text=Process Order');
    await page.fill('input[name="orderAmount"]', '100');
    await page.click('text=Calculate Cashback');
    
    // Verify cashback calculation
    await expect(page.locator('[data-testid="cashback-amount"]')).toHaveText('$3.00');
    
    // Apply cashback
    await page.click('text=Apply Cashback');
    await expect(page.locator('[data-testid="store-credit"]')).toHaveText('$3.00');
    
    // Use store credit
    await page.click('text=Use Credit');
    await page.fill('input[name="useAmount"]', '2');
    await page.click('text=Apply to Order');
    
    // Verify updated balance
    await expect(page.locator('[data-testid="store-credit"]')).toHaveText('$1.00');
    
    // Check transaction history
    await page.click('text=View History');
    await expect(page.locator('text=Cashback Earned: +$3.00')).toBeVisible();
    await expect(page.locator('text=Order Payment: -$2.00')).toBeVisible();
  });

  test('customer tier progression', async ({ page }) => {
    await page.goto('/customers/67890');
    
    // Check current tier
    await expect(page.locator('[data-testid="current-tier"]')).toHaveText('Silver');
    
    // View tier progress
    await page.click('text=View Progress');
    await expect(page.locator('[data-testid="progress-bar"]')).toHaveAttribute('value', '75');
    await expect(page.locator('text=$750 / $1,000')).toBeVisible();
    
    // Simulate spending to reach next tier
    await page.click('text=Add Test Order');
    await page.fill('input[name="orderAmount"]', '250');
    await page.click('text=Process');
    
    // Verify tier upgrade
    await expect(page.locator('[data-testid="tier-upgrade-modal"]')).toBeVisible();
    await expect(page.locator('text=Congratulations! You\'ve reached Gold tier')).toBeVisible();
    await expect(page.locator('[data-testid="current-tier"]')).toHaveText('Gold');
  });
});
```

## Testing Best Practices

### 1. Test Structure
```typescript
// Follow AAA pattern
describe('Component/Function', () => {
  it('should do something specific', () => {
    // Arrange - Set up test data and conditions
    const input = { value: 10 };
    
    // Act - Perform the action
    const result = calculateReward(input);
    
    // Assert - Verify the outcome
    expect(result).toBe(0.5);
  });
});
```

### 2. Test Data Management
```typescript
// Use factories for test data
export const createMockCustomer = (overrides = {}) => ({
  id: faker.datatype.uuid(),
  email: faker.internet.email(),
  shopifyCustomerId: faker.datatype.number().toString(),
  storeCredit: faker.datatype.number({ min: 0, max: 1000 }),
  currentTierId: faker.datatype.uuid(),
  createdAt: faker.date.past(),
  ...overrides
});

// Use in tests
const customer = createMockCustomer({ storeCredit: 100 });
```

### 3. Async Testing
```typescript
// Always use async/await for cleaner tests
it('loads data asynchronously', async () => {
  const { result } = renderHook(() => useCustomerData('123'));
  
  expect(result.current.loading).toBe(true);
  
  await waitFor(() => {
    expect(result.current.loading).toBe(false);
  });
  
  expect(result.current.data).toBeDefined();
});
```

### 4. Mocking External Dependencies
```typescript
// Mock Shopify API calls
vi.mock('~/shopify.server', () => ({
  shopify: {
    api: {
      customers: {
        get: vi.fn().mockResolvedValue({
          id: '123',
          email: 'test@example.com'
        })
      }
    }
  }
}));
```

### 5. Accessibility Testing
```typescript
import { axe } from 'jest-axe';

it('has no accessibility violations', async () => {
  const { container } = render(<TierCard tier={mockTier} />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

## CI/CD Integration

### GitHub Actions Workflow

#### `.github/workflows/test.yml`
```yaml
name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Setup database
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
        run: |
          npx prisma migrate deploy
          npx prisma db seed
      
      - name: Run unit tests
        run: npm run test:unit
      
      - name: Run integration tests
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
        run: npm run test:integration
      
      - name: Run component tests
        run: npm run test:components
      
      - name: Install Playwright
        run: npx playwright install --with-deps
      
      - name: Run E2E tests
        run: npm run test:e2e
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
      
      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

### NPM Scripts

Add to `package.json`:
```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run --dir test/utils",
    "test:integration": "vitest run --dir test/routes",
    "test:components": "vitest run --dir test/components",
    "test:e2e": "playwright test",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest watch"
  }
}
```

## Testing Checklist

### Before Committing
- [ ] All unit tests pass
- [ ] Integration tests cover API endpoints
- [ ] Component tests verify UI behavior
- [ ] No console errors or warnings
- [ ] Test coverage meets threshold (>80%)
- [ ] Accessibility tests pass

### Before Deployment
- [ ] E2E tests pass on staging
- [ ] Performance benchmarks met
- [ ] Security tests completed
- [ ] Database migrations tested
- [ ] Rollback procedures verified

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
```bash
# Ensure test database is running
docker-compose up -d postgres-test

# Reset test database
DATABASE_URL=postgresql://test npm run prisma:reset
```

2. **Flaky Tests**
```typescript
// Increase timeout for slow operations
it('processes large dataset', async () => {
  await expect(processData()).resolves.toBeDefined();
}, 10000);
```

3. **Memory Leaks**
```typescript
// Clean up after tests
afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});
```

4. **Mock Data Issues**
```typescript
// Reset mocks between tests
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});
```

## Resources

- [Vitest Documentation](https://vitest.dev)
- [Testing Library](https://testing-library.com)
- [Playwright Documentation](https://playwright.dev)
- [Shopify Testing Guide](https://shopify.dev/docs/apps/testing)
- [Jest DOM Matchers](https://github.com/testing-library/jest-dom)