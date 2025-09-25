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
} from '@shopify/polaris';
import {
  PersonIcon,
  CashDollarIcon,
  CalendarIcon,
  PackageIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@shopify/polaris-icons';
import { formatCurrency } from '../utils/currency';
import { StoreCreditTab } from './StoreCredit';

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
            <SkeletonDisplayText size="medium" />
            <SkeletonBodyText lines={5} />
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
                    {/* Customer Info Card */}
                    <Card>
                      <BlockStack gap="300">
                        <InlineStack align="space-between">
                          <InlineStack gap="200" blockAlign="center">
                            <Icon source={PersonIcon} tone="base" />
                            <Text variant="headingMd" as="h3">Customer Information</Text>
                          </InlineStack>
                          {details.tier && (
                            <Badge tone="success">
                              {`${details.tier.name} (${details.tier.cashbackPercent.toString()}% cashback)`}
                            </Badge>
                          )}
                        </InlineStack>
                        
                        <Divider />
                        
                        <BlockStack gap="200">
                          <InlineStack align="space-between">
                            <Text as="span" tone="subdued">Email</Text>
                            <Text as="span" fontWeight="semibold">{details.customer.email}</Text>
                          </InlineStack>
                          
                          <InlineStack align="space-between">
                            <Text as="span" tone="subdued">Shopify ID</Text>
                            <Text as="span" fontWeight="semibold">{details.customer.shopifyCustomerId}</Text>
                          </InlineStack>
                          
                          <InlineStack align="space-between">
                            <Text as="span" tone="subdued">Store Credit Balance</Text>
                            <Text as="span" fontWeight="semibold" tone="success">
                              {formatAmount(details.customer.storeCredit)}
                            </Text>
                          </InlineStack>
                          
                          <InlineStack align="space-between">
                            <Text as="span" tone="subdued">Customer Since</Text>
                            <Text as="span">{formatDate(details.customer.createdAt)}</Text>
                          </InlineStack>
                          
                          <InlineStack align="space-between">
                            <Text as="span" tone="subdued">Last Updated</Text>
                            <Text as="span">{formatDate(details.customer.updatedAt)}</Text>
                          </InlineStack>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                    
                    {/* Tier Info Card */}
                    {details.tier && (
                      <Card>
                        <BlockStack gap="300">
                          <InlineStack gap="200" blockAlign="center">
                            <Icon source={StarIcon} tone="base" />
                            <Text variant="headingMd" as="h3">Tier Details</Text>
                          </InlineStack>
                          
                          <Divider />
                          
                          <BlockStack gap="200">
                            <InlineStack align="space-between">
                              <Text as="span" tone="subdued">Tier Name</Text>
                              <Badge tone="success">{details.tier.name}</Badge>
                            </InlineStack>
                            
                            <InlineStack align="space-between">
                              <Text as="span" tone="subdued">Cashback Rate</Text>
                              <Text as="span" fontWeight="semibold">{details.tier.cashbackPercent}%</Text>
                            </InlineStack>
                            
                            <InlineStack align="space-between">
                              <Text as="span" tone="subdued">Minimum Spend</Text>
                              <Text as="span">{formatAmount(details.tier.minSpend)}</Text>
                            </InlineStack>
                            
                            <InlineStack align="space-between">
                              <Text as="span" tone="subdued">Evaluation Period</Text>
                              <Text as="span">{details.tier.evaluationPeriod}</Text>
                            </InlineStack>
                          </BlockStack>
                        </BlockStack>
                      </Card>
                    )}
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
                      details.orders
                        .slice((ordersPage - 1) * ordersPageSize, ordersPage * ordersPageSize)
                        .map((order) => (
                        <Card key={order.id}>
                          <BlockStack gap="300">
                            <InlineStack align="space-between" blockAlign="center">
                              <BlockStack gap="100">
                                <InlineStack gap="200">
                                  <Icon source={PackageIcon} tone="base" />
                                  <Text as="span" variant="headingSm" fontWeight="semibold">
                                    {order.name}
                                  </Text>
                                </InlineStack>
                                <Text as="span" variant="bodySm" tone="subdued">
                                  {formatDate(order.createdAt)}
                                </Text>
                              </BlockStack>
                              
                              <InlineStack gap="200">
                                <Badge tone="info">{order.financialStatus}</Badge>
                                <Badge>{order.fulfillmentStatus}</Badge>
                                <Text as="span" fontWeight="semibold">
                                  {formatAmount(order.total.amount)}
                                </Text>
                                <Button
                                  variant="plain"
                                  icon={expandedOrders.has(order.id) ? ChevronUpIcon : ChevronDownIcon}
                                  onClick={() => toggleOrderExpansion(order.id)}
                                />
                              </InlineStack>
                            </InlineStack>
                            
                            <Collapsible
                              open={expandedOrders.has(order.id)}
                              id={`order-${order.id}`}
                            >
                              <Box paddingBlockStart="300">
                                <BlockStack gap="200">
                                  <Divider />
                                  <Text as="span" variant="headingSm" tone="subdued">Line Items</Text>
                                  <List>
                                    {order.lineItems.map((item, index) => (
                                      <List.Item key={index}>
                                        <InlineStack align="space-between">
                                          <Text as="span">
                                            {item.title} × {item.quantity}
                                          </Text>
                                          <Text as="span" fontWeight="semibold">
                                            {formatAmount(item.total.amount)}
                                          </Text>
                                        </InlineStack>
                                      </List.Item>
                                    ))}
                                  </List>
                                </BlockStack>
                              </Box>
                            </Collapsible>
                          </BlockStack>
                        </Card>
                      ))
                    ) : (
                      <Card>
                        <BlockStack gap="200" align="center">
                          <Icon source={PackageIcon} tone="subdued" />
                          <Text as="span" tone="subdued">No orders found</Text>
                        </BlockStack>
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
                  <BlockStack gap="400">
                    {details.tierChangeLogs.length > 0 ? (
                      details.tierChangeLogs.map((log) => (
                        <Card key={log.id}>
                          <BlockStack gap="200">
                            <InlineStack align="space-between">
                              <InlineStack gap="200">
                                <Icon source={ClockIcon} tone="base" />
                                <Text as="span" variant="headingSm">
                                  {log.changeType.replace(/_/g, ' ')}
                                </Text>
                              </InlineStack>
                              <Text as="span" variant="bodySm" tone="subdued">
                                {formatDate(log.createdAt)}
                              </Text>
                            </InlineStack>
                            
                            <InlineStack gap="200">
                              {log.fromTierName && (
                                <Badge>{log.fromTierName}</Badge>
                              )}
                              {log.fromTierName && log.toTierName && (
                                <Text as="span">→</Text>
                              )}
                              {log.toTierName && (
                                <Badge tone="success">{log.toTierName}</Badge>
                              )}
                            </InlineStack>
                            
                            {log.note && (
                              <Text as="span" variant="bodySm" tone="subdued">{log.note}</Text>
                            )}
                            
                            <InlineStack gap="400">
                              <Text as="span" variant="bodySm" tone="subdued">
                                Trigger: {log.triggerType.replace(/_/g, ' ').toLowerCase()}
                              </Text>
                              {log.totalSpending && (
                                <Text as="span" variant="bodySm" tone="subdued">
                                  Total spent: {formatAmount(log.totalSpending)}
                                </Text>
                              )}
                            </InlineStack>
                          </BlockStack>
                        </Card>
                      ))
                    ) : (
                      <Card>
                        <BlockStack gap="200" align="center">
                          <Icon source={ClockIcon} tone="subdued" />
                          <Text as="span" tone="subdued">No tier changes recorded</Text>
                        </BlockStack>
                      </Card>
                    )}
                  </BlockStack>
                </Box>
              )}
            </Tabs>
          </BlockStack>
        )}
      </Modal.Section>
    </Modal>
  );
}

// Import missing StarIcon
import { StarIcon } from '@shopify/polaris-icons';