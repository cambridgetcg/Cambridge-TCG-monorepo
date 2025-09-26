import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigation, useNavigate, useSearchParams } from "@remix-run/react";
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
import {
  MetricCard,
  StatsOverview,
  EnhancedDataTable,
  LoadingSkeleton,
  ActionBanner,
} from "../components/DesignSystem";
import {
  ChartVerticalIcon,
  PersonIcon,
  CashDollarIcon,
  RewardIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from "~/utils/polaris-icons";
import { TierBadge, TierIndicator, TierProgress } from "../components/TierBadge";
import { getTierStyle, sortTiersByPriority, formatTierName } from "../utils/tier-styles";
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

  // Get date range from URL parameters
  const url = new URL(request.url);
  const dateRange = url.searchParams.get('range') || '30days';

  try {
    // Calculate date range based on selection
    let startDate: Date | null = null;
    let endDate: Date = new Date();
    const now = new Date();

    switch (dateRange) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case '7days':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30days':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        startDate = null; // No start date filter for all time
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    // Build date filter for orders
    const dateFilter = startDate ? {
      shopifyCreatedAt: {
        gte: startDate,
        lte: endDate
      }
    } : {}; // No date filter for all time

    // Fetch all necessary data with Orders included
    const [
      shopSettings,
      customers,
      tiers,
      orders,
      allOrders, // For customer metrics calculation
      recentTransactions,
      allTransactions,
    ] = await Promise.all([
      db.shopSettings.findUnique({ where: { shop } }),
      db.customer.findMany({
        where: { shop },
        include: {
          currentTier: true,
          orders: {
            select: {
              id: true,
              shopifyCreatedAt: true,
              netAmount: true,
            },
            orderBy: { shopifyCreatedAt: 'desc' },
            take: 1 // Just to get last order date
          }
        },
      }),
      db.tier.findMany({
        where: { shop },
        orderBy: { minSpend: 'asc' },
      }),
      // Fetch orders for the selected date range
      db.order.findMany({
        where: {
          shop,
          financialStatus: 'PAID',
          ...dateFilter
        },
        include: {
          customer: {
            select: {
              id: true,
              currentTierId: true,
            }
          }
        }
      }),
      // Fetch all orders for customer spending calculation (no date filter)
      db.order.findMany({
        where: {
          shop,
          financialStatus: 'PAID',
        },
        select: {
          customerId: true,
          netAmount: true,
          cashbackAmount: true,
          shopifyCreatedAt: true,
        }
      }),
      db.storeCreditLedger.findMany({
        where: {
          shop,
          ...(startDate ? { createdAt: { gte: startDate } } : {})
        },
        orderBy: { createdAt: 'desc' },
        take: 100, // Limit recent transactions
      }),
      db.storeCreditLedger.findMany({
        where: {
          shop,
          ...(startDate ? { createdAt: { gte: startDate } } : {})
        },
        select: {
          type: true,
          amount: true,
          createdAt: true,
          customerId: true,
        },
      }),
    ]);

    // Calculate customer spending from orders (since totalSpent field isn't updated)
    const customerSpendingMap = new Map<string, { totalSpent: number, orderCount: number, lastOrderDate: Date | null }>();
    allOrders.forEach(order => {
      const existing = customerSpendingMap.get(order.customerId) || { totalSpent: 0, orderCount: 0, lastOrderDate: null };
      existing.totalSpent += parseFloat(order.netAmount?.toString() || '0');
      existing.orderCount += 1;
      if (!existing.lastOrderDate || new Date(order.shopifyCreatedAt) > existing.lastOrderDate) {
        existing.lastOrderDate = new Date(order.shopifyCreatedAt);
      }
      customerSpendingMap.set(order.customerId, existing);
    });

    // Calculate metrics from actual orders
    const totalRevenue = orders.reduce((sum, order) =>
      sum + parseFloat(order.netAmount?.toString() || '0'), 0
    );

    const totalCashbackFromOrders = orders.reduce((sum, order) =>
      sum + parseFloat(order.cashbackAmount?.toString() || '0'), 0
    );

    const orderCount = orders.length;
    const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

    // Calculate active members (customers with orders in period or store credit)
    const customersWithOrdersInPeriod = new Set(orders.map(o => o.customerId));
    const activeMembers = customers.filter(c =>
      customersWithOrdersInPeriod.has(c.id) ||
      (c.storeCredit && parseFloat(c.storeCredit.toString()) > 0)
    ).length;

    const totalMembers = customers.length;
    const conversionRate = totalMembers > 0 ? (activeMembers / totalMembers) * 100 : 0;

    const totalStoreCredit = customers.reduce((sum, c) =>
      sum + (c.storeCredit ? parseFloat(c.storeCredit.toString()) : 0), 0
    );

    // Calculate credit metrics from ledger (keep this as is)
    const totalCreditIssued = allTransactions
      .filter(t => t.type === 'CASHBACK_EARNED' || t.type === 'MANUAL_ADJUSTMENT')
      .reduce((sum, t) => sum + Math.max(0, t.amount ? parseFloat(t.amount.toString()) : 0), 0);

    const totalCreditRedeemed = allTransactions
      .filter(t => t.type === 'ORDER_PAYMENT')
      .reduce((sum, t) => sum + Math.abs(t.amount ? parseFloat(t.amount.toString()) : 0), 0);

    const creditUtilization = totalCreditIssued > 0
      ? (totalCreditRedeemed / totalCreditIssued) * 100
      : 0;

    // Use actual revenue instead of estimation
    const revenueImpact = Math.round(totalRevenue * 100) / 100;
    const avgOrderValueRounded = Math.round(avgOrderValue * 100) / 100;
    // Generate trend data from actual orders
    const trends = generateTrendDataFromOrders(orders, customers, allTransactions, startDate);

    // Calculate tier performance with actual order data
    const tierPerformance = calculateTierPerformanceFromOrders(tiers, orders, customers, allTransactions);

    // Generate insights
    const insights = generateInsights(
      customers,
      tiers,
      creditUtilization,
      conversionRate,
      tierPerformance
    );

    // Calculate financial breakdown with actual revenue
    const financial = {
      directRevenue: Math.round(totalRevenue * 100) / 100,
      creditIssued: Math.round(totalCreditIssued * 100) / 100,
      creditRedeemed: Math.round(totalCreditRedeemed * 100) / 100,
      netValue: Math.round((totalRevenue - totalCreditIssued) * 100) / 100,
      roi: totalCreditIssued > 0 ? Math.round(((totalRevenue - totalCreditIssued) / totalCreditIssued) * 100 * 100) / 100 : 0,
      costBreakdown: {
        creditCost: Math.round(totalCreditIssued * 100) / 100,
        operationalCost: Math.round(totalCreditIssued * 0.1 * 100) / 100, // Assume 10% operational cost
      },
    };

    // Calculate customer segments using order history
    const segments = calculateCustomerSegmentsFromOrders(customers, allOrders, customerSpendingMap);

    // Calculate comparison vs previous period
    // For real comparison, we'd need to fetch orders from previous period
    const previousPeriodRevenue = totalRevenue * 0.85; // Placeholder - should query previous period
    const comparison = {
      period: dateRange === 'year' ? 'year' as const : 'month' as const,
      current: Math.round(totalRevenue * 100) / 100,
      previous: Math.round(previousPeriodRevenue * 100) / 100,
      change: previousPeriodRevenue > 0 ? Math.round(((totalRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100 * 100) / 100 : 0,
    };

    const analyticsData: AnalyticsData = {
      revenueImpact,
      activeMembers,
      totalMembers,
      avgOrderValue: avgOrderValueRounded,
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
  // Legacy function - keeping for backward compatibility
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

function generateTrendDataFromOrders(
  orders: any[],
  customers: any[],
  transactions: any[],
  startDate: Date | null
): AnalyticsData['trends'] {
  // Generate trend data from actual orders
  const trends = {
    revenue: [] as TrendData[],
    members: [] as TrendData[],
    orders: [] as TrendData[],
    credit: [] as TrendData[],
  };

  // Determine the trend period (last 30 days for display, regardless of filter)
  const trendDays = 30;
  const now = new Date();

  // Group orders and transactions by date
  const ordersByDate = new Map<string, any[]>();
  const transactionsByDate = new Map<string, any[]>();
  const customersByDate = new Map<string, Set<string>>();

  orders.forEach(order => {
    const dateStr = new Date(order.shopifyCreatedAt).toISOString().split('T')[0];
    if (!ordersByDate.has(dateStr)) {
      ordersByDate.set(dateStr, []);
    }
    ordersByDate.get(dateStr)!.push(order);

    // Track unique customers per day
    if (!customersByDate.has(dateStr)) {
      customersByDate.set(dateStr, new Set());
    }
    customersByDate.get(dateStr)!.add(order.customerId);
  });

  transactions.forEach(transaction => {
    const dateStr = new Date(transaction.createdAt).toISOString().split('T')[0];
    if (!transactionsByDate.has(dateStr)) {
      transactionsByDate.set(dateStr, []);
    }
    transactionsByDate.get(dateStr)!.push(transaction);
  });

  // Generate data for each day
  for (let i = trendDays - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const dayOrders = ordersByDate.get(dateStr) || [];
    const dayTransactions = transactionsByDate.get(dateStr) || [];
    const dayCustomers = customersByDate.get(dateStr) || new Set();

    // Calculate daily revenue from orders
    const dayRevenue = dayOrders.reduce((sum, order) =>
      sum + parseFloat(order.netAmount?.toString() || '0'), 0
    );

    // Calculate daily credit issued
    const dayCreditIssued = dayTransactions
      .filter(t => t.type === 'CASHBACK_EARNED' || t.type === 'MANUAL_ADJUSTMENT')
      .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount?.toString() || '0')), 0);

    trends.revenue.push({
      date: dateStr,
      value: Math.round(dayRevenue * 100) / 100,
    });

    trends.members.push({
      date: dateStr,
      value: dayCustomers.size,
    });

    trends.orders.push({
      date: dateStr,
      value: dayOrders.length,
    });

    trends.credit.push({
      date: dateStr,
      value: Math.round(dayCreditIssued * 100) / 100,
    });
  }

  return trends;
}

function calculateTierPerformance(
  tiers: any[],
  customers: any[],
  transactions: any[]
): AnalyticsData['tierPerformance'] {
  // Legacy function - keeping for backward compatibility
  return tiers.map((tier, index) => {
    const tierCustomers = customers.filter(c => c.currentTierId === tier.id);
    const tierTransactions = transactions.filter(t =>
      tierCustomers.some(c => c.id === t.customerId)
    );

    const cashbackEarned = tierTransactions
      .filter(t => t.type === 'CASHBACK_EARNED')
      .reduce((sum, t) => sum + Math.abs(t.amount ? parseFloat(t.amount.toString()) : 0), 0);

    const estimatedRevenue = tier.cashbackPercent > 0
      ? (cashbackEarned / (tier.cashbackPercent / 100))
      : 0;

    const creditRedeemed = tierTransactions
      .filter(t => t.type === 'ORDER_PAYMENT')
      .reduce((sum, t) => sum + Math.abs(t.amount ? parseFloat(t.amount.toString()) : 0), 0);

    const revenue = Math.round((estimatedRevenue + creditRedeemed) * 100) / 100;

    const creditBalance = Math.round(tierCustomers.reduce((sum, c) =>
      sum + (c.storeCredit ? parseFloat(c.storeCredit.toString()) : 0), 0
    ) * 100) / 100;

    const avgSpend = tierCustomers.length > 0 ? Math.round((revenue / tierCustomers.length) * 100) / 100 : 0;

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

function calculateTierPerformanceFromOrders(
  tiers: any[],
  orders: any[],
  customers: any[],
  transactions: any[]
): AnalyticsData['tierPerformance'] {
  return tiers.map((tier, index) => {
    const tierCustomers = customers.filter(c => c.currentTierId === tier.id);
    const tierCustomerIds = new Set(tierCustomers.map(c => c.id));

    // Get orders from tier customers
    const tierOrders = orders.filter(order => tierCustomerIds.has(order.customerId));

    // Calculate actual revenue from orders
    const revenue = tierOrders.reduce((sum, order) =>
      sum + parseFloat(order.netAmount?.toString() || '0'), 0
    );

    // Calculate cashback from orders
    const cashbackEarned = tierOrders.reduce((sum, order) =>
      sum + parseFloat(order.cashbackAmount?.toString() || '0'), 0
    );

    // Get credit balance for tier customers
    const creditBalance = tierCustomers.reduce((sum, c) =>
      sum + (c.storeCredit ? parseFloat(c.storeCredit.toString()) : 0), 0
    );

    // Calculate average spend per customer
    const avgSpend = tierCustomers.length > 0 ? revenue / tierCustomers.length : 0;

    // Calculate retention rate based on recent orders
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const activeInLast30Days = tierOrders.filter(order =>
      new Date(order.shopifyCreatedAt) >= thirtyDaysAgo
    ).length;
    const retention = tierCustomers.length > 0
      ? (activeInLast30Days / tierCustomers.length) * 100
      : 0;

    // Calculate upgrade potential (customers close to next tier)
    let upgradeRate: number | undefined;
    if (index < tiers.length - 1) {
      const nextTier = tiers[index + 1];
      // This would need customer lifetime spending data
      // For now, use a placeholder
      upgradeRate = 15 + Math.random() * 10;
    }

    return {
      id: tier.id,
      name: tier.name,
      members: tierCustomers.length,
      revenue: Math.round(revenue * 100) / 100,
      avgSpend: Math.round(avgSpend * 100) / 100,
      retention: Math.round(retention * 100) / 100,
      creditBalance: Math.round(creditBalance * 100) / 100,
      cashbackPercent: tier.cashbackPercent,
      upgradeRate,
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
  // Legacy function - keeping for backward compatibility
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

function calculateCustomerSegmentsFromOrders(
  customers: any[],
  orders: any[],
  customerSpendingMap: Map<string, { totalSpent: number, orderCount: number, lastOrderDate: Date | null }>
): AnalyticsData['segments'] {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000;

  // VIP customers (top 10% by total spending)
  const customersWithSpending = customers.map(c => ({
    customer: c,
    spending: customerSpendingMap.get(c.id)?.totalSpent || 0,
    orderCount: customerSpendingMap.get(c.id)?.orderCount || 0,
    lastOrderDate: customerSpendingMap.get(c.id)?.lastOrderDate || null
  }));

  const sortedBySpending = [...customersWithSpending].sort((a, b) => b.spending - a.spending);
  const vipCount = Math.ceil(customers.length * 0.1);
  const vipCustomers = sortedBySpending.slice(0, vipCount);

  // Calculate VIP metrics
  const vipRevenue = vipCustomers.reduce((sum, vc) => sum + vc.spending, 0);
  const vipAvgCredit = vipCustomers.reduce((sum, vc) =>
    sum + (vc.customer.storeCredit ? parseFloat(vc.customer.storeCredit.toString()) : 0), 0
  ) / Math.max(1, vipCustomers.length);

  // At-risk customers (no orders in 30-60 days)
  const atRiskCustomers = customersWithSpending.filter(c => {
    if (!c.lastOrderDate) return false;
    const lastOrderTime = c.lastOrderDate.getTime();
    return lastOrderTime < thirtyDaysAgo && lastOrderTime > sixtyDaysAgo;
  });

  const atRiskRevenue = atRiskCustomers.reduce((sum, c) => sum + c.spending, 0);

  // New customers (joined in last 30 days)
  const newCustomers = customers.filter(c =>
    new Date(c.createdAt).getTime() > thirtyDaysAgo
  );

  // Calculate new customer activation rate
  const newCustomersWithOrders = newCustomers.filter(c =>
    customerSpendingMap.has(c.id) && customerSpendingMap.get(c.id)!.orderCount > 0
  );
  const activationRate = newCustomers.length > 0
    ? (newCustomersWithOrders.length / newCustomers.length) * 100
    : 0;

  const newCustomerRevenue = newCustomers.reduce((sum, c) =>
    sum + (customerSpendingMap.get(c.id)?.totalSpent || 0), 0
  );

  // Dormant customers (no orders in 60+ days or never ordered)
  const dormantCustomers = customersWithSpending.filter(c => {
    if (!c.lastOrderDate) return true; // Never ordered
    return c.lastOrderDate.getTime() < sixtyDaysAgo;
  });

  const dormantRevenue = dormantCustomers.reduce((sum, c) => sum + c.spending, 0);

  // Calculate average days since last order for dormant customers
  const dormantWithOrders = dormantCustomers.filter(c => c.lastOrderDate);
  const avgDaysSinceLastOrder = dormantWithOrders.length > 0
    ? dormantWithOrders.reduce((sum, c) => {
        const days = Math.floor((now - c.lastOrderDate!.getTime()) / (24 * 60 * 60 * 1000));
        return sum + days;
      }, 0) / dormantWithOrders.length
    : 0;

  // Calculate churn risk for at-risk segment
  const churnRisk = atRiskCustomers.length > 0 && customersWithSpending.length > 0
    ? (atRiskCustomers.length / customersWithSpending.filter(c => c.orderCount > 0).length) * 100
    : 0;

  return {
    vip: {
      count: vipCustomers.length,
      revenue: Math.round(vipRevenue * 100) / 100,
      avgCredit: Math.round(vipAvgCredit * 100) / 100,
    },
    atRisk: {
      count: atRiskCustomers.length,
      revenue: Math.round(atRiskRevenue * 100) / 100,
      churnRisk: Math.round(churnRisk * 100) / 100,
    },
    new: {
      count: newCustomers.length,
      revenue: Math.round(newCustomerRevenue * 100) / 100,
      activationRate: Math.round(activationRate * 100) / 100,
    },
    dormant: {
      count: dormantCustomers.length,
      lastRevenue: Math.round(dormantRevenue * 100) / 100,
      daysSinceLastOrder: Math.round(avgDaysSinceLastOrder),
    },
  };
}

// ============================================
// COMPONENTS
// ============================================

function AnalyticsMetricCard({ 
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
    return <LoadingSkeleton type="card" lines={3} />;
  }

  const getTrendIcon = () => {
    if (trend === 'up') return ArrowUpIcon;
    if (trend === 'down') return ArrowDownIcon;
    return ChartVerticalIcon;
  };

  const getTone = () => {
    if (trend === 'up') return 'success';
    if (trend === 'down') return 'critical';
    return 'default';
  };

  return (
    <MetricCard
      title={title}
      value={value.toString()}
      change={change}
      icon={getTrendIcon()}
      tone={getTone() as any}
    />
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [selectedTab, setSelectedTab] = useState(0);
  const [selectedDateRange, setSelectedDateRange] = useState(
    searchParams.get('range') || '30days'
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customDateRange, setCustomDateRange] = useState<{
    start: Date | null;
    end: Date | null;
  }>({ start: null, end: null });
  
  const isLoading = navigation.state === "loading";
  
  // Format currency helper
  const formatAmount = useCallback((amount: number) => {
    return formatCurrency(amount, data.shopSettings as any);
  }, [data.shopSettings]);
  
  // Handle date range selection
  const handleDateRangeSelect = useCallback((range: string) => {
    setSelectedDateRange(range);
    setShowDatePicker(false);
    
    // Navigate with the new date range parameter
    navigate(`?range=${range}`);
  }, [navigate]);
  
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
      case 'all':
        return 'All Time';
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
    >
      <Layout>
        {/* Date Range Selector */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
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
                    <Button
                      pressed={selectedDateRange === 'all'}
                      onClick={() => handleDateRangeSelect('all')}
                    >
                      All Time
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
                            <Text variant="bodySm" as="p">• Advanced filtering options</Text>
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

                <Divider />

                <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                  <Text variant="bodyMd" as="p">
                    Showing data for: <Text as="span" fontWeight="semibold">{getDateRangeText()}</Text>
                  </Text>
                </Box>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* Key Metrics Grid */}
        <Layout.Section>
          <InlineStack gap="400" wrap={false}>
            <div style={{ flex: 1, minWidth: '220px' }}>
              <AnalyticsMetricCard
                title="Total Revenue Impact"
                value={formatAmount(data.revenueImpact)}
                change={data.comparison.change}
                trend={data.comparison.change > 0 ? 'up' : 'down'}
                loading={isLoading}
                delay={0}
              />
            </div>
            <div style={{ flex: 1, minWidth: '220px' }}>
              <AnalyticsMetricCard
                title="Active Members"
                value={`${data.activeMembers} / ${data.totalMembers}`}
                change={12}
                trend="up"
                loading={isLoading}
                delay={50}
              />
            </div>
            <div style={{ flex: 1, minWidth: '220px' }}>
              <AnalyticsMetricCard
                title="Avg Order Value"
                value={formatAmount(data.avgOrderValue)}
                change={8}
                trend="up"
                loading={isLoading}
                delay={100}
              />
            </div>
            <div style={{ flex: 1, minWidth: '220px' }}>
              <AnalyticsMetricCard
                title="Conversion Rate"
                value={`${data.conversionRate.toFixed(1)}%`}
                change={-2}
                trend="down"
                loading={isLoading}
                delay={150}
              />
            </div>
          </InlineStack>
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