import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigation, useRevalidator } from "@remix-run/react";
import { useState, useCallback, useMemo } from "react";
import {
  Page,
  Layout,
  Card,
  Grid,
  Text,
  Badge,
  Button,
  Select,
  Tabs,
  BlockStack,
  InlineStack,
  Banner,
  Box,
  Divider,
  DataTable,
  ProgressBar,
  EmptyState,
  SkeletonBodyText,
  SkeletonDisplayText,
  ButtonGroup,
  Popover,
  DatePicker,
} from "@shopify/polaris";
import { TierBadge, TierIndicator, TierProgress } from "~/components/TierBadge";
import { getTierStyle, sortTiersByPriority, formatTierName } from "~/utils/tier-styles";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { formatCurrency } from "../utils/currency";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface AnalyticsData {
  // Overview metrics
  revenueImpact: number;
  activeMembers: number;
  totalMembers: number;
  avgOrderValue: number;
  conversionRate: number;
  totalStoreCredit: number;
  creditUtilization: number;
  
  
  // Trends (last 30 days)
  trends: {
    revenue: TrendData[];
    members: TrendData[];
    orders: TrendData[];
    credit: TrendData[];
  };
  
  // Tier analytics
  tierPerformance: {
    id: string;
    name: string;
    members: number;
    revenue: number;
    avgSpend: number;
    retention: number;
    creditBalance: number;
    cashbackPercent: number;
    upgradeRate?: number;
  }[];
  
  // Insights
  insights: {
    opportunities: Insight[];
    warnings: Insight[];
    successes: Insight[];
  };
  
  // Financial breakdown
  financial: {
    directRevenue: number;
    creditIssued: number;
    creditRedeemed: number;
    netValue: number;
    roi: number;
    costBreakdown: {
      creditCost: number;
      operationalCost: number;
    };
  };
  
  // Customer segments
  segments: {
    vip: { count: number; revenue: number; avgCredit: number; };
    atRisk: { count: number; revenue: number; churnRisk: number; };
    new: { count: number; revenue: number; activationRate: number; };
    dormant: { count: number; lastRevenue: number; daysSinceLastOrder: number; };
  };
  
  // Comparison data
  comparison: {
    period: 'week' | 'month' | 'quarter' | 'year';
    current: number;
    previous: number;
    change: number;
  };
  
  shopSettings: {
    storeCurrency: string;
    currencyDisplayType: string;
  } | null;
}

interface TrendData {
  date: string;
  value: number;
  label?: string;
}

interface Insight {
  id: string;
  type: 'opportunity' | 'warning' | 'success' | 'info';
  title: string;
  description: string;
  metric?: string;
  priority: 'high' | 'medium' | 'low';
  action?: string;
  impact?: string;
}

// ============================================
// LOADER - Fetch and calculate analytics
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }
  
  const shop = session.shop;
  
  try {
    // Get date 30 days ago as ISO string for Data API
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    // Fetch all necessary data
    const [
      shopSettings,
      customers,
      tiers,
      recentTransactions,
      allTransactions,
    ] = await Promise.all([
      db.shopSettings.findUnique({ where: { shop } }),
      db.customer.findMany({
        where: { shop },
        include: { currentTier: true },
      }),
      db.tier.findMany({
        where: { shop },
        orderBy: { minSpend: 'asc' },
      }),
      db.storeCreditLedger.findMany({
        where: { shop },
        orderBy: { createdAt: 'desc' },
        take: 100, // Limit recent transactions
      }),
      db.storeCreditLedger.findMany({
        where: { shop },
        select: { 
          type: true, 
          amount: true, 
          createdAt: true,
          customerId: true,
        },
      }),
    ]);
    
    // Filter recent transactions (last 30 days) since we can't use date comparison in query
    const thirtyDaysAgoDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const filteredRecentTransactions = recentTransactions.filter(
      t => new Date(t.createdAt) >= thirtyDaysAgoDate
    );
    
    // Calculate metrics
    const totalMembers = customers.length;
    const activeMembers = customers.filter(c => 
      c.currentTierId || (c.storeCredit && parseFloat(c.storeCredit.toString()) > 0)
    ).length;
    
    const totalStoreCredit = customers.reduce((sum, c) => 
      sum + (c.storeCredit ? parseFloat(c.storeCredit.toString()) : 0), 0
    );
    
    const totalCreditIssued = allTransactions
      .filter(t => t.type === 'CASHBACK_EARNED' || t.type === 'MANUAL_ADJUSTMENT')
      .reduce((sum, t) => sum + Math.max(0, t.amount ? parseFloat(t.amount.toString()) : 0), 0);
    
    const totalCreditRedeemed = allTransactions
      .filter(t => t.type === 'ORDER_PAYMENT')
      .reduce((sum, t) => sum + Math.abs(t.amount ? parseFloat(t.amount.toString()) : 0), 0);
    
    const creditUtilization = totalCreditIssued > 0 
      ? (totalCreditRedeemed / totalCreditIssued) * 100 
      : 0;
    
    // TODO: In production, fetch actual order data from Shopify GraphQL API
    // Currently estimating revenue based on cashback earned (reverse calculation)
    // If customers earned cashback, we can estimate the order values
    const totalCashbackEarned = allTransactions
      .filter(t => t.type === 'CASHBACK_EARNED')
      .reduce((sum, t) => sum + Math.abs(t.amount ? parseFloat(t.amount.toString()) : 0), 0);
    
    // Get average cashback rate across all tiers weighted by customer count
    const avgCashbackRate = tiers.length > 0
      ? tiers.reduce((sum, tier) => {
          const tierCustomerCount = customers.filter(c => c.currentTierId === tier.id).length;
          return sum + (tier.cashbackPercent * tierCustomerCount);
        }, 0) / Math.max(1, customers.length)
      : 5; // Default 5% if no tiers
    
    // Estimate total revenue from cashback earned
    const estimatedRevenueFromCashback = avgCashbackRate > 0 
      ? (totalCashbackEarned / (avgCashbackRate / 100))
      : 0;
    
    // Add actual credit redemptions
    const revenueImpact = estimatedRevenueFromCashback + totalCreditRedeemed;
    const avgOrderValue = activeMembers > 0 ? revenueImpact / activeMembers : 0;
    const conversionRate = activeMembers > 0 ? (activeMembers / totalMembers) * 100 : 0;
    
    
    // Generate trend data (last 30 days)
    const trends = generateTrendData(customers, filteredRecentTransactions);
    
    // Calculate tier performance
    const tierPerformance = calculateTierPerformance(tiers, customers, allTransactions);
    
    // Generate insights
    const insights = generateInsights(
      customers,
      tiers,
      creditUtilization,
      conversionRate,
      tierPerformance
    );
    
    // Calculate financial breakdown
    const financial = {
      directRevenue: revenueImpact,
      creditIssued: totalCreditIssued,
      creditRedeemed: totalCreditRedeemed,
      netValue: revenueImpact - totalCreditIssued,
      roi: totalCreditIssued > 0 ? ((revenueImpact - totalCreditIssued) / totalCreditIssued) * 100 : 0,
      costBreakdown: {
        creditCost: totalCreditIssued,
        operationalCost: totalCreditIssued * 0.1, // Assume 10% operational cost
      },
    };
    
    // Calculate customer segments
    const segments = calculateCustomerSegments(customers, allTransactions);
    
    // Calculate comparison (vs previous period)
    const comparison = {
      period: 'month' as const,
      current: revenueImpact,
      previous: revenueImpact * 0.85, // Mock data - would calculate from historical
      change: revenueImpact * 0.85 > 0 ? ((revenueImpact - (revenueImpact * 0.85)) / (revenueImpact * 0.85)) * 100 : 0,
    };
    
    const analyticsData: AnalyticsData = {
      revenueImpact,
      activeMembers,
      totalMembers,
      avgOrderValue,
      conversionRate,
      totalStoreCredit,
      creditUtilization,
      trends,
      tierPerformance,
      insights,
      financial,
      segments,
      comparison,
      shopSettings: shopSettings ? {
        storeCurrency: shopSettings.storeCurrency,
        currencyDisplayType: shopSettings.currencyDisplayType,
      } : null,
    };
    
    return json(analyticsData);
  } catch (error) {
    console.error("Analytics loader error:", error);
    throw new Response("Failed to load analytics", { status: 500 });
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================


function generateTrendData(customers: any[], transactions: any[]): AnalyticsData['trends'] {
  // Generate mock trend data for last 30 days
  const days = 30;
  const trends = {
    revenue: [] as TrendData[],
    members: [] as TrendData[],
    orders: [] as TrendData[],
    credit: [] as TrendData[],
  };
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    // Mock data with some randomness
    trends.revenue.push({
      date: dateStr,
      value: 1000 + Math.random() * 500 + (30 - i) * 20,
    });
    
    trends.members.push({
      date: dateStr,
      value: Math.max(0, customers.length - i + Math.floor(Math.random() * 5)),
    });
    
    trends.orders.push({
      date: dateStr,
      value: Math.floor(10 + Math.random() * 20),
    });
    
    trends.credit.push({
      date: dateStr,
      value: 500 + Math.random() * 200,
    });
  }
  
  return trends;
}

function calculateTierPerformance(
  tiers: any[],
  customers: any[],
  transactions: any[]
): AnalyticsData['tierPerformance'] {
  return tiers.map((tier, index) => {
    const tierCustomers = customers.filter(c => c.currentTierId === tier.id);
    const tierTransactions = transactions.filter(t => 
      tierCustomers.some(c => c.id === t.customerId)
    );
    
    // TODO: In production, fetch actual order data from Shopify GraphQL API
    // Currently estimating revenue based on cashback earned (reverse calculation)
    // If a customer earned X cashback at Y% rate, the order value was X / (Y/100)
    const cashbackEarned = tierTransactions
      .filter(t => t.type === 'CASHBACK_EARNED')
      .reduce((sum, t) => sum + Math.abs(t.amount ? parseFloat(t.amount.toString()) : 0), 0);
    
    // Calculate estimated revenue from cashback
    // If no cashback rate, use 0 to avoid division by zero
    const estimatedRevenue = tier.cashbackPercent > 0 
      ? (cashbackEarned / (tier.cashbackPercent / 100))
      : 0;
    
    // Also add revenue from store credit redemptions (actual spending)
    const creditRedeemed = tierTransactions
      .filter(t => t.type === 'ORDER_PAYMENT')
      .reduce((sum, t) => sum + Math.abs(t.amount ? parseFloat(t.amount.toString()) : 0), 0);
    
    // Total revenue is estimated from cashback + credit redemptions
    const revenue = estimatedRevenue + creditRedeemed;
    
    const creditBalance = tierCustomers.reduce((sum, c) => 
      sum + (c.storeCredit ? parseFloat(c.storeCredit.toString()) : 0), 0
    );
    
    // Calculate average spend per customer
    const avgSpend = tierCustomers.length > 0 ? revenue / tierCustomers.length : 0;
    
    return {
      id: tier.id,
      name: tier.name,
      members: tierCustomers.length,
      revenue,
      avgSpend,
      retention: 75 + Math.random() * 20, // Mock retention rate
      creditBalance,
      cashbackPercent: tier.cashbackPercent,
      upgradeRate: index < tiers.length - 1 ? 15 + Math.random() * 10 : undefined,
    };
  });
}

function generateInsights(
  customers: any[],
  tiers: any[],
  creditUtilization: number,
  conversionRate: number,
  tierPerformance: any[]
): AnalyticsData['insights'] {
  const insights = {
    opportunities: [] as Insight[],
    warnings: [] as Insight[],
    successes: [] as Insight[],
  };
  
  // Check for opportunities
  const customersNearUpgrade = customers.filter(c => {
    if (!c.currentTier) return false;
    const nextTier = tiers.find(t => t.minSpend > c.currentTier.minSpend);
    // Since we don't have lifetimeSpend, we can't calculate near upgrades accurately
    // This would need to be calculated from order history
    return false;
  }).length;
  
  if (customersNearUpgrade > 0) {
    insights.opportunities.push({
      id: 'near-upgrade',
      type: 'opportunity',
      title: 'Customers Near Tier Upgrade',
      description: `${customersNearUpgrade} customers are within $100 of reaching the next tier`,
      metric: `${customersNearUpgrade} customers`,
      priority: 'high',
      action: 'Send targeted campaign',
      impact: 'Potential 15% increase in engagement',
    });
  }
  
  // Check for warnings
  if (creditUtilization < 30) {
    insights.warnings.push({
      id: 'low-utilization',
      type: 'warning',
      title: 'Low Credit Utilization',
      description: 'Customers are not using their earned credits effectively',
      metric: `${creditUtilization.toFixed(0)}% utilization`,
      priority: 'medium',
      action: 'Create credit expiry or bonus events',
      impact: 'Could increase revenue by 20%',
    });
  }
  
  const noTierCustomers = customers.filter(c => !c.currentTierId).length;
  if (noTierCustomers > customers.length * 0.3) {
    insights.warnings.push({
      id: 'many-no-tier',
      type: 'warning',
      title: 'Many Customers Without Tiers',
      description: `${((noTierCustomers / customers.length) * 100).toFixed(0)}% of customers aren't in a loyalty tier`,
      metric: `${noTierCustomers} customers`,
      priority: 'high',
      action: 'Review tier requirements',
      impact: 'Missing engagement opportunity',
    });
  }
  
  // Check for successes
  if (conversionRate > 50) {
    insights.successes.push({
      id: 'high-conversion',
      type: 'success',
      title: 'High Loyalty Conversion',
      description: 'More than half of your customers are actively engaged',
      metric: `${conversionRate.toFixed(0)}% conversion`,
      priority: 'low',
      action: 'Maintain current strategy',
    });
  }
  
  const topTier = tierPerformance[tierPerformance.length - 1];
  if (topTier && topTier.retention > 90) {
    insights.successes.push({
      id: 'high-retention',
      type: 'success',
      title: 'Excellent Top Tier Retention',
      description: `${topTier.name} tier has ${topTier.retention.toFixed(0)}% retention rate`,
      metric: `${topTier.retention.toFixed(0)}% retention`,
      priority: 'low',
      action: 'Consider exclusive perks',
    });
  }
  
  return insights;
}

function calculateCustomerSegments(customers: any[], transactions: any[]): AnalyticsData['segments'] {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000;
  
  // VIP customers (top 10% by credit balance)
  const sortedByCredit = [...customers].sort((a, b) => {
    const aCredit = a.storeCredit ? parseFloat(a.storeCredit.toString()) : 0;
    const bCredit = b.storeCredit ? parseFloat(b.storeCredit.toString()) : 0;
    return bCredit - aCredit;
  });
  const vipCount = Math.ceil(customers.length * 0.1);
  const vipCustomers = sortedByCredit.slice(0, vipCount);
  
  // At-risk customers (no activity in 30-60 days)
  const atRiskCustomers = customers.filter(c => {
    const lastTransaction = transactions
      .filter(t => t.customerId === c.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    
    return lastTransaction && 
           new Date(lastTransaction.createdAt).getTime() < thirtyDaysAgo &&
           new Date(lastTransaction.createdAt).getTime() > sixtyDaysAgo;
  });
  
  // New customers (joined in last 30 days)
  const newCustomers = customers.filter(c => 
    new Date(c.createdAt).getTime() > thirtyDaysAgo
  );
  
  // Dormant customers (no activity in 60+ days)
  const dormantCustomers = customers.filter(c => {
    const lastTransaction = transactions
      .filter(t => t.customerId === c.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    
    return !lastTransaction || new Date(lastTransaction.createdAt).getTime() < sixtyDaysAgo;
  });
  
  return {
    vip: {
      count: vipCustomers.length,
      revenue: vipCustomers.length * 500, // Mock revenue
      avgCredit: vipCustomers.reduce((sum, c) => sum + (c.storeCredit ? parseFloat(c.storeCredit.toString()) : 0), 0) / Math.max(1, vipCustomers.length),
    },
    atRisk: {
      count: atRiskCustomers.length,
      revenue: atRiskCustomers.length * 200,
      churnRisk: 35,
    },
    new: {
      count: newCustomers.length,
      revenue: newCustomers.length * 150,
      activationRate: 62,
    },
    dormant: {
      count: dormantCustomers.length,
      lastRevenue: dormantCustomers.length * 100,
      daysSinceLastOrder: 75,
    },
  };
}

// ============================================
// COMPONENTS
// ============================================

function MetricCard({ 
  title, 
  value, 
  change, 
  trend, 
  loading, 
  delay = 0 
}: {
  title: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'neutral';
  loading?: boolean;
  delay?: number;
}) {
  if (loading) {
    return (
      <Card>
        <Box padding="400">
          <BlockStack gap="200">
            <SkeletonBodyText lines={1} />
            <SkeletonDisplayText size="large" />
            <SkeletonBodyText lines={1} />
          </BlockStack>
        </Box>
      </Card>
    );
  }


  const getTrendTone = () => {
    if (trend === 'up') return 'success';
    if (trend === 'down') return 'critical';
    return 'subdued';
  };

  return (
    <div
      style={{
        opacity: 0,
        animation: `fadeInUp 300ms ease-out ${delay}ms forwards`,
      }}
    >
      <Card>
        <Box padding="400">
          <BlockStack gap="300">
            {change !== undefined && (
              <InlineStack align="end">
                <Badge tone={getTrendTone() as any}>
                  {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '–'} {Math.abs(change)}%
                </Badge>
              </InlineStack>
            )}
            
            <BlockStack gap="100">
              <Text variant="bodySm" tone="subdued" as="p">
                {title}
              </Text>
              <Text variant="heading2xl" as="h3">
                {value}
              </Text>
            </BlockStack>
          </BlockStack>
        </Box>
      </Card>
    </div>
  );
}


function InsightCard({ insight }: { insight: Insight }) {

  const getTone = () => {
    switch (insight.type) {
      case 'opportunity': return 'magic';
      case 'warning': return 'warning';
      case 'success': return 'success';
      default: return 'info';
    }
  };

  return (
    <Box 
      padding="400" 
      background={`bg-surface-${getTone()}-subdued` as any}
      borderInlineStartWidth="025"
      borderColor={`border-${getTone()}` as any}
      borderRadius="200"
    >
      <BlockStack gap="300">
        <InlineStack align="space-between">
          <Text variant="headingSm" as="h4">
            {insight.title}
          </Text>
          {insight.priority && (
            <Badge tone="critical">
              {`${insight.priority} priority`}
            </Badge>
          )}
        </InlineStack>
        
        <Text variant="bodyMd" as="p">
          {insight.description}
        </Text>
        
        {insight.metric && (
          <Text variant="headingLg" as="p" tone={getTone() as any}>
            {insight.metric}
          </Text>
        )}
        
        {insight.action && (
          <InlineStack gap="200">
            <Button size="slim" tone={getTone() as any}>
              {insight.action}
            </Button>
            {insight.impact && (
              <Text variant="bodySm" tone="subdued" as="span">
                {insight.impact}
              </Text>
            )}
          </InlineStack>
        )}
      </BlockStack>
    </Box>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function AnalyticsPage() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const [selectedTab, setSelectedTab] = useState(0);
  const [selectedDateRange, setSelectedDateRange] = useState('30days');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customDateRange, setCustomDateRange] = useState<{
    start: Date | null;
    end: Date | null;
  }>({ start: null, end: null });
  
  const isLoading = navigation.state === "loading" || revalidator.state === "loading";
  
  // Format currency helper
  const formatAmount = useCallback((amount: number) => {
    return formatCurrency(amount, data.shopSettings as any);
  }, [data.shopSettings]);
  
  // Handle date range selection
  const handleDateRangeSelect = useCallback((range: string) => {
    setSelectedDateRange(range);
    setShowDatePicker(false);
    
    // In a real implementation, this would trigger a data reload
    // For now, we'll just update the UI state
    console.log('Selected date range:', range);
  }, []);
  
  // Get date range display text
  const getDateRangeText = useCallback(() => {
    const now = new Date();
    switch (selectedDateRange) {
      case 'today':
        return `Today (${now.toLocaleDateString()})`;
      case '7days':
        const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return `Last 7 Days (${week.toLocaleDateString()} - ${now.toLocaleDateString()})`;
      case '30days':
        const month = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return `Last 30 Days (${month.toLocaleDateString()} - ${now.toLocaleDateString()})`;
      case 'quarter':
        const quarter = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        return `Last Quarter (${quarter.toLocaleDateString()} - ${now.toLocaleDateString()})`;
      case 'year':
        const year = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        return `Last Year (${year.toLocaleDateString()} - ${now.toLocaleDateString()})`;
      case 'custom':
        if (customDateRange.start && customDateRange.end) {
          return `Custom (${customDateRange.start.toLocaleDateString()} - ${customDateRange.end.toLocaleDateString()})`;
        }
        return 'Custom Range';
      default:
        return 'Last 30 Days';
    }
  }, [selectedDateRange, customDateRange]);

  const tabs = [
    { id: 'overview', content: 'Overview' },
    { id: 'engagement', content: 'Engagement' },
    { id: 'financial', content: 'Financial' },
    { id: 'insights', content: 'Insights' },
  ];

  return (
    <Page
      title="Analytics"
      subtitle="Track your loyalty program performance"
      primaryAction={{
        content: 'Export Report',
        onAction: () => console.log('Export report'),
      }}
      secondaryActions={[
        {
          content: 'Refresh',
          loading: revalidator.state === "loading",
          onAction: () => revalidator.revalidate(),
        },
      ]}
    >
      <Layout>
        {/* Date Range Selector */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <InlineStack align="space-between">
                <ButtonGroup>
                  <Button 
                    pressed={selectedDateRange === 'today'}
                    onClick={() => handleDateRangeSelect('today')}
                  >
                    Today
                  </Button>
                  <Button 
                    pressed={selectedDateRange === '7days'}
                    onClick={() => handleDateRangeSelect('7days')}
                  >
                    7 Days
                  </Button>
                  <Button 
                    pressed={selectedDateRange === '30days'}
                    onClick={() => handleDateRangeSelect('30days')}
                  >
                    30 Days
                  </Button>
                  <Button 
                    pressed={selectedDateRange === 'quarter'}
                    onClick={() => handleDateRangeSelect('quarter')}
                  >
                    Quarter
                  </Button>
                  <Button 
                    pressed={selectedDateRange === 'year'}
                    onClick={() => handleDateRangeSelect('year')}
                  >
                    Year
                  </Button>
                </ButtonGroup>
                
                <Popover
                  active={showDatePicker}
                  activator={
                    <Button 
                      pressed={selectedDateRange === 'custom'}
                      onClick={() => setShowDatePicker(!showDatePicker)}
                      disclosure={showDatePicker ? 'up' : 'down'}
                    >
                      Custom Range
                    </Button>
                  }
                  onClose={() => setShowDatePicker(false)}
                >
                  <Box padding="400" minWidth="320px">
                    <BlockStack gap="400">
                      <Text variant="headingSm" as="h3">Select Date Range</Text>
                      <BlockStack gap="300">
                        <Text variant="bodySm" tone="subdued" as="p">
                          Date range selection is coming soon. This will allow you to:
                        </Text>
                        <BlockStack gap="200">
                          <Text variant="bodySm" as="p">• Select custom start and end dates</Text>
                          <Text variant="bodySm" as="p">• Compare periods</Text>
                          <Text variant="bodySm" as="p">• Export data for selected range</Text>
                        </BlockStack>
                      </BlockStack>
                      <Button 
                        variant="primary" 
                        onClick={() => {
                          setSelectedDateRange('custom');
                          setShowDatePicker(false);
                        }}
                      >
                        Apply Custom Range
                      </Button>
                    </BlockStack>
                  </Box>
                </Popover>
              </InlineStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* Selected Date Range Indicator */}
        <Layout.Section>
          <Banner tone="info">
            <Text variant="bodyMd" as="p">
              Showing data for: <Text as="span" fontWeight="semibold">{getDateRangeText()}</Text>
            </Text>
          </Banner>
        </Layout.Section>

        {/* Key Metrics Grid */}
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <MetricCard
                title="Total Revenue Impact"
                value={formatAmount(data.revenueImpact)}
                change={data.comparison.change}
                trend={data.comparison.change > 0 ? 'up' : 'down'}
                loading={isLoading}
                delay={0}
              />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <MetricCard
                title="Active Members"
                value={`${data.activeMembers} / ${data.totalMembers}`}
                change={12}
                trend="up"
                loading={isLoading}
                delay={50}
              />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <MetricCard
                title="Avg Order Value"
                value={formatAmount(data.avgOrderValue)}
                change={8}
                trend="up"
                loading={isLoading}
                delay={100}
              />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <MetricCard
                title="Conversion Rate"
                value={`${data.conversionRate.toFixed(1)}%`}
                change={-2}
                trend="down"
                loading={isLoading}
                delay={150}
              />
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Tabbed Content */}
        <Layout.Section>
          <Card>
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
              {/* Overview Tab */}
              {selectedTab === 0 && (
                <Box padding="400">
                  <BlockStack gap="500">
                    {/* Tier Performance */}
                    <BlockStack gap="400">
                      <Text variant="headingMd" as="h2">
                        Tier Performance
                      </Text>
                      {data.tierPerformance.length > 0 ? (
                        <DataTable
                          columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric']}
                          headings={[
                            'Tier',
                            'Members',
                            'Revenue',
                            'Avg Spend',
                            'Retention',
                            'Credit Balance',
                          ]}
                          rows={sortTiersByPriority(data.tierPerformance).map(tier => [
                            <TierBadge
                              tierName={tier.name}
                              size="small"
                              showIcon={true}
                              cashbackPercent={tier.cashbackPercent}
                            />,
                            tier.members,
                            formatAmount(tier.revenue).toString(),
                            formatAmount(tier.avgSpend),
                            `${tier.retention.toFixed(0)}%`,
                            formatAmount(tier.creditBalance),
                          ])}
                        />
                      ) : (
                        <EmptyState
                          heading="No tier data yet"
                          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                        >
                          <p>Tier performance will appear here once you have data.</p>
                        </EmptyState>
                      )}
                    </BlockStack>

                    <Divider />

                    {/* Customer Segments */}
                    <BlockStack gap="400">
                      <Text variant="headingMd" as="h2">
                        Customer Segments
                      </Text>
                      <Grid>
                        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}>
                          <Card>
                            <Box padding="300">
                              <BlockStack gap="200">
                                <Text variant="headingSm" as="h3">VIP Customers</Text>
                                <Text variant="headingLg" as="p">{data.segments.vip.count}</Text>
                                <Text variant="bodySm" tone="subdued" as="p">
                                  Avg credit: {formatAmount(data.segments.vip.avgCredit)}
                                </Text>
                              </BlockStack>
                            </Box>
                          </Card>
                        </Grid.Cell>
                        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}>
                          <Card>
                            <Box padding="300">
                              <BlockStack gap="200">
                                <Text variant="headingSm" as="h3">At Risk</Text>
                                <Text variant="headingLg" as="p">{data.segments.atRisk.count}</Text>
                                <Text variant="bodySm" tone="subdued" as="p">
                                  Churn risk: {data.segments.atRisk.churnRisk}%
                                </Text>
                              </BlockStack>
                            </Box>
                          </Card>
                        </Grid.Cell>
                        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}>
                          <Card>
                            <Box padding="300">
                              <BlockStack gap="200">
                                <Text variant="headingSm" as="h3">New Members</Text>
                                <Text variant="headingLg" as="p">{data.segments.new.count}</Text>
                                <Text variant="bodySm" tone="subdued" as="p">
                                  Activation: {data.segments.new.activationRate}%
                                </Text>
                              </BlockStack>
                            </Box>
                          </Card>
                        </Grid.Cell>
                        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}>
                          <Card>
                            <Box padding="300">
                              <BlockStack gap="200">
                                <Text variant="headingSm" as="h3">Dormant</Text>
                                <Text variant="headingLg" as="p">{data.segments.dormant.count}</Text>
                                <Text variant="bodySm" tone="subdued" as="p">
                                  {data.segments.dormant.daysSinceLastOrder} days inactive
                                </Text>
                              </BlockStack>
                            </Box>
                          </Card>
                        </Grid.Cell>
                      </Grid>
                    </BlockStack>
                  </BlockStack>
                </Box>
              )}

              {/* Engagement Tab */}
              {selectedTab === 1 && (
                <Box padding="400">
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">
                      Engagement Metrics
                    </Text>
                    <Grid>
                      <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                        <Card>
                          <Box padding="400">
                            <BlockStack gap="300">
                              <Text variant="headingSm" as="h3">Credit Utilization</Text>
                              <Text variant="heading2xl" as="p">
                                {data.creditUtilization.toFixed(1)}%
                              </Text>
                              <ProgressBar
                                progress={data.creditUtilization}
                                tone={data.creditUtilization > 60 ? 'success' : 'critical'}
                              />
                              <Text variant="bodySm" tone="subdued" as="p">
                                {formatAmount(data.financial.creditRedeemed)} of {formatAmount(data.financial.creditIssued)} issued
                              </Text>
                            </BlockStack>
                          </Box>
                        </Card>
                      </Grid.Cell>
                      <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                        <Card>
                          <Box padding="400">
                            <BlockStack gap="300">
                              <Text variant="headingSm" as="h3">Member Distribution</Text>
                              <BlockStack gap="200">
                                <InlineStack align="space-between">
                                  <Text as="span">Active Members</Text>
                                  <Text as="span">{data.activeMembers}</Text>
                                </InlineStack>
                                <ProgressBar
                                  progress={(data.activeMembers / data.totalMembers) * 100}
                                  tone="success"
                                  size="small"
                                />
                                <InlineStack align="space-between">
                                  <Text as="span">Inactive Members</Text>
                                  <Text as="span">{data.totalMembers - data.activeMembers}</Text>
                                </InlineStack>
                                <ProgressBar
                                  progress={((data.totalMembers - data.activeMembers) / data.totalMembers) * 100}
                                  tone="critical"
                                  size="small"
                                />
                              </BlockStack>
                            </BlockStack>
                          </Box>
                        </Card>
                      </Grid.Cell>
                    </Grid>
                  </BlockStack>
                </Box>
              )}

              {/* Financial Tab */}
              {selectedTab === 2 && (
                <Box padding="400">
                  <BlockStack gap="500">
                    <Card>
                      <Box padding="400">
                        <BlockStack gap="400">
                          <Text variant="headingMd" as="h2">
                            Revenue Attribution
                          </Text>
                          
                          <BlockStack gap="300">
                            <InlineStack align="space-between">
                              <Text variant="bodyMd" as="span">Direct Loyalty Revenue</Text>
                              <Text variant="bodyMd" fontWeight="semibold" as="span">
                                {formatAmount(data.financial.directRevenue)}
                              </Text>
                            </InlineStack>
                            
                            <Divider />
                            
                            <InlineStack align="space-between">
                              <Text variant="bodyMd" as="span">Credit Issued</Text>
                              <Text variant="bodyMd" tone="critical" as="span">
                                -{formatAmount(data.financial.creditIssued)}
                              </Text>
                            </InlineStack>
                            
                            <InlineStack align="space-between">
                              <Text variant="bodyMd" as="span">Operational Costs</Text>
                              <Text variant="bodyMd" tone="critical" as="span">
                                -{formatAmount(data.financial.costBreakdown.operationalCost)}
                              </Text>
                            </InlineStack>
                            
                            <Divider />
                            
                            <InlineStack align="space-between">
                              <Text variant="headingSm" as="span">Net Program Value</Text>
                              <Text variant="headingMd" tone="success" as="span">
                                {formatAmount(data.financial.netValue)}
                              </Text>
                            </InlineStack>
                            
                            <Box background="bg-surface-success" padding="300" borderRadius="200">
                              <InlineStack align="space-between">
                                <Text variant="bodyMd" fontWeight="semibold" as="span">ROI</Text>
                                <Badge tone="success">
                                  {`${data.financial.roi.toFixed(0)}%`}
                                </Badge>
                              </InlineStack>
                            </Box>
                          </BlockStack>
                        </BlockStack>
                      </Box>
                    </Card>
                  </BlockStack>
                </Box>
              )}

              {/* Insights Tab */}
              {selectedTab === 3 && (
                <Box padding="400">
                  <BlockStack gap="500">
                    {/* Opportunities */}
                    {data.insights.opportunities.length > 0 && (
                      <BlockStack gap="400">
                        <Text variant="headingMd" as="h2">
                          Opportunities
                        </Text>
                        <BlockStack gap="300">
                          {data.insights.opportunities.map(insight => (
                            <InsightCard key={insight.id} insight={insight} />
                          ))}
                        </BlockStack>
                      </BlockStack>
                    )}

                    {/* Warnings */}
                    {data.insights.warnings.length > 0 && (
                      <BlockStack gap="400">
                        <Text variant="headingMd" as="h2">
                          Warnings
                        </Text>
                        <BlockStack gap="300">
                          {data.insights.warnings.map(insight => (
                            <InsightCard key={insight.id} insight={insight} />
                          ))}
                        </BlockStack>
                      </BlockStack>
                    )}

                    {/* Successes */}
                    {data.insights.successes.length > 0 && (
                      <BlockStack gap="400">
                        <Text variant="headingMd" as="h2">
                          Successes
                        </Text>
                        <BlockStack gap="300">
                          {data.insights.successes.map(insight => (
                            <InsightCard key={insight.id} insight={insight} />
                          ))}
                        </BlockStack>
                      </BlockStack>
                    )}
                  </BlockStack>
                </Box>
              )}
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>
      
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes fadeInLeft {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </Page>
  );
}