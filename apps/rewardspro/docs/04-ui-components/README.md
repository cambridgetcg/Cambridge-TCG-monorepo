# UI Components

> Build consistent, accessible merchant interfaces using Shopify Polaris and RewardsPro design patterns.

---

## Quick Start

For day-to-day development, use these guides:

| I need to... | Go to... |
|--------------|----------|
| Build a RewardsPro feature | [RewardsPro Patterns](./rewardspro-patterns.md) |
| Use Polaris components | [Polaris Fundamentals](./polaris-fundamentals.md) |
| Apply styling/colors | [Design Tokens](./design-tokens-styling.md) |
| Create responsive layouts | [Layout & Balance](./layout-balance.md) |

---

## Documentation Structure

### Core Guides

| Document | Description |
|----------|-------------|
| [RewardsPro Patterns](./rewardspro-patterns.md) | Customer, tier, and credit UI patterns |
| [Polaris Fundamentals](./polaris-fundamentals.md) | Core Polaris component usage |
| [Design Tokens & Styling](./design-tokens-styling.md) | Colors, typography, spacing |
| [Layout & Balance](./layout-balance.md) | Grids, responsive, spatial composition |

### Design Principles

| Document | Description |
|----------|-------------|
| [Visual & Semantic Design](./visual-semantic-design.md) | Hierarchy, meaning, icons |
| [Internationalization & Accessibility](./i18n-accessibility.md) | i18n, ARIA, keyboard navigation |

### Reference Guides

| Document | Description |
|----------|-------------|
| [Polaris Overview](./01-polaris-overview.md) | Design system introduction |
| [Forms Guide](./03-forms-guide.md) | Form implementation patterns |
| [Lists & Tables](./06-lists-tables.md) | Data display patterns |
| [Feedback Indicators](./07-feedback-indicators.md) | Loading, errors, success |

---

## Key Principles

### Customer-Centric Design

- Clear tier visualization
- Prominent store credit display
- Easy-to-scan transaction history
- Intuitive navigation between records

### Merchant Efficiency

- Bulk operations for customer management
- Quick filters and search
- One-click tier adjustments
- Clear cashback calculations

### Consistent Patterns

- Always use Polaris components
- Follow the 60-30-10 color rule
- Maintain 8px spacing grid
- Use sentence case for all UI text

### Design Tokens (Updated 2026-01-24)

**Single Source of Truth for Tier Colors**: `app/utils/tier-styles.ts`

```typescript
// Get tier style in TypeScript
import { getTierStyle, getTierCSSVar } from '~/utils/tier-styles';

const style = getTierStyle('gold');
// Returns: { color: '#F59E0B', gradientFrom, gradientTo, badgeTone, ... }
```

```css
/* Use tier CSS variables */
.my-tier-element {
  color: var(--rp-tier-gold);
  background: linear-gradient(135deg,
    var(--rp-tier-gold-gradient-from),
    var(--rp-tier-gold-gradient-to)
  );
}
```

**Namespace Convention**: All RewardsPro tokens use `--rp-*` prefix:
- `--rp-tier-*` for tier colors
- `--rp-color-*` for semantic colors
- `--rp-space-*` for spacing
- `--rp-shadow-*` for shadows

### Global Ready

- Plan for 50% text expansion
- Use semantic color meanings
- Avoid cultural idioms
- Support RTL languages

---

## Component Usage

### Common Patterns

| Feature | Component | Example |
|---------|-----------|---------|
| Customer List | DataTable | `app.customers.tsx` |
| Tier Display | Badge + Progress | `TierBadge.tsx` |
| Credit Balance | MoneyDisplay | `SemanticReactComponents.tsx` |
| Forms | TextField + Select | `app.tiers.tsx` |
| Modals | Modal + Tabs | `CustomerDetailModal.tsx` |

### Code Examples

**Basic component setup:**

```tsx
import { Card, Button, Text } from '@shopify/polaris';

// Use design tokens for styling
const spacing = 'var(--p-space-400)'; // 16px
const color = 'var(--p-color-text-success)';
```

**Styling approach:**

```tsx
// Good - Use Polaris tokens
<Box padding="400" background="bg-surface-success">
  <Text as="p">Content</Text>
</Box>

// Bad - Custom styles
<div style={{padding: '16px', background: 'green'}}>
```

**Text and labels:**

```tsx
// Good - Sentence case, action-oriented
<Button>Add customer</Button>

// Bad - Title case, passive
<Button>Customer Can Be Added</Button>
```

{% hint style="info" %}
**Polaris v12:** Always include the `as` prop on Text components for semantic HTML.
{% endhint %}

---

## Quick Find

### Need to implement...

| Pattern | Location | Notes |
|---------|----------|-------|
| **Tier badges** | `app/components/TierBadge.tsx` | Primary implementation, uses tier-styles.ts |
| **Tier colors/styling** | `app/utils/tier-styles.ts` | Single source of truth for all tier colors |
| Customer detail view | `app/components/CustomerDetailModal.tsx` | |
| Money display | `MoneyDisplay` in `SemanticReactComponents.tsx` | |
| Loading states | `LoadingSkeleton` in `DesignSystem/index.tsx` | Also in SemanticReactComponents |
| Error handling | `PolarisSemanticExamples.tsx` | |
| Responsive layout | `useResponsiveBalance` in `BalancedReactComponents.tsx` | |
| Form validation | `SemanticField` in `SemanticReactComponents.tsx` | |
| Empty states | `SemanticEmptyState` in `SemanticReactComponents.tsx` | |

> **Note**: The `app/components/renaissance/` directory contains a deprecated design system.
> Use Polaris components and the standard components above instead.

---

## Development Workflow

### Creating New Components

1. Check [RewardsPro Patterns](./rewardspro-patterns.md) for existing patterns
2. Use [Polaris Fundamentals](./polaris-fundamentals.md) for base components
3. Apply [Design Tokens](./design-tokens-styling.md) for consistent styling

### Fixing Styling Issues

1. Reference [Design Tokens](./design-tokens-styling.md) for token values
2. Check [Layout & Balance](./layout-balance.md) for spacing issues
3. Verify responsive behavior

### Adding Accessibility

1. Follow [Internationalization & Accessibility](./i18n-accessibility.md)
2. Test with keyboard navigation
3. Verify screen reader compatibility

---

## Component Checklist

Before shipping a new component:

- [ ] Uses Polaris base components
- [ ] Follows RewardsPro patterns
- [ ] Includes accessibility labels
- [ ] Supports internationalization
- [ ] Has loading states
- [ ] Handles errors gracefully
- [ ] Responsive on mobile
- [ ] Uses design tokens
- [ ] Tested with keyboard navigation

---

## Frequently Asked Questions

### Should I create custom components?

Prefer Polaris components whenever possible. Only create custom components when Polaris doesn't provide the needed functionality.

### How do I handle loading states?

Use Polaris skeleton components (`SkeletonBodyText`, `SkeletonDisplayText`) for content loading and `Button` with `loading` prop for actions.

### What colors should I use for status badges?

Use Polaris tone props: `success` for active/positive, `warning` for pending, `critical` for errors, `info` for informational.

---

## Related Pages

- [Polaris Design System](https://polaris.shopify.com) - Official Polaris documentation
- [TypeScript Best Practices](../02-development/03-typescript-best-practices.md) - Code standards
- [Performance Optimization](../02-development/04-performance-optimization.md) - UI performance
