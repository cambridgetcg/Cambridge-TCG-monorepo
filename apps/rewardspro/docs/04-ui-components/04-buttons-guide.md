# Shopify Polaris Button Implementation Guide

This comprehensive guide covers all Shopify Polaris Button variants with detailed code implementations, practical patterns, and real-world use cases for the RewardsPro application.

## Table of Contents
- [Core Setup](#core-setup)
- [Basic Button Variants](#basic-button-variants)
- [Semantic/Tone Variants](#semantictone-variants)
- [Size and Layout Variants](#size-and-layout-variants)
- [State Variants](#state-variants)
- [Disclosure Variants](#disclosure-variants)
- [Icon Variants](#icon-variants)
- [Practical Patterns](#practical-patterns)
- [Accessibility Guidelines](#accessibility-guidelines)

## Core Setup

Required imports for all button implementations:

```typescript
import { Button, ButtonGroup, Popover, ActionList } from '@shopify/polaris';
import { 
  PlusCircleIcon, 
  EditIcon, 
  DeleteIcon,
  ExternalIcon,
  CalendarIcon,
  CopyIcon,
  ChevronDownIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  AlertTriangleIcon
} from '../utils/polaris-icons'; // Use our centralized icons file
import { useState, useCallback, useEffect, useRef } from 'react';
```

## Basic Button Variants

### Default Button
The foundation button with standard styling.

```typescript
// Basic implementation
function DefaultButton() {
  return (
    <Button onClick={() => console.log('Clicked')}>
      Add product
    </Button>
  );
}

// With loading state
function DefaultButtonWithState() {
  const [loading, setLoading] = useState(false);
  
  const handleClick = useCallback(async () => {
    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('Action completed');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <Button 
      onClick={handleClick}
      loading={loading}
      disabled={loading}
    >
      {loading ? 'Processing...' : 'Process action'}
    </Button>
  );
}
```

### Plain Button
Minimal styling, appears like a link.

```typescript
function PlainButton() {
  return (
    <Button 
      variant="plain"
      onClick={() => console.log('Plain action')}
    >
      View details
    </Button>
  );
}

// In a card context
function CardWithPlainButton() {
  return (
    <Card>
      <BlockStack gap="200">
        <Text variant="headingMd">Product Name</Text>
        <Text>Product description...</Text>
        <Button variant="plain" onClick={() => console.log('Edit')}>
          Edit details
        </Button>
      </BlockStack>
    </Card>
  );
}
```

### Tertiary Button
Minimal visual weight for repeated actions.

```typescript
function TertiaryButton() {
  return (
    <Button 
      variant="tertiary"
      onClick={() => console.log('Tertiary action')}
    >
      More options
    </Button>
  );
}

// Icon buttons in lists
function ListItemWithActions() {
  return (
    <InlineStack gap="200" align="space-between">
      <Text>Product Item</Text>
      <InlineStack gap="100">
        <Button 
          variant="tertiary" 
          icon={EditIcon}
          accessibilityLabel="Edit product"
        />
        <Button 
          variant="tertiary" 
          icon={CopyIcon}
          accessibilityLabel="Duplicate product"
        />
      </InlineStack>
    </InlineStack>
  );
}
```

## Semantic/Tone Variants

### Primary Button
Highest visual hierarchy for main actions.

```typescript
function PrimaryButton() {
  return (
    <Button 
      variant="primary"
      onClick={() => console.log('Primary action')}
    >
      Save changes
    </Button>
  );
}

// Form with primary action
function FormWithPrimaryAction() {
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  
  const handleSubmit = useCallback(async () => {
    setSaving(true);
    try {
      await saveData(formData);
      console.log('Saved successfully');
    } finally {
      setSaving(false);
    }
  }, [formData]);
  
  return (
    <form>
      <BlockStack gap="400">
        {/* Form fields */}
        <ButtonGroup>
          <Button onClick={() => console.log('Cancel')}>
            Cancel
          </Button>
          <Button 
            variant="primary"
            onClick={handleSubmit}
            loading={saving}
          >
            Save customer
          </Button>
        </ButtonGroup>
      </BlockStack>
    </form>
  );
}
```

### Critical Buttons
For destructive actions requiring confirmation.

```typescript
// Primary critical button
function DeleteButton() {
  const [confirmDelete, setConfirmDelete] = useState(false);
  
  const handleDelete = useCallback(() => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    console.log('Item deleted');
    setConfirmDelete(false);
  }, [confirmDelete]);

  return (
    <Button 
      variant="primary"
      tone="critical"
      onClick={handleDelete}
    >
      {confirmDelete ? 'Confirm deletion' : 'Delete item'}
    </Button>
  );
}

// Plain critical button for lists
function RemovableItem({ item, onRemove }) {
  return (
    <InlineStack align="space-between">
      <Text>{item.name}</Text>
      <Button 
        variant="plain"
        tone="critical"
        onClick={() => onRemove(item.id)}
      >
        Remove
      </Button>
    </InlineStack>
  );
}
```

### Success Tone Button
For positive confirmations.

```typescript
function SuccessButton() {
  const [saved, setSaved] = useState(false);
  
  return (
    <Button 
      tone={saved ? "success" : undefined}
      onClick={() => setSaved(true)}
    >
      {saved ? '✓ Saved' : 'Save'}
    </Button>
  );
}
```

## Size and Layout Variants

### Large Button
Increased padding for prominence or touch targets.

```typescript
function LargeButton() {
  return (
    <Button 
      size="large"
      variant="primary"
      onClick={() => console.log('Large action')}
    >
      Complete purchase
    </Button>
  );
}

// Mobile-optimized CTA
function MobileCallToAction() {
  return (
    <Box padding="400">
      <Button 
        size="large"
        variant="primary"
        fullWidth
        onClick={() => console.log('CTA clicked')}
      >
        Start free trial
      </Button>
    </Box>
  );
}
```

### Full Width Button
Stretches to container width.

```typescript
function FullWidthButton() {
  return (
    <Box maxWidth="400px">
      <Button 
        fullWidth
        variant="primary"
        onClick={() => console.log('Full width action')}
      >
        Add to cart
      </Button>
    </Box>
  );
}

// Login form example
function LoginForm() {
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  
  return (
    <Card>
      <BlockStack gap="400">
        <TextField 
          label="Email"
          value={credentials.email}
          onChange={(value) => setCredentials({...credentials, email: value})}
          type="email"
        />
        <TextField 
          label="Password"
          value={credentials.password}
          onChange={(value) => setCredentials({...credentials, password: value})}
          type="password"
        />
        <Button 
          fullWidth
          size="large"
          variant="primary"
          loading={loading}
          onClick={() => console.log('Login')}
        >
          Sign in
        </Button>
      </BlockStack>
    </Card>
  );
}
```

### Text Aligned Buttons
Control text positioning within button.

```typescript
function TextAlignedButtons() {
  return (
    <BlockStack gap="200">
      <Button 
        textAlign="center"
        fullWidth
        onClick={() => console.log('Center')}
      >
        Centered text
      </Button>
      <Button 
        textAlign="start"
        fullWidth
        onClick={() => console.log('Start')}
      >
        Left aligned text
      </Button>
      <Button 
        textAlign="end"
        fullWidth
        onClick={() => console.log('End')}
      >
        Right aligned text
      </Button>
    </BlockStack>
  );
}
```

## State Variants

### Pressed Button
Indicates active/selected state.

```typescript
function ToggleButton() {
  const [isPressed, setIsPressed] = useState(false);
  
  return (
    <Button 
      pressed={isPressed}
      onClick={() => setIsPressed(!isPressed)}
      ariaPressed={isPressed}
    >
      {isPressed ? 'Selected' : 'Not selected'}
    </Button>
  );
}

// View toggle example
function ViewToggle() {
  const [view, setView] = useState('grid');
  
  return (
    <ButtonGroup segmented>
      <Button 
        pressed={view === 'list'}
        onClick={() => setView('list')}
      >
        List view
      </Button>
      <Button 
        pressed={view === 'grid'}
        onClick={() => setView('grid')}
      >
        Grid view
      </Button>
    </ButtonGroup>
  );
}
```

### Disabled Button
Prevents interaction when conditions aren't met.

```typescript
function DisabledButton() {
  const [isFormValid, setIsFormValid] = useState(false);
  
  return (
    <ButtonGroup>
      <Button disabled>
        Always disabled
      </Button>
      <Button 
        disabled={!isFormValid}
        variant="primary"
        onClick={() => console.log('Submit')}
      >
        Submit
      </Button>
    </ButtonGroup>
  );
}
```

### Loading Button
Shows spinner during async operations.

```typescript
function LoadingButton() {
  const [loading, setLoading] = useState(false);
  
  const handleAction = useCallback(async () => {
    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <Button 
      variant="primary"
      loading={loading}
      onClick={handleAction}
    >
      Save changes
    </Button>
  );
}
```

## Disclosure Variants

### Plain Disclosure Button
Creates dropdown triggers.

```typescript
function DisclosureButton() {
  const [active, setActive] = useState(false);
  
  const toggleActive = useCallback(() => setActive(!active), [active]);

  const activator = (
    <Button 
      variant="plain"
      disclosure
      onClick={toggleActive}
      ariaExpanded={active}
    >
      View options
    </Button>
  );

  return (
    <Popover
      active={active}
      activator={activator}
      onClose={toggleActive}
    >
      <ActionList
        items={[
          { content: 'Edit', onAction: () => console.log('Edit') },
          { content: 'Delete', onAction: () => console.log('Delete') }
        ]}
      />
    </Popover>
  );
}
```

### Select Disclosure Button
Dropdown with select arrow.

```typescript
function SelectButton() {
  const [selected, setSelected] = useState('Option 1');
  const [active, setActive] = useState(false);
  
  const toggleActive = useCallback(() => setActive(!active), [active]);

  const activator = (
    <Button 
      disclosure="select"
      onClick={toggleActive}
    >
      {selected}
    </Button>
  );

  return (
    <Popover
      active={active}
      activator={activator}
      onClose={toggleActive}
    >
      <ActionList
        items={[
          { 
            content: 'Option 1', 
            onAction: () => {
              setSelected('Option 1');
              toggleActive();
            }
          },
          { 
            content: 'Option 2', 
            onAction: () => {
              setSelected('Option 2');
              toggleActive();
            }
          }
        ]}
      />
    </Popover>
  );
}
```

### Split Button
Primary action with additional options.

```typescript
function SplitButton() {
  return (
    <Button
      variant="primary"
      onClick={() => console.log('Primary save')}
      connectedDisclosure={{
        accessibilityLabel: 'Other save actions',
        actions: [
          {
            content: 'Save as draft',
            onAction: () => console.log('Draft')
          },
          {
            content: 'Save and duplicate',
            onAction: () => console.log('Duplicate')
          }
        ]
      }}
    >
      Save
    </Button>
  );
}
```

## Icon Variants

### Button with Icon
Icon appears to the left of text.

```typescript
function ButtonWithIcon() {
  return (
    <ButtonGroup>
      <Button 
        icon={PlusCircleIcon}
        variant="primary"
        onClick={() => console.log('Add')}
      >
        Add product
      </Button>
      <Button 
        icon={EditIcon}
        onClick={() => console.log('Edit')}
      >
        Edit
      </Button>
      <Button 
        icon={DeleteIcon}
        tone="critical"
        onClick={() => console.log('Delete')}
      >
        Delete
      </Button>
    </ButtonGroup>
  );
}
```

### Icon Only Button
No text, requires accessibility label.

```typescript
function IconOnlyButtons() {
  return (
    <InlineStack gap="100">
      <Button 
        icon={EditIcon}
        variant="tertiary"
        accessibilityLabel="Edit item"
        onClick={() => console.log('Edit')}
      />
      <Button 
        icon={CopyIcon}
        variant="tertiary"
        accessibilityLabel="Duplicate item"
        onClick={() => console.log('Copy')}
      />
      <Button 
        icon={DeleteIcon}
        variant="tertiary"
        tone="critical"
        accessibilityLabel="Delete item"
        onClick={() => console.log('Delete')}
      />
    </InlineStack>
  );
}
```

## Practical Patterns

### Form Action Buttons
Complete form implementation with proper states.

```typescript
function FormActions() {
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  
  const isValid = Object.keys(formData).length > 0;
  
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveData(formData);
    } catch (error) {
      setErrors({ submit: error.message });
    } finally {
      setSaving(false);
    }
  }, [formData]);

  return (
    <ButtonGroup>
      <Button 
        onClick={() => console.log('Cancel')}
        disabled={saving}
      >
        Cancel
      </Button>
      <Button
        onClick={() => console.log('Draft')}
        disabled={saving || !formData.title}
      >
        Save draft
      </Button>
      <Button
        variant="primary"
        onClick={handleSave}
        loading={saving}
        disabled={!isValid}
      >
        Save
      </Button>
    </ButtonGroup>
  );
}
```

### Destructive Action Pattern
Safe deletion with confirmation.

```typescript
function SafeDeleteButton({ onDelete, itemName }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  const handleDelete = useCallback(async () => {
    if (!showConfirm) {
      setShowConfirm(true);
      setTimeout(() => setShowConfirm(false), 3000);
      return;
    }
    
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setShowConfirm(false);
    }
  }, [showConfirm, onDelete]);

  if (showConfirm) {
    return (
      <ButtonGroup>
        <Button onClick={() => setShowConfirm(false)}>
          Cancel
        </Button>
        <Button
          variant="primary"
          tone="critical"
          onClick={handleDelete}
          loading={deleting}
        >
          Confirm delete {itemName}
        </Button>
      </ButtonGroup>
    );
  }

  return (
    <Button
      tone="critical"
      onClick={handleDelete}
    >
      Delete
    </Button>
  );
}
```

### Navigation Buttons
Internal and external navigation patterns.

```typescript
function NavigationButtons() {
  const navigate = useNavigate();
  
  return (
    <BlockStack gap="200">
      {/* Internal navigation */}
      <Button 
        url="/app/products/new"
        onClick={() => navigate('/app/products/new')}
        icon={PlusCircleIcon}
        variant="primary"
      >
        Create product
      </Button>
      
      {/* External link */}
      <Button
        url="https://help.shopify.com"
        external
        icon={ExternalIcon}
        accessibilityLabel="Help docs (opens in new window)"
      >
        View documentation
      </Button>
      
      {/* Back navigation */}
      <Button 
        variant="plain"
        onClick={() => navigate(-1)}
      >
        ← Back to list
      </Button>
    </BlockStack>
  );
}
```

### Bulk Actions Pattern
For tables and lists with multiple selections.

```typescript
function BulkActions({ selectedItems, onAction }) {
  const hasSelection = selectedItems.length > 0;
  
  return (
    <ButtonGroup>
      <Button
        disabled={!hasSelection}
        onClick={() => onAction('export', selectedItems)}
      >
        Export {selectedItems.length} items
      </Button>
      <Button
        disabled={!hasSelection}
        onClick={() => onAction('archive', selectedItems)}
      >
        Archive
      </Button>
      <Button
        tone="critical"
        disabled={!hasSelection}
        onClick={() => onAction('delete', selectedItems)}
      >
        Delete
      </Button>
    </ButtonGroup>
  );
}
```

## Accessibility Guidelines

### Required Patterns
Always implement these accessibility features:

```typescript
function AccessibleButton() {
  const [expanded, setExpanded] = useState(false);
  const contentId = 'content-region';
  const descriptionId = 'button-description';
  
  return (
    <>
      <Button
        // State indication
        ariaExpanded={expanded}
        ariaControls={contentId}
        ariaDescribedBy={descriptionId}
        
        // Clear labeling for icon-only
        accessibilityLabel="Show advanced settings"
        
        // Visual state
        pressed={expanded}
        disclosure
        
        onClick={() => setExpanded(!expanded)}
      >
        Settings
      </Button>
      
      <span id={descriptionId} className="visually-hidden">
        Expands additional configuration options
      </span>
      
      <div 
        id={contentId}
        aria-hidden={!expanded}
      >
        {/* Expandable content */}
      </div>
    </>
  );
}
```

### Focus Management
Proper focus handling for modals and popovers:

```typescript
function FocusManagement() {
  const buttonRef = useRef(null);
  const [modalOpen, setModalOpen] = useState(false);
  
  const closeModal = useCallback(() => {
    setModalOpen(false);
    // Return focus to trigger
    buttonRef.current?.focus();
  }, []);
  
  return (
    <>
      <Button
        ref={buttonRef}
        onClick={() => setModalOpen(true)}
        ariaHasPopup="dialog"
      >
        Open modal
      </Button>
      
      {modalOpen && (
        <Modal onClose={closeModal}>
          {/* Modal content */}
        </Modal>
      )}
    </>
  );
}
```

### Keyboard Navigation
Ensure all buttons are keyboard accessible:

```typescript
function KeyboardAccessible() {
  const handleKeyDown = useCallback((event) => {
    switch(event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        console.log('Activated via keyboard');
        break;
      case 'Escape':
        console.log('Cancelled');
        break;
    }
  }, []);
  
  return (
    <Button
      onClick={() => console.log('Clicked')}
      onKeyDown={handleKeyDown}
    >
      Keyboard accessible button
    </Button>
  );
}
```

## Best Practices

### Do's
- Use only one primary button per page section
- Provide clear, action-oriented labels (verb + noun)
- Include loading states for async operations
- Add accessibility labels for icon-only buttons
- Use proper tone for destructive actions
- Implement proper focus management

### Don'ts
- Don't wrap buttons in tooltips within ButtonGroups
- Avoid multiple primary buttons in the same context
- Don't use buttons for navigation without proper href
- Avoid overly complex action menus
- Don't forget accessibility attributes
- Never disable buttons without clear reason

## Common Patterns in RewardsPro

### Tier Management Actions
```typescript
function TierActions({ tier, onEdit, onDelete }) {
  return (
    <ButtonGroup>
      <Button
        icon={EditIcon}
        onClick={() => onEdit(tier.id)}
      >
        Edit tier
      </Button>
      <Button
        tone="critical"
        onClick={() => onDelete(tier.id)}
      >
        Delete tier
      </Button>
    </ButtonGroup>
  );
}
```

### Customer Actions
```typescript
function CustomerActions({ customer }) {
  return (
    <ButtonGroup>
      <Button
        variant="plain"
        onClick={() => viewDetails(customer.id)}
      >
        View details
      </Button>
      <Button
        onClick={() => adjustCredit(customer.id)}
      >
        Adjust credit
      </Button>
      <Button
        variant="primary"
        onClick={() => changeTier(customer.id)}
      >
        Change tier
      </Button>
    </ButtonGroup>
  );
}
```

### Billing Actions
```typescript
function BillingActions({ plan, onUpgrade, onDowngrade }) {
  return (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingMd">Current Plan: {plan.name}</Text>
        <ButtonGroup>
          <Button
            variant="primary"
            size="large"
            fullWidth
            onClick={onUpgrade}
            disabled={plan.name === 'Enterprise'}
          >
            Upgrade plan
          </Button>
          {plan.name !== 'Free' && (
            <Button
              variant="plain"
              tone="critical"
              onClick={onDowngrade}
            >
              Downgrade
            </Button>
          )}
        </ButtonGroup>
      </BlockStack>
    </Card>
  );
}
```

## Conclusion

This guide provides comprehensive patterns for implementing Polaris buttons in the RewardsPro application. Always prioritize accessibility, maintain visual hierarchy with proper variant usage, and follow Shopify's design principles for consistent user experiences.