# /app/components Directory - Reusable Components

## 📁 Directory Structure

```
/app/components
└── ErrorBoundary.tsx    # Global error handling component
```

## 🧩 Components

### ErrorBoundary.tsx

**Purpose**: Global error boundary for graceful error handling
**Usage**: Catches and displays errors throughout the application

**Features**:
- Catches JavaScript errors in component tree
- Displays user-friendly error messages
- Logs error details for debugging
- Provides recovery options

**Implementation Pattern**:
```typescript
export function ErrorBoundary() {
  const error = useRouteError();
  
  // Handle different error types
  if (isRouteErrorResponse(error)) {
    return (
      <div>
        <h1>Error {error.status}</h1>
        <p>{error.statusText}</p>
      </div>
    );
  }
  
  // Generic error handling
  return (
    <div>
      <h1>Something went wrong</h1>
      <p>Please try refreshing the page</p>
    </div>
  );
}
```

## 🎯 Component Guidelines

### Creating New Components

1. **File Naming**: Use PascalCase (e.g., `CustomerCard.tsx`)
2. **Export Pattern**: Named exports for components
3. **Type Safety**: Use TypeScript interfaces for props
4. **Styling**: Use Shopify Polaris components

### Component Structure Template

```typescript
import { ComponentProps } from 'react';
import { Card, Text } from '@shopify/polaris';

interface MyComponentProps {
  title: string;
  description?: string;
}

export function MyComponent({ title, description }: MyComponentProps) {
  return (
    <Card>
      <Text variant="headingMd" as="h2">
        {title}
      </Text>
      {description && (
        <Text variant="bodyMd" as="p">
          {description}
        </Text>
      )}
    </Card>
  );
}
```

## 🎨 Shopify Polaris Integration

### Commonly Used Polaris Components

- **Layout**: `Page`, `Layout`, `Card`
- **Forms**: `Form`, `FormLayout`, `TextField`, `Select`
- **Feedback**: `Banner`, `Toast`, `Modal`
- **Navigation**: `Tabs`, `Link`
- **Actions**: `Button`, `ButtonGroup`
- **Data Display**: `DataTable`, `IndexTable`

### Polaris Best Practices

1. **Consistency**: Always use Polaris components
2. **Accessibility**: Components are WCAG compliant
3. **Responsive**: Built-in responsive behavior
4. **Theming**: Follows Shopify admin theme

## 🔄 State Management

### Local State
```typescript
const [isLoading, setIsLoading] = useState(false);
```

### Form State with Remix
```typescript
const fetcher = useFetcher();
const isSubmitting = fetcher.state === "submitting";
```

### Data from Loaders
```typescript
const data = useLoaderData<typeof loader>();
```

## 📋 Common Component Patterns

### Loading States
```typescript
if (isLoading) {
  return (
    <Card>
      <SkeletonBodyText />
    </Card>
  );
}
```

### Empty States
```typescript
if (data.length === 0) {
  return (
    <Card>
      <EmptyState
        heading="No items found"
        action={{ content: 'Add item', onAction: handleAdd }}
        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
      >
        <p>Get started by adding your first item.</p>
      </EmptyState>
    </Card>
  );
}
```

### Error States
```typescript
if (error) {
  return (
    <Banner status="critical">
      <p>An error occurred: {error.message}</p>
    </Banner>
  );
}
```

## 🚀 Future Components to Build

### Suggested Components

1. **CustomerCard.tsx**
   - Display customer info
   - Show store credit balance
   - Current tier badge

2. **TierBadge.tsx**
   - Visual tier indicator
   - Cashback percentage
   - Progress to next tier

3. **CreditTransaction.tsx**
   - Transaction details
   - Amount with formatting
   - Transaction type icon

4. **StatsCard.tsx**
   - Metric display
   - Trend indicator
   - Comparison period

5. **SearchBar.tsx**
   - Customer search
   - Filter options
   - Quick actions

## 🔧 Component Development Workflow

### 1. Create Component File
```bash
touch app/components/NewComponent.tsx
```

### 2. Define TypeScript Interface
```typescript
interface NewComponentProps {
  // Define props
}
```

### 3. Implement Component
```typescript
export function NewComponent(props: NewComponentProps) {
  // Component logic
}
```

### 4. Add to Route
```typescript
import { NewComponent } from "~/components/NewComponent";
```

## 📦 Component Exports

### Barrel Export Pattern (Optional)
Create `app/components/index.ts`:
```typescript
export { ErrorBoundary } from './ErrorBoundary';
export { CustomerCard } from './CustomerCard';
export { TierBadge } from './TierBadge';
```

Then import:
```typescript
import { ErrorBoundary, CustomerCard } from '~/components';
```

## 🧪 Testing Components

### Unit Testing Pattern
```typescript
import { render, screen } from '@testing-library/react';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('renders title', () => {
    render(<MyComponent title="Test Title" />);
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });
});
```

## 🎭 Component Performance

### Optimization Tips

1. **Memoization**: Use `React.memo` for expensive components
2. **Lazy Loading**: Use `React.lazy` for large components
3. **Keys**: Always use stable keys in lists
4. **Dependencies**: Minimize useEffect dependencies

### Example Optimized Component
```typescript
import { memo } from 'react';

export const ExpensiveComponent = memo(function ExpensiveComponent({ data }) {
  // Component that re-renders only when data changes
  return <div>{/* ... */}</div>;
});
```