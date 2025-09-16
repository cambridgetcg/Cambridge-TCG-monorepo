/**
 * Polaris Semantic Examples for RewardsPro
 * Demonstrates best practices for meaning and semantics in Shopify Polaris UI
 * Following visual semantics, textual semantics, and internationalization patterns
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  Icon,
  Badge,
  Banner,
  BlockStack,
  InlineStack,
  TextField,
  Select,
  FormLayout,
  DataTable,
  EmptyState,
  Tooltip,
  Modal,
  TextContainer,
  Link,
  Box,
  Divider,
  SkeletonBodyText,
  SkeletonDisplayText,
} from '@shopify/polaris';
import {
  PlusIcon,
  EditIcon,
  DeleteIcon,
  DuplicateIcon,
  ExportIcon,
  ImportIcon,
  RefreshIcon,
  SettingsIcon,
  QuestionCircleIcon,
  SearchIcon,
  FilterIcon,
  SortIcon,
  CalendarIcon,
  ClockIcon,
  CashDollarIcon,
  PersonIcon,
  // TrophyIcon doesn't exist, using StarFilledIcon instead
  StarFilledIcon as TrophyIcon,
  StarIcon,
  StarFilledIcon,
  PriceListIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  InfoIcon,
  XIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ViewIcon,
  PrintIcon,
  EmailIcon,
  // TagIcon doesn't exist, using PriceListIcon instead
  PriceListIcon as TagIcon,
  ArchiveIcon,
  PackageIcon,
  CartIcon,
} from '@shopify/polaris-icons';

// ============================================
// 1. CONSISTENT ICON MAPPING
// ============================================

// Semantic icon mapping for consistent usage across the app
const SEMANTIC_ICONS = {
  // Core Actions
  add: PlusIcon,
  edit: EditIcon,
  delete: DeleteIcon,
  duplicate: DuplicateIcon,
  archive: ArchiveIcon,
  view: ViewIcon,
  
  // Data Operations
  export: ExportIcon,
  import: ImportIcon,
  refresh: RefreshIcon,
  search: SearchIcon,
  filter: FilterIcon,
  sort: SortIcon,
  
  // Communication
  email: EmailIcon,
  print: PrintIcon,
  share: ExportIcon,
  
  // Commerce Concepts
  orders: CartIcon,
  products: PackageIcon,
  customers: PersonIcon,
  rewards: TrophyIcon,
  payments: CashDollarIcon,
  
  // Status Indicators
  success: CheckCircleIcon,
  error: AlertCircleIcon,
  warning: AlertTriangleIcon,
  info: InfoIcon,
  
  // Navigation
  settings: SettingsIcon,
  help: QuestionCircleIcon,
  close: XIcon,
  expand: ChevronDownIcon,
  collapse: ChevronUpIcon,
  
  // Time
  calendar: CalendarIcon,
  clock: ClockIcon,
  
  // Other
  tag: TagIcon,
  star: StarIcon,
} as const;

// ============================================
// 2. GOOD VS BAD SEMANTIC EXAMPLES
// ============================================

export const SemanticComparisonExample: React.FC = () => {
  return (
    <Page title="Semantic Design Examples">
      <Layout>
        {/* Visual Semantics Examples */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Visual Semantics: Icons and Affordances
              </Text>
              
              {/* Good Example */}
              <Box padding="400" background="bg-surface-success" borderRadius="200">
                <BlockStack gap="300">
                  <Badge tone="success">Good Example</Badge>
                  <Text as="h3" variant="headingSm">
                    Clear icons with labels for non-obvious actions
                  </Text>
                  <InlineStack gap="200">
                    <Button icon={SEMANTIC_ICONS.add}>
                      Add product
                    </Button>
                    <Button icon={SEMANTIC_ICONS.duplicate}>
                      Duplicate
                    </Button>
                    <Tooltip content="Archive this item">
                      <Button 
                        icon={SEMANTIC_ICONS.archive}
                        accessibilityLabel="Archive product"
                      />
                    </Tooltip>
                  </InlineStack>
                </BlockStack>
              </Box>
              
              {/* Bad Example */}
              <Box padding="400" background="bg-surface-critical" borderRadius="200">
                <BlockStack gap="300">
                  <Badge tone="critical">Bad Example</Badge>
                  <Text as="h3" variant="headingSm">
                    Ambiguous icons without context
                  </Text>
                  <InlineStack gap="200">
                    <Button icon={StarIcon} />
                    <Button icon={ChevronDownIcon} />
                    <Button>
                      <span style={{fontSize: '20px'}}>📦</span>
                    </Button>
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Issues: No labels, unclear meanings, non-Polaris icons
                  </Text>
                </BlockStack>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Textual Semantics Examples */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Textual Semantics: Microcopy and Voice
              </Text>
              
              {/* Good Microcopy */}
              <Box padding="400" background="bg-surface-success" borderRadius="200">
                <BlockStack gap="300">
                  <Badge tone="success">Good Microcopy</Badge>
                  <FormLayout>
                    <TextField
                      label="Product name"
                      placeholder="Summer collection t-shirt"
                      helpText="Customers will see this name"
                      requiredIndicator
                      autoComplete="off"
                    />
                    <Select
                      label="Category"
                      options={[
                        {label: 'Select category', value: ''},
                        {label: 'Clothing', value: 'clothing'},
                        {label: 'Accessories', value: 'accessories'},
                      ]}
                    />
                  </FormLayout>
                  <InlineStack gap="200">
                    <Button variant="primary">Save product</Button>
                    <Button>Cancel</Button>
                  </InlineStack>
                </BlockStack>
              </Box>
              
              {/* Bad Microcopy */}
              <Box padding="400" background="bg-surface-critical" borderRadius="200">
                <BlockStack gap="300">
                  <Badge tone="critical">Bad Microcopy</Badge>
                  <FormLayout>
                    <TextField
                      label="Enter The Product Name Here"
                      placeholder="Type something..."
                      helpText="This is where you need to enter the name of the product that you want to add to your store."
                      requiredIndicator
                      autoComplete="off"
                    />
                    <Select
                      label="Pick A Category From The List"
                      options={[
                        {label: 'Click here to choose...', value: ''},
                        {label: 'Clothing Items', value: 'clothing'},
                        {label: 'Accessory Products', value: 'accessories'},
                      ]}
                    />
                  </FormLayout>
                  <InlineStack gap="200">
                    <Button variant="primary">Submit This Form Now</Button>
                    <Button>Go Back</Button>
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Issues: Title case, verbose, inconsistent terminology
                  </Text>
                </BlockStack>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

// ============================================
// 3. ERROR MESSAGE PATTERNS
// ============================================

export const ErrorMessagePatterns: React.FC = () => {
  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Error Message Patterns
        </Text>
        
        {/* Good Error Messages */}
        <Box padding="400" background="bg-surface-success" borderRadius="200">
          <BlockStack gap="300">
            <Badge tone="success">Good: Helpful and non-blaming</Badge>
            <Banner
              title="Store name is required"
              tone="critical"
              icon={AlertCircleIcon}
            >
              <p>Enter a name for your store to continue.</p>
            </Banner>
            <TextField
              label="Email"
              error="Email address must include an @ symbol"
              value="invalid-email"
              autoComplete="email"
            />
            <TextField
              label="Password"
              error="Password must be at least 8 characters"
              type="password"
              autoComplete="new-password"
            />
          </BlockStack>
        </Box>
        
        {/* Bad Error Messages */}
        <Box padding="400" background="bg-surface-critical" borderRadius="200">
          <BlockStack gap="300">
            <Badge tone="critical">Bad: Blaming and vague</Badge>
            <Banner
              title="You made an error!"
              tone="critical"
            >
              <p>You didn't fill out the form correctly. Try again.</p>
            </Banner>
            <TextField
              label="Email"
              error="Wrong!"
              value="invalid-email"
              autoComplete="email"
            />
            <TextField
              label="Password"
              error="You must enter a valid password"
              type="password"
              autoComplete="new-password"
            />
            <Text as="p" variant="bodySm" tone="subdued">
              Issues: Accusatory tone, vague guidance, no specific help
            </Text>
          </BlockStack>
        </Box>
      </BlockStack>
    </Card>
  );
};

// ============================================
// 4. INTERNATIONALIZATION READY COMPONENT
// ============================================

interface I18nStrings {
  [key: string]: string | I18nStrings;
}

// Mock i18n hook for demonstration
const useI18n = () => {
  const strings: I18nStrings = {
    products: {
      title: 'Products',
      add_button: 'Add product',
      edit_button: 'Edit',
      delete_button: 'Delete',
      delete_confirmation: 'Are you sure you want to delete this product?',
      empty_state: {
        heading: 'Add your first product',
        message: 'Start by adding products that you want to sell.',
        action: 'Add product',
      },
      errors: {
        name_required: 'Product name is required',
        price_positive: 'Price must be a positive number',
        sku_unique: 'SKU must be unique',
      },
      success: {
        created: 'Product created successfully',
        updated: 'Product updated successfully',
        deleted: 'Product deleted successfully',
      }
    },
    common: {
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      close: 'Close',
      loading: 'Loading...',
      error: 'Something went wrong',
      retry: 'Try again',
    }
  };
  
  const translate = (key: string, replacements?: Record<string, string>) => {
    const keys = key.split('.');
    let value: any = strings;
    
    for (const k of keys) {
      value = value[k];
      if (!value) return key;
    }
    
    let result = String(value);
    if (replacements) {
      Object.entries(replacements).forEach(([k, v]) => {
        result = result.replace(`{${k}}`, v);
      });
    }
    
    return result;
  };
  
  const formatCurrency = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  };
  
  const formatDate = (date: Date, style: 'short' | 'long' = 'short') => {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: style,
    }).format(date);
  };
  
  return { translate, formatCurrency, formatDate };
};

export const InternationalizedProductList: React.FC = () => {
  const { translate, formatCurrency, formatDate } = useI18n();
  const [products] = useState([
    { id: '1', name: 'T-Shirt', price: 29.99, updated: new Date('2024-01-15') },
    { id: '2', name: 'Jeans', price: 89.99, updated: new Date('2024-01-14') },
  ]);
  
  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between">
          <Text as="h2" variant="headingMd">
            {translate('products.title')}
          </Text>
          <Button
            variant="primary"
            icon={SEMANTIC_ICONS.add}
            accessibilityLabel={translate('products.add_button')}
          >
            {translate('products.add_button')}
          </Button>
        </InlineStack>
        
        {products.length === 0 ? (
          <EmptyState
            heading={translate('products.empty_state.heading')}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            action={{
              content: translate('products.empty_state.action'),
              icon: SEMANTIC_ICONS.add,
            }}
          >
            <p>{translate('products.empty_state.message')}</p>
          </EmptyState>
        ) : (
          <DataTable
            columnContentTypes={['text', 'numeric', 'text', 'text']}
            headings={[
              translate('products.name'),
              translate('products.price'),
              translate('products.updated'),
              translate('common.actions'),
            ]}
            rows={products.map(product => [
              product.name,
              formatCurrency(product.price),
              formatDate(product.updated),
              <InlineStack gap="100" key={product.id}>
                <Button
                  size="slim"
                  icon={SEMANTIC_ICONS.edit}
                  accessibilityLabel={`${translate('products.edit_button')} ${product.name}`}
                >
                  {translate('products.edit_button')}
                </Button>
                <Button
                  size="slim"
                  tone="critical"
                  icon={SEMANTIC_ICONS.delete}
                  accessibilityLabel={`${translate('products.delete_button')} ${product.name}`}
                >
                  {translate('products.delete_button')}
                </Button>
              </InlineStack>
            ])}
          />
        )}
      </BlockStack>
    </Card>
  );
};

// ============================================
// 5. CONSISTENT SEMANTIC PATTERNS
// ============================================

export const ConsistentSemanticPatterns: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [selectedAction, setSelectedAction] = useState('');
  
  // Consistent action handler pattern
  const handleAction = useCallback((action: string, item: string) => {
    setSelectedAction(`${action}: ${item}`);
    setLoading(true);
    setTimeout(() => setLoading(false), 1000);
  }, []);
  
  // Consistent status indicators
  const StatusIndicator: React.FC<{
    status: 'success' | 'warning' | 'critical' | 'info';
    message: string;
  }> = ({ status, message }) => {
    const iconMap = {
      success: SEMANTIC_ICONS.success,
      warning: SEMANTIC_ICONS.warning,
      critical: SEMANTIC_ICONS.error,
      info: SEMANTIC_ICONS.info,
    };
    
    const toneMap = {
      success: 'success' as const,
      warning: 'warning' as const,
      critical: 'critical' as const,
      info: 'info' as const,
    };
    
    return (
      <InlineStack gap="100" align="center">
        <Icon source={iconMap[status]} tone={toneMap[status]} />
        <Text as="span" tone={toneMap[status]}>
          {message}
        </Text>
      </InlineStack>
    );
  };
  
  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Consistent Semantic Patterns
        </Text>
        
        {/* Consistent Action Buttons */}
        <BlockStack gap="200">
          <Text as="h3" variant="headingSm">
            Action consistency across features
          </Text>
          
          {/* Orders Section */}
          <Box padding="200" background="bg-surface-secondary" borderRadius="100">
            <InlineStack gap="200" align="center">
              <Icon source={SEMANTIC_ICONS.orders} />
              <Text as="span" fontWeight="semibold">Orders</Text>
              <Button
                size="slim"
                icon={SEMANTIC_ICONS.add}
                onClick={() => handleAction('Add', 'Order')}
              >
                Add
              </Button>
              <Button
                size="slim"
                icon={SEMANTIC_ICONS.export}
                onClick={() => handleAction('Export', 'Orders')}
              >
                Export
              </Button>
            </InlineStack>
          </Box>
          
          {/* Customers Section */}
          <Box padding="200" background="bg-surface-secondary" borderRadius="100">
            <InlineStack gap="200" align="center">
              <Icon source={SEMANTIC_ICONS.customers} />
              <Text as="span" fontWeight="semibold">Customers</Text>
              <Button
                size="slim"
                icon={SEMANTIC_ICONS.add}
                onClick={() => handleAction('Add', 'Customer')}
              >
                Add
              </Button>
              <Button
                size="slim"
                icon={SEMANTIC_ICONS.export}
                onClick={() => handleAction('Export', 'Customers')}
              >
                Export
              </Button>
            </InlineStack>
          </Box>
          
          {/* Products Section */}
          <Box padding="200" background="bg-surface-secondary" borderRadius="100">
            <InlineStack gap="200" align="center">
              <Icon source={SEMANTIC_ICONS.products} />
              <Text as="span" fontWeight="semibold">Products</Text>
              <Button
                size="slim"
                icon={SEMANTIC_ICONS.add}
                onClick={() => handleAction('Add', 'Product')}
              >
                Add
              </Button>
              <Button
                size="slim"
                icon={SEMANTIC_ICONS.export}
                onClick={() => handleAction('Export', 'Products')}
              >
                Export
              </Button>
            </InlineStack>
          </Box>
        </BlockStack>
        
        <Divider />
        
        {/* Consistent Status Messages */}
        <BlockStack gap="200">
          <Text as="h3" variant="headingSm">
            Status consistency
          </Text>
          <StatusIndicator status="success" message="Order processed successfully" />
          <StatusIndicator status="warning" message="Low inventory for 3 products" />
          <StatusIndicator status="critical" message="Payment failed" />
          <StatusIndicator status="info" message="New features available" />
        </BlockStack>
        
        {selectedAction && (
          <Banner tone="info">
            Last action: {selectedAction}
          </Banner>
        )}
      </BlockStack>
    </Card>
  );
};

// ============================================
// 6. LOADING STATE PATTERNS
// ============================================

export const LoadingStatePatterns: React.FC = () => {
  const [loadingCard, setLoadingCard] = useState(true);
  const [loadingList, setLoadingList] = useState(true);
  
  React.useEffect(() => {
    const timer1 = setTimeout(() => setLoadingCard(false), 2000);
    const timer2 = setTimeout(() => setLoadingList(false), 3000);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);
  
  return (
    <Layout>
      <Layout.Section>
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Semantic Loading States
            </Text>
            
            {/* Card Loading */}
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Card content loading
              </Text>
              {loadingCard ? (
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="200">
                    <SkeletonDisplayText size="small" />
                    <SkeletonBodyText lines={3} />
                  </BlockStack>
                </Box>
              ) : (
                <Box padding="400" background="bg-surface-success" borderRadius="200">
                  <BlockStack gap="200">
                    <Text as="h4" variant="headingSm">
                      Content loaded
                    </Text>
                    <Text as="p">
                      This content appeared after loading completed.
                    </Text>
                  </BlockStack>
                </Box>
              )}
            </BlockStack>
            
            {/* List Loading */}
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                List items loading
              </Text>
              {loadingList ? (
                <BlockStack gap="100">
                  {[1, 2, 3].map(i => (
                    <Box
                      key={i}
                      padding="200"
                      background="bg-surface-secondary"
                      borderRadius="100"
                    >
                      <InlineStack gap="200" align="center">
                        <div style={{width: 40, height: 40}}>
                          <SkeletonDisplayText size="small" />
                        </div>
                        <Box minWidth="200">
                          <SkeletonBodyText lines={1} />
                        </Box>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
              ) : (
                <BlockStack gap="100">
                  {['Item 1', 'Item 2', 'Item 3'].map(item => (
                    <Box
                      key={item}
                      padding="200"
                      background="bg-surface"
                      borderRadius="100"
                      borderColor="border"
                      borderWidth="025"
                    >
                      <InlineStack gap="200" align="center">
                        <Icon source={SEMANTIC_ICONS.success} tone="success" />
                        <Text as="span">{item} loaded</Text>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
            
            <InlineStack gap="200">
              <Button
                onClick={() => {
                  setLoadingCard(true);
                  setLoadingList(true);
                  setTimeout(() => setLoadingCard(false), 2000);
                  setTimeout(() => setLoadingList(false), 3000);
                }}
                icon={SEMANTIC_ICONS.refresh}
              >
                Reload examples
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </Layout.Section>
    </Layout>
  );
};

// ============================================
// 7. GLOBAL SEMANTIC CONSIDERATIONS
// ============================================

export const GlobalSemanticConsiderations: React.FC = () => {
  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Global Design Considerations
        </Text>
        
        {/* Universal Icons */}
        <BlockStack gap="200">
          <Text as="h3" variant="headingSm">
            Universal vs. Culture-Specific Icons
          </Text>
          
          <Box padding="300" background="bg-surface-success" borderRadius="200">
            <BlockStack gap="200">
              <Badge tone="success">Universal Icons (Good)</Badge>
              <InlineStack gap="300">
                <InlineStack gap="100" align="center">
                  <Icon source={SEMANTIC_ICONS.payments} />
                  <Text as="span">Currency (generic)</Text>
                </InlineStack>
                <InlineStack gap="100" align="center">
                  <Icon source={SEMANTIC_ICONS.email} />
                  <Text as="span">Email (universal)</Text>
                </InlineStack>
                <InlineStack gap="100" align="center">
                  <Icon source={SEMANTIC_ICONS.calendar} />
                  <Text as="span">Calendar (standard)</Text>
                </InlineStack>
              </InlineStack>
            </BlockStack>
          </Box>
          
          <Box padding="300" background="bg-surface-critical" borderRadius="200">
            <BlockStack gap="200">
              <Badge tone="critical">Culture-Specific (Avoid)</Badge>
              <InlineStack gap="300">
                <InlineStack gap="100" align="center">
                  <Text as="span">$</Text>
                  <Text as="span">Dollar only</Text>
                </InlineStack>
                <InlineStack gap="100" align="center">
                  <Text as="span">🏈</Text>
                  <Text as="span">American football</Text>
                </InlineStack>
                <InlineStack gap="100" align="center">
                  <Text as="span">💾</Text>
                  <Text as="span">Floppy disk</Text>
                </InlineStack>
              </InlineStack>
            </BlockStack>
          </Box>
        </BlockStack>
        
        <Divider />
        
        {/* Text Expansion */}
        <BlockStack gap="200">
          <Text as="h3" variant="headingSm">
            Planning for Text Expansion
          </Text>
          
          <Box padding="300" background="bg-surface-secondary" borderRadius="200">
            <BlockStack gap="200">
              <Text as="p" variant="bodySm">
                English → German (often 30-50% longer)
              </Text>
              <InlineStack gap="200">
                <Button>Save</Button>
                <Button>Speichern</Button>
              </InlineStack>
              
              <Text as="p" variant="bodySm">
                English → French
              </Text>
              <InlineStack gap="200">
                <Button>Settings</Button>
                <Button>Paramètres</Button>
              </InlineStack>
              
              <Text as="p" variant="bodySm">
                Design with flexible layouts that accommodate longer text
              </Text>
            </BlockStack>
          </Box>
        </BlockStack>
      </BlockStack>
    </Card>
  );
};