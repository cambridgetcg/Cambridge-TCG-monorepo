# Shopify Polaris Lists Components - Best Practices & Implementation Guide

## Table of Contents
1. [Overview](#overview)
2. [Action List](#action-list)
3. [Description List](#description-list)
4. [List](#list)
5. [Listbox](#listbox)
6. [Option List](#option-list)
7. [Resource Item](#resource-item)
8. [Resource List](#resource-list)
9. [RewardsPro Implementation Examples](#rewardspro-implementation-examples)
10. [Common Patterns & Best Practices](#common-patterns--best-practices)

## Overview

List components in Shopify Polaris provide structured ways to display collections of data, options, and actionable items. They're fundamental to creating organized, scannable interfaces that help merchants navigate and manage their stores efficiently.

### Component Selection Guide

| Component | Use When |
|-----------|----------|
| **Action List** | Menu items, dropdown actions, navigation |
| **Description List** | Key-value pairs, metadata, properties |
| **List** | Simple bulleted/numbered content |
| **Listbox** | Searchable options, autocomplete |
| **Option List** | Radio/checkbox selections |
| **Resource Item** | Individual items in collections |
| **Resource List** | Complex data tables with actions |

## Action List

### When to Use
- Dropdown menus and popovers
- Navigation menus
- Contextual actions
- Quick actions in compact spaces

### Implementation Examples

```tsx
import {ActionList, Popover, Button, Icon} from '@shopify/polaris';
import {
  ImportIcon,
  ExportIcon,
  DeleteIcon,
  EditIcon,
  DuplicateIcon,
  ViewIcon,
  ArchiveIcon
} from '@shopify/polaris-icons';
import {useState} from 'react';

// Basic action list in a popover
function ActionMenu() {
  const [popoverActive, setPopoverActive] = useState(false);
  
  const togglePopover = () => setPopoverActive(!popoverActive);
  
  const activator = (
    <Button onClick={togglePopover} disclosure>
      Actions
    </Button>
  );
  
  return (
    <Popover
      active={popoverActive}
      activator={activator}
      onClose={togglePopover}
      autofocusTarget="first-node"
    >
      <ActionList
        actionRole="menuitem"
        items={[
          {content: 'Edit', onAction: () => console.log('Edit')},
          {content: 'Duplicate', onAction: () => console.log('Duplicate')},
          {content: 'Archive', onAction: () => console.log('Archive')}
        ]}
      />
    </Popover>
  );
}

// Action list with icons and sections
function OrganizedActionMenu() {
  const [active, setActive] = useState(false);
  
  return (
    <Popover
      active={active}
      activator={<Button onClick={() => setActive(!active)}>File</Button>}
      onClose={() => setActive(false)}
    >
      <ActionList
        actionRole="menuitem"
        sections={[
          {
            title: 'File actions',
            items: [
              {
                content: 'Import',
                icon: ImportIcon,
                onAction: () => console.log('Import')
              },
              {
                content: 'Export',
                icon: ExportIcon,
                onAction: () => console.log('Export')
              }
            ]
          },
          {
            title: 'Edit actions',
            items: [
              {
                content: 'Edit properties',
                icon: EditIcon,
                onAction: () => console.log('Edit')
              },
              {
                content: 'Duplicate',
                icon: DuplicateIcon,
                onAction: () => console.log('Duplicate')
              }
            ]
          },
          {
            items: [
              {
                content: 'Delete',
                icon: DeleteIcon,
                destructive: true,
                onAction: () => console.log('Delete')
              }
            ]
          }
        ]}
      />
    </Popover>
  );
}
```

### RewardsPro Action List Examples

```tsx
// Tier management actions
function TierActionMenu({ tier, onEdit, onDelete, onDuplicate }) {
  const [active, setActive] = useState(false);
  
  return (
    <Popover
      active={active}
      activator={
        <Button 
          plain 
          icon={MenuHorizontalIcon} 
          onClick={() => setActive(!active)}
        />
      }
      onClose={() => setActive(false)}
    >
      <ActionList
        items={[
          {
            content: 'Edit tier',
            icon: EditIcon,
            onAction: () => {
              onEdit(tier);
              setActive(false);
            }
          },
          {
            content: 'Duplicate tier',
            icon: DuplicateIcon,
            onAction: () => {
              onDuplicate(tier);
              setActive(false);
            }
          },
          {
            content: 'View customers',
            icon: CustomersIcon,
            url: `/app/customers?tier=${tier.id}`
          },
          {
            content: 'Delete tier',
            icon: DeleteIcon,
            destructive: true,
            onAction: () => {
              onDelete(tier);
              setActive(false);
            }
          }
        ]}
      />
    </Popover>
  );
}

// Customer bulk actions
function CustomerBulkActions({ selectedCount, onAction }) {
  return (
    <ActionList
      sections={[
        {
          title: `${selectedCount} customers selected`,
          items: [
            {
              content: 'Update tier',
              icon: RefreshIcon,
              onAction: () => onAction('update-tier')
            },
            {
              content: 'Adjust store credit',
              icon: CashDollarIcon,
              onAction: () => onAction('adjust-credit')
            },
            {
              content: 'Export data',
              icon: ExportIcon,
              onAction: () => onAction('export')
            }
          ]
        },
        {
          items: [
            {
              content: 'Remove from program',
              destructive: true,
              onAction: () => onAction('remove')
            }
          ]
        }
      ]}
    />
  );
}
```

### Best Practices
- **Group related actions**: Use sections to organize actions logically
- **Use icons consistently**: Either all items have icons or none do
- **Highlight destructive actions**: Use the `destructive` prop for delete actions
- **Provide help text**: For complex or ambiguous actions
- **Show active states**: Indicate currently selected items

## Description List

### When to Use
- Display metadata or properties
- Show key-value pairs
- Present product/order details
- Display system information

### Implementation Examples

```tsx
import {DescriptionList, Card, Page, Badge, Link} from '@shopify/polaris';

// Basic description list
function ProductDetails() {
  return (
    <Card>
      <DescriptionList
        items={[
          {
            term: 'SKU',
            description: 'IPOD-342-N'
          },
          {
            term: 'Inventory',
            description: '24 in stock'
          },
          {
            term: 'Type',
            description: 'Electronics'
          },
          {
            term: 'Vendor',
            description: 'Apple Inc.'
          }
        ]}
      />
    </Card>
  );
}
```

### RewardsPro Description List Examples

```tsx
// Tier details display
function TierDetails({ tier }) {
  const items = [
    {
      term: 'Tier name',
      description: (
        <Badge tone={tier.isActive ? 'success' : 'info'}>
          {tier.name}
        </Badge>
      )
    },
    {
      term: 'Minimum spending',
      description: `$${tier.minSpend.toFixed(2)}`
    },
    {
      term: 'Cashback rate',
      description: `${tier.cashbackPercent}%`
    },
    {
      term: 'Evaluation period',
      description: tier.evaluationPeriod === 'ANNUAL' 
        ? '12 months rolling' 
        : 'Lifetime'
    },
    {
      term: 'Active customers',
      description: tier.customerCount.toLocaleString()
    },
    {
      term: 'Total rewards earned',
      description: `$${tier.totalRewards.toFixed(2)}`
    }
  ];
  
  return (
    <Card title="Tier Information">
      <Card.Section>
        <DescriptionList items={items} />
      </Card.Section>
    </Card>
  );
}

// Customer summary
function CustomerSummary({ customer }) {
  const items = [
    {
      term: 'Customer ID',
      description: (
        <Link url={`/app/customers/${customer.id}`}>
          {customer.shopifyCustomerId}
        </Link>
      )
    },
    {
      term: 'Email',
      description: customer.email
    },
    {
      term: 'Current tier',
      description: (
        <Badge tone="info">{customer.currentTier?.name || 'None'}</Badge>
      )
    },
    {
      term: 'Store credit',
      description: `$${customer.storeCredit.toFixed(2)}`
    },
    {
      term: 'Lifetime spending',
      description: `$${customer.lifetimeSpending.toFixed(2)}`
    },
    {
      term: 'Member since',
      description: new Date(customer.createdAt).toLocaleDateString()
    }
  ];
  
  return <DescriptionList items={items} />;
}
```

### Best Practices
- **Keep terms concise**: Use short, clear labels
- **Format values appropriately**: Use badges, links, or formatted text
- **Group related information**: Use multiple lists for different categories
- **Consider spacing**: Use `compact` prop for dense layouts

## List

### When to Use
- Simple bulleted or numbered lists
- Step-by-step instructions
- Feature lists
- Content that needs basic structure

### Implementation Examples

```tsx
import {List, Card, Stack, Text, Badge} from '@shopify/polaris';

// Bulleted list
function FeatureList() {
  return (
    <Card title="Premium Features">
      <List type="bullet">
        <List.Item>Advanced analytics dashboard</List.Item>
        <List.Item>Priority customer support</List.Item>
        <List.Item>Custom domain</List.Item>
        <List.Item>Unlimited products</List.Item>
        <List.Item>Multi-channel selling</List.Item>
      </List>
    </Card>
  );
}
```

### RewardsPro List Examples

```tsx
// Tier benefits list
function TierBenefits({ tier }) {
  return (
    <Card title={`${tier.name} Benefits`}>
      <Card.Section>
        <List type="bullet">
          <List.Item>{tier.cashbackPercent}% cashback on all purchases</List.Item>
          <List.Item>Early access to sales and promotions</List.Item>
          <List.Item>Birthday bonus points</List.Item>
          {tier.name === 'Platinum' && (
            <>
              <List.Item>Free shipping on all orders</List.Item>
              <List.Item>Dedicated customer support</List.Item>
              <List.Item>Exclusive member events</List.Item>
            </>
          )}
        </List>
      </Card.Section>
    </Card>
  );
}

// Setup checklist
function SetupChecklist({ completedSteps }) {
  const steps = [
    { id: 'tiers', label: 'Create at least one tier', required: true },
    { id: 'cashback', label: 'Configure cashback rules', required: true },
    { id: 'customers', label: 'Import existing customers', required: false },
    { id: 'test', label: 'Test checkout flow', required: true },
    { id: 'launch', label: 'Enable program for customers', required: true }
  ];
  
  return (
    <Card title="Setup Checklist">
      <Card.Section>
        <List type="number">
          {steps.map(step => (
            <List.Item key={step.id}>
              <Stack alignment="center">
                <Stack.Item fill>
                  {step.label}
                  {step.required && (
                    <Badge size="small" tone="attention">Required</Badge>
                  )}
                </Stack.Item>
                {completedSteps.includes(step.id) && (
                  <Badge tone="success">✓</Badge>
                )}
              </Stack>
            </List.Item>
          ))}
        </List>
      </Card.Section>
    </Card>
  );
}
```

### Best Practices
- **Use appropriate type**: Bullets for unordered, numbers for sequential
- **Keep items concise**: Each item should be scannable
- **Limit nesting**: Maximum 2-3 levels deep
- **Use consistent formatting**: All items should follow same structure

## Listbox

### When to Use
- Searchable select fields
- Autocomplete inputs
- Command palettes
- Multi-select with search

### Implementation Examples

```tsx
import {Listbox, Combobox, Icon, Text, Stack} from '@shopify/polaris';
import {SearchIcon} from '@shopify/polaris-icons';
import {useState, useMemo, useCallback} from 'react';

// Basic listbox
function BasicListbox() {
  const [selected, setSelected] = useState([]);
  
  return (
    <Listbox
      accessibilityLabel="Basic listbox"
      onSelect={(value) => setSelected(value)}
      selected={selected}
    >
      <Listbox.Option value="option1">Option 1</Listbox.Option>
      <Listbox.Option value="option2">Option 2</Listbox.Option>
      <Listbox.Option value="option3">Option 3</Listbox.Option>
    </Listbox>
  );
}
```

### RewardsPro Listbox Examples

```tsx
// Customer tier selector
function TierSelector({ tiers, onSelect }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]);
  
  const filteredTiers = useMemo(() => {
    return tiers.filter(tier =>
      tier.name.toLowerCase().includes(query.toLowerCase())
    );
  }, [query, tiers]);
  
  return (
    <Combobox
      activator={
        <Combobox.TextField
          label="Assign tier"
          value={query}
          placeholder="Search tiers..."
          onChange={setQuery}
          autoComplete="off"
        />
      }
    >
      {filteredTiers.length > 0 ? (
        <Listbox
          onSelect={(value) => {
            setSelected(value);
            onSelect(value[0]);
          }}
          selected={selected}
        >
          {filteredTiers.map(tier => (
            <Listbox.Option key={tier.id} value={tier.id}>
              <Stack>
                <Stack.Item fill>
                  <Text variant="bodyMd" fontWeight="bold">
                    {tier.name}
                  </Text>
                  <Text variant="bodySm" tone="subdued">
                    {tier.cashbackPercent}% cashback • 
                    ${tier.minSpend} minimum
                  </Text>
                </Stack.Item>
                <Badge>{tier.customerCount} customers</Badge>
              </Stack>
            </Listbox.Option>
          ))}
        </Listbox>
      ) : (
        <Listbox.Action>
          <Stack spacing="tight">
            <Text tone="subdued">No tiers found</Text>
          </Stack>
        </Listbox.Action>
      )}
    </Combobox>
  );
}

// Customer search with autocomplete
function CustomerSearch({ onSelectCustomer }) {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  
  useEffect(() => {
    if (query.length < 2) {
      setCustomers([]);
      return;
    }
    
    setLoading(true);
    searchCustomers(query)
      .then(setCustomers)
      .finally(() => setLoading(false));
  }, [query]);
  
  return (
    <Combobox
      activator={
        <Combobox.TextField
          label="Search customers"
          value={query}
          placeholder="Enter name or email..."
          onChange={setQuery}
          prefix={<Icon source={SearchIcon} />}
        />
      }
    >
      <Listbox
        onSelect={(value) => {
          const customer = customers.find(c => c.id === value[0]);
          if (customer) onSelectCustomer(customer);
          setSelected(value);
        }}
        selected={selected}
      >
        {loading && (
          <Listbox.Loading accessibilityLabel="Loading customers" />
        )}
        {!loading && customers.map(customer => (
          <Listbox.Option key={customer.id} value={customer.id}>
            <Stack>
              <Avatar customer size="small" name={customer.name} />
              <Stack.Item fill>
                <Text variant="bodyMd">{customer.name}</Text>
                <Text variant="bodySm" tone="subdued">
                  {customer.email}
                </Text>
              </Stack.Item>
              <Stack.Item>
                <Badge tone="info">{customer.tier}</Badge>
              </Stack.Item>
            </Stack>
          </Listbox.Option>
        ))}
        {!loading && query && customers.length === 0 && (
          <Listbox.Action>
            <Text tone="subdued">No customers found</Text>
          </Listbox.Action>
        )}
      </Listbox>
    </Combobox>
  );
}
```

### Best Practices
- **Provide loading states**: Show skeleton or spinner while loading
- **Handle empty states**: Show helpful message when no results
- **Enable keyboard navigation**: Ensure all options are accessible
- **Use search for long lists**: Add search for lists > 10 items
- **Show selection state**: Clear indication of selected items

## Option List

### When to Use
- Radio button groups
- Checkbox groups
- Filter selections
- Settings with multiple options

### Implementation Examples

```tsx
import {OptionList, Card, TextField} from '@shopify/polaris';
import {useState} from 'react';

// Single select (radio buttons)
function SingleSelectOptions() {
  const [selected, setSelected] = useState(['express']);
  
  return (
    <Card title="Shipping method">
      <OptionList
        title="Choose shipping"
        onChange={setSelected}
        options={[
          {value: 'standard', label: 'Standard (5-7 days)'},
          {value: 'express', label: 'Express (2-3 days)'},
          {value: 'overnight', label: 'Overnight'}
        ]}
        selected={selected}
      />
    </Card>
  );
}
```

### RewardsPro Option List Examples

```tsx
// Cashback rule configuration
function CashbackRules() {
  const [excludedCategories, setExcludedCategories] = useState([]);
  const [bonusEvents, setBonusEvents] = useState(['birthday']);
  
  return (
    <Card title="Cashback Configuration">
      <Card.Section>
        <OptionList
          title="Excluded product categories"
          onChange={setExcludedCategories}
          options={[
            {value: 'gift-cards', label: 'Gift cards'},
            {value: 'shipping', label: 'Shipping fees'},
            {value: 'taxes', label: 'Taxes'},
            {value: 'sale-items', label: 'Sale items'},
            {value: 'subscriptions', label: 'Subscription products'}
          ]}
          selected={excludedCategories}
          allowMultiple
        />
      </Card.Section>
      
      <Card.Section>
        <OptionList
          title="Bonus cashback events"
          onChange={setBonusEvents}
          options={[
            {
              value: 'birthday',
              label: 'Birthday month',
              helpText: '2x cashback during customer birthday month'
            },
            {
              value: 'anniversary',
              label: 'Membership anniversary',
              helpText: 'Bonus points on join date anniversary'
            },
            {
              value: 'holidays',
              label: 'Holiday seasons',
              helpText: 'Special rates during major holidays'
            }
          ]}
          selected={bonusEvents}
          allowMultiple
        />
      </Card.Section>
    </Card>
  );
}

// Report filtering options
function ReportFilters({ onApply }) {
  const [dateRange, setDateRange] = useState(['last-30']);
  const [tierFilter, setTierFilter] = useState([]);
  const [metricType, setMetricType] = useState(['revenue']);
  
  return (
    <Card title="Report Filters">
      <Card.Section>
        <OptionList
          title="Date range"
          onChange={setDateRange}
          options={[
            {value: 'today', label: 'Today'},
            {value: 'last-7', label: 'Last 7 days'},
            {value: 'last-30', label: 'Last 30 days'},
            {value: 'last-90', label: 'Last 90 days'},
            {value: 'custom', label: 'Custom range'}
          ]}
          selected={dateRange}
        />
      </Card.Section>
      
      <Card.Section>
        <OptionList
          title="Customer tiers"
          onChange={setTierFilter}
          options={[
            {value: 'bronze', label: 'Bronze'},
            {value: 'silver', label: 'Silver'},
            {value: 'gold', label: 'Gold'},
            {value: 'platinum', label: 'Platinum'}
          ]}
          selected={tierFilter}
          allowMultiple
        />
      </Card.Section>
      
      <Card.Section>
        <Button primary onClick={() => onApply({ dateRange, tierFilter, metricType })}>
          Apply Filters
        </Button>
      </Card.Section>
    </Card>
  );
}
```

### Best Practices
- **Use sections for organization**: Group related options
- **Provide help text**: Clarify complex options
- **Set sensible defaults**: Pre-select common choices
- **Limit options**: 7±2 options per section
- **Use appropriate selection type**: Single vs multiple

## Resource Item

### When to Use
- Individual items in lists
- Product/order cards
- Customer entries
- Any collection item with actions

### Implementation Examples

```tsx
import {ResourceItem, Avatar, Text, Stack, Badge, Thumbnail} from '@shopify/polaris';
import {useState} from 'react';

// Basic resource item
function BasicResourceItem({product}) {
  return (
    <ResourceItem
      id={product.id}
      url={`/products/${product.id}`}
      accessibilityLabel={`View details for ${product.title}`}
    >
      <Stack alignment="center">
        <Stack.Item fill>
          <Text variant="bodyMd" fontWeight="bold">
            {product.title}
          </Text>
          <Text variant="bodySm" tone="subdued">
            ${product.price}
          </Text>
        </Stack.Item>
      </Stack>
    </ResourceItem>
  );
}
```

### RewardsPro Resource Item Examples

```tsx
// Customer resource item with tier info
function CustomerResourceItem({ customer, onEdit, onViewHistory }) {
  const shortcutActions = [
    {
      content: 'View history',
      onAction: () => onViewHistory(customer.id)
    },
    {
      content: 'Adjust credit',
      onAction: () => onEdit(customer.id)
    }
  ];
  
  return (
    <ResourceItem
      id={customer.id}
      url={`/app/customers/${customer.id}`}
      media={
        <Avatar
          customer
          name={customer.name}
          source={customer.avatar}
        />
      }
      shortcutActions={shortcutActions}
      persistActions
      verticalAlignment="center"
    >
      <Stack>
        <Stack.Item fill>
          <Text variant="bodyMd" fontWeight="bold">
            {customer.name}
          </Text>
          <Text variant="bodySm" tone="subdued">
            {customer.email}
          </Text>
        </Stack.Item>
        <Stack.Item>
          <Badge tone={customer.tier === 'Platinum' ? 'success' : 'info'}>
            {customer.tier}
          </Badge>
        </Stack.Item>
        <Stack.Item>
          <Stack vertical spacing="extraTight">
            <Text variant="bodySm" tone="subdued">Store Credit</Text>
            <Text variant="bodyMd" fontWeight="semibold">
              ${customer.storeCredit.toFixed(2)}
            </Text>
          </Stack>
        </Stack.Item>
        <Stack.Item>
          <Stack vertical spacing="extraTight">
            <Text variant="bodySm" tone="subdued">Lifetime</Text>
            <Text variant="bodyMd">
              ${customer.lifetimeSpending.toFixed(2)}
            </Text>
          </Stack>
        </Stack.Item>
      </Stack>
    </ResourceItem>
  );
}

// Transaction resource item
function TransactionResourceItem({ transaction }) {
  const getToneForType = (type) => {
    switch(type) {
      case 'CASHBACK_EARNED': return 'success';
      case 'ORDER_PAYMENT': return 'info';
      case 'REFUND_CREDIT': return 'attention';
      case 'MANUAL_ADJUSTMENT': return 'warning';
      default: return undefined;
    }
  };
  
  return (
    <ResourceItem
      id={transaction.id}
      url={`/app/transactions/${transaction.id}`}
    >
      <Stack alignment="center">
        <Stack.Item fill>
          <Text variant="bodyMd" fontWeight="bold">
            {transaction.description}
          </Text>
          <Text variant="bodySm" tone="subdued">
            {new Date(transaction.createdAt).toLocaleDateString()} • 
            Order #{transaction.orderId}
          </Text>
        </Stack.Item>
        <Badge tone={getToneForType(transaction.type)}>
          {transaction.type.replace('_', ' ')}
        </Badge>
        <Text 
          variant="bodyMd" 
          fontWeight="semibold"
          tone={transaction.amount > 0 ? 'success' : undefined}
        >
          {transaction.amount > 0 ? '+' : ''}
          ${Math.abs(transaction.amount).toFixed(2)}
        </Text>
      </Stack>
    </ResourceItem>
  );
}
```

### Best Practices
- **Include meaningful content**: Show key information upfront
- **Use consistent layouts**: Maintain visual hierarchy
- **Provide shortcut actions**: Common actions without navigation
- **Consider mobile**: Test touch targets and readability
- **Use appropriate media**: Thumbnails for products, avatars for people

## Resource List

### When to Use
- Product/order/customer lists
- Any data table with actions
- Filterable/sortable collections
- Bulk operations on items

### Implementation Examples

```tsx
import {
  ResourceList,
  ResourceItem,
  Card,
  Filters,
  Button,
  Badge,
  Text,
  Stack,
  Pagination
} from '@shopify/polaris';
import {useState, useCallback} from 'react';

// Basic resource list
function BasicResourceList() {
  const [selectedItems, setSelectedItems] = useState([]);
  
  const items = [
    {id: '1', name: 'Product 1', price: '$10.00'},
    {id: '2', name: 'Product 2', price: '$20.00'},
    {id: '3', name: 'Product 3', price: '$30.00'}
  ];
  
  return (
    <Card>
      <ResourceList
        resourceName={{singular: 'product', plural: 'products'}}
        items={items}
        renderItem={(item) => {
          const {id, name, price} = item;
          
          return (
            <ResourceItem
              id={id}
              url={`/products/${id}`}
              accessibilityLabel={`View details for ${name}`}
            >
              <Stack>
                <Stack.Item fill>
                  <Text variant="bodyMd" fontWeight="bold">
                    {name}
                  </Text>
                </Stack.Item>
                <Stack.Item>
                  <Text>{price}</Text>
                </Stack.Item>
              </Stack>
            </ResourceItem>
          );
        }}
        selectedItems={selectedItems}
        onSelectionChange={setSelectedItems}
        selectable
      />
    </Card>
  );
}
```

### RewardsPro Resource List Examples

```tsx
// Complete customer list with filters and actions
function CustomerResourceList() {
  const [selectedItems, setSelectedItems] = useState([]);
  const [sortValue, setSortValue] = useState('CREATED_DESC');
  const [queryValue, setQueryValue] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Bulk actions for selected customers
  const promotedBulkActions = [
    {
      content: 'Update tier',
      onAction: () => handleBulkTierUpdate(selectedItems)
    },
    {
      content: 'Adjust credit',
      onAction: () => handleBulkCreditAdjust(selectedItems)
    }
  ];
  
  const bulkActions = [
    {
      content: 'Export',
      onAction: () => exportCustomers(selectedItems)
    },
    {
      content: 'Send email',
      onAction: () => sendBulkEmail(selectedItems)
    },
    {
      content: 'Add tags',
      onAction: () => addTags(selectedItems)
    }
  ];
  
  // Filters
  const filters = [
    {
      key: 'tier',
      label: 'Tier',
      filter: (
        <Select
          label="Tier"
          options={[
            {label: 'All', value: ''},
            {label: 'Bronze', value: 'bronze'},
            {label: 'Silver', value: 'silver'},
            {label: 'Gold', value: 'gold'},
            {label: 'Platinum', value: 'platinum'}
          ]}
          value={tierFilter}
          onChange={setTierFilter}
          labelHidden
        />
      ),
      shortcut: true
    }
  ];
  
  const appliedFilters = [];
  if (tierFilter) {
    appliedFilters.push({
      key: 'tier',
      label: `Tier: ${tierFilter}`,
      onRemove: () => setTierFilter('')
    });
  }
  
  const filterControl = (
    <Filters
      queryValue={queryValue}
      filters={filters}
      appliedFilters={appliedFilters}
      onQueryChange={setQueryValue}
      onQueryClear={() => setQueryValue('')}
      onClearAll={() => {
        setTierFilter('');
        setQueryValue('');
      }}
    />
  );
  
  // Empty state
  const emptyStateMarkup = (
    <EmptyState
      heading="No customers yet"
      action={{
        content: 'Import customers',
        url: '/app/customers/import'
      }}
      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
    >
      <p>Import your existing customers or wait for new ones to join your rewards program.</p>
    </EmptyState>
  );
  
  return (
    <Card>
      <ResourceList
        resourceName={{singular: 'customer', plural: 'customers'}}
        items={customers}
        renderItem={(customer) => (
          <CustomerResourceItem 
            customer={customer}
            onEdit={handleEdit}
            onViewHistory={handleViewHistory}
          />
        )}
        selectedItems={selectedItems}
        onSelectionChange={setSelectedItems}
        promotedBulkActions={promotedBulkActions}
        bulkActions={bulkActions}
        sortValue={sortValue}
        sortOptions={[
          {label: 'Newest', value: 'CREATED_DESC'},
          {label: 'Oldest', value: 'CREATED_ASC'},
          {label: 'Highest spending', value: 'SPENDING_DESC'},
          {label: 'Most credit', value: 'CREDIT_DESC'},
          {label: 'Name A-Z', value: 'NAME_ASC'},
          {label: 'Name Z-A', value: 'NAME_DESC'}
        ]}
        onSortChange={setSortValue}
        filterControl={filterControl}
        loading={loading}
        emptyState={emptyStateMarkup}
        selectable
        totalItemsCount={customers.length}
      />
    </Card>
  );
}

// Tier management resource list
function TierResourceList({ tiers, onEdit, onDelete, onDuplicate }) {
  const [selectedItems, setSelectedItems] = useState([]);
  
  const promotedBulkActions = [
    {
      content: 'Edit selected',
      onAction: () => handleBulkEdit(selectedItems)
    }
  ];
  
  return (
    <Card>
      <ResourceList
        resourceName={{singular: 'tier', plural: 'tiers'}}
        items={tiers}
        renderItem={(tier) => {
          const {id, name, minSpend, cashbackPercent, customerCount} = tier;
          
          return (
            <ResourceItem
              id={id}
              url={`/app/tiers/${id}`}
              shortcutActions={[
                {
                  content: 'Edit',
                  onAction: () => onEdit(tier)
                },
                {
                  content: 'Duplicate',
                  onAction: () => onDuplicate(tier)
                },
                {
                  content: 'Delete',
                  destructive: true,
                  onAction: () => onDelete(tier)
                }
              ]}
              persistActions
            >
              <Stack>
                <Stack.Item fill>
                  <Text variant="bodyMd" fontWeight="bold">
                    {name}
                  </Text>
                  <Stack spacing="tight">
                    <Text variant="bodySm" tone="subdued">
                      ${minSpend}+ spending
                    </Text>
                    <Text variant="bodySm" tone="subdued">
                      {cashbackPercent}% cashback
                    </Text>
                  </Stack>
                </Stack.Item>
                <Stack.Item>
                  <Badge>{customerCount} customers</Badge>
                </Stack.Item>
              </Stack>
            </ResourceItem>
          );
        }}
        selectedItems={selectedItems}
        onSelectionChange={setSelectedItems}
        promotedBulkActions={promotedBulkActions}
        selectable
      />
    </Card>
  );
}
```

### Best Practices
- **Always include resourceName**: Helps with accessibility
- **Implement loading states**: Show skeleton or spinner
- **Add empty states**: Guide users when no items
- **Enable bulk actions**: For efficiency with multiple items
- **Use filters wisely**: Only add filters users will actually use
- **Paginate large lists**: Better performance and UX
- **Persist shortcut actions**: For frequently used actions

## RewardsPro Implementation Examples

### Complete Customer Management List

```tsx
// app/components/CustomerManagementList.tsx
import { 
  ResourceList, 
  ResourceItem, 
  Card, 
  Filters,
  TextField,
  Select,
  RangeSlider,
  Button,
  Stack,
  Text,
  Badge,
  Avatar,
  Pagination
} from '@shopify/polaris';
import { useState, useCallback, useMemo } from 'react';

function CustomerManagementList() {
  const [customers, setCustomers] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Filters
  const [queryValue, setQueryValue] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [creditRange, setCreditRange] = useState([0, 1000]);
  const [sortValue, setSortValue] = useState('CREATED_DESC');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  
  // Filter customers based on criteria
  const filteredCustomers = useMemo(() => {
    let filtered = [...customers];
    
    if (queryValue) {
      filtered = filtered.filter(c => 
        c.name.toLowerCase().includes(queryValue.toLowerCase()) ||
        c.email.toLowerCase().includes(queryValue.toLowerCase())
      );
    }
    
    if (tierFilter) {
      filtered = filtered.filter(c => c.tier === tierFilter);
    }
    
    filtered = filtered.filter(c => 
      c.storeCredit >= creditRange[0] && 
      c.storeCredit <= creditRange[1]
    );
    
    // Sort
    filtered.sort((a, b) => {
      switch(sortValue) {
        case 'NAME_ASC': return a.name.localeCompare(b.name);
        case 'NAME_DESC': return b.name.localeCompare(a.name);
        case 'CREDIT_DESC': return b.storeCredit - a.storeCredit;
        case 'SPENDING_DESC': return b.lifetimeSpending - a.lifetimeSpending;
        default: return b.createdAt - a.createdAt;
      }
    });
    
    return filtered;
  }, [customers, queryValue, tierFilter, creditRange, sortValue]);
  
  // Paginated items
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredCustomers.slice(start, start + itemsPerPage);
  }, [filteredCustomers, currentPage]);
  
  // Bulk actions
  const handleBulkTierUpdate = useCallback(async () => {
    // Implementation
  }, [selectedItems]);
  
  const promotedBulkActions = [
    {
      content: `Update tier (${selectedItems.length})`,
      onAction: handleBulkTierUpdate,
      disabled: selectedItems.length === 0
    }
  ];
  
  // Filters configuration
  const filters = [
    {
      key: 'tier',
      label: 'Customer tier',
      filter: (
        <Select
          label="Customer tier"
          labelHidden
          options={[
            {label: 'All tiers', value: ''},
            {label: 'Bronze', value: 'bronze'},
            {label: 'Silver', value: 'silver'},
            {label: 'Gold', value: 'gold'},
            {label: 'Platinum', value: 'platinum'}
          ]}
          value={tierFilter}
          onChange={setTierFilter}
        />
      ),
      shortcut: true
    },
    {
      key: 'credit',
      label: 'Store credit',
      filter: (
        <RangeSlider
          label="Store credit range"
          labelHidden
          value={creditRange}
          min={0}
          max={5000}
          step={50}
          prefix="$"
          onChange={setCreditRange}
        />
      )
    }
  ];
  
  const appliedFilters = [];
  if (tierFilter) {
    appliedFilters.push({
      key: 'tier',
      label: `Tier: ${tierFilter}`,
      onRemove: () => setTierFilter('')
    });
  }
  
  const filterControl = (
    <Filters
      queryValue={queryValue}
      filters={filters}
      appliedFilters={appliedFilters}
      onQueryChange={setQueryValue}
      onQueryClear={() => setQueryValue('')}
      onClearAll={() => {
        setTierFilter('');
        setCreditRange([0, 1000]);
        setQueryValue('');
      }}
    />
  );
  
  return (
    <>
      <Card>
        <ResourceList
          resourceName={{singular: 'customer', plural: 'customers'}}
          items={paginatedCustomers}
          renderItem={(customer) => (
            <ResourceItem
              id={customer.id}
              url={`/app/customers/${customer.id}`}
              media={
                <Avatar customer name={customer.name} />
              }
              shortcutActions={[
                {
                  content: 'View details',
                  url: `/app/customers/${customer.id}`
                },
                {
                  content: 'Adjust credit',
                  onAction: () => openCreditModal(customer)
                }
              ]}
              persistActions
            >
              <Stack>
                <Stack.Item fill>
                  <Text variant="bodyMd" fontWeight="bold">
                    {customer.name}
                  </Text>
                  <Text variant="bodySm" tone="subdued">
                    {customer.email}
                  </Text>
                </Stack.Item>
                <Badge tone={getTierTone(customer.tier)}>
                  {customer.tier}
                </Badge>
                <Stack.Item>
                  <Text variant="bodySm" tone="subdued">Credit</Text>
                  <Text variant="bodyMd">${customer.storeCredit}</Text>
                </Stack.Item>
                <Stack.Item>
                  <Text variant="bodySm" tone="subdued">Lifetime</Text>
                  <Text variant="bodyMd">${customer.lifetimeSpending}</Text>
                </Stack.Item>
              </Stack>
            </ResourceItem>
          )}
          selectedItems={selectedItems}
          onSelectionChange={setSelectedItems}
          promotedBulkActions={promotedBulkActions}
          sortValue={sortValue}
          sortOptions={[
            {label: 'Newest first', value: 'CREATED_DESC'},
            {label: 'Name (A-Z)', value: 'NAME_ASC'},
            {label: 'Name (Z-A)', value: 'NAME_DESC'},
            {label: 'Highest credit', value: 'CREDIT_DESC'},
            {label: 'Highest spending', value: 'SPENDING_DESC'}
          ]}
          onSortChange={setSortValue}
          filterControl={filterControl}
          loading={loading}
          totalItemsCount={filteredCustomers.length}
          selectable
        />
      </Card>
      
      {filteredCustomers.length > itemsPerPage && (
        <Stack distribution="center">
          <Pagination
            hasPrevious={currentPage > 1}
            onPrevious={() => setCurrentPage(p => p - 1)}
            hasNext={currentPage < Math.ceil(filteredCustomers.length / itemsPerPage)}
            onNext={() => setCurrentPage(p => p + 1)}
          />
        </Stack>
      )}
    </>
  );
}
```

## Common Patterns & Best Practices

### 1. Selection Patterns

```tsx
// Single selection pattern
function useSingleSelection(initialValue = null) {
  const [selected, setSelected] = useState(initialValue);
  
  const handleSelect = useCallback((value) => {
    setSelected(value === selected ? null : value);
  }, [selected]);
  
  return [selected, handleSelect];
}

// Multi-selection pattern
function useMultiSelection(initialValues = []) {
  const [selected, setSelected] = useState(initialValues);
  
  const handleSelect = useCallback((values) => {
    setSelected(values);
  }, []);
  
  const toggleSelection = useCallback((value) => {
    setSelected(prev =>
      prev.includes(value)
        ? prev.filter(v => v !== value)
        : [...prev, value]
    );
  }, []);
  
  return {selected, handleSelect, toggleSelection};
}
```

### 2. Search & Filter Pattern

```tsx
function useSearchFilter(items, searchableFields) {
  const [query, setQuery] = useState('');
  
  const filteredItems = useMemo(() => {
    if (!query) return items;
    
    const lowerQuery = query.toLowerCase();
    return items.filter(item =>
      searchableFields.some(field =>
        String(item[field]).toLowerCase().includes(lowerQuery)
      )
    );
  }, [items, query, searchableFields]);
  
  return {
    query,
    setQuery,
    filteredItems,
    clearQuery: () => setQuery('')
  };
}
```

### Performance Optimization

1. **Virtualization for large lists**: Use react-window for lists > 100 items
2. **Debounce search**: Prevent excessive filtering
3. **Memoize expensive operations**: Use useMemo for filters/sorts
4. **Lazy load images**: Use IntersectionObserver
5. **Paginate server-side**: For datasets > 1000 items

### Accessibility Guidelines

1. **Keyboard navigation**: Ensure all items are keyboard accessible
2. **Screen reader support**: Use proper ARIA labels
3. **Focus management**: Maintain focus after actions
4. **Announce changes**: Use live regions for dynamic updates
5. **Color contrast**: Ensure sufficient contrast ratios

### Mobile Considerations

1. **Touch targets**: Minimum 44x44px
2. **Swipe actions**: Consider swipe-to-delete
3. **Responsive layouts**: Stack elements on small screens
4. **Reduce density**: More spacing on mobile
5. **Progressive disclosure**: Hide secondary actions

## Summary

Effective list components are crucial for merchant productivity in RewardsPro. Key takeaways:

1. **Choose the right component** based on data complexity and user needs
2. **Implement proper states**: Loading, empty, error
3. **Enable efficient workflows**: Bulk actions, keyboard shortcuts
4. **Optimize performance**: Pagination, virtualization, memoization
5. **Ensure accessibility**: Keyboard navigation, screen reader support
6. **Test on mobile**: Touch-friendly interfaces

For live examples, visit:
```
https://polaris.shopify.com/components/lists
```