# /app/routes Directory - Application Routes

## 📁 Route Structure

Remix uses file-based routing where the file name determines the URL path:
- `.` creates nested routes (e.g., `app.customers.tsx` → `/app/customers`)
- `_` creates pathless routes (e.g., `_index` → `/`)
- `$` creates dynamic segments (e.g., `auth.$.tsx` → `/auth/*`)

## 🗂️ Route Files

### 🏠 Root Routes

#### app.tsx
**Path**: `/app/*`
**Purpose**: Main authenticated app wrapper
- Authenticates all child routes
- Provides app-wide layout with Polaris
- Sets up navigation structure
- Handles loading states

**Key Functions**:
- `loader`: Authenticates admin session
- Default export: Layout component with Outlet

#### _index/route.tsx
**Path**: `/`
**Purpose**: Public landing page
- Unauthenticated route
- Marketing/information page
- Links to app installation

### 📱 App Routes (Protected)

#### app._index.tsx
**Path**: `/app`
**Purpose**: Main dashboard after login
- Welcome screen with quick actions
- Sample product generator
- Navigation to main features
- Store overview

**Key Functions**:
- `loader`: Verifies authentication
- `action`: Creates sample products
- Uses TitleBar for primary actions

#### app.customers.tsx
**Path**: `/app/customers`
**Purpose**: Customer management interface
**Features**:
- List all customers with pagination
- Display store credit balances
- Show current tier assignments
- Search and filter capabilities
- Bulk actions support

**Data Loading**:
```typescript
loader: Fetches customers with tiers
action: Updates customer data
```

#### app.tiers.tsx
**Path**: `/app/tiers`
**Purpose**: Loyalty tier configuration
**Features**:
- Create new tiers
- Edit existing tiers
- Set cashback percentages
- Configure spending thresholds
- Manage evaluation periods (Annual/Lifetime)

**Data Structure**:
```typescript
{
  name: string,
  minSpend: number,
  cashbackPercent: number,
  evaluationPeriod: 'ANNUAL' | 'LIFETIME'
}
```

### 🔐 Authentication Routes

#### auth.login/route.tsx
**Path**: `/auth/login`
**Purpose**: OAuth login initiation
- Redirects to Shopify OAuth
- Handles login errors
- Sets up session storage

#### auth.login/error.server.tsx
**Purpose**: Login error handling
- Displays authentication errors
- Provides retry mechanisms
- Logs error details

#### auth.$.tsx
**Path**: `/auth/*`
**Purpose**: OAuth callback handler
- Catches all OAuth responses
- Processes access tokens
- Creates/updates sessions
- Redirects to app after success

### 🔔 Webhook Routes

#### webhooks.orders.paid.tsx
**Path**: `/webhooks/orders/paid`
**Purpose**: Process completed orders
**Flow**:
1. Receive order webhook
2. Calculate cashback amount
3. Update customer store credit
4. Check tier progression
5. Create ledger entry
6. Send confirmation

**Validation**:
- HMAC signature verification
- Order status checking
- Duplicate prevention

#### webhooks.app.uninstalled.tsx
**Path**: `/webhooks/app/uninstalled`
**Purpose**: Clean up on app uninstall
**Actions**:
- Remove all shop sessions
- Archive shop data
- Cancel subscriptions
- Log uninstall reason

#### webhooks.shop.update.tsx
**Path**: `/webhooks/shop/update`
**Purpose**: Sync shop data changes
**Updates**:
- Shop name/URL
- Currency settings
- Timezone
- Plan changes

#### webhooks.app.scopes_update.tsx
**Path**: `/webhooks/app/scopes_update`
**Purpose**: Handle scope changes
- Update session scopes
- Request re-authentication if needed
- Log scope changes

#### webhooks.compliance.tsx
**Path**: `/webhooks/compliance`
**Purpose**: GDPR compliance webhooks
**Handles**:
- Customer data requests
- Customer redact requests
- Shop redact requests

### 🔌 API Routes

#### api.test-session.tsx
**Path**: `/api/test-session`
**Purpose**: Debug endpoint
**Returns**:
```json
{
  "session": "active|inactive",
  "shop": "shop-domain.myshopify.com",
  "database": "connected|error"
}
```

## 🎯 Route Patterns

### Loader Pattern
```typescript
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  
  // Fetch data
  const data = await db.model.findMany({
    where: { shop: session.shop }
  });
  
  return json(data);
};
```

### Action Pattern
```typescript
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  // Process form
  const result = await db.model.create({
    data: { /* ... */ }
  });
  
  return redirect("/app/success");
};
```

### Error Boundary Pattern
```typescript
export function ErrorBoundary() {
  const error = useRouteError();
  
  if (isRouteErrorResponse(error)) {
    return <div>Error: {error.status}</div>;
  }
  
  return <div>Unknown error occurred</div>;
}
```

## 🔒 Authentication Flow

1. **Request to protected route** → `/app/customers`
2. **app.tsx loader** → Calls `authenticate.admin()`
3. **No valid session** → Redirect to `/auth/login`
4. **OAuth flow** → Shopify authorization
5. **Callback to** → `/auth/$`
6. **Session created** → Redirect to original route
7. **Access granted** → Route renders

## 📊 Data Flow

### Read Operations
1. Route `loader` fetches data
2. Component receives via `useLoaderData()`
3. Render with Polaris components

### Write Operations
1. Form submission to route `action`
2. Validate and process data
3. Update database
4. Return redirect or data

### Real-time Updates
1. Webhook received
2. Verify HMAC signature
3. Process webhook data
4. Update database
5. Return 200 OK

## 🚀 Best Practices

### Route Organization
- Group related routes with dot notation
- Use folders for complex routes
- Keep webhook routes separate
- Prefix API routes with `api.`

### Performance
- Implement pagination in loaders
- Use database indexes
- Cache frequently accessed data
- Minimize loader data

### Security
- Always authenticate in loaders/actions
- Verify webhook signatures
- Validate all input data
- Use CSRF protection

### Error Handling
- Implement ErrorBoundary components
- Log errors for debugging
- Provide user-friendly messages
- Handle edge cases

## 🔧 Adding New Routes

### Step 1: Create Route File
```bash
touch app/routes/app.newfeature.tsx
```

### Step 2: Implement Loader
```typescript
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  // Fetch and return data
};
```

### Step 3: Implement Action (if needed)
```typescript
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  // Handle form submission
};
```

### Step 4: Export Component
```typescript
export default function NewFeature() {
  const data = useLoaderData();
  return (
    <Page title="New Feature">
      {/* Component content */}
    </Page>
  );
}
```