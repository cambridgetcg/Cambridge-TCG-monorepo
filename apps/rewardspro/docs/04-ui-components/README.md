# UI Components Documentation for RewardsPro

> 🎯 **Quick Start**: For RewardsPro developers, start with [Quick Reference](#quick-reference) for immediate implementation needs.

## 📁 Documentation Structure

### 🚀 Quick Reference
For day-to-day RewardsPro development, use these primary guides:

1. **[RewardsPro Component Patterns](./rewardspro-patterns.md)** 🆕
   - Customer management UI patterns
   - Tier system components
   - Store credit displays
   - Dashboard widgets
   - *Start here for RewardsPro-specific implementations*

2. **[Polaris Fundamentals](./polaris-fundamentals.md)** 🔀
   - Core Polaris components usage
   - Form handling & validation
   - Tables & lists for customer data
   - Buttons & actions
   - *Essential Polaris patterns consolidated*

3. **[Design Tokens & Styling](./design-tokens-styling.md)** 🔀
   - Color system & semantic colors
   - Typography & spacing
   - Responsive breakpoints
   - Visual hierarchy
   - *All styling references in one place*

### 🎨 Design Principles
Advanced design concepts and theory:

4. **[Visual & Semantic Design](./visual-semantic-design.md)** 🔀
   - Visual hierarchy & dimensions
   - Meaning & semantics in UI
   - Icons & metaphors
   - Cultural considerations
   - *Merged visual and semantic guides*

5. **[Layout & Balance](./layout-balance.md)** 🔀
   - Balance & symmetry principles
   - Responsive patterns
   - Grid systems
   - Spatial composition
   - *Combined layout-related guides*

6. **[Internationalization & Accessibility](./i18n-accessibility.md)** 🔀
   - Multi-language support
   - ARIA patterns
   - Keyboard navigation
   - Screen reader optimization
   - *Extracted from multiple guides*

### 🧩 React Components
Production-ready component implementations:

7. **Component Library Files**:
   - `CustomerDetailModal.tsx` - Customer detail expansion
   - `SemanticReactComponents.tsx` - Semantic UI components
   - `BalancedReactComponents.tsx` - Layout components
   - `PolarisSemanticExamples.tsx` - Best practice examples
   - `VisualDimensionExamples.tsx` - Visual demonstrations

### 📚 Legacy/Reference Guides
Original detailed guides (for deep dives):

<details>
<summary>Click to expand legacy guides list</summary>

- `01-polaris-overview.md` - Original Polaris overview
- `02-layout-patterns.md` - Detailed layout patterns
- `03-forms-guide.md` - Comprehensive forms guide
- `04-buttons-guide.md` - Button variations
- `05-button-groups.md` - Button group patterns
- `06-lists-tables.md` - Lists and tables deep dive
- `07-feedback-indicators.md` - Feedback patterns
- `08-images-icons.md` - Image and icon usage
- `09-design-tokens.md` - Token system details
- `10-ui-ux-patterns.md` - UX pattern library
- `balance-symmetry-design-guide.md` - Balance theory
- `visual-dimensions-guide.md` - Visual hierarchy theory
- `react-balance-symmetry-guide.md` - React balance patterns
- `semantic-design-guide.md` - Semantic design theory
- `polaris-semantic-guide.md` - Polaris semantics

</details>

---

## 🎯 RewardsPro UI Quick Start

### For New Features
1. Check **[RewardsPro Component Patterns](./rewardspro-patterns.md)** for existing patterns
2. Use **[Polaris Fundamentals](./polaris-fundamentals.md)** for base components
3. Apply **[Design Tokens & Styling](./design-tokens-styling.md)** for consistent styling

### For Styling Issues
1. Reference **[Design Tokens & Styling](./design-tokens-styling.md)** for tokens
2. Check **[Layout & Balance](./layout-balance.md)** for spacing issues
3. Verify responsive behavior in **[Layout & Balance](./layout-balance.md)**

### For Accessibility/i18n
1. Follow **[Internationalization & Accessibility](./i18n-accessibility.md)**
2. Use semantic components from `SemanticReactComponents.tsx`
3. Test with screen readers and keyboard navigation

---

## 🔑 Key Principles for RewardsPro

### 1. Customer-Centric Design
- Clear tier visualization
- Prominent store credit display
- Easy-to-scan transaction history
- Intuitive navigation between customer records

### 2. Merchant Efficiency
- Bulk operations for customer management
- Quick filters and search
- One-click tier adjustments
- Clear cashback calculations

### 3. Consistent Patterns
- Always use Polaris components
- Follow the 60-30-10 color rule
- Maintain 8px spacing grid
- Use sentence case for all UI text

### 4. Global Ready
- Plan for 50% text expansion
- Use semantic color meanings
- Avoid cultural idioms
- Support RTL languages

---

## 📊 Component Usage Matrix

| Feature | Primary Component | Guide Reference | Example File |
|---------|------------------|-----------------|--------------|
| Customer List | DataTable | Polaris Fundamentals | `app.customers.tsx` |
| Tier Display | Badge + Progress | RewardsPro Patterns | `TierBadge.tsx` |
| Credit Balance | MoneyDisplay | RewardsPro Patterns | `SemanticReactComponents.tsx` |
| Forms | TextField + Select | Polaris Fundamentals | `app.tiers.tsx` |
| Modals | Modal + Tabs | Polaris Fundamentals | `CustomerDetailModal.tsx` |
| Loading | SkeletonLoader | Visual & Semantic | `LoadingSkeleton.tsx` |
| Errors | Banner + InlineError | Polaris Fundamentals | `PolarisSemanticExamples.tsx` |

---

## 🛠 Development Workflow

### 1. Component Creation
```tsx
// Start with semantic wrapper
import { SemanticProvider } from './SemanticReactComponents';

// Use Polaris components
import { Card, Button, Text } from '@shopify/polaris';

// Apply design tokens
const spacing = 'var(--p-space-400)'; // 16px
const color = 'var(--p-color-text-success)';
```

### 2. Styling Approach
```tsx
// ✅ Good - Use Polaris tokens
<Box padding="400" background="bg-surface-success">

// ❌ Bad - Custom styles
<div style={{padding: '16px', background: '#green'}}>
```

### 3. Text & Labels
```tsx
// ✅ Good - Sentence case, action-oriented
<Button>Add customer</Button>

// ❌ Bad - Title case, passive
<Button>Customer Can Be Added</Button>
```

---

## 🔍 Quick Find

### Need to implement...
- **Customer detail view?** → See `CustomerDetailModal.tsx`
- **Tier badges?** → See `TierBadge` in `SemanticReactComponents.tsx`
- **Money display?** → See `MoneyDisplay` in `SemanticReactComponents.tsx`
- **Loading states?** → See `LoadingSkeleton` in `SemanticReactComponents.tsx`
- **Error handling?** → See `ErrorMessagePatterns` in `PolarisSemanticExamples.tsx`
- **Responsive layout?** → See `useResponsiveBalance` in `BalancedReactComponents.tsx`
- **Form validation?** → See `SemanticField` in `SemanticReactComponents.tsx`
- **Empty states?** → See `SemanticEmptyState` in `SemanticReactComponents.tsx`

---

## 📝 Checklist for New Components

- [ ] Uses Polaris base components
- [ ] Follows RewardsPro patterns
- [ ] Includes accessibility labels
- [ ] Supports internationalization
- [ ] Has loading states
- [ ] Handles errors gracefully
- [ ] Responsive on mobile
- [ ] Uses design tokens
- [ ] Follows voice & tone guidelines
- [ ] Tested with keyboard navigation

---

*Last Updated: January 2025 | Reorganized for RewardsPro efficiency*