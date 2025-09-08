# Responsive Implementation Guide for RewardsPro

## 🎯 Overview

This guide documents the responsive design patterns implemented in RewardsPro, following server-first principles and modern CSS techniques for smooth viewport transitions.

## 📁 Files Created

1. **`/app/styles/responsive.css`** - Global responsive CSS utilities
2. **`/app/hooks/useResponsive.ts`** - Custom hooks for responsive behavior
3. **`/app/utils/device-detection.server.ts`** - Server-side device detection

## 🔧 Implementation Patterns

### 1. Server-Side Device Detection

Update your route loaders to adapt data based on device:

```typescript
// app/routes/app.customers.tsx
import { detectDevice, getDataLimits } from "~/utils/device-detection.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const device = detectDevice(request);
  const limits = getDataLimits(device);
  
  const customers = await db.customer.findMany({
    take: limits.itemsPerPage, // Mobile: 10, Tablet: 20, Desktop: 50
    // ... rest of query
  });
  
  return defer({
    customers,
    device: device.type,
    // Defer non-critical data on mobile
    analytics: device.isMobile ? null : getAnalytics(),
  });
};
```

### 2. Responsive Polaris Components

Use responsive prop objects with Polaris components:

```typescript
import { Page, Layout, InlineGrid, Box, Card } from "@shopify/polaris";

export default function ResponsivePage() {
  return (
    <Page fullWidth>
      <Layout>
        <Layout.Section>
          <InlineGrid 
            columns={{ 
              xs: "1fr",           // Mobile: 1 column
              sm: "1fr 1fr",       // Small: 2 columns
              md: "1fr 1fr 1fr",   // Medium: 3 columns
              lg: "repeat(4, 1fr)" // Large: 4 columns
            }}
            gap={{ xs: "200", md: "400", lg: "500" }}
          >
            <Card>
              <Box padding={{ xs: "200", sm: "300", md: "400" }}>
                {/* Content with responsive padding */}
              </Box>
            </Card>
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

### 3. Using Responsive Hooks

```typescript
import { useBreakpoint, useResizeObserver, useHydrated } from "~/hooks/useResponsive";

function ResponsiveComponent() {
  const { mdUp, current } = useBreakpoint();
  const { ref, dimensions } = useResizeObserver<HTMLDivElement>();
  const hydrated = useHydrated();
  
  // Prevent hydration mismatches
  if (!hydrated) {
    return <UniversalLayout />;
  }
  
  return (
    <div ref={ref}>
      {mdUp ? (
        <DesktopLayout width={dimensions.width} />
      ) : (
        <MobileLayout />
      )}
      <Text variant="bodySm">Current breakpoint: {current}</Text>
    </div>
  );
}
```

### 4. CSS-First Responsive Patterns

Apply CSS classes for responsive behavior:

```tsx
// Use responsive grid
<div className="responsive-grid">
  {items.map(item => <Card key={item.id}>{/* ... */}</Card>)}
</div>

// Content visibility for performance
<div className="content-auto">
  <LongContentList />
</div>

// Prevent layout shifts
<img className="aspect-square" src={imageUrl} alt="" />

// Container queries
<div className="responsive-container">
  <div className="container-responsive">
    {/* Component adapts to container size */}
  </div>
</div>
```

### 5. Responsive Data Tables

Make tables responsive with horizontal scrolling on mobile:

```tsx
import { DataTable } from "@shopify/polaris";
import { useBreakpoint } from "~/hooks/useResponsive";

function ResponsiveTable({ data }) {
  const { mdUp } = useBreakpoint();
  
  // Show fewer columns on mobile
  const headings = mdUp 
    ? ["Name", "Email", "Orders", "Total Spent", "Tier", "Actions"]
    : ["Name", "Orders", "Actions"];
    
  const rows = data.map(item => 
    mdUp 
      ? [item.name, item.email, item.orders, item.spent, item.tier, actions]
      : [item.name, item.orders, actions]
  );
  
  return (
    <div className={mdUp ? "" : "responsive-table"}>
      <DataTable
        columnContentTypes={mdUp ? ["text", "text", "numeric", "numeric", "text", "text"] : ["text", "numeric", "text"]}
        headings={headings}
        rows={rows}
        hasZebraStripingOnData
      />
    </div>
  );
}
```

### 6. Image Optimization

Use Shopify CDN with responsive images:

```tsx
import { generateResponsiveImageUrl } from "~/utils/device-detection.server";

// In loader
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const device = detectDevice(request);
  const product = await getProduct();
  
  return json({
    product: {
      ...product,
      imageUrl: generateResponsiveImageUrl(product.image, device),
    }
  });
};

// In component
function ProductImage({ image }) {
  return (
    <img
      src={`${image.url}?width=600`}
      srcSet={`
        ${image.url}?width=300 300w,
        ${image.url}?width=600 600w,
        ${image.url}?width=900 900w,
        ${image.url}?width=1200 1200w
      `}
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      loading="lazy"
      className="aspect-card"
      alt={image.altText}
    />
  );
}
```

### 7. Performance Monitoring

Add performance tracking for resize operations:

```typescript
// app/hooks/usePerformanceMonitor.ts
export function useResizePerformance() {
  useEffect(() => {
    let resizeStart: number;
    const timings: number[] = [];
    
    const handleResizeStart = () => {
      resizeStart = performance.now();
    };
    
    const handleResizeEnd = () => {
      if (resizeStart) {
        const duration = performance.now() - resizeStart;
        timings.push(duration);
        
        // Log if resize takes too long
        if (duration > 100) {
          console.warn(`Slow resize: ${duration}ms`);
        }
      }
    };
    
    window.addEventListener("resize", handleResizeStart, { passive: true });
    window.addEventListener("resize", handleResizeEnd, { passive: true, capture: true });
    
    return () => {
      window.removeEventListener("resize", handleResizeStart);
      window.removeEventListener("resize", handleResizeEnd);
    };
  }, []);
}
```

## 🚀 Implementation Checklist

### For Each Route:

- [ ] Add device detection in loader
- [ ] Implement responsive data limits
- [ ] Use `defer` for non-critical mobile data
- [ ] Add responsive Polaris props
- [ ] Apply CSS utility classes
- [ ] Test on multiple viewports

### Global Optimizations:

- [ ] ✅ Added responsive CSS utilities
- [ ] ✅ Created responsive hooks
- [ ] ✅ Implemented device detection
- [ ] ✅ Updated root loader
- [ ] Add container queries where needed
- [ ] Implement lazy loading for images
- [ ] Add ResizeObserver for components
- [ ] Monitor performance metrics

## 📊 Testing Responsive Behavior

### Manual Testing:
1. Chrome DevTools Device Mode
2. Test at breakpoints: 375px, 768px, 1024px, 1440px
3. Test actual resize behavior (not just refresh)
4. Check for layout shifts during resize

### Automated Testing:
```typescript
// tests/responsive.spec.ts
import { test, expect } from "@playwright/test";

test("responsive navigation", async ({ page }) => {
  // Mobile
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/app");
  await expect(page.locator(".mobile-menu")).toBeVisible();
  
  // Desktop
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.locator(".desktop-menu")).toBeVisible();
});
```

## 🎯 Key Principles

1. **CSS-First**: Use CSS for responsive behavior, JavaScript for enhancement
2. **Server-First**: Adapt data at the server level based on device
3. **Progressive Enhancement**: Base functionality works without JavaScript
4. **Performance**: Use ResizeObserver, requestAnimationFrame, and debouncing
5. **No Layout Shifts**: Use aspect-ratio and contain-intrinsic-size
6. **Accessibility**: Ensure responsive changes don't break keyboard navigation

## 🔍 Common Issues & Solutions

### Issue: Hydration Mismatches
**Solution**: Use `useHydrated()` hook and render universal content during SSR

### Issue: Janky Resize
**Solution**: Use CSS transitions with `will-change` and GPU acceleration

### Issue: Too Many Re-renders
**Solution**: Debounce resize handlers and use React 18's `useDeferredValue`

### Issue: Mobile Performance
**Solution**: Reduce data fetching and defer non-critical content

## 📚 Resources

- [Polaris Responsive Documentation](https://polaris.shopify.com/components/layout-and-structure)
- [Container Queries MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Container_Queries)
- [ResizeObserver API](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver)
- [Remix Deferred Data](https://remix.run/docs/en/main/guides/streaming)

---

*This guide is part of the RewardsPro responsive implementation. Update as new patterns are discovered.*