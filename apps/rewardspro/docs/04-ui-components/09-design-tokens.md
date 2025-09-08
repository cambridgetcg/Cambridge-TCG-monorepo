# Shopify Polaris Design Tokens - Complete Implementation Guide

## Table of Contents
1. [Overview](#overview)
2. [Border Tokens](#border-tokens)
3. [Breakpoint Tokens](#breakpoint-tokens)
4. [Color Tokens](#color-tokens)
5. [Font Tokens](#font-tokens)
6. [Height Tokens](#height-tokens)
7. [Motion Tokens](#motion-tokens)
8. [Shadow Tokens](#shadow-tokens)
9. [Space Tokens](#space-tokens)
10. [Text Tokens](#text-tokens)
11. [Width Tokens](#width-tokens)
12. [Z-Index Tokens](#z-index-tokens)
13. [RewardsPro Implementation Patterns](#rewardspro-implementation-patterns)
14. [Advanced Patterns](#advanced-patterns)

## Overview

Design tokens are the atomic design decisions that ensure consistency across Shopify's admin. They're the foundation of the Polaris design system, providing standardized values for spacing, colors, typography, and more.

### Why Use Design Tokens?
- **Consistency**: Ensure uniform design across your application
- **Maintainability**: Single source of truth for design values
- **Theming**: Support for light/dark modes and custom themes
- **Accessibility**: Built-in compliance with WCAG standards
- **Performance**: Optimized values reduce CSS bloat

### Token Access Methods

```tsx
// Method 1: CSS Custom Properties (Recommended)
const styles = {
  padding: 'var(--p-space-400)',
  color: 'var(--p-color-text)',
  borderRadius: 'var(--p-border-radius-200)'
};

// Method 2: Using Polaris components (Preferred)
import {Box, Text, Card} from '@shopify/polaris';

<Box padding="400">
  <Text tone="subdued">Content</Text>
</Box>

// Method 3: SCSS (if using Sass)
@use '@shopify/polaris-tokens' as tokens;
.custom-class {
  padding: tokens.$p-space-400;
}
```

## Border Tokens

### Token Categories
- **Border Radius**: Corner rounding values
- **Border Width**: Line thickness values
- **Border Styles**: Solid, dashed, dotted patterns

### Implementation Examples

```tsx
// Border Radius Tokens
const borderRadiusTokens = {
  '--p-border-radius-0': '0',           // Sharp corners
  '--p-border-radius-050': '2px',       // Subtle rounding
  '--p-border-radius-100': '4px',       // Small elements
  '--p-border-radius-150': '6px',       // Badges, tags
  '--p-border-radius-200': '8px',       // Cards, buttons
  '--p-border-radius-300': '12px',      // Modals
  '--p-border-radius-400': '16px',      // Large cards
  '--p-border-radius-500': '20px',      // Extra large
  '--p-border-radius-750': '30px',      // Pills
  '--p-border-radius-full': '9999px'    // Circular
};

// Component with consistent borders
function CustomCard({children, variant = 'default'}) {
  const styles = {
    default: {
      border: 'var(--p-border-width-025) solid var(--p-color-border)',
      borderRadius: 'var(--p-border-radius-200)',
      padding: 'var(--p-space-400)'
    },
    elevated: {
      border: 'none',
      borderRadius: 'var(--p-border-radius-300)',
      boxShadow: 'var(--p-shadow-300)',
      padding: 'var(--p-space-400)'
    },
    subdued: {
      border: 'var(--p-border-width-025) solid var(--p-color-border-subdued)',
      borderRadius: 'var(--p-border-radius-100)',
      padding: 'var(--p-space-300)'
    }
  };
  
  return (
    <div style={styles[variant]}>
      {children}
    </div>
  );
}
```

### RewardsPro Border Implementation

```tsx
// Tier card with border hierarchy
function TierCard({ tier, isActive }) {
  const styles = {
    border: isActive 
      ? 'var(--p-border-width-050) solid var(--p-color-border-success)'
      : 'var(--p-border-width-025) solid var(--p-color-border)',
    borderRadius: 'var(--p-border-radius-300)',
    padding: 'var(--p-space-400)',
    transition: 'border var(--p-motion-duration-150) var(--p-motion-ease)'
  };
  
  return (
    <div style={styles}>
      <Text variant="headingMd">{tier.name}</Text>
      <Text tone="subdued">{tier.cashbackPercent}% cashback</Text>
    </div>
  );
}

// Store credit badge
function CreditBadge({ amount }) {
  const styles = {
    borderRadius: 'var(--p-border-radius-750)',
    padding: 'var(--p-space-050) var(--p-space-300)',
    border: 'var(--p-border-width-025) solid var(--p-color-border-success)',
    background: 'var(--p-color-bg-surface-success)',
    color: 'var(--p-color-text-success)',
    display: 'inline-block',
    fontSize: 'var(--p-font-size-300)'
  };
  
  return <span style={styles}>${amount}</span>;
}
```

### Best Practices
- Use consistent radius values across similar components
- Apply `border-radius-200` for most interactive elements
- Use `border-radius-full` only for circular elements
- Maintain border hierarchy (thicker = more important)

## Breakpoint Tokens

### Breakpoint Values
```tsx
const breakpoints = {
  'xs': '0px',      // Mobile portrait
  'sm': '490px',    // Mobile landscape
  'md': '768px',    // Tablet
  'lg': '1040px',   // Desktop
  'xl': '1440px'    // Wide desktop
};
```

### Implementation Examples

```tsx
// Custom hook for breakpoints
function useBreakpoint() {
  const [breakpoint, setBreakpoint] = useState('xs');
  
  useEffect(() => {
    const checkBreakpoint = () => {
      const width = window.innerWidth;
      if (width >= 1440) setBreakpoint('xl');
      else if (width >= 1040) setBreakpoint('lg');
      else if (width >= 768) setBreakpoint('md');
      else if (width >= 490) setBreakpoint('sm');
      else setBreakpoint('xs');
    };
    
    checkBreakpoint();
    window.addEventListener('resize', checkBreakpoint);
    return () => window.removeEventListener('resize', checkBreakpoint);
  }, []);
  
  return breakpoint;
}
```

### RewardsPro Responsive Patterns

```tsx
// Responsive customer grid
function CustomerGrid({ customers }) {
  const breakpoint = useBreakpoint();
  
  const getColumns = () => {
    switch(breakpoint) {
      case 'xl':
      case 'lg': return 4;
      case 'md': return 3;
      case 'sm': return 2;
      default: return 1;
    }
  };
  
  const styles = {
    display: 'grid',
    gridTemplateColumns: `repeat(${getColumns()}, 1fr)`,
    gap: 'var(--p-space-400)'
  };
  
  return (
    <div style={styles}>
      {customers.map(customer => (
        <CustomerCard key={customer.id} customer={customer} />
      ))}
    </div>
  );
}

// Responsive tier display
function TierList({ tiers }) {
  const breakpoint = useBreakpoint();
  const isMobile = ['xs', 'sm'].includes(breakpoint);
  
  if (isMobile) {
    return (
      <Stack vertical>
        {tiers.map(tier => (
          <TierCard key={tier.id} tier={tier} compact />
        ))}
      </Stack>
    );
  }
  
  return (
    <Grid>
      {tiers.map(tier => (
        <Grid.Cell key={tier.id} columnSpan={{xs: 6, md: 3}}>
          <TierCard tier={tier} />
        </Grid.Cell>
      ))}
    </Grid>
  );
}
```

### Best Practices
- Design mobile-first, enhance for larger screens
- Use semantic breakpoint names (sm, md, lg)
- Test all breakpoints during development
- Consider using container queries for component-level responsiveness

## Color Tokens

> **📚 Related Documentation**: For comprehensive color psychology, accessibility requirements, and conversion optimization patterns, see the [Color Design Guide](./color-design-guide.md).

### Color Token Categories
```tsx
const colorCategories = {
  // Background colors
  bg: {
    surface: 'Page backgrounds',
    fill: 'Filled elements like buttons',
    transparent: 'Transparent backgrounds'
  },
  
  // Text colors
  text: {
    default: 'Primary text',
    subdued: 'Secondary text',
    disabled: 'Disabled state',
    link: 'Hyperlinks',
    onColor: 'Text on colored backgrounds'
  },
  
  // Border colors
  border: {
    default: 'Standard borders',
    subdued: 'Subtle borders',
    strong: 'Emphasized borders',
    focus: 'Focus indicators'
  },
  
  // Semantic colors
  semantic: {
    success: 'Positive actions/states',
    warning: 'Caution states',
    critical: 'Errors/destructive',
    info: 'Informational',
    attention: 'Requires attention'
  }
};
```

### RewardsPro Color Implementation

```tsx
// Tier status indicator with semantic colors
function TierStatusBadge({ tier, customerCount }) {
  const getStatusColor = () => {
    if (customerCount === 0) return 'critical';
    if (customerCount < 10) return 'warning';
    if (customerCount < 50) return 'attention';
    return 'success';
  };
  
  const status = getStatusColor();
  
  const styles = {
    background: `var(--p-color-bg-surface-${status})`,
    color: `var(--p-color-text-${status})`,
    border: `var(--p-border-width-025) solid var(--p-color-border-${status})`,
    borderRadius: 'var(--p-border-radius-200)',
    padding: 'var(--p-space-100) var(--p-space-200)',
    display: 'inline-block'
  };
  
  return (
    <span style={styles}>
      {customerCount} customers
    </span>
  );
}

// Transaction type colors
function TransactionIndicator({ type, amount }) {
  const typeColors = {
    CASHBACK_EARNED: {
      bg: 'var(--p-color-bg-surface-success)',
      text: 'var(--p-color-text-success)',
      border: 'var(--p-color-border-success)'
    },
    ORDER_PAYMENT: {
      bg: 'var(--p-color-bg-surface-info)',
      text: 'var(--p-color-text-info)',
      border: 'var(--p-color-border-info)'
    },
    REFUND_CREDIT: {
      bg: 'var(--p-color-bg-surface-attention)',
      text: 'var(--p-color-text-attention)',
      border: 'var(--p-color-border-attention)'
    },
    MANUAL_ADJUSTMENT: {
      bg: 'var(--p-color-bg-surface-warning)',
      text: 'var(--p-color-text-warning)',
      border: 'var(--p-color-border-warning)'
    }
  };
  
  const colors = typeColors[type];
  
  const styles = {
    background: colors.bg,
    color: colors.text,
    border: `var(--p-border-width-025) solid ${colors.border}`,
    borderRadius: 'var(--p-border-radius-100)',
    padding: 'var(--p-space-050) var(--p-space-200)',
    fontSize: 'var(--p-font-size-100)'
  };
  
  return (
    <span style={styles}>
      {amount > 0 ? '+' : ''}{amount}
    </span>
  );
}
```

### Best Practices
- Use semantic colors for their intended purpose
- Maintain WCAG AA contrast ratios (4.5:1 for normal text)
- Test color combinations in both light and dark themes
- Avoid hardcoding hex values; always use tokens

## Font Tokens

### Font Token Types
```tsx
const fontTokens = {
  // Font families
  family: {
    sans: 'var(--p-font-family-sans)',
    mono: 'var(--p-font-family-mono)'
  },
  
  // Font sizes
  size: {
    75: '12px',   // X-small
    100: '13px',  // Small
    200: '14px',  // Base
    300: '15px',  // Medium
    325: '16px',  // Medium+
    350: '17px',  // Large-
    400: '18px',  // Large
    500: '20px',  // X-large
    600: '24px',  // 2X-large
    700: '28px',  // 3X-large
    800: '32px',  // 4X-large
    900: '36px',  // 5X-large
    1000: '40px'  // 6X-large
  },
  
  // Font weights
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700'
  },
  
  // Line heights
  lineHeight: {
    1: '16px',
    2: '20px',
    3: '24px',
    4: '28px',
    5: '32px',
    6: '36px',
    7: '44px'
  }
};
```

### RewardsPro Typography Implementation

```tsx
// Dashboard metrics display
function MetricCard({ label, value, change }) {
  const isPositive = change > 0;
  
  return (
    <Card>
      <Stack vertical>
        <Text
          style={{
            fontSize: 'var(--p-font-size-100)',
            color: 'var(--p-color-text-subdued)',
            fontWeight: 'var(--p-font-weight-regular)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: 'var(--p-font-size-800)',
            fontWeight: 'var(--p-font-weight-bold)',
            lineHeight: 'var(--p-font-line-height-6)',
            color: 'var(--p-color-text)'
          }}
        >
          {value}
        </Text>
        <Text
          style={{
            fontSize: 'var(--p-font-size-200)',
            color: isPositive 
              ? 'var(--p-color-text-success)' 
              : 'var(--p-color-text-critical)',
            fontWeight: 'var(--p-font-weight-medium)'
          }}
        >
          {isPositive ? '↑' : '↓'} {Math.abs(change)}%
        </Text>
      </Stack>
    </Card>
  );
}

// Customer name display with truncation
function CustomerName({ name, email }) {
  const styles = {
    name: {
      fontSize: 'var(--p-font-size-325)',
      fontWeight: 'var(--p-font-weight-semibold)',
      lineHeight: 'var(--p-font-line-height-3)',
      color: 'var(--p-color-text)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    email: {
      fontSize: 'var(--p-font-size-100)',
      fontWeight: 'var(--p-font-weight-regular)',
      lineHeight: 'var(--p-font-line-height-1)',
      color: 'var(--p-color-text-subdued)'
    }
  };
  
  return (
    <Stack vertical spacing="extraTight">
      <p style={styles.name}>{name}</p>
      <p style={styles.email}>{email}</p>
    </Stack>
  );
}
```

### Best Practices
- Use semantic HTML elements (h1-h6, p, span)
- Maintain consistent type scales
- Ensure readable line heights (1.4-1.6 for body)
- Limit font weights to 3-4 options
- Test readability across different screen sizes

## Motion Tokens

### Motion Token Categories
```tsx
const motionTokens = {
  // Duration
  duration: {
    0: '0ms',
    50: '50ms',
    100: '100ms',
    150: '150ms',
    200: '200ms',
    250: '250ms',
    300: '300ms',
    350: '350ms',
    400: '400ms',
    450: '450ms',
    500: '500ms'
  },
  
  // Easing
  ease: {
    'ease': 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    'ease-in': 'cubic-bezier(0.42, 0, 1, 1)',
    'ease-out': 'cubic-bezier(0, 0, 0.58, 1)',
    'ease-in-out': 'cubic-bezier(0.42, 0, 0.58, 1)',
    'linear': 'linear'
  }
};
```

### RewardsPro Motion Implementation

```tsx
// Tier progress animation
function TierProgressBar({ current, target }) {
  const [progress, setProgress] = useState(0);
  const percentage = (current / target) * 100;
  
  useEffect(() => {
    // Animate on mount
    const timer = setTimeout(() => {
      setProgress(percentage);
    }, 100);
    return () => clearTimeout(timer);
  }, [percentage]);
  
  const styles = {
    container: {
      width: '100%',
      height: 'var(--p-height-200)',
      background: 'var(--p-color-bg-surface-secondary)',
      borderRadius: 'var(--p-border-radius-100)',
      overflow: 'hidden'
    },
    bar: {
      width: `${progress}%`,
      height: '100%',
      background: 'var(--p-color-bg-fill-success)',
      transition: 'width var(--p-motion-duration-500) var(--p-motion-ease-out)'
    }
  };
  
  return (
    <div style={styles.container}>
      <div style={styles.bar} />
    </div>
  );
}

// Card hover effect
function InteractiveRewardCard({ reward }) {
  const [isHovered, setIsHovered] = useState(false);
  
  const styles = {
    transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
    boxShadow: isHovered 
      ? 'var(--p-shadow-400)' 
      : 'var(--p-shadow-200)',
    transition: `
      transform var(--p-motion-duration-150) var(--p-motion-ease),
      box-shadow var(--p-motion-duration-150) var(--p-motion-ease)
    `,
    padding: 'var(--p-space-400)',
    borderRadius: 'var(--p-border-radius-200)',
    cursor: 'pointer'
  };
  
  return (
    <div
      style={styles}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Text variant="headingMd">{reward.name}</Text>
      <Text tone="subdued">{reward.pointsRequired} points</Text>
    </div>
  );
}
```

### Best Practices
- Use faster durations (100-200ms) for micro-interactions
- Use slower durations (300-500ms) for page transitions
- Apply easing functions consistently
- Respect prefers-reduced-motion for accessibility
- Test animations on lower-end devices

## Shadow Tokens

### Shadow Token Values
```tsx
const shadowTokens = {
  '--p-shadow-0': 'none',
  '--p-shadow-100': 'Small shadow for subtle depth',
  '--p-shadow-200': 'Default card shadow',
  '--p-shadow-300': 'Elevated elements',
  '--p-shadow-400': 'Hover state shadow',
  '--p-shadow-500': 'Modal/popover shadow',
  '--p-shadow-600': 'Maximum elevation',
  '--p-shadow-bevel': 'Inset shadow for pressed states',
  '--p-shadow-inset': 'Inset shadow for inputs'
};
```

### RewardsPro Shadow Implementation

```tsx
// Elevation hierarchy for dashboard cards
function DashboardCard({ title, children, elevation = 'default' }) {
  const elevations = {
    flat: 'var(--p-shadow-0)',
    default: 'var(--p-shadow-200)',
    raised: 'var(--p-shadow-300)',
    floating: 'var(--p-shadow-500)'
  };
  
  const styles = {
    boxShadow: elevations[elevation],
    background: 'var(--p-color-bg-surface)',
    borderRadius: 'var(--p-border-radius-300)',
    padding: 'var(--p-space-400)',
    transition: 'box-shadow var(--p-motion-duration-150) var(--p-motion-ease)'
  };
  
  return (
    <div style={styles}>
      <Text variant="headingMd">{title}</Text>
      {children}
    </div>
  );
}

// Store credit input with inset shadow
function CreditInput({ value, onChange }) {
  const [isFocused, setIsFocused] = useState(false);
  
  const styles = {
    boxShadow: isFocused 
      ? 'var(--p-shadow-inset), 0 0 0 2px var(--p-color-border-focus)'
      : 'var(--p-shadow-inset)',
    border: 'var(--p-border-width-025) solid var(--p-color-border)',
    borderRadius: 'var(--p-border-radius-200)',
    padding: 'var(--p-space-200) var(--p-space-300)',
    fontSize: 'var(--p-font-size-200)',
    transition: 'box-shadow var(--p-motion-duration-150) var(--p-motion-ease)',
    width: '100%'
  };
  
  return (
    <div>
      <label>Store Credit Amount</label>
      <input
        type="number"
        style={styles}
        value={value}
        onChange={onChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder="0.00"
      />
    </div>
  );
}
```

### Best Practices
- Use consistent elevation hierarchy
- Apply shadows purposefully for depth
- Avoid excessive shadows (max 3 levels per view)
- Test shadows on different backgrounds
- Consider performance with many shadowed elements

## Space Tokens

### Space Scale
```tsx
const spaceTokens = {
  '--p-space-0': '0',
  '--p-space-025': '1px',
  '--p-space-050': '2px',
  '--p-space-100': '4px',
  '--p-space-150': '6px',
  '--p-space-200': '8px',
  '--p-space-300': '12px',
  '--p-space-400': '16px',
  '--p-space-500': '20px',
  '--p-space-600': '24px',
  '--p-space-800': '32px',
  '--p-space-1000': '40px',
  '--p-space-1200': '48px',
  '--p-space-1600': '64px',
  '--p-space-2000': '80px',
  '--p-space-2400': '96px',
  '--p-space-2800': '112px',
  '--p-space-3200': '128px'
};
```

### RewardsPro Spacing Implementation

```tsx
// Consistent spacing in tier management
function TierManagementLayout() {
  const styles = {
    container: {
      padding: 'var(--p-space-600)'
    },
    header: {
      marginBottom: 'var(--p-space-800)'
    },
    tierGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
      gap: 'var(--p-space-400)'
    },
    tierCard: {
      padding: 'var(--p-space-400)'
    },
    tierInfo: {
      marginBottom: 'var(--p-space-200)'
    },
    actions: {
      marginTop: 'var(--p-space-300)',
      display: 'flex',
      gap: 'var(--p-space-200)'
    }
  };
  
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <Text variant="headingLg">Tier Management</Text>
      </div>
      <div style={styles.tierGrid}>
        {/* Tier cards */}
      </div>
    </div>
  );
}

// Customer details spacing
function CustomerDetailsCard({ customer }) {
  return (
    <Card>
      <Stack vertical spacing="400">
        <Stack distribution="equalSpacing">
          <Stack spacing="200">
            <Avatar customer name={customer.name} />
            <Stack vertical spacing="050">
              <Text variant="headingMd">{customer.name}</Text>
              <Text tone="subdued">{customer.email}</Text>
            </Stack>
          </Stack>
        </Stack>
        
        <div style={{ marginTop: 'var(--p-space-400)' }}>
          <Grid>
            <Grid.Cell columnSpan={{xs: 6, md: 3}}>
              <Stack vertical spacing="100">
                <Text tone="subdued">Current Tier</Text>
                <Text variant="bodyMd">{customer.tier}</Text>
              </Stack>
            </Grid.Cell>
            <Grid.Cell columnSpan={{xs: 6, md: 3}}>
              <Stack vertical spacing="100">
                <Text tone="subdued">Store Credit</Text>
                <Text variant="bodyMd">${customer.storeCredit}</Text>
              </Stack>
            </Grid.Cell>
          </Grid>
        </div>
      </Stack>
    </Card>
  );
}
```

### Best Practices
- Use consistent spacing increments
- Apply larger spacing between sections than within
- Use gap property for flex/grid layouts
- Maintain visual rhythm with consistent spacing
- Consider touch targets for mobile (min 44px)

## Z-Index Tokens

### Z-Index Scale
```tsx
const zIndexTokens = {
  '--p-z-index-0': '0',
  '--p-z-index-1': '100',      // Base level
  '--p-z-index-2': '200',      // Cards, raised elements
  '--p-z-index-3': '300',      // Dropdowns
  '--p-z-index-4': '400',      // Sticky elements
  '--p-z-index-5': '500',      // Overlays, backdrops
  '--p-z-index-6': '510',      // Modals
  '--p-z-index-7': '520',      // Popovers on modals
  '--p-z-index-8': '530',      // Toasts
  '--p-z-index-9': '540',      // Tooltips
  '--p-z-index-10': '550',     // Priority overlays
  '--p-z-index-11': '560',     // Global nav
  '--p-z-index-12': '570'      // Development tools
};
```

### RewardsPro Z-Index Implementation

```tsx
// Layered interface for rewards dashboard
function RewardsDashboard() {
  return (
    <>
      {/* Base content layer */}
      <div style={{ position: 'relative', zIndex: 'var(--p-z-index-0)' }}>
        <CustomerList />
      </div>
      
      {/* Sticky tier filter bar */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 'var(--p-z-index-4)',
        background: 'var(--p-color-bg-surface)',
        padding: 'var(--p-space-300)',
        borderBottom: 'var(--p-border-width-025) solid var(--p-color-border)'
      }}>
        <TierFilterBar />
      </div>
      
      {/* Credit adjustment modal */}
      <Modal
        style={{
          position: 'fixed',
          zIndex: 'var(--p-z-index-6)'
        }}
      >
        <CreditAdjustmentForm />
      </Modal>
      
      {/* Success toast notification */}
      <Toast
        style={{
          position: 'fixed',
          top: 'var(--p-space-400)',
          right: 'var(--p-space-400)',
          zIndex: 'var(--p-z-index-8)'
        }}
      >
        Credit updated successfully
      </Toast>
    </>
  );
}

// Tooltip for tier benefits
function TierTooltip({ tier, children }) {
  const [isVisible, setIsVisible] = useState(false);
  
  return (
    <div style={{ position: 'relative' }}>
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      {isVisible && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 'var(--p-z-index-9)',
          background: 'var(--p-color-bg-surface-inverse)',
          color: 'var(--p-color-text-inverse)',
          padding: 'var(--p-space-200)',
          borderRadius: 'var(--p-border-radius-100)',
          whiteSpace: 'nowrap',
          marginBottom: 'var(--p-space-100)'
        }}>
          {tier.cashbackPercent}% cashback • ${tier.minSpend} minimum
        </div>
      )}
    </div>
  );
}
```

### Best Practices
- Reserve high z-index values for global elements
- Group related elements in z-index ranges
- Document z-index usage in your codebase
- Avoid arbitrary z-index values (999, 9999)
- Use stacking contexts to isolate components

## RewardsPro Implementation Patterns

### Complete Theme Implementation

```tsx
// app/styles/rewards-theme.css
:root {
  /* Custom RewardsPro tokens extending Polaris */
  --rewards-tier-bronze: var(--p-color-bg-surface-warning);
  --rewards-tier-silver: var(--p-color-bg-surface-secondary);
  --rewards-tier-gold: var(--p-color-bg-surface-attention);
  --rewards-tier-platinum: var(--p-color-bg-surface-success);
  
  /* Custom spacing for rewards cards */
  --rewards-card-padding: var(--p-space-400);
  --rewards-section-gap: var(--p-space-800);
  
  /* Custom shadows for elevation */
  --rewards-card-shadow: var(--p-shadow-200);
  --rewards-card-hover-shadow: var(--p-shadow-400);
}

// Tier card with full token implementation
function CompleteTierCard({ tier, customers, isActive, onEdit }) {
  const styles = {
    card: {
      background: 'var(--p-color-bg-surface)',
      border: `var(--p-border-width-025) solid ${
        isActive ? 'var(--p-color-border-success)' : 'var(--p-color-border)'
      }`,
      borderRadius: 'var(--p-border-radius-300)',
      padding: 'var(--rewards-card-padding)',
      boxShadow: 'var(--rewards-card-shadow)',
      transition: `
        box-shadow var(--p-motion-duration-150) var(--p-motion-ease),
        border-color var(--p-motion-duration-150) var(--p-motion-ease)
      `,
      '&:hover': {
        boxShadow: 'var(--rewards-card-hover-shadow)'
      }
    },
    header: {
      marginBottom: 'var(--p-space-400)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    title: {
      fontSize: 'var(--p-font-size-500)',
      fontWeight: 'var(--p-font-weight-semibold)',
      lineHeight: 'var(--p-font-line-height-4)',
      color: 'var(--p-color-text)'
    },
    badge: {
      background: `var(--rewards-tier-${tier.name.toLowerCase()})`,
      color: 'var(--p-color-text-on-color)',
      padding: 'var(--p-space-050) var(--p-space-200)',
      borderRadius: 'var(--p-border-radius-750)',
      fontSize: 'var(--p-font-size-100)'
    },
    stats: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: 'var(--p-space-400)',
      marginTop: 'var(--p-space-400)'
    },
    stat: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--p-space-100)'
    },
    statLabel: {
      fontSize: 'var(--p-font-size-100)',
      color: 'var(--p-color-text-subdued)',
      textTransform: 'uppercase',
      letterSpacing: '0.05em'
    },
    statValue: {
      fontSize: 'var(--p-font-size-400)',
      fontWeight: 'var(--p-font-weight-semibold)',
      color: 'var(--p-color-text)'
    }
  };
  
  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h3 style={styles.title}>{tier.name}</h3>
        <span style={styles.badge}>
          {tier.cashbackPercent}% cashback
        </span>
      </div>
      
      <div style={styles.stats}>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Min Spend</span>
          <span style={styles.statValue}>${tier.minSpend}</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Customers</span>
          <span style={styles.statValue}>{customers.length}</span>
        </div>
      </div>
      
      <Button onClick={onEdit} fullWidth>
        Edit Tier
      </Button>
    </div>
  );
}
```

## Advanced Patterns

### Custom Properties Extension
```tsx
// Extending tokens with custom properties
function ThemeProvider({children, theme = 'default'}) {
  const themes = {
    default: {
      '--custom-accent': 'var(--p-color-bg-fill-success)',
      '--custom-radius': 'var(--p-border-radius-200)'
    },
    brand: {
      '--custom-accent': '#7C3AED',
      '--custom-radius': 'var(--p-border-radius-300)'
    }
  };
  
  return (
    <div style={themes[theme]}>
      {children}
    </div>
  );
}
```

### Responsive Token System
```tsx
// Dynamic token switching
function useResponsiveTokens() {
  const breakpoint = useBreakpoint();
  
  const getSpacing = (base: string) => {
    const multipliers = {
      xs: 0.75,
      sm: 0.875,
      md: 1,
      lg: 1.125,
      xl: 1.25
    };
    
    return `calc(var(--p-space-${base}) * ${multipliers[breakpoint]})`;
  };
  
  return {getSpacing};
}
```

### Accessibility Patterns
```tsx
// Respecting user preferences
function MotionSafeAnimation({children}) {
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;
  
  const styles = {
    transition: prefersReducedMotion 
      ? 'none' 
      : 'all var(--p-motion-duration-200) var(--p-motion-ease)'
  };
  
  return <div style={styles}>{children}</div>;
}

// High contrast support
function HighContrastBorder({children}) {
  const styles = {
    border: 'var(--p-border-width-025) solid var(--p-color-border)',
    '@media (prefers-contrast: high)': {
      borderWidth: 'var(--p-border-width-050)'
    }
  };
  
  return <div style={styles}>{children}</div>;
}
```

## Summary & Best Practices

### Key Principles
1. **Always use tokens** instead of hardcoded values
2. **Maintain consistency** across your application
3. **Follow the scale** - don't create in-between values
4. **Test accessibility** with different user preferences
5. **Document exceptions** when custom values are necessary

### Performance Tips
1. Use CSS custom properties for runtime theming
2. Minimize token overrides
3. Group related token applications
4. Use CSS-in-JS efficiently with memoization

### Migration Strategy
```tsx
// Before: Hardcoded values
<div style={{padding: '16px', color: '#202223'}}>

// After: Using tokens
<div style={{padding: 'var(--p-space-400)', color: 'var(--p-color-text)'}}>

// Best: Using Polaris components
<Box padding="400">
  <Text>Content</Text>
</Box>
```

### Resources
- Token documentation: https://polaris.shopify.com/tokens
- Polaris Figma: https://www.figma.com/community/file/1293614341114022348
- GitHub: https://github.com/Shopify/polaris

By following these patterns and using Polaris tokens consistently, you'll create interfaces that are maintainable, accessible, and aligned with Shopify's design system.