# /app Directory - Remix Application Core

## 📁 Directory Structure

```
/app
├── /routes              # Page routes and API endpoints
│   ├── /auth.login     # Login flow components
│   ├── /_index         # Landing page components
│   ├── app.tsx         # App layout wrapper
│   ├── app._index.tsx  # App dashboard
│   ├── app.customers.tsx # Customer management
│   ├── app.tiers.tsx   # Tier configuration
│   └── webhooks.*.tsx  # Webhook handlers
├── /components         # Reusable React components
│   └── ErrorBoundary.tsx # Global error handling
├── /utils              # Utility functions and adapters
│   ├── aurora-data-api.ts # Aurora Data API client wrapper
│   ├── connection-strategy.ts # Environment-based DB routing
│   └── prisma-data-api-adapter.ts # Prisma-compatible Data API
├── shopify.server.ts   # Shopify app configuration
├── db.server.ts        # Intelligent database client
├── root.tsx            # Root application component
├── entry.server.tsx    # Server entry point
├── routes.ts           # Route configuration
└── globals.d.ts        # Global TypeScript definitions
```

## 🔑 Core Files

### Connection Management Utilities

#### utils/connection-strategy.ts
**Purpose**: Detects deployment environment and routes database connections
- Checks VERCEL_ENV to determine deployment type
- Returns appropriate connection configuration
- Production: 5 connection limit with direct connection
- Preview: 0 connections using Data API
- Development: Local direct connection
- Exports helper functions for configuration

#### utils/aurora-data-api.ts
**Purpose**: AWS Aurora Data API client wrapper
- Handles HTTP-based database queries
- Supports transactions without persistent connections
- Automatic retry logic for transient failures
- Parameter building helpers for type safety
- Used by preview deployments to prevent connection exhaustion

#### utils/prisma-data-api-adapter.ts
**Purpose**: Prisma-compatible interface for Data API
- Implements common Prisma methods (findMany, create, update, etc.)
- Maintains API compatibility with existing code
- Translates Prisma queries to SQL for Data API
- Supports transactions and aggregations
- Enables zero-connection preview deployments

### shopify.server.ts
**Purpose**: Central Shopify app configuration and authentication setup
- Initializes Shopify app with API credentials
- Configures session storage using Prisma
- Sets up authentication helpers
- Defines API version (January25)
- Exports authentication methods for use in routes

**Key Exports**:
- `authenticate` - Main authentication function
- `login` - OAuth login flow
- `sessionStorage` - Session management
- `registerWebhooks` - Webhook registration

### db.server.ts
**Purpose**: Intelligent database client with environment-based routing
- Routes to appropriate connection method based on VERCEL_ENV
- Production: Direct connection with 5 connection limit
- Preview: Aurora Data API (zero connections)
- Development: Local direct connection
- Prevents connection pool exhaustion
- Exports both Prisma client and Data API client

### root.tsx
**Purpose**: Root HTML document structure
- Sets up HTML shell for entire app
- Includes Shopify fonts and styles
- Configures meta tags and viewport
- Renders Remix `<Outlet/>` for route content

### entry.server.tsx
**Purpose**: Server-side rendering entry point
- Handles request/response streaming
- Configures error handling
- Sets up server-side rendering

## 📍 Routes

### Authentication Routes

#### /auth/login
- **route.tsx**: OAuth login initiation
- **error.server.tsx**: Login error handling
- Redirects to Shopify OAuth flow

#### /auth/$
- Catch-all OAuth callback handler
- Processes OAuth responses
- Creates/updates sessions

### App Routes

#### /app.tsx
**Purpose**: Main app layout wrapper
- Authenticates all child routes
- Provides app-wide layout
- Sets up Polaris AppProvider
- Handles navigation

#### /app._index.tsx
**Purpose**: Main dashboard/home page
- Shows app overview
- Quick stats and actions
- Sample product creation
- Navigation to main features

#### /app.customers.tsx
**Purpose**: Customer management interface
- List all customers
- View store credit balances
- Manage tier assignments
- Search and filter customers

#### /app.tiers.tsx
**Purpose**: Tier configuration page
- Create/edit loyalty tiers
- Set cashback percentages
- Configure spending thresholds
- Manage evaluation periods

### Webhook Routes

#### /webhooks.orders.paid.tsx
**Purpose**: Process paid orders
- Calculate cashback amounts
- Update customer store credit
- Check tier progression
- Create ledger entries

#### /webhooks.app.uninstalled.tsx
**Purpose**: App uninstall cleanup
- Remove shop sessions
- Clean up shop data
- Cancel active subscriptions

#### /webhooks.shop.update.tsx
**Purpose**: Shop data synchronization
- Update shop settings
- Sync shop metadata
- Handle plan changes

#### /webhooks.compliance.tsx
**Purpose**: GDPR compliance
- Handle data requests
- Process deletion requests
- Manage customer data privacy

### API Routes

#### /api.test-session.tsx
**Purpose**: Session testing endpoint
- Verify session validity
- Debug authentication issues
- Test database connectivity

## 🧩 Components

### ErrorBoundary.tsx
**Purpose**: Global error handling component
- Catches React errors
- Displays user-friendly error messages
- Logs errors for debugging
- Provides recovery actions

## 🔐 Authentication Flow

1. **Initial Request** → `app.tsx` calls `authenticate.admin()`
2. **No Session** → Redirect to `/auth/login`
3. **OAuth Flow** → Shopify OAuth → `/auth/$` callback
4. **Session Created** → Store in database via Prisma
5. **Authenticated** → Access granted to app routes

## 💾 Data Flow

1. **Route Loaders** fetch data using `db.server.ts`
2. **Components** receive data via `useLoaderData()`
3. **Actions** handle form submissions
4. **Mutations** update database via Prisma
5. **Responses** return updated data or redirects

## 🎨 UI Patterns

### Consistent Layout
- All app routes wrapped in `app.tsx` layout
- Shopify Polaris components throughout
- TitleBar with primary actions
- Page component for content structure

### Data Loading
```tsx
export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const data = await db.model.findMany();
  return json(data);
};
```

### Form Handling
```tsx
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  // Process form data
  return redirect("/app");
};
```

## 🔧 Development Tips

### Adding New Routes
1. Create file in `/routes` directory
2. Export `loader` for data fetching
3. Export `action` for mutations
4. Export default component for UI

### Using Authentication
```tsx
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  // Authenticated code here
};
```

### Database Queries
```tsx
import db from "~/db.server";

const customers = await db.customer.findMany({
  where: { shop: session.shop },
  include: { currentTier: true }
});
```

## 🐛 Common Issues

### Session Errors
- Check `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET`
- Verify app URL matches Shopify configuration
- Ensure database is accessible

### Route Not Found
- File must be in `/routes` directory
- File name determines route path
- Use `.` for nested routes, `_` for pathless routes

### Database Connection
- Verify `DATABASE_URL` is correct
- Check Prisma client is generated
- Ensure migrations are applied