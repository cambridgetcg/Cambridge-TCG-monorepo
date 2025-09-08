# Shopify Polaris Feedback Indicators - Best Practices & Implementation Guide

## Table of Contents
1. [Overview](#overview)
2. [Badge Component](#badge-component)
3. [Banner Component](#banner-component)
4. [Exception List Component](#exception-list-component)
5. [Progress Bar Component](#progress-bar-component)
6. [Skeleton Components](#skeleton-components)
7. [Spinner Component](#spinner-component)
8. [RewardsPro Implementation Examples](#rewardspro-implementation-examples)
9. [General Best Practices](#general-best-practices)

## Overview

Feedback indicators in Shopify Polaris are essential UI components that communicate system status, user actions, progress, and loading states. They help merchants understand what's happening in their store and guide them through various workflows.

### Key Principles
- **Clarity**: Always provide clear, actionable feedback
- **Consistency**: Use the same patterns across your application
- **Timing**: Show feedback at the right moment
- **Hierarchy**: Use appropriate severity levels and visual prominence

## Badge Component

### When to Use
- Display status information
- Show counts or quantities
- Highlight new features or updates
- Indicate completion states

### Implementation Examples

```tsx
import {Badge} from '@shopify/polaris';

// Basic status badges
function StatusBadges() {
  return (
    <>
      <Badge>Default</Badge>
      <Badge tone="success">Active</Badge>
      <Badge tone="attention">Requires action</Badge>
      <Badge tone="warning">Expiring soon</Badge>
      <Badge tone="critical">Overdue</Badge>
      <Badge tone="info">New</Badge>
    </>
  );
}

// Progress badges with custom labels
function ProgressBadges() {
  return (
    <>
      <Badge progress="incomplete">Not started</Badge>
      <Badge progress="partiallyComplete">In progress</Badge>
      <Badge progress="complete">Completed</Badge>
      
      {/* Override default labels */}
      <Badge 
        tone="attention" 
        progress="partiallyComplete"
        progressLabel="8 of 10 tasks"
      >
        Setup progress
      </Badge>
    </>
  );
}

// Small badges for compact spaces
function CompactBadge() {
  return (
    <Badge size="small" tone="info">
      New
    </Badge>
  );
}
```

### RewardsPro Badge Examples

```tsx
// Tier status badge
function TierBadge({ tier }: { tier: string }) {
  const getTone = (tierName: string) => {
    switch (tierName.toLowerCase()) {
      case 'platinum': return 'success';
      case 'gold': return 'attention';
      case 'silver': return 'info';
      default: return undefined;
    }
  };
  
  return <Badge tone={getTone(tier)}>{tier}</Badge>;
}

// Customer activity badge
function CustomerActivityBadge({ lastActivity }: { lastActivity: Date }) {
  const daysSinceActivity = Math.floor(
    (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  if (daysSinceActivity < 7) {
    return <Badge tone="success">Active</Badge>;
  } else if (daysSinceActivity < 30) {
    return <Badge tone="warning">Inactive</Badge>;
  } else {
    return <Badge tone="critical">Dormant</Badge>;
  }
}

// Reward points badge
function PointsBadge({ points }: { points: number }) {
  return (
    <Badge tone={points > 1000 ? 'success' : 'info'}>
      {points.toLocaleString()} points
    </Badge>
  );
}
```

### Best Practices
- **Use appropriate tones**: Match tone to the severity/importance of the information
- **Keep text concise**: Badges should contain 1-2 words maximum
- **Consider size**: Use small badges in tables or tight spaces
- **Accessibility**: Ensure color isn't the only indicator of meaning

## Banner Component

### When to Use
- Communicate important messages that affect an entire page or section
- Display success/error messages after actions
- Show contextual information or tips
- Alert users to critical issues

### Implementation Examples

```tsx
import {Banner, Card, Modal} from '@shopify/polaris';
import {useState} from 'react';

// Basic banners with different tones
function StatusBanners() {
  return (
    <>
      <Banner>Default informational message</Banner>
      
      <Banner tone="success">
        Your changes have been saved successfully.
      </Banner>
      
      <Banner tone="warning">
        Your trial expires in 3 days.
      </Banner>
      
      <Banner tone="critical">
        Payment failed. Please update your payment method.
      </Banner>
    </>
  );
}

// Dismissible banner
function DismissibleBanner() {
  const [isDismissed, setIsDismissed] = useState(false);
  
  if (isDismissed) return null;
  
  return (
    <Banner 
      onDismiss={() => setIsDismissed(true)}
      tone="info"
    >
      Check out our new features!
    </Banner>
  );
}

// Banner with action
function ActionBanner() {
  return (
    <Banner
      title="Inventory running low"
      tone="warning"
      action={{content: 'View products', url: '/products'}}
      secondaryAction={{content: 'Dismiss'}}
    >
      <p>5 products are running low on inventory.</p>
    </Banner>
  );
}
```

### RewardsPro Banner Examples

```tsx
// Tier upgrade notification
function TierUpgradeBanner({ customer, newTier }) {
  return (
    <Banner
      title="Congratulations!"
      tone="success"
      action={{
        content: 'View benefits',
        url: `/app/tiers/${newTier.id}`
      }}
    >
      <p>
        {customer.name} has been upgraded to {newTier.name} tier 
        and will now earn {newTier.cashbackPercent}% cashback!
      </p>
    </Banner>
  );
}

// Low store credit warning
function LowCreditBanner({ customers }) {
  return (
    <Banner
      title="Store credit running low"
      tone="warning"
      action={{
        content: 'Review balances',
        url: '/app/customers?filter=low-credit'
      }}
    >
      <p>
        {customers.length} customers have less than $10 in store credit.
        Consider running a promotion to boost engagement.
      </p>
    </Banner>
  );
}

// Setup incomplete banner
function SetupIncompleteBanner({ completedSteps, totalSteps }) {
  const progress = Math.round((completedSteps / totalSteps) * 100);
  
  return (
    <Banner
      title="Complete your RewardsPro setup"
      tone="info"
      action={{
        content: 'Continue setup',
        url: '/app/setup'
      }}
    >
      <p>
        You've completed {completedSteps} of {totalSteps} steps ({progress}%).
        Finish setup to start rewarding your customers!
      </p>
    </Banner>
  );
}
```

### Best Practices
- **Position appropriately**: Place at the top of the relevant context
- **Use focus management**: Auto-focus critical banners after actions
- **Provide actions**: Include relevant actions to resolve the issue
- **Allow dismissal**: Make informational banners dismissible
- **Keep messages concise**: Get to the point quickly

## Exception List Component

### When to Use
- Display multiple related errors or warnings
- Show validation errors for form submissions
- List issues that need attention

### Implementation Examples

```tsx
import {ExceptionList} from '@shopify/polaris';
import {AlertCircleIcon, InfoIcon} from '@shopify/polaris-icons';

// Basic exception list
function ValidationErrors() {
  const errors = [
    {
      status: 'critical' as const,
      message: 'Product title is required'
    },
    {
      status: 'critical' as const, 
      message: 'Price must be greater than 0'
    },
    {
      status: 'warning' as const,
      message: 'Description is recommended for better SEO'
    }
  ];
  
  return <ExceptionList items={errors} />;
}
```

### RewardsPro Exception List Examples

```tsx
// Tier validation errors
function TierValidationErrors({ errors }) {
  const exceptionItems = errors.map(error => ({
    status: 'critical' as const,
    message: error.message,
    icon: AlertCircleIcon
  }));
  
  return (
    <Card>
      <Card.Section>
        <ExceptionList items={exceptionItems} />
      </Card.Section>
    </Card>
  );
}

// Customer import issues
function ImportIssues({ issues }) {
  const items = [
    ...issues.errors.map(e => ({
      status: 'critical' as const,
      message: e,
      truncate: false
    })),
    ...issues.warnings.map(w => ({
      status: 'warning' as const,
      message: w,
      truncate: false
    }))
  ];
  
  return (
    <Banner tone="warning" title="Import completed with issues">
      <ExceptionList items={items} />
    </Banner>
  );
}

// Bulk operation results
function BulkOperationResults({ results }) {
  const items = [];
  
  if (results.failed.length > 0) {
    items.push({
      status: 'critical' as const,
      message: `${results.failed.length} operations failed`,
      icon: AlertCircleIcon
    });
  }
  
  if (results.partial.length > 0) {
    items.push({
      status: 'warning' as const,
      message: `${results.partial.length} operations partially completed`,
      icon: InfoIcon
    });
  }
  
  if (results.succeeded.length > 0) {
    items.push({
      status: 'success' as const,
      message: `${results.succeeded.length} operations succeeded`,
      icon: CheckIcon
    });
  }
  
  return <ExceptionList items={items} />;
}
```

### Best Practices
- **Group related issues**: Keep exceptions contextually relevant
- **Order by severity**: Show critical issues first
- **Provide clear messages**: Explain what went wrong and how to fix it
- **Use appropriate icons**: Enhance understanding with visual cues

## Progress Bar Component

### When to Use
- Show progress through multi-step processes
- Indicate loading progress for long operations
- Display completion status for tasks

### Implementation Examples

```tsx
import {ProgressBar, Stack, Text} from '@shopify/polaris';
import {useState, useEffect} from 'react';

// Basic progress bar
function SimpleProgress() {
  return <ProgressBar progress={75} />;
}

// Progress with label
function LabeledProgress() {
  const progress = 60;
  
  return (
    <Stack vertical>
      <Text variant="bodyMd">Uploading files...</Text>
      <ProgressBar progress={progress} />
      <Text variant="bodySm" tone="subdued">
        {progress}% complete
      </Text>
    </Stack>
  );
}
```

### RewardsPro Progress Bar Examples

```tsx
// Tier progress indicator
function TierProgressBar({ customer, currentTier, nextTier }) {
  const progress = nextTier
    ? ((customer.lifetimeSpending - currentTier.minSpend) / 
       (nextTier.minSpend - currentTier.minSpend)) * 100
    : 100;
    
  return (
    <Card>
      <Card.Section>
        <Stack vertical spacing="tight">
          <Stack distribution="equalSpacing">
            <Text variant="headingSm">{currentTier.name}</Text>
            {nextTier && <Text variant="headingSm">{nextTier.name}</Text>}
          </Stack>
          <ProgressBar 
            progress={Math.min(progress, 100)} 
            tone="success"
            size="small"
          />
          <Text variant="bodySm" tone="subdued">
            ${customer.lifetimeSpending.toFixed(2)} spent
            {nextTier && ` / $${nextTier.minSpend} to reach ${nextTier.name}`}
          </Text>
        </Stack>
      </Card.Section>
    </Card>
  );
}

// Cashback calculation progress
function CashbackCalculationProgress({ totalOrders, processed }) {
  const progress = (processed / totalOrders) * 100;
  
  return (
    <Stack vertical>
      <Text variant="bodyMd">
        Processing cashback for {totalOrders} orders
      </Text>
      <ProgressBar 
        progress={progress}
        tone={progress === 100 ? 'success' : 'primary'}
        animated={progress < 100}
      />
      <Text variant="bodySm" tone="subdued">
        {processed} of {totalOrders} orders processed
      </Text>
    </Stack>
  );
}

// Setup progress
function SetupProgress({ completedSteps }) {
  const steps = [
    'Create first tier',
    'Configure cashback rules',
    'Import customers',
    'Test checkout flow',
    'Go live'
  ];
  
  const progress = (completedSteps.length / steps.length) * 100;
  
  return (
    <Card>
      <Card.Section>
        <Stack vertical>
          <Text variant="headingMd">Setup Progress</Text>
          <ProgressBar progress={progress} size="small" />
          <Stack vertical spacing="extraTight">
            {steps.map((step, index) => (
              <Text 
                key={step}
                variant="bodySm"
                tone={completedSteps.includes(index) ? 'success' : 'subdued'}
              >
                {completedSteps.includes(index) ? '✓' : '○'} {step}
              </Text>
            ))}
          </Stack>
        </Stack>
      </Card.Section>
    </Card>
  );
}
```

### Best Practices
- **Provide context**: Always show what's being processed
- **Show actual progress**: Avoid indeterminate states when possible
- **Use appropriate sizes**: Small for inline, default for standalone
- **Consider animation**: Disable for very quick updates to avoid flashing

## Skeleton Components

### When to Use
- Initial page load states
- Content that's being fetched
- Placeholder for dynamic content
- Reducing layout shift

### Implementation Examples

```tsx
import {
  SkeletonPage,
  SkeletonBodyText,
  SkeletonDisplayText,
  SkeletonThumbnail,
  SkeletonTabs,
  Layout,
  Card,
  Stack
} from '@shopify/polaris';

// Full page skeleton
function PageLoadingState() {
  return (
    <SkeletonPage primaryAction>
      <Layout>
        <Layout.Section>
          <Card>
            <SkeletonBodyText lines={3} />
          </Card>
          <Card>
            <SkeletonBodyText lines={5} />
          </Card>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <Card>
            <SkeletonBodyText lines={2} />
          </Card>
        </Layout.Section>
      </Layout>
    </SkeletonPage>
  );
}
```

### RewardsPro Skeleton Examples

```tsx
// Customer list skeleton
function CustomerListSkeleton() {
  return (
    <Card>
      {[...Array(5)].map((_, i) => (
        <Card.Section key={i}>
          <Stack alignment="center">
            <SkeletonThumbnail size="small" />
            <Stack.Item fill>
              <SkeletonDisplayText size="small" />
              <SkeletonBodyText lines={1} />
            </Stack.Item>
            <SkeletonBodyText lines={1} />
          </Stack>
        </Card.Section>
      ))}
    </Card>
  );
}

// Tier card skeleton
function TierCardSkeleton() {
  return (
    <Card>
      <Card.Section>
        <Stack vertical>
          <SkeletonDisplayText size="medium" />
          <SkeletonBodyText lines={2} />
          <Stack distribution="equalSpacing">
            <SkeletonBodyText lines={1} />
            <SkeletonBodyText lines={1} />
          </Stack>
        </Stack>
      </Card.Section>
    </Card>
  );
}

// Analytics dashboard skeleton
function AnalyticsSkeleton() {
  return (
    <Page>
      <Layout>
        <Layout.Section>
          <Card>
            <Card.Section>
              <SkeletonDisplayText size="small" />
              <div style={{ height: '200px', marginTop: '16px' }}>
                <SkeletonBodyText lines={10} />
              </div>
            </Card.Section>
          </Card>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <Stack vertical>
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <Card.Section>
                  <SkeletonDisplayText size="small" />
                  <SkeletonBodyText lines={2} />
                </Card.Section>
              </Card>
            ))}
          </Stack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

### Best Practices
- **Match actual content structure**: Skeletons should mirror real content layout
- **Use appropriate sizes**: Match the size of actual content
- **Avoid overuse**: Only for content that takes >1 second to load
- **Maintain layout**: Prevent content shift when data loads

## Spinner Component

### When to Use
- Short loading operations (<3 seconds)
- Inline loading states
- Button loading states
- Refreshing content

### Implementation Examples

```tsx
import {Spinner, Button, Stack, Frame, Text} from '@shopify/polaris';
import {useState, useRef, useEffect} from 'react';

// Basic spinner
function BasicSpinner() {
  return <Spinner accessibilityLabel="Loading" />;
}

// Inline spinner with text
function InlineLoading() {
  return (
    <Stack alignment="center">
      <Spinner size="small" />
      <Text>Loading products...</Text>
    </Stack>
  );
}
```

### RewardsPro Spinner Examples

```tsx
// Customer search loading
function CustomerSearchLoading({ isSearching }) {
  if (!isSearching) return null;
  
  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <Stack vertical alignment="center">
        <Spinner size="small" />
        <Text variant="bodySm" tone="subdued">
          Searching customers...
        </Text>
      </Stack>
    </div>
  );
}

// Store credit update button
function StoreCreditUpdateButton({ customerId, newBalance }) {
  const [isUpdating, setIsUpdating] = useState(false);
  
  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      await updateStoreCredit(customerId, newBalance);
      // Show success toast
    } catch (error) {
      // Show error banner
    } finally {
      setIsUpdating(false);
    }
  };
  
  return (
    <Button
      primary
      loading={isUpdating}
      onClick={handleUpdate}
    >
      Update Balance
    </Button>
  );
}

// Tier recalculation
function TierRecalculation({ shop }) {
  const [isRecalculating, setIsRecalculating] = useState(false);
  
  const handleRecalculate = async () => {
    setIsRecalculating(true);
    await recalculateTiers(shop);
    setIsRecalculating(false);
  };
  
  return (
    <Card>
      <Card.Section>
        {isRecalculating ? (
          <Stack vertical alignment="center">
            <Spinner />
            <Text>Recalculating customer tiers...</Text>
            <Text variant="bodySm" tone="subdued">
              This may take a few moments
            </Text>
          </Stack>
        ) : (
          <Button onClick={handleRecalculate}>
            Recalculate All Tiers
          </Button>
        )}
      </Card.Section>
    </Card>
  );
}
```

### Best Practices
- **Use appropriate sizes**: Small for inline, large for page-level
- **Provide accessibility labels**: Always include descriptive labels
- **Consider focus management**: Handle focus properly after loading
- **Avoid multiple spinners**: Use one prominent spinner per context
- **Set timeouts**: Switch to progress bars for operations >3 seconds

## RewardsPro Implementation Examples

### Complete Loading Pattern

```tsx
// app/components/DataLoader.tsx
import { useState, useEffect } from 'react';
import { 
  Card, 
  SkeletonBodyText, 
  Banner, 
  Button 
} from '@shopify/polaris';

interface DataLoaderProps<T> {
  loadData: () => Promise<T>;
  renderData: (data: T) => React.ReactNode;
  skeletonLines?: number;
}

function DataLoader<T>({ 
  loadData, 
  renderData, 
  skeletonLines = 3 
}: DataLoaderProps<T>) {
  const [state, setState] = useState<{
    loading: boolean;
    data: T | null;
    error: Error | null;
  }>({
    loading: true,
    data: null,
    error: null
  });
  
  const fetchData = async () => {
    setState({ loading: true, data: null, error: null });
    try {
      const data = await loadData();
      setState({ loading: false, data, error: null });
    } catch (error) {
      setState({ 
        loading: false, 
        data: null, 
        error: error as Error 
      });
    }
  };
  
  useEffect(() => {
    fetchData();
  }, []);
  
  if (state.loading) {
    return (
      <Card>
        <Card.Section>
          <SkeletonBodyText lines={skeletonLines} />
        </Card.Section>
      </Card>
    );
  }
  
  if (state.error) {
    return (
      <Banner 
        tone="critical"
        action={{
          content: 'Retry',
          onAction: fetchData
        }}
      >
        {state.error.message}
      </Banner>
    );
  }
  
  return <>{renderData(state.data!)}</>;
}
```

### Optimistic Updates with Feedback

```tsx
// app/components/OptimisticUpdate.tsx
function OptimisticTierUpdate({ tier }) {
  const [optimisticTier, setOptimisticTier] = useState(tier);
  const [updateState, setUpdateState] = useState<
    'idle' | 'updating' | 'success' | 'error'
  >('idle');
  
  const handleUpdate = async (updates: Partial<Tier>) => {
    // Optimistically update UI
    setOptimisticTier({ ...optimisticTier, ...updates });
    setUpdateState('updating');
    
    try {
      const updatedTier = await updateTier(tier.id, updates);
      setOptimisticTier(updatedTier);
      setUpdateState('success');
      
      // Clear success state after delay
      setTimeout(() => setUpdateState('idle'), 3000);
    } catch (error) {
      // Revert optimistic update
      setOptimisticTier(tier);
      setUpdateState('error');
    }
  };
  
  return (
    <>
      {updateState === 'success' && (
        <Banner tone="success" onDismiss={() => setUpdateState('idle')}>
          Tier updated successfully
        </Banner>
      )}
      
      {updateState === 'error' && (
        <Banner 
          tone="critical" 
          action={{
            content: 'Retry',
            onAction: () => handleUpdate(optimisticTier)
          }}
        >
          Failed to update tier. Please try again.
        </Banner>
      )}
      
      <TierForm 
        tier={optimisticTier}
        onSubmit={handleUpdate}
        isUpdating={updateState === 'updating'}
      />
    </>
  );
}
```

## General Best Practices

### 1. Loading State Hierarchy
```tsx
// Recommended loading state progression
function LoadingStateProgression({loadTime}) {
  if (loadTime < 100) return null; // No indicator for instant loads
  if (loadTime < 1000) return <Spinner size="small" />; // Spinner for quick loads
  if (loadTime < 3000) return <Spinner />; // Standard spinner
  return <ProgressBar progress={calculateProgress()} />; // Progress bar for long operations
}
```

### 2. Error Handling Pattern
```tsx
function DataFetcher() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    data: null
  });
  
  if (state.loading) {
    return <SkeletonBodyText lines={3} />;
  }
  
  if (state.error) {
    return (
      <Banner 
        tone="critical"
        action={{content: 'Retry', onAction: fetchData}}
      >
        {state.error.message}
      </Banner>
    );
  }
  
  return <DataDisplay data={state.data} />;
}
```

### 3. Contextual Feedback
```tsx
function ContextualFeedback({context}) {
  switch(context) {
    case 'inline':
      return <Badge tone="success">Saved</Badge>;
    case 'section':
      return <Banner tone="success">Changes saved successfully</Banner>;
    case 'page':
      return <Toast content="Updated successfully" />;
    default:
      return null;
  }
}
```

### 4. Progressive Disclosure
```tsx
function ProgressiveValidation() {
  const [errors, setErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);
  
  return (
    <>
      {errors.length > 0 && (
        <Banner tone="critical" title="Please fix the following errors:">
          <ExceptionList items={errors} />
        </Banner>
      )}
      
      {errors.length === 0 && warnings.length > 0 && (
        <Banner tone="warning" title="Consider addressing:">
          <ExceptionList items={warnings} />
        </Banner>
      )}
    </>
  );
}
```

### 5. Accessibility Considerations
- Always provide meaningful labels for loading states
- Announce status changes to screen readers
- Maintain focus position during loading
- Use appropriate ARIA attributes
- Ensure color isn't the only indicator

### 6. Performance Tips
- Debounce rapid state changes to avoid flashing
- Use skeleton screens for initial loads
- Implement optimistic updates where appropriate
- Cache loading states to prevent redundant indicators
- Consider lazy loading for heavy components

### 7. Testing Strategies
```tsx
// Mock slow network for testing
function useSlowNetwork(delay = 2000) {
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  
  return isLoading;
}

// Test different states
function TestableComponent() {
  const showLoading = useSlowNetwork(1000);
  const showError = useSlowNetwork(2000);
  
  if (showLoading) return <Spinner />;
  if (showError) return <Banner tone="critical">Error state</Banner>;
  return <div>Success state</div>;
}
```

## Summary

Effective use of feedback indicators is crucial for creating intuitive merchant experiences in RewardsPro. Remember to:

1. **Choose the right component** for your use case
2. **Maintain consistency** across your application
3. **Provide clear, actionable feedback**
4. **Consider loading performance** and user perception
5. **Test all states** including loading, error, and success
6. **Ensure accessibility** for all users

For live examples, visit the Polaris documentation at:
```
https://polaris.shopify.com/components/feedback-indicators
```