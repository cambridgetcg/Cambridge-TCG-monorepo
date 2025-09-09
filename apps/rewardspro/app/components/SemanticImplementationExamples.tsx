/**
 * Semantic Implementation Examples for RewardsPro
 * Demonstrates practical usage of semantic components in real scenarios
 */

import React, { useState } from 'react';
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Divider,
  Box,
  Grid,
} from '@shopify/polaris';
import {
  SemanticProvider,
  StatusIndicator,
  TierBadge,
  MoneyDisplay,
  DateDisplay,
  CustomerAvatar,
  SemanticField,
  LoadingSkeleton,
  SemanticEmptyState,
  SemanticAnnouncement,
} from './SemanticReactComponents';
import type { Currency } from '@prisma/client';

// ============================================
// CUSTOMER DASHBOARD EXAMPLE
// ============================================

export const CustomerDashboardExample: React.FC = () => {
  const [loading, setLoading] = useState(false);
  
  const mockCustomer = {
    name: 'Sarah Johnson',
    email: 'sarah.johnson@example.com',
    tier: 'Gold',
    tierLevel: 3,
    cashback: 5,
    storeCredit: 125.50,
    lifetimeSpent: 2450.00,
    lastOrder: new Date('2024-01-15'),
    nextTier: 'Platinum',
    progressToNext: 65,
  };
  
  return (
    <SemanticProvider
      value={{
        locale: 'en-US',
        currency: 'USD' as Currency,
        isRTL: false,
        timezone: 'America/New_York',
        dateFormat: 'MM/DD/YYYY',
        reducedMotion: false,
        highContrast: false,
      }}
    >
      <Page title="Customer Dashboard">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Customer Overview
                </Text>
                
                {loading ? (
                  <LoadingSkeleton type="card" lines={4} />
                ) : (
                  <BlockStack gap="300">
                    {/* Customer Identity */}
                    <CustomerAvatar
                      name={mockCustomer.name}
                      email={mockCustomer.email}
                      size="large"
                      status="vip"
                    />
                    
                    <Divider />
                    
                    {/* Tier Information */}
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">
                        Loyalty Status
                      </Text>
                      <TierBadge
                        tierName={mockCustomer.tier}
                        tierLevel={mockCustomer.tierLevel}
                        cashbackPercentage={mockCustomer.cashback}
                        isCurrentTier={true}
                        nextTierName={mockCustomer.nextTier}
                        progressToNext={mockCustomer.progressToNext}
                      />
                    </BlockStack>
                    
                    <Divider />
                    
                    {/* Financial Summary */}
                    <Grid columns={{ xs: 1, sm: 2, md: 3 }}>
                      <BlockStack gap="100">
                        <Text as="span" variant="bodySm" tone="subdued">
                          Store Credit
                        </Text>
                        <MoneyDisplay
                          amount={mockCustomer.storeCredit}
                          tone="positive"
                          size="large"
                          showSign={false}
                        />
                      </BlockStack>
                      
                      <BlockStack gap="100">
                        <Text as="span" variant="bodySm" tone="subdued">
                          Lifetime Spent
                        </Text>
                        <MoneyDisplay
                          amount={mockCustomer.lifetimeSpent}
                          size="large"
                        />
                      </BlockStack>
                      
                      <BlockStack gap="100">
                        <Text as="span" variant="bodySm" tone="subdued">
                          Last Order
                        </Text>
                        <DateDisplay
                          date={mockCustomer.lastOrder}
                          format="relative"
                          showIcon={true}
                        />
                      </BlockStack>
                    </Grid>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </SemanticProvider>
  );
};

// ============================================
// TRANSACTION HISTORY EXAMPLE
// ============================================

export const TransactionHistoryExample: React.FC = () => {
  const transactions = [
    {
      id: '1',
      type: 'CASHBACK_EARNED' as const,
      amount: 12.50,
      date: new Date('2024-01-20'),
      status: 'completed' as const,
      orderId: 'ORD-001',
    },
    {
      id: '2',
      type: 'ORDER_PAYMENT' as const,
      amount: -50.00,
      date: new Date('2024-01-18'),
      status: 'completed' as const,
      orderId: 'ORD-002',
    },
    {
      id: '3',
      type: 'REFUND_CREDIT' as const,
      amount: 25.00,
      date: new Date('2024-01-15'),
      status: 'pending' as const,
      orderId: 'ORD-003',
    },
    {
      id: '4',
      type: 'MANUAL_ADJUSTMENT' as const,
      amount: 10.00,
      date: new Date('2024-01-10'),
      status: 'completed' as const,
      note: 'Customer service compensation',
    },
  ];
  
  const getTransactionStatus = (type: string, status: string) => {
    if (status === 'pending') return 'warning';
    if (type === 'ORDER_PAYMENT') return 'neutral';
    if (type === 'REFUND_CREDIT' || type === 'CASHBACK_EARNED') return 'success';
    return 'info';
  };
  
  const getTransactionLabel = (type: string) => {
    const labels: Record<string, string> = {
      CASHBACK_EARNED: 'Cashback Earned',
      ORDER_PAYMENT: 'Payment Used',
      REFUND_CREDIT: 'Refund Credit',
      MANUAL_ADJUSTMENT: 'Manual Adjustment',
    };
    return labels[type] || type;
  };
  
  return (
    <SemanticProvider
      value={{
        locale: 'en-US',
        currency: 'USD' as Currency,
        isRTL: false,
        timezone: 'America/New_York',
        dateFormat: 'MM/DD/YYYY',
        reducedMotion: false,
        highContrast: false,
      }}
    >
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">
            Transaction History
          </Text>
          
          {transactions.length === 0 ? (
            <SemanticEmptyState
              heading="No transactions yet"
              message="When customers earn or use store credit, transactions will appear here."
              illustration="orders"
            />
          ) : (
            <BlockStack gap="300">
              {transactions.map((transaction) => (
                <Box
                  key={transaction.id}
                  padding="300"
                  borderColor="border"
                  borderWidth="025"
                  borderRadius="200"
                >
                  <InlineStack align="space-between">
                    <BlockStack gap="100">
                      <StatusIndicator
                        status={getTransactionStatus(transaction.type, transaction.status)}
                        label={getTransactionLabel(transaction.type)}
                      >
                        {getTransactionLabel(transaction.type)}
                      </StatusIndicator>
                      
                      <InlineStack gap="200">
                        <DateDisplay
                          date={transaction.date}
                          format="short"
                        />
                        {transaction.orderId && (
                          <Text as="span" variant="bodySm" tone="subdued">
                            Order #{transaction.orderId}
                          </Text>
                        )}
                        {transaction.note && (
                          <Text as="span" variant="bodySm" tone="subdued">
                            {transaction.note}
                          </Text>
                        )}
                      </InlineStack>
                    </BlockStack>
                    
                    <MoneyDisplay
                      amount={transaction.amount}
                      showSign={true}
                      tone={transaction.amount > 0 ? 'positive' : 'negative'}
                      size="medium"
                    />
                  </InlineStack>
                </Box>
              ))}
            </BlockStack>
          )}
        </BlockStack>
      </Card>
    </SemanticProvider>
  );
};

// ============================================
// TIER MANAGEMENT FORM EXAMPLE
// ============================================

export const TierFormExample: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '',
    cashback: '',
    threshold: '',
    description: '',
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSuccess, setShowSuccess] = useState(false);
  
  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name) {
      newErrors.name = 'Tier name is required';
    }
    
    if (!formData.cashback || parseFloat(formData.cashback) < 0) {
      newErrors.cashback = 'Valid cashback percentage is required';
    }
    
    if (!formData.threshold || parseFloat(formData.threshold) < 0) {
      newErrors.threshold = 'Valid spending threshold is required';
    }
    
    setErrors(newErrors);
    
    if (Object.keys(newErrors).length === 0) {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }
  };
  
  return (
    <SemanticProvider
      value={{
        locale: 'en-US',
        currency: 'USD' as Currency,
        isRTL: false,
        timezone: 'America/New_York',
        dateFormat: 'MM/DD/YYYY',
        reducedMotion: false,
        highContrast: false,
      }}
    >
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">
            Create New Tier
          </Text>
          
          {showSuccess && (
            <SemanticAnnouncement
              message="Tier created successfully!"
              type="success"
              persistent={false}
            />
          )}
          
          <BlockStack gap="300">
            <SemanticField
              label="Tier Name"
              type="text"
              value={formData.name}
              onChange={(value) => setFormData({ ...formData, name: value })}
              error={errors.name}
              helpText="Choose a memorable name for this loyalty tier"
              required={true}
              placeholder="e.g., Gold, Platinum, VIP"
            />
            
            <SemanticField
              label="Cashback Percentage"
              type="percentage"
              value={formData.cashback}
              onChange={(value) => setFormData({ ...formData, cashback: value })}
              error={errors.cashback}
              helpText="Percentage of purchases returned as store credit"
              required={true}
              min={0}
              max={100}
              step={0.5}
            />
            
            <SemanticField
              label="Spending Threshold"
              type="currency"
              value={formData.threshold}
              onChange={(value) => setFormData({ ...formData, threshold: value })}
              error={errors.threshold}
              helpText="Minimum spending required to reach this tier"
              required={true}
              min={0}
            />
            
            <SemanticField
              label="Description"
              type="text"
              value={formData.description}
              onChange={(value) => setFormData({ ...formData, description: value })}
              helpText="Optional description for internal reference"
              placeholder="Benefits and requirements for this tier"
            />
          </BlockStack>
          
          <InlineStack gap="200" align="end">
            <Button onClick={() => setFormData({ name: '', cashback: '', threshold: '', description: '' })}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSubmit}>
              Create Tier
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>
    </SemanticProvider>
  );
};

// ============================================
// LOADING STATES SHOWCASE
// ============================================

export const LoadingStatesShowcase: React.FC = () => {
  return (
    <SemanticProvider
      value={{
        locale: 'en-US',
        currency: 'USD' as Currency,
        isRTL: false,
        timezone: 'America/New_York',
        dateFormat: 'MM/DD/YYYY',
        reducedMotion: false,
        highContrast: false,
      }}
    >
      <Page title="Loading States">
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Card Loading
                  </Text>
                  <LoadingSkeleton type="card" lines={3} />
                </BlockStack>
              </Card>
              
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    List Loading
                  </Text>
                  <LoadingSkeleton type="list" lines={4} />
                </BlockStack>
              </Card>
              
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Form Loading
                  </Text>
                  <LoadingSkeleton type="form" lines={3} />
                </BlockStack>
              </Card>
              
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Dashboard Loading
                  </Text>
                  <LoadingSkeleton type="dashboard" lines={5} />
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>
    </SemanticProvider>
  );
};

// ============================================
// RTL LANGUAGE EXAMPLE
// ============================================

export const RTLExample: React.FC = () => {
  const [isRTL, setIsRTL] = useState(false);
  
  const arabicCustomer = {
    name: isRTL ? 'أحمد محمد' : 'Ahmed Mohammed',
    email: 'ahmed@example.com',
    tier: isRTL ? 'ذهبي' : 'Gold',
    tierLevel: 3,
    cashback: 5,
    storeCredit: 125.50,
  };
  
  return (
    <SemanticProvider
      value={{
        locale: isRTL ? 'ar-SA' : 'en-US',
        currency: isRTL ? 'SAR' as Currency : 'USD' as Currency,
        isRTL: isRTL,
        timezone: isRTL ? 'Asia/Riyadh' : 'America/New_York',
        dateFormat: isRTL ? 'DD/MM/YYYY' : 'MM/DD/YYYY',
        reducedMotion: false,
        highContrast: false,
      }}
    >
      <Page title={isRTL ? 'لوحة التحكم' : 'Dashboard'}>
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    {isRTL ? 'مثال على RTL' : 'RTL Example'}
                  </Text>
                  <Button onClick={() => setIsRTL(!isRTL)}>
                    {isRTL ? 'Switch to LTR' : 'Switch to RTL'}
                  </Button>
                </InlineStack>
                
                <BlockStack gap="300">
                  <CustomerAvatar
                    name={arabicCustomer.name}
                    email={arabicCustomer.email}
                    size="large"
                  />
                  
                  <Divider />
                  
                  <TierBadge
                    tierName={arabicCustomer.tier}
                    tierLevel={arabicCustomer.tierLevel}
                    cashbackPercentage={arabicCustomer.cashback}
                    isCurrentTier={true}
                  />
                  
                  <Divider />
                  
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd">
                      {isRTL ? 'رصيد المتجر' : 'Store Credit'}
                    </Text>
                    <MoneyDisplay
                      amount={arabicCustomer.storeCredit}
                      currency={isRTL ? 'SAR' as Currency : 'USD' as Currency}
                      tone="positive"
                    />
                  </InlineStack>
                  
                  <DateDisplay
                    date={new Date()}
                    format="long"
                    showIcon={true}
                  />
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </SemanticProvider>
  );
};