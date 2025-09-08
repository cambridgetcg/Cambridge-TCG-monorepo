# RewardsPro Development Guide

## 🚀 Quick Start

### Prerequisites
- Node.js 18.20+ (use exactly 18.20 for production parity)
- npm 9.0+
- PostgreSQL 14+ (local) or AWS Aurora access
- Shopify Partner account
- ngrok or Cloudflare Tunnel (for local webhooks)

### Initial Setup

```bash
# Clone the repository
git clone <repository-url>
cd rewardspro-production

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your credentials

# Pull database schema (if using existing DB)
npx prisma db pull

# OR create new database with migrations
npx prisma migrate dev

# Start development server
npm run dev
```

## 📋 Development Workflow

### 1. Feature Development Flow

```mermaid
graph LR
    A[Create Branch] --> B[Write Code]
    B --> C[Test Locally]
    C --> D[Type Check]
    D --> E[Lint]
    E --> F[Create PR]
    F --> G[Preview Deploy]
    G --> H[Code Review]
    H --> I[Merge]
```

### 2. Branch Naming Convention

```bash
feature/add-customer-export     # New features
fix/webhook-timeout-issue        # Bug fixes
refactor/database-queries        # Code refactoring
docs/update-api-documentation    # Documentation
test/customer-sync-unit-tests    # Testing
```

### 3. Commit Message Format

```bash
# Format: <type>(<scope>): <subject>

feat(customers): add bulk export functionality
fix(webhooks): handle timeout errors gracefully
refactor(database): optimize customer queries
docs(api): update webhook documentation
test(sync): add unit tests for sync service
```

## 🏗️ Project Structure

```
/rewardspro-production
├── /app
│   ├── /routes              # Page routes and API endpoints
│   │   ├── app.*.tsx        # Protected app routes
│   │   ├── webhooks.*.tsx   # Webhook handlers
│   │   └── api.*.tsx        # API endpoints
│   ├── /components          # Reusable React components
│   │   ├── *.tsx           # Component files
│   │   └── *.stories.tsx   # Storybook stories
│   ├── /services           # Business logic services
│   │   ├── customer-sync.service.ts
│   │   └── webhook-test.service.ts
│   ├── /utils              # Utility functions
│   │   ├── *-adapter.ts    # Database adapters
│   │   └── *.server.ts     # Server-only utilities
│   ├── shopify.server.ts   # Shopify configuration
│   ├── db.server.ts        # Database client
│   └── root.tsx            # Root application
├── /prisma
│   ├── schema.prisma       # Database schema
│   └── /migrations         # Database migrations
├── /public                 # Static assets
├── /docs                   # Documentation
└── /tests                  # Test files
```

## 💻 Development Environment

### Environment Variables

```bash
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/rewardspro"
DIRECT_URL="${DATABASE_URL}"  # For migrations

# Aurora Data API (optional for local)
AURORA_RESOURCE_ARN="arn:aws:rds:region:account:cluster:name"
AURORA_SECRET_ARN="arn:aws:secretsmanager:region:account:secret:name"
AURORA_DATABASE_NAME="rewardspro"
AWS_ACCESS_KEY_ID="your-key"
AWS_SECRET_ACCESS_KEY="your-secret"
AWS_REGION="eu-north-1"

# Shopify
SHOPIFY_API_KEY="your-api-key"
SHOPIFY_API_SECRET="your-api-secret"
SCOPES="read_customers,write_customers,read_orders"
SHOPIFY_APP_URL="https://your-tunnel.ngrok.io"

# Development
NODE_ENV="development"
```

### Local Database Setup

```bash
# Using Docker
docker run --name rewardspro-db \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=rewardspro \
  -p 5432:5432 \
  -d postgres:14

# Create database
createdb rewardspro

# Run migrations
npx prisma migrate dev

# Seed data (if available)
npx prisma db seed
```

## 🔧 Common Development Tasks

### Working with Routes

```typescript
// app/routes/app.example.tsx
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Data loading
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  const data = await db.model.findMany({
    where: { shop: session.shop }
  });
  
  return json({ data });
};

// Form handling
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  // Process form data
  
  return json({ success: true });
};

// Component
export default function ExamplePage() {
  const { data } = useLoaderData<typeof loader>();
  
  return (
    <Page title="Example">
      {/* Your UI here */}
    </Page>
  );
}
```

### Working with Services

```typescript
// app/services/example.service.ts
export class ExampleService {
  constructor(
    private shop: string,
    private admin: AdminApiContext
  ) {}

  async processData(input: InputType): Promise<ResultType> {
    // Business logic here
    
    // Database operations
    const result = await db.model.create({
      data: { /* ... */ }
    });
    
    // External API calls
    const response = await this.admin.graphql(query);
    
    return result;
  }
}

// Usage in route
const service = new ExampleService(session.shop, admin);
const result = await service.processData(input);
```

### Working with Webhooks

```typescript
// app/routes/webhooks.example.tsx
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  
  if (!topic) {
    throw new Response("No webhook topic", { status: 400 });
  }
  
  // Process webhook
  switch (topic) {
    case "ORDERS_PAID":
      await processOrderPaid(shop, payload);
      break;
    default:
      console.log(`Unhandled webhook: ${topic}`);
  }
  
  return new Response(null, { status: 200 });
};
```

## 🧪 Testing

### Unit Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test customer-sync

# Watch mode
npm test -- --watch

# Coverage report
npm test -- --coverage
```

### Example Test

```typescript
// app/services/__tests__/customer-sync.test.ts
import { CustomerSyncService } from "../customer-sync.service";

describe("CustomerSyncService", () => {
  let service: CustomerSyncService;
  
  beforeEach(() => {
    service = new CustomerSyncService(/* mocks */);
  });
  
  test("should sync customers successfully", async () => {
    const result = await service.syncAllCustomers();
    
    expect(result.success).toBe(true);
    expect(result.processed).toBeGreaterThan(0);
  });
});
```

### Integration Testing

```typescript
// tests/integration/customer-flow.test.ts
describe("Customer Flow", () => {
  test("complete customer journey", async () => {
    // 1. Create customer
    // 2. Assign tier
    // 3. Process order
    // 4. Check store credit
    // 5. Verify tier upgrade
  });
});
```

## 🐛 Debugging

### Debug Configuration (VS Code)

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Remix",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "skipFiles": ["<node_internals>/**"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  ]
}
```

### Common Debugging Commands

```bash
# Check TypeScript errors
npm run typecheck

# Check linting issues
npm run lint

# Database debugging
npx prisma studio  # Visual database browser

# Check current migration status
npx prisma migrate status

# Reset database (CAUTION: deletes all data)
npx prisma migrate reset
```

### Logging Best Practices

```typescript
// Use structured logging
console.log("[ServiceName] Operation started", {
  shop,
  customerId,
  timestamp: new Date().toISOString()
});

// Error logging with context
console.error("[ServiceName] Operation failed", {
  error: error.message,
  stack: error.stack,
  context: { shop, customerId }
});

// Performance logging
const startTime = Date.now();
// ... operation ...
console.log(`[ServiceName] Operation completed in ${Date.now() - startTime}ms`);
```

## 📝 Code Style Guide

### TypeScript Best Practices

```typescript
// ✅ Use explicit types
interface CustomerData {
  id: string;
  email: string;
  tier: TierType | null;
}

// ✅ Use type guards
function isValidCustomer(data: unknown): data is CustomerData {
  return typeof data === 'object' && 
         data !== null &&
         'id' in data &&
         'email' in data;
}

// ✅ Use enums for constants
enum TierType {
  BRONZE = 'BRONZE',
  SILVER = 'SILVER',
  GOLD = 'GOLD'
}

// ✅ Use optional chaining
const tierName = customer?.currentTier?.name ?? 'No tier';

// ❌ Avoid any types
// ❌ Avoid non-null assertions without checks
// ❌ Avoid magic numbers/strings
```

### React/Remix Patterns

```typescript
// ✅ Use Remix conventions
export { loader, action } from "./route-logic";
export default Component;

// ✅ Colocate related code
// routes/
//   app.customers.tsx (route)
//   app.customers.server.ts (server logic)
//   app.customers.types.ts (types)

// ✅ Use error boundaries
export function ErrorBoundary() {
  const error = useRouteError();
  return <ErrorDisplay error={error} />;
}

// ✅ Optimize rerenders
const MemoizedComponent = React.memo(Component);
const callback = useCallback(() => {}, [dependency]);
const value = useMemo(() => compute(), [dependency]);
```

## 🚦 Pre-commit Checklist

Before committing code:

- [ ] Code compiles without errors (`npm run build`)
- [ ] TypeScript has no errors (`npm run typecheck`)
- [ ] Linting passes (`npm run lint`)
- [ ] Tests pass (`npm test`)
- [ ] Database migrations are created if schema changed
- [ ] Environment variables are documented
- [ ] Complex logic has comments
- [ ] No sensitive data in code
- [ ] Performance implications considered
- [ ] Error handling implemented

## 🔄 Hot Reloading

The development server supports hot reloading:

- **Routes**: Automatic reload on change
- **Components**: Fast refresh preserves state
- **Styles**: Instant updates
- **Server code**: Full reload required

## 🎯 Development Tips

### 1. Use the Shopify CLI

```bash
# Generate resources
shopify app generate extension

# Run with tunneling
shopify app dev

# Deploy to Shopify
shopify app deploy
```

### 2. Database Tips

```bash
# View current schema
npx prisma studio

# Format schema file
npx prisma format

# Validate schema
npx prisma validate
```

### 3. Performance Tips

- Use `defer` for non-critical data in loaders
- Implement pagination for large datasets
- Use database indexes for frequent queries
- Cache expensive computations
- Optimize images and assets

### 4. Security Tips

- Always validate user input
- Use CSRF protection for forms
- Sanitize data before rendering
- Keep dependencies updated
- Use environment variables for secrets

## 📚 Learning Resources

### Official Documentation
- [Remix Documentation](https://remix.run/docs)
- [Shopify App Development](https://shopify.dev/docs/apps)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Polaris Components](https://polaris.shopify.com)

### Project-Specific Guides
- [architecture.md](./architecture.md) - System design
- [database.md](./database.md) - Database schema
- [deployment.md](./deployment.md) - Deployment process
- [troubleshooting.md](./troubleshooting.md) - Common issues

## 🤝 Contributing

### Pull Request Process

1. Create feature branch from `main`
2. Make changes following style guide
3. Write/update tests
4. Update documentation
5. Create PR with description
6. Wait for review
7. Address feedback
8. Merge after approval

### Code Review Guidelines

- Check for business logic correctness
- Verify type safety
- Review database query efficiency
- Ensure error handling
- Validate security considerations
- Confirm documentation updates