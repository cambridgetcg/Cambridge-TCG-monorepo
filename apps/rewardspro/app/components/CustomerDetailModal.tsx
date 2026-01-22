import { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Divider,
  Box,
  Tabs,
  DataTable,
  SkeletonBodyText,
  SkeletonDisplayText,
  Button,
  Icon,
  Banner,
  Collapsible,
  List,
  Select,
  IndexTable,
  useIndexResourceState,
} from '@shopify/polaris';
import {
  PersonIcon,
  CashDollarIcon,
  CalendarIcon,
  PackageIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  EmailIcon,
  HashtagIcon,
  StarIcon,
} from '@shopify/polaris-icons';
import { formatCurrency } from '../utils/currency';
import { StoreCreditTab } from './StoreCredit';
import { CustomerHeroStats } from './CustomerDetails/CustomerHeroStats';
import { TierProgressBar } from './CustomerDetails/TierProgressBar';
import { StatusDot } from './CustomerDetails/StatusDot';
import { TierTimeline } from './CustomerDetails/TierTimeline';

// TierSource enum matches CustomerTierState.tierSource
type TierSource = 'MANUAL_OVERRIDE' | 'TIER_SUBSCRIPTION' | 'TIER_PURCHASE' | 'SPENDING_BASED' | 'NONE';

interface CustomerDetails {
  customer: {
    id: string;
    email: string;
    shopifyCustomerId: string;
    storeCredit: string;
    createdAt: string;
    updatedAt: string;
    currentTier?: {
      name: string;
      cashbackPercent: number;
    } | null;
  };
  tier: {
    id: string;
    name: string;
    cashbackPercent: number;
    minSpend: number;
    evaluationPeriod: string;
  } | null;
  creditHistory: Array<{
    id: string;
    amount: string;
    balance: string;
    type: string;
    shopifyOrderId: string | null;
    metadata: any;
    createdAt: string;
  }>;
  tierChangeLogs: Array<{
    id: string;
    fromTierName: string | null;
    toTierName: string | null;
    changeType: string;
    triggerType: string;
    totalSpending: string | null;
    periodSpending: string | null;
    note: string | null;
    createdAt: string;
  }>;
  // CustomerTierState - single source of truth for tier status
  tierState: {
    tierSource: TierSource;
    hasManualOverride: boolean;
    manualOverrideAt: string | null;
    manualOverrideBy: string | null;
    manualOverrideExpiry: string | null;
    manualOverrideNote: string | null;
    activePurchaseId: string | null;
    purchaseExpiresAt: string | null;
    activeSubscriptionId: string | null;
    subscriptionExpiresAt: string | null;
    spendingBasedTierId: string | null;
    lastResolvedAt: string | null;
    resolutionReason: string | null;
  } | null;
  orders: Array<{
    id: string;
    name: string;
    createdAt: string;
    financialStatus: string;
    fulfillmentStatus: string;
    total: {
      amount: string;
      currencyCode: string;
    };
    lineItems: Array<{
      title: string;
      quantity: number;
      total: {
        amount: string;
        currencyCode: string;
      };
    }>;
  }>;
  shopSettings: {
    storeCurrency: string;
    currencyDisplayType: string;
  } | null;
  // Tier progression data from API
  nextTier: {
    id: string;
    name: string;
    minSpend: number;
    cashbackPercent: number;
  } | null;
  allTiers: Array<{
    id: string;
    name: string;
    minSpend: number;
    cashbackPercent: number;
    isCurrentTier: boolean;
  }>;
  isMaxTier: boolean;
}

interface CustomerDetailModalProps {
  customerId: string | null;
  customerEmail: string;
  open: boolean;
  onClose: () => void;
  initialTab?: number;
}

export function CustomerDetailModal({
  customerId,
  customerEmail,
  open,
  onClose,
  initialTab = 0,
}: CustomerDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<CustomerDetails | null>(null);
  const [selectedTab, setSelectedTab] = useState(initialTab);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  // Pagination states for Orders tab
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPageSize, setOrdersPageSize] = useState(25);


  // Fetch customer details when modal opens
  useEffect(() => {
    if (open && customerId) {
      fetchCustomerDetails();
      setSelectedTab(initialTab);
    }
  }, [open, customerId, initialTab]);

  const fetchCustomerDetails = async () => {
    if (!customerId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/customer-details/${customerId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch customer details');
      }
      
      const data = await response.json();
      setDetails(data);
    } catch (err) {
      console.error('Error fetching customer details:', err);
      setError(err instanceof Error ? err.message : 'Failed to load customer details');
    } finally {
      setLoading(false);
    }
  };

  const toggleOrderExpansion = useCallback((orderId: string) => {
    setExpandedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatAmount = (amount: string | number) => {
    if (details?.shopSettings) {
      return formatCurrency(amount, details.shopSettings as any);
    }
    return `$${parseFloat(amount.toString()).toFixed(2)}`;
  };

  const formatDateShort = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return formatDateShort(dateString);
  };

  // Helper function for tier progress - calculates total spending from orders
  const calculateTotalSpending = (data: CustomerDetails): number => {
    return data.orders.reduce((sum, order) => sum + parseFloat(order.total.amount), 0);
  };

  // Note: getNextTierName, getNextTierThreshold, and isMaxTier are now provided by the API
  // See: api.customer-details.$id.tsx - returns nextTier, allTiers, and isMaxTier

  const getLedgerTypeBadge = (type: string) => {
    const toneMap: Record<string, 'success' | 'info' | 'warning' | 'critical'> = {
      CASHBACK_EARNED: 'success',
      ORDER_PAYMENT: 'info',
      REFUND_CREDIT: 'warning',
      MANUAL_ADJUSTMENT: 'info',
      SHOPIFY_SYNC: 'info',
    };
    
    const labelMap: Record<string, string> = {
      CASHBACK_EARNED: 'Cashback',
      ORDER_PAYMENT: 'Payment',
      REFUND_CREDIT: 'Refund',
      MANUAL_ADJUSTMENT: 'Adjustment',
      SHOPIFY_SYNC: 'Sync',
    };
    
    return (
      <Badge tone={toneMap[type] || 'info'}>
        {labelMap[type] || type}
      </Badge>
    );
  };

  const tabs = [
    {
      id: 'overview',
      content: 'Overview',
      panelID: 'overview-panel',
    },
    {
      id: 'store-credit',
      content: 'Store Credit',
      panelID: 'store-credit-panel',
    },
    {
      id: 'orders',
      content: `Orders (${details?.orders.length || 0})`,
      panelID: 'orders-panel',
    },
    {
      id: 'tier-changes',
      content: `Tier Changes (${details?.tierChangeLogs.length || 0})`,
      panelID: 'tier-panel',
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Customer Details: ${customerEmail}`}
      primaryAction={{
        content: 'Close',
        onAction: onClose,
      }}
      size="large"
    >
      <Modal.Section>
        {loading && (
          <BlockStack gap="400">
            {/* Hero Stats Skeleton */}
            <Box
              background="bg-surface-secondary"
              padding="400"
              borderRadius="300"
            >
              <InlineStack gap="400">
                {[1, 2, 3, 4].map((i) => (
                  <Box key={i} background="bg-surface" padding="400" borderRadius="200" minWidth="120px">
                    <BlockStack gap="200" align="center">
                      <SkeletonDisplayText size="small" />
                      <SkeletonBodyText lines={1} />
                    </BlockStack>
                  </Box>
                ))}
              </InlineStack>
            </Box>
            {/* Details Card Skeleton */}
            <Card>
              <BlockStack gap="300">
                <SkeletonDisplayText size="small" />
                <Divider />
                <SkeletonBodyText lines={4} />
              </BlockStack>
            </Card>
          </BlockStack>
        )}
        
        {error && (
          <Banner tone="critical">
            <p>{error}</p>
          </Banner>
        )}
        
        {details && !loading && (
          <BlockStack gap="400">
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
              {/* Overview Tab */}
              {selectedTab === 0 && (
                <Box paddingBlockStart="400">
                  <BlockStack gap="400">
                    {/* Hero Stats Section */}
                    <CustomerHeroStats
                      storeCredit={details.customer.storeCredit}
                      tierName={details.tier?.name || null}
                      cashbackPercent={details.tier?.cashbackPercent || null}
                      ordersCount={details.orders.length}
                      formatAmount={formatAmount}
                      onStatClick={setSelectedTab}
                      tierSource={details.tierState?.tierSource || null}
                      tierExpiry={
                        details.tierState?.purchaseExpiresAt ||
                        details.tierState?.subscriptionExpiresAt ||
                        details.tierState?.manualOverrideExpiry ||
                        null
                      }
                    />

                    {/* Tier Progress - uses API data for accurate thresholds */}
                    {details.tier && (
                      <TierProgressBar
                        currentTierName={details.tier.name}
                        nextTierName={details.nextTier?.name || null}
                        currentSpending={calculateTotalSpending(details)}
                        nextTierThreshold={details.nextTier?.minSpend || 0}
                        isMaxTier={details.isMaxTier}
                        formatAmount={formatAmount}
                      />
                    )}

                    {/* Customer Details Card */}
                    <Card>
                      <BlockStack gap="300">
                        <Text variant="headingMd" as="h3">Customer Details</Text>
                        <Divider />

                        <BlockStack gap="200">
                          <InlineStack align="space-between" blockAlign="center">
                            <InlineStack gap="200" blockAlign="center">
                              <Icon source={EmailIcon} tone="subdued" />
                              <Text as="span" tone="subdued">Email</Text>
                            </InlineStack>
                            <Text as="span" fontWeight="semibold">{details.customer.email}</Text>
                          </InlineStack>

                          <InlineStack align="space-between" blockAlign="center">
                            <InlineStack gap="200" blockAlign="center">
                              <Icon source={HashtagIcon} tone="subdued" />
                              <Text as="span" tone="subdued">Shopify ID</Text>
                            </InlineStack>
                            <Text as="span" fontWeight="semibold">
                              {details.customer.shopifyCustomerId.replace('gid://shopify/Customer/', '')}
                            </Text>
                          </InlineStack>

                          <InlineStack align="space-between" blockAlign="center">
                            <InlineStack gap="200" blockAlign="center">
                              <Icon source={CalendarIcon} tone="subdued" />
                              <Text as="span" tone="subdued">Member Since</Text>
                            </InlineStack>
                            <Text as="span">{formatDateShort(details.customer.createdAt)}</Text>
                          </InlineStack>

                          <InlineStack align="space-between" blockAlign="center">
                            <InlineStack gap="200" blockAlign="center">
                              <Icon source={ClockIcon} tone="subdued" />
                              <Text as="span" tone="subdued">Last Active</Text>
                            </InlineStack>
                            <Text as="span">{formatRelativeTime(details.customer.updatedAt)}</Text>
                          </InlineStack>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </BlockStack>
                </Box>
              )}

              {/* Store Credit Tab */}
              {selectedTab === 1 && (
                <Box paddingBlockStart="400">
                  <StoreCreditTab
                    customer={{
                      id: details.customer.id,
                      email: details.customer.email,
                      shopifyCustomerId: details.customer.shopifyCustomerId,
                      storeCredit: details.customer.storeCredit,
                      currentTier: details.tier ? {
                        name: details.tier.name,
                        cashbackPercent: details.tier.cashbackPercent
                      } : null
                    }}
                    shopSettings={details.shopSettings}
                    initialTransactions={details.creditHistory}
                  />
                </Box>
              )}

              {/* Orders Tab */}
              {selectedTab === 2 && (
                <Box paddingBlockStart="400">
                  <BlockStack gap="400">
                    {/* Page size selector and pagination info */}
                    {details.orders.length > 0 && (
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="span" variant="bodyMd">
                          Showing {Math.min(ordersPageSize, details.orders.length)} of {details.orders.length} orders
                        </Text>
                        <Select
                          label="Items per page"
                          labelHidden
                          options={[
                            { label: "25 per page", value: "25" },
                            { label: "50 per page", value: "50" },
                            { label: "100 per page", value: "100" },
                            { label: "200 per page", value: "200" },
                          ]}
                          value={ordersPageSize.toString()}
                          onChange={(value) => {
                            setOrdersPageSize(parseInt(value));
                            setOrdersPage(1);
                          }}
                        />
                      </InlineStack>
                    )}

                    {details.orders.length > 0 ? (
                      <Card padding="0">
                        <IndexTable
                          resourceName={{ singular: 'order', plural: 'orders' }}
                          itemCount={details.orders.length}
                          headings={[
                            { title: 'Order' },
                            { title: 'Date' },
                            { title: 'Payment' },
                            { title: 'Fulfillment' },
                            { title: 'Total', alignment: 'end' },
                            { title: '' },
                          ]}
                          selectable={false}
                        >
                          {details.orders
                            .slice((ordersPage - 1) * ordersPageSize, ordersPage * ordersPageSize)
                            .map((order, index) => (
                            <>
                              <IndexTable.Row
                                id={order.id}
                                key={order.id}
                                position={index}
                              >
                                <IndexTable.Cell>
                                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                                    {order.name}
                                  </Text>
                                </IndexTable.Cell>
                                <IndexTable.Cell>
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    {formatDateShort(order.createdAt)}
                                  </Text>
                                </IndexTable.Cell>
                                <IndexTable.Cell>
                                  <StatusDot status={order.financialStatus} type="financial" />
                                </IndexTable.Cell>
                                <IndexTable.Cell>
                                  <StatusDot status={order.fulfillmentStatus} type="fulfillment" />
                                </IndexTable.Cell>
                                <IndexTable.Cell>
                                  <Text as="span" variant="bodyMd" fontWeight="semibold" alignment="end">
                                    {formatAmount(order.total.amount)}
                                  </Text>
                                </IndexTable.Cell>
                                <IndexTable.Cell>
                                  <Button
                                    variant="plain"
                                    size="slim"
                                    icon={expandedOrders.has(order.id) ? ChevronUpIcon : ChevronDownIcon}
                                    onClick={() => toggleOrderExpansion(order.id)}
                                    accessibilityLabel={expandedOrders.has(order.id) ? 'Collapse' : 'Expand'}
                                  />
                                </IndexTable.Cell>
                              </IndexTable.Row>
                              {expandedOrders.has(order.id) && (
                                <tr>
                                  <td colSpan={6}>
                                    <Box
                                      padding="400"
                                      background="bg-surface-secondary"
                                      borderColor="border-secondary"
                                      borderWidth="025"
                                    >
                                      <BlockStack gap="200">
                                        <Text as="span" variant="headingSm">Line Items</Text>
                                        {order.lineItems.map((item, idx) => (
                                          <InlineStack key={idx} align="space-between">
                                            <Text as="span" variant="bodySm">
                                              {item.title} × {item.quantity}
                                            </Text>
                                            <Text as="span" variant="bodySm" fontWeight="semibold">
                                              {formatAmount(item.total.amount)}
                                            </Text>
                                          </InlineStack>
                                        ))}
                                      </BlockStack>
                                    </Box>
                                  </td>
                                </tr>
                              )}
                            </>
                          ))}
                        </IndexTable>
                      </Card>
                    ) : (
                      <Card>
                        <Box padding="400">
                          <InlineStack gap="300" blockAlign="center">
                            <Box
                              background="bg-surface-secondary"
                              padding="300"
                              borderRadius="200"
                            >
                              <Icon source={PackageIcon} tone="subdued" />
                            </Box>
                            <BlockStack gap="100">
                              <Text as="span" variant="headingSm">No orders yet</Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                Orders will appear here once the customer makes a purchase
                              </Text>
                            </BlockStack>
                          </InlineStack>
                        </Box>
                      </Card>
                    )}

                    {/* Pagination controls for Orders */}
                    {details.orders.length > ordersPageSize && (
                      <Box paddingBlockStart="400">
                        <InlineStack align="center" gap="400">
                          <Button
                            disabled={ordersPage === 1}
                            onClick={() => setOrdersPage(ordersPage - 1)}
                          >
                            Previous
                          </Button>
                          <Text as="span" variant="bodySm">
                            Page {ordersPage} of {Math.ceil(details.orders.length / ordersPageSize)}
                          </Text>
                          <Button
                            disabled={ordersPage === Math.ceil(details.orders.length / ordersPageSize)}
                            onClick={() => setOrdersPage(ordersPage + 1)}
                          >
                            Next
                          </Button>
                        </InlineStack>
                      </Box>
                    )}
                  </BlockStack>
                </Box>
              )}

              {/* Tier Changes Tab */}
              {selectedTab === 3 && (
                <Box paddingBlockStart="400">
                  <Card>
                    <BlockStack gap="300">
                      <Text variant="headingMd" as="h3">Tier History</Text>
                      <Divider />
                      <TierTimeline
                        logs={details.tierChangeLogs}
                        formatAmount={formatAmount}
                        formatDate={formatDateShort}
                      />
                    </BlockStack>
                  </Card>
                </Box>
              )}
            </Tabs>
          </BlockStack>
        )}
      </Modal.Section>
    </Modal>
  );
}