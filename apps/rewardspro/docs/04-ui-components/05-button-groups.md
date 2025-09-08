# Shopify Polaris ButtonGroup Implementation Guide

This comprehensive guide covers all ButtonGroup variants in Shopify Polaris with practical implementations, state management patterns, and real-world use cases for the RewardsPro application.

## Table of Contents
1. [Core ButtonGroup Concepts](#core-concepts)
2. [Default ButtonGroup Implementation](#default-buttongroup)
3. [Segmented ButtonGroup](#segmented-buttongroup)
4. [Pressed State with Segmented Buttons](#pressed-segmented)
5. [Advanced Patterns & Use Cases](#advanced-patterns)
6. [RewardsPro Specific Implementations](#rewardspro-implementations)
7. [Best Practices & Accessibility](#best-practices)

## Core ButtonGroup Concepts {#core-concepts}

ButtonGroup is a layout component that manages spacing and visual relationships between multiple buttons, essential for creating consistent action interfaces.

### Essential Props Reference

```typescript
interface ButtonGroupProps {
  /** Determines the space between button group items */
  gap?: 'extraTight' | 'tight' | 'loose';
  
  /** Styling variant for group */
  variant?: 'segmented';
  
  /** Buttons will stretch/shrink to occupy the full width */
  fullWidth?: boolean;
  
  /** Remove top left and right border radius */
  connectedTop?: boolean;
  
  /** Prevent buttons in button group from wrapping to next line */
  noWrap?: boolean;
  
  /** Button components */
  children?: React.ReactNode;
}
```

### Core Import Structure
```typescript
import { 
  ButtonGroup, 
  Button, 
  Card,
  Page,
  BlockStack,
  InlineStack,
  Banner,
  Text
} from '@shopify/polaris';
import { 
  EditIcon, 
  DeleteIcon,
  ViewIcon,
  ChartVerticalIcon,
  PersonSegmentIcon,
  CalendarIcon,
  PlusCircleIcon,
  CheckCircleIcon
} from '../utils/polaris-icons';
import { useState, useCallback, React } from 'react';
```

## Default ButtonGroup Implementation {#default-buttongroup}

The default ButtonGroup creates evenly spaced buttons with standard visual separation.

### Basic Default Implementation
```typescript
function ButtonGroupDefaultExample() {
  return (
    <ButtonGroup>
      <Button>Cancel</Button>
      <Button variant="primary">Save</Button>
    </ButtonGroup>
  );
}
```

### Real-World Form Actions Pattern
```typescript
function FormWithButtonGroup() {
  const [formData, setFormData] = useState({ 
    name: '', 
    email: '', 
    description: '' 
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const handleSave = useCallback(async () => {
    setLoading(true);
    try {
      await saveData(formData);
      console.log('Saved successfully');
    } catch (error) {
      setErrors({ save: error.message });
    } finally {
      setLoading(false);
    }
  }, [formData]);

  const handleCancel = useCallback(() => {
    setFormData({ name: '', email: '', description: '' });
    setErrors({});
  }, []);

  return (
    <Page title="Edit Product">
      <Card>
        <BlockStack gap="400">
          {/* Form fields */}
          <ButtonGroup>
            <Button 
              onClick={handleCancel}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button 
              variant="primary"
              onClick={handleSave}
              loading={loading}
            >
              Save changes
            </Button>
          </ButtonGroup>
        </BlockStack>
      </Card>
    </Page>
  );
}
```

### Multiple Actions with Hierarchy
```typescript
function ProductActionsButtonGroup() {
  const [loadingStates, setLoadingStates] = useState({
    duplicate: false,
    archive: false,
    publish: false
  });

  const handleAction = useCallback(async (action: string) => {
    setLoadingStates(prev => ({ ...prev, [action]: true }));
    try {
      switch(action) {
        case 'duplicate':
          await duplicateProduct();
          break;
        case 'archive':
          await archiveProduct();
          break;
        case 'publish':
          await publishProduct();
          break;
      }
      console.log(`${action} completed`);
    } finally {
      setLoadingStates(prev => ({ ...prev, [action]: false }));
    }
  }, []);

  return (
    <ButtonGroup>
      <Button 
        onClick={() => handleAction('duplicate')}
        loading={loadingStates.duplicate}
      >
        Duplicate
      </Button>
      <Button 
        onClick={() => handleAction('archive')}
        loading={loadingStates.archive}
      >
        Archive
      </Button>
      <Button 
        variant="primary"
        onClick={() => handleAction('publish')}
        loading={loadingStates.publish}
      >
        Publish
      </Button>
    </ButtonGroup>
  );
}
```

### Gap Variations for Different Contexts
```typescript
function ButtonGroupGapExamples() {
  return (
    <BlockStack gap="500">
      {/* Extra tight for icon-only buttons */}
      <ButtonGroup gap="extraTight">
        <Button icon={EditIcon} accessibilityLabel="Edit" />
        <Button icon={ViewIcon} accessibilityLabel="View" />
        <Button icon={DeleteIcon} accessibilityLabel="Delete" />
      </ButtonGroup>

      {/* Default gap for standard actions */}
      <ButtonGroup>
        <Button>Option A</Button>
        <Button>Option B</Button>
        <Button>Option C</Button>
      </ButtonGroup>

      {/* Loose gap for important distinct actions */}
      <ButtonGroup gap="loose">
        <Button tone="critical">Delete All</Button>
        <Button variant="primary">Save All</Button>
      </ButtonGroup>
    </BlockStack>
  );
}
```

### Full Width ButtonGroup
```typescript
function FullWidthButtonGroupExample() {
  const [isMobile, setIsMobile] = useState(false);

  return (
    <div style={{ maxWidth: '400px', margin: '0 auto' }}>
      <ButtonGroup fullWidth>
        <Button>Cancel</Button>
        <Button>Save draft</Button>
        <Button variant="primary">Publish</Button>
      </ButtonGroup>
    </div>
  );
}

// Mobile-optimized actions
function MobileResponsiveButtonGroup() {
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const isMobile = viewportWidth < 768;

  return (
    <ButtonGroup fullWidth={isMobile} noWrap={!isMobile}>
      <Button>Back</Button>
      <Button variant="primary">Continue</Button>
    </ButtonGroup>
  );
}
```

## Segmented ButtonGroup {#segmented-buttongroup}

Segmented button groups create visually connected buttons that function as a cohesive unit.

### Basic Segmented ButtonGroup
```typescript
function ButtonGroupSegmentedExample() {
  return (
    <ButtonGroup variant="segmented">
      <Button>Day</Button>
      <Button>Week</Button>
      <Button>Month</Button>
    </ButtonGroup>
  );
}
```

### View Switcher Pattern
```typescript
function ViewSwitcherSegmented() {
  const [activeView, setActiveView] = useState('grid');

  return (
    <ButtonGroup variant="segmented">
      <Button 
        onClick={() => setActiveView('list')}
        pressed={activeView === 'list'}
        icon={PersonSegmentIcon}
      >
        List
      </Button>
      <Button 
        onClick={() => setActiveView('grid')}
        pressed={activeView === 'grid'}
        icon={ChartVerticalIcon}
      >
        Grid
      </Button>
      <Button 
        onClick={() => setActiveView('calendar')}
        pressed={activeView === 'calendar'}
        icon={CalendarIcon}
      >
        Calendar
      </Button>
    </ButtonGroup>
  );
}
```

### Filter Options with Segmented Buttons
```typescript
function FilterButtonGroup() {
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);

  const applyFilter = useCallback(async (filterType: string) => {
    setLoading(true);
    setFilter(filterType);
    
    try {
      await fetchFilteredData(filterType);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <ButtonGroup variant="segmented">
      <Button 
        onClick={() => applyFilter('all')}
        disabled={loading}
        pressed={filter === 'all'}
      >
        All products
      </Button>
      <Button 
        onClick={() => applyFilter('active')}
        disabled={loading}
        pressed={filter === 'active'}
      >
        Active
      </Button>
      <Button 
        onClick={() => applyFilter('draft')}
        disabled={loading}
        pressed={filter === 'draft'}
      >
        Draft
      </Button>
      <Button 
        onClick={() => applyFilter('archived')}
        disabled={loading}
        pressed={filter === 'archived'}
      >
        Archived
      </Button>
    </ButtonGroup>
  );
}
```

## Pressed State with Segmented Buttons {#pressed-segmented}

The pressed state creates toggle functionality where buttons act like radio buttons or checkboxes.

### Radio Button Pattern (Single Selection)
```typescript
function ButtonGroupPressedExample() {
  const [selected, setSelected] = useState('option1');

  const handleSelect = useCallback((value: string) => {
    setSelected(value);
    console.log(`Selected: ${value}`);
  }, []);

  return (
    <ButtonGroup variant="segmented">
      <Button 
        pressed={selected === 'option1'}
        onClick={() => handleSelect('option1')}
        ariaPressed={selected === 'option1'}
      >
        Option 1
      </Button>
      <Button 
        pressed={selected === 'option2'}
        onClick={() => handleSelect('option2')}
        ariaPressed={selected === 'option2'}
      >
        Option 2
      </Button>
      <Button 
        pressed={selected === 'option3'}
        onClick={() => handleSelect('option3')}
        ariaPressed={selected === 'option3'}
      >
        Option 3
      </Button>
    </ButtonGroup>
  );
}
```

### Multi-Selection Pattern (Checkbox-like)
```typescript
function MultiSelectSegmentedButtons() {
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set());

  const toggleOption = useCallback((option: string) => {
    setSelectedOptions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(option)) {
        newSet.delete(option);
      } else {
        newSet.add(option);
      }
      return newSet;
    });
  }, []);

  return (
    <ButtonGroup variant="segmented">
      <Button 
        pressed={selectedOptions.has('bold')}
        onClick={() => toggleOption('bold')}
        ariaPressed={selectedOptions.has('bold')}
      >
        Bold
      </Button>
      <Button 
        pressed={selectedOptions.has('italic')}
        onClick={() => toggleOption('italic')}
        ariaPressed={selectedOptions.has('italic')}
      >
        Italic
      </Button>
      <Button 
        pressed={selectedOptions.has('underline')}
        onClick={() => toggleOption('underline')}
        ariaPressed={selectedOptions.has('underline')}
      >
        Underline
      </Button>
    </ButtonGroup>
  );
}
```

### Date Range Selector
```typescript
function DateRangeSelector() {
  const [selectedRange, setSelectedRange] = useState('today');

  const ranges = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last7days', label: 'Last 7 days' },
    { value: 'last30days', label: 'Last 30 days' },
    { value: 'custom', label: 'Custom' }
  ];

  const handleRangeSelect = useCallback((range: string) => {
    setSelectedRange(range);
    
    if (range === 'custom') {
      // Open date picker modal
      console.log('Opening custom date picker');
    } else {
      // Apply predefined range
      console.log(`Applied range: ${range}`);
    }
  }, []);

  return (
    <ButtonGroup variant="segmented">
      {ranges.map(range => (
        <Button
          key={range.value}
          pressed={selectedRange === range.value}
          onClick={() => handleRangeSelect(range.value)}
        >
          {range.label}
        </Button>
      ))}
    </ButtonGroup>
  );
}
```

## Advanced Patterns & Use Cases {#advanced-patterns}

### Complex State Management with Multiple Groups
```typescript
function ComplexFilterSystem() {
  const [filters, setFilters] = useState({
    status: 'all',
    sortBy: 'date',
    view: 'grid'
  });

  const updateFilter = useCallback((filterType: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
    // Trigger data refresh
    console.log(`Filter updated: ${filterType} = ${value}`);
  }, []);

  return (
    <BlockStack gap="300">
      <Text variant="headingSm">Status Filter</Text>
      <ButtonGroup variant="segmented">
        <Button 
          pressed={filters.status === 'all'}
          onClick={() => updateFilter('status', 'all')}
        >
          All
        </Button>
        <Button 
          pressed={filters.status === 'active'}
          onClick={() => updateFilter('status', 'active')}
        >
          Active
        </Button>
        <Button 
          pressed={filters.status === 'inactive'}
          onClick={() => updateFilter('status', 'inactive')}
        >
          Inactive
        </Button>
      </ButtonGroup>

      <Text variant="headingSm">Sort By</Text>
      <ButtonGroup variant="segmented">
        <Button 
          pressed={filters.sortBy === 'date'}
          onClick={() => updateFilter('sortBy', 'date')}
        >
          Date
        </Button>
        <Button 
          pressed={filters.sortBy === 'name'}
          onClick={() => updateFilter('sortBy', 'name')}
        >
          Name
        </Button>
        <Button 
          pressed={filters.sortBy === 'amount'}
          onClick={() => updateFilter('sortBy', 'amount')}
        >
          Amount
        </Button>
      </ButtonGroup>

      <Text variant="headingSm">View Type</Text>
      <ButtonGroup variant="segmented">
        <Button 
          pressed={filters.view === 'grid'}
          onClick={() => updateFilter('view', 'grid')}
          icon={ChartVerticalIcon}
          accessibilityLabel="Grid view"
        />
        <Button 
          pressed={filters.view === 'list'}
          onClick={() => updateFilter('view', 'list')}
          icon={PersonSegmentIcon}
          accessibilityLabel="List view"
        />
      </ButtonGroup>
    </BlockStack>
  );
}
```

### Responsive ButtonGroup
```typescript
function ResponsiveButtonGroup() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [selected, setSelected] = useState('option1');

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Stack vertically on mobile
  if (isMobile) {
    return (
      <BlockStack gap="200">
        <Button 
          fullWidth
          variant={selected === 'option1' ? 'primary' : undefined}
          onClick={() => setSelected('option1')}
        >
          Option 1
        </Button>
        <Button 
          fullWidth
          variant={selected === 'option2' ? 'primary' : undefined}
          onClick={() => setSelected('option2')}
        >
          Option 2
        </Button>
        <Button 
          fullWidth
          variant={selected === 'option3' ? 'primary' : undefined}
          onClick={() => setSelected('option3')}
        >
          Option 3
        </Button>
      </BlockStack>
    );
  }

  return (
    <ButtonGroup variant="segmented">
      <Button 
        pressed={selected === 'option1'}
        onClick={() => setSelected('option1')}
      >
        Option 1
      </Button>
      <Button 
        pressed={selected === 'option2'}
        onClick={() => setSelected('option2')}
      >
        Option 2
      </Button>
      <Button 
        pressed={selected === 'option3'}
        onClick={() => setSelected('option3')}
      >
        Option 3
      </Button>
    </ButtonGroup>
  );
}
```

### Connected Top Pattern (Card Integration)
```typescript
function CardWithConnectedButtonGroup() {
  const [selected, setSelected] = useState('optionA');

  return (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingMd">Settings</Text>
        <Text>Choose your preference:</Text>
        <ButtonGroup 
          variant="segmented" 
          connectedTop
          fullWidth
        >
          <Button 
            pressed={selected === 'optionA'}
            onClick={() => setSelected('optionA')}
          >
            Option A
          </Button>
          <Button 
            pressed={selected === 'optionB'}
            onClick={() => setSelected('optionB')}
          >
            Option B
          </Button>
          <Button 
            pressed={selected === 'optionC'}
            onClick={() => setSelected('optionC')}
          >
            Option C
          </Button>
        </ButtonGroup>
      </BlockStack>
    </Card>
  );
}
```

### Dynamic ButtonGroup Generation
```typescript
function DynamicButtonGroup() {
  const [options, setOptions] = useState([
    { id: '1', label: 'Option 1', value: 'opt1' },
    { id: '2', label: 'Option 2', value: 'opt2' },
    { id: '3', label: 'Option 3', value: 'opt3' }
  ]);
  const [selected, setSelected] = useState('opt1');

  const addOption = useCallback(() => {
    const newId = Date.now().toString();
    setOptions(prev => [...prev, {
      id: newId,
      label: `Option ${prev.length + 1}`,
      value: `opt${prev.length + 1}`
    }]);
  }, []);

  return (
    <BlockStack gap="400">
      <ButtonGroup 
        variant="segmented"
        noWrap={false}
      >
        {options.map(option => (
          <Button
            key={option.id}
            pressed={selected === option.value}
            onClick={() => setSelected(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </ButtonGroup>
      
      <Button onClick={addOption} icon={PlusCircleIcon}>
        Add Option
      </Button>
    </BlockStack>
  );
}
```

## RewardsPro Specific Implementations {#rewardspro-implementations}

### Tier Management Actions
```typescript
function TierManagementButtonGroup({ tier, onEdit, onDelete, onDuplicate }) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const handleAction = useCallback(async (action: string, callback: Function) => {
    setLoadingAction(action);
    try {
      await callback();
    } finally {
      setLoadingAction(null);
    }
  }, []);

  return (
    <ButtonGroup>
      <Button
        icon={EditIcon}
        onClick={() => handleAction('edit', () => onEdit(tier.id))}
        loading={loadingAction === 'edit'}
        disabled={loadingAction !== null && loadingAction !== 'edit'}
      >
        Edit
      </Button>
      <Button
        onClick={() => handleAction('duplicate', () => onDuplicate(tier.id))}
        loading={loadingAction === 'duplicate'}
        disabled={loadingAction !== null && loadingAction !== 'duplicate'}
      >
        Duplicate
      </Button>
      <Button
        tone="critical"
        onClick={() => handleAction('delete', () => onDelete(tier.id))}
        loading={loadingAction === 'delete'}
        disabled={loadingAction !== null && loadingAction !== 'delete'}
      >
        Delete
      </Button>
    </ButtonGroup>
  );
}
```

### Customer Filter Controls
```typescript
function CustomerFilterControls() {
  const [filters, setFilters] = useState({
    tier: 'all',
    status: 'active',
    period: 'all'
  });

  return (
    <BlockStack gap="400">
      {/* Tier Filter */}
      <InlineStack gap="300">
        <Text variant="bodyMd">Tier:</Text>
        <ButtonGroup variant="segmented">
          <Button pressed={filters.tier === 'all'} onClick={() => setFilters({...filters, tier: 'all'})}>
            All Tiers
          </Button>
          <Button pressed={filters.tier === 'bronze'} onClick={() => setFilters({...filters, tier: 'bronze'})}>
            Bronze
          </Button>
          <Button pressed={filters.tier === 'silver'} onClick={() => setFilters({...filters, tier: 'silver'})}>
            Silver
          </Button>
          <Button pressed={filters.tier === 'gold'} onClick={() => setFilters({...filters, tier: 'gold'})}>
            Gold
          </Button>
        </ButtonGroup>
      </InlineStack>

      {/* Status Filter */}
      <InlineStack gap="300">
        <Text variant="bodyMd">Status:</Text>
        <ButtonGroup variant="segmented">
          <Button pressed={filters.status === 'active'} onClick={() => setFilters({...filters, status: 'active'})}>
            Active
          </Button>
          <Button pressed={filters.status === 'inactive'} onClick={() => setFilters({...filters, status: 'inactive'})}>
            Inactive
          </Button>
        </ButtonGroup>
      </InlineStack>
    </BlockStack>
  );
}
```

### Billing Plan Actions
```typescript
function BillingPlanActions({ currentPlan, availablePlans }) {
  const [upgrading, setUpgrading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(currentPlan);

  const handleUpgrade = useCallback(async () => {
    setUpgrading(true);
    try {
      await upgradePlan(selectedPlan);
      console.log('Plan upgraded successfully');
    } finally {
      setUpgrading(false);
    }
  }, [selectedPlan]);

  return (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingMd">Select Plan</Text>
        
        <ButtonGroup variant="segmented" fullWidth>
          {availablePlans.map(plan => (
            <Button
              key={plan.id}
              pressed={selectedPlan === plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              disabled={plan.id === currentPlan}
            >
              {plan.name}
            </Button>
          ))}
        </ButtonGroup>

        <ButtonGroup>
          <Button onClick={() => setSelectedPlan(currentPlan)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleUpgrade}
            loading={upgrading}
            disabled={selectedPlan === currentPlan}
          >
            Upgrade to {availablePlans.find(p => p.id === selectedPlan)?.name}
          </Button>
        </ButtonGroup>
      </BlockStack>
    </Card>
  );
}
```

### Store Credit Actions
```typescript
function StoreCreditActions({ customer }) {
  const [action, setAction] = useState<'add' | 'deduct' | null>(null);
  const [amount, setAmount] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!action || !amount) return;
    
    setProcessing(true);
    try {
      if (action === 'add') {
        await addStoreCredit(customer.id, amount);
      } else {
        await deductStoreCredit(customer.id, amount);
      }
      console.log('Store credit updated');
      setAction(null);
      setAmount('');
    } finally {
      setProcessing(false);
    }
  }, [action, amount, customer.id]);

  return (
    <BlockStack gap="400">
      <ButtonGroup variant="segmented">
        <Button
          pressed={action === 'add'}
          onClick={() => setAction('add')}
        >
          Add Credit
        </Button>
        <Button
          pressed={action === 'deduct'}
          onClick={() => setAction('deduct')}
        >
          Deduct Credit
        </Button>
      </ButtonGroup>

      {action && (
        <>
          <TextField
            label="Amount"
            type="number"
            value={amount}
            onChange={setAmount}
            prefix="$"
          />
          
          <ButtonGroup>
            <Button onClick={() => { setAction(null); setAmount(''); }}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={processing}
              disabled={!amount || parseFloat(amount) <= 0}
            >
              {action === 'add' ? 'Add' : 'Deduct'} ${amount || '0'}
            </Button>
          </ButtonGroup>
        </>
      )}
    </BlockStack>
  );
}
```

## Best Practices & Accessibility {#best-practices}

### Accessibility Implementation
```typescript
function AccessibleButtonGroup() {
  const [selected, setSelected] = useState('view1');
  const groupId = 'view-selector';
  const labelId = 'view-selector-label';

  return (
    <>
      <label id={labelId} className="visually-hidden">
        Select view type
      </label>
      <ButtonGroup 
        variant="segmented"
        role="group"
        aria-labelledby={labelId}
      >
        <Button
          pressed={selected === 'view1'}
          onClick={() => setSelected('view1')}
          ariaPressed={selected === 'view1'}
          role="radio"
          aria-checked={selected === 'view1'}
        >
          Grid view
        </Button>
        <Button
          pressed={selected === 'view2'}
          onClick={() => setSelected('view2')}
          ariaPressed={selected === 'view2'}
          role="radio"
          aria-checked={selected === 'view2'}
        >
          List view
        </Button>
      </ButtonGroup>
    </>
  );
}
```

### Loading States Management
```typescript
function ButtonGroupWithLoadingStates() {
  const [loadingStates, setLoadingStates] = useState({
    action1: false,
    action2: false,
    action3: false
  });

  const handleAction = useCallback(async (actionType: string) => {
    setLoadingStates(prev => ({ ...prev, [actionType]: true }));
    
    try {
      await performAction(actionType);
    } finally {
      setLoadingStates(prev => ({ ...prev, [actionType]: false }));
    }
  }, []);

  const anyLoading = Object.values(loadingStates).some(Boolean);

  return (
    <ButtonGroup>
      <Button
        onClick={() => handleAction('action1')}
        loading={loadingStates.action1}
        disabled={anyLoading && !loadingStates.action1}
      >
        Action 1
      </Button>
      <Button
        onClick={() => handleAction('action2')}
        loading={loadingStates.action2}
        disabled={anyLoading && !loadingStates.action2}
      >
        Action 2
      </Button>
      <Button
        onClick={() => handleAction('action3')}
        loading={loadingStates.action3}
        disabled={anyLoading && !loadingStates.action3}
        variant="primary"
      >
        Action 3
      </Button>
    </ButtonGroup>
  );
}
```

### Error Handling Pattern
```typescript
function ButtonGroupWithErrorHandling() {
  const [error, setError] = useState<{action: string, message: string} | null>(null);
  const [retrying, setRetrying] = useState(false);

  const handleAction = useCallback(async (action: string) => {
    setError(null);
    
    try {
      await performAction(action);
    } catch (err) {
      setError({
        action,
        message: err.message
      });
    }
  }, []);

  const retry = useCallback(async () => {
    if (!error) return;
    
    setRetrying(true);
    try {
      await handleAction(error.action);
      setError(null);
    } finally {
      setRetrying(false);
    }
  }, [error, handleAction]);

  return (
    <BlockStack gap="400">
      {error && (
        <Banner
          title="Action failed"
          tone="critical"
          action={{
            content: 'Retry',
            onAction: retry,
            loading: retrying
          }}
        >
          <p>{error.message}</p>
        </Banner>
      )}
      
      <ButtonGroup>
        <Button onClick={() => handleAction('cancel')}>
          Cancel
        </Button>
        <Button onClick={() => handleAction('save')}>
          Save draft
        </Button>
        <Button 
          variant="primary"
          onClick={() => handleAction('publish')}
        >
          Publish
        </Button>
      </ButtonGroup>
    </BlockStack>
  );
}
```

## Key Implementation Guidelines

### Do's ✅
- **Limit to 6 buttons maximum** when using icon-only buttons
- **Use segmented variant** for related toggle options
- **Maintain single primary action** per ButtonGroup
- **Provide proper ARIA attributes** for accessibility
- **Use pressed state** for toggle functionality
- **Consider mobile responsiveness** with fullWidth and noWrap props
- **Disable all buttons** when one is performing an async action
- **Use gap variations** appropriately for context

### Don'ts ❌
- **Don't mix too many button variants** in one group
- **Don't use more than one primary button** in a group
- **Don't nest ButtonGroups** within each other
- **Don't forget loading/disabled states** for async actions
- **Don't omit accessibility labels** for icon-only buttons
- **Don't exceed 5-6 segments** in a segmented group
- **Don't use segmented groups** for unrelated actions

### Performance Optimization
```typescript
// Memoize callback functions
const handleClick = useCallback(() => {
  // Action logic
}, [dependencies]);

// Memoize button groups in lists
const MemoizedButtonGroup = React.memo(({ item, onAction }) => (
  <ButtonGroup>
    <Button onClick={() => onAction(item.id, 'edit')}>Edit</Button>
    <Button onClick={() => onAction(item.id, 'delete')}>Delete</Button>
  </ButtonGroup>
));

// Optimize large lists with virtualization
function OptimizedButtonList({ items }) {
  const renderButtonGroup = useCallback((item) => (
    <MemoizedButtonGroup key={item.id} item={item} onAction={handleAction} />
  ), []);

  return items.map(renderButtonGroup);
}
```

## Common Patterns Summary

### Form Actions
```typescript
<ButtonGroup>
  <Button>Cancel</Button>
  <Button>Save draft</Button>
  <Button variant="primary">Publish</Button>
</ButtonGroup>
```

### Toggle/Filter
```typescript
<ButtonGroup variant="segmented">
  <Button pressed={state === 'a'}>Option A</Button>
  <Button pressed={state === 'b'}>Option B</Button>
  <Button pressed={state === 'c'}>Option C</Button>
</ButtonGroup>
```

### Table Row Actions
```typescript
<ButtonGroup gap="extraTight">
  <Button icon={ViewIcon} accessibilityLabel="View" />
  <Button icon={EditIcon} accessibilityLabel="Edit" />
  <Button icon={DeleteIcon} accessibilityLabel="Delete" tone="critical" />
</ButtonGroup>
```

### Confirmation Pattern
```typescript
<ButtonGroup>
  <Button onClick={onCancel}>Cancel</Button>
  <Button variant="primary" tone="critical" onClick={onConfirm}>
    Confirm Delete
  </Button>
</ButtonGroup>
```

This comprehensive guide provides production-ready ButtonGroup implementations for the RewardsPro application, with practical examples demonstrating real-world use cases and best practices.